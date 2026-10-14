import { HALF_LENGTH, PENALTY_AREA_DEPTH, PENALTY_AREA_HALF_WIDTH } from '../config/constants';
import type { Match } from './Match';
import type { Player } from './Player';
import type { Team } from './Team';

/**
 * ¿Está el punto dentro del área penal del arco situado en x = goalSide * HALF_LENGTH?
 */
export function isInPenaltyArea(p: { x: number; z: number }, goalSide: number): boolean {
  return Math.sign(p.x) === Math.sign(goalSide) && Math.abs(p.x) > HALF_LENGTH - PENALTY_AREA_DEPTH && Math.abs(p.x) <= HALF_LENGTH + 0.5 && Math.abs(p.z) < PENALTY_AREA_HALF_WIDTH;
}

/**
 * Coordenada u (en el marco del equipo atacante) del penúltimo defensor rival.
 * Regla 11: el atacante está en fuera de juego si está más cerca de la línea de meta rival
 * que el balón y que el penúltimo adversario, y en campo contrario.
 */
export function secondLastDefenderU(match: Match, attacking: Team): number {
  const defenders = match.otherTeam(attacking.index).active;
  const us = defenders.map((d) => attacking.u(d.pos)).sort((a, b) => b - a);
  return us.length >= 2 ? us[1] : us.length === 1 ? us[0] : HALF_LENGTH;
}

/** Conjunto de compañeros en posición de fuera de juego en el momento del pase de `passer`. */
export function evaluateOffsidePositions(match: Match, team: Team, passer: Player): Set<string> {
  const set = new Set<string>();
  const ballU = team.u(match.ball.pos);
  const lineU = secondLastDefenderU(match, team);
  for (const p of team.active) {
    if (p === passer) continue;
    const u = team.u(p.pos);
    if (u > 0 && u > ballU + 0.05 && u > lineU + 0.05) set.add(p.id);
  }
  return set;
}

/** Línea de fuera de juego actual (para la IA y la ayuda visual). */
export function offsideLineU(match: Match, attacking: Team): number {
  const ballU = attacking.u(match.ball.pos);
  return Math.max(secondLastDefenderU(match, attacking), Math.min(ballU, HALF_LENGTH), 0);
}
