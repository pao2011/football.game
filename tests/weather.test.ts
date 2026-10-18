import { describe, expect, it } from 'vitest';
import { Ball } from '../src/sim/Ball';
import { weatherEnv, type Weather } from '../src/sim/Weather';
import { SIM_DT } from '../src/config/constants';
import { makeMatch } from './helpers';

function roll(w: Weather) {
  const b = new Ball();
  b.env = weatherEnv(w, 1);
  b.env.wind.set(0, 0, 0);
  b.pos.set(0, 0.11, 0);
  b.vel.set(12, 0, 0);
  for (let i = 0; i < 60 * 15; i++) b.step(SIM_DT);
  return b.pos.x;
}

function lob(w: Weather, windZ: number) {
  const b = new Ball();
  b.env = weatherEnv(w, 1);
  b.env.wind.set(0, 0, windZ);
  b.pos.set(0, 0.11, 0);
  b.vel.set(18, 12, 0);
  for (let i = 0; i < 400 && !(i > 10 && b.pos.y <= 0.12); i++) b.step(SIM_DT);
  return b.pos;
}

describe('Clima', () => {
  it('con lluvia el balón rueda más lejos y con nieve se frena antes', () => {
    const clear = roll('clear');
    expect(roll('rain')).toBeGreaterThan(clear * 1.2);
    expect(roll('snow')).toBeLessThan(clear * 0.8);
  });

  it('el viento desvía los balones que van por el aire', () => {
    const calm = lob('wind', 0);
    const windy = lob('wind', 8);
    expect(Math.abs(calm.z)).toBeLessThan(0.05);
    expect(windy.z).toBeGreaterThan(1);
  });

  it('el partido con clima se juega entero sin errores', () => {
    for (const w of ['rain', 'snow', 'wind'] as Weather[]) {
      const m = makeMatch({ seed: 2, halfLengthSec: 60, weather: w });
      expect(m.weather).toBe(w);
      let steps = 0;
      while (!m.finished && steps < 60 * 400) {
        m.step();
        m.events.length = 0;
        if (m.phase === 'replay') m.skipReplay();
        expect(Number.isFinite(m.ball.pos.x)).toBe(true);
        steps++;
      }
      expect(m.finished).toBe(true);
    }
  });
});
