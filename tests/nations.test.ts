import { describe, expect, it } from 'vitest';
import { NATIONS, TEAMS, getTeam } from '../src/data/teams';
import { NATION_CONFED } from '../src/data/nations';
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
