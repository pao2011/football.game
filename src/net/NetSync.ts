import { Vector3 } from 'three';
import type { HumanController } from '../control/HumanController';
import type { Match, MatchPhase, Restart } from '../sim/Match';
import type { Player } from '../sim/Player';
import type { TeamStats } from '../sim/Team';
import type { AnimState, MatchEvent } from '../sim/types';
import type { RestartType } from '../sim/SetPieces';

// Sincronización de un partido online. El ANFITRIÓN simula el partido completo (60 Hz) con los mandos de
// los dos jugadores y manda ~30 instantáneas por segundo; el INVITADO no simula: dibuja las instantáneas
// interpoladas (con ~0,1 s de colchón para absorber los saltos de la red) y manda sus mandos.

/** Instantánea compacta del partido. */
export interface Snapshot {
  k: 's';
  /** Tiempo de simulación del anfitrión. */
  tm: number;
  ms: number;
  h: number;
  ph: MatchPhase;
  aa: number;
  fin: boolean;
  sc: [number, number];
  /** Balón: x, y, z, vx, vy, vz, efecto (y), sujeto (1/0). */
  b: number[];
  /** Jugadores en el orden de match.playersAll: x, z, facing, estado, t, speed, duración, variante, pie, flags, resistencia. */
  p: (number | string)[][];
  /** Versión de las alineaciones e ids (cuando cambia). */
  rv: number;
  ids?: string[];
  /** Jugador controlado por cada equipo. */
  c: [string, string];
  ow: string;
  gh: string;
  /** Árbitro: x, z, facing, estado, t, speed, duración, tarjeta, gesto, gx, gz. */
  ref: (number | string)[];
  /** Balón parado: tipo, equipo, fase, x, z, lanzador. */
  rs: (string | number)[] | null;
  ev: MatchEvent[];
  /** Estadísticas, goleadores y mentalidad (cada medio segundo). */
  st?: { s: [TeamStats, TeamStats]; sc: [{ name: string; minute: number }[], { name: string; minute: number }[]]; me: [number, number]; su: [number, number] };
  /** Barra de potencia del jugador invitado: acción, valor, rótulo. */
  ch?: [string, number, string];
  /** Mentalidad mostrada recientemente (invitado). */
  mt?: number;
  /** Trayectoria de tiro libre / penal del invitado. */
  fk?: { p: number[]; t: [number, number, number] } | null;
  /** Cambios pendientes del invitado. */
  pend?: { outId: string; inId: string }[];
  /** Repetición: inicio, fin y duración. */
  rc?: [number, number, number];
  /** Último gol: equipo y goleador. */
  lg?: [number, string];
  /** Estadísticas individuales al final (valoraciones): id → [goles, pases, ok, tiros, a puerta, asist., entradas, atajadas, faltas, desde, hasta, amarillas, expulsado]. */
  pr?: Record<string, number[]>;
  /** Tanda de penales. */
  so?: { kicks: [boolean[], boolean[]]; turn: 0 | 1; done: boolean; winner: 0 | 1 | -1 } | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function playerRow(p: Player): (number | string)[] {
  const a = p.anim;
  const flags = (p.sentOff ? 1 : 0) | (Math.min(3, p.yellowCards) << 1) | (Math.min(31, p.goals) << 3);
  return [r2(p.pos.x), r2(p.pos.z), r3(p.facing), a.state, r3(a.time), r2(a.speed), r2(a.duration), a.variant, a.foot, flags, r2(p.stamina)];
}

/** Lado anfitrión: crea las instantáneas a partir del partido real. */
export class HostSync {
  private acc = 0;
  private count = 0;
  private sentRv = -1;
  private events: MatchEvent[] = [];
  private sentPend = '';

  constructor(private readonly match: Match, private readonly guestCtrl: HumanController, private readonly guestTeam: 0 | 1) {}

  /** Guarda los eventos de este paso (se envían en la próxima instantánea). */
  collect(events: MatchEvent[]) {
    for (const e of events) if (e.type !== 'bounce' || (e.power ?? 0) > 0.25) this.events.push(e);
  }

  /** Llamar tras cada paso de simulación; devuelve una instantánea cada 1/30 s. */
  step(dt: number): Snapshot | null {
    this.acc += dt;
    if (this.acc < 1 / 30 - 1e-6) return null;
    this.acc = 0;
    return this.build();
  }

  build(): Snapshot {
    const m = this.match;
    this.count++;
    const ref = m.referee;
    const g = ref.gesture;
    const r = m.restart;
    const snap: Snapshot = {
      k: 's', tm: r3(m.time), ms: r2(m.matchSeconds), h: m.half, ph: m.phase, aa: m.announcedAdded, fin: m.finished,
      sc: [m.teams[0].stats.goals, m.teams[1].stats.goals],
      b: [r3(m.ball.pos.x), r3(m.ball.pos.y), r3(m.ball.pos.z), r2(m.ball.vel.x), r2(m.ball.vel.y), r2(m.ball.vel.z), r2(m.ball.spin.y), m.ball.held ? 1 : 0],
      p: m.playersAll.map(playerRow),
      rv: m.rosterVersion,
      c: [m.teams[0].controlled?.id ?? '', m.teams[1].controlled?.id ?? ''],
      ow: m.owner?.id ?? '',
      gh: m.gkHolding?.id ?? '',
      ref: [r2(ref.pos.x), r2(ref.pos.z), r3(ref.facing), ref.anim.state, r3(ref.anim.time), r2(ref.anim.speed), r2(ref.anim.duration), ref.cardColor ?? '', g ? g.kind : '', g ? r2(g.at.x) : 0, g ? r2(g.at.z) : 0],
      rs: r ? [r.type, r.team, r.stage, r2(r.spot.x), r2(r.spot.z), r.taker?.id ?? ''] : null,
      ev: this.events.splice(0),
    };
    if (m.rosterVersion !== this.sentRv || this.count % 60 === 0) {
      snap.ids = m.playersAll.map((p) => p.id);
      this.sentRv = m.rosterVersion;
    }
    if (this.count % 15 === 1 || snap.ev.some((e) => e.type === 'goal' || e.type === 'card' || e.type === 'sub')) {
      const [a, b] = m.teams;
      snap.st = { s: [{ ...a.stats }, { ...b.stats }], sc: [a.scorers.slice(), b.scorers.slice()], me: [a.mentality, b.mentality], su: [a.subsUsed, b.subsUsed] };
    }
    const gc = this.guestCtrl;
    const ch = gc.charge ?? (gc.lastCharge && m.time - gc.lastCharge.at < 0.6 ? gc.lastCharge : null);
    if (ch) snap.ch = [ch.action, r2(ch.value), ch.label ?? ''];
    if (m.time - gc.mentalityShownAt < 2) snap.mt = r2(m.time - gc.mentalityShownAt);
    const fk = gc.freeKick ?? gc.penaltyAim;
    if (fk) {
      const pts: number[] = [];
      const step = Math.max(1, Math.ceil(fk.path.length / 24));
      for (let i = 0; i < fk.path.length; i += step) pts.push(r2(fk.path[i].x), r2(fk.path[i].y), r2(fk.path[i].z));
      snap.fk = { p: pts, t: [r2(fk.target.x), r2(fk.target.y), r2(fk.target.z)] };
    }
    const pend = m.pendingSubs.filter((s) => s.team === this.guestTeam).map((s) => ({ outId: s.outId, inId: s.inId }));
    const pk = JSON.stringify(pend);
    if (pk !== this.sentPend || this.count % 30 === 0) {
      snap.pend = pend;
      this.sentPend = pk;
    }
    if (m.phase === 'replay' && m.replayClip.length > 1) snap.rc = [m.replayClip[0].tm, m.replayClip[m.replayClip.length - 1].tm, r2(m.replayLength)];
    if (m.lastGoal && (m.phase === 'goal' || m.phase === 'replay')) snap.lg = [m.lastGoal.team, m.lastGoal.scorer?.id ?? ''];
    if (m.finished) {
      const pr: Record<string, number[]> = {};
      for (const t of m.teams) {
        for (const p of [...t.players, ...t.subbedOff]) {
          const q = p.ps;
          pr[p.id] = [p.goals, q.passes, q.passesOk, q.shots, q.onTarget, q.assists, q.tackles, q.saves, q.fouls, q.from, q.to, p.yellowCards, p.sentOff ? 1 : 0];
        }
      }
      snap.pr = pr;
    }
    if (m.shootout) {
      const s = m.shootout;
      snap.so = { kicks: [s.kicks[0].slice(), s.kicks[1].slice()], turn: s.turn, done: s.done, winner: s.winner };
    }
    return snap;
  }
}

/** Vista del mando del invitado para el HUD (barra de potencia, mentalidad). */
export interface GuestCtrlView {
  charge: { action: string; value: number; label?: string } | null;
  lastCharge: null;
  mentalityShownAt: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Lado invitado: aplica las instantáneas recibidas al partido local (que no se simula). */
export class GuestSync {
  private buf: Snapshot[] = [];
  private offset = NaN;
  private applied = -1;
  private renderTm = 0;
  /** Colchón de interpolación (s): se adapta a la regularidad con la que llegan las instantáneas. */
  delay = 0.1;
  /** Media y variación (s) del intervalo entre instantáneas recibidas. */
  private arrMean = 1 / 30;
  private arrJitter = 0.01;
  private lastArr = -1;
  /** Predicción local: desplazamiento visual del jugador que controla el invitado (sin esperar al anfitrión). */
  private readonly predOff = new Vector3();
  /** Desactiva el colchón adaptativo (pruebas). */
  adaptive = true;
  readonly ctrlView: GuestCtrlView = { charge: null, lastCharge: null, mentalityShownAt: -10 };
  freeKick: { path: Vector3[]; target: Vector3 } | null = null;
  /** Instante (ms) de la última instantánea recibida. */
  lastRecv = 0;
  received = 0;
  private lastPhase: MatchPhase | '' = '';

  constructor(private readonly match: Match) {}

  push(s: Snapshot, nowMs: number) {
    this.received++;
    this.lastRecv = nowMs;
    // regularidad de la conexión → colchón justo (menos retraso con buena conexión, menos tirones con mala)
    const now = nowMs / 1000;
    if (this.lastArr >= 0) {
      const gap = Math.min(0.5, now - this.lastArr);
      this.arrMean += (gap - this.arrMean) * 0.05;
      this.arrJitter += (Math.abs(gap - this.arrMean) - this.arrJitter) * 0.05;
      if (this.adaptive) this.delay = adaptiveDelay(this.arrMean, this.arrJitter);
    }
    this.lastArr = now;
    if (this.buf.length && s.tm <= this.buf[this.buf.length - 1].tm) return; // desordenada
    this.buf.push(s);
    const measured = s.tm - nowMs / 1000;
    if (Number.isNaN(this.offset) || Math.abs(measured - this.offset) > 0.6) {
      // primer dato o salto (p. ej. tras una pausa): el reloj vuelve al del anfitrión
      this.offset = measured;
      this.renderTm = Math.min(this.renderTm, s.tm - this.delay);
    }
    else this.offset = Math.max(this.offset + (measured - this.offset) * 0.04, Math.min(this.offset, measured));
    if (this.buf.length > 90) this.buf.splice(0, this.buf.length - 90);
  }

  /**
   * Predicción del invitado: adelanta un poco a su jugador controlado en la dirección del stick (lo que tarda la
   * orden en ir al anfitrión y volver), y suaviza la corrección cuando llega la posición real. `dir` es la
   * dirección del stick en el campo (longitud 0..1).
   */
  predict(team: 0 | 1, dir: { x: number; z: number }, dt: number) {
    const m = this.match;
    const p = m.teams[team].controlled;
    const live = m.phase === 'play' && p && !p.sentOff && !m.gkHolding;
    const lead = Math.min(0.35, this.delay + 0.06);
    const speed = p ? Math.min(8, p.maxSpeed(m.owner === p)) : 0;
    const tx = live ? dir.x * speed * lead : 0;
    const tz = live ? dir.z * speed * lead : 0;
    const k = Math.min(1, dt * 8);
    this.predOff.x += (tx - this.predOff.x) * k;
    this.predOff.z += (tz - this.predOff.z) * k;
    if (this.predOff.lengthSq() > 2.25) this.predOff.setLength(1.5);
    if (!p || this.predOff.lengthSq() < 1e-6) return;
    p.pos.x += this.predOff.x;
    p.pos.z += this.predOff.z;
    // el balón que conduce va con él
    if (m.owner === p) {
      m.ball.pos.x += this.predOff.x;
      m.ball.pos.z += this.predOff.z;
    }
  }

  get hasData() {
    return this.buf.length > 0;
  }

  /** Aplica el estado interpolado para este fotograma. Devuelve los eventos nuevos. */
  update(nowMs: number): MatchEvent[] {
    const out: MatchEvent[] = [];
    if (!this.buf.length) return out;
    const target = nowMs / 1000 + this.offset - this.delay;
    this.renderTm = Math.max(this.renderTm, target);
    const buf = this.buf;
    let i = 0;
    while (i < buf.length - 1 && buf[i + 1].tm <= this.renderTm) i++;
    const a = buf[i];
    const b = buf[Math.min(i + 1, buf.length - 1)];
    const t = b.tm > a.tm ? Math.min(1, Math.max(0, (this.renderTm - a.tm) / (b.tm - a.tm))) : 0;
    // eventos y estado discreto de todas las instantáneas ya alcanzadas
    for (let j = 0; j <= i; j++) {
      const s = buf[j];
      if (s.tm <= this.applied) continue;
      this.applied = s.tm;
      this.applyDiscrete(s);
      for (const e of s.ev) out.push(e);
      this.match.recordFrameNow();
    }
    this.applyContinuous(a, b, t);
    // descartar las ya usadas (se conserva la actual para interpolar)
    if (i > 0) buf.splice(0, i);
    return out;
  }

  private byId(id: string): Player | null {
    if (!id) return null;
    return this.match.playersAll.find((p) => p.id === id) ?? null;
  }

  private applyDiscrete(s: Snapshot) {
    const m = this.match;
    if (s.ids) this.syncRoster(s.ids);
    // fase (con la repetición preparada antes de que la vista la vea)
    if (s.ph === 'replay' && this.lastPhase !== 'replay' && s.rc) {
      const [a, b, len] = s.rc;
      m.replayClip = m.replay.filter((f) => f.tm >= a - 0.05 && f.tm <= b + 0.05);
      m.replayLength = len;
    }
    if (s.ph !== this.lastPhase) m.phaseTimer = 0;
    this.lastPhase = s.ph;
    m.phase = s.ph;
    m.half = s.h;
    m.matchSeconds = s.ms;
    m.announcedAdded = s.aa;
    m.finished = s.fin;
    m.teams[0].stats.goals = s.sc[0];
    m.teams[1].stats.goals = s.sc[1];
    m.ball.held = s.b[7] === 1;
    s.p.forEach((row, idx) => {
      const p = m.playersAll[idx];
      if (!p) return;
      const flags = row[9] as number;
      p.sentOff = !!(flags & 1);
      p.yellowCards = (flags >> 1) & 3;
      p.goals = flags >> 3;
      p.stamina = row[10] as number;
    });
    for (const ti of [0, 1] as const) {
      const c = this.byId(s.c[ti]);
      m.teams[ti].controlled = c;
    }
    m.owner = this.byId(s.ow);
    m.gkHolding = this.byId(s.gh);
    const ref = m.referee;
    ref.cardColor = (s.ref[7] as string) ? (s.ref[7] as 'yellow' | 'red') : null;
    const gk = s.ref[8] as string;
    if (gk) {
      const at = new Vector3(s.ref[9] as number, 0, s.ref[10] as number);
      ref.gesture = { kind: gk as 'card', start: m.time, until: m.time + 1, at, face: at.clone() };
    } else {
      ref.gesture = null;
    }
    if (s.rs) {
      const [type, team, stage, x, z, taker] = s.rs as [RestartType, 0 | 1, Restart['stage'], number, number, string];
      const r: Restart = m.restart ?? { type, team, spot: new Vector3(), taker: null, stage, timer: 0, aiDelay: 0 };
      r.type = type;
      r.team = team;
      r.stage = stage;
      r.spot.set(x, 0, z);
      r.taker = this.byId(taker);
      m.restart = r;
    } else {
      m.restart = null;
    }
    if (s.st) {
      for (const ti of [0, 1] as const) {
        const t = m.teams[ti];
        Object.assign(t.stats, s.st.s[ti]);
        t.scorers = s.st.sc[ti];
        t.mentality = s.st.me[ti];
        t.subsUsed = s.st.su[ti];
      }
    }
    const cv = this.ctrlView;
    cv.charge = s.ch ? { action: s.ch[0], value: s.ch[1], label: s.ch[2] || undefined } : null;
    if (s.mt !== undefined) cv.mentalityShownAt = m.time - s.mt;
    if (s.fk) {
      const path: Vector3[] = [];
      for (let i = 0; i + 2 < s.fk.p.length; i += 3) path.push(new Vector3(s.fk.p[i], s.fk.p[i + 1], s.fk.p[i + 2]));
      this.freeKick = { path, target: new Vector3(...s.fk.t) };
    } else {
      this.freeKick = null;
    }
    if (s.pend) {
      const ti = m.teams.findIndex((t) => t.human) as 0 | 1;
      for (let i = m.pendingSubs.length - 1; i >= 0; i--) if (m.pendingSubs[i].team === ti) m.pendingSubs.splice(i, 1);
      for (const p of s.pend) m.pendingSubs.push({ team: ti, outId: p.outId, inId: p.inId });
    }
    if (s.pr) {
      for (const t of m.teams) {
        for (const p of [...t.players, ...t.subbedOff, ...t.bench]) {
          const v = s.pr[p.id];
          if (!v) continue;
          const q = p.ps;
          [p.goals, q.passes, q.passesOk, q.shots, q.onTarget, q.assists, q.tackles, q.saves, q.fouls, q.from, q.to, p.yellowCards] = v;
          p.sentOff = v[12] === 1;
        }
      }
    }
    if (s.lg) {
      const sc = this.byId(s.lg[1]);
      m.lastGoal = { team: s.lg[0] as 0 | 1, scorer: sc, minute: m.minute, ownGoal: false };
    }
    if (s.so !== undefined) {
      if (!s.so) m.shootout = null;
      else {
        const prev = m.shootout;
        m.shootout = {
          kicks: s.so.kicks, turn: s.so.turn, done: s.so.done, winner: s.so.winner,
          order: prev?.order ?? [0, 0], stage: prev?.stage ?? 'setup', timer: 0, kicker: null, keeper: null, lastResult: null,
        } as Match['shootout'];
      }
    }
  }

  /** Cambios: el orden de jugadores del anfitrión manda (los suplentes entran donde corresponde). */
  private syncRoster(ids: string[]) {
    const m = this.match;
    ids.forEach((id, idx) => {
      const cur = m.playersAll[idx];
      if (!cur || cur.id === id) return;
      const team = m.teams[cur.team];
      const inn = team.bench.find((p) => p.id === id);
      if (inn) m.substitute(team, cur, inn, false);
    });
  }

  private applyContinuous(a: Snapshot, b: Snapshot, t: number) {
    const m = this.match;
    m.time = this.renderTm;
    const sameRoster = a.p.length === b.p.length;
    m.playersAll.forEach((p, idx) => {
      const ra = a.p[idx];
      if (!ra) return;
      const rb = sameRoster ? b.p[idx] : ra;
      const x = lerp(ra[0] as number, rb[0] as number, t);
      const z = lerp(ra[1] as number, rb[1] as number, t);
      const dtSnap = Math.max(1 / 60, b.tm - a.tm);
      p.vel.set(((rb[0] as number) - (ra[0] as number)) / dtSnap, 0, ((rb[1] as number) - (ra[1] as number)) / dtSnap);
      p.pos.set(x, 0, z);
      p.facing = lerpAngle(ra[2] as number, rb[2] as number, t);
      const an = p.anim;
      const sameState = ra[3] === rb[3];
      an.state = (t > 0.5 && !sameState ? rb[3] : ra[3]) as AnimState;
      const src = t > 0.5 && !sameState ? rb : ra;
      an.time = sameState ? lerp(ra[4] as number, rb[4] as number, t) : (src[4] as number);
      an.speed = lerp(ra[5] as number, rb[5] as number, t);
      an.duration = src[6] as number;
      an.variant = src[7] as number;
      an.foot = src[8] as number;
    });
    const ba = a.b;
    const bb = b.b;
    m.ball.pos.set(lerp(ba[0], bb[0], t), lerp(ba[1], bb[1], t), lerp(ba[2], bb[2], t));
    m.ball.vel.set(lerp(ba[3], bb[3], t), lerp(ba[4], bb[4], t), lerp(ba[5], bb[5], t));
    m.ball.spin.y = lerp(ba[6], bb[6], t);
    const ref = m.referee;
    const fa = a.ref;
    const fb = b.ref;
    ref.pos.set(lerp(fa[0] as number, fb[0] as number, t), 0, lerp(fa[1] as number, fb[1] as number, t));
    ref.facing = lerpAngle(fa[2] as number, fb[2] as number, t);
    ref.anim.state = (fa[3] === fb[3] || t < 0.5 ? fa[3] : fb[3]) as AnimState;
    ref.anim.time = fa[3] === fb[3] ? lerp(fa[4] as number, fb[4] as number, t) : ((t < 0.5 ? fa[4] : fb[4]) as number);
    ref.anim.speed = lerp(fa[5] as number, fb[5] as number, t);
    ref.anim.duration = (t < 0.5 ? fa[6] : fb[6]) as number;
  }
}

/** Colchón de interpolación según el intervalo medio entre instantáneas y su variación (s). */
export function adaptiveDelay(mean: number, jitter: number): number {
  return Math.min(0.25, Math.max(0.06, mean * 1.6 + jitter * 2.5));
}
