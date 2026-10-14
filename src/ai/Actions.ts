import { Vector3 } from 'three';
import { BALL_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH } from '../config/constants';
import type { Match } from '../sim/Match';
import type { KickRequest, Player } from '../sim/Player';
import { aimedShotVelocity, curledShot, groundPassVelocity, loftedVelocity } from '../sim/Kicks';
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

/**
 * Disparo hacia un punto del arco. `power` 0..1 (barra de potencia), `finesse` tiro colocado con rosca.
 */
export function buildShot(m: Match, p: Player, aimZ: number, aimY: number, power: number, finesse: boolean, errorScale: number, kind: KickRequest['kind'] = 'shoot'): KickRequest {
  const team = m.teams[p.team];
  const gx = (HALF_LENGTH + 0.3) * team.attackDir;
  const target = new Vector3(gx, clamp(aimY, BALL_RADIUS + 0.05, 2.3), clamp(aimZ, -GOAL_HALF_WIDTH + 0.25, GOAL_HALF_WIDTH - 0.25));
  const from = ballFrom(m);
  if (finesse) {
    const speed = 17 + power * 8;
    // curva hacia el centro del arco: si apunta a la izquierda del tirador, curva a la izquierda
    const toT = new Vector3(target.x - from.x, 0, target.z - from.z).normalize();
    const left = new Vector3(toT.z, 0, -toT.x);
    const toCenter = new Vector3(gx - from.x, 0, -from.z).normalize();
    const curveSign = toT.clone().sub(toCenter).dot(left) > 0 ? 1 : -1;
    const { velocity, spin } = curledShot(from, target, speed, curveSign, 50);
    return { kind: 'finesse', velocity, spin, power: 0.6 + power * 0.3, errorScale };
  }
  const speed = 15 + power * 17; // 15..32 m/s
  const velocity = aimedShotVelocity(from, target, speed);
  const spin = new Vector3(-velocity.z, 0, velocity.x).normalize().multiplyScalar(-8); // leve topspin
  return { kind, velocity, spin, power, errorScale };
}

/** Despeje largo hacia una zona del campo rival. */
export function buildClearance(m: Match, p: Player, errorScale: number): KickRequest {
  const team = m.teams[p.team];
  const side = Math.sign(m.ball.pos.z) || (m.rng.next() < 0.5 ? 1 : -1);
  const target = team.toWorld(10 + m.rng.next() * 15, side * (18 + m.rng.next() * 10));
  const req = buildLob(m, p, target, 38, errorScale, undefined, 'clear');
  return req;
}
