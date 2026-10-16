import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { SIM_DT } from '../src/config/constants';
import { Input } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';
import { chooseAerial } from '../src/sim/Aerial';
import type { MatchEvent } from '../src/sim/types';
import type { Player } from '../src/sim/Player';
import { Ball } from '../src/sim/Ball';

/** Velocidad vertical de salida para que el balón (con su física real, arrastre incluido) pase por `at` a la altura `h`. */
function launchVy(from: [number, number], at: [number, number], vh: [number, number], h: number): number {
  let lo = 0, hi = 20;
  for (let k = 0; k < 40; k++) {
    const vy = (lo + hi) / 2;
    const b = new Ball();
    b.pos.set(from[0], 0.5, from[1]);
    b.vel.set(vh[0], vy, vh[1]);
    const total = Math.hypot(at[0] - from[0], at[1] - from[1]);
    let y = 0;
    for (let i = 0; i < 400; i++) {
      b.step(SIM_DT);
      if (Math.hypot(b.pos.x - from[0], b.pos.z - from[1]) >= total) { y = b.pos.y; break; }
    }
    if (y < h) lo = vy; else hi = vy;
  }
  return (lo + hi) / 2;
}

/**
 * Prepara una jugada: el equipo 0 ataca hacia +x, todos lejos salvo el jugador `p` (en `at`, mirando a `facing`)
 * y el balón lanzado desde `from` para que llegue a `at` a la altura `h` en `T` segundos.
 */
function scene(opts: { at: [number, number]; facing: number; from: [number, number]; h: number; T: number; human?: boolean; keeper?: boolean }) {
  const m = makeMatch({ seed: 3 });
  m.simulate(1);
  m.phase = 'play';
  const team = m.teams[0];
  team.attackDir = 1;
  m.teams[1].attackDir = -1;
  const input = new Input();
  if (opts.human) {
    team.human = true;
    m.controllers[0] = new HumanController(input, { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) }, { autoSwitch: false, passAssist: 1, powerBarTime: 1, showAimAssist: true, assist: false });
  }
  for (const q of m.active) q.pos.set(-45, 0, q.team === 0 ? 30 : -30);
  const gk = m.teams[1].goalkeeper!;
  gk.pos.set(opts.keeper === false ? -45 : 52, 0, opts.keeper === false ? 0 : 0);
  // el mejor rematador del equipo
  const p: Player = [...team.players].filter((q) => !q.isGK).sort((a, b) => b.data.attrs.shooting + b.data.attrs.control - a.data.attrs.shooting - a.data.attrs.control)[0];
  p.pos.set(opts.at[0], 0, opts.at[1]);
  p.vel.set(0, 0, 0);
  p.facing = opts.facing;
  p.clearAction();
  team.controlled = p;
  const b = m.ball;
  b.held = false;
  m.owner = null;
  b.pos.set(opts.from[0], 0.5, opts.from[1]);
  const T = opts.T;
  const vh: [number, number] = [(opts.at[0] - opts.from[0]) / T, (opts.at[1] - opts.from[1]) / T];
  b.vel.set(vh[0], launchVy(opts.from, opts.at, vh, opts.h), vh[1]);
  b.spin.set(0, 0, 0);
  // último toque de un compañero (centro)
  m.setLastTouch(team.players.find((q) => q !== p && !q.isGK)!, true, 'cross');
  const events: MatchEvent[] = [];
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      input.poll(SIM_DT);
      m.step();
      events.push(...m.events);
      m.events.length = 0;
    }
  };
  return { m, p, b, input, events, step };
}

describe('Control de balones aéreos', () => {
  it('un centro a la altura del pecho se controla con el pecho y cae a los pies', () => {
    const { m, p, b, events, step } = scene({ at: [0, 0], facing: -Math.PI / 2, from: [-9, 0], h: 1.35, T: 1 });
    step(80);
    const touch = events.find((e) => e.type === 'touch' && e.playerId === p.id);
    expect(touch?.kind).toBe('chest');
    expect(events.some((e) => e.type === 'kick' && e.kind === 'header')).toBe(false);
    step(40);
    expect(m.owner).toBe(p);
    expect(b.pos.y).toBeLessThan(0.3);
    expect(Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z)).toBeLessThan(1.5);
  });

  it('a media altura se controla con el muslo', () => {
    const { m, p, events, step } = scene({ at: [0, 0], facing: -Math.PI / 2, from: [-6, 0], h: 0.7, T: 0.55 });
    step(80);
    expect(events.find((e) => e.type === 'touch' && e.playerId === p.id)?.kind).toBe('thigh');
    step(40);
    expect(m.owner).toBe(p);
  });

  it('un pelotazo demasiado fuerte rebota en el cuerpo (no se controla)', () => {
    const { p, events, step } = scene({ at: [0, 0], facing: -Math.PI / 2, from: [-26, 0], h: 1.3, T: 0.9 });
    step(70);
    expect(events.some((e) => e.type === 'touch' && e.playerId === p.id)).toBe(false);
  });
});

describe('Remates acrobáticos', () => {
  it('elige el remate según la altura y la orientación', () => {
    expect(chooseAerial(0.8, false)).toBe('volley');
    expect(chooseAerial(1.4, false)).toBe('scissor');
    expect(chooseAerial(1.9, false)).toBe(null); // cabezazo
    expect(chooseAerial(1.6, true)).toBe('bicycle');
    expect(chooseAerial(0.2, false)).toBe(null);
  });

  it('la IA remata de volea un centro bajo cerca del arco', () => {
    const { p, b, events, step } = scene({ at: [41, 2], facing: Math.PI / 2, from: [41, 16], h: 0.7, T: 0.8, keeper: false });
    step(90);
    expect(events.some((e) => e.type === 'skill' && e.kind === 'volley' && e.playerId === p.id)).toBe(true);
    const kick = events.find((e) => e.type === 'kick' && e.playerId === p.id);
    expect(kick?.kind).toBe('shoot');
    step(60);
    expect(events.some((e) => e.type === 'goal' || e.type === 'post' || e.type === 'out') || b.vel.x > 5).toBe(true);
  });

  for (const [name, facing, h, kind] of [
    ['chilena (de espaldas al arco)', -Math.PI / 2, 1.65, 'bicycle'],
    ['tijera (de lado)', 0, 1.35, 'scissor'],
    ['volea', Math.PI / 2, 0.8, 'volley'],
    ['escorpión (de espaldas, a media altura)', -Math.PI / 2, 0.9, 'scorpion'],
  ] as const) {
    it(`el jugador controlado remata de ${name} con TIRO y el balón va al arco`, () => {
      const { p, b, input, events, step } = scene({ at: [42, 0], facing, from: kind === 'bicycle' || kind === 'scorpion' ? [30, 6] : [42, 14], h, T: 1.1, human: true, keeper: false });
      step(20);
      input.setKey('KeyD', true);
      step(10);
      input.setKey('KeyD', false);
      step(60);
      expect(events.find((e) => e.type === 'skill' && e.playerId === p.id)?.kind).toBe(kind);
      expect(events.some((e) => e.type === 'kick' && e.playerId === p.id)).toBe(true);
      // tras el golpe el balón viaja hacia el arco rival (+x)
      const goalOrHeading = events.some((e) => e.type === 'goal' && e.team === 0) || b.vel.x > 3 || b.pos.x > 50;
      expect(goalOrHeading).toBe(true);
      if (kind !== 'volley' && kind !== 'scorpion') {
        // cae al césped y se levanta
        step(80);
        expect(['getup', 'none', 'celebrate'].includes(p.action.kind)).toBe(true);
      }
    });
  }
});

describe('Cabezazo en plancha y taco', () => {
  it('con PASE a un balón bajo que cruza por delante, se lanza en plancha', () => {
    const { p, input, events, step } = scene({ at: [44, 0], facing: Math.PI / 2, from: [44, 14], h: 0.6, T: 0.9, human: true, keeper: false });
    // el balón pasa algo por delante del jugador (no a sus pies)
    p.pos.x -= 1.1;
    step(15);
    input.setKey('KeyS', true);
    step(4);
    input.setKey('KeyS', false);
    step(50);
    expect(events.find((e) => e.type === 'skill' && e.playerId === p.id)?.kind).toBe('diving');
    expect(events.some((e) => e.type === 'kick' && e.playerId === p.id && e.kind === 'header')).toBe(true);
  });

  it('elige el taco con un balón raso de espaldas al arco', () => {
    expect(chooseAerial(0.2, true)).toBe('backheel');
    expect(chooseAerial(0.9, true)).toBe('scorpion');
  });
});
