import { describe, expect, it } from 'vitest';
import { AutoQuality } from '../src/game/AutoQuality';

const run = (aq: AutoQuality, fps: number, seconds: number) => {
  const steps = [];
  for (let t = 0; t < seconds; t += 1 / fps) { const s = aq.sample(1 / fps); if (s) steps.push(s); }
  return steps;
};

describe('Calidad automática', () => {
  it('con FPS fluidos no cambia nada', () => {
    const aq = new AutoQuality({ resolutionScale: 1, shadows: true });
    expect(run(aq, 60, 30)).toEqual([]);
    expect(aq.resolutionScale).toBe(1);
    expect(aq.shadows).toBe(true);
  });

  it('con FPS bajos baja primero la resolución, luego las sombras, y se detiene', () => {
    const aq = new AutoQuality({ resolutionScale: 1, shadows: true });
    const steps = run(aq, 20, 60);
    expect(steps.slice(0, 3)).toEqual(['resolution', 'resolution', 'resolution']);
    expect(steps).toContain('shadows');
    expect(aq.resolutionScale).toBe(0.5);
    expect(aq.shadows).toBe(false);
    expect(steps.length).toBeLessThanOrEqual(4);
  });

  it('no mide durante el calentamiento ni con saltos de pestaña en segundo plano', () => {
    const aq = new AutoQuality({ resolutionScale: 1, shadows: true });
    expect(run(aq, 10, 2)).toEqual([]);
    expect(aq.sample(5)).toBe(null);
  });

  it('con la calidad ya al mínimo no propone nada', () => {
    const aq = new AutoQuality({ resolutionScale: 0.5, shadows: false });
    expect(run(aq, 15, 30)).toEqual([]);
  });
});
