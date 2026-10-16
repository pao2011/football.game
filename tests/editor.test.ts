import { describe, expect, it } from 'vitest';
import { exportTeam, importTeam, newCustomTeam, setTeamLevel, shortOf, teamLevel } from '../src/data/customTeams';
import { TEAMS } from '../src/data/teams';
import { Tournament } from '../src/modes/Tournament';
import { makeMatch } from './helpers';

describe('Editor de equipos', () => {
  it('crea un equipo jugable con plantilla completa', () => {
    const t = newCustomTeam('Club Atlético Prueba', 80);
    expect(t.id.startsWith('custom-')).toBe(true);
    expect(t.players.length).toBe(18);
    expect(t.players[0].position).toBe('GK');
    expect(shortOf('Club Atlético Prueba')).toBe('CAP');
    const m = makeMatch({ home: t, away: TEAMS[1] });
    m.simulate(20);
    expect(Number.isFinite(m.ball.pos.x)).toBe(true);
  });

  it('el nivel sube o baja los atributos de toda la plantilla', () => {
    const t = newCustomTeam('Nivel', 70);
    const before = teamLevel(t);
    setTeamLevel(t, before + 10);
    expect(teamLevel(t)).toBeGreaterThanOrEqual(before + 8);
  });

  it('exportar e importar conserva el equipo con un id nuevo; un archivo inválido da error', () => {
    const t = newCustomTeam('Exportado', 75);
    t.players[9].name = 'Goleador Propio';
    const copy = importTeam(exportTeam(t));
    expect(copy.name).toBe('Exportado');
    expect(copy.id).not.toBe(t.id);
    expect(copy.players[9].name).toBe('Goleador Propio');
    expect(copy.players.every((p) => p.id.startsWith(copy.id))).toBe(true);
    expect(() => importTeam('no es json')).toThrow();
    expect(() => importTeam(JSON.stringify({ team: { name: 'x' } }))).toThrow();
  });

  it('el torneo con más de 8 equipos incluye siempre el del usuario', () => {
    const t = newCustomTeam('Mi Club', 78);
    TEAMS.push(t);
    try {
      const tour = Tournament.create(t.id, 5);
      const all = [...tour.state.groups.A, ...tour.state.groups.B];
      expect(all.length).toBe(8);
      expect(tour.state.groups.A).toContain(t.id);
    } finally {
      TEAMS.splice(TEAMS.indexOf(t), 1);
    }
  });
});
