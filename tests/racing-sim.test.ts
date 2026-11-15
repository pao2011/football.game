import { describe, it, expect } from 'vitest';
import { TRACKS, DRIVERS } from '../src/racing/data';
import { getTrack } from '../src/racing/track';
import { Sim, type SimOpts } from '../src/racing/sim';

const base = (ti: number, over: Partial<SimOpts> = {}): SimOpts => ({
  track: getTrack(ti, TRACKS), type: 'RACE', laps: 5, entries: DRIVERS.map((_, i) => i), player: -1, pace: 1, weather: [0], damage: 1,
  formation: false, seed: 7, assists: { brake: true, steer: true, tc: true, pitLimiter: true }, ...over,
});
const run = (s: Sim, max: number) => s.fastForward(max, () => s.phase === 'done');

describe('simulación', () => {
  it('una carrera completa termina, con vueltas realistas y paradas en boxes', () => {
    for (const ti of [0, 4, 11]) {
      const s = new Sim(base(ti));
      expect(run(s, 5 * s.track.lapTime * 2 + 120), TRACKS[ti].name + ' no terminó').toBe(true);
      const res = s.results(), fin = res.filter((r) => !r.status);
      expect(fin.length).toBeGreaterThanOrEqual(15);
      const best = Math.min(...res.map((r) => r.best));
      expect(best).toBeGreaterThan(s.track.lapTime * 0.93);
      expect(best).toBeLessThan(s.track.lapTime * 1.12);
      expect(fin.filter((r) => r.tyres.length >= 2).length).toBeGreaterThan(fin.length * 0.8); // parada obligatoria
      for (const c of s.cars) expect(Number.isFinite(c.x + c.z + c.h + c.speed)).toBe(true);
    }
  }, 120000);

  it('vuelta de formación, salida y clasificación', () => {
    const s = new Sim(base(1, { formation: true, laps: 2 }));
    expect(s.fastForward(s.track.lapTime * 3.2, () => s.phase === 'lights')).toBe(true);
    expect(s.fastForward(12, () => s.phase === 'race')).toBe(true);
    const q = new Sim(base(2, { type: 'Q1' }));
    expect(run(q, q.duration + q.track.lapTime * 2)).toBe(true);
    const r = q.results();
    expect(r.filter((x) => Number.isFinite(x.best)).length).toBeGreaterThanOrEqual(20);
    expect(r[0].best).toBeLessThan(r[15].best);
  }, 60000);

  it('un coche averiado en pista provoca bandera amarilla y SC o VSC; con lluvia se montan neumáticos de agua', () => {
    const s = new Sim(base(3, { laps: 6, weather: [0, 0, 0.9, 0.9] }));
    s.fastForward(40, () => false);
    s.retire(s.cars[5], 'Avería');
    expect(run(s, 6 * s.track.lapTime * 2.5 + 200)).toBe(true);
    const txt = s.msgs.map((m) => m.text).join('\n');
    expect(txt).toMatch(/Bandera amarilla/);
    expect(txt).toMatch(/[Ss]afety car/);
    expect(s.results().filter((r) => /[IW]/.test(r.tyres)).length).toBeGreaterThan(10);
  }, 60000);

  it('salida falsa: sanción de drive-through que se cumple pasando por boxes', () => {
    const s = new Sim(base(0, { player: 4, laps: 6 }));
    s.fastForward(20, () => s.phase === 'lights');
    const p = s.player!;
    while (s.phase === 'lights') { p.thr = 1; p.brk = 0; s.step(1 / 50); }
    expect(s.msgs.some((m) => /Salida falsa/.test(m.text) && m.player)).toBe(true);
    expect(p.penDT).toBe(1);
    s.autoAll = true;
    s.fastForward(s.track.lapTime * 3, () => p.penDT === 0);
    expect(p.penDT).toBe(0);
    expect(s.msgs.some((m) => /cumple su drive-through/.test(m.text))).toBe(true);
    expect(p.stops).toBe(0); // pasa por la calle de boxes sin parar
  }, 60000);
});
