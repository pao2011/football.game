import { Vector3 } from 'three';
import {
  GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_DEPTH,
} from '../config/constants';
import { groundPassTime } from '../sim/Ball';
import type { Match } from '../sim/Match';
import type { Player } from '../sim/Player';
import type { Team } from '../sim/Team';
import { angleDiff, clamp, dist2D } from '../util/math';
import { buildClearance, buildCross, buildGroundPass, buildLob, buildShot, chooseCrossTarget, NORMAL_SHOT } from './Actions';
import type { SkillKind } from '../sim/types';
import { getBallPrediction, PRED_DT, PRED_STEPS, timeToReach } from './Predict';
import { isInPenaltyArea, offsideLineU } from '../sim/Rules';
import { groundPassVelocity } from '../sim/Kicks';
import { AERIAL_TIMING, angleTo, ballApproach, chooseAerial, type AerialKind } from '../sim/Aerial';

const _v = new Vector3();
const _w = new Vector3();

/** Estado de conducción por jugador (dirección elegida hasta la próxima decisión). */
const dribbleDir = new WeakMap<Player, Vector3>();

/** Estadísticas de decisiones (herramienta de depuración y pruebas). */
export const decisionLog: Record<string, number> = {};
export const debugOptions: string[] = [];

/** Escala de error de la IA: equipos humanos (compañeros) usan error neutro. */
function errScale(m: Match, p: Player) {
  return m.teams[p.team].human ? 1 : m.diff.kickError;
}

function moveTo(p: Player, target: { x: number; z: number }, speedFactor: number, arriveRadius = 0.6) {
  const dx = target.x - p.pos.x;
  const dz = target.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < arriveRadius) {
    p.desiredVel.set(0, 0, 0);
    return d;
  }
  // frenar al llegar (sin pasarse)
  const speed = Math.min(speedFactor * 9.5, d * 2.2);
  p.desiredVel.set((dx / d) * speed, 0, (dz / d) * speed);
  return d;
}

/** Orienta al jugador hacia el balón cuando está parado. */
function faceBall(m: Match, p: Player) {
  p.desiredFacing = Math.atan2(m.ball.pos.x - p.pos.x, m.ball.pos.z - p.pos.z);
}

export function updateOutfieldAI(m: Match, p: Player, dt: number) {
  p.jockeying = false;
  p.desiredFacing = NaN;
  p.sprinting = false;
  if (!p.mobile) {
    p.desiredVel.set(0, 0, 0);
    return;
  }
  if (m.phase !== 'play') {
    // Durante reanudaciones: ir a la posición táctica caminando
    moveTo(p, p.tacticalTarget, 0.55, 0.8);
    faceBall(m, p);
    return;
  }
  const team = m.teams[p.team];
  if (m.owner === p) {
    if (chestVolley(m, p, team)) return;
    carrierAI(m, p, team, dt);
    return;
  }
  // Cabezazo / volea ante balón aéreo cercano
  if (tryAerial(m, p, team)) return;

  const ball = m.ball.pos;
  const distTarget = dist2D(p.pos, p.tacticalTarget);
  switch (p.duty) {
    case 'chase':
    case 'receive': {
      p.sprinting = true;
      const d = moveTo(p, p.tacticalTarget, 1, 0.25);
      if (d < 0.6) {
        // ya en el punto: sale al encuentro del balón (no lo espera quieto); más despacio si viene muy fuerte
        faceBall(m, p);
        _v.set(ball.x - p.pos.x, 0, ball.z - p.pos.z);
        const bl = _v.length();
        if (bl < 15 && !m.owner) p.desiredVel.copy(_v.normalize().multiplyScalar(receiveApproach(m, p, bl)));
      }
      break;
    }
    case 'press':
      pressCarrier(m, p, team, dt);
      break;
    case 'cover':
      p.sprinting = distTarget > 6;
      moveTo(p, p.tacticalTarget, distTarget > 6 ? 1 : 0.7, 0.8);
      faceBall(m, p);
      break;
    case 'mark': {
      p.sprinting = distTarget > 5;
      moveTo(p, p.tacticalTarget, distTarget > 5 ? 1 : 0.7, 0.5);
      faceBall(m, p);
      // anticipación: si un pase va a su marca y puede cortarlo
      tryInterceptPass(m, p, team);
      break;
    }
    case 'run':
      p.sprinting = true;
      moveTo(p, p.tacticalTarget, 1, 1);
      break;
    case 'support':
      p.sprinting = distTarget > 8;
      moveTo(p, p.tacticalTarget, distTarget > 8 ? 1 : 0.65, 1.2);
      if (distTarget < 2) faceBall(m, p);
      break;
    default: {
      // Mantener posición: trote suave; correr si quedó muy descolocado
      const urgent = distTarget > (team.phase === 'attack' ? 9 : 7);
      p.sprinting = urgent;
      moveTo(p, p.tacticalTarget, urgent ? 1 : distTarget > 3 ? 0.8 : 0.45, 1.2);
      if (distTarget < 3) faceBall(m, p);
      tryInterceptPass(m, p, team);
    }
  }
}

/** Presión al portador: aproximación por el lado del arco, contención y entrada en el momento oportuno. */
function pressCarrier(m: Match, p: Player, team: Team, dt: number) {
  const c = m.owner;
  if (!c) {
    moveTo(p, p.tacticalTarget, 1);
    return;
  }
  const goal = team.ownGoal;
  _v.set(goal.x - c.pos.x, 0, goal.z - c.pos.z).normalize();
  const d = dist2D(p.pos, c.pos);
  // punto de contención: entre el portador y el arco
  const standOff = d > 4 ? 0.9 : 1.15;
  const tx = c.pos.x + _v.x * standOff + c.vel.x * 0.25;
  const tz = c.pos.z + _v.z * standOff + c.vel.z * 0.25;
  p.sprinting = d > 3.5;
  moveTo(p, { x: tx, z: tz }, d > 3.5 ? 1 : 0.8, 0.15);
  if (d < 3) {
    p.jockeying = d < 2.2;
    faceBall(m, p);
  }
  // Entrada: cuando el balón está al alcance y el rival no está protegiéndolo
  const ball = m.ball.pos;
  const f = p.forward(_w);
  const footX = p.pos.x + f.x * 0.7;
  const footZ = p.pos.z + f.z * 0.7;
  const ballToFoot = Math.hypot(ball.x - footX, ball.z - footZ);
  const facingBall = Math.abs(angleDiff(Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z), p.facing)) < 0.6;
  const eager = (team.human ? 1.2 : m.diff.tackleEagerness) * (0.5 + p.data.attrs.defending / 100);
  // el balón se moverá durante la preparación de la entrada: anticipar su posición
  const bx = ball.x + m.ball.vel.x * 0.17;
  const bz = ball.z + m.ball.vel.z * 0.17;
  const predFoot = Math.hypot(bx - footX, bz - footZ);
  if (facingBall && predFoot < 0.6 && m.rng.next() < eager * dt * 3) {
    m.requestTackle(p, false);
    return;
  }
  // Barrida: el portador se escapa y el balón está algo separado de su pie
  const ballAhead = dist2D(c.pos, ball);
  const behind = Math.cos(p.facing - c.facing) > 0.3;
  if (!behind && d > 1.6 && d < 3.2 && ballAhead > 0.7 && facingBall && p.data.attrs.defending > 60 && m.rng.next() < eager * dt * 0.35) {
    m.requestTackle(p, true);
  }
}

/** Corta un pase si su trayectoria pasa cerca y llega antes que el receptor. */
function tryInterceptPass(m: Match, p: Player, team: Team) {
  if (m.owner || m.ball.held) return;
  const lt = m.lastTouch;
  if (!lt || lt.team === team.index || m.time - lt.time > 2) return;
  const pts = getBallPrediction(m);
  for (let i = 1; i <= Math.min(PRED_STEPS, 20); i++) {
    const pt = pts[i];
    if (pt.y > 1.4) continue;
    const t = i * PRED_DT;
    const d = dist2D(p.pos, pt);
    if (d < 6 && d / 8 + 0.15 < t) {
      p.sprinting = true;
      moveTo(p, pt, 1, 0.2);
      return;
    }
  }
}

/**
 * Balones aéreos: cabezazos, remates acrobáticos (volea, tijera, chilena) cerca del arco rival, o dejar
 * caer el balón para controlarlo con el pecho o el muslo cuando no hay ningún rival encima.
 */
function tryAerial(m: Match, p: Player, team: Team): boolean {
  const b = m.ball;
  if (m.owner || b.held || b.pos.y < 0.35 || p.busy) return false;
  const pts = getBallPrediction(m);
  const goal = team.attackGoal;
  const rivals = m.otherTeam(team.index).active;
  // primer punto alcanzable de la trayectoria y, si lo hay, uno a la altura del pecho o del muslo sin rivales cerca
  let first: { pt: Vector3; t: number } | null = null;
  let head: { pt: Vector3; t: number } | null = null;
  let soft: Vector3 | null = null;
  // balón que baja a la altura de la volea justo donde está el jugador
  let low: { pt: Vector3; t: number } | null = null;
  for (let i = 1; i <= 14; i++) {
    const pt = pts[i];
    const t = i * PRED_DT;
    if (pt.y < 0.35 || pt.y > 2.7) continue;
    const d = dist2D(p.pos, pt);
    // llega a tiempo al punto (antes solo si ya estaba encima)
    if (d > 1.6 + t * 6) continue;
    // ¿Soy el más cercano de mi equipo a ese punto?
    if (team.active.some((q) => q !== p && !q.isGK && dist2D(q.pos, pt) < d - 0.3)) {
      if (!first) return false;
      continue;
    }
    if (!first) first = { pt, t };
    if (!head && pt.y >= 1.3) head = { pt, t };
    if (!low && pt.y >= 0.4 && pt.y <= 1.15 && d < 2.2 && !rivals.some((o) => dist2D(o.pos, pt) < d + 0.8)) low = { pt, t };
    const nearGoal = team.u(pt) > 0 && dist2D(pt, goal) < 20;
    if (!nearGoal && pt.y >= 0.5 && pt.y <= 1.65 && !rivals.some((o) => dist2D(o.pos, pt) < 3.5)) {
      soft = pt;
      break;
    }
  }
  if (!first) return false;
  // sin presión y lejos del arco: se espera el balón y se controla con el pecho o el muslo
  if (soft) {
    moveTo(p, soft, 1, 0.1);
    return true;
  }
  // remate acrobático cerca del arco (si el balón le baja a los pies, de volea)
  // (solo si el cabezazo tendría que ser muy bajo; a buena altura se va de cabeza)
  const { pt, t } = low && head && head.pt.y < 1.6 && first.pt.y < 1.6 && team.u(low.pt) > 0 && dist2D(low.pt, goal) < 20 ? low : first;
  if (team.u(pt) > 0 && dist2D(pt, goal) < 20 && pt.y < 2.35) {
    const kind = pickAerial(m, p, angleTo(p, goal.x, goal.z) > 1.9, pt.y);
    if (kind) {
      moveTo(p, pt, 1, 0.1);
      if (t <= AERIAL_TIMING[kind].contact + 0.06) m.requestKick(p, aerialShotDecision(m, p, team, kind));
      return true;
    }
  }
  // cabezazo
  if (!head) return false;
  moveTo(p, head.pt, 1, 0.1);
  if (head.t <= 0.3) m.requestKick(p, headerDecision(m, p, team));
  return true;
}

/** Cerca del arco, tras bajarla con el pecho o el muslo: volea antes de que el balón toque el suelo. */
function chestVolley(m: Match, p: Player, team: Team): boolean {
  const b = m.ball;
  if (b.pos.y < 0.35 || p.action.kind === 'kick' || p.action.kind === 'header') return false;
  const goal = team.attackGoal;
  if (team.u(p.pos) <= 0 || dist2D(p.pos, goal) > 18 || angleTo(p, goal.x, goal.z) > 1.6) return false;
  const ap = ballApproach(b, p, 0.7, 0.35, 1.2);
  if (!ap || ap.miss > 1.3) return false;
  if (ap.t > AERIAL_TIMING.volley.contact + 0.04) {
    // esperando a que caiga: de cara al arco
    p.desiredVel.set(0, 0, 0);
    p.desiredFacing = Math.atan2(goal.x - p.pos.x, goal.z - p.pos.z);
    return true;
  }
  return m.requestKick(p, aerialShotDecision(m, p, team, 'volley'));
}

/** Velocidad (m/s) con la que el receptor va hacia el balón que le llega: lo bastante para ganar la posición sin
 * pasarse del límite de control (un balón muy fuerte se amortigua mejor sin correr contra él). */
export function receiveApproach(m: Match, p: Player, dist: number): number {
  const ctrl = p.data.attrs.control / 100;
  const limit = 9 + ctrl * 13 - 1.5; // margen respecto al límite de control de touchBall
  const room = limit - m.ball.groundSpeed;
  return clamp(Math.min(room, 1 + dist * 0.5), 0.8, 4.5);
}

/** Pared en curso: jugador que corre tras pasar → compañero al que le pasó (quien debe devolvérsela). */
const wallFrom = new WeakMap<Player, Player>();

/** Rivales (sin el arquero) que tapan la línea de tiro hacia el centro del arco. */
function shotLaneBlockers(from: Vector3, goal: Vector3, opponents: Player[]): number {
  let n = 0;
  const dx = goal.x - from.x;
  const dz = goal.z - from.z;
  const len = Math.hypot(dx, dz);
  for (const o of opponents) {
    if (o.isGK) continue;
    const t = ((o.pos.x - from.x) * dx + (o.pos.z - from.z) * dz) / (len * len);
    if (t <= 0.05 || t >= 1) continue;
    const off = Math.abs((o.pos.x - from.x) * dz - (o.pos.z - from.z) * dx) / len;
    if (off < 1.2 + t * 2.5) n++;
  }
  return n;
}

/** Sorteo de remate acrobático, uno por jugador y por balón (para que no se repita cada fotograma). */
const aerialRoll = new WeakMap<Player, { touch: number; roll: number }>();

function pickAerial(m: Match, p: Player, backToGoal: boolean, y: number): AerialKind | null {
  const kind = chooseAerial(y, backToGoal);
  if (!kind || kind === 'volley') return kind;
  const touch = m.lastTouch?.time ?? 0;
  let r = aerialRoll.get(p);
  if (!r || r.touch !== touch) {
    r = { touch, roll: m.rng.next() };
    aerialRoll.set(p, r);
  }
  // la chilena y la tijera solo las intentan los buenos rematadores, y no siempre
  const sh = p.data.attrs.shooting;
  const chance = sh < 68 ? 0 : (kind === 'bicycle' ? 0.35 : 0.3) * (0.6 + (sh - 68) / 40) * (0.5 + 0.5 * m.diff.skillUse);
  if (r.roll < chance) return kind;
  // si no se anima: volea si el balón llega bajo; si no, cabezazo
  return y < 1.3 && !backToGoal ? 'volley' : null;
}

function aerialShotDecision(m: Match, p: Player, team: Team, kind: AerialKind) {
  const goal = team.attackGoal;
  const gk = m.otherTeam(team.index).goalkeeper;
  const side = gk ? (gk.pos.z > 0.3 ? -1 : gk.pos.z < -0.3 ? 1 : m.rng.next() < 0.5 ? -1 : 1) : 1;
  const z = side * (GOAL_HALF_WIDTH - 0.8);
  const req = buildShot(m, p, z, 0.5, 0.75, false, errScale(m, p), 'shoot');
  const hs = kind === 'volley' ? 23 : kind === 'scissor' ? 21 : 20;
  const h = Math.hypot(req.velocity.x, req.velocity.z) || 1;
  req.velocity.set((req.velocity.x / h) * hs, 0, (req.velocity.z / h) * hs);
  req.spin.set(0, 0, 0);
  req.style = undefined;
  req.aerial = kind;
  req.aimAt = new Vector3(goal.x, kind === 'volley' ? 0.6 : 0.9, z);
  req.power = 0.8;
  return req;
}

function headerDecision(m: Match, p: Player, team: Team) {
  const goal = team.attackGoal;
  const dGoal = dist2D(p.pos, goal);
  const err = errScale(m, p);
  if (dGoal < 16) {
    // cabezazo hacia abajo, al palo contrario de donde está el arquero
    const gk = m.otherTeam(team.index).goalkeeper;
    const side = gk ? (gk.pos.z > 0.3 ? -1 : gk.pos.z < -0.3 ? 1 : m.rng.next() < 0.5 ? -1 : 1) : 1;
    const z = side * (GOAL_HALF_WIDTH - 0.7);
    const req = buildShot(m, p, z, 0.35, 0.6, false, err * 1.1, 'header');
    req.velocity.multiplyScalar(0.8);
    req.velocity.y = Math.min(req.velocity.y, 0.3);
    req.aimAt = new Vector3(goal.x, 0, z);
    return req;
  }
  const ownHalf = team.u(p.pos) < 0;
  if (ownHalf) {
    // despeje de cabeza hacia arriba y hacia fuera
    const target = team.toWorld(team.u(p.pos) + 22, Math.sign(team.l(p.pos) || 1) * 20);
    _v.set(target.x - p.pos.x, 0, target.z - p.pos.z).normalize().multiplyScalar(14);
    _v.y = 6;
    return { kind: 'header' as const, velocity: _v.clone(), spin: new Vector3(), targetId: 'clear', power: 0.6, errorScale: err };
  }
  // peinada hacia un compañero
  const mate = team.active.filter((q) => q !== p && !q.isGK).sort((a, b) => dist2D(a.pos, p.pos) - dist2D(b.pos, p.pos))[0];
  const target = mate ? mate.pos : goal;
  _v.set(target.x - p.pos.x, 0, target.z - p.pos.z);
  const d = _v.length();
  _v.normalize().multiplyScalar(clamp(d * 0.7, 6, 15));
  _v.y = 3;
  return { kind: 'header' as const, velocity: _v.clone(), spin: new Vector3(), targetId: mate?.id ?? 'x', power: 0.5, errorScale: err };
}

// ----------------------------------------------------------------------
// Portador del balón
// ----------------------------------------------------------------------

interface Option {
  score: number;
  /** Ejecuta la opción; devolver false indica que no fue posible (se prueba la siguiente). */
  run: () => boolean | void;
  label: string;
}

/** Riesgo de intercepción de un pase raso: >0 seguro, <0 algún rival llega antes. */
function laneSafety(m: Match, from: Vector3, to: Vector3, speed: number, opponents: Player[]): number {
  let worst = 2;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  for (const o of opponents) {
    const t = clamp(((o.pos.x - from.x) * dx + (o.pos.z - from.z) * dz) / (len * len), 0, 1);
    const px = from.x + dx * t;
    const pz = from.z + dz * t;
    const dist = Math.hypot(o.pos.x - px, o.pos.z - pz);
    const tBall = groundPassTime(speed, len * t);
    const tOpp = Math.max(0, dist - 0.8) / 7 + 0.3;
    worst = Math.min(worst, tOpp - (Number.isFinite(tBall) ? tBall : 5));
  }
  return worst;
}

/** Ventaja (s) del receptor sobre el rival más rápido en llegar a un punto. */
function raceMargin(q: Player, pt: { x: number; z: number }, opponents: Player[]): number {
  const mine = timeToReach(q, pt, 0.1);
  let theirs = Infinity;
  for (const o of opponents) theirs = Math.min(theirs, timeToReach(o, pt, 0.25));
  return theirs - mine;
}

function nearestOpponentDist(opponents: Player[], pt: { x: number; z: number }) {
  let d = Infinity;
  for (const o of opponents) d = Math.min(d, dist2D(o.pos, pt));
  return d;
}

/** Calidad de una posición de tiro (≈ probabilidad de gol simplificada). */
export function shotQuality(m: Match, team: Team, from: Vector3, opponents: Player[]): number {
  const goal = team.attackGoal;
  const dx = goal.x - from.x;
  const d = Math.hypot(dx, from.z);
  if (team.u(from) < HALF_LENGTH - 32) return 0;
  // ángulo visible del arco
  const a1 = Math.atan2(GOAL_HALF_WIDTH - from.z, Math.abs(dx));
  const a2 = Math.atan2(-GOAL_HALF_WIDTH - from.z, Math.abs(dx));
  const angle = Math.abs(a1 - a2);
  let q = clamp(angle / 0.6, 0, 1) * clamp(1 - (d - 8) / 24, 0, 1);
  // bloqueos en el cono
  for (const o of opponents) {
    if (o.isGK) continue;
    const ox = o.pos.x - from.x;
    const oz = o.pos.z - from.z;
    const along = (ox * Math.sign(dx) * 1);
    if (along <= 0 || along > Math.abs(dx)) continue;
    const ang = Math.atan2(oz, Math.abs(ox));
    const center = Math.atan2(-from.z, Math.abs(dx));
    if (Math.abs(ang - center) < angle / 2 + 0.08 && Math.hypot(ox, oz) < 12) q *= 0.6;
  }
  return q;
}

function carrierAI(m: Match, p: Player, team: Team, dt: number) {
  const opponents = m.otherTeam(team.index).active;
  const ball = m.ball.pos;
  // presión inmediata: decidir antes
  const nearOpp = nearestOpponentDist(opponents, p.pos);
  const urgent = nearOpp < 2.2;
  if (m.time >= p.nextDecisionAt || (urgent && m.time >= p.nextDecisionAt - m.diff.reaction * 0.5)) {
    const human = team.human;
    const reaction = human ? 0.3 : m.diff.reaction;
    p.nextDecisionAt = m.time + reaction * (0.7 + m.rng.next() * 0.6);
    decide(m, p, team, opponents);
    if (p.busy) return;
  }
  // Conducción en la dirección elegida
  let dir = dribbleDir.get(p);
  if (!dir) {
    dir = new Vector3(team.attackDir, 0, 0);
    dribbleDir.set(p, dir);
  }
  // esquivar al rival más cercano por delante
  const avoid = new Vector3();
  for (const o of opponents) {
    const dx = p.pos.x - o.pos.x;
    const dz = p.pos.z - o.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 4 && d > 0.01) avoid.add(_v.set(dx / d, 0, dz / d).multiplyScalar((4 - d) / 4));
  }
  const want = _w.copy(dir).addScaledVector(avoid, 0.7);
  // no salirse del campo
  if (Math.abs(p.pos.z) > HALF_WIDTH - 3) want.z -= Math.sign(p.pos.z) * 0.8;
  if (Math.abs(p.pos.x) > HALF_LENGTH - 2) want.x -= Math.sign(p.pos.x) * 0.8;
  want.y = 0;
  want.normalize();
  const space = nearOpp;
  p.sprinting = space > 5 && team.u(p.pos) < HALF_LENGTH - 20;
  p.desiredVel.copy(want).multiplyScalar(9);
  void ball;
  void dt;
}

function decide(m: Match, p: Player, team: Team, opponents: Player[]) {
  const options: Option[] = [];
  const err = errScale(m, p);
  const pu = team.u(p.pos);
  const ballPos = m.ball.pos.clone();
  const offU = offsideLineU(m, team);
  const pressure = nearestOpponentDist(opponents, p.pos);

  // --- Tiro ---
  const sq = shotQuality(m, team, p.pos, opponents);
  if (sq > 0.05) {
    options.push({
      score: sq * 3.7 * (0.6 + p.data.attrs.shooting / 250) + (pu > HALF_LENGTH - 16 ? 0.6 : 0) + 0.15,
      label: 'shoot',
      run: () => aiShoot(m, p, team, err),
    });
  }

  // --- Tiro lejano: buen rematador, de frente al arco y con el rival encerrado en su área ---
  const goalPt = team.attackGoal;
  const dGoal = dist2D(p.pos, goalPt);
  const shooting = p.data.attrs.shooting;
  if (dGoal > 17 && dGoal < 30 && Math.abs(p.pos.z) < 16 && shooting >= 72 && pressure > 2.2) {
    const packed = opponents.filter((o) => !o.isGK && isInPenaltyArea(o.pos, goalPt.x > 0 ? 1 : -1)).length;
    const lane = shotLaneBlockers(p.pos, goalPt, opponents);
    const lsq = (shooting - 70) / 30 * clamp(1 - (dGoal - 17) / 16, 0.2, 1) * (lane === 0 ? 1 : lane === 1 ? 0.55 : 0.2);
    options.push({
      score: 0.5 + lsq * 1.7 + (packed >= 5 ? 0.45 : packed >= 4 ? 0.25 : 0),
      label: 'longshot',
      run: () => aiShoot(m, p, team, err),
    });
  }
  // ¿centro del campo tapado? (muchos rivales en el carril central por delante): se buscan las bandas
  const centralCrowd = opponents.filter((o) => !o.isGK && team.u(o.pos) > pu && Math.abs(o.pos.z) < 12 && team.u(o.pos) - pu < 30).length;

  // --- Pases ---
  for (const q of team.active) {
    if (q === p || q.sentOff) continue;
    const qu = team.u(q.pos);
    if (qu > offU + 0.1 && qu > team.u(ballPos)) continue; // en fuera de juego
    const lead = q.vel.clone().multiplyScalar(0.45);
    const target = q.pos.clone().add(lead);
    const d = dist2D(ballPos, target);
    if (d < 5 || d > 50) continue;
    if (q.isGK && (pu > -10 || pressure > 4)) continue;
    const speed = groundPassVelocity(ballPos, target).length();
    const safety = laneSafety(m, ballPos, target, speed, opponents);
    const tu = team.u(target);
    const progress = (tu - pu) / 25;
    const open = clamp(nearestOpponentDist(opponents, target) / 7, 0, 1);
    const danger = clamp((tu - (HALF_LENGTH - 35)) / 30, 0, 1);
    const receiverShot = shotQuality(m, team, target, opponents);
    let score = 0.55 + progress * 0.7 + open * 0.45 + danger * 0.45 + receiverShot * 0.8 - (d > 30 ? 0.15 : 0);
    if (progress < 0 && pressure > 3) score -= 0.25; // sin presión no se juega hacia atrás
    // juego por bandas: con el centro tapado, abrir a un compañero libre en la banda del último tercio
    if (centralCrowd >= 4 && Math.abs(target.z) > 15 && tu > HALF_LENGTH - 45 && open > 0.5) score += 0.3;
    // pared: devolver al compañero que acaba de pasar y sigue corriendo al espacio
    if (q.forcedRunUntil > m.time && wallFrom.get(q) === p && progress > 0) score += 0.35;
    if (safety < 0) score -= 1.2;
    else if (safety < 0.25) score -= 0.4;
    if (d <= 32 || safety >= 0) {
      options.push({
        score,
        label: 'pass',
        run: () => {
          const ok = m.requestKick(p, buildGroundPass(m, p, target, 0, err, q));
          // pared: tras un pase corto hacia delante en campo rival, el pasador sigue corriendo al espacio
          if (ok && d < 20 && progress > 0 && pu > -5 && p.slot.position !== 'DEF' && m.rng.next() < 0.55) {
            const run = team.toWorld(clamp(pu + 13, -HALF_LENGTH + 8, HALF_LENGTH - 6), clamp(team.l(p.pos) * 0.85, -HALF_WIDTH + 4, HALF_WIDTH - 4));
            if (nearestOpponentDist(opponents, run) > 3) {
              p.forcedRunUntil = m.time + 3;
              p.forcedRunTarget.copy(run);
              wallFrom.set(p, q);
            }
          }
          return ok;
        },
      });
    }
    // Pase elevado si el carril raso está tapado y el receptor está libre
    if (safety < 0.1 && d > 18 && open > 0.5 && progress > 0 && raceMargin(q, target, opponents) > 0.6) {
      const lobScore = 0.2 + progress * 0.6 + open * 0.4 + danger * 0.3 - 0.3;
      options.push({ score: lobScore, label: 'lob', run: () => m.requestKick(p, buildLob(m, p, target, clamp(18 + d * 0.35, 22, 40), err, q)) });
    }
    // Pase al hueco para quien desmarca
    if ((q.duty === 'run' || q.slot.position === 'FWD') && qu < HALF_LENGTH - 14) {
      const runDir = team.toWorld(1, 0).multiplyScalar(1);
      const tt = q.pos.clone().addScaledVector(runDir, 9 + q.data.attrs.speed / 20);
      tt.z = clamp(tt.z, -HALF_WIDTH + 3, HALF_WIDTH - 3);
      tt.x = clamp(tt.x, -HALF_LENGTH + 8, HALF_LENGTH - 8);
      const dd = dist2D(ballPos, tt);
      if (dd > 8 && dd < 45) {
        const sp = groundPassVelocity(ballPos, tt, 0.2).length();
        const sf = laneSafety(m, ballPos, tt, sp, opponents);
        // carrera: ¿llega el receptor al espacio antes que cualquier rival?
        const race = raceMargin(q, tt, opponents);
        const free = clamp(nearestOpponentDist(opponents, tt) / 6, 0, 1);
        const tScore = 0.5 + ((team.u(tt) - pu) / 25) * 0.6 + free * 0.4 + clamp((team.u(tt) - (HALF_LENGTH - 30)) / 20, 0, 1) * 0.5
          - (sf < 0 ? 1.1 : 0) - (race < 0.3 ? 1.2 : 0);
        options.push({ score: tScore, label: 'through', run: () => m.requestKick(p, buildGroundPass(m, p, tt, 0.25, err, q, 'through')) });
      }
    }
  }

  // --- Centro desde banda ---
  if (pu > HALF_LENGTH - 26 && Math.abs(p.pos.z) > 13) {
    // rematadores en el área o llegando a ella (corren a primer palo, penal y segundo palo)
    const inBox = team.active.filter((q) => q !== p && !q.isGK && (team.u(q.pos) > HALF_LENGTH - PENALTY_AREA_DEPTH - 4 || (q.duty === 'run' && team.u(q.tacticalTarget) > HALF_LENGTH - 18)) && Math.abs(team.l(q.pos)) < 16);
    if (inBox.length > 0) {
      const { receiver, point } = chooseCrossTarget(m, team, p);
      const nearByline = clamp((pu - (HALF_LENGTH - 26)) / 16, 0, 1);
      const style = m.rng.next() < 0.3 ? 'driven' as const : m.rng.next() < 0.15 ? 'low' as const : 'normal' as const;
      options.push({ score: 0.75 + Math.min(3, inBox.length) * 0.12 + nearByline * 0.7, label: 'cross', run: () => m.requestKick(p, buildCross(m, p, point, style, err, receiver)) });
    }
  }

  // --- Conducción ---
  const base = team.attackDir === 1 ? 0 : Math.PI; // ángulo hacia el arco rival en el plano (x)
  for (let k = -3; k <= 3; k++) {
    const ang = base + k * 0.45;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const ahead = { x: p.pos.x + dx * 6, z: p.pos.z + dz * 6 };
    if (Math.abs(ahead.z) > HALF_WIDTH - 1.5 || Math.abs(ahead.x) > HALF_LENGTH - 1) continue;
    const space = clamp(nearestOpponentDist(opponents, ahead) / 7, 0, 1);
    // progreso: en el último tercio se mide como acercamiento al arco (invita a diagonales hacia dentro)
    const goalPt = team.attackGoal;
    const prog = pu > HALF_LENGTH - 35
      ? (dist2D(p.pos, goalPt) - dist2D(ahead, goalPt)) / 6
      : (dx * team.attackDir * 6) / 6;
    const goalward = pu > HALF_LENGTH - 30 ? clamp(1 - Math.abs(ahead.z) / 25, 0, 1) * 0.3 : 0;
    const control = p.data.attrs.control / 100;
    const held = m.time - p.lastTouchAt;
    const score = 0.05 + space * 0.7 + prog * 0.45 + goalward + control * 0.15 - (pressure < 1.5 ? 0.3 : 0) - Math.max(0, held - 1.4) * (space < 0.5 ? 0.45 : 0.18) - (p.slot.position === 'DEF' ? 0.12 : 0);
    options.push({
      score,
      label: 'dribble',
      run: () => {
        const dir = dribbleDir.get(p) ?? new Vector3();
        dir.set(dx, 0, dz);
        dribbleDir.set(p, dir);
      },
    });
  }

  // --- Despeje bajo presión en campo propio ---
  if (pu < -HALF_LENGTH + 25 && pressure < 3) {
    options.push({ score: 0.55, label: 'clear', run: () => m.requestKick(p, buildClearance(m, p, err)) });
  }

  // --- Regate ante un rival encima ---
  const ctrlAttr = p.data.attrs.control;
  if (pressure < 2.6 && ctrlAttr >= 62) {
    const skillRate = team.human ? 0.25 : m.diff.skillUse;
    options.push({
      score: (0.55 + (ctrlAttr - 62) / 70 + (pu > HALF_LENGTH - 35 ? 0.15 : 0)) * skillRate + (m.rng.next() - 0.5) * 0.2,
      label: 'skill',
      run: () => aiSkill(m, p, team, opponents),
    });
  }

  // Elegir con ruido según dificultad
  const noise = team.human ? 0.2 : m.diff.decisionNoise;
  if (debugOptions.length < 40) debugOptions.push(options.slice().sort((a, b) => b.score - a.score).slice(0, 5).map((o) => `${o.label}:${o.score.toFixed(2)}`).join(" "));
  const ranked = options.map((o) => ({ o, s: o.score + (m.rng.next() - 0.5) * noise })).sort((a, b) => b.s - a.s);
  for (const { o } of ranked) {
    if (o.run() === false) continue;
    decisionLog[o.label] = (decisionLog[o.label] ?? 0) + 1;
    return;
  }
}

function aiShoot(m: Match, p: Player, team: Team, err: number) {
  const gk = m.otherTeam(team.index).goalkeeper;
  // Apuntar al palo más alejado del arquero
  const gkZ = gk ? gk.pos.z : 0;
  const side = gkZ > p.pos.z * 0.3 ? -1 : 1;
  const z = side * (GOAL_HALF_WIDTH - 0.5 - m.rng.next() * 0.8);
  const d = dist2D(p.pos, team.attackGoal);
  const y = 0.25 + m.rng.next() * (d > 16 ? 1.5 : 0.9);
  const power = clamp(0.55 + d / 50 + m.rng.next() * 0.15, 0.5, 0.92);
  // Elección del tipo de disparo según la situación (mismas opciones que el jugador humano)
  const gkOff = gk ? Math.abs(gk.pos.x - team.attackGoal.x) : 0;
  const shooting = p.data.attrs.shooting;
  const r = m.rng.next();
  const style = { ...NORMAL_SHOT };
  if (gkOff > 4.5 && d > 11 && d < 32 && r < 0.75) style.chip = true; // arquero adelantado: vaselina
  else if (d > 14 && d < 24 && r < 0.4) style.finesse = true; // rosca al palo largo
  else if (d < 14 && r < 0.45) style.low = true; // cerca: raso y cruzado
  else if (d > 18 && shooting > 78 && r < 0.65) style.power = true; // lejos con buen disparo: potente
  if (style.finesse && r < 0.12) style.low = true;
  if (style.low && shooting > 80 && r < 0.2) style.power = true;
  m.requestKick(p, buildShot(m, p, z, y, power, style, err));
}

/** Regate de la IA ante un rival encima (misma mecánica que el humano). */
function aiSkill(m: Match, p: Player, team: Team, opponents: Player[]): boolean {
  const fwd = p.forward();
  const left = new Vector3(fwd.z, 0, -fwd.x);
  let threat: Player | null = null;
  let td = 2.8;
  for (const o of opponents) {
    if (o.isGK || o.stunnedUntil > m.time) continue;
    const dx = o.pos.x - p.pos.x;
    const dz = o.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < td && (dx * fwd.x + dz * fwd.z) / Math.max(d, 0.01) > 0.2) { threat = o; td = d; }
  }
  if (!threat) return false;
  const lat = (threat.pos.x - p.pos.x) * left.x + (threat.pos.z - p.pos.z) * left.z;
  const away: 1 | -1 = lat > 0 ? -1 : 1; // salir hacia el lado contrario al rival
  const ctrl = p.data.attrs.control;
  const nearLine = Math.abs(p.pos.z) > HALF_WIDTH - 5;
  const r = m.rng.next();
  let kind: SkillKind;
  if (nearLine && r < 0.5) kind = 'dragback';
  else if (td < 1.6 && r < 0.4) kind = 'roulette';
  else if (ctrl > 82 && r < 0.18) kind = 'rainbow';
  else if (ctrl > 75 && r < 0.45) kind = 'elastico';
  else kind = 'stepover';
  return m.requestSkill(p, kind, away);
}

// ----------------------------------------------------------------------
// Balón parado ejecutado por la IA
// ----------------------------------------------------------------------

export function aiTakeSetPiece(m: Match, p: Player) {
  const r = m.restart;
  if (!r) return;
  const team = m.teams[p.team];
  const err = errScale(m, p);
  const opponents = m.otherTeam(team.index).active;
  const ball = m.ball.pos;
  const mates = team.active.filter((q) => q !== p);
  const freeMate = (maxD: number, minD = 4) => mates
    .filter((q) => !q.isGK || r.type === 'goalkick' === false)
    .map((q) => ({ q, d: dist2D(q.pos, ball), open: nearestOpponentDist(opponents, q.pos) }))
    .filter((x) => x.d < maxD && x.d > minD && x.open > 3)
    .sort((a, b) => (b.open - b.d * 0.15 + team.u(b.q.pos) * 0.05) - (a.open - a.d * 0.15 + team.u(a.q.pos) * 0.05))[0]?.q;

  switch (r.type) {
    case 'kickoff': {
      const q = mates.filter((x) => !x.isGK).sort((a, b) => dist2D(a.pos, ball) - dist2D(b.pos, ball))[0];
      if (q) m.requestKick(p, buildGroundPass(m, p, q.pos, 0, err, q));
      break;
    }
    case 'throwin': {
      const q = freeMate(18, 3) ?? mates.filter((x) => !x.isGK).sort((a, b) => dist2D(a.pos, ball) - dist2D(b.pos, ball))[0];
      const target = q ? q.pos.clone() : team.toWorld(team.u(ball) + 12, team.l(ball) * 0.8);
      const d = dist2D(ball, target);
      _v.set(target.x - ball.x, 0, target.z - ball.z).normalize().multiplyScalar(clamp(d * 0.75 + 4, 7, 17));
      _v.y = clamp(d * 0.25 + 2, 3, 6);
      m.requestKick(p, { kind: 'throwin', velocity: _v.clone(), spin: new Vector3(), targetId: q?.id, power: 0.4, errorScale: err });
      break;
    }
    case 'corner': {
      const { receiver, point } = chooseCrossTarget(m, team, p);
      m.requestKick(p, buildCross(m, p, point, m.rng.next() < 0.3 ? 'driven' : 'normal', err, receiver));
      break;
    }
    case 'goalkick': {
      const short = freeMate(25, 8);
      if (short && nearestOpponentDist(opponents, short.pos) > 7 && m.rng.next() < 0.6) {
        m.requestKick(p, buildGroundPass(m, p, short.pos, 0, err, short));
      } else {
        const fw = mates.filter((q) => !q.isGK).sort((a, b) => team.u(b.pos) - team.u(a.pos))[m.rng.int(0, 2)];
        const target = fw ? fw.pos.clone() : team.toWorld(10, 0);
        m.requestKick(p, buildLob(m, p, target, 32, err, fw, 'lob'));
      }
      break;
    }
    case 'freekick':
    case 'indirect': {
      const d = dist2D(ball, team.attackGoal);
      const angleOk = Math.abs(ball.z) < 18;
      if (r.type === 'freekick' && d < 30 && angleOk) {
        const side = m.rng.next() < 0.5 ? -1 : 1;
        m.requestKick(p, buildShot(m, p, side * (GOAL_HALF_WIDTH - 0.7), 1.7 + m.rng.next() * 0.4, 0.75, true, err));
      } else {
        const q = freeMate(35, 6);
        if (q) m.requestKick(p, buildGroundPass(m, p, q.pos, 0, err, q));
        else {
          const fw = mates.filter((x) => !x.isGK).sort((a, b) => team.u(b.pos) - team.u(a.pos))[0];
          m.requestKick(p, buildLob(m, p, fw.pos.clone(), 30, err, fw));
        }
      }
      break;
    }
    case 'penalty': {
      const side = m.rng.next() < 0.5 ? -1 : 1;
      const z = side * (GOAL_HALF_WIDTH - 0.55 - m.rng.next() * 1.2);
      const y = 0.25 + m.rng.next() * 1.4;
      m.requestKick(p, buildShot(m, p, z, y, 0.62 + m.rng.next() * 0.2, false, err, 'penalty'));
      break;
    }
    case 'dropball': {
      const q = freeMate(25, 4);
      if (q) m.requestKick(p, buildGroundPass(m, p, q.pos, 0, err, q));
      break;
    }
  }
}
