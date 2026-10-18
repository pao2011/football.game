import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import type { MatchEvent } from '../src/sim/types';

function scene(defX: number, jockey: boolean, side: number, y: number) {
  const m = makeMatch({ seed: 4 });
  m.simulate(1);
  m.phase = 'play';
  m.teams[0].attackDir = 1;
  m.teams[1].attackDir = -1;
  for (const q of m.active) q.pos.set(q.team === 0 ? 20 : -20, 0, 30);
  const shooter = m.teams[0].players[9];
  const def = m.teams[1].players[3];
  shooter.pos.set(defX - 12, 0, 0);
  def.pos.set(defX, 0, 0);
  def.facing = -Math.PI / 2; // de cara al tirador
  def.clearAction();
  // brazos separados: saltando a cabecear (la IA reajusta "contener" en cada paso, el salto no)
  if (jockey) {
    def.startAction('header', 'header', 0.6, 0.22, { kick: { kind: 'header', velocity: def.pos.clone(), spin: def.pos.clone(), power: 0.5, errorScale: 1 }, done: false });
    def.action.time = 0.12;
  }
  def.desiredVel.set(0, 0, 0);
  m.owner = null;
  // balón que pasa junto al defensor a la altura del brazo
  m.ball.reset(defX - 3, side);
  m.ball.pos.y = y;
  m.ball.vel.set(14, 0.6, 0);
  m.setLastTouch(shooter, true, 'shoot');
  const events: MatchEvent[] = [];
  for (let i = 0; i < 30; i++) {
    m.step();
    events.push(...m.events);
    m.events.length = 0;
  }
  return { m, def, events };
}

describe('Regla de la mano', () => {
  it('saltando con los brazos arriba y el balón por el costado: mano y tiro libre para el rival', () => {
    const { m, events } = scene(10, true, 0.55, 1.45);
    expect(events.some((e) => e.type === 'handball')).toBe(true);
    expect(m.restart?.type).toBe('freekick');
    expect(m.restart?.team).toBe(0);
  });

  it('dentro de su área es penal', () => {
    const { m, events } = scene(44, true, 0.55, 1.45);
    expect(events.some((e) => e.type === 'handball')).toBe(true);
    expect(m.restart?.type).toBe('penalty');
  });

  it('con los brazos pegados al cuerpo o al pecho no es mano', () => {
    expect(scene(10, false, 0.55, 1.45).events.some((e) => e.type === 'handball')).toBe(false);
    expect(scene(10, true, 0.05, 1.45).events.some((e) => e.type === 'handball')).toBe(false);
  });
});
