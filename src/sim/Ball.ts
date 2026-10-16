import { Vector3 } from 'three';
import {
  BALL_RADIUS, GOAL_DEPTH, GOAL_DEPTH_TOP, GOAL_HALF_WIDTH, GOAL_HEIGHT, GRAVITY, HALF_LENGTH, POST_RADIUS,
} from '../config/constants';
import { defaultEnv, type BallEnv } from './Weather';

// Parámetros físicos (ajustados mediante pruebas en tests/ball.test.ts).
export const AIR_DRAG = 0.0135; // a = -AIR_DRAG * |v| * v   (≈ ½ρCdA/m para un balón de 0.43 kg)
export const MAGNUS = 0.0032; // a = MAGNUS * (ω × v)
export const ROLL_DECEL = 1.4; // deceleración por rodadura sobre césped (m/s²)
export const RESTITUTION = 0.58; // coeficiente de restitución vertical con el césped
export const GROUND_TANGENT_LOSS = 0.84; // pérdida de velocidad horizontal por bote
export const POST_RESTITUTION = 0.72;
export const SPIN_DECAY = 0.55; // decaimiento exponencial del giro por segundo (aire)

export interface BallStepEvents {
  bounce: number; // intensidad del bote más fuerte en el paso (0 si no hubo)
  post: boolean;
  net: boolean;
}

/** Superficies de los arcos para colisiones: segmentos (postes y travesaños). */
interface Segment { a: Vector3; b: Vector3 }
const SEGMENTS: Segment[] = [];
for (const side of [-1, 1]) {
  const x = side * (HALF_LENGTH + POST_RADIUS);
  SEGMENTS.push({ a: new Vector3(x, 0, -GOAL_HALF_WIDTH - POST_RADIUS), b: new Vector3(x, GOAL_HEIGHT + POST_RADIUS, -GOAL_HALF_WIDTH - POST_RADIUS) });
  SEGMENTS.push({ a: new Vector3(x, 0, GOAL_HALF_WIDTH + POST_RADIUS), b: new Vector3(x, GOAL_HEIGHT + POST_RADIUS, GOAL_HALF_WIDTH + POST_RADIUS) });
  SEGMENTS.push({ a: new Vector3(x, GOAL_HEIGHT + POST_RADIUS, -GOAL_HALF_WIDTH - POST_RADIUS), b: new Vector3(x, GOAL_HEIGHT + POST_RADIUS, GOAL_HALF_WIDTH + POST_RADIUS) });
}

const _ab = new Vector3();
const _ap = new Vector3();
const _closest = new Vector3();
const _n = new Vector3();
const _acc = new Vector3();
const _tmp = new Vector3();

/** Profundidad de la red a una altura dada (la red se inclina desde el suelo hasta el travesaño). */
export function netDepthAt(y: number) {
  const t = Math.min(Math.max(y / GOAL_HEIGHT, 0), 1);
  return GOAL_DEPTH + (GOAL_DEPTH_TOP - GOAL_DEPTH) * t;
}

export class Ball {
  readonly pos = new Vector3(0, BALL_RADIUS, 0);
  readonly vel = new Vector3();
  /** Velocidad angular (rad/s). Se usa para el efecto Magnus y para girar el modelo. */
  readonly spin = new Vector3();
  /** Orientación acumulada para el render (cuaternión en componentes). */
  readonly rotAxis = new Vector3(1, 0, 0);
  rollAngle = 0;
  /** El balón está retenido en las manos (arquero o saque de banda): no simula física. */
  held = false;
  /** Clima: rodadura, botes y viento. */
  env: BallEnv = defaultEnv();

  reset(x = 0, z = 0) {
    this.pos.set(x, BALL_RADIUS, z);
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.held = false;
  }

  get onGround() {
    return this.pos.y <= BALL_RADIUS + 0.02 && Math.abs(this.vel.y) < 0.6;
  }

  get speed() {
    return this.vel.length();
  }

  get groundSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** ¿Estaba la pelota dentro del volumen de algún arco? (detrás de la línea, entre postes, bajo el travesaño) */
  static insideGoalVolume(p: Vector3): -1 | 0 | 1 {
    const ax = Math.abs(p.x);
    if (ax > HALF_LENGTH && ax < HALF_LENGTH + GOAL_DEPTH + 0.3 && Math.abs(p.z) < GOAL_HALF_WIDTH && p.y < GOAL_HEIGHT) {
      return p.x > 0 ? 1 : -1;
    }
    return 0;
  }

  step(dt: number): BallStepEvents {
    const ev: BallStepEvents = { bounce: 0, post: false, net: false };
    if (this.held) {
      this.vel.set(0, 0, 0);
      return ev;
    }
    // Subpasos para que un balón rápido no atraviese postes ni redes (efecto túnel)
    const n = Math.min(8, Math.max(1, Math.ceil((this.vel.length() * dt) / 0.06)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.subStep(h, ev);
    return ev;
  }

  private subStep(dt: number, ev: BallStepEvents) {
    const prevInside = Ball.insideGoalVolume(this.pos);
    const prevX = this.pos.x;

    const v = this.vel;
    const speed = v.length();
    const grounded = this.pos.y <= BALL_RADIUS + 0.005 && Math.abs(v.y) < 0.6;

    // --- Aceleraciones ---
    _acc.set(0, 0, 0);
    if (!grounded) _acc.y -= GRAVITY;
    // Arrastre aerodinámico cuadrático (en el aire, respecto al viento)
    const wind = this.env.wind;
    if (!grounded && (wind.x !== 0 || wind.z !== 0)) {
      _tmp.set(v.x - wind.x, v.y, v.z - wind.z);
      _acc.addScaledVector(_tmp, -AIR_DRAG * _tmp.length());
    } else {
      _acc.addScaledVector(v, -AIR_DRAG * speed);
    }
    // Efecto Magnus (solo en el aire tiene efecto apreciable)
    if (!grounded && speed > 1) {
      _tmp.crossVectors(this.spin, v).multiplyScalar(MAGNUS);
      _acc.add(_tmp);
    }
    v.addScaledVector(_acc, dt);

    if (grounded) {
      // Rodadura: fricción constante sobre el césped
      v.y = 0;
      const gs = Math.hypot(v.x, v.z);
      if (gs > 0) {
        const ns = Math.max(0, gs - ROLL_DECEL * this.env.roll * dt);
        const k = ns / gs;
        v.x *= k;
        v.z *= k;
      }
      // El giro se convierte en rodadura pura
      this.spin.multiplyScalar(Math.max(0, 1 - 3 * dt));
    } else {
      this.spin.multiplyScalar(Math.max(0, 1 - SPIN_DECAY * dt));
    }

    this.pos.addScaledVector(v, dt);

    // --- Suelo ---
    if (this.pos.y < BALL_RADIUS) {
      this.pos.y = BALL_RADIUS;
      if (v.y < -0.6) {
        ev.bounce = Math.max(ev.bounce, Math.min(1, -v.y / 12));
        v.y = -v.y * RESTITUTION * this.env.bounce;
        // Rozamiento en el bote + transferencia de efecto (topspin acelera, backspin frena)
        v.x *= this.env.skid;
        v.z *= this.env.skid;
        v.x += this.spin.z * BALL_RADIUS * 0.12;
        v.z -= this.spin.x * BALL_RADIUS * 0.12;
        this.spin.multiplyScalar(0.6);
        if (v.y < 0.6) v.y = 0;
      } else {
        v.y = 0;
      }
    }

    // --- Postes y travesaños ---
    for (const s of SEGMENTS) {
      if (Math.abs(this.pos.x - s.a.x) > 1) continue;
      _ab.subVectors(s.b, s.a);
      _ap.subVectors(this.pos, s.a);
      const t = Math.min(Math.max(_ap.dot(_ab) / _ab.lengthSq(), 0), 1);
      _closest.copy(s.a).addScaledVector(_ab, t);
      _n.subVectors(this.pos, _closest);
      const d = _n.length();
      const minD = BALL_RADIUS + POST_RADIUS;
      if (d < minD && d > 1e-6) {
        _n.divideScalar(d);
        this.pos.copy(_closest).addScaledVector(_n, minD + 0.001);
        const vn = v.dot(_n);
        if (vn < 0) {
          v.addScaledVector(_n, -(1 + POST_RESTITUTION) * vn);
          v.multiplyScalar(0.92);
          if (Math.abs(vn) > 1) ev.post = true;
        }
      }
    }

    // --- Redes ---
    const inside = Ball.insideGoalVolume(this.pos);
    const side = prevInside || inside || (Math.abs(this.pos.x) > HALF_LENGTH ? Math.sign(this.pos.x) : 0);
    if (side !== 0) this.collideNet(side as 1 | -1, prevInside !== 0, prevX, ev);

    // --- Rotación visual ---
    const gs = Math.hypot(v.x, v.z);
    if (gs > 0.01) {
      // Eje de rodadura perpendicular a la dirección de avance
      this.rotAxis.set(v.z, 0, -v.x).normalize();
      this.rollAngle = (gs * dt) / BALL_RADIUS;
    } else {
      this.rollAngle = 0;
    }
  }

  /** La red absorbe el balón: no puede atravesarla en ningún sentido. */
  private collideNet(side: 1 | -1, wasInside: boolean, prevX: number, ev: BallStepEvents) {
    const p = this.pos;
    const v = this.vel;
    const r = BALL_RADIUS;
    const ax = Math.abs(p.x);
    const depth = netDepthAt(p.y);
    const backX = HALF_LENGTH + depth;
    if (wasInside) {
      // Dentro del arco: limitar contra la red de fondo, laterales y techo
      let hit = false;
      if (ax > backX - r) {
        p.x = side * (backX - r);
        if (v.x * side > 0) { v.x *= -0.04; hit = true; }
      }
      if (Math.abs(p.z) > GOAL_HALF_WIDTH - r) {
        p.z = Math.sign(p.z) * (GOAL_HALF_WIDTH - r);
        if (v.z * Math.sign(p.z) > 0) { v.z *= -0.15; hit = true; }
      }
      if (p.y > GOAL_HEIGHT - r && ax > HALF_LENGTH + 0.05) {
        p.y = GOAL_HEIGHT - r;
        if (v.y > 0) { v.y *= -0.1; hit = true; }
      }
      if (hit) {
        v.x *= 0.35; v.z *= 0.35;
        this.spin.multiplyScalar(0.3);
        ev.net = true;
      }
    } else {
      // Fuera del arco: la red lateral/trasera/techo actúa como pared desde fuera
      if (ax > HALF_LENGTH && ax < backX + r && p.y < GOAL_HEIGHT + r) {
        const az = Math.abs(p.z);
        const crossingSide = az < GOAL_HALF_WIDTH + r && az > GOAL_HALF_WIDTH - 0.6;
        const fromBehind = Math.abs(prevX) >= backX + r - 0.05 && az < GOAL_HALF_WIDTH;
        const fromTop = p.y < GOAL_HEIGHT + r && p.y > GOAL_HEIGHT - 0.4 && az < GOAL_HALF_WIDTH && Math.abs(prevX) > HALF_LENGTH + 0.05;
        if (fromBehind) {
          p.x = side * (backX + r);
          v.x = Math.abs(v.x) * 0.15 * side;
          v.z *= 0.5;
          ev.net = true;
        } else if (crossingSide) {
          p.z = Math.sign(p.z) * (GOAL_HALF_WIDTH + r);
          v.z = Math.abs(v.z) * 0.15 * Math.sign(p.z);
          v.x *= 0.5;
          ev.net = true;
        } else if (fromTop) {
          p.y = GOAL_HEIGHT + r;
          if (v.y < 0) v.y = -v.y * 0.15;
          v.x *= 0.6; v.z *= 0.6;
          ev.net = true;
        }
      }
    }
  }
}

/**
 * Velocidad inicial de un pase raso para que recorra `dist` metros y llegue con `arriveSpeed`.
 * Solución analítica de dv/dt = -(R + D v²):  x = ln((R + D v0²)/(R + D v1²)) / (2D)
 */
export function groundPassSpeed(dist: number, arriveSpeed: number) {
  const R = ROLL_DECEL;
  const D = AIR_DRAG;
  const v1 = Math.max(0, arriveSpeed);
  return Math.sqrt(((R + D * v1 * v1) * Math.exp(2 * D * dist) - R) / D);
}

/** Distancia recorrida por un balón raso lanzado a v0 hasta detenerse. */
export function groundRollDistance(v0: number) {
  return Math.log((ROLL_DECEL + AIR_DRAG * v0 * v0) / ROLL_DECEL) / (2 * AIR_DRAG);
}

/** Tiempo para que un pase raso de velocidad v0 recorra `dist` (Infinity si no llega). */
export function groundPassTime(v0: number, dist: number) {
  // Integración numérica gruesa (suficiente para decisiones de IA)
  let x = 0;
  let v = v0;
  let t = 0;
  const dt = 1 / 30;
  while (x < dist) {
    if (v <= 0.05 || t > 8) return Infinity;
    v -= (ROLL_DECEL + AIR_DRAG * v * v) * dt;
    x += Math.max(v, 0) * dt;
    t += dt;
  }
  return t;
}

/**
 * Calcula la velocidad de lanzamiento de un balón elevado para que caiga a `dist` metros
 * con un ángulo de elevación dado (con arrastre). Devuelve velocidad y tiempo de vuelo.
 */
export function loftedSpeed(dist: number, elevationDeg: number): { speed: number; flightTime: number } {
  const el = (elevationDeg * Math.PI) / 180;
  let lo = 3;
  let hi = 45;
  let best = { speed: 20, flightTime: 1.5 };
  for (let i = 0; i < 18; i++) {
    const s = (lo + hi) / 2;
    const r = simulateFlight(s, el);
    best = { speed: s, flightTime: r.time };
    if (r.dist < dist) lo = s; else hi = s;
  }
  return best;
}

function simulateFlight(speed: number, el: number) {
  let vx = Math.cos(el) * speed;
  let vy = Math.sin(el) * speed;
  let x = 0;
  let y = BALL_RADIUS;
  let t = 0;
  const dt = 1 / 60;
  while (t < 10) {
    const s = Math.hypot(vx, vy);
    vx += -AIR_DRAG * s * vx * dt;
    vy += (-GRAVITY - AIR_DRAG * s * vy) * dt;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    if (y < BALL_RADIUS && vy < 0) break;
  }
  return { dist: x, time: t };
}
