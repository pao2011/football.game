import { LEAGUES, leagueOfTeam } from '../data/leagues';
import type { TeamData } from '../data/types';

export type TeamSort = 'az' | 'za' | 'rating' | 'ratingAsc' | 'league';

export const TEAM_SORTS: { id: TeamSort; label: string }[] = [
  { id: 'az', label: 'A - Z' },
  { id: 'za', label: 'Z - A' },
  { id: 'rating', label: 'Mejor valorados' },
  { id: 'ratingAsc', label: 'Menor valoración' },
  { id: 'league', label: 'Por liga' },
];

/** Minúsculas y sin acentos, para buscar "velez" y encontrar "Vélez". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Id de la liga del equipo ('' si no pertenece a ninguna, p. ej. equipos propios). */
export function teamLeagueId(t: TeamData): string {
  return leagueOfTeam(t.id)?.id ?? '';
}

export function leagueLabel(id: string): string {
  return LEAGUES.find((l) => l.id === id)?.name ?? 'Equipos propios';
}

/** Filtra por texto (nombre, sigla o ciudad) y liga, y ordena. */
export function searchTeams(teams: TeamData[], query: string, league: string, sort: TeamSort): TeamData[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const out = teams.filter((t) => {
    if (league !== 'all' && teamLeagueId(t) !== (league === 'custom' ? '' : league)) return false;
    if (!words.length) return true;
    const hay = normalize(`${t.name} ${t.short} ${t.city}`);
    return words.every((w) => hay.includes(w));
  });
  const byName = (a: TeamData, b: TeamData) => normalize(a.name).localeCompare(normalize(b.name), 'es');
  const order = (id: string) => { const i = LEAGUES.findIndex((l) => l.id === id); return i < 0 ? 999 : i; };
  // con texto: primero los que empiezan por lo escrito, luego los que lo contienen en el nombre y al final el resto (ciudad, sigla)
  const rel = (t: TeamData) => {
    if (!words.length) return 0;
    const n = normalize(t.name);
    return words.every((w) => n.split(/\s+/).some((x) => x.startsWith(w))) ? 0 : words.every((w) => n.includes(w)) ? 1 : 2;
  };
  const by = (a: TeamData, b: TeamData) => {
    switch (sort) {
      case 'za': return byName(b, a);
      case 'rating': return b.rating - a.rating || byName(a, b);
      case 'ratingAsc': return a.rating - b.rating || byName(a, b);
      case 'league': return order(teamLeagueId(a)) - order(teamLeagueId(b)) || byName(a, b);
      default: return byName(a, b);
    }
  };
  if (sort === 'league') return out.sort((a, b) => order(teamLeagueId(a)) - order(teamLeagueId(b)) || rel(a) - rel(b) || byName(a, b));
  return out.sort((a, b) => rel(a) - rel(b) || by(a, b));
}
