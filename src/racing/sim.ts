// Simulación de una sesión (libres, clasificación, sprint o carrera): física de los coches, IA,
// choques, neumáticos, boxes, clima y dirección de carrera (banderas, SC, VSC, sanciones).
// No depende de three.js: puede ejecutarse sin pantalla (pruebas y avance rápido).
import { DRIVERS, TEAMS, TYRES, WEAR_CLIFF, tyreGrip, isSlick, type Compound } from './data';
import { Track, PHYS, ROAD, KERB, GRASS, GRAVEL, TARMAC, PIT_SPEED } from './track';

export type SessionType = 'P' | 'Q1' | 'Q2' | 'Q3' | 'SQ' | 'SPRINT' | 'RACE';
export const isRaceType = (t: SessionType) => t === 'RACE' || t === 'SPRINT';
export const SESSION_NAME: Record<SessionType, string> = { P: 'Libres', Q1: 'Clasificación Q1', Q2: 'Clasificación Q2', Q3: 'Clasificación Q3', SQ: 'Clasificación sprint', SPRINT: 'Sprint', RACE: 'Carrera' };

export interface Assists { brake: boolean; steer: boolean; tc: boolean; pitLimiter: boolean }
export interface SimOpts {
  track: Track;
  type: SessionType;
  /** vueltas de carrera (también fija la escala de desgaste) */
  laps: number;
  /** índices de piloto; en carrera, en orden de parrilla */
  entries: number[];
  /** índice de piloto del jugador o -1 */
  player: number;
  playerTyre?: Compound;
  /** ritmo de la IA (dificultad) */
  pace: number;
  /** intensidad de lluvia (0..1) en puntos repartidos a lo largo de la sesión */
  weather: number[];
  /** 0 = sin daños, 1 = realistas */
  damage: number;
  formation: boolean;
  seed: number;
  assists: Assists;
}

export interface Msg { text: string; kind: string; player: boolean }
export interface Fx { type: 'hit' | 'wall'; x: number; z: number; power: number; player: boolean }
export interface Result { di: number; pos: number; laps: number; time: number; best: number; pen: number; status: string; tyres: string; grid: number }

const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class Car {
  x = 0; z = 0; h = 0; vx = 0; vz = 0; spin = 0; speed = 0;
  si = 0; d = 0; frac = 0; lap = -1; prog = 0; pos = 0; grid = 0;
  thr = 0; brk = 0; steer = 0; rev = false; ersOn = false; ers = 1;
  tyre: Compound = 'M'; wear = 0; temp = 0.8; used = ''; stops = 0;
  damage = 0; active = true; out = ''; strandT = 0; rcDone = false; failT = Infinity;
  /** 0 en pista, 1 parada pedida, 2 entrando, 3 parado, 4 saliendo */
  pit = 0; pitU = 0; pitRes = 0; pitT = 0; pitStop = true; nextTyre: Compound = 'H'; pitSped = false;
  lapStart = -1; lastLap = 0; bestLap = Infinity; lapValid = true; lapPit = false; runLaps = 0;
  /** sanciones: segundos pendientes, 1 = drive-through / 2 = stop-and-go pendiente, vueltas para cumplir */
  penSec = 0; penDT = 0; penLaps = 0; tl = 0; dsq = false; penCount = 0;
  finished = false; finishTime = 0;
  // estado interno
  aiOff = 0; yawMax = 1; slide = 0; latUse = 0; tow = 0; surf = ROAD; stuckT = 0; offT = 0; offV = 0; errT = 0; incT = 0;
  react = 0.3; lane = 0; mergeT = 0; plan: { lap: number; tyre: Compound }[] = []; auto = false; blueT = 0; blueN = 0; vscT = 0; wrongT = 0; hits = 0;
  ahead = new Set<number>();
  constructor(public id: number, public di: number, public isPlayer = false) {}
  get driver() { return DRIVERS[this.di]; }
  get team() { return this.di < 0 ? -1 : DRIVERS[this.di].team; }
  get perf() { return this.di < 0 ? 1 : TEAMS[DRIVERS[this.di].team].perf; }
  get isSC() { return this.di < 0; }
  get inPit() { return this.pit >= 2; }
}

export class Sim {
  track: Track;
  type: SessionType;
  race: boolean;
  cars: Car[] = [];
  player: Car | null = null;
  sc: Car | null = null;
  order: Car[] = [];
  time = 0;
  /** carrera: formation -> grid -> lights -> race -> done; sesiones cronometradas: race -> flag -> done */
  phase: 'formation' | 'grid' | 'lights' | 'race' | 'flag' | 'done' = 'race';
  phaseT = 0;
  lights = 0;
  private lightsHold = 1;
  startTime = 0;
  duration = 0;
  laps: number;
  flag: 'green' | 'sc' | 'vsc' = 'green';
  flagT = 0;
  scIn = false;
  yellow = [false, false, false];
  chequered = false;
  wet = 0;
  rain = 0;
  fastest: { di: number; time: number } | null = null;
  msgs: Msg[] = [];
  fx: Fx[] = [];
  /** la IA conduce también el coche del jugador (avance rápido) */
  autoAll = false;
  private rcT = 0;
  private wearK: number;
  private seed: number;
  private finishN = 0;
  private cheqT = 0;
  private res?: Result[];

  constructor(public o: SimOpts) {
    const t = (this.track = o.track);
    this.type = o.type;
    this.race = isRaceType(o.type);
    this.laps = o.laps;
    this.seed = o.seed >>> 0 || 1;
    this.wearK = WEAR_CLIFF / (Math.max(this.race ? o.laps : 12, 5) * t.length);
    this.duration = this.race ? o.laps * t.lapTime * 1.08 : t.lapTime * ({ P: 4, Q1: 3.4, Q2: 3.1, Q3: 2.9, SQ: 3.4 } as Record<string, number>)[o.type];
    this.wet = this.rain = o.weather[0] ?? 0;
    const startWet: Compound = this.wet > 0.7 ? 'W' : 'I';
    o.entries.forEach((di, k) => {
      const c = new Car(k, di, di === o.player);
      c.grid = k;
      c.react = 0.15 + this.rnd() * 0.3;
      if (c.isPlayer) this.player = c;
      if (this.race) {
        const s = t.gridSlot(k);
        this.place(c, s.i, s.off, 0);
        c.lane = s.off;
        if (this.wet > 0.2) c.tyre = startWet;
        else if (c.isPlayer && o.playerTyre) c.tyre = o.playerTyre;
        else this.strategy(c);
        if (this.rnd() < 0.025 && !c.isPlayer && o.damage > 0) c.failT = (0.1 + this.rnd() * 0.85) * this.duration;
      } else {
        c.tyre = this.wet > 0.2 ? startWet : c.isPlayer && o.playerTyre ? o.playerTyre : o.type === 'P' ? (['M', 'H', 'S'] as Compound[])[k % 3] : 'S';
        if (c.isPlayer) { c.pit = 4; c.pitU = t.pitLen - 90; c.speed = PIT_SPEED; c.si = t.idx(t.pitIn + Math.round(c.pitU / t.ds)); }
        else this.place(c, t.idx(Math.round(t.n * (0.3 + (0.62 * k) / o.entries.length))), 0, 35);
        c.temp = 0.7;
      }
      c.used = c.tyre;
      this.cars.push(c);
    });
    this.order = [...this.cars];
    this.sortOrder();
    this.phase = this.race ? (o.formation ? 'formation' : 'grid') : 'race';
    if (this.race) this.say(o.formation ? 'Vuelta de formación' : 'Parrilla de salida', 'info');
    else this.say(`${SESSION_NAME[o.type]} — pista abierta`, 'flag-green');
  }

  // ------------------------------------------------------------------ utilidades
  rnd() { let t = (this.seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  say(text: string, kind = 'info', c?: Car) { this.msgs.push({ text, kind, player: !!c?.isPlayer }); }
  tag(c: Car) { return c.isSC ? 'Safety car' : `Coche ${c.driver.num} (${c.driver.tla})`; }
  place(c: Car, i: number, off: number, speed: number) {
    const t = this.track;
    c.x = t.px[i] + t.nx[i] * off; c.z = t.pz[i] + t.nz[i] * off;
    c.h = Math.atan2(t.tz[i], t.tx[i]);
    c.vx = t.tx[i] * speed; c.vz = t.tz[i] * speed; c.speed = speed; c.spin = 0;
    c.si = i; c.d = off; c.frac = 0; c.prog = c.lap * t.length + i * t.ds;
  }
  /** devuelve el coche a la pista (IA atascada o botón del jugador) */
  respawn(c: Car) { this.place(c, c.si, clamp(this.track.lo[c.si], -3, 3), 0); c.stuckT = 0; c.aiOff = 0; }
  private strategy(c: Car) {
    const L = this.laps, r = this.rnd(), j = () => (this.rnd() - 0.5) * 0.1;
    const stop = (f: number, tyre: Compound) => ({ lap: clamp(Math.round((f + j()) * L), 1, L - 1), tyre });
    if (this.type === 'SPRINT' || L < 5) { c.tyre = r < 0.5 ? 'S' : 'M'; return; }
    if (r < 0.4) { c.tyre = 'M'; c.plan = [stop(0.45, 'H')]; }
    else if (r < 0.65) { c.tyre = 'S'; c.plan = [stop(0.28, 'H')]; }
    else if (r < 0.85) { c.tyre = 'H'; c.plan = [stop(0.6, 'M')]; }
    else { c.tyre = 'S'; c.plan = [stop(0.27, 'M'), stop(0.68, 'S')]; }
  }
  /** compuesto recomendado para la próxima parada */
  pickTyre(c: Car): Compound {
    if (this.rain > 0.7 || this.wet > 0.75) return 'W';
    if (this.wet > 0.2 || this.rain > 0.35) return 'I';
    if (!this.race) return this.type === 'P' ? 'M' : 'S';
    const left = (this.laps - Math.max(0, c.lap)) / this.laps;
    let ty: Compound = c.plan[0]?.tyre ?? (left < 0.32 ? 'S' : left < 0.55 ? 'M' : 'H');
    if (c.used.replace(/[IW]/g, '').split('').every((u) => u === ty)) ty = ty === 'M' ? 'H' : 'M';
    return ty;
  }
  requestPit(c: Car, on: boolean, tyre?: Compound) {
    if (c.pit > 1 || c.finished || c.out) return;
    c.pit = on ? 1 : 0;
    if (tyre) c.nextTyre = tyre; else if (on) c.nextTyre = this.pickTyre(c);
  }

  // ------------------------------------------------------------------ bucle
  update(dt: number) {
    let left = Math.min(dt, 0.1);
    while (left > 1e-5) { const h = Math.min(left, 1 / 50); this.step(h); left -= h; }
  }
  /** avanza sin dibujar hasta que termine la fase actual o pasen maxT segundos; true si terminó */
  fastForward(maxT: number, until: () => boolean) {
    const end = this.time + maxT;
    while (this.time < end) { if (until()) return true; this.step(1 / 50); }
    return until();
  }

  step(dt: number) {
    if (this.phase === 'done') return;
    this.time += dt;
    this.phaseT += dt;
    this.updatePhase(dt);
    // clima
    const ww = this.o.weather, f = clamp(this.time / this.duration, 0, 1) * (ww.length - 1), wi = Math.min(ww.length - 1, Math.floor(f));
    this.rain = ww.length > 1 ? ww[wi] + ((ww[Math.min(ww.length - 1, wi + 1)] - ww[wi]) * (f - wi)) : ww[0] ?? 0;
    this.wet += (this.rain - this.wet) * dt / (this.rain > this.wet ? 40 : 90);
    const cars = this.cars;
    for (const c of cars) {
      if (!c.active) continue;
      if (c.pit >= 2) { this.pitMove(c, dt); continue; }
      if (!c.isPlayer || c.auto || this.autoAll || c.out || c.finished || this.phase === 'formation' || this.phase === 'grid') this.control(c, dt);
      else this.assist(c);
      this.physics(c, dt);
      this.locate(c);
      this.walls(c);
    }
    this.collide();
    this.rcT += dt;
    if (this.rcT >= 0.1) { this.stewards(this.rcT); this.raceControl(this.rcT); this.sortOrder(); this.rcT = 0; }
  }

  private updatePhase(dt: number) {
    const t = this.track, cars = this.cars;
    if (this.phase === 'formation') {
      const run = cars.filter((c) => c.active && !c.isSC);
      if (run.every((c) => c.lap >= 0 && c.speed < 0.5) || (run[0].lap >= 0 && run[0].speed < 0.5 && this.phaseT > t.lapTime * 1.3 + 25) || this.phaseT > t.lapTime * 3) {
        for (const c of run) { c.lap = -1; const s = t.gridSlot(c.grid); this.place(c, s.i, s.off, 0); c.temp = 0.85; c.aiOff = 0; c.wear = 0; }
        this.setPhase('lights');
      }
    } else if (this.phase === 'grid') {
      if (this.phaseT > 2.5) this.setPhase('lights');
    } else if (this.phase === 'lights') {
      if (this.phaseT < 5.5) this.lights = Math.min(5, Math.floor(this.phaseT));
      else if (this.lightsHold === 1) this.lightsHold = 5.5 + 0.3 + this.rnd() * 1.6;
      // salida falsa: moverse antes de que se apaguen los semáforos (5 s; drive-through si es flagrante)
      const p = this.player, slot = p && t.gridSlot(p.grid);
      const moved = p && slot ? (p.x - t.px[slot.i]) * t.tx[slot.i] + (p.z - t.pz[slot.i]) * t.tz[slot.i] : 0;
      if (p && moved > 0.6) p.rcDone = true;
      if (this.lightsHold > 1 && this.phaseT >= this.lightsHold) {
        this.lights = 0;
        this.setPhase('race');
        this.startTime = this.time;
        if (p?.rcDone && !p.out) this.penalize(p, moved > 5 ? 'dt' : 'time', 5, 'Salida falsa');
        for (const c of cars) { c.lapStart = this.time; c.rcDone = false; }
        this.say('¡Se apagan los semáforos!', 'flag-green');
      }
    } else if (!this.race && this.phase === 'race' && this.time >= this.duration) {
      this.setPhase('flag');
      this.chequered = true;
      this.say('Bandera a cuadros: termina la sesión', 'chequered');
    } else if (this.phase === 'flag' || (this.phase === 'race' && this.chequered)) {
      const p = this.player, run = cars.filter((c) => c.active && !c.out && !c.isSC);
      if (!this.race && p && p.inPit && !p.finished) p.finished = true;
      if (run.every((c) => c.finished) || (this.phase === 'flag' ? this.phaseT : this.time - this.cheqT) > t.lapTime * (this.race ? 2.5 : 1.6)) this.setPhase('done');
    }
  }
  private setPhase(p: Sim['phase']) { this.phase = p; this.phaseT = 0; }
  /** true cuando ya no queda nada por conducir para el jugador */
  get playerDone() { const p = this.player; return this.phase === 'done' || !p || p.finished || (!!p.out && p.speed < 1); }

  // ------------------------------------------------------------------ posición en el circuito
  private locate(c: Car) {
    const { px, pz, tx, tz, nx, nz, n, ds, length } = this.track;
    let i = c.si;
    for (let k = 0; k < 60; k++) { const j = (i + 1) % n; if ((c.x - px[j]) * tx[j] + (c.z - pz[j]) * tz[j] > 0) i = j; else break; }
    for (let k = 0; k < 60; k++) { if ((c.x - px[i]) * tx[i] + (c.z - pz[i]) * tz[i] < 0) i = (i + n - 1) % n; else break; }
    if (i < c.si - n / 2) this.onLine(c);
    else if (i > c.si + n / 2) c.lap--;
    c.si = i;
    c.d = (c.x - px[i]) * nx[i] + (c.z - pz[i]) * nz[i];
    c.frac = (c.x - px[i]) * tx[i] + (c.z - pz[i]) * tz[i];
    c.prog = c.lap * length + i * ds + c.frac;
  }

  private onLine(c: Car) {
    c.lap++;
    if (c.isSC || this.phase === 'formation') return;
    const now = this.time;
    if (c.lap >= 1 && c.lapStart >= 0) {
      const lt = now - c.lapStart;
      c.lastLap = lt;
      c.runLaps++;
      if (c.lapValid && !c.lapPit && !c.out) {
        if (lt < c.bestLap) c.bestLap = lt;
        if (!this.fastest || lt < this.fastest.time) { this.fastest = { di: c.di, time: lt }; if (this.time - this.startTime > this.track.lapTime * 2.2) this.say(`Vuelta rápida: ${c.driver.tla} ${fmtTime(lt)}`, 'purple', c); }
      } else if (c.isPlayer && !c.lapValid) this.say('Vuelta anulada', 'info', c);
    }
    c.lapStart = now; c.lapValid = true; c.lapPit = c.inPit;
    if (this.race) {
      if (c.out) return;
      if (c.penDT && --c.penLaps < 0) this.disqualify(c, 'No cumplir la sanción');
      if (this.chequered || c.lap >= this.laps) {
        if (!this.chequered) { this.chequered = true; this.cheqT = now; this.say('¡Bandera a cuadros!', 'chequered'); }
        c.finished = true; c.finishTime = now; c.pos = ++this.finishN; c.pit = c.pit === 1 ? 0 : c.pit;
      } else if (c.isPlayer && c.lap === this.laps - 1) this.say('Última vuelta', 'info', c);
    } else if (this.phase === 'flag') c.finished = true;
  }

  // ------------------------------------------------------------------ IA
  /** agarre relativo al perfil de referencia -> factor de velocidad en curva */
  private paceOf(c: Car) {
    const g = (tyreGrip(c.tyre, c.wear, c.temp, this.wet) * c.perf * c.perf * (1 - 0.2 * c.damage)) / PHYS.REF_GRIP;
    return Math.sqrt(g) * 0.97 * (c.isSC ? 1 : c.isPlayer ? 0.99 : this.o.pace * (0.955 + 0.045 * c.driver.skill));
  }

  private control(c: Car, dt: number) {
    const t = this.track, sp = c.speed, n = t.n;
    c.rev = false;
    if (this.phase === 'grid' || this.phase === 'lights' || (this.phase === 'race' && this.race && this.time - this.startTime < c.react && c.lap < 0 && !c.isPlayer)) { c.thr = 0; c.brk = 1; c.steer = 0; return; }
    const noPass = this.phase === 'formation' || this.flag !== 'green' || this.yellow[Math.floor((3 * c.si) / n)];
    let vT = t.vt[(c.si + 1 + Math.round((sp * 0.12) / t.ds)) % n] * this.paceOf(c);
    let offT = 0, follow = Infinity;
    const first = this.race && c.lap <= 0 && this.time - this.startTime < 25; // primera vuelta: más prudencia en el pelotón
    if (first) { vT *= 0.9; offT = c.lane * 0.85 - t.lo[c.si] * 0.7; } // dos filas ordenadas hasta que se estira el grupo
    if (c.mergeT > 0) { c.mergeT -= dt; offT = t.pitSide * (t.hw - 1.8) - t.lo[c.si]; } // sale de boxes pegado al borde
    // --- modos lentos
    if (c.isSC) vT = Math.min(vT * 0.62, 50);
    else if (c.out) { vT = 0; offT = (c.d > 0 ? 1 : -1) * (t.hw + 2) - t.lo[c.si]; }
    else if (c.finished) vT = Math.min(vT * 0.6, 55);
    else if (this.phase === 'formation') vT = Math.min(vT * 0.62, 52);
    else if (this.flag === 'vsc') vT *= 0.6;
    else if (this.flag === 'sc') vT = Math.min(vT * 0.85, 70);
    else if (noPass) vT *= 0.85;
    if (c.errT > 0) { c.errT -= dt; vT *= 1.07; }
    // --- parrilla al final de la vuelta de formación
    if (this.phase === 'formation' && c.lap >= 0) {
      const s = t.gridSlot(c.grid), dist = t.idx(s.i - c.si) * t.ds - c.frac;
      if (dist < 400) { vT = Math.min(vT, Math.sqrt(2 * 4 * Math.max(0, dist - 0.5))); offT = s.off - t.lo[c.si]; }
      if (dist < 0.8 || (dist > t.length - 30 && this.phaseT > 20)) { vT = 0; c.vx = c.vz = 0; }
    }
    // --- boxes
    if (!c.isSC && !c.out && !c.finished && this.phase !== 'formation') this.pitDecide(c);
    if (c.pit === 1) {
      const dist = t.idx(t.pitIn - c.si) * t.ds;
      if (dist < 160) { vT = Math.min(vT, PIT_SPEED + dist * 0.22); offT = t.pitSide * (t.hw - 1.6) - t.lo[c.si]; }
      if (dist > t.length - 12 || dist < 1) { c.pit = 2; c.pitU = t.pitU(c.si) + c.frac; c.pitRes = c.d - t.pitOffset(c.pitU); c.pitStop = c.penDT !== 1; c.lapPit = true; c.pitSped = false; return; }
    }
    // --- tráfico
    for (const o of this.cars) {
      if (o === c || !o.active || o.inPit) continue;
      const gap = t.idx(o.si - c.si) * t.ds + o.frac - c.frac, lat = o.d - c.d, closing = sp - o.speed;
      if (gap > 0 && gap < 130) {
        if (noPass && !o.out && c.pit !== 1) { if (gap < 70) follow = Math.min(follow, o.speed + (gap - (this.flag === 'sc' ? 11 : 14)) * 0.45); }
        else if (Math.abs(lat) < 2.5 || gap < 12) {
          if (gap < 8 + sp * (first ? 0.45 : 0.25) + Math.max(0, closing) * 1.2 && Math.abs(lat) < 2.2) follow = Math.min(follow, o.speed - 0.5 + (gap - 7) * 0.6);
          if ((gap < 35 || gap < closing * 2.5) && closing > -2 && c.pit !== 1 && c.mergeT <= 0 && !(first && closing < 8)) {
            // adelanta por el lado con más sitio
            const side = o.d > 0.5 ? -1 : o.d < -0.5 ? 1 : c.d >= o.d ? 1 : -1;
            offT = clamp(o.d + side * 3.3, -t.hw + 1.2, t.hw - 1.2) - t.lo[c.si];
          }
        }
      }
      if ((gap < 6 || gap > t.length - 6) && Math.abs(lat) < 2.9 && Math.abs(lat) > 0.3) offT += (lat > 0 ? -1 : 1) * 1.4; // coche en paralelo
      // banderas azules: deja pasar a los que doblan
      if (this.race && !noPass && gap > t.length - 30 && o.prog - c.prog > t.length * 0.5 && !o.out) { offT = (t.lo[c.si] > 0 ? -1 : 1) * (t.hw - 1.5) - t.lo[c.si]; vT *= 0.94; }
    }
    vT = Math.min(vT * (1 - 0.02 * Math.min(3, Math.abs(c.aiOff))), Math.max(0, follow)); // fuera de la trazada se frena antes
    c.aiOff += clamp(offT - c.aiOff, -3.5 * dt, 3.5 * dt);
    // --- dirección (persecución de un punto adelantado sobre la trazada)
    const j = (c.si + Math.round(clamp(sp * 0.45, 9, 45) / t.ds)) % n;
    const edge = c.out ? t.hw + 2.5 : t.hw - 1.1;
    const off = clamp(t.lo[j] + c.aiOff, -edge, edge);
    const dx = t.px[j] + t.nx[j] * off - c.x, dz = t.pz[j] + t.nz[j] * off - c.z;
    const yawDes = (2 * Math.max(sp, 3) * Math.sin(angDiff(Math.atan2(dz, dx), c.h))) / Math.hypot(dx, dz);
    c.steer = clamp(yawDes / Math.max(c.yawMax, 0.05), -1, 1);
    // --- gas y freno
    const err = vT - sp;
    if (err < -0.3) { c.brk = clamp(-err / 3, 0, 1); c.thr = 0; if (c.brk > 0.9 && !c.isPlayer && !c.isSC && c.errT <= 0 && this.rnd() < dt * 0.02 * (1.25 - c.driver.skill) * (1 + 2 * this.wet)) c.errT = 0.9; }
    else { c.brk = 0; c.thr = c.slide > 2 ? 0.4 : clamp(err / 2, 0.12, 1); if (vT < 0.5) { c.thr = 0; c.brk = 0.6; } }
    c.ersOn = c.thr > 0.9 && Math.abs(t.curv[c.si]) < 0.004 && c.ers > 0.25 && !noPass;
    // --- atascado: vuelve a pista
    if (sp < 2.5 && vT > 5) { c.stuckT += dt; if (c.stuckT > 3.5) this.respawn(c); } else c.stuckT = 0;
  }

  /** ayudas al pilotaje del jugador */
  private assist(c: Car) {
    const t = this.track, a = this.o.assists;
    if (c.pit === 1 && t.idx(t.pitIn - c.si) * t.ds < 160) { c.auto = true; return; }
    const vT = t.vt[(c.si + 1 + Math.round((c.speed * 0.12) / t.ds)) % t.n] * this.paceOf(c);
    if (a.brake && c.speed > vT + 1 && Math.abs(c.d) < t.hw + 2) { c.brk = Math.max(c.brk, clamp((c.speed - vT) / 3.5, 0, 1)); c.thr = 0; }
    if (a.tc && c.slide > 1.5) c.thr = Math.min(c.thr, 0.5);
    if (a.steer) {
      const j = (c.si + Math.round(clamp(c.speed * 0.45, 9, 45) / t.ds)) % t.n;
      const dx = t.px[j] + t.nx[j] * t.lo[j] - c.x, dz = t.pz[j] + t.nz[j] * t.lo[j] - c.z;
      const ai = clamp((2 * Math.max(c.speed, 3) * Math.sin(angDiff(Math.atan2(dz, dx), c.h))) / Math.hypot(dx, dz) / Math.max(c.yawMax, 0.05), -1, 1);
      c.steer = clamp(c.steer * 0.65 + ai * 0.5, -1, 1);
    }
  }

  private pitDecide(c: Car) {
    const t = this.track;
    if (c.isPlayer && !this.autoAll) return;
    if (c.pit !== 0 || t.idx(t.pitIn - c.si) * t.ds > 300) return;
    let want = c.wear > 0.88 || c.damage > 0.35 || c.penDT > 0;
    if (isSlick(c.tyre) ? this.wet > 0.28 : this.wet < 0.1 && this.rain < 0.15) want = true;
    if (this.race) {
      const due = c.plan[0] ? c.plan[0].lap - (c.lap + 1) : 99;
      if (due <= 0 || (this.flag === 'sc' && due <= this.laps * 0.25 && c.wear > 0.25)) want = true;
      if (c.lap >= this.laps - 1 && !c.penDT) want = false;
      if (this.flag === 'sc' && c.penDT) want = false;
    } else {
      want = want || c.runLaps >= (this.type === 'P' ? 5 : 2) || c.wear > 0.5;
      if (this.phase === 'flag') want = false;
    }
    if (want && this.cars.some((o) => o !== c && o.team === c.team && o.pit >= 1 && o.pit <= 3)) want = c.wear > 1;
    if (want) { c.pit = 1; c.nextTyre = this.pickTyre(c); }
  }

  // ------------------------------------------------------------------ física
  private physics(c: Car, dt: number) {
    const t = this.track, P = PHYS, wet = this.wet;
    const surf = (c.surf = t.surface(c.si, c.d));
    const sm = surf === ROAD ? 1 : surf === KERB ? 0.95 - 0.2 * wet : surf === TARMAC ? 0.96 : surf === GRASS ? 0.5 - 0.15 * wet : 0.45;
    const grip = tyreGrip(c.tyre, c.wear, c.temp, wet) * c.perf * c.perf * (1 - 0.2 * c.damage) * sm;
    const sp = c.speed;
    const aMax = P.MU * grip * (P.G + P.KDF * sp * sp * (1 - 0.35 * c.damage) * (1 - 0.25 * c.tow));
    let fx = Math.cos(c.h), fz = Math.sin(c.h);
    let vf = c.vx * fx + c.vz * fz;
    const boost = c.ersOn && c.ers > 0.02 && c.thr > 0.5;
    const acc = c.thr * Math.min(P.TRACTION * Math.min(1, grip), (P.PWR * c.perf * c.perf * (boost ? 1.12 : 1) * (1 - 0.1 * c.damage)) / Math.max(vf, 8));
    const brake = c.brk * aMax * 0.97;
    const used = Math.min(1, Math.max(acc, brake) / aMax);
    const aLat = aMax * Math.sqrt(1 - 0.8 * used * used);
    const yawMax = (c.yawMax = Math.min(Math.abs(vf) * 0.117, (1.12 * aLat) / Math.max(Math.abs(vf), 5)));
    c.h += (c.steer * yawMax * (vf < -0.5 ? -1 : 1) + c.spin) * dt;
    c.spin *= Math.exp(-dt * 3 * Math.min(1, grip));
    fx = Math.cos(c.h); fz = Math.sin(c.h);
    vf = c.vx * fx + c.vz * fz;
    let vl = c.vz * fx - c.vx * fz;
    const res = P.DRAG * (1 + 0.3 * c.damage) * (1 - 0.35 * c.tow) * vf * vf + 0.25 + (surf === GRASS ? 2.5 : surf === GRAVEL ? 10 : 0) * Math.min(1, sp / 8);
    if (c.rev) vf = Math.max(-8, vf - 5 * dt);
    else {
      vf += acc * dt;
      const dec = (res + brake) * dt;
      vf = vf > 0 ? Math.max(0, vf - dec) : Math.min(0, vf + dec);
    }
    const lat = aLat * dt, avl = Math.abs(vl);
    c.latUse = Math.min(1, avl / lat);
    vl = avl <= lat ? 0 : vl - Math.sign(vl) * lat;
    c.slide = Math.abs(vl);
    if (c.slide > 1 && sp > 10) c.spin -= Math.sign(vl) * c.thr * (c.isPlayer && !this.o.assists.tc ? 1.2 : 0.3) * Math.min(1, c.slide / 6) * dt;
    c.vx = fx * vf - fz * vl; c.vz = fz * vf + fx * vl;
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.speed = Math.hypot(c.vx, c.vz);
    // neumáticos y batería
    const load = 0.45 + 0.9 * c.latUse * c.latUse + 0.5 * used * used + Math.min(2, c.slide * 0.5);
    c.wear += (this.wearK / TYRES[c.tyre].life) * load * sp * dt * (!isSlick(c.tyre) && wet < 0.15 ? 3 : 1);
    c.temp += (Math.min(1, 0.25 + sp / 55) - c.temp) * dt / 15;
    if (boost) c.ers = Math.max(0, c.ers - dt / 14); else c.ers = Math.min(1, c.ers + dt / 70 + (c.brk * dt) / 10);
    if (this.time > c.failT && !c.out) this.retire(c, 'Avería');
  }

  private walls(c: Car) {
    const t = this.track, i = c.si, side = c.d > 0 ? 0 : 1, lim = t.hw + t.ro[side][i] - 1;
    const over = Math.abs(c.d) - lim;
    if (over <= 0) return;
    const sg = c.d > 0 ? 1 : -1, nx = t.nx[i] * sg, nz = t.nz[i] * sg;
    c.x -= nx * over; c.z -= nz * over; c.d = sg * lim;
    const vn = c.vx * nx + c.vz * nz;
    if (vn <= 0) return;
    c.vx -= nx * vn * 1.2; c.vz -= nz * vn * 1.2;
    const fr = 1 - 0.3 * Math.min(1, vn / 8);
    c.vx *= fr; c.vz *= fr;
    c.spin += clamp(angDiff(Math.atan2(t.tz[i], t.tx[i]), c.h), -1, 1) * Math.min(3, vn * 0.2) + (this.rnd() - 0.5) * Math.min(2, vn * 0.1);
    this.hurt(c, vn, 1);
    if (vn > 2) this.fx.push({ type: 'wall', x: c.x + nx, z: c.z + nz, power: vn, player: c.isPlayer });
  }

  private hurt(c: Car, v: number, k: number) {
    if (c.isSC || this.o.damage <= 0 || v < 3) return;
    const before = c.damage;
    c.damage += (((v - 3) * (v - 3)) / 380) * k * this.o.damage;
    if (c.damage >= 1 && !c.out) { c.damage = 1; this.retire(c, 'Accidente'); }
    else if (c.isPlayer && c.damage > 0.3 && before <= 0.3) this.say('Alerón dañado: entra a boxes para repararlo', 'info', c);
  }

  private collide() {
    const cars = this.cars, R = 0.95, OFF = [-1.7, 0, 1.7];
    for (let a = 0; a < cars.length; a++) {
      const A = cars[a];
      if (!A.active || A.inPit) continue;
      A.tow = 0;
    }
    for (let a = 0; a < cars.length; a++) {
      const A = cars[a];
      if (!A.active || A.inPit) continue;
      const afx = Math.cos(A.h), afz = Math.sin(A.h);
      for (let b = a + 1; b < cars.length; b++) {
        const B = cars[b];
        if (!B.active || B.inPit) continue;
        const dx = B.x - A.x, dz = B.z - A.z, d2 = dx * dx + dz * dz;
        if (d2 > 3600) continue;
        const bfx = Math.cos(B.h), bfz = Math.sin(B.h);
        // rebufo: coche delante y alineado
        const la = dx * afx + dz * afz, lb = -(dx * bfx + dz * bfz);
        if (la > 3 && Math.abs(dz * afx - dx * afz) < 2.2) A.tow = Math.max(A.tow, 1 - la / 60);
        if (lb > 3 && Math.abs(dz * bfx - dx * bfz) < 2.2) B.tow = Math.max(B.tow, 1 - lb / 60);
        if (d2 > 60) continue;
        let best = 0, bn = 0, bm = 0, bx = 0, bz = 0;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const ex = dx + bfx * OFF[j] - afx * OFF[i], ez = dz + bfz * OFF[j] - afz * OFF[i], dist = Math.hypot(ex, ez), pen = 2 * R - dist;
          if (pen > best) { best = pen; bn = i; bm = j; bx = ex / (dist || 1); bz = ez / (dist || 1); }
        }
        if (best <= 0) continue;
        A.x -= bx * best * 0.5; A.z -= bz * best * 0.5; B.x += bx * best * 0.5; B.z += bz * best * 0.5;
        const vrel = (A.vx - B.vx) * bx + (A.vz - B.vz) * bz;
        if (vrel <= 0) continue;
        const jn = 0.6 * vrel;
        A.vx -= bx * jn; A.vz -= bz * jn; B.vx += bx * jn; B.vz += bz * jn;
        // giro inducido por el punto de contacto
        A.spin += clamp(((afx * OFF[bn]) * (-bz * jn) - (afz * OFF[bn]) * (-bx * jn)) / 4, -3, 3);
        B.spin += clamp(((bfx * OFF[bm]) * (bz * jn) - (bfz * OFF[bm]) * (bx * jn)) / 4, -3, 3);
        this.hurt(A, vrel, (bn === 2 ? 1.3 : 0.8) * (A.isPlayer ? 1 : 0.6));
        this.hurt(B, vrel, (bm === 2 ? 1.3 : 0.8) * (B.isPlayer ? 1 : 0.6));
        if (vrel > 1.5) this.fx.push({ type: 'hit', x: A.x + dx / 2, z: A.z + dz / 2, power: vrel, player: A.isPlayer || B.isPlayer });
        this.incident(A, B, vrel, bn, bm);
      }
    }
  }

  // ------------------------------------------------------------------ comisarios
  private incident(A: Car, B: Car, v: number, ia: number, ib: number) {
    if (!this.race || this.phase !== 'race' || v < 5) return;
    // culpable: el que golpea con el morro al que va delante
    const f = ia === 2 && ib !== 2 ? A : ib === 2 && ia !== 2 ? B : null;
    if (!f || f.isSC || this.time < f.incT || f.out) return;
    const victim = f === A ? B : A, lenient = f.lap < 1 ? 5 : 0;
    if (victim.out && victim.speed < 3) return;
    f.incT = this.time + 12;
    if (v < 8 + lenient) { if (f.isPlayer) this.say('Incidente anotado: contacto con otro coche', 'info', f); return; }
    f.hits++;
    if (f.hits >= 3) this.penalize(f, 'sg', 10, 'Colisiones reiteradas');
    else this.penalize(f, 'time', v > 15 + lenient ? 10 : 5, 'Causar una colisión');
  }

  penalize(c: Car, kind: 'time' | 'dt' | 'sg', secs: number, why: string) {
    if (c.out || c.finished || c.isSC) return;
    c.penCount++;
    if (!this.race) { c.lapValid = false; if (c.isPlayer) this.say(`Vuelta anulada — ${why}`, 'pen', c); return; }
    if (kind === 'time') { c.penSec += secs; this.say(`${this.tag(c)}: ${secs} s de sanción — ${why}`, 'pen', c); }
    else {
      c.penDT = kind === 'dt' ? 1 : 2; c.penLaps = 3;
      this.say(`${this.tag(c)}: ${kind === 'dt' ? 'drive-through' : 'stop-and-go de 10 s'} — ${why}`, 'pen', c);
      if (c.isPlayer) this.say('Cumple la sanción en boxes antes de 3 vueltas', 'info', c);
    }
  }
  disqualify(c: Car, why: string) {
    c.dsq = true; c.out = 'DSQ'; c.pit = c.pit === 1 ? 0 : c.pit;
    this.say(`${this.tag(c)}: bandera negra, descalificado — ${why}`, 'black', c);
  }
  retire(c: Car, why: string) {
    c.out = why; c.pit = c.pit === 1 ? 0 : c.pit;
    if (!c.isSC) this.say(`${this.tag(c)}: abandono (${why})`, 'info', c);
  }

  private stewards(dt: number) {
    const t = this.track, on = this.phase === 'race' || this.phase === 'flag';
    for (const c of this.cars) {
      if (!c.active || c.isSC || c.out || c.inPit || !on) continue;
      // --- límites de pista: las cuatro ruedas fuera de la línea blanca sin perder tiempo
      const off = Math.abs(c.d) > t.hw + 1.3;
      if (off) { if (c.offT === 0) c.offV = c.speed; c.offT += dt; }
      else if (c.offT > 0) {
        if (c.offT > 0.3 && c.speed > 0.8 * c.offV && c.offV > 20 && !c.finished) {
          if (!this.race) { c.lapValid = false; if (c.isPlayer) this.say('Límites de pista: vuelta anulada', 'pen', c); }
          else if (++c.tl >= 4) { c.tl = 1; this.penalize(c, 'time', 5, 'Exceder los límites de pista'); }
          else if (c.isPlayer) this.say(c.tl === 3 ? 'Bandera blanca y negra: último aviso por límites de pista' : `Límites de pista: aviso ${c.tl} de 3`, c.tl === 3 ? 'bw' : 'info', c);
        }
        c.offT = 0;
      }
      if (!c.isPlayer || this.autoAll || !this.race || c.finished) continue;
      // --- solo el jugador (la IA respeta estas normas por construcción)
      const noPass = this.flag !== 'green' || this.yellow[Math.floor((3 * c.si) / t.n)];
      const ahead = new Set<number>();
      for (const o of this.cars) {
        if (o === c || !o.active || o.inPit || o.out) continue;
        const gap = t.idx(o.si - c.si) * t.ds + o.frac - c.frac;
        if (gap > 0 && gap < 45) ahead.add(o.id);
        else if (noPass && c.ahead.has(o.id) && gap > t.length - 45 && gap < t.length - 4 && o.speed > 14 && this.time > c.incT) {
          c.incT = this.time + 8;
          if (this.flag === 'sc') this.penalize(c, 'dt', 0, 'Adelantar con safety car');
          else this.penalize(c, 'time', 10, this.flag === 'vsc' ? 'Adelantar con VSC' : 'Adelantar con bandera amarilla');
        }
        // banderas azules
        if (gap > t.length - 18 && o.prog - c.prog > t.length * 0.5) { c.blueT += dt; if (c.blueT > 9) { c.blueT = 0; this.penalize(c, ++c.blueN > 1 ? 'dt' : 'time', 5, 'Ignorar banderas azules'); } }
      }
      c.ahead = ahead;
      if (this.flag === 'vsc' && this.flagT > 4) {
        if (c.speed > t.vt[c.si] * 0.6 * 1.12 + 3) { c.vscT += dt; if (c.vscT > 2.5) { c.vscT = -6; this.penalize(c, 'time', 5, 'Exceso de velocidad con VSC'); } }
        else if (c.vscT > 0) c.vscT = Math.max(0, c.vscT - dt);
      }
      // sentido contrario
      const wrong = Math.cos(c.h) * t.tx[c.si] + Math.sin(c.h) * t.tz[c.si] < -0.5 && c.speed > 12;
      c.wrongT = wrong ? c.wrongT + dt : 0;
      if (c.wrongT > 6) this.disqualify(c, 'Circular en sentido contrario');
    }
  }

  /** aviso de bandera azul / exceso con VSC para el HUD */
  get playerBlue() { const p = this.player, t = this.track; return !!p && this.race && this.cars.some((o) => o !== p && o.active && !o.inPit && !o.out && !o.isSC && o.prog - p.prog > t.length * 0.5 && t.idx(p.si - o.si) * t.ds < 30); }
  get vscOver() { const p = this.player; return !!p && this.flag === 'vsc' && p.speed > this.track.vt[p.si] * 0.6 * 1.12 + 3; }

  private raceControl(dt: number) {
    const t = this.track, n = t.n;
    this.flagT += dt;
    const y = [false, false, false];
    let hazards = 0;
    for (const c of this.cars) {
      if (!c.active || c.isSC || c.inPit) continue;
      const stopped = c.speed < 4 && Math.abs(c.d) < t.hw + 3 && this.phase === 'race' && c.lap >= 0 && this.time - this.startTime > 6;
      if (c.out || stopped) y[Math.floor((3 * c.si) / n)] = true;
      if (!c.out || c.speed > 2) continue;
      hazards++;
      c.strandT += dt;
      if (!c.rcDone) {
        c.rcDone = true;
        if (this.race && this.phase === 'race' && this.flag === 'green' && !this.chequered) {
          const exposed = Math.abs(c.d) < t.hw + 4, r = this.rnd();
          if (exposed ? r < 0.65 : r < 0.1) this.deploySC();
          else if (exposed || r < 0.6) { this.flag = 'vsc'; this.flagT = 0; this.say('Virtual safety car', 'vsc'); }
        }
      }
      if (c.strandT > (this.flag === 'green' ? 40 : 22)) { c.active = false; hazards--; } // la grúa retira el coche
    }
    for (let s = 0; s < 3; s++) if (y[s] !== this.yellow[s] && this.flag === 'green' && this.phase !== 'formation') this.say(y[s] ? `Bandera amarilla en el sector ${s + 1}` : `Pista libre en el sector ${s + 1}`, y[s] ? 'flag-yellow' : 'flag-green');
    this.yellow = y;
    if (this.flag === 'vsc' && hazards === 0 && this.flagT > 20) { this.flag = 'green'; this.flagT = 0; this.say('Fin del VSC: bandera verde', 'flag-green'); }
    const sc = this.sc;
    if (this.flag === 'sc' && sc) {
      if (!this.scIn && hazards === 0 && this.flagT > Math.max(55, t.lapTime * 1.1)) { this.scIn = true; sc.pit = 1; sc.nextTyre = 'M'; this.say('El safety car entra a boxes esta vuelta', 'sc'); }
      if (sc.pit === 2 || !sc.active) { this.flag = 'green'; this.flagT = 0; this.say('Bandera verde: se reanuda la carrera', 'flag-green'); }
    }
    if (sc && sc.pit === 3) { sc.active = false; this.sc = null; }
    if (this.chequered && sc && this.flag === 'sc' && !this.scIn) { this.scIn = true; sc.pit = 1; }
  }

  private deploySC() {
    const t = this.track, lead = this.order.find((c) => !c.out && !c.inPit);
    if (!lead || this.sc) return;
    // shortcut: el safety car aparece en pista por delante del líder en vez de salir desde boxes
    const sc = (this.sc = new Car(99, -1));
    sc.lap = 0;
    this.place(sc, t.idx(lead.si + Math.round(160 / t.ds)), 0, Math.min(45, lead.speed));
    this.cars.push(sc);
    this.flag = 'sc'; this.flagT = 0; this.scIn = false;
    this.say('Safety car en pista', 'sc');
  }

  // ------------------------------------------------------------------ boxes
  private pitMove(c: Car, dt: number) {
    const t = this.track, box = c.isSC ? t.boxU(10) + 30 : t.boxU(c.team);
    const manual = c.isPlayer && !this.o.assists.pitLimiter && !this.autoAll;
    if (c.pit === 3) {
      c.speed = 0; c.pitT -= dt;
      if (c.pitT <= 0 && !c.isSC) {
        if (c.penDT === 2) c.penDT = 0;
        else if (!this.race || !c.finished) { c.tyre = c.nextTyre; c.wear = 0; c.temp = 0.6; c.damage = 0; c.used += c.tyre; c.stops++; c.runLaps = 0; if (c.plan[0]) c.plan.shift(); }
        c.pit = 4;
      }
    } else {
      const zone = c.pitU > 35 && c.pitU < t.pitLen - 35;
      let v = c.speed;
      if (manual && !(c.pit === 2 && c.pitStop && box - c.pitU < 40)) {
        v = clamp(v + (c.thr * 9 - c.brk * 16 - 0.4) * dt, 3, 95);
        if (zone && v > PIT_SPEED + 1.5 && !c.pitSped) { c.pitSped = true; this.penalize(c, 'time', 5, 'Exceso de velocidad en boxes'); }
      } else {
        const lim = zone ? PIT_SPEED : 80;
        v = v > lim ? Math.max(lim, v - 16 * dt) : Math.min(lim, v + (zone ? 9 : 12) * dt);
      }
      if (c.pit === 2 && c.pitStop) {
        v = Math.min(v, Math.sqrt(2 * 7 * Math.max(0, box - c.pitU)) + 0.4);
        if (c.pitU >= box - 0.15) {
          c.pit = 3; v = 0;
          if (c.isSC) c.pitT = 1;
          else if (c.penDT === 2) { c.pitT = 10; this.say(`${this.tag(c)} cumple su stop-and-go`, 'info', c); }
          else {
            c.pitT = (this.race ? 2 + this.rnd() * 1.2 : 6 + this.rnd() * 25 * (c.isPlayer ? 0 : 1)) + (c.damage > 0.25 ? 6 : 0) + c.penSec;
            if (c.penSec) { this.say(`${this.tag(c)} cumple ${c.penSec} s de sanción en boxes`, 'info', c); c.penSec = 0; }
          }
        }
      }
      c.speed = v;
      c.pitU += v * dt;
      if (c.pit === 2 && !c.pitStop && c.pitU > box) { c.pit = 4; c.penDT = 0; this.say(`${this.tag(c)} cumple su drive-through`, 'info', c); }
    }
    // posición sobre el carril de boxes
    const stopAt = c.pitStop || c.pit >= 3 ? box : -1;
    const u = Math.min(c.pitU, t.pitLen), i = t.idx(t.pitIn + Math.floor(u / t.ds)), fr = u - Math.floor(u / t.ds) * t.ds;
    const off = t.pitOffset(u, c.pit === 4 && c.pitU > box + 14 ? -1 : stopAt) + c.pitRes * Math.max(0, 1 - c.pitU / 50);
    const slope = (t.pitOffset(u + 1, stopAt) - t.pitOffset(u - 1, stopAt)) / 2;
    c.x = t.px[i] + t.tx[i] * fr + t.nx[i] * off; c.z = t.pz[i] + t.tz[i] * fr + t.nz[i] * off;
    c.h = Math.atan2(t.tz[i], t.tx[i]) + Math.atan(slope);
    c.vx = Math.cos(c.h) * c.speed; c.vz = Math.sin(c.h) * c.speed;
    c.steer = 0; c.slide = 0; c.spin = 0; c.surf = TARMAC;
    this.locate(c);
    if (c.pitU >= t.pitLen) { c.pit = 0; c.auto = false; c.aiOff = c.d - t.lo[c.si]; c.mergeT = 4; }
  }

  // ------------------------------------------------------------------ clasificación
  private sortOrder() {
    const list = this.order = this.cars.filter((c) => !c.isSC);
    if (this.race) {
      const key = (c: Car) => (c.dsq ? -1e9 : c.finished ? 1e9 - c.pos : c.prog - (c.out ? 1e6 : 0));
      list.sort((a, b) => key(b) - key(a));
    } else list.sort((a, b) => a.bestLap - b.bestLap || a.grid - b.grid);
    list.forEach((c, i) => { if (!c.finished || !this.race) c.pos = i + 1; });
  }
  /** diferencia aproximada en segundos con el coche de referencia */
  gap(c: Car, ref: Car) {
    if (!this.race) return c.bestLap - ref.bestLap;
    return (ref.prog - c.prog) / (this.track.length / this.track.lapTime);
  }

  results(): Result[] {
    if (this.res) return this.res;
    const list = this.cars.filter((c) => !c.isSC);
    if (this.race) {
      for (const c of list) {
        // sanciones sin cumplir: se suman al tiempo final
        if (c.finished && c.penDT) { c.penSec += 20; c.penDT = 0; }
        if (c.finished && !c.dsq && this.type === 'RACE' && this.laps >= 5 && this.wet < 0.2 && !/[IW]/.test(c.used) && new Set(c.used).size < 2) { c.penSec += 30; this.say(`${this.tag(c)}: 30 s — no usar dos compuestos`, 'pen', c); }
      }
      const key = (c: Car) => (c.dsq ? 3e9 : c.finished ? -c.lap * 1e5 + c.finishTime + c.penSec - this.startTime : 1e9 - c.prog + (c.out ? 1e8 : 0));
      list.sort((a, b) => key(a) - key(b));
    } else list.sort((a, b) => a.bestLap - b.bestLap || a.grid - b.grid);
    return this.res = list.map((c, i) => ({
      di: c.di, pos: i + 1, laps: Math.max(0, c.lap), time: c.finished ? c.finishTime - this.startTime + c.penSec : 0, best: c.bestLap, pen: c.penSec,
      status: c.dsq ? 'DSQ' : c.out ? 'DNF' : c.finished || !this.race ? '' : 'DNF', tyres: c.used, grid: c.grid + 1,
    }));
  }
}

export function fmtTime(s: number, short = false): string {
  if (!Number.isFinite(s) || s <= 0) return '--:--.---';
  const m = Math.floor(s / 60), r = s - m * 60;
  return short && m === 0 ? r.toFixed(3) : `${m}:${r.toFixed(3).padStart(6, '0')}`;
}
void KERB; void GRAVEL;
