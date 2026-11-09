import { Vector3 } from 'three';
import { HALF_LENGTH, HALF_WIDTH } from '../config/constants';
import type { AnimInfo, AnimState } from './types';
import { clamp } from '../util/math';

export type RefGesture = 'card' | 'warn' | 'point' | 'whistle';

/**
 * Árbitro: sigue el juego en diagonal (a unos 10–15 m del balón, sin estorbar), y en las faltas
 * corre hacia el infractor para hacer el aviso verbal o mostrar la tarjeta, o señala el tiro libre.
 */
export class Referee {
  readonly pos = new Vector3(-6, 0, -12);
  readonly vel = new Vector3();
  facing = 0;
  readonly anim: AnimInfo = { state: 'idle', time: 0, duration: 0, speed: 0, variant: 0, foot: 1 };
  /** Gesto en curso: tarjeta, aviso verbal, señalar o silbar. */
  gesture: { kind: RefGesture; until: number; start: number; at: Vector3; face: Vector3 } | null = null;
  /** VAR: adónde va el árbitro (monitor), a qué mira y qué gesto hace (los fija el partido). */
  varGoto: Vector3 | null = null;
  varLook: Vector3 | null = null;
  varAnim: AnimState | null = null;
  /** Color de la tarjeta que muestra (para el render). */
  cardColor: 'yellow' | 'red' | null = null;
  private readonly tmp = new Vector3();

  /** Señal del árbitro: va hacia `at` (el infractor) y hace el gesto durante `seconds`. */
  signal(kind: RefGesture, time: number, at: Vector3, face: Vector3, seconds: number, card: 'yellow' | 'red' | null = null) {
    this.gesture = { kind, start: time, until: time + seconds, at: at.clone(), face: face.clone() };
    this.cardColor = card;
  }

  update(dt: number, time: number, ball: Vector3) {
    const g = this.gesture && time < this.gesture.until ? this.gesture : null;
    if (!g) {
      this.gesture = null;
      this.cardColor = null;
    }
    // posición objetivo
    const t = this.tmp;
    if (this.varGoto) {
      t.copy(this.varGoto);
    } else if (this.varAnim) {
      t.copy(this.pos); // se queda donde está (escuchando, haciendo la señal o comunicando)
    } else if (g && (g.kind === 'card' || g.kind === 'warn')) {
      // a 2 m del infractor, del lado del balón
      t.set(g.face.x - g.at.x, 0, g.face.z - g.at.z);
      const l = t.length() || 1;
      t.set(g.at.x + (t.x / l) * 2.2, 0, g.at.z + (t.z / l) * 2.2);
    } else {
      // diagonal: algo por detrás y al costado del balón
      const sx = Math.sign(ball.x) || 1;
      t.set(ball.x - sx * 9, 0, ball.z * 0.55 + (ball.z > 0 ? -9 : 9));
    }
    if (!this.varGoto) {
      t.x = clamp(t.x, -HALF_LENGTH + 2, HALF_LENGTH - 2);
      t.z = clamp(t.z, -HALF_WIDTH + 2, HALF_WIDTH - 2);
    }
    const dx = t.x - this.pos.x;
    const dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const urgent = !!g || !!this.varGoto;
    const vmax = urgent ? 7.5 : d > 6 ? 6 : 3.2;
    const want = d < 0.4 ? 0 : Math.min(vmax, d * 1.6);
    const k = Math.min(1, dt * 3.5);
    this.vel.x += ((d > 0 ? (dx / d) * want : 0) - this.vel.x) * k;
    this.vel.z += ((d > 0 ? (dz / d) * want : 0) - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    // mirada: al infractor durante el gesto, si no al balón (o hacia donde corre)
    const look = this.varLook ?? (g && (g.kind === 'card' || g.kind === 'warn') ? g.at : g && g.kind === 'point' ? g.face : ball);
    const walkingToMonitor = !!this.varGoto && sp > 1 && d > 4;
    const target = (sp > 3.5 && !g) || walkingToMonitor ? Math.atan2(this.vel.x, this.vel.z) : Math.atan2(look.x - this.pos.x, look.z - this.pos.z);
    let df = target - this.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    this.facing += df * Math.min(1, dt * 8);
    // animación: el gesto empieza al llegar (o enseguida si es silbar/señalar)
    // empieza el gesto al llegar (a unos metros) o, si tarda, a tiempo para que se vea entero
    const near = d < 3 || (!!g && time > g.until - 2.2);
    let state: AnimState = sp > 0.3 ? 'locomotion' : 'idle';
    if (this.varAnim) state = this.varAnim;
    else if (g && (near || g.kind === 'point' || g.kind === 'whistle')) {
      state = g.kind === 'card' ? 'ref_card' : g.kind === 'warn' ? 'ref_warn' : g.kind === 'point' ? 'ref_point' : 'ref_whistle';
    }
    if (state !== this.anim.state) {
      this.anim.state = state;
      this.anim.time = 0;
    } else {
      this.anim.time += dt;
    }
    this.anim.speed = sp;
    this.anim.duration = this.varAnim && (state === 'ref_card' || state === 'ref_point' || state === 'ref_cancel') ? 3.4 : state === 'ref_card' ? 2 : state === 'ref_warn' ? 1.6 : state === 'ref_point' ? 1.4 : state === 'ref_cancel' ? 1.6 : 0;
  }
}
