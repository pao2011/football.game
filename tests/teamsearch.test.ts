import { describe, expect, it } from 'vitest';
import { TEAMS } from '../src/data/teams';
import { LEAGUES } from '../src/data/leagues';
import { searchTeams, teamLeagueId } from '../src/ui/teamSearch';

describe('Buscador de equipos', () => {
  it('busca por nombre sin importar tildes ni mayúsculas', () => {
    const r = searchTeams(TEAMS, 'velez', 'all', 'az');
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((t) => /v[eé]lez/i.test(t.name))).toBe(true);
    expect(searchTeams(TEAMS, 'VÉLEZ', 'all', 'az').map((t) => t.id)).toEqual(r.map((t) => t.id));
  });
  it('filtra por liga', () => {
    for (const l of LEAGUES.filter((x) => x.teamIds().length)) {
      const r = searchTeams(TEAMS, '', l.id, 'az');
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((t) => teamLeagueId(t) === l.id)).toBe(true);
    }
  });
  it('ordena A-Z, Z-A y por valoración', () => {
    const az = searchTeams(TEAMS, '', 'lpf', 'az').map((t) => t.name);
    const za = searchTeams(TEAMS, '', 'lpf', 'za').map((t) => t.name);
    expect(za).toEqual([...az].reverse());
    const rt = searchTeams(TEAMS, '', 'lpf', 'rating').map((t) => t.rating);
    expect(rt).toEqual([...rt].sort((a, b) => b - a));
    const lg = searchTeams(TEAMS, '', 'all', 'league');
    expect(lg.length).toBe(TEAMS.length);
  });
  it('sin coincidencias devuelve lista vacía', () => {
    expect(searchTeams(TEAMS, 'zzzzqqq', 'all', 'az')).toEqual([]);
  });
});
