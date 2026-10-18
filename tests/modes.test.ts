import { describe, expect, it } from 'vitest';
import { Tournament } from '../src/modes/Tournament';
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
    const t = Tournament.create('river', 123);
    let guard = 0;
    while (!t.finished && guard++ < 20) {
      const next = t.nextUserFixture();
      if (!next) break;
      // el usuario gana siempre por 2-0
      const userHome = next.home === 'river';
      t.recordUserResult(next, userHome ? 2 : 0, userHome ? 0 : 2);
    }
    expect(t.state.champion).toBe('river');
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

});
