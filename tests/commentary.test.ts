import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { Commentary } from '../src/ui/Commentary';

/** Comentarista sin DOM (solo la generación de frases). */
function make() {
  const m = makeMatch({ seed: 1 });
  const c = Object.create(Commentary.prototype) as Commentary;
  (c as any).match = m;
  return { m, c };
}

describe('Comentarista', () => {
  it('narra los momentos importantes con nombres y marcador', () => {
    const { m, c } = make();
    const scorer = m.teams[0].players[9];
    m.teams[0].stats.goals = 1;
    const goal = c.lineFor({ type: 'goal', team: 0, playerId: scorer.id, text: scorer.data.name, kind: 'normal' })!;
    expect(goal.text).toContain(scorer.data.name);
    expect(goal.text).toContain('1 - 0');
    expect(goal.prio).toBe(5);
    const gk = m.teams[1].goalkeeper!;
    expect(c.lineFor({ type: 'save', team: 1, playerId: gk.id, kind: 'shot' })!.text).toContain(gk.data.name);
    expect(c.lineFor({ type: 'skill', kind: 'bicycle', playerId: scorer.id })!.text.toLowerCase()).toContain('chilena');
    expect(c.lineFor({ type: 'card', kind: 'red', text: 'Pérez' })!.prio).toBeGreaterThanOrEqual(4);
    expect(c.lineFor({ type: 'phase', kind: 'stoppage', text: 'penalty' })!.text).toContain('PENAL');
  });

  it('no comenta lo trivial (botes, toques)', () => {
    const { c } = make();
    expect(c.lineFor({ type: 'bounce', power: 0.5 })).toBe(null);
    expect(c.lineFor({ type: 'touch', power: 0.5 })).toBe(null);
    expect(c.lineFor({ type: 'kick', kind: 'pass' })).toBe(null);
  });
});
