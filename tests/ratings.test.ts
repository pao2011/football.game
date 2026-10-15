import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { manOfTheMatch, playerRatings } from '../src/sim/Ratings';

describe('Valoraciones y jugador del partido', () => {
  it('un partido completo da valoraciones de 3 a 10 a todos los que jugaron', () => {
    const m = makeMatch({ seed: 2 });
    m.simulate(420);
    expect(m.finished).toBe(true);
    const r = playerRatings(m);
    const played = m.teams.reduce((n, t) => n + t.players.length + t.subbedOff.length, 0);
    expect(r.length).toBe(played);
    for (const x of r) {
      expect(x.rating).toBeGreaterThanOrEqual(3);
      expect(x.rating).toBeLessThanOrEqual(10);
    }
    const passes = m.teams.reduce((n, t) => n + [...t.players, ...t.subbedOff].reduce((k, p) => k + p.ps.passes, 0), 0);
    expect(passes).toBe(m.teams[0].stats.passes + m.teams[1].stats.passes);
    const mvp = manOfTheMatch(m, r);
    expect(mvp).not.toBeNull();
    expect(mvp!.rating).toBe(Math.max(...r.map((x) => x.rating)) >= mvp!.rating ? mvp!.rating : -1);
  });

  it('goles y asistencias suben la nota', () => {
    const m = makeMatch({ seed: 5 });
    const [a, b] = [m.teams[0].players[9], m.teams[0].players[8]];
    a.goals = 2;
    b.ps.assists = 2;
    m.teams[0].stats.goals = 2;
    const r = playerRatings(m);
    const ra = r.find((x) => x.player === a)!;
    const rb = r.find((x) => x.player === b)!;
    const other = r.find((x) => x.player === m.teams[0].players[7])!;
    expect(ra.rating).toBeGreaterThan(other.rating + 2);
    expect(rb.rating).toBeGreaterThan(other.rating + 1);
    expect(ra.line).toContain('2 goles');
    expect(manOfTheMatch(m, r)!.player).toBe(a);
  });
});
