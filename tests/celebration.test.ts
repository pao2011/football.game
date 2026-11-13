import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { HALF_LENGTH, SIM_DT } from '../src/config/constants';

describe('Festejos', () => {
  it('en un festejo de parado el goleador frena y los compañeros que llegan festejan con él', () => {
    const m = makeMatch({ seed: 9 });
    m.simulate(1);
    m.phase = 'play';
    const t = m.teams[0];
    const scorer = t.active[9];
    scorer.pos.set(t.attackDir * 30, 0, 2);
    t.active[8].pos.set(t.attackDir * 28, 0, 4);
    m.setLastTouch(scorer, true, 'shoot');
    m.owner = null;
    m.ball.reset(t.attackDir * (HALF_LENGTH + 0.3), 1);
    m.ball.vel.set(t.attackDir * 12, 0, 0);
    for (let i = 0; i < 20; i++) if ((m.phase as string) !== 'goal') m.step(SIM_DT);
    expect(m.phase).toBe('goal');
    scorer.action.variant = 8; // brazos cruzados
    for (let i = 0; i < Math.round(2.6 / SIM_DT); i++) m.step(SIM_DT);
    expect(Math.hypot(scorer.vel.x, scorer.vel.z)).toBeLessThan(0.3);
    expect(t.active.filter((p) => p !== scorer && p.action.kind === 'celebrate').length).toBeGreaterThan(0);
  });
});
