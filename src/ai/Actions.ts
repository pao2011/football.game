import { Vector3 } from 'three';
import { BALL_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH } from '../config/constants';
import type { Match } from '../sim/Match';
import type { KickRequest, Player } from '../sim/Player';
import { aimedShotVelocity, curledShot, groundPassVelocity, loftedVelocity, loftToPoint } from '../sim/Kicks';
import { clamp } from '../util/math';

// Construcción de golpeos compartida por la IA y el control humano.

function ballFrom(m: Match): Vector3 {
  return m.ball.pos.clone();
}

export function buildGroundPass(m: Match, p: Player, target: Vector3, powerBias: number, errorScale: number, receiver?: Player, kind: 'pass' | 'through' = 'pass'): KickRequest {
  const v = groundPassVelocity(ballFrom(m), target, powerBias);
  return { kind, velocity: v, spin: new Vector3(), targetId: receiver?.id, power: clamp(v.length() / 30, 0.15, 1), errorScale };
}

export function buildLob(m: Match, p: Player, target: Vector3, elevationDeg: number, errorScale: number, receiver?: Player, kind: 'lob' | 'cross' | 'clear' = 'lob'): KickRequest {
  const v = loftedVelocity(ballFrom(m), target, elevationDeg);
  // ligero efecto hacia dentro en los centros
  const spin = new Vector3();
  if (kind === 'cross') {
    const side = Math.sign(m.ball.pos.z) || 1;
    // Centro desde la derecha (z>0 mirando +x) curva hacia el centro
    const dirX = Math.sign(v.x) || 1;
    spin.set(0, 18 * side * dirX, 0);
  }
  return { kind, velocity: v, spin, targetId: receiver?.id, power: clamp(v.length() / 32, 0.3, 1), errorScale };
}

/** Tipo de disparo. Las banderas se combinan (p. ej. rosca + raso, potente + raso, vaselina + rosca). */
export interface ShotStyle {
  /** Vaselina: balón elevado por encima del arquero. */
  chip: boolean;
  /** Con efecto (rosca): curva hacia el palo. */
  finesse: boolean;
  /** Potente: más velocidad, menos precisión y más tiempo de armado. */
  power: boolean;
  /** Raso: pegado al césped. */
  low: boolean;
}

export const NORMAL_SHOT: ShotStyle = { chip: false, finesse: false, power: false, low: false };

/** Nombre del tipo de disparo para el HUD. */
export function shotStyleName(st: ShotStyle): string {
  const parts: string[] = [];
  if (st.chip) parts.push('VASELINA');
  else if (st.finesse && st.low) parts.push('ROSCA RASA');
  else if (st.finesse) parts.push('ROSCA');
  else if (st.low) parts.push('TIRO RASO');
  else parts.push('TIRO');
  if (st.chip && st.finesse) parts.push('CON EFECTO');
  if (st.power) parts.push('POTENTE');
  return parts.join(' ');
}

/**
 * Disparo hacia un punto del arco. `power` 0..1 (barra de potencia).
 * `style` puede ser un booleano (compatibilidad: true = rosca) o un ShotStyle combinable.
 */
export function buildShot(m: Match, p: Player, aimZ: number, aimY: number, power: number, style: boolean | ShotStyle, errorScale: number, kind: KickRequest['kind'] = 'shoot'): KickRequest {
  const st: ShotStyle = typeof style === 'boolean' ? { ...NORMAL_SHOT, finesse: style } : style;
  const team = m.teams[p.team];
  const gx = (HALF_LENGTH + 0.3) * team.attackDir;
  const from = ballFrom(m);
  const z = clamp(aimZ, -GOAL_HALF_WIDTH + 0.25, GOAL_HALF_WIDTH - 0.25);
  const pw = st.power ? 1.3 : 1;
  const err = errorScale * (st.power && !st.low ? 1.3 : 1) * (st.chip ? 1.1 : 1);

  // --- Vaselina: cae bajo el travesaño por encima del arquero ---
  if (st.chip) {
    const target = new Vector3(gx, st.power ? 1.6 : 1.95, z);
    // más potencia → trayectoria más tensa y larga (vaselina potente)
    const elev = st.power ? 30 + (1 - power) * 8 : 52 - power * 14;
    const velocity = loftToPoint(from, target, elev);
    const spin = new Vector3();
    if (st.finesse) {
      // efecto lateral hacia el centro del arco
      const toT = new Vector3(target.x - from.x, 0, target.z - from.z).normalize();
      const left = new Vector3(toT.z, 0, -toT.x);
      const side = new Vector3(gx - from.x, 0, -from.z).normalize().sub(toT).dot(left) > 0 ? 1 : -1;
      spin.set(0, 22 * side, 0);
      // apuntar algo hacia fuera para que la curva lo meta
      velocity.addScaledVector(left, -side * 0.6);
    }
    return { kind: 'chip', velocity, spin, power: 0.4 + power * 0.3, errorScale: err, style: st };
  }

  // --- Rosca (combinable con raso y potente) ---
  if (st.finesse) {
    const speed = (17 + power * 8) * (st.power ? 1.22 : 1);
    const target = new Vector3(gx, st.low ? 0.3 : clamp(aimY, BALL_RADIUS + 0.05, 2.25), z);
    const toT = new Vector3(target.x - from.x, 0, target.z - from.z).normalize();
    const left = new Vector3(toT.z, 0, -toT.x);
    const toCenter = new Vector3(gx - from.x, 0, -from.z).normalize();
    const curveSign = toT.clone().sub(toCenter).dot(left) > 0 ? 1 : -1;
    const { velocity, spin } = curledShot(from, target, speed, curveSign, st.power ? 42 : 50);
    if (st.low) velocity.y = Math.min(velocity.y, 0.6);
    return { kind: 'finesse', velocity, spin, power: Math.min(1, (0.6 + power * 0.3) * pw), errorScale: err, style: st };
  }

  // --- Raso (combinable con potente) ---
  if (st.low) {
    const speed = st.power ? 26 + power * 10 : 19 + power * 12;
    const target = new Vector3(gx, 0.18, z);
    const velocity = aimedShotVelocity(from, target, speed);
    velocity.y = clamp(velocity.y, -1, 0.5);
    const spin = new Vector3(velocity.z, 0, -velocity.x).normalize().multiplyScalar(-14); // efecto liftado: corre pegado
    return { kind: 'shoot', velocity, spin, power: Math.min(1, power * pw), errorScale: err, style: st };
  }

  // --- Tiro normal o potente ---
  const speed = st.power ? 23 + power * 15 : 15 + power * 17; // hasta 38 m/s con potencia
  const target = new Vector3(gx, clamp(st.power ? 0.35 + power * 1.3 : aimY, BALL_RADIUS + 0.05, 2.3), z);
  const velocity = aimedShotVelocity(from, target, speed);
  const spin = new Vector3(-velocity.z, 0, velocity.x).normalize().multiplyScalar(-8); // leve topspin
  return { kind, velocity, spin, power: Math.min(1, power * pw), errorScale: err, style: st };
}

/** Despeje largo hacia una zona del campo rival. */
export function buildClearance(m: Match, p: Player, errorScale: number): KickRequest {
  const team = m.teams[p.team];
  const side = Math.sign(m.ball.pos.z) || (m.rng.next() < 0.5 ? 1 : -1);
  const target = team.toWorld(10 + m.rng.next() * 15, side * (18 + m.rng.next() * 10));
  const req = buildLob(m, p, target, 38, errorScale, undefined, 'clear');
  return req;
}
