import { describe, expect, it } from 'vitest';
import { Tournament } from '../src/modes/Tournament';
import { Career } from '../src/modes/Career';
import { computeStandings, roundRobin } from '../src/modes/Competition';

describe('Competiciones', () => {
  it('todos contra todos: cada equipo juega contra todos una vez (ida y vuelta duplica)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fx = roundRobin(ids, true, (r) => `J${r}`, 'x');
    expect(fx.length).toBe(30);
    for (const id of ids) expect(fx.filter((f) => f.home === id || f.away === id).length).toBe(10);
  });

  it('la clasificación suma 3 puntos por victoria y 1 por empate', () => {
    const fx = roundRobin(['a', 'b'], false, () => 'J', 'x');
    fx[0].played = true;
    fx[0].homeGoals = 2;
    fx[0].awayGoals = 1;
    const t = computeStandings(['a', 'b'], fx);
    expect(t[0].points).toBe(3);
    expect(t[1].points).toBe(0);
  });

  it('el torneo avanza de grupos a semifinales y final hasta tener campeón', () => {
    const t = Tournament.create('aurora', 123);
    let guard = 0;
    while (!t.finished && guard++ < 20) {
      const next = t.nextUserFixture();
      if (!next) break;
      // el usuario gana siempre por 2-0
      const userHome = next.home === 'aurora';
      t.recordUserResult(next, userHome ? 2 : 0, userHome ? 0 : 2);
    }
    expect(t.state.champion).toBe('aurora');
    expect(t.state.fixtures.filter((f) => f.stage === 'Semifinal').length).toBe(2);
    expect(t.state.fixtures.some((f) => f.stage === 'Final')).toBe(true);
  });

  it('el torneo se completa aunque el usuario quede eliminado', () => {
    const t = Tournament.create('rayo', 77);
    let guard = 0;
    while (!t.finished && guard++ < 20) {
      const next = t.nextUserFixture();
      if (!next) break;
      const userHome = next.home === 'rayo';
      t.recordUserResult(next, userHome ? 0 : 3, userHome ? 3 : 0);
    }
    expect(t.state.eliminated).toBe(true);
    expect(t.state.champion).not.toBeNull();
  });

  it('la carrera completa una temporada de 14 jornadas y progresa a la siguiente', () => {
    const c = Career.create('brasa', 5);
    expect(c.totalRounds).toBe(14);
    let guard = 0;
    while (!c.state.seasonOver && guard++ < 20) {
      const next = c.nextUserFixture()!;
      c.recordUserResult(next, 1, 1, []);
    }
    expect(c.state.seasonOver).toBe(true);
    const table = c.standings();
    expect(table.every((r) => r.played === 14)).toBe(true);
    const res = c.startNextSeason();
    expect(c.state.season).toBe(2);
    expect(c.state.history.length).toBe(1);
    expect(res.position).toBeGreaterThan(0);
    expect(c.state.fixtures.every((f) => !f.played)).toBe(true);
  });
});
