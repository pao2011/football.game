import type { TeamData } from '../data/types';
import { Rng } from '../util/math';

export interface Fixture {
  id: string;
  home: string;
  away: string;
  round: number; // jornada o ronda
  stage: string; // 'Grupo A', 'Semifinal', 'Jornada 3'...
  played: boolean;
  homeGoals: number;
  awayGoals: number;
  /** Penales en eliminatorias. */
  pens?: [number, number];
  knockout: boolean;
  /** Estadio neutral (id) si el partido no se juega en la cancha del local. */
  venue?: string;
  /** Eliminatoria a ida y vuelta: llave a la que pertenece y partido (1 = ida, 2 = vuelta). */
  tie?: string;
  leg?: 1 | 2;
}

export interface StandingRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export function computeStandings(teamIds: string[], fixtures: Fixture[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const t of teamIds) rows.set(t, { team: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });
  for (const f of fixtures) {
    if (!f.played || f.knockout) continue;
    const h = rows.get(f.home);
    const a = rows.get(f.away);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += f.homeGoals; h.ga += f.awayGoals;
    a.gf += f.awayGoals; a.ga += f.homeGoals;
    if (f.homeGoals > f.awayGoals) { h.won++; a.lost++; h.points += 3; }
    else if (f.homeGoals < f.awayGoals) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  return [...rows.values()].sort((x, y) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.localeCompare(y.team));
}

/** Calendario de todos contra todos (método del círculo). doubleRound: ida y vuelta. */
export function roundRobin(teamIds: string[], doubleRound: boolean, stage: (round: number) => string, idPrefix: string): Fixture[] {
  const ids = teamIds.slice();
  if (ids.length % 2) ids.push('__bye');
  const n = ids.length;
  const rounds: Fixture[] = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === '__bye' || b === '__bye') continue;
      const swap = (r + i) % 2 === 1;
      rounds.push({ id: `${idPrefix}-${r}-${i}`, home: swap ? b : a, away: swap ? a : b, round: r + 1, stage: stage(r + 1), played: false, homeGoals: 0, awayGoals: 0, knockout: false });
    }
    arr.splice(1, 0, arr.pop()!);
  }
  if (doubleRound) {
    const second = rounds.map((f) => ({ ...f, id: f.id + 'v', home: f.away, away: f.home, round: f.round + (n - 1), stage: stage(f.round + (n - 1)) }));
    return rounds.concat(second);
  }
  return rounds;
}

/**
 * Simulación rápida de un partido que no juega el usuario (modelo de Poisson según la media de los equipos).
 * Se usa para el resto de la jornada en torneo y carrera, de forma instantánea.
 */
export function quickSim(home: TeamData, away: TeamData, rng: Rng, knockout: boolean, homeRating = home.rating, awayRating = away.rating): { h: number; a: number; pens?: [number, number] } {
  const diff = (homeRating - awayRating) / 10;
  const lh = Math.max(0.3, 1.45 + diff * 0.45 + 0.15);
  const la = Math.max(0.3, 1.2 - diff * 0.45);
  const poisson = (l: number) => {
    let k = 0;
    let p = Math.exp(-l);
    let s = p;
    const u = rng.next();
    while (u > s && k < 9) { k++; p *= l / k; s += p; }
    return k;
  };
  const h = poisson(lh);
  const a = poisson(la);
  if (knockout && h === a) {
    let ph = 0, pa = 0;
    for (let i = 0; i < 5; i++) { if (rng.next() < 0.76) ph++; if (rng.next() < 0.76) pa++; }
    while (ph === pa) { if (rng.next() < 0.76) ph++; if (rng.next() < 0.76) pa++; }
    return { h, a, pens: [ph, pa] };
  }
  return { h, a };
}

export function winnerOf(f: Fixture): string | null {
  if (!f.played) return null;
  if (f.homeGoals > f.awayGoals) return f.home;
  if (f.awayGoals > f.homeGoals) return f.away;
  if (f.pens) return f.pens[0] > f.pens[1] ? f.home : f.away;
  return null;
}
