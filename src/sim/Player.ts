import { Vector3 } from 'three';
import type { PlayerData, Position } from '../data/types';
import type { FormationSlot } from '../data/formations';
import { approachAngle, clamp } from '../util/math';
import type { AnimInfo, AnimState } from './types';

/** Acción de golpeo pendiente (se ejecuta en el momento de contacto de la animación). */
export interface KickRequest {
  kind: 'pass' | 'through' | 'lob' | 'cross' | 'shoot' | 'finesse' | 'clear' | 'header' | 'throwin' | 'gkthrow' | 'punt' | 'penalty' | 'chip';
  /** Velocidad deseada del balón (antes del error de ejecución). */
  velocity: Vector3;
  spin: Vector3;
  /** Destinatario previsto (para auto-cambio de jugador y offside). */
  targetId?: string;
  /** Potencia normalizada 0..1 (para sonido/animación). */
  power: number;
  /** Multiplicador de error de ejecución (dificultad, presión). */
  errorScale: number;
  /** Tipo de disparo (vaselina, rosca, potente, raso) cuando es un tiro. */
  style?: import('../ai/Actions').ShotStyle;
  /**
   * Punto al que debe ir el balón (cabezazos): el golpeo se reapunta desde la posición real del balón en el
   * instante del contacto, que puede ser unas décimas después de decidirlo.
   */
  aimAt?: Vector3;
  /** Remate acrobático con el balón en el aire (volea, tijera o chilena). */
  aerial?: import('./Aerial').AerialKind;
}

export type ActionKind = 'none' | 'kick' | 'tackle' | 'slide' | 'header' | 'dive' | 'fallen' | 'getup' | 'celebrate' | 'dejected' | 'hold' | 'throw' | 'trap' | 'skill' | 'scuffle';

export interface PlayerAction {
  kind: ActionKind;
  time: number;
  duration: number;
  /** Momento (s) de contacto dentro de la acción. */
  contactAt: number;
  done: boolean; // contacto ya ejecutado
  kick?: KickRequest;
  anim: AnimState;
  dir: Vector3; // dirección de la acción (barrida, estirada, salida del regate)
  variant: number;
  /** Dirección de avance al empezar un regate. */
  aux?: Vector3;
}

export class Player {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  facing = 0; // ángulo: dirección = (sin, 0, cos)
  /** Velocidad deseada (m/s) que fija la IA o el humano. */
  readonly desiredVel = new Vector3();
  /** Dirección a la que quiere mirar si está parado (NaN = la del movimiento). */
  desiredFacing = NaN;
  sprinting = false;
  jockeying = false;
  stamina = 1; // 0..1 (afecta velocidad punta)
  action: PlayerAction = Player.noAction();
  readonly anim: AnimInfo = { state: 'idle', time: 0, duration: 0, speed: 0, variant: 0, foot: 1 };
  /** No puede tocar el balón hasta este instante (tras golpear, ser regateado...). */
  noTouchUntil = 0;
  yellowCards = 0;
  sentOff = false;
  /** Bloqueado por el árbitro (p. ej. a distancia en un tiro libre). */
  frozen = false;
  /** Superado por un regate: hasta este instante reacciona tarde y no puede entrar. */
  stunnedUntil = 0;
  /** Posición táctica objetivo calculada por el sistema de equipo. */
  readonly tacticalTarget = new Vector3();
  /** Rol táctico dinámico asignado por el equipo. */
  /** Protegiendo el balón con el cuerpo (LT / L2). */
  shielding = false;
  /** Conducción de precisión (RB o LB mantenido): balón pegado al pie. */
  precision = false;
  /** Primer toque orientado: hasta cuándo y hacia dónde (unitario). */
  firstTouchUntil = 0;
  readonly firstTouchDir = new Vector3();
  /** Avisos verbales del árbitro (el segundo, amarilla). */
  warnings = 0;
  /** Desmarque pedido por el jugador humano (LB): hasta cuándo y hacia dónde. */
  forcedRunUntil = -1;
  /** Lesionado en este partido (y partidos que se perderá en torneo o carrera). */
  injured = false;
  injuryGames = 0;
  readonly forcedRunTarget = new Vector3();
  duty: 'shape' | 'press' | 'cover' | 'mark' | 'chase' | 'support' | 'run' | 'carrier' | 'receive' | 'setpiece' = 'shape';
  markTarget: Player | null = null;
  /** Para IA: siguiente instante en que puede reconsiderar una decisión con balón. */
  nextDecisionAt = 0;
  /** Último instante en que este jugador tocó el balón. */
  lastTouchAt = -10;
  goals = 0;
  /** Estadísticas individuales del partido (para las valoraciones). */
  readonly ps = { passes: 0, passesOk: 0, shots: 0, onTarget: 0, assists: 0, tackles: 0, saves: 0, fouls: 0, from: 0, to: -1 };
  stoodOffside = false;
  readonly id: string;

  constructor(
    readonly data: PlayerData,
    readonly team: number,
    public slot: FormationSlot,
    public slotIndex: number,
  ) {
    this.id = data.id;
  }

  static noAction(): PlayerAction {
    return { kind: 'none', time: 0, duration: 0, contactAt: 0, done: true, anim: 'idle', dir: new Vector3(), variant: 0 };
  }

  get isGK() {
    return this.slot.position === 'GK';
  }

  get position(): Position {
    return this.slot.position;
  }

  get busy() {
    return this.action.kind !== 'none';
  }

  /** Puede moverse libremente (no está en una acción que lo bloquee). */
  get mobile() {
    const k = this.action.kind;
    return k === 'none' || k === 'trap' || (k === 'kick' && this.action.done);
  }

  /** Velocidad punta (m/s) según atributos, cansancio y sprint. */
  maxSpeed(withBall: boolean) {
    const a = this.data.attrs;
    const top = 6.6 + (a.speed / 100) * 2.6; // 6.6 .. 9.2 m/s en sprint
    const jog = 4.6 + (a.speed / 100) * 1.0;
    let s = this.sprinting ? top : jog;
    s *= 0.82 + 0.18 * this.stamina;
    if (this.injured) s *= 0.8; // lesionado: cojea hasta que lo cambian
    if (withBall) s *= 0.86 + (a.control / 100) * 0.08;
    // contener: más rápido si además se esprinta (LT + RT, "brega rápida")
    if (this.jockeying) s = Math.min(s, this.sprinting ? 5.2 : 3.2);
    // proteger el balón: casi parado; conducción de precisión: algo más lenta
    if (withBall && this.shielding) s = Math.min(s, 2.6);
    else if (withBall && this.precision) s *= this.sprinting ? 0.86 : 0.7;
    return s;
  }

  accel() {
    return 6 + (this.data.attrs.acceleration / 100) * 5; // m/s²
  }

  startAction(kind: ActionKind, anim: AnimState, duration: number, contactAt = 0, extra: Partial<PlayerAction> = {}) {
    this.action = {
      kind, anim, duration, contactAt, time: 0, done: contactAt <= 0, dir: new Vector3(), variant: 0, ...extra,
    };
  }

  clearAction() {
    this.action = Player.noAction();
  }

  /** Integra movimiento con aceleración y giro limitados. */
  integrate(dt: number, hasBall: boolean) {
    const act = this.action;
    if (act.kind !== 'none') {
      act.time += dt;
      if (act.time >= act.duration) {
        const k = act.kind;
        const acrobatic = act.anim === 'bicycle' || act.anim === 'scissor' || act.anim === 'diving' || act.anim === 'scorpion';
        this.clearAction();
        if (k === 'slide' || k === 'fallen') this.startAction('getup', 'getup', 0.7);
        else if (acrobatic) this.startAction('getup', 'getup', 0.75); // tras la chilena o la tijera, cae al césped
      }
    }

    if (this.frozen) {
      this.vel.set(0, 0, 0);
    } else if (this.action.kind === 'slide' || this.action.kind === 'dive' || this.action.anim === 'diving') {
      // Inercia de la barrida / estirada: desaceleración progresiva
      const decel = this.action.kind === 'slide' ? 5.5 : 6.5;
      const s = Math.hypot(this.vel.x, this.vel.z);
      const ns = Math.max(0, s - decel * dt);
      if (s > 0) this.vel.multiplyScalar(ns / s);
    } else if (this.action.kind === 'fallen' || this.action.kind === 'getup') {
      this.vel.multiplyScalar(Math.max(0, 1 - 8 * dt));
    } else {
      let maxS = this.maxSpeed(hasBall);
      if (this.action.kind === 'kick' && !this.action.done) maxS = Math.max(maxS * 0.55, 2.6);
      // en el aire (chilena / tijera) casi no se avanza
      if (this.action.anim === 'bicycle' || this.action.anim === 'scissor' || this.action.anim === 'scorpion') maxS = 1.2;
      // terminando un control con el pecho o el muslo: no se aleja del balón que cae
      else if (this.action.kind === 'trap' && this.action.variant > 0) maxS = Math.min(maxS, 2.2);
      if (this.action.kind === 'tackle' || this.action.kind === 'header') maxS *= 0.6;
      if (this.action.kind === 'scuffle') maxS *= 0.35;
      const dv = this.desiredVel;
      const dl = Math.hypot(dv.x, dv.z);
      let tx = dv.x;
      let tz = dv.z;
      if (dl > maxS) {
        tx *= maxS / dl;
        tz *= maxS / dl;
      }
      // Giros: a mayor velocidad cuesta más cambiar de dirección (inercia)
      const curS = Math.hypot(this.vel.x, this.vel.z);
      const reverse = curS > 1 && dl > 0.1 && (this.vel.x * tx + this.vel.z * tz) / (curS * Math.hypot(tx, tz)) < -0.2;
      const a = this.accel() * (reverse ? 1.6 : 1) * (dl < 0.1 ? 1.5 : 1); // frenar es más rápido
      const ex = tx - this.vel.x;
      const ez = tz - this.vel.z;
      const el = Math.hypot(ex, ez);
      const step = a * dt;
      if (el <= step) {
        this.vel.x = tx;
        this.vel.z = tz;
      } else {
        this.vel.x += (ex / el) * step;
        this.vel.z += (ez / el) * step;
      }
    }
    this.vel.y = 0;
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = 0;

    // Orientación: hacia el movimiento, o hacia la dirección deseada
    const s = Math.hypot(this.vel.x, this.vel.z);
    const turnRate = clamp(11 - s * 0.9, 4, 11); // rad/s
    let target = this.facing;
    if (this.action.kind === 'kick' || this.action.kind === 'tackle' || this.action.kind === 'header') {
      if (this.action.dir.lengthSq() > 0) target = Math.atan2(this.action.dir.x, this.action.dir.z);
      this.facing = approachAngle(this.facing, target, 14 * dt);
    } else if (this.action.kind === 'slide' || this.action.kind === 'dive' || this.action.kind === 'fallen' || this.action.kind === 'skill') {
      // mantiene orientación (en los regates la controla la simulación)
    } else if (!Number.isNaN(this.desiredFacing) && (this.jockeying || s < 1.2)) {
      this.facing = approachAngle(this.facing, this.desiredFacing, turnRate * dt);
    } else if (s > 0.3) {
      target = Math.atan2(this.vel.x, this.vel.z);
      this.facing = approachAngle(this.facing, target, turnRate * dt);
    }

    // Resistencia
    const drain = this.sprinting && s > 5 ? 0.012 : s > 3 ? 0.002 : -0.006;
    const staminaAttr = this.data.attrs.stamina / 100;
    this.stamina = clamp(this.stamina - drain * dt * (1.6 - staminaAttr), 0.25, 1);
  }

  /** Actualiza la información de animación expuesta al renderizador. */
  updateAnim(dt: number, hasBall: boolean, gkHolding: boolean) {
    const s = Math.hypot(this.vel.x, this.vel.z);
    let state: AnimState;
    let duration = 0;
    let variant = 0;
    const act = this.action;
    if (act.kind !== 'none') {
      state = act.anim;
      duration = act.duration;
      variant = act.variant;
    } else if (gkHolding) {
      state = 'gk_hold';
    } else if (hasBall && s > 0.5) {
      state = 'dribble';
    } else if (this.jockeying) {
      state = 'jockey';
    } else if (this.isGK && s < 1.5) {
      state = 'gk_ready';
    } else if (s > 0.25) {
      state = 'locomotion';
    } else {
      state = 'idle';
    }
    if (state !== this.anim.state || (act.kind !== 'none' && act.time < this.anim.time)) {
      this.anim.state = state;
      this.anim.time = act.kind !== 'none' ? act.time : 0;
    } else {
      this.anim.time = act.kind !== 'none' ? act.time : this.anim.time + dt;
    }
    this.anim.duration = duration;
    this.anim.speed = s;
    this.anim.variant = variant;
  }

  forward(out = new Vector3()) {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }
}
