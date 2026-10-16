import { Vector3 } from 'three';
import {
  BALL_RADIUS, CONTROL_RADIUS, GOAL_HALF_WIDTH, GOAL_HEIGHT, HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_DEPTH,
  PENALTY_AREA_HALF_WIDTH, PLAYER_RADIUS, SIM_DT,
} from '../config/constants';
import type { Difficulty, FormationId, KitData, TeamData } from '../data/types';
import { DIFFICULTY, type DifficultyParams } from '../ai/Difficulty';
import { updateTeamTactics } from '../ai/TeamAI';
import { updateOutfieldAI, aiTakeSetPiece } from '../ai/PlayerAI';
import { updateGoalkeeperAI } from '../ai/GoalkeeperAI';
import { dist2D, Rng, clamp, approachAngle as approachAngleRad } from '../util/math';
import { Ball } from './Ball';
import { applyKickError } from './Kicks';
import { Player, type KickRequest } from './Player';
import { Team } from './Team';
import { SKILL_KINDS, SKILL_NAMES, type MatchEvent, type SkillKind } from './types';
import { evaluateOffsidePositions, isInPenaltyArea } from './Rules';
import { placeForRestart, type RestartType } from './SetPieces';
import { Referee } from './Referee';
import { weatherEnv, type Weather } from './Weather';
import { AERIAL_ERROR, AERIAL_NAMES, AERIAL_TIMING, aerialInReach, aerialShotVelocity } from './Aerial';

export type MatchPhase = 'kickoff' | 'play' | 'stoppage' | 'goal' | 'replay' | 'halftime' | 'fulltime' | 'shootout';

export interface MatchConfig {
  home: TeamData;
  away: TeamData;
  homeKit: KitData;
  awayKit: KitData;
  /** Equipo controlado por el humano: 0 local, 1 visitante, -1 ninguno (IA contra IA). */
  humanTeam: 0 | 1 | -1;
  /** Duración real (s) de cada parte. */
  halfLengthSec: number;
  difficulty: Difficulty;
  /** En caso de empate: prórroga y/o penales (eliminatorias). */
  extraTime: boolean;
  penalties: boolean;
  seed?: number;
  homeFormation?: FormationId;
  awayFormation?: FormationId;
  homeLineup?: string[];
  awayLineup?: string[];
  /** Modo entrenamiento. */
  training?: 'free' | 'penalties' | 'freekicks';
  /** Clima (por defecto despejado). */
  weather?: Weather;
}

export interface Restart {
  type: RestartType;
  team: 0 | 1;
  spot: Vector3;
  taker: Player | null;
  stage: 'pause' | 'setup' | 'ready';
  timer: number;
  /** Tiempo de espera de la IA antes de ejecutar. */
  aiDelay: number;
}

/** Interfaz para controladores humanos (inyectada para evitar dependencias circulares). */
export interface TeamController {
  update(match: Match, team: Team, dt: number): void;
}

interface ShootoutState {
  kicks: [boolean[], boolean[]];
  turn: 0 | 1;
  order: [number, number];
  stage: 'setup' | 'ready' | 'flight' | 'result';
  timer: number;
  kicker: Player | null;
  keeper: Player | null;
  done: boolean;
  winner: 0 | 1 | -1;
  lastResult: boolean | null;
}

/** Velocidad de reproducción de las repeticiones (cámara lenta). */
export const REPLAY_SPEED = 0.6;

export interface ReplayFrame {
  /** Instante del partido (s). */
  tm: number;
  ball: [number, number, number];
  players: { id: string; x: number; z: number; f: number; s: string; t: number; sp: number; d: number; v: number; ft: number }[];
}

export interface LastTouch {
  team: 0 | 1;
  player: Player;
  time: number;
  /** Fue un golpeo deliberado (pase/tiro) y no un rebote/control. */
  deliberate: boolean;
  kind: KickRequest['kind'] | 'control' | 'deflection' | 'tackle';
}

/** Cambios permitidos por equipo. */
export const MAX_SUBS = 5;

const _v = new Vector3();
const _w = new Vector3();

export class Match {
  readonly ball = new Ball();
  readonly teams: [Team, Team];
  readonly rng: Rng;
  /** Clima del partido. */
  readonly weather: Weather;
  readonly diff: DifficultyParams;
  /** Tiempo de simulación (s reales). */
  time = 0;
  /** Segundos de partido (reloj mostrado). */
  matchSeconds = 0;
  half = 1; // 1, 2, 3 (prórroga 1), 4 (prórroga 2)
  phase: MatchPhase = 'kickoff';
  phaseTimer = 0;
  restart: Restart | null = null;
  owner: Player | null = null;
  /** El arquero retiene el balón en las manos. */
  gkHolding: Player | null = null;
  lastTouch: LastTouch | null = null;
  /** Jugadores en posición de fuera de juego en el último pase (por equipo). */
  offsideSet: Set<string> = new Set();
  offsideTeam: 0 | 1 | -1 = -1;
  /** Tiempo añadido acumulado (segundos de partido) para la parte actual. */
  addedSeconds = 0;
  announcedAdded = -1;
  events: MatchEvent[] = [];
  readonly controllers: (TeamController | null)[] = [null, null];
  readonly replay: ReplayFrame[] = [];
  private replayAcc = 0;
  private tacticsAcc = 0;
  kickoffTeam: 0 | 1 = 0;
  firstHalfKickoff: 0 | 1 = 0;
  shootout: ShootoutState | null = null;
  lastGoal: { team: 0 | 1; scorer: Player | null; minute: number; ownGoal: boolean } | null = null;
  /** Último disparo a puerta (para contar atajadas). */
  lastShot: { team: 0 | 1; time: number; onTarget: boolean } | null = null;
  /** Instante del último disparo (no se borra con las atajadas; sirve para encuadrar la repetición). */
  private shotKickTime = -1;
  private goalTime = 0;
  /** Fotogramas de la repetición del último gol (desde antes del disparo hasta el balón en la red). */
  replayClip: ReplayFrame[] = [];
  /** Árbitro (sigue el juego, avisa y muestra tarjetas). */
  readonly referee = new Referee();
  /** La reanudación espera a que el árbitro termine de amonestar. */
  private restartHoldUntil = 0;
  /**
   * Ley de la ventaja en curso: el árbitro deja seguir porque el equipo que recibió la falta conserva el balón.
   * Si lo pierde antes de `until`, se vuelve atrás y se pita el tiro libre; si no, se amonesta sin parar el juego.
   */
  advantage: { team: 0 | 1; until: number; spot: Vector3; offender: Player; card: 'yellow' | null; warn: boolean } | null = null;
  /** Duración (s) de la fase de repetición: el clip completo a cámara lenta. */
  replayLength = 6.5;
  finished = false;
  /** Contadores para pruebas automáticas. */
  readonly debug = { kicks: 0, controls: 0, tackles: 0, fouls: 0, offsides: 0, outs: 0, saves: 0, stuckTime: 0 };
  /** Mitad de la duración: segundos de partido por segundo real. */
  readonly timeScale: number;
  readonly playersAll: Player[] = [];
  /** Receptor previsto del último pase (para auto-cambio del humano). */
  intendedReceiver: Player | null = null;
  /** Último pase completado (para las asistencias). */
  private lastPass: { from: Player; to: Player; time: number } | null = null;
  /** Cambios pedidos que se harán en la próxima interrupción del juego. */
  readonly pendingSubs: { team: 0 | 1; outId: string; inId: string }[] = [];
  /** Aumenta con cada cambio (el renderizador crea/oculta modelos). */
  rosterVersion = 0;
  /** Último minuto en que cada equipo de la IA hizo un cambio. */
  private aiSubMinute: [number, number] = [-99, -99];
  /** Cambios automáticos también para el equipo humano (opción de configuración). */
  autoSubs: [boolean, boolean] = [false, false];

  readonly config: MatchConfig;

  constructor(config: MatchConfig) {
    this.config = config;
    // Mismo club en los dos lados (p. ej. online, los dos eligen el mismo equipo): el visitante
    // necesita identificadores propios o sus jugadores se confunden con los del local.
    if (config.away.id === config.home.id) {
      const away = config.away;
      config = {
        ...config,
        away: { ...away, id: `${away.id}~b`, players: away.players.map((p) => ({ ...p, id: `${p.id}~b` })) },
        awayLineup: config.awayLineup?.map((id) => `${id}~b`),
      };
      this.config = config;
    }
    this.rng = new Rng(config.seed ?? Math.floor(Math.random() * 1e9));
    this.diff = DIFFICULTY[config.difficulty];
    this.weather = config.weather ?? 'clear';
    this.ball.env = weatherEnv(this.weather, config.seed ?? Math.floor(this.rng.next() * 1e6));
    this.teams = [
      new Team(0, config.home, config.homeKit, config.humanTeam === 0, config.homeFormation, config.homeLineup),
      new Team(1, config.away, config.awayKit, config.humanTeam === 1, config.awayFormation, config.awayLineup),
    ];
    this.timeScale = (45 * 60) / config.halfLengthSec;
    if (config.training) {
      // En entrenamiento el rival solo tiene arquero (y barrera en tiros libres)
      const opp = this.teams[1];
      const keep = config.training === 'freekicks' ? [0, 2, 3, 5, 6] : [0];
      opp.players.forEach((p, i) => { if (!keep.includes(i)) p.sentOff = true; });
    }
    for (const t of this.teams) for (const p of t.players) this.playersAll.push(p);
    this.firstHalfKickoff = this.rng.next() < 0.5 ? 0 : 1;
    if (config.training) this.firstHalfKickoff = 0;
    this.kickoffTeam = this.firstHalfKickoff;
    this.setupRestart('kickoff', this.kickoffTeam, new Vector3(0, BALL_RADIUS, 0), true);
    if (config.training === 'penalties' || config.training === 'freekicks') this.trainingReset();
  }

  /** En entrenamiento de balón parado, cada intento termina y se repite la jugada. */
  private trainingIdle = 0;
  private get setPieceTraining() {
    return this.config.training === 'penalties' || this.config.training === 'freekicks';
  }

  get active(): Player[] {
    return this.playersAll.filter((p) => !p.sentOff);
  }

  emit(e: MatchEvent) {
    this.events.push(e);
  }

  /** Minuto mostrado en el marcador. */
  get clockText(): string {
    const base = this.half === 1 ? 0 : this.half === 2 ? 45 : this.half === 3 ? 90 : 105;
    const len = this.half <= 2 ? 45 : 15;
    const s = this.matchSeconds;
    const total = Math.floor(s);
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    if (mm >= base + len) {
      return `${base + len}:00 +${Math.max(1, Math.ceil((s - (base + len) * 60) / 60))}`;
    }
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  get minute() {
    return Math.floor(this.matchSeconds / 60) + 1;
  }

  get halfEndSeconds() {
    return this.half === 1 ? 45 * 60 : this.half === 2 ? 90 * 60 : this.half === 3 ? 105 * 60 : 120 * 60;
  }

  /** Minutos añadidos anunciados (redondeados). */
  get addedMinutes() {
    return clamp(Math.ceil(this.addedSeconds / 60), 1, 6);
  }

  otherTeam(t: 0 | 1): Team {
    return this.teams[t === 0 ? 1 : 0];
  }

  hasBall(p: Player) {
    return this.owner === p || this.gkHolding === p;
  }

  /** Equipo en posesión (o el último en tocar si el balón está suelto en movimiento). */
  get possessionTeam(): 0 | 1 | -1 {
    if (this.gkHolding) return this.gkHolding.team as 0 | 1;
    if (this.owner) return this.owner.team as 0 | 1;
    if (this.lastTouch && this.lastTouch.deliberate && this.time - this.lastTouch.time < 2.5) return this.lastTouch.team;
    return -1;
  }

  // ------------------------------------------------------------------
  // Bucle principal
  // ------------------------------------------------------------------

  step(dt = SIM_DT) {
    this.time += dt;
    this.phaseTimer += dt;
    if (this.phase !== 'play' && this.phase !== 'shootout' && !this.finished && !this.config.training) {
      if (this.pendingSubs.length) this.applyPendingSubs();
      this.aiSubstitutions();
    }
    if (this.phase !== 'replay') this.referee.update(dt, this.time, this.ball.pos);
    switch (this.phase) {
      case 'kickoff':
      case 'stoppage':
        this.stepRestart(dt);
        break;
      case 'play':
        this.stepPlay(dt);
        break;
      case 'goal':
        this.stepCelebration(dt);
        // se sigue grabando un momento para que la repetición muestre el balón en la red
        if (this.phaseTimer < 1.4) this.recordReplay(dt);
        if (this.phaseTimer > 3.6) {
          this.buildReplayClip();
          this.enterPhase('replay');
        }
        break;
      case 'replay':
        if (this.phaseTimer > this.replayLength) this.afterGoal();
        break;
      case 'halftime':
        this.stepCelebration(dt);
        if (this.phaseTimer > 3) this.startNextHalf();
        break;
      case 'shootout':
        this.stepShootout(dt);
        break;
      case 'fulltime':
        this.stepCelebration(dt);
        break;
    }
  }

  skipReplay() {
    if (this.phase === 'replay') this.afterGoal();
  }

  private enterPhase(p: MatchPhase) {
    this.phase = p;
    this.phaseTimer = 0;
    this.emit({ type: 'phase', kind: p });
  }

  private advanceClock(dt: number) {
    if (this.config.training) return;
    this.matchSeconds += dt * this.timeScale;
    const end = this.halfEndSeconds;
    if (this.matchSeconds >= end && this.announcedAdded < 0) {
      this.announcedAdded = this.addedMinutes;
      this.emit({ type: 'phase', kind: 'added', text: `+${this.announcedAdded}` });
    }
  }

  /** ¿Se debe pitar el final de la parte? */
  private halfShouldEnd(): boolean {
    if (this.config.training) return false;
    if (this.announcedAdded < 0) return false;
    if (this.matchSeconds < this.halfEndSeconds + this.announcedAdded * 60) return false;
    // No cortar un ataque peligroso en curso: balón volando hacia el arco
    const b = this.ball;
    if (this.phase === 'play' && b.speed > 9 && Math.abs(b.pos.x) > HALF_LENGTH - 30 && Math.sign(b.vel.x) === Math.sign(b.pos.x)) {
      return this.matchSeconds > this.halfEndSeconds + this.announcedAdded * 60 + 6 * this.timeScale;
    }
    return true;
  }

  private stepPlay(dt: number) {
    this.advanceClock(dt);
    this.tacticsAcc += dt;
    if (this.tacticsAcc >= 0.1) {
      this.tacticsAcc = 0;
      for (const t of this.teams) updateTeamTactics(this, t);
    }
    this.updateDecisions(dt);
    this.processActions(dt);
    if (this.phase !== 'play') return; // una falta detuvo el juego en este paso
    this.movePlayers(dt);
    this.controlBall(dt);
    const ev = this.ball.step(dt);
    if (ev.bounce > 0.08) this.emit({ type: 'bounce', power: ev.bounce });
    if (ev.post) this.emit({ type: 'post', x: this.ball.pos.x, z: this.ball.pos.z });
    if (ev.net) this.emit({ type: 'net', x: this.ball.pos.x, z: this.ball.pos.z, power: Math.min(1, this.ball.speed / 10) });
    this.gkSaves();
    this.acquireBall();
    this.updateAdvantage();
    if (this.phase !== 'play') return; // una regla pudo detener el juego (offside...)
    this.checkBallOut();
    if (this.phase !== 'play') return;
    // Estadísticas de posesión
    const pt = this.possessionTeam;
    if (pt !== -1) this.teams[pt].stats.possessionTime += dt;
    this.recordReplay(dt);
    if (this.setPieceTraining) {
      // intento terminado: el arquero atrapó el balón o este quedó muerto
      this.trainingIdle = this.gkHolding || this.ball.speed < 0.4 ? this.trainingIdle + dt : 0;
      if (this.trainingIdle > 1.2) {
        this.trainingIdle = 0;
        this.trainingReset();
        return;
      }
    }
    // Seguridad: balón detenido sin nadie cerca durante mucho tiempo
    if (!this.owner && this.ball.speed < 0.2) this.debug.stuckTime += dt;
    if (this.halfShouldEnd()) this.endHalf();
  }

  /** IA y controladores humanos fijan velocidad deseada y acciones. */
  private updateDecisions(dt: number) {
    for (const t of this.teams) {
      const ctrl = this.controllers[t.index];
      if (ctrl && t.human) ctrl.update(this, t, dt);
      for (const p of t.players) {
        if (p.sentOff) continue;
        if (t.human && p === t.controlled) continue;
        if (p.isGK) updateGoalkeeperAI(this, p, dt);
        else updateOutfieldAI(this, p, dt);
      }
    }
  }

  private movePlayers(dt: number) {
    const act = this.active;
    for (const p of act) {
      if (p.stunnedUntil > this.time) p.desiredVel.multiplyScalar(0.3); // superado por un regate
      // terminando un control con el pecho o el muslo: acompaña al balón que cae hasta tenerlo en los pies
      if (this.owner === p && p.action.kind === 'trap' && p.action.variant > 0) {
        const bx = this.ball.pos.x - p.pos.x;
        const bz = this.ball.pos.z - p.pos.z;
        const d = Math.hypot(bx, bz);
        const sp = d > 0.45 ? Math.min(3, (d - 0.35) * 5) : 0;
        p.desiredVel.set(d > 1e-3 ? (bx / d) * sp : 0, 0, d > 1e-3 ? (bz / d) * sp : 0);
      }
      p.integrate(dt, this.owner === p);
      const holding = this.gkHolding === p;
      p.updateAnim(dt, this.owner === p, holding);
    }
    // Separación entre jugadores (colisión de cuerpos)
    for (let i = 0; i < act.length; i++) {
      const a = act[i];
      for (let j = i + 1; j < act.length; j++) {
        const b = act[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const minD = PLAYER_RADIUS * 2;
        if (d2 < minD * minD && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (minD - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          const wa = a.frozen ? 0 : b.frozen ? 2 : 1;
          const wb = b.frozen ? 0 : a.frozen ? 2 : 1;
          a.pos.x -= nx * push * wa;
          a.pos.z -= nz * push * wa;
          b.pos.x += nx * push * wb;
          b.pos.z += nz * push * wb;
        }
      }
      // Mantener en los límites del recinto
      a.pos.x = clamp(a.pos.x, -HALF_LENGTH - 4, HALF_LENGTH + 4);
      a.pos.z = clamp(a.pos.z, -HALF_WIDTH - 4, HALF_WIDTH + 4);
    }
  }

  // ------------------------------------------------------------------
  // Balón: conducción, controles y golpeos
  // ------------------------------------------------------------------

  /** Conducción: pequeños toques continuos que mantienen el balón delante del pie. */
  private controlBall(dt: number) {
    const b = this.ball;
    if (this.gkHolding) {
      const g = this.gkHolding;
      const f = g.forward(_v);
      b.held = true;
      b.pos.set(g.pos.x + f.x * 0.3, 1.05, g.pos.z + f.z * 0.3);
      if (g.action.kind === 'kick' && g.action.kick && (g.action.kick.kind === 'gkthrow')) b.pos.y = 1.9;
      return;
    }
    const o = this.owner;
    if (!o) return;
    const d = dist2D(o.pos, b.pos);
    // tras un control aéreo el balón todavía está cayendo: se le da algo más de margen
    if (d > (o.action.kind === 'trap' && b.pos.y > 0.3 ? 2.2 : 1.5) || b.pos.y > 1.85 || o.sentOff || o.action.kind === 'fallen' || o.action.kind === 'slide') {
      this.owner = null;
      return;
    }
    if (o.action.kind === 'kick' && o.action.done) return;
    if (b.pos.y > BALL_RADIUS + 0.15) return; // en el aire: se deja caer
    const f = o.forward(_v);
    const sp = Math.hypot(o.vel.x, o.vel.z);
    let ahead = 0.42 + sp * 0.06;
    let tx = o.pos.x + f.x * ahead + o.vel.x * 0.05;
    let tz = o.pos.z + f.z * ahead + o.vel.z * 0.05;
    if (o.shielding || o.precision) {
      // protegiendo el balón o conduciendo con precisión: pegado al pie
      ahead = o.shielding ? 0.38 : 0.45;
      tx = o.pos.x + f.x * ahead;
      tz = o.pos.z + f.z * ahead;
    }
    if (o.action.kind === 'kick') {
      // armando el golpeo en carrera: el balón se acomoda al pie
      ahead = 0.5;
      tx = o.pos.x + f.x * ahead;
      tz = o.pos.z + f.z * ahead;
    }
    if (o.action.kind === 'skill') {
      // durante el regate el balón sigue el gesto: pegado al pie, arrastrado o hacia la salida
      const a = o.action;
      const n = a.time / a.duration;
      const fwd = a.aux ?? f;
      const kind = SKILL_KINDS[a.variant];
      if (!a.done) {
        if (kind === 'dragback') ahead = 0.45 - 0.75 * Math.min(1, n / Math.max(0.01, a.contactAt / a.duration));
        else if (kind === 'roulette') ahead = 0.22;
        else ahead = 0.32;
        tx = o.pos.x + fwd.x * ahead;
        tz = o.pos.z + fwd.z * ahead;
      } else {
        ahead = 0.5 + sp * 0.06;
        tx = o.pos.x + a.dir.x * ahead;
        tz = o.pos.z + a.dir.z * ahead;
      }
    }
    const gain = 6.5;
    const dvx = o.vel.x + (tx - b.pos.x) * gain;
    const dvz = o.vel.z + (tz - b.pos.z) * gain;
    const ctrl = o.data.attrs.control / 100;
    const k = Math.min(1, (9 + ctrl * 8) * dt);
    b.vel.x += (dvx - b.vel.x) * k;
    b.vel.z += (dvz - b.vel.z) * k;
    if (b.vel.y > 0) b.vel.y *= 0.5;
  }

  /** Jugadores sin balón que lo alcanzan: control, despeje involuntario o atajada con las manos. */
  private acquireBall() {
    const b = this.ball;
    if (b.held) return;
    let best: Player | null = null;
    let bestD = Infinity;
    for (const p of this.active) {
      if (p === this.owner) continue;
      if (p.noTouchUntil > this.time) continue;
      const k = p.action.kind;
      if (k === 'fallen' || k === 'getup' || k === 'slide' || k === 'dive' || k === 'celebrate') continue;
      if (k === 'kick' && !p.action.done) continue;
      const d = dist2D(p.pos, b.pos);
      const ownBox = isInPenaltyArea(p.pos, p.team === 0 ? -this.teams[0].attackDir : -this.teams[1].attackDir);
      const gkHands = p.isGK && ownBox;
      const reach = gkHands ? 0.95 : CONTROL_RADIUS;
      // de pecho para abajo se puede controlar; en el área propia los balones altos se despejan de cabeza
      const maxH = gkHands ? 2.45 : ownBox ? 1.5 : 1.75;
      if (d < reach && b.pos.y < maxH && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (!best) return;
    // Disputa: si hay dueño y el candidato es rival, solo gana el balón con una entrada
    if (this.owner && this.owner.team !== best.team) return;
    if (this.owner && this.owner.team === best.team) return;
    this.touchBall(best);
  }

  /** Primer contacto de un jugador con un balón suelto. */
  private touchBall(p: Player) {
    const b = this.ball;
    const rel = _v.copy(b.vel).sub(p.vel);
    const relSpeed = rel.length();
    const team = this.teams[p.team];
    const ownGoalSide = -team.attackDir;
    const gkHands = p.isGK && isInPenaltyArea(p.pos, ownGoalSide) && !this.isBackPass(p);
    const ctrl = p.data.attrs.control / 100;
    const height = b.pos.y;

    // Comprobación de fuera de juego al intervenir en el juego
    if (this.offsideTeam === p.team && this.offsideSet.has(p.id)) {
      this.callOffside(p);
      return;
    }
    // Mano: balón a la altura del brazo, por el costado y con los brazos separados del cuerpo
    if (!gkHands && this.isHandball(p, relSpeed)) {
      this.callHandball(p);
      return;
    }
    if (this.offsideTeam !== -1 && this.offsideTeam !== p.team) {
      // un rival juega el balón: se anula la situación de fuera de juego
      this.offsideSet.clear();
      this.offsideTeam = -1;
    }

    // Pase completado (estadística)
    if (this.lastTouch && this.lastTouch.deliberate && ['pass', 'through', 'lob', 'cross', 'throwin', 'gkthrow'].includes(this.lastTouch.kind)) {
      if (this.lastTouch.team === p.team && this.lastTouch.player !== p) {
        this.teams[p.team].stats.passesCompleted++;
        this.lastTouch.player.ps.passesOk++;
        this.lastPass = { from: this.lastTouch.player, to: p, time: this.time };
      }
    }

    if (gkHands) {
      const catchable = relSpeed < 15 + p.data.attrs.goalkeeping * 0.11;
      if (catchable) {
        this.gkCatch(p);
      } else {
        this.parry(p);
      }
      return;
    }

    // Balón aéreo (centros, pelotazos): control con el pecho o el muslo si no viene demasiado fuerte
    const aerial = height > 0.5;
    const limit = aerial ? 7 + ctrl * 12 : 9 + ctrl * 13 + (height > 0.35 ? -3 : 0);
    if (relSpeed > limit) {
      // Rebote en el cuerpo: el balón sale despedido con menos velocidad
      _w.set(b.pos.x - p.pos.x, 0, b.pos.z - p.pos.z).normalize();
      const out = b.vel.length() * 0.32;
      b.vel.multiplyScalar(0.18).addScaledVector(_w, out);
      b.vel.y = Math.abs(b.vel.y) * 0.3 + (height > 0.8 ? 1 : 0.4);
      this.setLastTouch(p, false, 'deflection');
      p.noTouchUntil = this.time + 0.35;
      this.emit({ type: 'kick', power: 0.25, playerId: p.id });
      return;
    }

    if (aerial) {
      this.aerialControl(p, relSpeed, ctrl, height);
      return;
    }

    // Control: el balón se amortigua; la calidad del primer toque depende del atributo (peor con el césped mojado o nevado)
    const err = relSpeed * (1 - ctrl) * 0.22 * (this.weather === 'rain' ? 1.3 : this.weather === 'snow' ? 1.2 : 1);
    const ang = this.rng.next() * Math.PI * 2;
    b.vel.set(p.vel.x * 0.85 + Math.cos(ang) * err, Math.min(b.vel.y, 0) * 0.2, p.vel.z * 0.85 + Math.sin(ang) * err);
    // primer toque orientado (RB + stick derecho antes de recibir): el control sale hacia ese lado
    if (p.firstTouchUntil > this.time) {
      b.vel.set(p.firstTouchDir.x * 5.5 + p.vel.x * 0.4, 0, p.firstTouchDir.z * 5.5 + p.vel.z * 0.4);
      p.firstTouchUntil = 0;
    }
    this.owner = p;
    this.debug.controls++;
    this.setLastTouch(p, false, 'control');
    if (this.intendedReceiver && this.intendedReceiver.team !== p.team) this.intendedReceiver = null;
    this.emit({ type: 'touch', power: Math.min(1, relSpeed / 18), playerId: p.id, team: p.team });
    if (relSpeed > 5 && p.action.kind === 'none') p.startAction('trap', 'trap', 0.35);
    // El humano pasa a controlar a quien recibe
    if (team.human && team.controlled !== p && !p.isGK) team.controlled = p;
  }

  /**
   * Control de un balón aéreo con el pecho (por encima de la cintura) o el muslo: el balón se amortigua y cae
   * delante del jugador. La calidad depende del control y de lo fuerte que llegue.
   */
  private aerialControl(p: Player, relSpeed: number, ctrl: number, height: number) {
    const b = this.ball;
    const team = this.teams[p.team];
    const chest = height > 1.05;
    const f = p.forward(_w);
    // dirección del amortiguado: hacia delante y en el sentido de la carrera; el error crece con la velocidad
    const err = relSpeed * (1 - ctrl) * 0.16;
    const ang = this.rng.next() * Math.PI * 2;
    const out = 0.45 + Math.min(1, Math.hypot(p.vel.x, p.vel.z) * 0.12);
    // el pecho lo amortigua hacia abajo; el muslo lo levanta apenas
    b.vel.set(f.x * out + p.vel.x * 0.7 + Math.cos(ang) * err, chest ? -0.4 : 0.6, f.z * out + p.vel.z * 0.7 + Math.sin(ang) * err);
    // control orientado (RB + stick derecho antes de recibir): el balón cae hacia ese lado
    if (p.firstTouchUntil > this.time) {
      b.vel.x = p.firstTouchDir.x * 2.6 + p.vel.x * 0.4;
      b.vel.z = p.firstTouchDir.z * 2.6 + p.vel.z * 0.4;
      p.firstTouchUntil = 0;
    }
    b.spin.set(0, 0, 0);
    this.owner = p;
    this.debug.controls++;
    this.setLastTouch(p, false, 'control');
    if (this.intendedReceiver && this.intendedReceiver.team !== p.team) this.intendedReceiver = null;
    this.emit({ type: 'touch', power: Math.min(1, relSpeed / 18), playerId: p.id, team: p.team, kind: chest ? 'chest' : 'thigh' });
    if (p.action.kind === 'none' || p.action.kind === 'trap') {
      p.startAction('trap', 'trap', chest ? 0.55 : 0.45);
      p.action.variant = chest ? 1 : 2;
    }
    if (team.human && team.controlled !== p && !p.isGK) team.controlled = p;
  }

  /** Volea, tijera o chilena: el jugador se prepara y el pie golpea cuando el balón pasa por su alcance. */
  private requestAerial(p: Player, req: KickRequest): boolean {
    const kind = req.aerial!;
    const b = this.ball;
    if (b.held || (this.owner && this.owner !== p) || this.gkHolding) return false;
    if (dist2D(p.pos, b.pos) > 6) return false;
    const tm = AERIAL_TIMING[kind];
    p.startAction('kick', kind, tm.duration, tm.contact, { kick: req, done: false });
    // orientación: la volea mira al objetivo; la tijera, de lado; la chilena, de espaldas
    const ga = Math.atan2(req.velocity.x, req.velocity.z);
    const fa = kind === 'bicycle' ? ga + Math.PI : kind === 'scissor' ? ga - 1.05 : ga;
    p.action.dir.set(Math.sin(fa), 0, Math.cos(fa));
    p.anim.foot = 1;
    // anticipa el giro para que el pie llegue bien colocado
    p.facing = approachAngleRad(p.facing, fa, kind === 'volley' ? 0.6 : 1.2);
    return true;
  }

  private isBackPass(gk: Player) {
    const lt = this.lastTouch;
    return !!lt && lt.team === gk.team && lt.player !== gk && lt.deliberate && lt.kind !== 'header' && lt.kind !== 'throwin';
  }

  gkCatch(gk: Player) {
    this.owner = null;
    this.gkHolding = gk;
    this.ball.held = true;
    this.ball.vel.set(0, 0, 0);
    this.ball.spin.set(0, 0, 0);
    this.setLastTouch(gk, false, 'control');
    this.offsideSet.clear();
    this.offsideTeam = -1;
    if (gk.action.kind === 'none') gk.startAction('hold', 'gk_catch', 0.5);
    this.emit({ type: 'catch', team: gk.team, playerId: gk.id });
    gk.nextDecisionAt = this.time + 1.2 + this.rng.next() * 0.8;
    this.registerSave(gk);
    const team = this.teams[gk.team];
    if (team.human) team.controlled = gk;
    // Los rivales se alejan del arquero
  }

  private parry(gk: Player) {
    const b = this.ball;
    const away = -gk.team === 0 ? 1 : 1;
    void away;
    const team = this.teams[gk.team];
    // Despeje hacia fuera del arco y hacia el costado
    const outX = team.attackDir;
    const side = b.pos.z >= gk.pos.z ? 1 : -1;
    const sp = b.speed * 0.38;
    b.vel.set(outX * sp * 0.6, 1.5 + this.rng.next() * 2.5, side * sp * 0.8);
    this.setLastTouch(gk, false, 'deflection');
    gk.noTouchUntil = this.time + 0.6;
    this.emit({ type: 'save', team: gk.team, playerId: gk.id });
    this.registerSave(gk);
  }

  private registerSave(gk: Player) {
    if (this.lastShot && this.lastShot.team !== gk.team && this.time - this.lastShot.time < 3) {
      this.teams[gk.team].stats.saves++;
      gk.ps.saves++;
      this.debug.saves++;
      this.emit({ type: 'save', team: gk.team, playerId: gk.id, kind: 'shot' });
      this.lastShot = null;
    }
  }

  setLastTouch(p: Player, deliberate: boolean, kind: LastTouch['kind']) {
    this.lastTouch = { team: p.team as 0 | 1, player: p, time: this.time, deliberate, kind };
    p.lastTouchAt = this.time;
  }

  /** Atajadas activas del arquero (mientras se estira o está de pie en el arco). */
  private gkSaves() {
    const b = this.ball;
    if (b.held || this.owner) return;
    for (const t of this.teams) {
      const gk = t.goalkeeper;
      if (!gk || gk.noTouchUntil > this.time) continue;
      const k = gk.action.kind;
      if (k !== 'dive' && k !== 'none' && k !== 'hold') continue;
      if (!isInPenaltyArea(gk.pos, -t.attackDir)) continue;
      // Zona de alcance: segmento desde el cuerpo hacia la mano (estirada o vertical)
      let ax = gk.pos.x;
      let az = gk.pos.z;
      let ay = 0.2;
      let bx = gk.pos.x;
      let bz = gk.pos.z;
      let by = 2.35;
      let radius = 0.42;
      if (k === 'dive') {
        const d = gk.action.dir;
        const lift = d.y; // altura de la estirada (m) codificada en dir.y
        ax = gk.pos.x; az = gk.pos.z; ay = 0.3 + lift * 0.4;
        const hl = Math.hypot(d.x, d.z) || 1;
        bx = gk.pos.x + (d.x / hl) * 1.1; bz = gk.pos.z + (d.z / hl) * 1.1; by = 0.4 + lift;
        radius = 0.4;
        // la estirada solo es eficaz en su primera parte
        if (gk.action.time > 0.75) continue;
      }
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const apx = b.pos.x - ax, apy = b.pos.y - ay, apz = b.pos.z - az;
      const tt = clamp((apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
      const cx = ax + abx * tt - b.pos.x, cy = ay + aby * tt - b.pos.y, cz = az + abz * tt - b.pos.z;
      const dd = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (dd < radius + BALL_RADIUS) {
        if (this.offsideTeam === gk.team && this.offsideSet.has(gk.id)) continue;
        this.offsideSet.clear();
        this.offsideTeam = -1;
        if (this.isBackPass(gk)) continue; // no puede usar las manos: lo resuelve el control con el pie
        const rel = b.speed;
        const catchLimit = 13 + gk.data.attrs.goalkeeping * 0.12 - (k === 'dive' ? 6 : 0);
        if (rel < catchLimit && Math.abs(b.pos.y - 1.1) < 0.9) this.gkCatch(gk);
        else this.parry(gk);
        return;
      }
    }
  }

  /** Solicita un golpeo con animación previa. Devuelve false si no es posible. */
  requestKick(p: Player, req: KickRequest): boolean {
    if (p.sentOff || (p.busy && !(p.action.kind === 'trap'))) return false;
    if (req.aerial) return this.requestAerial(p, req);
    const header = req.kind === 'header';
    const handsKick = req.kind === 'throwin' || req.kind === 'gkthrow' || req.kind === 'punt';
    let runup = 0;
    const restartTaker = this.phase !== 'play' && this.restart?.taker === p;
    if (!header && !handsKick) {
      const d = dist2D(p.pos, this.ball.pos);
      if (restartTaker && d < 3.5) runup = Math.max(0, d - 0.75) / 2.4; // carrera previa en balón parado
      // en conducción (también a toda velocidad) el balón va algo adelantado: se puede golpear igual
      else if (d > (this.owner === p ? 2.3 : 1.3) || this.ball.pos.y > 1.2) return false;
    }
    const strong = req.kind === 'shoot' || req.kind === 'clear' || req.kind === 'penalty';
    const anim = header ? 'header'
      : req.kind === 'throwin' ? 'throwin'
        : req.kind === 'gkthrow' ? 'gk_throw'
          : req.kind === 'punt' ? 'gk_kick'
            : strong || req.kind === 'finesse' || req.kind === 'chip' ? 'shoot'
              : req.kind === 'lob' || req.kind === 'cross' ? 'lob' : 'pass';
    // Los tiros tienen un armado algo más largo (permite el doble toque para tiro raso);
    // el tiro potente tarda más en armarse y es más vulnerable a una entrada.
    const isShot = req.kind === 'shoot' || req.kind === 'finesse' || req.kind === 'chip';
    const powerShot = !!req.style?.power;
    const duration = header ? 0.6 : handsKick ? 0.7 : isShot ? 0.58 + req.power * 0.1 + (powerShot ? 0.15 : 0) : strong ? 0.5 + req.power * 0.1 : 0.42;
    const contact = header ? 0.22 : handsKick ? 0.38 : isShot ? 0.26 + req.power * 0.05 + (powerShot ? 0.14 : 0) : strong ? 0.2 + req.power * 0.05 : 0.15;
    p.startAction(header ? 'header' : 'kick', anim as any, duration + runup, contact + runup, { kick: req, done: false });
    p.action.dir.set(req.velocity.x, 0, req.velocity.z).normalize();
    // pie de golpeo: el más cercano al lado del balón
    const f = p.forward(_v);
    const side = (this.ball.pos.x - p.pos.x) * f.z - (this.ball.pos.z - p.pos.z) * f.x;
    p.anim.foot = side >= 0 ? -1 : 1;
    return true;
  }

  /** Ejecuta acciones en su instante de contacto: golpeos, entradas, barridas. */
  private processActions(dt: number) {
    for (const p of this.active) {
      const a = p.action;
      if (a.kind === 'kick' && !a.done && a.kick?.aerial) {
        // remate acrobático: el pie golpea cuando el balón pasa por su alcance dentro de la ventana
        const tm = AERIAL_TIMING[a.kick.aerial];
        if (a.time >= a.contactAt - tm.window && p.noTouchUntil <= this.time && !this.ball.held && aerialInReach(a.kick.aerial, p, this.ball.pos)) {
          a.done = true;
          this.tryKickContact(p, a.kick);
        } else if (a.time > a.contactAt + tm.window) {
          a.done = true; // no llegó: remate al aire
        }
      } else if (a.kind === 'kick' && !a.done && a.time >= a.contactAt) {
        a.done = true;
        this.tryKickContact(p, a.kick!);
      } else if (a.kind === 'header' && !a.done && a.time >= 0.12 && a.time <= 0.45) {
        const headY = p.data.height * 0.93 + Math.sin(clamp(a.time / 0.5, 0, 1) * Math.PI) * 0.45;
        const d = Math.hypot(this.ball.pos.x - p.pos.x, this.ball.pos.z - p.pos.z, (this.ball.pos.y - headY) * 0.8);
        if (d < 0.8 && p.noTouchUntil <= this.time) {
          a.done = true;
          this.tryKickContact(p, a.kick!);
        }
      } else if (a.kind === 'tackle' && !a.done && a.time >= a.contactAt) {
        a.done = true;
        this.resolveTackle(p, false);
      } else if (a.kind === 'slide' && !a.done && a.time >= 0.08 && a.time <= 0.65) {
        this.resolveTackle(p, true);
      } else if (a.kind === 'skill') {
        this.updateSkill(p);
      }
    }
    void dt;
  }

  private tryKickContact(p: Player, req: KickRequest) {
    const b = this.ball;
    const handsKick = req.kind === 'throwin' || req.kind === 'gkthrow' || req.kind === 'punt';
    if (handsKick) {
      if (!b.held) return;
      b.held = false;
      this.gkHolding = null;
      const f = p.forward(_v);
      if (req.kind === 'throwin') b.pos.set(p.pos.x + f.x * 0.2, 2.1, p.pos.z + f.z * 0.2);
      else if (req.kind === 'gkthrow') b.pos.set(p.pos.x + f.x * 0.5, 1.7, p.pos.z + f.z * 0.5);
      else b.pos.set(p.pos.x + f.x * 0.6, 0.7, p.pos.z + f.z * 0.6);
    } else if (req.kind !== 'header' && !req.aerial) {
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (d > (this.owner === p ? 2.3 : 1.35) || b.pos.y > 1.25) return; // golpeo al aire
    }
    if (this.offsideTeam === p.team && this.offsideSet.has(p.id)) {
      this.callOffside(p);
      return;
    }
    this.executeKick(p, req);
  }

  /** Aplica la velocidad final del golpeo con el error de ejecución correspondiente. */
  private executeKick(p: Player, req: KickRequest) {
    const b = this.ball;
    const a = p.data.attrs;
    const v = req.velocity.clone();
    if (req.aerial && req.aimAt) {
      // remate aéreo: se apunta desde donde está el balón al golpearlo, a la altura pedida
      aerialShotVelocity(b.pos, req.aimAt, Math.hypot(v.x, v.z), v);
    } else if (req.aimAt) {
      // reapuntar desde donde está ahora el balón, conservando la rapidez horizontal y la vertical
      const h = Math.hypot(v.x, v.z);
      const dx = req.aimAt.x - b.pos.x;
      const dz = req.aimAt.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        v.x = (dx / d) * h;
        v.z = (dz / d) * h;
      }
    }
    const skill = (req.kind === 'shoot' || req.kind === 'finesse' || req.kind === 'penalty' || req.kind === 'chip') ? a.shooting
      : req.kind === 'header' ? (a.shooting + a.control) / 2
        : req.kind === 'gkthrow' || req.kind === 'punt' ? Math.max(a.passing, a.goalkeeping * 0.8)
          : a.passing;
    const q = 1.25 - skill / 100; // 0.28 .. 0.95
    // Presión: rivales cerca empeoran la ejecución
    let pressure = 0;
    for (const o of this.teams[p.team === 0 ? 1 : 0].active) {
      const d = dist2D(o.pos, p.pos);
      if (d < 2.5) pressure += (2.5 - d) / 2.5;
    }
    // Balón mal colocado (detrás o al lado) también empeora el golpeo
    const f = p.forward(_w);
    const toBall = Math.atan2(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
    const badAngle = Math.abs(Math.atan2(Math.sin(toBall - p.facing), Math.cos(toBall - p.facing))) > 1.4 ? 1.5 : 1;
    void f;
    const scale = req.errorScale * (1 + pressure * 0.35) * (req.aerial ? AERIAL_ERROR[req.aerial] : badAngle);
    const baseAng = { pass: 0.035, through: 0.045, lob: 0.05, cross: 0.06, shoot: 0.05, finesse: 0.04, clear: 0.12, header: 0.09, throwin: 0.05, gkthrow: 0.04, punt: 0.08, penalty: 0.03, chip: 0.05 }[req.kind];
    const gauss = () => this.rng.gauss();
    const low = !!req.style?.low;
    applyKickError(v, baseAng * q * scale, 0.06 * q * scale, (req.kind === 'shoot' && !low ? 0.045 : 0.02) * q * scale, gauss);
    if (low) v.y = Math.min(v.y, 0.7); // el tiro raso sigue pegado al césped
    // Sobrepotenciar un disparo lo eleva (como en los juegos de fútbol modernos)
    if (req.kind === 'shoot' && !low && !req.aerial && req.power > 0.8) v.y += (req.power - 0.8) * 4 * (1.2 - a.shooting / 100) * 2;
    b.held = false;
    b.vel.copy(v);
    b.spin.copy(req.spin);
    if (b.pos.y < BALL_RADIUS) b.pos.y = BALL_RADIUS;
    this.owner = null;
    this.gkHolding = null;
    p.noTouchUntil = this.time + (req.kind === 'header' ? 0.35 : 0.28);
    this.debug.kicks++;
    const isPass = ['pass', 'through', 'lob', 'cross', 'throwin', 'gkthrow'].includes(req.kind);
    const isShot = ['shoot', 'finesse', 'penalty', 'chip'].includes(req.kind) || (req.kind === 'header' && !req.targetId);
    this.setLastTouch(p, true, req.kind);
    const team = this.teams[p.team];
    if (isPass) {
      team.stats.passes++;
      p.ps.passes++;
    }
    if (isShot) {
      team.stats.shots++;
      p.ps.shots++;
      const onTarget = this.predictOnTarget(team);
      if (onTarget) {
        team.stats.shotsOnTarget++;
        p.ps.onTarget++;
      }
      this.lastShot = { team: p.team as 0 | 1, time: this.time, onTarget };
      this.shotKickTime = this.time;
    }
    this.intendedReceiver = req.targetId ? this.playersAll.find((x) => x.id === req.targetId) ?? null : null;
    this.emit({ type: 'kick', power: req.power, playerId: p.id, team: p.team, kind: req.kind });
    if (req.aerial) this.emit({ type: 'skill', kind: req.aerial, text: AERIAL_NAMES[req.aerial], playerId: p.id, team: p.team });

    // Fuera de juego: posiciones en el momento del pase (no aplica a saques de banda, de arco ni córners)
    const restartType = this.restart?.type;
    const exempt = req.kind === 'throwin' || restartType === 'goalkick' || restartType === 'corner' || restartType === 'throwin';
    if (this.phase === 'play' || this.phase === 'stoppage' || this.phase === 'kickoff') {
      this.offsideSet = exempt ? new Set() : evaluateOffsidePositions(this, team, p);
      this.offsideTeam = this.offsideSet.size > 0 ? (p.team as 0 | 1) : -1;
    }
    if (this.phase === 'stoppage' || this.phase === 'kickoff') this.resumePlay();
  }

  /** Predice si el balón en vuelo va entre los tres palos. */
  private predictOnTarget(team: Team): boolean {
    const b = this.ball;
    const gx = HALF_LENGTH * team.attackDir;
    if (Math.sign(b.vel.x) !== team.attackDir || Math.abs(b.vel.x) < 0.5) return false;
    const t = (gx - b.pos.x) / b.vel.x;
    if (t < 0 || t > 4) return false;
    const z = b.pos.z + b.vel.z * t;
    const y = b.pos.y + b.vel.y * t - 4.9 * t * t;
    return Math.abs(z) < GOAL_HALF_WIDTH + 0.1 && y < GOAL_HEIGHT + 0.25;
  }

  // ------------------------------------------------------------------
  // Regates
  // ------------------------------------------------------------------

  /**
   * Inicia un regate. `side`: +1 hacia la izquierda del jugador, -1 hacia la derecha.
   * Devuelve false si no es posible (sin balón, ocupado...).
   */
  requestSkill(p: Player, kind: SkillKind, side: 1 | -1): boolean {
    if (this.owner !== p || p.sentOff || (p.busy && p.action.kind !== 'trap')) return false;
    if (dist2D(p.pos, this.ball.pos) > 1.25 || this.ball.pos.y > 0.6) return false;
    const fwd = p.forward(new Vector3());
    const left = new Vector3(fwd.z, 0, -fwd.x);
    const exit = new Vector3();
    let dur = 0.6;
    let key = 0.35;
    switch (kind) {
      case 'stepover': dur = 0.62; key = 0.38; exit.copy(fwd).multiplyScalar(0.55).addScaledVector(left, side * 0.85); break;
      case 'elastico': dur = 0.5; key = 0.27; exit.copy(fwd).multiplyScalar(0.45).addScaledVector(left, side * 0.9); break;
      case 'roulette': dur = 0.8; key = 0.62; exit.copy(fwd).addScaledVector(left, side * 0.25); break;
      case 'rainbow': dur = 0.78; key = 0.34; exit.copy(fwd); break;
      case 'dragback': dur = 0.55; key = 0.3; exit.copy(fwd).multiplyScalar(-1).addScaledVector(left, side * 0.35); break;
      case 'fakeshot': dur = 0.55; key = 0.3; exit.copy(fwd).multiplyScalar(0.35).addScaledVector(left, side * 0.95); break;
    }
    exit.normalize();
    p.startAction('skill', 'skill', dur, key, { variant: SKILL_KINDS.indexOf(kind), done: false, aux: fwd });
    p.action.dir.copy(exit);
    // pie: regate hacia la izquierda del jugador con el pie derecho (animación reflejada al otro lado)
    p.anim.foot = side > 0 ? 1 : -1;
    p.stamina = Math.max(0.25, p.stamina - 0.01);
    this.emit({ type: 'skill', kind, text: SKILL_NAMES[kind], playerId: p.id, team: p.team });
    return true;
  }

  /** Movimiento del regatista y momento clave (cuando el regate supera o no al rival). */
  private updateSkill(p: Player) {
    const a = p.action;
    const kind = SKILL_KINDS[a.variant];
    const fwd = a.aux!;
    const t = a.time;
    const sp = (v: number, dir: Vector3) => p.desiredVel.set(dir.x * v, 0, dir.z * v);
    if (!a.done) {
      // preparación: el jugador frena y hace el gesto
      if (kind === 'roulette') {
        sp(2.6, fwd);
        // giro de 360° sobre el balón
        const n = Math.min(1, t / (a.duration * 0.85));
        p.facing = Math.atan2(fwd.x, fwd.z) + (p.anim.foot > 0 ? 1 : -1) * n * Math.PI * 2;
      } else if (kind === 'dragback') {
        sp(0.6, fwd);
      } else {
        sp(kind === 'rainbow' ? 3.5 : 1.8, fwd);
      }
      if (t >= a.contactAt) {
        a.done = true;
        this.skillKeyMoment(p, kind);
      }
    } else {
      // salida explosiva en la nueva dirección
      const v = kind === 'dragback' ? 4.2 : kind === 'rainbow' ? 7 : kind === 'roulette' ? 5 : 6.4;
      sp(v, a.dir);
      p.sprinting = true;
      p.facing = approachAngleRad(p.facing, Math.atan2(a.dir.x, a.dir.z), 0.35);
    }
  }

  private skillKeyMoment(p: Player, kind: SkillKind) {
    const b = this.ball;
    const fwd = p.action.aux!;
    const ctrl = p.data.attrs.control;
    // toque pesado si el jugador no domina un regate difícil
    const hard = kind === 'elastico' || kind === 'rainbow';
    if (hard && ctrl < 62 && this.rng.next() < (62 - ctrl) / 20) {
      this.owner = null;
      b.vel.set(fwd.x * 4 + (this.rng.next() - 0.5) * 3, 0.5, fwd.z * 4 + (this.rng.next() - 0.5) * 3);
      p.noTouchUntil = this.time + 0.3;
      return;
    }
    if (kind === 'rainbow') {
      // sombrero: el balón pasa por encima del rival
      this.owner = null;
      b.vel.set(fwd.x * 5.2, 5.4, fwd.z * 5.2);
      b.pos.y = Math.max(b.pos.y, 0.35);
      p.noTouchUntil = this.time + 0.35;
      this.setLastTouch(p, false, 'control');
    }
    // ¿supera al rival más cercano que tiene delante?
    let best: Player | null = null;
    let bestD = 3.4;
    for (const o of this.otherTeam(p.team as 0 | 1).active) {
      const dx = o.pos.x - p.pos.x;
      const dz = o.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const front = (dx * fwd.x + dz * fwd.z) / Math.max(d, 0.01);
      if (d < bestD && front > -0.2 && !o.isGK) { best = o; bestD = d; }
    }
    const bonus: Record<SkillKind, number> = { stepover: 0, elastico: 0.08, roulette: 0.1, rainbow: 0.12, dragback: 0.05, fakeshot: 0.1 };
    let beat = false;
    if (best) {
      const chance = clamp(0.42 + (ctrl - best.data.attrs.defending) / 100 + bonus[kind], 0.15, 0.9);
      if (this.rng.next() < chance) {
        best.stunnedUntil = this.time + 0.7;
        if (best.action.kind === 'none') best.vel.multiplyScalar(0.4);
        beat = true;
      }
    }
    // el amago de tiro también engaña al arquero y a quien intenta tapar el disparo
    if (kind === 'fakeshot') {
      for (const o of this.otherTeam(p.team as 0 | 1).active) {
        if (dist2D(o.pos, p.pos) < 16 && this.rng.next() < 0.6) o.stunnedUntil = Math.max(o.stunnedUntil, this.time + 0.45);
      }
    }
    if (beat) this.emit({ type: 'skill', kind: 'beat', text: SKILL_NAMES[kind], playerId: p.id, team: p.team, power: 1 });
  }

  // ------------------------------------------------------------------
  // Entradas y faltas
  // ------------------------------------------------------------------

  requestTackle(p: Player, slide: boolean, reach = 1): boolean {
    if (p.busy || p.sentOff || p.stunnedUntil > this.time) return false;
    const f = p.forward(_v);
    if (slide) {
      p.startAction('slide', 'slide', 1.15, 0.08, { done: false });
      p.action.dir.copy(f);
      // mantener el botón antes de soltar da una barrida más larga (más alcance)
      const s = Math.max(Math.hypot(p.vel.x, p.vel.z) + 2.5, 6.5) * reach;
      p.vel.set(f.x * Math.min(s, 9 * reach), 0, f.z * Math.min(s, 9 * reach));
    } else {
      p.startAction('tackle', 'tackle', 0.5, 0.17, { done: false });
      p.action.dir.copy(f);
    }
    this.emit({ type: 'tackle', playerId: p.id });
    return true;
  }

  /**
   * Carga con el hombro (pulsar presionar repetidamente corriendo al lado del rival): si el defensor
   * gana el forcejeo (velocidad y defensa contra control), el balón queda suelto; si no, se desequilibra.
   */
  shoulderChallenge(p: Player, carrier: Player): boolean {
    if (p.busy || this.owner !== carrier || dist2D(p.pos, carrier.pos) > 1.6) return false;
    if (p.stunnedUntil > this.time) return false;
    const att = p.data.attrs.defending / 100 + Math.hypot(p.vel.x, p.vel.z) / 20;
    const def = carrier.data.attrs.control / 100 + (carrier.shielding ? 0.35 : 0) + Math.hypot(carrier.vel.x, carrier.vel.z) / 25;
    const win = this.rng.next() < clamp(0.35 + (att - def) * 0.8, 0.1, 0.75);
    this.emit({ type: 'tackle', playerId: p.id, kind: 'shoulder' });
    if (win) {
      this.owner = null;
      carrier.stunnedUntil = this.time + 0.6;
      carrier.noTouchUntil = this.time + 0.5;
      const b = this.ball;
      b.vel.set(p.vel.x * 0.6 + (carrier.pos.x - p.pos.x) * 1.5, 0, p.vel.z * 0.6 + (carrier.pos.z - p.pos.z) * 1.5);
      this.setLastTouch(p, false, 'tackle');
    } else {
      p.stunnedUntil = this.time + 0.45;
    }
    return win;
  }

  /** El arquero suelta el balón al suelo para jugarlo con el pie (Y / W con el balón en las manos). */
  gkDropBall(gk: Player): boolean {
    if (this.gkHolding !== gk) return false;
    const f = gk.forward(_v);
    this.gkHolding = null;
    this.ball.held = false;
    this.ball.pos.set(gk.pos.x + f.x * 0.6, BALL_RADIUS, gk.pos.z + f.z * 0.6);
    this.ball.vel.set(f.x * 0.8, 0, f.z * 0.8);
    this.owner = gk;
    gk.clearAction();
    return true;
  }

  /**
   * Resuelve una entrada en función de la geometría real: si el pie llega antes al balón,
   * es limpia; si impacta al rival sin tocar el balón, es falta.
   */
  private resolveTackle(p: Player, slide: boolean) {
    const b = this.ball;
    const a = p.action;
    const reachLen = slide ? 0.9 : 0.7;
    const fx = p.pos.x + a.dir.x * reachLen;
    const fz = p.pos.z + a.dir.z * reachLen;
    const ballD = Math.hypot(b.pos.x - fx, b.pos.z - fz);
    const defending = p.data.attrs.defending / 100;
    const carrier = this.owner;
    let ballReach = (slide ? 0.8 : 0.65) + defending * 0.3 - (carrier && carrier.team !== p.team ? (carrier.data.attrs.control / 100) * 0.15 : 0);
    // proteger el balón con el cuerpo (LT / L2): más difícil de robar
    if (carrier && carrier.shielding) ballReach *= 0.55;
    // la ruleta protege el balón con el cuerpo durante el giro
    if (carrier && carrier.action.kind === 'skill' && SKILL_KINDS[carrier.action.variant] === 'roulette' && carrier.action.time < carrier.action.duration * 0.8) ballReach = 0;
    const team = this.teams[p.team];
    if (b.pos.y < 0.6 && ballD < ballReach && !b.held && (!carrier || carrier.team !== p.team)) {
      // Entrada limpia: toca el balón primero
      a.done = true;
      team.stats.tackles++;
      p.ps.tackles++;
      this.debug.tackles++;
      if (this.offsideTeam === p.team && this.offsideSet.has(p.id)) { this.callOffside(p); return; }
      if (this.offsideTeam !== p.team) { this.offsideSet.clear(); this.offsideTeam = -1; }
      if (carrier) {
        carrier.noTouchUntil = this.time + 0.5;
        if (slide && dist2D(carrier.pos, { x: fx, z: fz }) < 0.9) carrier.startAction('fallen', 'fallen', 1.2);
      }
      this.owner = null;
      if (!slide && defending > 0.55 && this.rng.next() < defending * 0.8) {
        // recupera el balón directamente
        b.vel.set(p.vel.x, 0, p.vel.z);
        this.owner = p;
        this.setLastTouch(p, false, 'tackle');
        if (team.human && !p.isGK) team.controlled = p;
      } else {
        const sp = slide ? 6 + this.rng.next() * 3 : 3 + this.rng.next() * 2;
        b.vel.set(a.dir.x * sp + (this.rng.next() - 0.5) * 2, 0.3, a.dir.z * sp + (this.rng.next() - 0.5) * 2);
        this.setLastTouch(p, false, 'tackle');
      }
      p.noTouchUntil = this.time + (slide ? 0.4 : 0.15);
      this.emit({ type: 'kick', power: 0.3, playerId: p.id });
      return;
    }
    // ¿Impacta a un rival?
    for (const o of this.otherTeam(p.team as 0 | 1).active) {
      if (o.action.kind === 'fallen' || o.action.kind === 'getup') continue;
      const d = Math.hypot(o.pos.x - fx, o.pos.z - fz);
      if (d < (slide ? 0.6 : 0.42)) {
        // Solo es falta si el rival estaba disputando/llevando el balón o muy cerca de él
        const involved = this.owner === o || dist2D(o.pos, b.pos) < 3;
        if (!involved && !slide) continue;
        // Una entrada de pie de frente con poco contacto es un choque legal (el portador se tambalea)
        const fromBehind = Math.cos(p.facing - o.facing) > 0.5;
        if (!slide && !fromBehind && d > 0.3) {
          a.done = true;
          return;
        }
        a.done = true;
        this.foul(p, o, slide);
        return;
      }
    }
  }

  /**
   * ¿El balón le da en la mano? Criterios objetivos: llega con algo de fuerza, a la altura del brazo (no del
   * pecho ni de la cabeza), por el costado, y el jugador tiene los brazos separados del cuerpo por el gesto que
   * está haciendo (saltando a cabecear o en barrida). No cuenta para el destinatario de un pase.
   */
  private isHandball(p: Player, relSpeed: number): boolean {
    const b = this.ball;
    const lt = this.lastTouch;
    if (!lt || lt.player === p || relSpeed < 7 || this.intendedReceiver === p) return false;
    const h = b.pos.y / (p.data.height / 1.8);
    if (h < 1.0 || h > 1.6) return false;
    const a = p.action;
    const armsOut = (a.kind === 'header' && a.time > 0.1 && a.time < 0.55) || a.kind === 'slide';
    if (!armsOut) return false;
    // lateral: distancia del balón al eje del cuerpo medida hacia los costados
    const lx = Math.cos(p.facing);
    const lz = -Math.sin(p.facing);
    const side = Math.abs((b.pos.x - p.pos.x) * lx + (b.pos.z - p.pos.z) * lz);
    // al saltar, los brazos suben con el impulso: solo cuenta un balón bien separado del cuerpo, a la altura del brazo levantado
    if (a.kind === 'header') return side > 0.45 && h > 1.3;
    return side > 0.33;
  }

  private callHandball(p: Player) {
    const team = this.teams[p.team];
    const other = this.teams[p.team === 0 ? 1 : 0];
    team.stats.fouls++;
    p.ps.fouls++;
    this.debug.fouls++;
    this.emit({ type: 'handball', team: p.team, playerId: p.id, text: p.data.name, x: p.pos.x, z: p.pos.z });
    this.emit({ type: 'whistle', kind: 'short' });
    this.addedSeconds += 20;
    // amarilla si la mano cortó un tiro
    const stoppedShot = !!this.lastShot && this.lastShot.team !== p.team && this.time - this.lastShot.time < 1.5;
    if (stoppedShot) {
      this.referee.signal('card', this.time, p.pos, p.pos, 3.4, p.yellowCards >= 1 ? 'red' : 'yellow');
      this.restartHoldUntil = this.time + 3.6;
      this.giveCard(p, 'yellow');
    }
    this.ball.vel.multiplyScalar(0.2);
    this.owner = null;
    if (isInPenaltyArea(p.pos, -team.attackDir)) {
      this.addedSeconds += 30;
      this.stopPlay('penalty', other.index as 0 | 1, new Vector3(other.attackGoal.x - other.attackDir * 11, BALL_RADIUS, 0));
    } else {
      const spot = new Vector3(clamp(p.pos.x, -HALF_LENGTH + 1, HALF_LENGTH - 1), BALL_RADIUS, clamp(p.pos.z, -HALF_WIDTH + 1, HALF_WIDTH - 1));
      this.stopPlay('freekick', other.index as 0 | 1, spot);
    }
  }

  /** Comete falta `offender` sobre `victim`. Determina sanción con datos objetivos. */
  private foul(offender: Player, victim: Player, slide: boolean) {
    const vTeam = this.teams[victim.team];
    const oTeam = this.teams[offender.team];
    oTeam.stats.fouls++;
    offender.ps.fouls++;
    this.debug.fouls++;
    victim.startAction('fallen', 'fallen', 1.4);
    // Gravedad: por detrás, barrida a velocidad, lejos del balón
    const fromBehind = Math.cos(offender.facing - victim.facing) > 0.5;
    const speed = Math.hypot(offender.vel.x, offender.vel.z);
    const ballDist = dist2D(victim.pos, this.ball.pos);
    let severity = (slide ? 0.35 : 0.1) + (fromBehind ? 0.3 : 0) + clamp((speed - 5) / 10, 0, 0.25) + clamp((ballDist - 1.5) / 4, 0, 0.3);
    // Ocasión manifiesta de gol: el rival iba solo hacia el arco y el infractor era el último defensor
    const goalDist = Math.abs(vTeam.attackGoal.x - victim.pos.x);
    const lastMan = oTeam.active.filter((d) => !d.isGK && oTeam.u(d.pos) < oTeam.u(victim.pos)).length === 0;
    const centralChance = goalDist < 30 && Math.abs(victim.pos.z) < 20 && this.owner === victim;
    const inBox = isInPenaltyArea(victim.pos, -oTeam.attackDir);
    let card: 'yellow' | 'red' | null = null;
    if (lastMan && centralChance && !inBox && goalDist < 22) card = 'red';
    else if (severity >= 1.05) card = 'red';
    else if (severity >= 0.7 || (lastMan && centralChance)) card = 'yellow';
    // Aviso verbal: falta algo dura sin tarjeta; si ya tenía un aviso, la reiteración se castiga con amarilla
    let warn = false;
    if (!card && severity >= 0.4) {
      if (offender.warnings >= 1) card = 'yellow';
      else warn = true;
    }
    this.emit({ type: 'foul', team: offender.team, playerId: offender.id, x: victim.pos.x, z: victim.pos.z });
    // Ley de la ventaja: fuera del área, sin roja, y con el balón para un compañero libre en campo prometedor
    if (!inBox && card !== 'red' && this.advantageLikely(victim)) {
      this.advantage = {
        team: victim.team as 0 | 1, until: this.time + 2.5, offender, card, warn,
        spot: new Vector3(clamp(victim.pos.x, -HALF_LENGTH + 1, HALF_LENGTH - 1), BALL_RADIUS, clamp(victim.pos.z, -HALF_WIDTH + 1, HALF_WIDTH - 1)),
      };
      const g = vTeam.attackGoal;
      this.referee.signal('point', this.time, this.referee.pos.clone(), new Vector3(this.referee.pos.x + Math.sign(g.x - this.referee.pos.x) * 10, 0, this.referee.pos.z), 1.2);
      this.emit({ type: 'advantage', team: victim.team, playerId: victim.id, x: victim.pos.x, z: victim.pos.z });
      return;
    }
    this.emit({ type: 'whistle', kind: 'short' });
    this.addedSeconds += 20;
    const refAt = offender.pos.clone();
    if (card) {
      this.referee.signal('card', this.time, refAt, victim.pos, 3.4, card === 'yellow' && offender.yellowCards >= 1 ? 'red' : card);
      this.restartHoldUntil = this.time + 3.6;
      this.giveCard(offender, card);
    } else if (warn) {
      offender.warnings++;
      this.emit({ type: 'warning', team: offender.team, playerId: offender.id, text: offender.data.name });
      this.referee.signal('warn', this.time, refAt, victim.pos, 2.4);
      this.restartHoldUntil = this.time + 2.2;
    } else {
      // señala la dirección del tiro libre (hacia el arco que ataca el equipo que la recibe)
      const g = vTeam.attackGoal;
      this.referee.signal('point', this.time, refAt, new Vector3(this.referee.pos.x + Math.sign(g.x - this.referee.pos.x) * 10, 0, this.referee.pos.z), 1.4);
    }
    void severity;
    severity = 0;
    if (inBox) {
      this.addedSeconds += 30;
      this.stopPlay('penalty', victim.team as 0 | 1, new Vector3(vTeam.attackGoal.x - vTeam.attackDir * 11, BALL_RADIUS, 0));
    } else {
      const spot = new Vector3(clamp(victim.pos.x, -HALF_LENGTH + 1, HALF_LENGTH - 1), BALL_RADIUS, clamp(victim.pos.z, -HALF_WIDTH + 1, HALF_WIDTH - 1));
      this.stopPlay('freekick', victim.team as 0 | 1, spot);
    }
  }

  /** ¿Conviene dejar seguir? El balón queda para un compañero de la víctima, libre y en campo prometedor. */
  private advantageLikely(victim: Player): boolean {
    const team = this.teams[victim.team];
    const b = this.ball.pos;
    if (team.u(b) < -15) return false; // en su propio campo, mejor el tiro libre
    let mate = Infinity;
    for (const q of team.active) if (q !== victim && !q.isGK && q.action.kind !== 'fallen') mate = Math.min(mate, dist2D(q.pos, b));
    let opp = Infinity;
    for (const o of this.otherTeam(victim.team as 0 | 1).active) if (o.action.kind !== 'fallen' && o.action.kind !== 'slide') opp = Math.min(opp, dist2D(o.pos, b));
    // el propio infractor suele estar encima del balón: no cuenta si acaba de hacer la entrada
    return mate < 7 && mate + 2 < opp;
  }

  /** Sigue la ventaja: se vuelve atrás si el equipo la pierde enseguida; si no, amonesta sin parar el juego. */
  private updateAdvantage() {
    const a = this.advantage;
    if (!a) return;
    if (this.phase !== 'play') {
      this.advantage = null;
      this.applyAdvantageSanction(a);
      return;
    }
    const lostIt = (this.owner && this.owner.team !== a.team) || (this.gkHolding && this.gkHolding.team !== a.team);
    if (lostIt) {
      // no hubo ventaja: falta en el lugar original
      this.advantage = null;
      this.emit({ type: 'whistle', kind: 'short' });
      this.addedSeconds += 20;
      this.applyAdvantageSanction(a);
      this.stopPlay('freekick', a.team, a.spot);
      return;
    }
    if (this.time >= a.until) {
      this.advantage = null;
      this.applyAdvantageSanction(a);
    }
  }

  private applyAdvantageSanction(a: NonNullable<Match['advantage']>) {
    if (a.card && !a.offender.sentOff) this.giveCard(a.offender, a.card);
    else if (a.warn) {
      a.offender.warnings++;
      this.emit({ type: 'warning', team: a.offender.team, playerId: a.offender.id, text: a.offender.data.name });
    }
  }

  giveCard(p: Player, card: 'yellow' | 'red') {
    const team = this.teams[p.team];
    if (card === 'yellow') {
      p.yellowCards++;
      team.stats.yellow++;
      this.addedSeconds += 25;
      this.emit({ type: 'card', kind: p.yellowCards >= 2 ? 'second' : 'yellow', team: p.team, playerId: p.id, text: p.data.name });
      if (p.yellowCards >= 2) card = 'red';
    }
    if (card === 'red') {
      if (p.yellowCards < 2) this.emit({ type: 'card', kind: 'red', team: p.team, playerId: p.id, text: p.data.name });
      team.stats.red++;
      p.sentOff = true;
      p.ps.to = this.minute;
      p.pos.set(p.pos.x, 0, Math.sign(p.pos.z || 1) * (HALF_WIDTH + 3));
      if (team.controlled === p) team.controlled = null;
      if (this.owner === p) this.owner = null;
      // Si expulsan al arquero, otro jugador ocupa su puesto
      if (p.isGK) {
        const repl = team.active.filter((x) => !x.isGK).sort((a, b) => b.data.attrs.goalkeeping - a.data.attrs.goalkeeping)[0];
        if (repl) {
          const s = repl.slot;
          repl.slot = p.slot;
          p.slot = s;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Cambios (suplentes)
  // ------------------------------------------------------------------

  /** ¿Se puede hacer este cambio? Devuelve el motivo si no. */
  subError(team: 0 | 1, outId: string, inId: string): string | null {
    const t = this.teams[team];
    if (this.config.training) return 'No hay cambios en el entrenamiento';
    if (this.finished || this.phase === 'shootout') return 'El partido ya terminó';
    const pending = this.pendingSubs.filter((s) => s.team === team);
    if (t.subsUsed + pending.length >= MAX_SUBS && !pending.some((s) => s.outId === outId)) return `Ya hiciste los ${MAX_SUBS} cambios`;
    const out = t.players.find((p) => p.id === outId);
    if (!out) return 'Ese jugador no está en el campo';
    if (out.sentOff) return 'No se puede sustituir a un expulsado';
    if (!t.bench.some((p) => p.id === inId)) return 'Ese suplente no está disponible';
    return null;
  }

  /** Pide un cambio: se hace en la próxima interrupción (o ya, si el juego está parado). */
  requestSub(team: 0 | 1, outId: string, inId: string): string | null {
    const err = this.subError(team, outId, inId);
    if (err) return err;
    // un mismo jugador no puede estar en dos cambios pendientes
    for (let i = this.pendingSubs.length - 1; i >= 0; i--) {
      const s = this.pendingSubs[i];
      if (s.team === team && (s.outId === outId || s.inId === inId)) this.pendingSubs.splice(i, 1);
    }
    this.pendingSubs.push({ team, outId, inId });
    return null;
  }

  cancelSub(team: 0 | 1, outId: string) {
    const i = this.pendingSubs.findIndex((s) => s.team === team && s.outId === outId);
    if (i >= 0) this.pendingSubs.splice(i, 1);
  }

  private applyPendingSubs() {
    const list = this.pendingSubs.splice(0);
    for (const s of list) {
      const t = this.teams[s.team];
      const out = t.players.find((p) => p.id === s.outId);
      const inn = t.bench.find((p) => p.id === s.inId);
      if (out && inn && !out.sentOff && t.subsUsed < MAX_SUBS) this.substitute(t, out, inn);
    }
  }

  /** Cambio inmediato: el suplente ocupa el puesto (y la posición) del que sale. */
  substitute(t: Team, out: Player, inn: Player, emit = true) {
    const idx = t.players.indexOf(out);
    if (idx < 0) return;
    inn.slot = out.slot;
    inn.slotIndex = out.slotIndex;
    inn.pos.copy(out.pos);
    inn.vel.set(0, 0, 0);
    inn.facing = out.facing;
    inn.stamina = 1;
    inn.ps.from = this.minute;
    out.ps.to = this.minute;
    inn.clearAction();
    inn.frozen = out.frozen;
    t.players[idx] = inn;
    t.bench.splice(t.bench.indexOf(inn), 1);
    t.subbedOff.push(out);
    t.subsUsed++;
    const ai = this.playersAll.indexOf(out);
    if (ai >= 0) this.playersAll[ai] = inn;
    if (t.controlled === out) t.controlled = inn;
    if (this.owner === out) this.owner = inn;
    if (this.gkHolding === out) this.gkHolding = inn;
    if (this.restart?.taker === out) this.restart.taker = inn;
    if (this.intendedReceiver === out) this.intendedReceiver = null;
    for (const p of this.playersAll) if (p.markTarget === out) p.markTarget = null;
    this.rosterVersion++;
    if (emit) this.emit({ type: 'sub', team: t.index, playerId: inn.id, text: `${out.data.name} ⇄ ${inn.data.name}`, kind: out.id });
  }

  /** La IA (y el humano con cambios automáticos) cambia a los más cansados desde el minuto 58. */
  private aiSubstitutions() {
    if (this.minute < 58) return;
    for (const t of this.teams) {
      if (t.human && !this.autoSubs[t.index]) continue;
      if (t.subsUsed >= MAX_SUBS || !t.bench.length) continue;
      if (this.minute - this.aiSubMinute[t.index] < 7) continue;
      if (this.pendingSubs.some((s) => s.team === t.index)) continue;
      const tired = t.active.filter((p) => !p.isGK && p !== t.controlled && p !== this.restart?.taker && p.stamina < 0.66).sort((a, b) => a.stamina - b.stamina)[0];
      if (!tired) continue;
      const inn = t.bench.find((p) => p.data.position === tired.position) ?? t.bench.find((p) => p.data.position !== 'GK');
      if (!inn) continue;
      this.aiSubMinute[t.index] = this.minute;
      this.substitute(t, tired, inn);
    }
  }

  private callOffside(p: Player) {
    const team = this.teams[p.team];
    team.stats.offsides++;
    this.debug.offsides++;
    this.emit({ type: 'offside', team: p.team, playerId: p.id, x: p.pos.x, z: p.pos.z });
    const spot = new Vector3(p.pos.x, BALL_RADIUS, clamp(p.pos.z, -HALF_WIDTH + 1, HALF_WIDTH - 1));
    spot.x = clamp(spot.x, -HALF_LENGTH + 1, HALF_LENGTH - 1);
    this.offsideSet.clear();
    this.offsideTeam = -1;
    this.stopPlay('indirect', (p.team === 0 ? 1 : 0) as 0 | 1, spot);
  }

  // ------------------------------------------------------------------
  // Balón fuera, goles y reanudaciones
  // ------------------------------------------------------------------

  private checkBallOut() {
    const b = this.ball;
    const p = b.pos;
    // Gol: el balón cruza por completo la línea entre los postes y bajo el travesaño
    if (Math.abs(p.x) > HALF_LENGTH + BALL_RADIUS && Math.abs(p.z) < GOAL_HALF_WIDTH && p.y < GOAL_HEIGHT) {
      const endSide = Math.sign(p.x);
      const scoringTeam = this.teams[0].attackDir === endSide ? 0 : 1;
      this.goalScored(scoringTeam as 0 | 1);
      return;
    }
    if (Math.abs(p.z) > HALF_WIDTH + BALL_RADIUS) {
      const team = this.lastTouch ? (this.lastTouch.team === 0 ? 1 : 0) : 0;
      this.debug.outs++;
      this.emit({ type: 'out', kind: 'throwin' });
      this.stopPlay('throwin', team as 0 | 1, new Vector3(clamp(p.x, -HALF_LENGTH + 0.5, HALF_LENGTH - 0.5), BALL_RADIUS, Math.sign(p.z) * HALF_WIDTH));
      return;
    }
    if (Math.abs(p.x) > HALF_LENGTH + BALL_RADIUS) {
      const endSide = Math.sign(p.x);
      const defending = this.teams[0].attackDir === endSide ? 1 : 0; // equipo que defiende ese arco
      const touchTeam = this.lastTouch ? this.lastTouch.team : defending;
      this.debug.outs++;
      if (this.lastShot && this.time - this.lastShot.time < 3 && Math.abs(p.z) < GOAL_HALF_WIDTH + 4) this.emit({ type: 'nearMiss' });
      if (touchTeam === defending) {
        const attacking = defending === 0 ? 1 : 0;
        this.teams[attacking].stats.corners++;
        this.emit({ type: 'out', kind: 'corner' });
        this.stopPlay('corner', attacking as 0 | 1, new Vector3(endSide * (HALF_LENGTH - 0.4), BALL_RADIUS, Math.sign(p.z || 1) * (HALF_WIDTH - 0.4)));
      } else {
        this.emit({ type: 'out', kind: 'goalkick' });
        this.stopPlay('goalkick', defending as 0 | 1, new Vector3(endSide * (HALF_LENGTH - 5.5), BALL_RADIUS, Math.sign(p.z || 1) * 4));
      }
    }
  }

  private goalScored(team: 0 | 1) {
    const t = this.teams[team];
    const lt = this.lastTouch;
    const ownGoal = !!lt && lt.team !== team;
    const scorer = lt ? lt.player : null;
    t.stats.goals++;
    if (scorer && !ownGoal) {
      scorer.goals++;
      // asistencia: el último pase completado al goleador (hace menos de 12 s)
      const lp = this.lastPass;
      if (lp && lp.to === scorer && lp.from.team === scorer.team && this.time - lp.time < 12) lp.from.ps.assists++;
    }
    this.lastPass = null;
    const minute = Math.min(this.minute, this.half <= 2 ? this.half * 45 + 10 : 125);
    t.scorers.push({ name: (scorer?.data.name ?? '—') + (ownGoal ? ' (p.p.)' : ''), minute });
    this.lastGoal = { team, scorer, minute, ownGoal };
    this.addedSeconds += 40;
    this.owner = null;
    this.emit({ type: 'goal', team, playerId: scorer?.id, text: scorer?.data.name, kind: ownGoal ? 'own' : 'normal' });
    this.emit({ type: 'whistle', kind: 'short' });
    if (this.config.training) {
      this.trainingReset();
      return;
    }
    this.goalTime = this.time;
    this.enterPhase('goal');
    // Celebración
    for (const p of t.active) {
      if (p === scorer) p.startAction('celebrate', 'celebrate', 3.4, 0, { variant: this.rng.int(0, 3) });
    }
    for (const p of this.otherTeam(team).active) {
      if (!p.isGK || this.rng.next() < 0.7) p.startAction('dejected', 'dejected', 3.2, 0, { variant: this.rng.int(0, 1) });
    }
    this.kickoffTeam = team === 0 ? 1 : 0;
  }

  /** Durante celebraciones y descansos los jugadores caminan hacia posiciones razonables. */
  private stepCelebration(dt: number) {
    const scorer = this.lastGoal?.scorer;
    for (const p of this.active) {
      if (p.action.kind === 'celebrate' && scorer === p) {
        // el goleador corre hacia la esquina
        const tx = Math.sign(p.pos.x) * (HALF_LENGTH - 6);
        const tz = Math.sign(p.pos.z || 1) * (HALF_WIDTH - 4);
        _v.set(tx - p.pos.x, 0, tz - p.pos.z);
        const d = _v.length();
        p.sprinting = true;
        p.desiredVel.copy(d > 1 ? _v.multiplyScalar(6 / d) : _v.set(0, 0, 0));
      } else if (this.phase === 'goal' && scorer && p.team === scorer.team && !p.isGK) {
        _v.set(scorer.pos.x - p.pos.x, 0, scorer.pos.z - p.pos.z);
        const d = _v.length();
        p.sprinting = false;
        p.desiredVel.copy(d > 2.2 ? _v.multiplyScalar(5 / d) : _v.set(0, 0, 0));
      } else {
        p.desiredVel.multiplyScalar(0.9);
        p.sprinting = false;
      }
    }
    this.movePlayers(dt);
    if (!this.ball.held) this.ball.step(dt);
  }

  private afterGoal() {
    if (this.halfShouldEnd()) {
      this.endHalf();
      return;
    }
    this.setupRestart('kickoff', this.kickoffTeam, new Vector3(0, BALL_RADIUS, 0), true);
  }

  /** Detiene el juego y prepara una reanudación. */
  stopPlay(type: RestartType, team: 0 | 1, spot: Vector3) {
    if (this.setPieceTraining) {
      this.trainingReset();
      return;
    }
    this.emit({ type: 'whistle', kind: type === 'throwin' || type === 'goalkick' || type === 'corner' ? 'none' : 'short' });
    this.setupRestart(type, team, spot, false);
  }

  setupRestart(type: RestartType, team: 0 | 1, spot: Vector3, immediate: boolean) {
    this.owner = null;
    this.gkHolding = null;
    this.ball.held = false;
    this.intendedReceiver = null;
    if (type !== 'indirect' && type !== 'freekick' && type !== 'penalty') {
      // el fuera de juego no se arrastra a la reanudación
    }
    this.offsideSet.clear();
    this.offsideTeam = -1;
    this.restart = { type, team, spot: spot.clone(), taker: null, stage: immediate ? 'setup' : 'pause', timer: 0, aiDelay: 0.9 + this.rng.next() * 0.8 };
    this.phase = type === 'kickoff' ? 'kickoff' : 'stoppage';
    this.phaseTimer = 0;
    this.emit({ type: 'phase', kind: this.phase, text: type });
    if (immediate) this.doSetup();
  }

  private doSetup() {
    const r = this.restart!;
    r.stage = 'setup';
    r.timer = 0;
    for (const p of this.active) {
      p.clearAction();
      p.vel.set(0, 0, 0);
      p.desiredVel.set(0, 0, 0);
      p.frozen = false;
    }
    this.ball.reset(r.spot.x, r.spot.z);
    r.taker = placeForRestart(this, r);
    if (r.type === 'throwin' && r.taker) {
      this.ball.held = true;
      this.ball.pos.set(r.taker.pos.x, 2.1, r.taker.pos.z);
    }
    if (r.type === 'goalkick' || r.type === 'kickoff') {
      // nada especial
    }
    const team = this.teams[r.team];
    if (team.human && r.taker) team.controlled = r.taker;
    // El equipo humano defensor controla a quien está más cerca del balón
    const other = this.otherTeam(r.team);
    if (other.human) {
      const cand = other.active.filter((p) => !p.isGK).sort((a, b) => dist2D(a.pos, r.spot) - dist2D(b.pos, r.spot))[0];
      other.controlled = r.type === 'penalty' ? other.goalkeeper ?? cand : cand;
    }
    for (const t of this.teams) updateTeamTactics(this, t);
  }

  private stepRestart(dt: number) {
    const r = this.restart!;
    r.timer += dt;
    if (r.stage === 'pause') {
      // Los jugadores frenan tras el silbato
      for (const p of this.active) p.desiredVel.multiplyScalar(0.85);
      this.movePlayers(dt);
      if (!this.ball.held) this.ball.step(dt);
      this.advanceClock(dt);
      if (r.timer > 1.1 && this.time >= this.restartHoldUntil) {
        if (this.halfShouldEnd() && r.type !== 'penalty') { this.endHalf(); return; }
        this.doSetup();
      }
      return;
    }
    if (r.stage === 'setup') {
      if (r.timer > 0.4) {
        r.stage = 'ready';
        r.timer = 0;
        if (r.type === 'kickoff' || r.type === 'penalty') this.emit({ type: 'whistle', kind: 'short' });
      }
      return;
    }
    // ready: el ejecutor decide; el resto se mantiene en sus posiciones de balón parado
    this.advanceClock(dt * (r.type === 'kickoff' ? 0 : 1));
    const taker = r.taker;
    if (!taker || taker.sentOff) {
      this.resumePlay();
      return;
    }
    const team = this.teams[r.team];
    const humanTaker = team.human && team.controlled === taker;
    for (const t of this.teams) {
      const ctrl = this.controllers[t.index];
      if (ctrl && t.human) ctrl.update(this, t, dt);
    }
    if (!humanTaker && !taker.busy && r.timer > r.aiDelay) aiTakeSetPiece(this, taker);
    // Los demás quietos (barreras, posiciones), salvo el ejecutor
    for (const p of this.active) {
      if (p !== taker && !(this.teams[p.team].human && this.teams[p.team].controlled === p && r.type !== 'penalty')) {
        p.desiredVel.set(0, 0, 0);
      }
      if (p === taker && !p.busy) p.desiredVel.set(0, 0, 0);
      if (p === taker && p.action.kind === 'kick' && !p.action.done) this.runUp(p);
    }
    this.processActions(dt);
    this.movePlayers(dt);
    // El balón se mantiene en el punto hasta el golpeo
    if (this.phase === 'stoppage' || this.phase === 'kickoff') {
      if (r.type === 'throwin') {
        this.ball.held = true;
        this.ball.pos.set(taker.pos.x, 2.1, taker.pos.z);
      } else if (!this.ball.held) {
        this.ball.pos.copy(r.spot);
        this.ball.vel.set(0, 0, 0);
      }
    }
  }

  /** Carrera hacia el balón antes de un golpeo a balón parado. */
  private runUp(p: Player) {
    const dx = this.ball.pos.x - p.pos.x;
    const dz = this.ball.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.7) p.desiredVel.set((dx / d) * 2.4, 0, (dz / d) * 2.4);
    else p.desiredVel.set(0, 0, 0);
  }

  private resumePlay() {
    const r = this.restart;
    for (const p of this.active) p.frozen = false;
    this.phase = 'play';
    this.phaseTimer = 0;
    if (r && r.taker) r.taker.noTouchUntil = Math.max(r.taker.noTouchUntil, this.time + 0.45);
    this.emit({ type: 'phase', kind: 'play' });
  }

  // ------------------------------------------------------------------
  // Partes, prórroga, penales
  // ------------------------------------------------------------------

  private endHalf() {
    this.emit({ type: 'whistle', kind: this.half === 2 || this.half === 4 ? 'final' : 'double' });
    const [a, b] = [this.teams[0].stats.goals, this.teams[1].stats.goals];
    if (this.half === 1 || this.half === 3) {
      this.enterPhase('halftime');
      return;
    }
    if (a === b && this.half === 2 && this.config.extraTime) {
      this.enterPhase('halftime');
      return;
    }
    if (a === b && this.config.penalties) {
      this.startShootout();
      return;
    }
    this.finish();
  }

  private startNextHalf() {
    this.half++;
    this.addedSeconds = 0;
    this.announcedAdded = -1;
    this.matchSeconds = this.half === 2 ? 45 * 60 : this.half === 3 ? 90 * 60 : 105 * 60;
    for (const t of this.teams) {
      t.attackDir = (t.attackDir === 1 ? -1 : 1);
      for (const p of t.active) p.stamina = Math.min(1, p.stamina + 0.15);
    }
    const ko = (this.half % 2 === 0 ? (this.firstHalfKickoff === 0 ? 1 : 0) : this.firstHalfKickoff) as 0 | 1;
    this.kickoffTeam = ko;
    this.setupRestart('kickoff', ko, new Vector3(0, BALL_RADIUS, 0), true);
  }

  private finish() {
    this.enterPhase('fulltime');
    this.finished = true;
    this.owner = null;
    const [a, b] = [this.teams[0].stats.goals, this.teams[1].stats.goals];
    for (const t of this.teams) {
      const won = (t.index === 0 && a > b) || (t.index === 1 && b > a) || (this.shootout && this.shootout.winner === t.index);
      for (const p of t.active) {
        if (won) p.startAction('celebrate', 'celebrate', 5, 0, { variant: this.rng.int(0, 3) });
        else if (a !== b || this.shootout) p.startAction('dejected', 'dejected', 5);
      }
    }
  }

  /** Resultado final. winner: 0, 1 o -1 (empate). */
  get result() {
    const a = this.teams[0].stats.goals;
    const b = this.teams[1].stats.goals;
    let winner: 0 | 1 | -1 = a > b ? 0 : b > a ? 1 : -1;
    if (winner === -1 && this.shootout?.done) winner = this.shootout.winner;
    return {
      home: a, away: b, winner,
      penalties: this.shootout ? [this.shootout.kicks[0].filter(Boolean).length, this.shootout.kicks[1].filter(Boolean).length] as [number, number] : null,
    };
  }

  private startShootout() {
    this.enterPhase('shootout');
    this.shootout = { kicks: [[], []], turn: 0, order: [0, 0], stage: 'setup', timer: 0, kicker: null, keeper: null, done: false, winner: -1, lastResult: null };
    // Todos al centro del campo salvo el ejecutor y el arquero
    this.setupShootoutKick();
  }

  private shootoutKickers(team: Team) {
    return team.active.filter((p) => !p.isGK).sort((a, b) => b.data.attrs.shooting - a.data.attrs.shooting).concat(team.active.filter((p) => p.isGK));
  }

  private setupShootoutKick() {
    const s = this.shootout!;
    const kTeam = this.teams[s.turn];
    const gTeam = this.otherTeam(s.turn);
    const order = this.shootoutKickers(kTeam);
    const kicker = order[s.order[s.turn] % order.length];
    const keeper = gTeam.goalkeeper ?? gTeam.active[0];
    s.kicker = kicker;
    s.keeper = keeper;
    s.stage = 'ready';
    s.timer = 0;
    // Todos los penales al mismo arco (x positivo)
    const goalX = HALF_LENGTH;
    for (const t of this.teams) t.attackDir = t.index === s.turn ? 1 : -1;
    this.ball.reset(goalX - 11, 0);
    this.owner = null;
    this.gkHolding = null;
    let i = 0;
    for (const p of this.active) {
      p.clearAction();
      p.vel.set(0, 0, 0);
      p.desiredVel.set(0, 0, 0);
      p.frozen = false;
      if (p === kicker) {
        p.pos.set(goalX - 13.2, 0, -0.6);
        p.facing = Math.PI / 2;
      } else if (p === keeper) {
        p.pos.set(goalX - 0.3, 0, 0);
        p.facing = -Math.PI / 2;
      } else {
        const row = p.team;
        p.pos.set(-2 + (i % 11) * 1.1 - 4, 0, -2 + row * 3);
        p.facing = Math.PI / 2;
        i++;
      }
    }
    if (kTeam.human) kTeam.controlled = kicker;
    if (gTeam.human) gTeam.controlled = keeper;
    this.restart = { type: 'penalty', team: s.turn, spot: this.ball.pos.clone(), taker: kicker, stage: 'ready', timer: 0, aiDelay: 1.2 + this.rng.next() };
    this.emit({ type: 'whistle', kind: 'short' });
  }

  private stepShootout(dt: number) {
    const s = this.shootout!;
    if (s.done) return;
    s.timer += dt;
    const kicker = s.kicker!;
    const kTeam = this.teams[s.turn];
    if (s.stage === 'ready') {
      for (const t of this.teams) {
        const ctrl = this.controllers[t.index];
        if (ctrl && t.human) ctrl.update(this, t, dt);
      }
      if (!(kTeam.human && kTeam.controlled === kicker) && !kicker.busy && s.timer > this.restart!.aiDelay) aiTakeSetPiece(this, kicker);
      if (s.keeper && !this.teams[s.keeper.team].human) updateGoalkeeperAI(this, s.keeper, dt);
      for (const p of this.active) if (p !== kicker && p !== s.keeper) p.desiredVel.set(0, 0, 0);
      if (kicker.action.kind !== 'kick' && !kicker.busy) kicker.desiredVel.set(0, 0, 0);
      if (kicker.action.kind === 'kick' && !kicker.action.done) this.runUp(kicker);
      this.processActions(dt);
      this.movePlayers(dt);
      if (this.lastTouch && this.lastTouch.player === kicker && this.lastTouch.time > this.time - dt * 2 && this.ball.speed > 1) {
        s.stage = 'flight';
        s.timer = 0;
      } else {
        this.ball.pos.copy(this.restart!.spot);
        this.ball.vel.set(0, 0, 0);
      }
      return;
    }
    if (s.stage === 'flight') {
      if (s.keeper && !this.teams[s.keeper.team].human) updateGoalkeeperAI(this, s.keeper, dt);
      else if (s.keeper) {
        const ctrl = this.controllers[s.keeper.team];
        if (ctrl) ctrl.update(this, this.teams[s.keeper.team], dt);
      }
      this.processActions(dt);
      this.movePlayers(dt);
      const ev = this.ball.step(dt);
      if (ev.post) this.emit({ type: 'post' });
      if (ev.net) this.emit({ type: 'net', power: 0.8 });
      this.gkSaves();
      const p = this.ball.pos;
      let result: boolean | null = null;
      if (p.x > HALF_LENGTH + BALL_RADIUS && Math.abs(p.z) < GOAL_HALF_WIDTH && p.y < GOAL_HEIGHT) result = true;
      else if (p.x > HALF_LENGTH + BALL_RADIUS || Math.abs(p.z) > HALF_WIDTH || s.timer > 3.5 || this.gkHolding || (this.ball.vel.x < -0.5 && s.timer > 0.4)) result = false;
      if (result !== null) {
        s.kicks[s.turn].push(result);
        s.lastResult = result;
        this.emit({ type: result ? 'goal' : 'save', team: result ? s.turn : (s.turn === 0 ? 1 : 0), kind: 'shootout', playerId: kicker.id, text: kicker.data.name });
        s.order[s.turn]++;
        s.stage = 'result';
        s.timer = 0;
        if (result) kicker.startAction('celebrate', 'celebrate', 1.8, 0, { variant: 2 });
        else kicker.startAction('dejected', 'dejected', 1.8);
      }
      return;
    }
    if (s.stage === 'result') {
      this.movePlayers(dt);
      if (!this.gkHolding) this.ball.step(dt);
      if (s.timer < 2) return;
      this.gkHolding = null;
      this.ball.held = false;
      // ¿Se decidió?
      const [a, b] = [s.kicks[0].filter(Boolean).length, s.kicks[1].filter(Boolean).length];
      const [na, nb] = [s.kicks[0].length, s.kicks[1].length];
      let winner: 0 | 1 | -1 = -1;
      if (na <= 5 && nb <= 5) {
        const remA = 5 - na;
        const remB = 5 - nb;
        if (a > b + remB) winner = 0;
        else if (b > a + remA) winner = 1;
      }
      if (winner === -1 && na === nb && na >= 5 && a !== b) winner = a > b ? 0 : 1;
      if (winner !== -1) {
        s.done = true;
        s.winner = winner;
        this.emit({ type: 'whistle', kind: 'final' });
        this.finish();
        return;
      }
      s.turn = s.turn === 0 ? 1 : 0;
      this.setupShootoutKick();
    }
  }

  // ------------------------------------------------------------------
  // Entrenamiento
  // ------------------------------------------------------------------

  /** Reinicia una jugada de entrenamiento tras gol o balón fuera. */
  trainingReset() {
    const mode = this.config.training;
    const t = this.teams[0];
    if (mode === 'penalties') {
      this.setupRestart('penalty', 0, new Vector3(HALF_LENGTH * t.attackDir - 11 * t.attackDir, BALL_RADIUS, 0), true);
    } else if (mode === 'freekicks') {
      const x = (HALF_LENGTH - 20 - this.rng.next() * 12) * t.attackDir;
      const z = (this.rng.next() - 0.5) * 30;
      this.setupRestart('freekick', 0, new Vector3(x, BALL_RADIUS, z), true);
    } else {
      this.setupRestart('kickoff', 0, new Vector3(0, BALL_RADIUS, 0), true);
    }
  }

  // ------------------------------------------------------------------
  // Repeticiones
  // ------------------------------------------------------------------

  private recordReplay(dt: number) {
    this.replayAcc += dt;
    if (this.replayAcc < 1 / 30) return;
    this.replayAcc = 0;
    this.recordFrameNow();
  }

  /** Graba un fotograma de repetición con el estado actual (también lo usa el invitado online). */
  recordFrameNow() {
    if (this.phase === 'replay') return;
    const frame: ReplayFrame = {
      tm: this.time,
      ball: [this.ball.pos.x, this.ball.pos.y, this.ball.pos.z],
      players: this.active.map((p) => ({ id: p.id, x: p.pos.x, z: p.pos.z, f: p.facing, s: p.anim.state, t: p.anim.time, sp: p.anim.speed, d: p.anim.duration, v: p.anim.variant, ft: p.anim.foot })),
    };
    const r = this.referee;
    frame.players.push({ id: 'referee', x: r.pos.x, z: r.pos.z, f: r.facing, s: r.anim.state, t: r.anim.time, sp: r.anim.speed, d: r.anim.duration, v: 0, ft: 1 });
    this.replay.push(frame);
    if (this.replay.length > 30 * 8) this.replay.shift();
  }

  /**
   * Recorta la repetición: empieza un poco antes del disparo (o de la jugada si no hubo disparo
   * reciente, p. ej. un gol en contra) y termina con el balón en la red.
   */
  private buildReplayClip() {
    const g = this.goalTime;
    const shot = this.shotKickTime >= 0 && g - this.shotKickTime < 6 ? this.shotKickTime : -1;
    let start = shot >= 0 ? shot - 2.2 : g - 3.5;
    start = Math.max(start, g - 5.5);
    this.replayClip = this.replay.filter((f) => f.tm >= start);
    if (this.replayClip.length < 2) this.replayClip = this.replay.slice(-90);
    const len = this.replayClip.length > 1 ? this.replayClip[this.replayClip.length - 1].tm - this.replayClip[0].tm : 3;
    this.replayLength = len / REPLAY_SPEED + 0.8;
  }

  /** Avanza la simulación en modo rápido (sin render) — usado en pruebas y simulación de partidos de la IA. */
  simulate(seconds: number) {
    const steps = Math.round(seconds / SIM_DT);
    for (let i = 0; i < steps && !this.finished; i++) {
      this.step(SIM_DT);
      if (this.phase === 'replay') this.skipReplay();
      this.events.length = 0;
    }
  }
}

export { PENALTY_AREA_DEPTH, PENALTY_AREA_HALF_WIDTH };
