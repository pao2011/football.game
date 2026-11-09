// Fondo del menú principal: un partido de verdad (IA contra IA, equipos de la élite, estadio de noche) dibujado en
// la propia cancha 3D con cámaras de cine: planos bajos, órbitas, detrás del arco, regates de frente, cámara lenta
// en goles y regates, repeticiones y celebraciones. No hay sonido propio (suena la música del menú).
import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH, SIM_DT } from '../config/constants';
import type { GameSettings } from '../config/Settings';
import { STADIUMS, stadiumForHome } from '../data/stadiums';
import { TEAMS, chooseAwayKit } from '../data/teams';
import type { StadiumData } from '../data/types';
import { MatchView } from '../render/MatchView';
import { Match } from '../sim/Match';
import type { MatchEvent } from '../sim/types';
import { clamp, lerp } from '../util/math';

type Shot = 'low' | 'orbit' | 'goalEnd' | 'high' | 'hero' | 'touchline' | 'crane';
/** Planos posibles (los repetidos salen más; el de frente "hero" solo aparece con un regate). */
const SHOTS: Shot[] = ['low', 'low', 'orbit', 'orbit', 'goalEnd', 'high', 'touchline', 'crane'];
/** Minutos reales tras los que se cambia de partido (equipos y estadio nuevos). */
const MATCH_MINUTES = 10;
/** Por debajo de estos FPS sostenidos el fondo se apaga (equipos lentos o sin GPU). */
const MIN_FPS = 20;

/** Equipos y estadio para el partido de fondo: élite de las ligas, a ser posible de noche o al atardecer. */
export function pickReel(rand: () => number = Math.random): { home: (typeof TEAMS)[number]; away: (typeof TEAMS)[number]; stadium: StadiumData } {
  const elite = TEAMS.slice().sort((a, b) => b.rating - a.rating).slice(0, 40);
  const home = elite[Math.floor(rand() * elite.length)];
  let away = home;
  while (away === home) away = elite[Math.floor(rand() * elite.length)];
  const own = stadiumForHome(home.id, TEAMS.indexOf(home));
  const big = STADIUMS.filter((s) => s.capacity >= 40000 && s.timeOfDay !== 'day' && !s.fog);
  const stadium = own.timeOfDay !== 'day' && !own.fog ? own : big.length ? big[Math.floor(rand() * big.length)] : own;
  return { home, away, stadium };
}

export class MenuShowcase {
  private match!: Match;
  private view!: MatchView;
  private stadiumName = '';
  private raf = 0;
  private last = 0;
  private acc = 0;
  private age = 0;
  private running = false;
  private disposed = false;
  private shot: Shot = 'high';
  private shotLeft = 0;
  private shotAngle = 0;
  private shotSide = 1;
  private shotT = 0;
  private heroUntil = 0;
  private attack = 1;
  private slow = 1;
  private slowLeft = 0;
  private readonly ball = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private lastPhase = '';
  private frames = 0;
  private slowFrames = 0;
  /** Se llama si el equipo no da la talla: el menú vuelve al fondo estático. */
  onSlow: () => void = () => {};
  /** Se llama en cada gol (hinchada y cartel). */
  onGoal: (g: { scorer: string; team: string; minute: number }) => void = () => {};
  /** Se llama al cambiar de partido (el fondo se oculta un instante). */
  onSwap: (phase: 'out' | 'in') => void = () => {};

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly settings: GameSettings) {
    this.build();
  }

  private build() {
    const { home, away, stadium } = pickReel();
    this.match = new Match({
      home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away), humanTeam: -1, halfLengthSec: 600,
      difficulty: 'legend', extraTime: false, penalties: false, var: false, weather: 'clear', competition: 'friendly',
    });
    this.view = new MatchView(this.renderer, this.match, stadium, {
      quality: this.settings.quality, shadows: this.settings.shadows, cameraStyle: 'broadcast', cameraZoom: 1, showIndicators: false,
    });
    this.stadiumName = stadium.name;
    this.age = 0;
    this.acc = 0;
    this.lastPhase = '';
    this.heroUntil = 0;
    this.pickShot();
    this.applyOffset();
  }

  /** Corre el partido y dibuja (idempotente). */
  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = performance.now();
    this.frames = 0;
    this.slowFrames = 0;
    const loop = (now: number) => {
      if (!this.running || this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const real = (now - this.last) / 1000;
      this.last = now;
      this.frame(Math.min(0.1, real), real);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Congela el fondo (deja el último fotograma en el canvas) sin gastar CPU. */
  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get active() {
    return this.running;
  }

  /** Datos del partido en curso para el marcador "en vivo" del menú. */
  status() {
    const m = this.match;
    return { home: m.teams[0].data, away: m.teams[1].data, hg: m.teams[0].stats.goals, ag: m.teams[1].stats.goals, minute: Math.max(1, Math.min(90, Math.floor(m.minute))), stadium: this.stadiumName, replay: m.phase === 'replay' };
  }

  resize(w: number, h: number) {
    this.view.resize(w, h);
    this.applyOffset();
  }

  /** En pantallas anchas el partido se desplaza a la derecha: la izquierda queda limpia para el menú. */
  private applyOffset() {
    const el = this.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    const cam = this.view.camera;
    if (w / h > 1.25) cam.setViewOffset(w, h, -w * 0.13, 0, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  private frame(dt: number, real: number) {
    const m = this.match;
    // salvaguarda de rendimiento: si va a menos de MIN_FPS durante unos segundos se apaga
    this.frames++;
    if (this.frames > 40 && !(window as unknown as { __reelNoGuard?: boolean }).__reelNoGuard) {
      this.slowFrames += real > 1 / MIN_FPS ? 1 : -1;
      this.slowFrames = Math.max(0, this.slowFrames);
      if (this.slowFrames > 90) {
        this.pause();
        this.onSlow();
        return;
      }
    }
    // cámara lenta (goles, regates) y avance rápido en los tiempos muertos
    this.slowLeft -= dt;
    const dead = m.phase === 'stoppage' || m.phase === 'kickoff' || m.phase === 'halftime';
    const want = this.slowLeft > 0 ? 0.4 : dead ? 2.4 : 1;
    this.slow += (want - this.slow) * Math.min(1, dt * 6);
    const sdt = dt * this.slow;
    this.acc += sdt;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 10) {
      if (m.phase === 'halftime' || m.phase === 'fulltime') {
        // sin descansos: el partido sigue (una segunda parte) o se cambia por otro
        if (m.phase === 'fulltime' || m.half >= 2) { this.swap(); return; }
      }
      m.step(SIM_DT);
      for (const e of m.events) this.onEvent(e);
      m.events.length = 0;
      this.acc -= SIM_DT;
      steps++;
    }
    if (steps >= 10) this.acc = 0;
    this.age += real;
    if (this.age > MATCH_MINUTES * 60) { this.swap(); return; }
    this.view.update(sdt, null, null);
    this.cinematic(sdt);
    this.view.render();
  }

  private onEvent(e: MatchEvent) {
    if (e.type === 'net' && e.x !== undefined && e.z !== undefined) this.view.netImpact(e.x, e.z, e.power ?? 0.6);
    else if (e.type === 'goal' && e.kind !== 'shootout') {
      this.view.director.addShake(0.25);
      if (e.team === 0 || e.team === 1) this.view.stadium.fans.goal(e.team);
      this.slowLeft = 1.4;
      const sc = this.match.lastGoal?.scorer;
      this.onGoal({ scorer: sc?.data.name.split(' ').slice(-1)[0] ?? '', team: e.team === 0 || e.team === 1 ? this.match.teams[e.team].data.name : '', minute: Math.max(1, Math.floor(this.match.minute)) });
    } else if (e.type === 'skill' && (e.power ?? 0) >= 1) {
      // regate ganado: plano de frente al jugador y un momento de cámara lenta
      this.heroUntil = this.match.time + 2.6;
      this.slowLeft = Math.max(this.slowLeft, 0.9);
      this.shot = 'hero';
      this.shotLeft = 2.6;
      this.shotT = 0;
      this.cut = true;
    } else if (e.type === 'save' || e.type === 'post') this.slowLeft = Math.max(this.slowLeft, 0.7);
  }

  private cut = true;

  /** Pruebas: fija un plano (null = rotación normal). */
  forceShot(s: Shot | null) {
    this.forced = s;
    if (s) { this.shot = s; this.shotLeft = 1e9; this.shotT = 0; this.cut = true; }
    else this.shotLeft = 0;
  }
  private forced: Shot | null = null;

  private pickShot() {
    if (this.forced) { this.shot = this.forced; this.shotLeft = 1e9; this.shotT = 0; this.cut = true; return; }
    const choices = SHOTS.filter((s) => s !== this.shot);
    this.shot = choices[Math.floor(Math.random() * choices.length)];
    this.shotLeft = 5 + Math.random() * 3.5;
    this.shotAngle = Math.random() * Math.PI * 2;
    // la cámara se coloca del lado del balón: así la jugada queda cerca
    this.shotSide = Math.abs(this.ball.z) > 3 ? Math.sign(this.ball.z) : Math.random() < 0.5 ? -1 : 1;
    this.shotT = 0;
    this.cut = true;
  }

  /** Mueve la cámara con los planos de cine (en goles y repeticiones manda el director de la transmisión). */
  private cinematic(dt: number) {
    const m = this.match;
    const cam = this.view.camera;
    if (m.phase === 'goal' || m.phase === 'replay' || m.phase === 'var') {
      this.lastPhase = m.phase;
      this.cut = true;
      return;
    }
    if (this.lastPhase === 'goal' || this.lastPhase === 'replay') this.pickShot();
    this.lastPhase = m.phase;
    this.shotLeft -= dt;
    this.shotT += dt;
    if (this.shotLeft <= 0) this.pickShot();
    const b = m.ball.pos;
    const owner = m.owner;
    // el balón suavizado evita sacudidas en el seguimiento
    this.ball.lerp(b, 1 - Math.exp(-6 * dt));
    const pt = m.possessionTeam;
    if (pt !== -1) this.attack = m.teams[pt].attackDir;
    const d = this.attack;
    const bx = this.ball.x;
    const bz = this.ball.z;
    let fov = 36;
    let damp = 3.2;
    const inFinalThird = bx * d > HALF_LENGTH - 36;
    let shot = this.shot;
    if (shot === 'goalEnd' && !inFinalThird) shot = 'low';
    if (shot === 'touchline' && Math.abs(bz) < HALF_WIDTH * 0.4) shot = 'low';
    switch (shot) {
      case 'low': // lateral bajo siguiendo la jugada
        this.pos.set(bx - d * 8, 1.7, clamp(bz + 12 * this.shotSide, -HALF_WIDTH - 9, HALF_WIDTH + 9));
        this.look.set(bx + d * 5, 1.1, bz);
        fov = 36;
        break;
      case 'orbit': { // órbita lenta alrededor del balón
        const a = this.shotAngle + this.shotT * 0.32 * this.shotSide;
        this.pos.set(bx + Math.cos(a) * 8.5, 2.8 + Math.sin(this.shotT * 0.6) * 0.5, bz + Math.sin(a) * 8.5);
        this.look.set(bx, 1.1, bz);
        fov = 40;
        break;
      }
      case 'goalEnd': // detrás del arco atacado: el remate viene de frente
        this.pos.set(d * (HALF_LENGTH + 9), 3, clamp(bz * 0.35, -9, 9));
        this.look.set(bx, 1.4, bz);
        fov = 32;
        damp = 4;
        break;
      case 'high': // plano de teleobjetivo desde la grada: cerrado sobre la jugada
        this.pos.set(bx * 0.8, 15, HALF_WIDTH + 13);
        this.look.set(bx, 0.5, bz * 0.7);
        fov = 22;
        break;
      case 'touchline': // pegado a la banda, el jugador pasa rozando la cámara
        this.pos.set(bx - d * 5, 1.1, (HALF_WIDTH + 2.5) * this.shotSide);
        this.look.set(bx + d * 5, 1.2, bz);
        fov = 46;
        damp = 5;
        break;
      case 'crane': // grúa: sube lentamente desde el césped
        this.pos.set(bx - d * 12, 1.5 + Math.min(11, this.shotT * 2.2), clamp(bz + 13 * this.shotSide, -HALF_WIDTH - 9, HALF_WIDTH + 9));
        this.look.set(bx + d * 3, 1, bz);
        fov = 34;
        break;
      case 'hero': { // de frente al que lleva el balón
        const p = owner?.pos ?? b;
        const f = owner?.facing ?? 0;
        this.pos.set(p.x + Math.sin(f) * 6.5 + Math.cos(f) * 2.2 * this.shotSide, 1.45, p.z + Math.cos(f) * 6.5 - Math.sin(f) * 2.2 * this.shotSide);
        this.look.set(p.x, 1.15, p.z);
        fov = 42;
        damp = 5;
        break;
      }
    }
    // las cámaras bajas no pueden pasar de los carteles de la banda (HALF_WIDTH + 4) ni meterse en la grada
    this.pos.x = clamp(this.pos.x, -HALF_LENGTH - 10, HALF_LENGTH + 10);
    if (this.pos.y < 10) this.pos.z = clamp(this.pos.z, -HALF_WIDTH - 3, HALF_WIDTH + 3);
    // el director de la transmisión reescribe la cámara en cada fotograma: el estado propio se guarda aparte
    if (this.cut) {
      this.curPos.copy(this.pos);
      this.curLook.copy(this.look);
      this.curFov = fov;
      this.cut = false;
    } else {
      const k = 1 - Math.exp(-damp * dt);
      this.curPos.lerp(this.pos, k);
      this.curLook.lerp(this.look, k);
      this.curFov = lerp(this.curFov, fov, k);
    }
    cam.position.copy(this.curPos);
    cam.fov = this.curFov;
    cam.updateProjectionMatrix();
    cam.lookAt(this.curLook);
  }

  private readonly curLook = new THREE.Vector3();
  private readonly curPos = new THREE.Vector3();
  private curFov = 36;

  /** Cambia de partido: fundido a negro, equipos y estadio nuevos. */
  private swap() {
    this.pause();
    this.onSwap('out');
    window.setTimeout(() => {
      if (this.disposed) return;
      try {
        this.view.dispose();
        this.build();
        this.view.update(0, null, null);
        this.view.render();
      } catch (err) {
        console.warn('Fondo del menú: no se pudo cambiar de partido', err);
        this.onSlow();
        return;
      }
      this.onSwap('in');
      this.start();
    }, 700);
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.view.dispose();
  }
}
