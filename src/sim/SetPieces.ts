import { Vector3 } from 'three';
import {
  CENTER_CIRCLE_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_DEPTH, PENALTY_AREA_HALF_WIDTH,
} from '../config/constants';
import { shapeTarget } from '../ai/TeamAI';
import { clamp, dist2D } from '../util/math';
import type { Match, Restart } from './Match';
import type { Player } from './Player';
import type { Team } from './Team';

export type RestartType = 'kickoff' | 'throwin' | 'corner' | 'goalkick' | 'freekick' | 'indirect' | 'penalty' | 'dropball';

export const RESTART_LABELS: Record<RestartType, string> = {
  kickoff: 'Saque inicial',
  throwin: 'Saque de banda',
  corner: 'Saque de esquina',
  goalkick: 'Saque de arco',
  freekick: 'Tiro libre directo',
  indirect: 'Tiro libre indirecto',
  penalty: 'Penal',
  dropball: 'Balón a tierra',
};

const _v = new Vector3();

function face(p: Player, target: { x: number; z: number }) {
  p.facing = Math.atan2(target.x - p.pos.x, target.z - p.pos.z);
}

/**
 * Coloca a los jugadores para una reanudación y devuelve el ejecutor.
 * Los jugadores se reubican de forma instantánea (corte de cámara), como en los juegos de fútbol.
 */
export function placeForRestart(m: Match, r: Restart): Player | null {
  const att = m.teams[r.team];
  const def = m.otherTeam(r.team);
  const spot = r.spot;
  // Base: posiciones de formación según el balón
  for (const t of m.teams) {
    for (const p of t.active) {
      if (p.isGK) {
        const gx = -t.attackDir * (HALF_LENGTH - 1);
        p.pos.set(gx, 0, clamp(spot.z * 0.1, -2, 2));
        p.facing = Math.atan2(t.attackDir, 0);
      } else {
        shapeTarget(m, t, p, t === att, _v);
        p.pos.copy(_v);
        face(p, spot);
      }
    }
  }
  let taker: Player | null = null;
  const outfield = (t: Team) => t.active.filter((p) => !p.isGK);

  switch (r.type) {
    case 'kickoff': {
      for (const t of m.teams) {
        for (const p of outfield(t)) {
          // todos en su propio campo
          const u = Math.min(t.u(p.pos), -1.2);
          p.pos.x = u * t.attackDir;
          if (t !== att && Math.hypot(p.pos.x, p.pos.z) < CENTER_CIRCLE_RADIUS + 0.5) {
            const k = (CENTER_CIRCLE_RADIUS + 0.8) / Math.max(0.1, Math.hypot(p.pos.x, p.pos.z));
            p.pos.x *= k;
            p.pos.z *= k;
          }
          face(p, { x: 0, z: 0 });
        }
      }
      const fwds = outfield(att).sort((a, b) => b.slot.depth - a.slot.depth);
      taker = fwds[0];
      taker.pos.set(-att.attackDir * 0.6, 0, 0.15);
      face(taker, spot);
      if (fwds[1]) { fwds[1].pos.set(-att.attackDir * 1.5, 0, 7); face(fwds[1], spot); }
      break;
    }
    case 'throwin': {
      taker = nearest(outfield(att), spot);
      const sz = Math.sign(spot.z);
      taker.pos.set(spot.x, 0, sz * (HALF_WIDTH + 0.3));
      face(taker, { x: spot.x + att.attackDir * 6, z: 0 });
      // los rivales a 2 m
      keepAway(def, spot, 2.5);
      break;
    }
    case 'corner': {
      const goalX = att.attackDir * HALF_LENGTH;
      const sideZ = Math.sign(spot.z);
      taker = outfield(att).sort((a, b) => b.data.attrs.passing - a.data.attrs.passing)[0];
      taker.pos.set(spot.x - Math.sign(goalX) * 0.6, 0, spot.z + sideZ * 0.6);
      face(taker, { x: goalX - Math.sign(goalX) * 11, z: 0 });
      // atacantes en el área: primer palo, punto penal, segundo palo, frontal
      const spots = [
        [6, sideZ * 2.5], [11, 0], [7, -sideZ * 3], [5, 0.5], [16, sideZ * 6], [17, -sideZ * 7],
      ];
      const attackers = outfield(att).filter((p) => p !== taker).sort((a, b) => (b.data.height + b.slot.depth) - (a.data.height + a.slot.depth));
      attackers.forEach((p, i) => {
        if (i < spots.length) p.pos.set(goalX - Math.sign(goalX) * spots[i][0], 0, spots[i][1]);
        else p.pos.set(-Math.sign(goalX) * 2 + goalX * 0.1, 0, (i - 7) * 10); // se quedan atrás
        face(p, spot);
      });
      // defensores marcando en el área
      const defenders = outfield(def).sort((a, b) => a.slot.depth - b.slot.depth);
      defenders.forEach((p, i) => {
        const a = attackers[i];
        if (a && i < 7) {
          p.pos.set(a.pos.x + Math.sign(goalX) * 0.9, 0, a.pos.z + (a.pos.z > 0 ? -0.4 : 0.4));
        } else {
          p.pos.set(goalX * 0.6, 0, (i - 8) * 8);
        }
        face(p, spot);
      });
      break;
    }
    case 'goalkick': {
      taker = att.goalkeeper ?? outfield(att)[0];
      taker.pos.set(spot.x - att.attackDir * 0.8, 0, spot.z);
      face(taker, { x: 0, z: 0 });
      // rivales fuera del área
      for (const p of def.active) {
        if (p.isGK) continue;
        if (Math.abs(p.pos.x) > HALF_LENGTH - PENALTY_AREA_DEPTH - 1 && Math.sign(p.pos.x) === Math.sign(spot.x)) {
          p.pos.x = Math.sign(spot.x) * (HALF_LENGTH - PENALTY_AREA_DEPTH - 2);
        }
      }
      break;
    }
    case 'freekick':
    case 'indirect':
    case 'dropball': {
      const goal = att.attackGoal;
      const cands = outfield(att);
      const distGoal = dist2D(spot, goal);
      const fkId = att.data.setPieces?.freeKick;
      const designated = distGoal < 32 && fkId ? cands.find((p) => p.data.id === fkId && !p.sentOff) : undefined;
      taker = designated ?? (distGoal < 32
        ? cands.sort((a, b) => b.data.attrs.shooting - a.data.attrs.shooting)[0]
        : nearest(cands, spot));
      _v.set(goal.x - spot.x, 0, goal.z - spot.z).normalize();
      taker.pos.set(spot.x - _v.x * 1.2, 0, spot.z - _v.z * 1.2);
      face(taker, distGoal < 40 ? goal : { x: spot.x + att.attackDir * 10, z: spot.z });
      // barrera
      keepAway(def, spot, 9.15);
      if (distGoal < 35 && r.type !== 'dropball') {
        const n = distGoal < 22 ? 4 : distGoal < 28 ? 3 : 2;
        const wall = outfield(def).sort((a, b) => dist2D(a.pos, spot) - dist2D(b.pos, spot)).slice(0, n);
        const wc = new Vector3(spot.x + _v.x * 9.15, 0, spot.z + _v.z * 9.15);
        // la barrera cubre el palo más cercano al balón
        const lat = new Vector3(-_v.z, 0, _v.x);
        const shift = clamp(-spot.z * 0.04, -0.6, 0.6);
        wall.forEach((p, i) => {
          const o = (i - (n - 1) / 2) * 0.62 + shift;
          p.pos.set(wc.x + lat.x * o, 0, wc.z + lat.z * o);
          face(p, spot);
          p.frozen = true;
        });
        // atacantes al área
        const runners = outfield(att).filter((p) => p !== taker).sort((a, b) => b.slot.depth - a.slot.depth).slice(0, 4);
        runners.forEach((p, i) => {
          p.pos.copy(att.toWorld(HALF_LENGTH - 12 - (i % 2) * 3, (i - 1.5) * 4));
          face(p, spot);
        });
      }
      break;
    }
    case 'penalty': {
      const goalX = att.attackDir * HALF_LENGTH;
      const cands = outfield(att).sort((a, b) => b.data.attrs.shooting - a.data.attrs.shooting);
      const penId = att.data.setPieces?.penalty;
      taker = (penId ? cands.find((p) => p.data.id === penId && !p.sentOff) : undefined) ?? cands[0];
      taker.pos.set(spot.x - att.attackDir * 2.2, 0, -0.5);
      face(taker, { x: goalX, z: 0 });
      const gk = def.goalkeeper;
      if (gk) {
        gk.pos.set(goalX - att.attackDir * 0.15, 0, 0);
        gk.facing = Math.atan2(-att.attackDir, 0);
      }
      // resto fuera del área y detrás del punto penal
      let i = 0;
      for (const p of m.active) {
        if (p === taker || p.isGK) continue;
        const edgeU = HALF_LENGTH - PENALTY_AREA_DEPTH - 1.5 - (i % 2) * 1.5;
        p.pos.set(att.attackDir * edgeU, 0, (i - 9) * 2.2);
        face(p, spot);
        i++;
      }
      break;
    }
  }
  // nadie (salvo el ejecutor) pegado al balón
  for (const p of m.active) {
    if (p === taker) continue;
    const d = dist2D(p.pos, spot);
    if (d < 1.2) {
      p.pos.x += (p.pos.x - spot.x || 1) * 1.5;
    }
    p.pos.x = clamp(p.pos.x, -HALF_LENGTH + 0.5, HALF_LENGTH - 0.5);
    p.pos.z = clamp(p.pos.z, -HALF_WIDTH - 0.5, HALF_WIDTH + 0.5);
  }
  void GOAL_HALF_WIDTH;
  void PENALTY_AREA_HALF_WIDTH;
  return taker;
}

function nearest(ps: Player[], spot: { x: number; z: number }): Player {
  return ps.slice().sort((a, b) => dist2D(a.pos, spot) - dist2D(b.pos, spot))[0];
}

function keepAway(t: Team, spot: Vector3, r: number) {
  for (const p of t.active) {
    if (p.isGK) continue;
    const dx = p.pos.x - spot.x;
    const dz = p.pos.z - spot.z;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      const k = (r + 0.3) / Math.max(d, 0.1);
      p.pos.x = spot.x + (d < 0.1 ? r + 0.3 : dx * k);
      p.pos.z = spot.z + (d < 0.1 ? 0 : dz * k);
    }
  }
}
