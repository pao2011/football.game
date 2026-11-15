import { describe, it, expect } from 'vitest';
import { TRACKS } from '../src/racing/data';
import { getTrack } from '../src/racing/track';

describe('circuitos', () => {
  it('hay al menos 18 y todos son válidos', () => {
    expect(TRACKS.length).toBeGreaterThanOrEqual(18);
    TRACKS.forEach((def, ti) => {
      const t = getTrack(ti, TRACKS), gap = Math.round(100 / t.ds);
      expect(t.length, def.name).toBeGreaterThan(2800);
      expect(t.length, def.name).toBeLessThan(7000);
      expect(t.pitLen, def.name).toBeGreaterThan(350);
      // sin cruces ni tramos pegados: dos puntos lejanos en la vuelta nunca están a menos de 2 anchos de pista + muros
      let min = 1e9;
      for (let i = 0; i < t.n; i += 2) for (let j = i + gap; j < t.n; j += 2) {
        if (t.n - (j - i) < gap) continue;
        const d = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]);
        if (d < min) min = d;
      }
      expect(min, def.name).toBeGreaterThan(2 * t.hw + 6);
      // vuelta de referencia razonable
      expect(t.lapTime, def.name).toBeGreaterThan(45);
      expect(t.lapTime, def.name).toBeLessThan(120);
      for (let i = 0; i < t.n; i++) expect(Number.isFinite(t.vt[i]) && t.vt[i] > 8, def.name + ' vt').toBe(true);
    });
  });
});
