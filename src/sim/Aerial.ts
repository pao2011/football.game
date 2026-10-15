// Remates acrobáticos (volea, tijera y chilena) y controles orientados de balones aéreos (pecho y muslo).
// Funciones puras compartidas por la simulación, la IA y el control humano.
import { Vector3 } from 'three';
import { BALL_RADIUS, GRAVITY } from '../config/constants';
import type { Ball } from './Ball';
import type { Player } from './Player';

export type AerialKind = 'volley' | 'scissor' | 'bicycle';

export const AERIAL_NAMES: Record<AerialKind, string> = {
  volley: 'Volea',
  scissor: 'Tijera',
  bicycle: 'Chilena',
};

/**
 * Tiempos de cada remate: duración total de la animación y momento ideal de contacto (s).
 * `window` es el margen (s) antes y después del contacto ideal en el que el pie todavía alcanza el balón.
 */
export const AERIAL_TIMING: Record<AerialKind, { duration: number; contact: number; window: number }> = {
  volley: { duration: 0.55, contact: 0.2, window: 0.16 },
  scissor: { duration: 0.85, contact: 0.3, window: 0.17 },
  bicycle: { duration: 1.05, contact: 0.38, window: 0.18 },
};

/** Banda de alturas (m) del balón en la que se puede golpear con cada remate. */
export const AERIAL_HEIGHT: Record<AerialKind, [number, number]> = {
  volley: [0.35, 1.2],
  scissor: [0.95, 1.85],
  bicycle: [1.15, 2.35],
};

/** Dificultad de ejecución (multiplica el error del golpeo). */
export const AERIAL_ERROR: Record<AerialKind, number> = { volley: 1.1, scissor: 1.5, bicycle: 1.8 };

/** Distancia del pie al centro del jugador en el momento del contacto (hacia delante). */
const REACH: Record<AerialKind, number> = { volley: 0.6, scissor: 0.5, bicycle: 0.15 };

/** Punto (en el suelo) donde el pie golpea el balón. */
export function aerialContactPoint(kind: AerialKind, p: Player, out = new Vector3()): Vector3 {
  const r = REACH[kind];
  return out.set(p.pos.x + Math.sin(p.facing) * r, 0, p.pos.z + Math.cos(p.facing) * r);
}

/** ¿Está el balón al alcance del pie para este remate? (distancia horizontal y altura) */
export function aerialInReach(kind: AerialKind, p: Player, ball: Vector3): boolean {
  const c = aerialContactPoint(kind, p, _c);
  const [lo, hi] = AERIAL_HEIGHT[kind];
  return Math.hypot(ball.x - c.x, ball.z - c.z) < 0.85 && ball.y >= lo - 0.1 && ball.y <= hi + 0.15;
}

export interface Approach {
  /** Tiempo (s) hasta el paso más cercano del balón junto al jugador. */
  t: number;
  /** Altura del balón en ese instante. */
  y: number;
  /** Distancia horizontal al jugador en ese instante. */
  miss: number;
  /** Punto del balón en ese instante. */
  point: Vector3;
}

const _c = new Vector3();
const _bp = new Vector3();
const _bv = new Vector3();

/**
 * Paso más cercano del balón (trayectoria balística simplificada, con botes) a un jugador en los próximos
 * `maxT` segundos, considerando solo los instantes en los que el balón está entre `minY` y `maxY`.
 */
export function ballApproach(ball: Ball, p: Player, maxT = 0.9, minY = 0.3, maxY = 2.6): Approach | null {
  const dt = 1 / 60;
  _bp.copy(ball.pos);
  _bv.copy(ball.vel);
  let best: Approach | null = null;
  for (let t = dt; t <= maxT; t += dt) {
    _bv.y -= GRAVITY * dt;
    _bp.addScaledVector(_bv, dt);
    if (_bp.y < BALL_RADIUS) {
      _bp.y = BALL_RADIUS;
      _bv.y = -_bv.y * 0.55;
    }
    if (_bp.y < minY || _bp.y > maxY) continue;
    const miss = Math.hypot(_bp.x - p.pos.x, _bp.z - p.pos.z);
    if (!best || miss < best.miss) best = { t, y: _bp.y, miss, point: _bp.clone() };
  }
  return best;
}

/** Ángulo (rad, 0..π) entre hacia dónde mira el jugador y la dirección al punto dado. */
export function angleTo(p: Player, x: number, z: number): number {
  const a = Math.atan2(x - p.pos.x, z - p.pos.z);
  return Math.abs(Math.atan2(Math.sin(a - p.facing), Math.cos(a - p.facing)));
}

/**
 * Qué remate corresponde a un balón que llega a la altura `y`. De espaldas al arco y alto: chilena;
 * a media altura: tijera; bajo: volea; a la altura de la cabeza (o más): cabezazo (null).
 */
export function chooseAerial(y: number, backToGoal: boolean): AerialKind | null {
  if (backToGoal && y >= AERIAL_HEIGHT.bicycle[0] && y <= AERIAL_HEIGHT.bicycle[1]) return 'bicycle';
  if (y > 1.7) return null;
  if (y >= 1.05) return 'scissor';
  if (y >= AERIAL_HEIGHT.volley[0]) return 'volley';
  return null;
}

/**
 * Velocidad de un remate aéreo desde la posición actual del balón hacia `target` (x, z en la línea de gol;
 * y = altura a la que debe llegar), con la rapidez horizontal dada. Se resuelve sin arrastre, como los cabezazos.
 */
export function aerialShotVelocity(from: Vector3, target: Vector3, hSpeed: number, out = new Vector3()): Vector3 {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.max(0.5, Math.hypot(dx, dz));
  const t = d / hSpeed;
  out.set((dx / d) * hSpeed, (target.y - from.y) / t + 0.5 * GRAVITY * t, (dz / d) * hSpeed);
  return out;
}
