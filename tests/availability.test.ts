import { describe, expect, it } from 'vitest';
import { applyAfterMatch, emptyAvailability, fixLineup, isAvailable, YELLOW_LIMIT } from '../src/modes/Availability';
import { TEAMS } from '../src/data/teams';
import { Career } from '../src/modes/Career';
import { makeMatch } from './helpers';

const team = structuredClone(TEAMS[0]);
const ids = team.players.map((p) => p.id);

describe('Lesiones y sanciones (torneo y carrera)', () => {
  it('la roja sanciona un partido y después vuelve', () => {
    const av = emptyAvailability();
    applyAfterMatch(av, team, { yellow: [], red: [ids[5]], injured: [] });
    expect(isAvailable(av, ids[5])).toBe(false);
    applyAfterMatch(av, team, { yellow: [], red: [], injured: [] });
    expect(isAvailable(av, ids[5])).toBe(true);
  });

  it(`${YELLOW_LIMIT} amarillas acumuladas = un partido de sanción`, () => {
    const av = emptyAvailability();
    for (let i = 0; i < YELLOW_LIMIT - 1; i++) applyAfterMatch(av, team, { yellow: [ids[3]], red: [], injured: [] });
    expect(isAvailable(av, ids[3])).toBe(true);
    const msgs = applyAfterMatch(av, team, { yellow: [ids[3]], red: [], injured: [] });
    expect(isAvailable(av, ids[3])).toBe(false);
    expect(msgs.join(' ')).toContain('amarillas');
    expect(av.yellows[ids[3]]).toBe(0);
  });

  it('una lesión deja fuera varios partidos', () => {
    const av = emptyAvailability();
    applyAfterMatch(av, team, { yellow: [], red: [], injured: [{ id: ids[7], games: 2 }] });
    applyAfterMatch(av, team, { yellow: [], red: [], injured: [] });
    expect(isAvailable(av, ids[7])).toBe(false);
    applyAfterMatch(av, team, { yellow: [], red: [], injured: [] });
    expect(isAvailable(av, ids[7])).toBe(true);
  });

  it('la alineación cambia a los no disponibles por suplentes del mismo puesto', () => {
    const av = emptyAvailability();
    const lineup = ids.slice(0, 11);
    av.out[lineup[4]] = { games: 1, reason: 'injury' };
    const fixed = fixLineup(team, team.formation, lineup, av);
    expect(fixed).not.toContain(lineup[4]);
    expect(new Set(fixed).size).toBe(11);
    const repl = team.players.find((p) => p.id === fixed[4])!;
    const orig = team.players.find((p) => p.id === lineup[4])!;
    expect(repl.position).toBe(orig.position);
  });

  it('la carrera aplica las bajas tras el partido del usuario', () => {
    const c = Career.create(TEAMS[0].id, 7);
    const fx = c.nextUserFixture()!;
    const msgs = c.recordUserResult(fx, 1, 0, [], { yellow: [], red: [c.state.lineup[2]], injured: [] });
    expect(msgs.length).toBe(1);
    expect(c.matchLineup()).not.toContain(c.state.lineup[2]);
  });

  it('en el partido, una lesión pide el cambio del lesionado', () => {
    const m = makeMatch({ seed: 4 });
    const p = m.teams[0].players[6];
    m.injure(p);
    expect(p.injured).toBe(true);
    expect(p.injuryGames).toBeGreaterThanOrEqual(1);
    expect(m.events.some((e) => e.type === 'injury')).toBe(true);
    expect(m.pendingSubs.some((s) => s.outId === p.id)).toBe(true);
  });
});
