import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { FORMATIONS } from '../src/data/formations';

describe('Tácticas en vivo', () => {
  it('cambiar la formación reasigna los puestos sin repetir y el arquero sigue de arquero', () => {
    const m = makeMatch({ seed: 2 });
    m.simulate(5);
    const t = m.teams[0];
    const target = t.formation === '3-5-2' ? '4-4-2' : '3-5-2';
    t.setFormation(target);
    expect(t.formation).toBe(target);
    const idx = t.players.map((p) => p.slotIndex).sort((a, b) => a - b);
    expect(idx).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const p of t.players) expect(p.slot).toBe(FORMATIONS[target][p.slotIndex]);
    expect(t.goalkeeper?.slotIndex).toBe(0);
    expect(t.players.filter((p) => p.slot.position === 'DEF').length).toBe(FORMATIONS[target].filter((s) => s.position === 'DEF').length);
    // el partido sigue sin problemas
    m.simulate(20);
    expect(Number.isFinite(m.ball.pos.x)).toBe(true);
  });
});
