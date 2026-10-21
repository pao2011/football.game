import { Vector3 } from 'three';
import {
  GOAL_AREA_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, GRAVITY, HALF_LENGTH, PENALTY_AREA_DEPTH, PENALTY_AREA_HALF_WIDTH,
} from '../config/constants';
import type { Match } from '../sim/Match';
import type { Player } from '../sim/Player';
import { clamp, dist2D } from '../util/math';
import { buildClearance, buildGroundPass, buildLob } from './Actions';
import { PRED_DT, getBallPrediction, interceptFor } from './Predict';

/**
 * IA del arquero: posicionamiento en la bisectriz balón-arco, lectura de la trayectoria del tiro
 * con tiempo de reacción, estiradas, salidas (achicar) y distribución.
 */

interface GKState {
  threatSince: number; // instante en que detectó el tiro (-1 si no hay)
  reactAt: number;
  committed: boolean;
  /** Desde cuándo tiene el balón en los pies (-1 si no lo tiene). */
  feetSince: number;
}
const state = new WeakMap<Player, GKState>();

function gkState(p: Player): GKState {
  let s = state.get(p);
  if (!s) {
    s = { threatSince: -1, reactAt: 0, committed: false, feetSince: -1 };
    state.set(p, s);
  }
  return s;
}

const _v = new Vector3();

/**
 * Cruce del balón con el plano x = planeX. De cerca basta la recta con una corrección de arrastre (el arquero no es
 * infalible ante remates y cabezazos a quemarropa); de lejos usa la trayectoria completa (arrastre, viento, botes).
 */
function crossing(m: Match, planeX: number): { t: number; z: number; y: number } | null {
  const b = m.ball;
  if (Math.abs(b.vel.x) < 0.5) return null;
  if (Math.abs(b.pos.x - planeX) > 18) {
    const pts = getBallPrediction(m);
    const dir = Math.sign(b.vel.x);
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      if ((p1.x - planeX) * dir < 0) continue;
      const k = clamp((planeX - p0.x) / ((p1.x - p0.x) || 1), 0, 1);
      return { t: (i - 1 + k) * PRED_DT, z: p0.z + (p1.z - p0.z) * k, y: Math.max(0.11, p0.y + (p1.y - p0.y) * k) };
    }
    return null;
  }
  const t = (planeX - b.pos.x) / b.vel.x;
  if (t < 0 || t > 3) return null;
  const drag = 1 - 0.006 * b.speed * t; // corrección aproximada por arrastre
  const z = b.pos.z + b.vel.z * t * drag;
  let y = b.pos.y + b.vel.y * t - 0.5 * GRAVITY * t * t;
  if (y < 0.11) y = Math.min(0.5, Math.abs(y) * 0.3 + 0.11); // tras botar, balón bajo
  return { t, z, y };
}

/** Inicia una estirada hacia la posición lateral z con altura y. Usado por la IA y el humano (penales). */
export function requestDive(m: Match, gk: Player, dz: number, y: number, t: number) {
  if (gk.busy) return;
  const team = m.teams[gk.team];
  const dirZ = Math.sign(dz) || 1;
  const lift = clamp(y - 0.5, 0, 1.6);
  // v0 para recorrer dz en t con la frenada del Player (6.5 m/s²); los buenos arqueros llegan más lejos
  const tt = clamp(t, 0.3, 0.9);
  const speed = clamp(Math.max(Math.abs(dz) - 0.7, 0.3) / tt + 0.5 * 6.5 * tt, 2.5, 4.2 + gk.data.attrs.goalkeeping * 0.01);
  // izquierda del arquero (mirando hacia el campo): con attackDir +1 mira a +x → izquierda = -z
  const facingX = team.attackDir;
  const leftZ = -facingX; // z del lado izquierdo del arquero
  const anim = dirZ === leftZ ? 'gk_dive_left' : 'gk_dive_right';
  // variante de animación: 1 rasa, 2 alta (estirada larga a media altura)
  gk.startAction('dive', anim, 1.4, 0, { variant: y > 1.5 ? 2 : y < 0.6 ? 1 : 0 });
  gk.action.dir.set(0, lift, dirZ);
  gk.vel.set(0, 0, dirZ * speed);
  gk.facing = Math.atan2(facingX, 0);
}

export function updateGoalkeeperAI(m: Match, gk: Player, dt: number) {
  const team = m.teams[gk.team];
  const s = gkState(gk);
  gk.jockeying = false;
  gk.sprinting = false;
  const side = -team.attackDir; // lado de su arco
  const goalX = side * HALF_LENGTH;
  gk.desiredFacing = Math.atan2(team.attackDir, 0);

  if (!gk.mobile) {
    gk.desiredVel.set(0, 0, 0);
    return;
  }

  // --- Con el balón en las manos: distribución ---
  if (m.gkHolding === gk) {
    gk.desiredVel.set(0, 0, 0);
    if (m.time >= gk.nextDecisionAt && !gk.busy) distribute(m, gk);
    return;
  }

  // --- Con el balón en los pies (cesión o balón suelto): jugarlo enseguida, no quedarse quieto ---
  if (m.owner !== gk) s.feetSince = -1;
  if (m.owner === gk && m.phase === 'play') {
    playWithFeet(m, gk);
    return;
  }

  const ball = m.ball.pos;
  if (m.phase !== 'play' && m.phase !== 'shootout') {
    // posición de espera durante reanudaciones
    const tx = goalX - side * (m.restart?.type === 'penalty' ? 0.1 : 1.5);
    moveTo(gk, tx, clamp(ball.z * 0.15, -2, 2), 0.6);
    return;
  }

  // --- Pase de un compañero hacia él (cesión): salir a recibirlo, no esperarlo en la línea ---
  const lt = m.lastTouch;
  if (!m.owner && !m.ball.held && lt && lt.team === gk.team && lt.player !== gk && lt.deliberate && m.time - lt.time < 4 && m.intendedReceiver === gk) {
    const ic = interceptFor(m, gk, 1.6, 0.08);
    gk.sprinting = dist2D(gk.pos, ic.point) > 3;
    moveTo(gk, ic.point.x, ic.point.z, 1, 0.1);
    gk.desiredFacing = Math.atan2(ball.x - gk.pos.x, ball.z - gk.pos.z);
    return;
  }

  // --- Lectura de tiros ---
  const towardGoal = m.ball.vel.x * side > 2.5 && !m.owner;
  if (towardGoal) {
    const c = crossing(m, goalX);
    const onTarget = c && Math.abs(c.z) < GOAL_HALF_WIDTH + 0.7 && c.y < GOAL_HEIGHT + 0.6;
    if (onTarget) {
      if (s.threatSince < 0) {
        s.threatSince = m.time;
        const reaction = ((m.teams[gk.team].human ? 0.17 : m.diff.gkReaction) + 0.1) * (1.45 - gk.data.attrs.goalkeeping / 100);
        s.reactAt = m.time + reaction;
      }
      if (m.time >= s.reactAt) {
        const cg = crossing(m, gk.pos.x) ?? c!;
        const dz = cg.z - gk.pos.z;
        const reachStand = 0.75;
        if (Math.abs(dz) < reachStand && cg.y < 2.3) {
          // de pie: colocarse en la trayectoria
          moveTo(gk, gk.pos.x, cg.z, 1);
        } else if (cg.t < 0.8 && Math.abs(dz) < 4.8) {
          requestDive(m, gk, dz, cg.y, cg.t);
        } else {
          moveTo(gk, gk.pos.x, cg.z, 1);
        }
      } else {
        gk.desiredVel.set(0, 0, 0);
      }
      return;
    }
  }
  s.threatSince = -1;

  // --- Balón suelto en el área: salir a por él ---
  const inBox = Math.sign(ball.x) === side && Math.abs(ball.x) > HALF_LENGTH - PENALTY_AREA_DEPTH && Math.abs(ball.z) < PENALTY_AREA_HALF_WIDTH;
  if (!m.owner && inBox) {
    const mine = interceptFor(m, gk, 2.4, 0.1);
    const opp = m.otherTeam(team.index).active;
    let oppBest = Infinity;
    for (const o of opp) oppBest = Math.min(oppBest, interceptFor(m, o, 1.6, 0.1).t);
    if (mine.t < oppBest + 0.15 && Math.abs(mine.point.x) > HALF_LENGTH - PENALTY_AREA_DEPTH + 0.5) {
      gk.sprinting = true;
      moveTo(gk, mine.point.x, mine.point.z, 1, 0.1);
      return;
    }
  }

  // --- Salida ordenada por el humano (Y / W) ---
  if (team.gkRushUntil > m.time) {
    gk.sprinting = true;
    moveTo(gk, ball.x, ball.z, 1, 0.3);
    return;
  }

  // --- Mantener al arquero en la línea (doble toque de Y / W) ---
  const holdLine = team.gkHoldLineUntil > m.time;
  // --- Mano a mano: achicar ---
  const carrier = m.owner;
  if (carrier && carrier.team !== gk.team && !holdLine) {
    const cDist = dist2D(carrier.pos, { x: goalX, z: 0 });
    const defendersBetween = team.active.filter((d) => !d.isGK && Math.abs(d.pos.x - goalX) < Math.abs(carrier.pos.x - goalX) && Math.abs(d.pos.z - carrier.pos.z) < 6).length;
    if (cDist < 20 && defendersBetween === 0 && Math.abs(carrier.pos.z) < PENALTY_AREA_HALF_WIDTH) {
      const d = dist2D(gk.pos, carrier.pos);
      if (d < 2.4 && !gk.busy && m.rng.next() < dt * 4) {
        // estirada a los pies
        const dz = m.ball.pos.z - gk.pos.z;
        const dx = m.ball.pos.x - gk.pos.x;
        requestDive(m, gk, dz, 0.3, 0.3);
        gk.vel.set(dx * 2.5, 0, dz * 2.5);
        return;
      }
      gk.sprinting = true;
      // salir cerrando el ángulo
      const tx = carrier.pos.x + (goalX - carrier.pos.x) * 0.3;
      const tz = carrier.pos.z * 0.7;
      moveTo(gk, tx, tz, 1);
      return;
    }
  }

  // --- Posicionamiento: en la bisectriz entre balón y centro del arco ---
  _v.set(ball.x - goalX, 0, ball.z);
  const bd = _v.length();
  _v.normalize();
  const adv = clamp(bd * 0.1, 0.6, 4.2);
  let tx = goalX + _v.x * adv;
  let tz = _v.z * adv;
  // no salirse del área chica salvo situaciones especiales
  tx = side > 0 ? clamp(tx, HALF_LENGTH - GOAL_AREA_DEPTH, HALF_LENGTH - 0.3) : clamp(tx, -HALF_LENGTH + 0.3, -HALF_LENGTH + GOAL_AREA_DEPTH);
  tz = clamp(tz, -GOAL_HALF_WIDTH + 0.3, GOAL_HALF_WIDTH - 0.3);
  if (holdLine) tx = goalX - side * 0.6;
  // colocación manual (R3 + stick derecho): hacia un palo, adelante o atrás
  if (team.gkManualUntil > m.time) {
    tx = side > 0 ? clamp(tx + team.gkManual.x, HALF_LENGTH - GOAL_AREA_DEPTH, HALF_LENGTH - 0.3) : clamp(tx + team.gkManual.x, -HALF_LENGTH + 0.3, -HALF_LENGTH + GOAL_AREA_DEPTH);
    tz = clamp(tz + team.gkManual.z, -GOAL_HALF_WIDTH + 0.2, GOAL_HALF_WIDTH - 0.2);
  }
  // centros: el balón alto hacia el área chica
  if (m.ball.pos.y > 2 && !m.owner) {
    const ic = interceptFor(m, gk, 2.6, 0.1);
    if (Math.abs(ic.point.x) > HALF_LENGTH - GOAL_AREA_DEPTH - 1 && Math.abs(ic.point.z) < GOAL_HALF_WIDTH + 3 && ic.t < 1.6) {
      moveTo(gk, ic.point.x, ic.point.z, 1, 0.1);
      return;
    }
  }
  moveTo(gk, tx, tz, bd < 30 ? 0.9 : 0.5);
}

function moveTo(p: Player, x: number, z: number, factor: number, arrive = 0.25) {
  const dx = x - p.pos.x;
  const dz = z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < arrive) {
    p.desiredVel.set(0, 0, 0);
    return;
  }
  const sp = Math.min(factor * 8, d * 3);
  p.desiredVel.set((dx / d) * sp, 0, (dz / d) * sp);
}

/**
 * Arquero con el balón en los pies: pase raso a un compañero libre o, si un rival se le echa encima o no hay
 * nadie libre, despeje largo. Decide rápido (más rápido cuanto más cerca está el rival).
 */
function playWithFeet(m: Match, gk: Player) {
  const team = m.teams[gk.team];
  const opp = m.otherTeam(team.index).active;
  let press = Infinity;
  for (const o of opp) press = Math.min(press, dist2D(o.pos, gk.pos));
  // mientras decide, se acomoda el balón sin avanzar hacia su arco
  gk.desiredVel.set(0, 0, 0);
  gk.desiredFacing = Math.atan2(team.attackDir, 0);
  if (gk.busy) return;
  const s = gkState(gk);
  if (s.feetSince < 0 || m.time - s.feetSince > 6) s.feetSince = m.time;
  const think = press < 5 ? 0 : press < 10 ? 0.25 : 0.5 + (team.human ? 0 : m.diff.reaction);
  if (m.time - s.feetSince < think) return;
  const err = team.human ? 1 : m.diff.kickError;
  if (press > 4) {
    const cands = team.active
      .filter((q) => q !== gk)
      .map((q) => {
        let open = Infinity;
        for (const o of opp) {
          // rival cerca del receptor o en la línea de pase
          open = Math.min(open, dist2D(o.pos, q.pos), distToSegment(o.pos, gk.pos, q.pos) * 1.6);
        }
        return { q, d: dist2D(q.pos, gk.pos), open };
      })
      .filter((c) => c.d > 7 && c.d < 35 && c.open > 5)
      .sort((a, b) => b.open - a.open);
    if (cands.length) {
      const q = cands[0].q;
      if (m.requestKick(gk, buildGroundPass(m, gk, q.pos.clone().addScaledVector(q.vel, 0.4), 0.1, err, q))) s.feetSince = -1;
      return;
    }
  }
  if (m.requestKick(gk, buildClearance(m, gk, err))) s.feetSince = -1;
}

function distToSegment(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / Math.max(1e-6, abx * abx + abz * abz), 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

/** Saque del arquero: mano a un compañero libre o patada larga. */
function distribute(m: Match, gk: Player) {
  const team = m.teams[gk.team];
  const opp = m.otherTeam(team.index).active;
  const err = team.human ? 1 : m.diff.kickError;
  const candidates = team.active
    .filter((q) => q !== gk)
    .map((q) => {
      let open = Infinity;
      for (const o of opp) open = Math.min(open, dist2D(o.pos, q.pos));
      return { q, d: dist2D(q.pos, gk.pos), open };
    })
    .filter((c) => c.d > 8 && c.d < 32 && c.open > 6)
    .sort((a, b) => b.open - a.open);
  if (candidates.length && m.rng.next() < 0.7) {
    const q = candidates[0].q;
    const req = buildGroundPass(m, gk, q.pos, 0, err, q);
    req.kind = 'gkthrow';
    req.velocity.y = 1.2;
    req.velocity.multiplyScalar(0.9);
    m.requestKick(gk, req);
  } else {
    const fw = team.active.filter((q) => !q.isGK).sort((a, b) => team.u(b.pos) - team.u(a.pos))[m.rng.int(0, 2)];
    const target = fw ? fw.pos.clone() : team.toWorld(5, 0);
    const req = buildLob(m, gk, target, 34, err, fw);
    req.kind = 'punt';
    m.requestKick(gk, req);
  }
}

export { distribute as gkDistribute };
