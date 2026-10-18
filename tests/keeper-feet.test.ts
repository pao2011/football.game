import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { SIM_DT } from '../src/config/constants';

/** Equipo 0 defiende el arco de x = -52.5 (ataca hacia +x). */
function setup(seed = 5) {
  const m = makeMatch({ seed });
  m.simulate(1);
  m.phase = 'play';
  const t = m.teams[0];
  t.attackDir = 1;
  m.teams[1].attackDir = -1;
  const gk = t.goalkeeper!;
  for (const q of m.active) if (q !== gk) q.pos.set(q.team === 0 ? 5 + q.pos.z * 0.1 : 15, 0, q.pos.z);
  gk.pos.set(-50, 0, 0);
  gk.clearAction();
  return { m, t, gk };
}

describe('Arquero con el balón en los pies', () => {
  it('no se queda quieto: lo juega enseguida (pase o despeje)', () => {
    const { m, gk } = setup();
    m.ball.reset(-49.4, 0);
    m.owner = gk;
    let kicked = false;
    for (let i = 0; i < 120 && !kicked; i++) {
      m.step();
      kicked = m.events.some((e) => e.type === 'kick' && e.playerId === gk.id);
      m.events.length = 0;
    }
    expect(kicked).toBe(true);
    expect(m.owner).not.toBe(gk);
  });

  it('con un rival encima, despeja sin pensarlo', () => {
    const { m, gk } = setup();
    const striker = m.teams[1].players[9];
    striker.pos.set(-46, 0, 1);
    m.ball.reset(-49.4, 0);
    m.owner = gk;
    let kickedAt = -1;
    for (let i = 0; i < 60 && kickedAt < 0; i++) {
      m.step();
      if (m.events.some((e) => e.type === 'kick' && e.playerId === gk.id)) kickedAt = i * SIM_DT;
      m.events.length = 0;
    }
    expect(kickedAt).toBeGreaterThanOrEqual(0);
    expect(kickedAt).toBeLessThan(0.6);
  });

  it('sale a recibir la cesión de un compañero y luego la juega', () => {
    const { m, t, gk } = setup();
    const def = t.players.find((q) => !q.isGK)!;
    def.pos.set(-25, 0, 4);
    m.ball.reset(-24.5, 4);
    m.owner = def;
    m.requestKick(def, { kind: 'pass', velocity: new Vector3(-16, 0, -2.4), spin: new Vector3(), targetId: gk.id, power: 0.5, errorScale: 0 });
    const x0 = gk.pos.x;
    let got = false;
    let maxOut = 0;
    let played = false;
    for (let i = 0; i < 60 * 5 && !played; i++) {
      m.step();
      if (m.owner === gk || m.gkHolding === gk) got = true;
      maxOut = Math.max(maxOut, gk.pos.x - x0);
      if (got && m.events.some((e) => e.type === 'kick' && e.playerId === gk.id)) played = true;
      m.events.length = 0;
    }
    expect(got).toBe(true);
    expect(maxOut).toBeGreaterThan(1.5); // salió hacia el balón, no lo esperó en la línea
    expect(played).toBe(true);
  });
});
