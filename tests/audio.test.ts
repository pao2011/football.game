import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { MatchAudio } from '../src/audio/MatchAudio';
import type { AudioEngine } from '../src/audio/AudioEngine';
import type { MatchEvent } from '../src/sim/types';

/** Motor de audio falso que apunta qué sonidos se piden. */
function fakeAudio() {
  const calls: string[] = [];
  const audio = new Proxy({}, { get: (_t, name) => (..._args: unknown[]) => calls.push(String(name)) }) as unknown as AudioEngine;
  return { audio, calls };
}

describe('Sonidos del partido', () => {
  it('cada evento suena con su propio sonido', () => {
    const m = makeMatch();
    const { audio, calls } = fakeAudio();
    const ma = new MatchAudio(audio, m);
    const play = (e: MatchEvent) => { calls.length = 0; m.time += 1; ma.onEvent(e); return [...calls]; };
    expect(play({ type: 'kick', power: 0.9, kind: 'shoot' })).toEqual(['kick']);
    expect(play({ type: 'kick', power: 0.6, kind: 'header' })).toEqual(['header']);
    expect(play({ type: 'kick', power: 0.5, kind: 'throwin' })).toEqual(['touch']);
    expect(play({ type: 'touch', power: 0.4 })).toEqual(['touch']);
    expect(play({ type: 'catch', team: 0 })).toEqual(['gloveCatch']);
    expect(play({ type: 'save', team: 0 })).toEqual(['glovePunch']);
    expect(play({ type: 'save', team: 0, kind: 'shot' })).toEqual(['applause']);
    expect(play({ type: 'goal', team: 1, kind: 'normal' })).toEqual(['cheer', 'goalHorn']);
    expect(play({ type: 'goal', team: 1, kind: 'shootout' })).toEqual(['cheer']);
  });

  it('el balón rueda y el que conduce da toques mientras corre', () => {
    const m = makeMatch();
    const { audio, calls } = fakeAudio();
    const ma = new MatchAudio(audio, m);
    const owner = m.teams[0].players[5];
    m.phase = 'play';
    m.owner = owner;
    m.ball.pos.set(owner.pos.x, 0.11, owner.pos.z);
    m.ball.vel.set(7, 0, 0);
    owner.vel.set(7, 0, 0);
    for (let i = 0; i < 120; i++) {
      m.time += 1 / 60;
      ma.update(0.3);
    }
    expect(calls.filter((c) => c === 'setRoll').length).toBe(120);
    const taps = calls.filter((c) => c === 'touch').length;
    expect(taps).toBeGreaterThanOrEqual(4); // ~2 s corriendo a 7 m/s
    expect(taps).toBeLessThanOrEqual(8);
  });

  it('la simulación avisa de controles y blocajes del arquero', () => {
    const m = makeMatch({ seed: 7 });
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 240 && !(seen.has('touch') && seen.has('catch')); i++) {
      m.step();
      for (const e of m.events) seen.add(e.type);
      m.events.length = 0;
      if (m.phase === 'replay') m.skipReplay();
    }
    expect(seen.has('touch')).toBe(true);
    expect(seen.has('catch')).toBe(true);
  });
});
