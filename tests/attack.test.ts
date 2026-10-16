import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { HALF_LENGTH } from '../src/config/constants';

describe('IA de ataque', () => {
  it('con el rival encerrado en su área, un buen rematador prueba de lejos', () => {
    let shots = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = makeMatch({ seed });
      m.simulate(1);
      m.phase = 'play';
      const t = m.teams[0];
      t.attackDir = 1;
      m.teams[1].attackDir = -1;
      const p = [...t.players].filter((q) => !q.isGK).sort((a, b) => b.data.attrs.shooting - a.data.attrs.shooting)[0];
      // compañeros lejos y rivales metidos en el área, sin tapar el centro
      for (const q of t.active) if (q !== p && !q.isGK) q.pos.set(0, 0, q.pos.z * 0.5);
      const defs = m.teams[1].active.filter((q) => !q.isGK);
      defs.forEach((d, i) => d.pos.set(HALF_LENGTH - 6 - (i % 3) * 3, 0, i % 2 ? 7 + i * 0.5 : -7 - i * 0.5));
      p.pos.set(HALF_LENGTH - 27, 0, 0);
      p.facing = Math.PI / 2;
      p.clearAction();
      m.ball.reset(p.pos.x + 0.5, 0);
      m.owner = p;
      p.nextDecisionAt = 0;
      for (let i = 0; i < 90; i++) {
        m.step();
        if (m.events.some((e) => e.type === 'kick' && e.playerId === p.id && ['shoot', 'finesse', 'chip'].includes(e.kind!))) { shots++; break; }
        m.events.length = 0;
        if (m.owner !== p) break;
      }
    }
    expect(shots).toBeGreaterThanOrEqual(3);
  });
});
