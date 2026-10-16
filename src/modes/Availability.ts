// Disponibilidad de jugadores en los modos largos (torneo y carrera): lesiones, rojas y amarillas acumuladas.
import { FORMATIONS } from '../data/formations';
import { playerOverall } from '../data/teams';
import type { FormationId, TeamData } from '../data/types';

export interface AvailabilityState {
  /** Jugadores que no pueden jugar: partidos que les quedan y motivo. */
  out: Record<string, { games: number; reason: 'injury' | 'suspension' }>;
  /** Amarillas acumuladas (con 3, un partido de sanción). */
  yellows: Record<string, number>;
}

/** Amarillas acumuladas que suponen un partido de sanción. */
export const YELLOW_LIMIT = 3;

export function emptyAvailability(): AvailabilityState {
  return { out: {}, yellows: {} };
}

export interface Discipline {
  /** Ids con una amarilla (sin ser expulsados). */
  yellow: string[];
  /** Ids expulsados (roja directa o doble amarilla). */
  red: string[];
  /** Lesionados y partidos que se pierden. */
  injured: { id: string; games: number }[];
}

/** Lo que pasó en el partido a los jugadores de un equipo. */
export function disciplineOf(players: { data: { id: string }; yellowCards: number; sentOff: boolean; injured: boolean; injuryGames: number }[]): Discipline {
  const d: Discipline = { yellow: [], red: [], injured: [] };
  for (const p of players) {
    const id = p.data.id.replace(/~b$/, '');
    if (p.sentOff) d.red.push(id);
    else if (p.yellowCards > 0) d.yellow.push(id);
    if (p.injured) d.injured.push({ id, games: Math.max(1, p.injuryGames) });
  }
  return d;
}

export function isAvailable(av: AvailabilityState | undefined, id: string): boolean {
  return !av || !av.out[id];
}

/**
 * Tras un partido del equipo: los que estaban fuera cumplen un partido y se aplican las nuevas sanciones y
 * lesiones. Devuelve avisos para mostrar al usuario.
 */
export function applyAfterMatch(av: AvailabilityState, team: TeamData, d: Discipline): string[] {
  const msgs: string[] = [];
  const name = (id: string) => team.players.find((p) => p.id === id)?.name ?? id;
  for (const p of team.players) {
    const o = av.out[p.id];
    if (!o) continue;
    o.games--;
    if (o.games <= 0) {
      delete av.out[p.id];
      msgs.push(`${name(p.id)} vuelve a estar disponible`);
    }
  }
  for (const id of d.red) {
    av.out[id] = { games: Math.max(1, av.out[id]?.games ?? 0), reason: 'suspension' };
    msgs.push(`🟥 ${name(id)} sancionado: se pierde el próximo partido`);
  }
  for (const id of d.yellow) {
    const y = (av.yellows[id] ?? 0) + 1;
    if (y >= YELLOW_LIMIT) {
      av.yellows[id] = 0;
      if (!av.out[id]) av.out[id] = { games: 1, reason: 'suspension' };
      msgs.push(`🟨 ${name(id)} acumula ${YELLOW_LIMIT} amarillas: se pierde el próximo partido`);
    } else {
      av.yellows[id] = y;
    }
  }
  for (const { id, games } of d.injured) {
    const prev = av.out[id];
    av.out[id] = { games: Math.max(games, prev?.games ?? 0), reason: 'injury' };
    msgs.push(`🚑 ${name(id)} lesionado: ${games === 1 ? '1 partido' : `${games} partidos`} de baja`);
  }
  return msgs;
}

/**
 * Alineación válida: los no disponibles se cambian por el mejor suplente disponible (mismo puesto si se puede).
 * `lineup` son 11 ids en el orden de la formación.
 */
export function fixLineup(team: TeamData, formation: FormationId, lineup: string[], av: AvailabilityState | undefined): string[] {
  if (!av) return lineup;
  const slots = FORMATIONS[formation];
  const used = new Set(lineup.filter((id) => isAvailable(av, id)));
  const out = lineup.slice();
  lineup.forEach((id, i) => {
    if (isAvailable(av, id)) return;
    const pos = slots[i]?.position;
    const cands = team.players.filter((p) => !used.has(p.id) && isAvailable(av, p.id));
    const best = cands.filter((p) => p.position === pos).sort((a, b) => playerOverall(b) - playerOverall(a))[0]
      ?? cands.filter((p) => p.position !== 'GK' || pos === 'GK').sort((a, b) => playerOverall(b) - playerOverall(a))[0];
    if (best) {
      out[i] = best.id;
      used.add(best.id);
    }
  });
  return out;
}
