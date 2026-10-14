import { Vector3 } from 'three';
import { BALL_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH } from '../config/constants';
import type { Match } from '../sim/Match';
import type { KickRequest, Player } from '../sim/Player';
import { aimedShotVelocity, curledShot, groundPassVelocity, loftedVelocity, loftToPoint, solveKickThrough } from '../sim/Kicks';
import type { Team } from '../sim/Team';
import { dist2D } from '../util/math';
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

/** Tipo de centro (esquema clásico): normal (X), tenso (RB + X), bajo (X dos veces) y raso (X tres veces). */
export type CrossStyle = 'normal' | 'driven' | 'low' | 'ground';

/** Zonas de remate del área según el lado del centro: primer palo, punto de penal, segundo palo y borde. */
export function crossSpots(team: Team, side: number): Vector3[] {
  return [
    team.toWorld(HALF_LENGTH - 5.5, side * 2.8),
    team.toWorld(HALF_LENGTH - 10.5, side * 0.6),
    team.toWorld(HALF_LENGTH - 6.5, -side * 3.6),
    team.toWorld(HALF_LENGTH - 15, -side * 1.5),
  ];
}

/**
 * Elige a quién y a dónde centrar: rematadores que estén en el área o lleguen a ella (si van a una zona
 * de remate se apunta a esa zona), con espacio respecto de los defensores y, si se da, en la dirección pedida.
 */
export function chooseCrossTarget(m: Match, team: Team, p: Player, dir?: Vector3): { receiver: Player | null; point: Vector3 } {
  const side = Math.sign(team.l(p.pos)) || 1;
  const opp = m.otherTeam(team.index).active;
  let best: { receiver: Player | null; point: Vector3 } | null = null;
  let bestS = -Infinity;
  for (const q of team.active) {
    if (q === p || q.isGK || q.sentOff) continue;
    const u = team.u(q.pos);
    if (u < HALF_LENGTH - 28 || Math.abs(team.l(q.pos)) > 20) continue;
    // a dónde llegará: su zona de remate si corre hacia ella, si no, donde estará en ~0,9 s
    // tiempo de vuelo aproximado del centro: hasta ahí llega el rematador
    const flight = dist2D(p.pos, q.pos) / 21 + 0.2;
    let pt: Vector3;
    if (q.duty === 'run' && team.u(q.tacticalTarget) > HALF_LENGTH - 18) {
      // va hacia su zona de remate: hasta donde alcance a llegar durante el vuelo
      const d = dist2D(q.pos, q.tacticalTarget);
      const reach = Math.min(d, 6.8 * Math.max(0, flight - 0.15));
      pt = q.pos.clone().lerp(q.tacticalTarget, d > 0 ? reach / d : 0);
    } else {
      pt = q.pos.clone().addScaledVector(q.vel, Math.min(0.9, flight));
    }
    pt.y = 0;
    const pu = team.u(pt);
    if (pu > HALF_LENGTH - 2) continue;
    let space = Infinity;
    for (const o of opp) space = Math.min(space, dist2D(o.pos, pt));
    // defensores cerca de la trayectoria (los que pueden despejar de cabeza antes de que llegue)
    const sx = pt.x - p.pos.x;
    const sz = pt.z - p.pos.z;
    const sl2 = sx * sx + sz * sz || 1;
    let inLane = 0;
    for (const o of opp) {
      const k = ((o.pos.x - p.pos.x) * sx + (o.pos.z - p.pos.z) * sz) / sl2;
      if (k < 0.25 || k > 1) continue;
      const d = Math.hypot(p.pos.x + sx * k - o.pos.x, p.pos.z + sz * k - o.pos.z);
      if (d < 3.5) inLane += o.isGK ? 1.5 : 1;
    }
    const goalD = dist2D(pt, team.attackGoal);
    let score = Math.min(space, 5) * 0.5 - goalD * 0.08 + (q.data.attrs.shooting / 100) * 0.4 - inLane * 1.3 - Math.sqrt(sl2) * 0.04;
    if (dir && dir.lengthSq() > 0.01) {
      const vx = pt.x - p.pos.x;
      const vz = pt.z - p.pos.z;
      const d = Math.hypot(vx, vz) || 1;
      score += ((vx * dir.x + vz * dir.z) / d) * 1.4;
    }
    if (score > bestS) { bestS = score; best = { receiver: q, point: pt }; }
  }
  return best ?? { receiver: null, point: crossSpots(team, side)[1] };
}

/**
 * Centro con la física real: el balón pasa por `point` a la altura de remate (cabeza en el normal, más bajo
 * en el tenso y en el bajo) y se curva alejándose del arquero (hacia los rematadores).
 */
export function buildCross(m: Match, p: Player, point: Vector3, style: CrossStyle, errorScale: number, receiver?: Player | null): KickRequest {
  const from = ballFrom(m);
  const team = m.teams[p.team];
  if (style === 'ground') {
    const req = buildGroundPass(m, p, point, 0.7, errorScale, receiver ?? undefined);
    return { ...req, kind: 'cross' };
  }
  const dist = dist2D(from, point);
  const speed = style === 'driven' ? 19 + dist * 0.36 : style === 'low' ? 17 + dist * 0.32 : 18 + dist * 0.34;
  const height = style === 'driven' ? 1.45 : style === 'low' ? 0.75 : 1.85;
  const target = new Vector3(point.x, height, point.z);
  // efecto: curva alejándose del arco (hacia atrás, a la zona de los rematadores)
  const hx = (point.x - from.x) / Math.max(1e-3, dist);
  const hz = (point.z - from.z) / Math.max(1e-3, dist);
  const leftAway = (hz * -team.attackDir) > 0; // la izquierda del golpeo apunta hacia el propio campo
  const spinY = (style === 'low' ? 14 : 22) * (leftAway ? 1 : -1);
  // centro normal: bombeado (~24°) por encima de la primera línea; cae justo detrás del rematador,
  // así el balón le llega a la altura de la cabeza
  if (style === 'normal') {
    const beyond = new Vector3(point.x + hx * 1.0, 0.7, point.z + hz * 1.0);
    const lofted = loftedVelocity(from, beyond, 24).length();
    const s2 = solveKickThrough(from, beyond, Math.min(30, lofted), spinY, (24 * Math.PI) / 180);
    if (s2) return { kind: 'cross', velocity: s2.velocity, spin: s2.spin, targetId: receiver?.id, power: clamp(s2.velocity.length() / 32, 0.3, 1), errorScale };
    return buildLob(m, p, beyond, 24, errorScale, receiver ?? undefined, 'cross');
  }
  const sol = solveKickThrough(from, target, Math.min(32, speed), spinY);
  if (sol) return { kind: 'cross', velocity: sol.velocity, spin: sol.spin, targetId: receiver?.id, power: clamp(sol.velocity.length() / 32, 0.3, 1), errorScale };
  return buildLob(m, p, point, style === 'driven' ? 15 : 22, errorScale, receiver ?? undefined, 'cross');
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
