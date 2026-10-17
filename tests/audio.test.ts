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
    expect(play({ type: 'skill', kind: 'bicycle', text: 'Chilena' })).toEqual(['ooh']);
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
    // controles: en un partido normal
    const m = makeMatch({ seed: 7 });
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 120 && !seen.has('touch'); i++) {
      m.step();
      for (const e of m.events) seen.add(e.type);
      m.events.length = 0;
      if (m.phase === 'replay') m.skipReplay();
    }
    expect(seen.has('touch')).toBe(true);
    // blocaje: balón suave de un rival hacia el arquero, dentro de su área
    const g = makeMatch({ seed: 3 });
    g.simulate(1);
    g.phase = 'play';
    g.teams[0].attackDir = 1;
    g.teams[1].attackDir = -1;
    const gk = g.teams[0].goalkeeper!;
    for (const q of g.active) if (q !== gk) q.pos.set(10, 0, q.pos.z);
    gk.pos.set(-50, 0, 0);
    g.owner = null;
    g.ball.reset(-42, 0);
    g.ball.vel.set(-7, 0, 0);
    g.setLastTouch(g.teams[1].players[9], true, 'shoot');
    let caught = false;
    for (let i = 0; i < 120 && !caught; i++) {
      g.step();
      caught = g.events.some((e) => e.type === 'catch' && e.playerId === gk.id);
      g.events.length = 0;
    }
    expect(caught).toBe(true);
  });

  it('la tribuna silba cuando el visitante tiene el balón y para al perderlo', () => {
    const m = makeMatch();
    const { audio, calls } = fakeAudio();
    const ma = new MatchAudio(audio, m);
    m.phase = 'play';
    const away = m.teams[1].players[5];
    const home = m.teams[0].players[5];
    const run = (secs: number) => { for (let i = 0; i < secs * 60; i++) { m.time += 1 / 60; ma.update(0.3); } };
    m.owner = away;
    run(0.8);
    expect(calls).not.toContain('setWhistling'); // todavía no: hace falta 1,2 s seguidos
    run(0.8);
    expect(calls.filter((c) => c === 'setWhistling').length).toBe(1);
    m.owner = home;
    run(2);
    expect(calls.filter((c) => c === 'setWhistling').length).toBe(2); // se apagó
  });
});
