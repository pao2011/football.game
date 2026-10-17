import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import type { MatchEvent } from '../src/sim/types';

function setup() {
  const m = makeMatch({ seed: 9 });
  m.simulate(1);
  m.phase = 'play';
  const t = m.teams[0];
  t.attackDir = 1;
  m.teams[1].attackDir = -1;
  for (const q of m.active) q.pos.set(q.team === 0 ? -30 : 40, 0, q.pos.z);
  const victim = t.players[7];
  const mate = t.players[9];
  const offender = m.teams[1].players[5];
  victim.pos.set(10, 0, 0);
  offender.pos.set(9.6, 0, 0.2);
  mate.pos.set(16, 0, 4);
  m.ball.reset(16.4, 4);
  m.owner = mate;
  const events: MatchEvent[] = [];
  const step = (n: number) => { for (let i = 0; i < n; i++) { m.step(); events.push(...m.events); m.events.length = 0; } };
  return { m, victim, mate, offender, events, step };
}

describe('Ley de la ventaja', () => {
  it('si el equipo que recibe la falta conserva el balón, el juego sigue', () => {
    const { m, victim, offender, events, step } = setup();
    (m as any).foul(offender, victim, false);
    step(1);
    expect(events.some((e) => e.type === 'advantage')).toBe(true);
    expect(events.some((e) => e.type === 'whistle')).toBe(false);
    step(60 * 3);
    expect(m.advantage).toBe(null);
    // nadie pitó el tiro libre de esa falta
    expect(events.filter((e) => e.type === 'whistle').length).toBe(0);
  });

  it('si lo pierde enseguida, el árbitro vuelve atrás y pita el tiro libre', () => {
    const { m, victim, offender, events, step } = setup();
    (m as any).foul(offender, victim, false);
    step(1);
    expect(m.advantage).not.toBe(null);
    const thief = m.teams[1].players[6];
    thief.pos.set(16.5, 0, 4.3);
    m.owner = thief;
    step(2);
    expect(events.some((e) => e.type === 'whistle')).toBe(true);
    expect(m.advantage).toBe(null);
    expect(m.phase).not.toBe('play');
    expect(m.restart?.type).toBe('freekick');
    expect(m.restart?.team).toBe(0);
  });

  it('sin un compañero libre cerca del balón no hay ventaja: falta inmediata', () => {
    const { m, victim, offender, mate, events, step } = setup();
    mate.pos.set(-20, 0, 0);
    m.owner = null;
    m.ball.reset(10.3, 0.1);
    (m as any).foul(offender, victim, false);
    step(1);
    expect(events.some((e) => e.type === 'advantage')).toBe(false);
    expect(m.restart?.type).toBe('freekick');
  });
});
