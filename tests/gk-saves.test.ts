import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { SIM_DT } from '../src/config/constants';

/** Tira `n` remates a puerta (esquinas incluidas) desde `dist` m y devuelve la fracción de goles. */
function goalRate(dist: number, speed: number, n = 100, seed = 7): number {
  let goals = 0;
  for (let i = 0; i < n; i++) {
    const m = makeMatch({ seed: seed + i });
    m.simulate(1);
    m.phase = 'play';
    m.teams[0].attackDir = 1; m.teams[1].attackDir = -1;
    const gk = m.teams[0].goalkeeper!;
    for (const q of m.active) if (q !== gk) q.pos.set(15, 0, q.pos.z * 2);
    gk.pos.set(-51.5, 0, 0);
    gk.clearAction();
    const tz = (i % 2 ? 1 : -1) * (2.6 + ((i * 0.618) % 1) * 0.9); // cerca de los palos
    const ty = i % 3 === 0 ? 0.25 + ((i * 0.377) % 1) * 0.3 : 1.7 + ((i * 0.377) % 1) * 0.5;
    const x0 = -52.5 + dist;
    m.ball.reset(x0, (i % 7) - 3);
    const t = dist / speed;
    m.ball.vel.set(-speed, (ty - 0.11 + 4.905 * t * t) / t - 0 * 0, (tz - m.ball.pos.z) / t);
    m.owner = null;
    const before = m.teams[1].stats.goals;
    for (let k = 0; k < Math.ceil(3.5 / SIM_DT); k++) { m.step(); m.events.length = 0; }
    if (m.teams[1].stats.goals > before) goals++;
  }
  return goals / n;
}

describe('Arquero: atajadas', () => {
  // Antes: 30 % a 16 m/38 m/s y 52 % desde 30 m (el arquero se estiraba tarde, corto y con predicción lineal).
  it('ataja casi todo lo que va cerca de los palos desde lejos', () => {
    expect(goalRate(30, 36)).toBeLessThan(0.15);
    expect(goalRate(25, 33)).toBeLessThan(0.15);
  });
  it('los remates muy potentes de cerca siguen entrando a veces', () => {
    const r = goalRate(16, 38);
    expect(r).toBeLessThan(0.25);
    expect(r).toBeGreaterThan(0.03);
  });
});
