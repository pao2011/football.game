import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { SKILL_NAMES } from '../src/sim/types';
import type { MatchEvent } from '../src/sim/types';

function setup(seed: number) {
  const m = makeMatch({ seed });
  m.simulate(1);
  m.phase = 'play';
  m.teams[0].attackDir = 1;
  m.teams[1].attackDir = -1;
  const p = m.teams[0].players[9];
  const d = m.teams[1].players[3];
  for (const q of m.active) if (q !== p && q !== d) q.pos.set(q.team === 0 ? -30 : 40, 0, 30);
  p.pos.set(0, 0, 0);
  p.facing = Math.PI / 2;
  p.vel.set(0, 0, 0);
  p.clearAction();
  d.pos.set(1.6, 0, 0.1);
  d.facing = -Math.PI / 2;
  m.ball.reset(0.5, 0);
  m.owner = p;
  return { m, p, d };
}

describe('Regates nuevos', () => {
  it('caño: el balón sale por delante (entre las piernas) y a veces deja atrás al rival', () => {
    let beats = 0;
    for (let s = 1; s <= 8; s++) {
      const { m, p, d } = setup(s);
      expect(m.requestSkill(p, 'nutmeg', 1)).toBe(true);
      const ev: MatchEvent[] = [];
      let passedDefender = false;
      for (let i = 0; i < 60; i++) {
        m.step();
        ev.push(...m.events);
        m.events.length = 0;
        if (m.ball.pos.x > d.pos.x + 0.5) passedDefender = true;
      }
      if (ev.some((e) => e.type === 'skill' && e.kind === 'beat')) {
        beats++;
        expect(passedDefender).toBe(true);
      }
    }
    expect(beats).toBeGreaterThan(0);
    expect(beats).toBeLessThan(8);
  });

  it('croqueta: el jugador sale hacia un costado con el balón', () => {
    const { m, p } = setup(3);
    expect(m.requestSkill(p, 'croqueta', 1)).toBe(true);
    for (let i = 0; i < 45; i++) { m.step(); m.events.length = 0; }
    // salida lateral: hacia la izquierda del jugador (que mira a +x, su izquierda es -z)
    expect(Math.abs(p.pos.z)).toBeGreaterThan(0.6);
    expect(SKILL_NAMES.croqueta).toBe('Croqueta');
  });
});
