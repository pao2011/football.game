import { describe, expect, it } from 'vitest';
import { NATIONS, TEAMS, getTeam } from '../src/data/teams';
import { NATION_CONFED } from '../src/data/nations';
import { NATION_ROSTERS } from '../src/data/nationRosters';
import { NATION_CUPS, Nations, nationCupEligible } from '../src/modes/Nations';

describe('Selecciones y sus competiciones', () => {
  it('hay 75 selecciones con plantilla, aparte de los clubes', () => {
    expect(NATIONS.length).toBe(75);
    expect(new Set(NATIONS.map((t) => t.id)).size).toBe(75);
    for (const t of NATIONS) {
      expect(t.players.length).toBe(18);
      expect(NATION_CONFED[t.id]).toBeDefined();
      expect(getTeam(t.id)).toBe(t);
      expect(TEAMS.includes(t)).toBe(false);
    }
  });

  it('los planteles reales tienen 18 jugadores, dorsales únicos y solo nombres de la lista de convocados', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const listed = new Set(fs.readFileSync('tests/fixtures/player-names.txt', 'utf8').split('\n'));
    const squads = Object.entries(NATION_ROSTERS);
    expect(squads.length).toBeGreaterThanOrEqual(50);
    const seen = new Map<string, string>();
    for (const [file, sq] of squads) {
      expect(sq.roster.length, file).toBe(18);
      expect(new Set(sq.roster.map((r) => r.number)).size, file).toBe(18);
      const team = getTeam(`nt_${file}`);
      expect(team.id, file).toBe(`nt_${file}`);
      sq.roster.forEach((r, i) => {
        if (!r.name) return; // sin jugador de la lista para ese puesto: nombre generado
        expect(listed.has(r.name), `${file}: ${r.name}`).toBe(true);
        expect(seen.get(r.name), `${r.name} repetido en ${file}`).toBeUndefined();
        seen.set(r.name, file);
        expect(team.players[i].name).toBe(r.name);
      });
      // los once titulares siempre son jugadores reales
      expect(sq.roster.slice(0, 11).every((r) => r.name), file).toBe(true);
    }
  });

  it('todas las competiciones se pueden jugar hasta el final con cualquier selección elegible', () => {
    for (const def of NATION_CUPS) {
      const eligible = nationCupEligible(def);
      expect(eligible.length).toBeGreaterThanOrEqual(2);
      // la mejor y la peor selección elegible: la del usuario siempre entra
      for (const user of [eligible[0], eligible[eligible.length - 1]]) {
        const n = Nations.create(def.id, user, 77);
        const teams = n.state.groups.flat();
        expect(teams).toContain(user);
        expect(new Set(teams).size).toBe(teams.length);
        expect(teams.length).toBe(def.groups === 0 ? 2 : def.groups * def.size);
        let guard = 0;
        while (!n.state.done && guard++ < 80) n.simulateUserFixture();
        expect(n.state.done, def.id).toBe(true);
        expect(n.state.fixtures.every((f) => f.played && f.venue)).toBe(true);
        if (def.qualify > 0 || def.groups === 0) {
          expect(teams).toContain(n.state.champion);
          expect(n.state.fixtures[n.state.fixtures.length - 1].stage).toBe('Final');
        } else {
          expect(n.state.champion).toBeNull();
          expect(n.userQualified).toBe(!n.state.eliminated);
        }
      }
    }
  });

  it('todas las selecciones tienen escudo y todas las competiciones su logo (ninguno dibujado)', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    for (const t of NATIONS) expect(fs.existsSync(`src/assets/crests/${t.id}.webp`), t.id).toBe(true);
    for (const c of NATION_CUPS) expect(fs.existsSync(`src/assets/leagues/${c.id}.webp`), c.id).toBe(true);
  });

  it('el Mundial respeta los cupos por confederación y la Eurocopa clasifica a 16', () => {
    const wc = Nations.create('mundial', 'nt_argentina', 5);
    const count = (c: string) => wc.state.groups.flat().filter((id) => NATION_CONFED[id] === c).length;
    expect([count('UEFA'), count('CONMEBOL'), count('CAF'), count('AFC'), count('CONCACAF'), count('OFC')]).toEqual([13, 5, 5, 5, 3, 1]);
    expect(wc.state.groups[0]).toContain('nt_argentina');
    const euro = Nations.create('euro', 'nt_espana', 5);
    while (!euro.state.done) euro.simulateUserFixture();
    expect(euro.state.fixtures.filter((f) => f.stage === 'Octavos de final').length).toBe(8);
  });
});
