import type { Match } from './Match';
import type { Player } from './Player';

/** Valoración (3,0 – 10,0) de un jugador al final del partido, como en las retransmisiones. */
export interface PlayerRating {
  player: Player;
  team: 0 | 1;
  rating: number;
  /** Minutos jugados. */
  minutes: number;
  /** Resumen corto: "2 goles · 1 asist. · 4 atajadas"… */
  line: string;
}

/** Valoraciones de todos los que jugaron (titulares, suplentes que entraron y sustituidos). */
export function playerRatings(m: Match): PlayerRating[] {
  const out: PlayerRating[] = [];
  const total = Math.max(m.minute, 90);
  for (const t of m.teams) {
    const other = m.teams[t.index === 0 ? 1 : 0];
    const conceded = other.stats.goals;
    const diff = t.stats.goals - conceded;
    for (const p of [...t.players, ...t.subbedOff]) {
      const s = p.ps;
      const to = s.to >= 0 ? s.to : total;
      const minutes = Math.max(0, Math.min(total, to) - s.from);
      if (minutes <= 0 && s.passes + s.shots + p.goals === 0) continue;
      const share = Math.min(1, minutes / 90);
      let r = 6.0;
      r += p.goals * 1.15 + s.assists * 0.75;
      r += s.onTarget * 0.22 - (s.shots - s.onTarget) * 0.06;
      r += s.passesOk * 0.025 - (s.passes - s.passesOk) * 0.07;
      r += s.tackles * 0.18 + s.saves * 0.42 - s.fouls * 0.12;
      r -= p.yellowCards * 0.4 + (p.sentOff && s.to >= 0 ? 1.8 : 0);
      // resultado del equipo (según el tiempo en el campo)
      r += (diff > 0 ? 0.35 : diff < 0 ? -0.35 : 0) * share;
      if (p.isGK || p.data.position === 'GK') r += conceded === 0 ? 0.6 * share : -0.3 * conceded * share;
      else if (p.data.position === 'DEF') r += conceded === 0 ? 0.35 * share : -0.12 * conceded * share;
      r = Math.round(Math.max(3, Math.min(10, r)) * 10) / 10;
      const parts: string[] = [];
      if (p.goals) parts.push(`${p.goals} gol${p.goals > 1 ? 'es' : ''}`);
      if (s.assists) parts.push(`${s.assists} asist.`);
      if (s.saves) parts.push(`${s.saves} atajada${s.saves > 1 ? 's' : ''}`);
      if (s.tackles >= 2) parts.push(`${s.tackles} entradas`);
      if (s.passes >= 5) parts.push(`${Math.round((s.passesOk / s.passes) * 100)}% pases`);
      if (s.from > 0) parts.push(`entró ${s.from}'`);
      out.push({ player: p, team: t.index as 0 | 1, rating: r, minutes, line: parts.join(' · ') });
    }
  }
  return out;
}

/** Jugador del partido: la mejor valoración (con desempate para el equipo ganador). */
export function manOfTheMatch(m: Match, ratings = playerRatings(m)): PlayerRating | null {
  const r = m.result;
  let best: PlayerRating | null = null;
  for (const x of ratings) {
    const score = x.rating + (r.winner === x.team ? 0.3 : 0) + x.minutes * 0.001;
    const bs = best ? best.rating + (r.winner === best.team ? 0.3 : 0) + best.minutes * 0.001 : -1;
    if (score > bs) best = x;
  }
  return best;
}
