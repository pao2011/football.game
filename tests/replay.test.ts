import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { HALF_LENGTH, SIM_DT } from '../src/config/constants';
import { REPLAY_SPEED } from '../src/sim/Match';

describe('Repetición del gol', () => {
  it('incluye la jugada previa, el disparo y el balón en la red, y dura lo necesario para verla entera', () => {
    const m = makeMatch({ seed: 5 });
    m.simulate(2);
    m.phase = 'play';
    const team = m.teams[0].attackDir === 1 ? m.teams[0] : m.teams[1];
    const g = team.attackDir;
    for (const q of m.active) q.pos.set(-g * 30, 0, 30);
    const p = team.players[9];
    // 2 s de juego antes del disparo (deben verse en la repetición)
    for (let i = 0; i < 120; i++) {
      m.step(SIM_DT);
      m.events.length = 0;
    }
    expect(m.phase).toBe('play');
    for (const q of m.active) if (q !== p) q.pos.set(-g * 30, 0, 30);
    p.pos.set(g * (HALF_LENGTH - 25), 0, 0);
    p.facing = g > 0 ? Math.PI / 2 : -Math.PI / 2;
    p.vel.set(0, 0, 0);
    p.clearAction();
    m.ball.reset(g * (HALF_LENGTH - 24.5), 0);
    m.owner = p;
    const ok = m.requestKick(p, { kind: 'shoot', velocity: new Vector3(g * 27, 2.2, 0), spin: new Vector3(), power: 0.8, errorScale: 0 });
    expect(ok).toBe(true);
    const shotAt = m.time;
    for (let i = 0; i < 60 * 12 && (m.phase as string) !== 'replay'; i++) {
      m.step(SIM_DT);
      m.events.length = 0;
    }
    expect(m.phase).toBe('replay');
    const clip = m.replayClip;
    expect(clip.length).toBeGreaterThan(30);
    // empieza antes del disparo
    expect(clip[0].tm).toBeLessThan(shotAt - 1.5);
    // termina con el balón ya dentro del arco
    const last = clip[clip.length - 1];
    expect(Math.abs(last.ball[0])).toBeGreaterThan(HALF_LENGTH);
    // la fase de repetición alcanza para reproducir el clip entero a cámara lenta
    const clipLen = last.tm - clip[0].tm;
    expect(m.replayLength * REPLAY_SPEED).toBeGreaterThanOrEqual(clipLen);
  });
});
