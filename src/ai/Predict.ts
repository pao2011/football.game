import { Vector3 } from 'three';
import { AIR_DRAG, ROLL_DECEL } from '../sim/Ball';
import { BALL_RADIUS, GRAVITY } from '../config/constants';
import type { Match } from '../sim/Match';
import type { Player } from '../sim/Player';
import { dist2D } from '../util/math';

// Predicción simplificada de la trayectoria del balón (sin colisiones) para que la IA anticipe.

export const PRED_DT = 0.1;
export const PRED_STEPS = 30; // 3 s

const cache = new WeakMap<Match, { time: number; pts: Vector3[] }>();

export function getBallPrediction(m: Match): Vector3[] {
  const c = cache.get(m);
  if (c && Math.abs(c.time - m.time) < 1e-6) return c.pts;
  const pts = c?.pts ?? Array.from({ length: PRED_STEPS + 1 }, () => new Vector3());
  const b = m.ball;
  let x = b.pos.x, y = b.pos.y, z = b.pos.z;
  let vx = b.vel.x, vy = b.vel.y, vz = b.vel.z;
  if (b.held || m.owner) {
    // con dueño: el balón acompaña al portador
    const o = m.owner;
    for (let i = 0; i <= PRED_STEPS; i++) {
      const t = i * PRED_DT;
      if (o) pts[i].set(x + o.vel.x * t, BALL_RADIUS, z + o.vel.z * t);
      else pts[i].set(x, y, z);
    }
  } else {
    const sub = 4;
    const dt = PRED_DT / sub;
    const env = b.env;
    const wx = env.wind.x;
    const wz = env.wind.z;
    pts[0].set(x, y, z);
    for (let i = 1; i <= PRED_STEPS; i++) {
      for (let k = 0; k < sub; k++) {
        const s = Math.hypot(vx, vy, vz);
        const grounded = y <= BALL_RADIUS + 0.01 && Math.abs(vy) < 0.6;
        if (grounded) {
          vy = 0;
          const gs = Math.hypot(vx, vz);
          if (gs > 0) {
            const ns = Math.max(0, gs - (ROLL_DECEL * env.roll + AIR_DRAG * gs * gs) * dt);
            vx *= ns / gs;
            vz *= ns / gs;
          }
        } else {
          // arrastre respecto al viento
          const rx = vx - wx;
          const rz = vz - wz;
          const rs = Math.hypot(rx, vy, rz);
          vx -= AIR_DRAG * rs * rx * dt;
          vz -= AIR_DRAG * rs * rz * dt;
          vy -= (GRAVITY + AIR_DRAG * rs * vy) * dt;
          void s;
        }
        x += vx * dt;
        y += vy * dt;
        z += vz * dt;
        if (y < BALL_RADIUS) {
          y = BALL_RADIUS;
          if (vy < -0.6) { vy = -vy * 0.58 * env.bounce; vx *= env.skid; vz *= env.skid; } else vy = 0;
        }
      }
      pts[i].set(x, y, z);
    }
  }
  cache.set(m, { time: m.time, pts });
  return pts;
}

/** Tiempo estimado para que un jugador llegue a un punto (s). */
export function timeToReach(p: Player, target: { x: number; z: number }, reaction = 0.15): number {
  const d = Math.max(0, dist2D(p.pos, target) - 0.5);
  const vmax = 6.6 + (p.data.attrs.speed / 100) * 2.6;
  // penalización por tener que girar
  const dx = target.x - p.pos.x;
  const dz = target.z - p.pos.z;
  const sp = Math.hypot(p.vel.x, p.vel.z);
  let turn = 0;
  if (sp > 1 && d > 0.5) {
    const cos = (p.vel.x * dx + p.vel.z * dz) / (sp * Math.hypot(dx, dz));
    turn = (1 - cos) * 0.25 * (sp / 7);
  }
  const accelT = vmax / (6 + (p.data.attrs.acceleration / 100) * 5);
  return reaction + turn + (d < vmax * accelT * 0.5 ? Math.sqrt((2 * d) / (vmax / accelT)) : d / vmax + accelT * 0.5);
}

export interface Intercept {
  t: number;
  point: Vector3;
}

/** Primer punto de la trayectoria prevista que el jugador puede alcanzar (balón jugable a ras o media altura). */
export function interceptFor(m: Match, p: Player, maxHeight = 1.6, reaction = 0.15): Intercept {
  const pts = getBallPrediction(m);
  for (let i = 0; i <= PRED_STEPS; i++) {
    const pt = pts[i];
    if (pt.y > maxHeight) continue;
    const t = i * PRED_DT;
    if (timeToReach(p, pt, reaction) <= t + 0.05) return { t, point: pt };
  }
  const last = pts[PRED_STEPS];
  return { t: PRED_STEPS * PRED_DT + timeToReach(p, last, reaction), point: last };
}

/**
 * Punto de remate de un balón aéreo (centro o pase elevado): el primero de la trayectoria a altura de
 * cabeza (1,2–2,5 m) al que el jugador llega a tiempo. null si no hay ninguno.
 */
export function aerialIntercept(m: Match, p: Player, reaction = 0.1): Intercept | null {
  const pts = getBallPrediction(m);
  for (let i = 1; i <= PRED_STEPS; i++) {
    const pt = pts[i];
    if (pt.y < 1.2 || pt.y > 2.5) continue;
    const t = i * PRED_DT;
    if (timeToReach(p, pt, reaction) <= t + 0.08) return { t, point: pt };
  }
  return null;
}
