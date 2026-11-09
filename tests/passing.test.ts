import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { Ball } from '../src/sim/Ball';
import { groundPassVelocity, homePassVelocity } from '../src/sim/Kicks';
import { HALF_LENGTH, HALF_WIDTH, SIM_DT } from '../src/config/constants';

describe('Pases asistidos, laterales y rechazos del arquero', () => {
  it('el pase reapuntado llega a donde estará un receptor que corre en diagonal', () => {
    const from = new Vector3(0, 0.11, 0);
    const rx = 18, rz = 0, rvx = 0, rvz = 6; // corre en perpendicular a 6 m/s
    // pase pedido hacia donde estaba: sin reapuntar, lo pierde
    const v = homePassVelocity(from, rx, rz, rvx, rvz, groundPassVelocity(from, new Vector3(rx, 0, rz), 0.2));
    const b = new Ball();
    b.pos.copy(from);
    b.vel.copy(v);
    let best = Infinity;
    for (let t = 0; t < 4; t += 1 / 120) {
      b.step(1 / 120);
      best = Math.min(best, Math.hypot(b.pos.x - (rx + rvx * t * 0.8), b.pos.z - (rz + rvz * t * 0.8)));
    }
    expect(best).toBeLessThan(0.8);
  });

  it('un lateral tirado paralelo a la línea no se cobra como otro lateral', () => {
    const m = makeMatch({ seed: 5 });
    m.simulate(1);
    m.stopPlay('throwin', 0, new Vector3(10, 0.11, HALF_WIDTH));
    for (let i = 0; i < 400 && !(m.restart?.stage === 'ready'); i++) m.step();
    const taker = m.restart!.taker!;
    expect(Math.abs(taker.pos.z)).toBeGreaterThan(HALF_WIDTH);
    taker.facing = Math.PI / 2; // mirando a lo largo de la línea
    m.requestKick(taker, { kind: 'throwin', velocity: new Vector3(9, 4, 0), spin: new Vector3(), power: 0.4, errorScale: 1 });
    let outs = 0;
    for (let i = 0; i < Math.round(1.2 / SIM_DT); i++) {
      m.step();
      outs += m.events.filter((e) => e.type === 'out').length;
      m.events.length = 0;
    }
    expect(outs).toBe(0);
    expect(m.phase).toBe('play');
  });

  it('un tiro fuerte a un costado que el arquero rechaza no termina en gol en contra', () => {
    let corners = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = makeMatch({ seed });
      m.simulate(1);
      m.phase = 'play';
      const def = m.teams[1];
      const gk = def.goalkeeper!;
      const lineX = -def.attackDir * HALF_LENGTH;
      for (const q of m.active) if (q !== gk) q.pos.set(-lineX * 0.5, 0, 30);
      gk.pos.set(lineX + def.attackDir * 1, 0, 2.2);
      gk.clearAction();
      m.owner = null;
      m.ball.reset(lineX + def.attackDir * 5, 2.2);
      m.ball.pos.y = 1.1;
      m.ball.vel.set(-def.attackDir * 26, 0.6, 0.6);
      m.setLastTouch(m.teams[0].players[9], true, 'shoot');
      const g0 = m.teams[0].stats.goals;
      for (let i = 0; i < Math.round(2 / SIM_DT) && m.phase === 'play'; i++) m.step();
      expect(m.teams[0].stats.goals).toBe(g0);
      corners += m.teams[0].stats.corners;
    }
    // con mano firme, varios de esos rechazos se van al córner
    expect(corners).toBeGreaterThan(0);
  });
});
