import { Vector3 } from 'three';
import { HALF_LENGTH, HALF_WIDTH } from '../config/constants';
import type { Match } from '../sim/Match';
import type { Player } from '../sim/Player';
import type { Team } from '../sim/Team';
import { clamp, dist2D } from '../util/math';
import { interceptFor, type Intercept } from './Predict';
import { offsideLineU } from '../sim/Rules';

/**
 * Sistema táctico de equipo: decide la fase (ataque / defensa / transición), calcula la
 * posición de cada jugador según su puesto en la formación desplazada por el balón y
 * asigna tareas dinámicas: presión, cobertura, marca, apoyo, desmarque y persecución.
 */

export const interceptCache = new WeakMap<Player, Intercept>();

const _t = new Vector3();

/** Posición de la formación para un jugador dada la fase y la posición del balón. */
export function shapeTarget(m: Match, team: Team, p: Player, attacking: boolean, out = new Vector3()): Vector3 {
  const s = p.slot;
  const ball = m.ball.pos;
  const ballU = team.u(ball);
  const ballL = team.l(ball);
  const lineHeight = team.human ? 0.45 : m.diff.lineHeight;
  let u: number;
  let l: number;
  if (attacking) {
    const center = clamp(ballU * 0.75 + 11, -22, 34);
    u = center + (s.depth - 0.45) * 72;
    l = s.lateral * HALF_WIDTH * (Math.abs(s.lateral) > 0.6 ? 0.95 : 0.8) + ballL * 0.15;
    // los laterales y mediocampistas con libertad se incorporan cuando el balón avanza
    if (ballU > 0) u += s.attackFreedom * ballU * 0.12;
  } else {
    const center = clamp(ballU * 0.62 - 11 + (lineHeight - 0.45) * 16, -38, 10);
    u = center + (s.depth - 0.45) * 44;
    l = s.lateral * HALF_WIDTH * 0.58 + ballL * 0.42;
    // los delanteros se quedan algo más arriba para salir al contragolpe
    if (s.position === 'FWD') u += 6;
  }
  if (attacking && s.position !== 'GK') {
    // Respetar la línea del fuera de juego (salvo si va por detrás del balón)
    const off = offsideLineU(m, team);
    if (u > off - 0.6) u = Math.max(off - 0.6, Math.min(u, ballU));
  }
  if (!attacking && s.position === 'DEF') {
    // la línea defensiva no se adelanta más allá de lo razonable
    u = Math.min(u, ballU - 4);
  }
  u = clamp(u, -HALF_LENGTH + 4, HALF_LENGTH - 6);
  l = clamp(l, -HALF_WIDTH + 2.5, HALF_WIDTH - 2.5);
  return team.toWorld(u, l, out);
}

export function updateTeamTactics(m: Match, team: Team) {
  const other = m.otherTeam(team.index);
  const poss = m.possessionTeam;
  const attacking = poss === team.index;
  team.phase = poss === team.index ? 'attack' : poss === other.index ? 'defend' : 'transition';
  const players = team.active.filter((p) => !p.isGK);

  // Intercepciones (para persecuciones de balón suelto)
  for (const p of team.active) interceptCache.set(p, interceptFor(m, p, 1.6, 0.12 + (team.human ? 0.05 : m.diff.reaction * 0.3)));

  for (const p of players) {
    shapeTarget(m, team, p, attacking || (team.phase === 'transition' && m.lastTouch?.team === team.index), p.tacticalTarget);
    p.duty = 'shape';
    p.markTarget = null;
  }
  const gk = team.goalkeeper;
  if (gk) gk.duty = 'shape';

  if (m.phase !== 'play') return;

  const ball = m.ball.pos;
  const carrier = m.owner ?? m.gkHolding;

  if (carrier && carrier.team === team.index) {
    // --------- ATAQUE CON POSESIÓN ---------
    carrier.duty = 'carrier';
    const cu = team.u(carrier.pos);
    // Apoyos: los dos más cercanos se ofrecen para el pase corto
    const byDist = players.filter((p) => p !== carrier).sort((a, b) => dist2D(a.pos, carrier.pos) - dist2D(b.pos, carrier.pos));
    const supporters = byDist.slice(0, 2);
    for (const s of supporters) {
      s.duty = 'support';
      supportSpot(m, team, carrier, s, s.tacticalTarget);
    }
    // Desmarques al espacio de los delanteros si el portador puede filtrar
    const off = offsideLineU(m, team);
    for (const p of players) {
      if (p === carrier || p.duty === 'support') continue;
      if ((p.slot.position === 'FWD' || p.slot.attackFreedom > 0.8) && cu > -20) {
        const pu = team.u(p.pos);
        const timing = Math.abs(pu - off) < 3 && cu > -10;
        if (timing) {
          p.duty = 'run';
          // corre a la espalda de la defensa, por su carril
          const lane = clamp(team.l(p.pos), -HALF_WIDTH + 4, HALF_WIDTH - 4);
          team.toWorld(Math.min(off + 14, HALF_LENGTH - 8), lane * 0.85, p.tacticalTarget);
        }
      }
    }
  } else if (carrier && carrier.team === other.index) {
    // --------- DEFENSA ---------
    const pressers = assignPress(m, team, carrier, players);
    // Marcas: cada defensor/medio sin tarea se ocupa del rival más peligroso de su zona
    const opponents = other.active.filter((o) => o !== carrier && !o.isGK);
    const taken = new Set<Player>();
    const markers = players.filter((p) => !pressers.includes(p));
    // Prioridad: los rivales más adelantados (más cerca de nuestro arco)
    opponents.sort((a, b) => other.u(b.pos) - other.u(a.pos));
    for (const o of opponents) {
      const ou = other.u(o.pos);
      if (ou < -8) continue; // en su campo: zona, no marca
      let best: Player | null = null;
      let bestD = 14;
      for (const p of markers) {
        if (taken.has(p)) continue;
        const d = dist2D(p.tacticalTarget, o.pos);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) {
        taken.add(best);
        best.duty = 'mark';
        best.markTarget = o;
        // posición entre el rival y nuestro arco, algo hacia el balón
        const goal = team.ownGoal;
        _t.set(goal.x - o.pos.x, 0, goal.z - o.pos.z).normalize();
        best.tacticalTarget.set(o.pos.x + _t.x * 1.6 + (ball.x - o.pos.x) * 0.08, 0, o.pos.z + _t.z * 1.6 + (ball.z - o.pos.z) * 0.08);
      }
    }
  } else {
    // --------- BALÓN SUELTO / TRANSICIÓN ---------
    // El más rápido en llegar va a por el balón; si el rival llega antes, un segundo jugador cubre.
    let best: Player | null = null;
    let bestT = Infinity;
    for (const p of players) {
      const ic = interceptCache.get(p)!;
      if (ic.t < bestT) { bestT = ic.t; best = p; }
    }
    let oppBest = Infinity;
    for (const o of other.active) {
      const ic = interceptCache.get(o) ?? interceptFor(m, o);
      oppBest = Math.min(oppBest, ic.t);
    }
    if (best) {
      best.duty = 'chase';
      best.tacticalTarget.copy(interceptCache.get(best)!.point);
      // si la pelota va hacia un compañero (pase), él es el receptor
      const rec = m.intendedReceiver;
      if (rec && rec.team === team.index && rec !== best && !rec.isGK) {
        const ic = interceptCache.get(rec)!;
        if (ic.t < bestT + 0.6) {
          best.duty = 'shape';
          shapeTarget(m, team, best, true, best.tacticalTarget);
          rec.duty = 'receive';
          rec.tacticalTarget.copy(ic.point);
        }
      }
    }
    if (oppBest < bestT - 0.3) {
      // segundo hombre: cerrar la línea hacia el arco
      const second = players.filter((p) => p.duty === 'shape').sort((a, b) => dist2D(a.pos, ball) - dist2D(b.pos, ball))[0];
      if (second) {
        second.duty = 'cover';
        const goal = team.ownGoal;
        second.tacticalTarget.set(ball.x + (goal.x - ball.x) * 0.25, 0, ball.z + (goal.z - ball.z) * 0.25);
      }
    }
  }

  // Evitar aglomeraciones: separar objetivos demasiado próximos
  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (a.duty !== 'shape') continue;
    for (let j = 0; j < players.length; j++) {
      if (i === j) continue;
      const b = players[j];
      const dx = a.tacticalTarget.x - b.tacticalTarget.x;
      const dz = a.tacticalTarget.z - b.tacticalTarget.z;
      const d = Math.hypot(dx, dz);
      if (d < 6 && d > 1e-3) {
        a.tacticalTarget.x += (dx / d) * (6 - d) * 0.5;
        a.tacticalTarget.z += (dz / d) * (6 - d) * 0.5;
      }
    }
    a.tacticalTarget.x = clamp(a.tacticalTarget.x, -HALF_LENGTH + 2, HALF_LENGTH - 2);
    a.tacticalTarget.z = clamp(a.tacticalTarget.z, -HALF_WIDTH + 2, HALF_WIDTH - 2);
  }
}

/** Asigna presionadores (presión al portador y cobertura). */
function assignPress(m: Match, team: Team, carrier: Player, players: Player[]): Player[] {
  const n = team.human ? (team.teammatePressUntil > m.time ? 2 : 1) : m.diff.pressers;
  const pressDist = team.human ? 18 : m.diff.pressDistance;
  const sorted = players.filter((p) => !(team.human && p === team.controlled && team.teammatePressUntil <= m.time)).sort((a, b) => dist2D(a.pos, carrier.pos) - dist2D(b.pos, carrier.pos));
  const res: Player[] = [];
  const carrierU = team.u(carrier.pos);
  // En campo propio se presiona siempre; en campo rival depende de la intensidad
  const deep = carrierU < -10;
  for (let i = 0; i < sorted.length && res.length < Math.max(1, n); i++) {
    const p = sorted[i];
    const d = dist2D(p.pos, carrier.pos);
    if (d > pressDist && !deep && res.length > 0) break;
    if (res.length === 0) {
      p.duty = 'press';
      p.tacticalTarget.copy(carrier.pos);
    } else {
      p.duty = 'cover';
      const goal = team.ownGoal;
      // cubre el espacio detrás del presionador, en línea con el arco
      p.tacticalTarget.set(carrier.pos.x + (goal.x - carrier.pos.x) * 0.18, 0, carrier.pos.z + (goal.z - carrier.pos.z) * 0.18);
    }
    res.push(p);
  }
  return res;
}

/** Busca un hueco de apoyo libre de rivales a 8-16 m del portador. */
function supportSpot(m: Match, team: Team, carrier: Player, p: Player, out: Vector3) {
  const other = m.otherTeam(team.index);
  let bestScore = -Infinity;
  const base = out.clone();
  const cu = team.u(carrier.pos);
  for (let k = 0; k < 10; k++) {
    const ang = (k / 10) * Math.PI * 2;
    const r = 11;
    const cx = carrier.pos.x + Math.cos(ang) * r;
    const cz = carrier.pos.z + Math.sin(ang) * r;
    if (Math.abs(cx) > HALF_LENGTH - 3 || Math.abs(cz) > HALF_WIDTH - 2) continue;
    let space = 20;
    for (const o of other.active) space = Math.min(space, Math.hypot(o.pos.x - cx, o.pos.z - cz));
    // línea de pase libre
    let laneClear = 1;
    for (const o of other.active) {
      const t = ((o.pos.x - carrier.pos.x) * (cx - carrier.pos.x) + (o.pos.z - carrier.pos.z) * (cz - carrier.pos.z)) / (r * r);
      if (t <= 0 || t >= 1) continue;
      const px = carrier.pos.x + (cx - carrier.pos.x) * t;
      const pz = carrier.pos.z + (cz - carrier.pos.z) * t;
      if (Math.hypot(o.pos.x - px, o.pos.z - pz) < 2) laneClear = 0;
    }
    const progress = (team.u({ x: cx }) - cu) / 11;
    const stayNear = -Math.hypot(cx - base.x, cz - base.z) / 15;
    const score = space / 8 + laneClear * 1.2 + progress * 0.6 + stayNear;
    if (score > bestScore) {
      bestScore = score;
      out.set(cx, 0, cz);
    }
  }
}
