import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { SIM_DT } from '../src/config/constants';
import { Input, P1_SPLIT, P2_SPLIT } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';

describe('Dos jugadores en el mismo PC', () => {
  it('cada jugador mueve a su equipo con su mitad del teclado', () => {
    const m = makeMatch({ seed: 3, humanTeam: 0, versus: true });
    expect(m.teams[0].human).toBe(true);
    expect(m.teams[1].human).toBe(true);
    m.simulate(1);
    m.phase = 'play';
    const basis = { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) };
    const opts = { autoSwitch: false, passAssist: 1, powerBarTime: 0.6, showAimAssist: true, assist: false };
    const i1 = new Input(P1_SPLIT, false);
    const i2 = new Input(P2_SPLIT, false);
    i1.padSource = null;
    i2.padSource = null;
    m.controllers[0] = new HumanController(i1, basis, opts);
    m.controllers[1] = new HumanController(i2, basis, opts);
    const a = m.teams[0].players[6];
    const b = m.teams[1].players[6];
    a.pos.set(-10, 0, 0);
    b.pos.set(10, 0, 0);
    m.teams[0].controlled = a;
    m.teams[1].controlled = b;
    m.ball.reset(0, 25);
    m.owner = null;
    const a0 = a.pos.clone();
    const b0 = b.pos.clone();
    // J1 hacia la derecha (D), J2 hacia arriba en pantalla (flecha arriba = -z)
    i1.setKey('KeyD', true);
    i2.setKey('ArrowUp', true);
    for (let i = 0; i < 60; i++) { i1.poll(SIM_DT); i2.poll(SIM_DT); m.step(); m.events.length = 0; }
    expect(a.pos.x - a0.x).toBeGreaterThan(2.5);
    expect(Math.abs(a.pos.z - a0.z)).toBeLessThan(1.5);
    expect(b0.z - b.pos.z).toBeGreaterThan(2.5);
    expect(Math.abs(b.pos.x - b0.x)).toBeLessThan(1.5);
  });

  it('las dos mitades del teclado no comparten teclas', () => {
    const k1 = new Set(Object.values(P1_SPLIT).flat());
    for (const k of Object.values(P2_SPLIT).flat()) expect(k1.has(k)).toBe(false);
  });
});

describe('Cooperativo en el mismo PC', () => {
  it('dos humanos en el mismo equipo controlan a dos futbolistas distintos', () => {
    const m = makeMatch({ seed: 5, humanTeam: 0, coop: true });
    m.simulate(1);
    m.phase = 'play';
    const basis = { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) };
    const opts = { autoSwitch: false, passAssist: 1, powerBarTime: 0.6, showAimAssist: true, assist: false };
    const i1 = new Input(P1_SPLIT, false);
    const i2 = new Input(P2_SPLIT, false);
    i1.padSource = null;
    i2.padSource = null;
    m.teams[0].human = true;
    m.controllers[0] = new HumanController(i1, basis, opts);
    m.controllers2[0] = new HumanController(i2, basis, opts);
    const t = m.teams[0];
    const a = t.players[6];
    const b = t.players[8];
    a.pos.set(-10, 0, -10);
    b.pos.set(-10, 0, 10);
    t.controlled = a;
    t.controlled2 = b;
    m.ball.reset(20, 30);
    m.owner = null;
    const a0 = a.pos.clone();
    const b0 = b.pos.clone();
    i1.setKey('KeyD', true); // J1 a la derecha
    i2.setKey('ArrowLeft', true); // J2 a la izquierda
    for (let i = 0; i < 60; i++) { i1.poll(SIM_DT); i2.poll(SIM_DT); m.step(); m.events.length = 0; }
    expect(t.controlled).not.toBe(t.controlled2);
    expect(a.pos.x - a0.x).toBeGreaterThan(2.5);
    expect(b0.x - b.pos.x).toBeGreaterThan(2.5);
  });

  it('no pueden controlar al mismo futbolista: se intercambian', () => {
    const m = makeMatch({ seed: 5, humanTeam: 0, coop: true });
    const t = m.teams[0];
    const [x, y] = [t.players[3], t.players[4]];
    t.controlled = x;
    t.controlled2 = y;
    t.controlled = y;
    expect(t.controlled).toBe(y);
    expect(t.controlled2).toBe(x);
  });
});
