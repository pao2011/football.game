import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { BALL_RADIUS, GOAL_HALF_WIDTH, GOAL_HEIGHT, HALF_LENGTH, SIM_DT } from '../src/config/constants';
import { buildShot, NORMAL_SHOT, shotStyleName } from '../src/ai/Actions';
import { Ball } from '../src/sim/Ball';
import { Input } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';
import { SKILL_KINDS } from '../src/sim/types';
import type { Match } from '../src/sim/Match';

/** Partido en juego con el delantero local solo frente al arco rival (atacando a +x). */
function setupShooter(dist = 18) {
  const m = makeMatch({ seed: 7 });
  m.simulate(1);
  m.phase = 'play';
  const t = m.teams[0];
  t.attackDir = 1;
  m.teams[1].attackDir = -1;
  const p = t.players[9];
  for (const q of m.active) if (q !== p && !q.isGK) q.pos.set(-30, 0, q.pos.z);
  const gk = m.teams[1].goalkeeper!;
  gk.pos.set(HALF_LENGTH - 0.5, 0, 0);
  p.pos.set(HALF_LENGTH - dist, 0, 0);
  p.facing = Math.PI / 2;
  p.vel.set(0, 0, 0);
  m.ball.reset(p.pos.x + 0.5, 0);
  m.owner = p;
  return { m, p, gk };
}

/** Vuela el balón libre (sin jugadores) y devuelve el punto de cruce de la línea de gol y la altura máxima. */
function flight(v: Vector3, spin: Vector3, from: Vector3) {
  const b = new Ball();
  b.pos.copy(from);
  b.vel.copy(v);
  b.spin.copy(spin);
  let maxY = 0;
  let cross: Vector3 | null = null;
  for (let i = 0; i < 240 && !cross; i++) {
    b.step(SIM_DT);
    maxY = Math.max(maxY, b.pos.y);
    if (b.pos.x >= HALF_LENGTH) cross = b.pos.clone();
  }
  return { cross, maxY, speed0: v.length() };
}

describe('Tipos de disparo', () => {
  const shot = (dist: number, style: Partial<typeof NORMAL_SHOT>, power = 0.7) => {
    const { m, p } = setupShooter(dist);
    const req = buildShot(m, p, 2, 1, power, { ...NORMAL_SHOT, ...style }, 1);
    return { req, ...flight(req.velocity, req.spin, m.ball.pos) };
  };

  it('vaselina: sube por encima del arquero y entra bajo el travesaño', () => {
    const r = shot(18, { chip: true });
    expect(r.req.kind).toBe('chip');
    expect(r.maxY).toBeGreaterThan(3.2); // pasa muy por encima de un arquero (≈2.4 m con salto)
    expect(r.cross).not.toBeNull();
    expect(r.cross!.y).toBeLessThan(GOAL_HEIGHT);
    expect(Math.abs(r.cross!.z)).toBeLessThan(GOAL_HALF_WIDTH);
  });

  it('tiro raso: va pegado al césped', () => {
    const r = shot(16, { low: true });
    expect(r.maxY).toBeLessThan(0.8);
    expect(r.cross).not.toBeNull();
    expect(Math.abs(r.cross!.z)).toBeLessThan(GOAL_HALF_WIDTH);
  });

  it('tiro potente: más rápido que el normal con la misma carga', () => {
    const normal = shot(20, {});
    const power = shot(20, { power: true });
    expect(power.speed0).toBeGreaterThan(normal.speed0 + 5);
    expect(power.req.errorScale).toBeGreaterThan(normal.req.errorScale);
  });

  it('rosca: lleva efecto lateral y curva hacia el arco', () => {
    const r = shot(20, { finesse: true });
    expect(Math.abs(r.req.spin.y)).toBeGreaterThan(20);
    expect(r.cross).not.toBeNull();
    expect(Math.abs(r.cross!.z)).toBeLessThan(GOAL_HALF_WIDTH + 0.6);
  });

  it('combinaciones: rosca rasa, potente raso y vaselina con efecto', () => {
    const fl = shot(16, { finesse: true, low: true });
    expect(fl.maxY).toBeLessThan(1.0);
    expect(Math.abs(fl.req.spin.y)).toBeGreaterThan(20);
    const pl = shot(16, { power: true, low: true });
    expect(pl.maxY).toBeLessThan(0.9);
    expect(pl.speed0).toBeGreaterThan(shot(16, { low: true }).speed0);
    const cf = shot(18, { chip: true, finesse: true });
    expect(cf.maxY).toBeGreaterThan(3);
    expect(Math.abs(cf.req.spin.y)).toBeGreaterThan(10);
    expect(shotStyleName({ chip: true, finesse: true, power: false, low: false })).toBe('VASELINA CON EFECTO');
    expect(shotStyleName({ chip: false, finesse: false, power: true, low: true })).toBe('TIRO RASO POTENTE');
  });
});

describe('Regates', () => {
  function withDefender(m: Match, p: ReturnType<typeof setupShooter>['p'], dist = 1.8) {
    const d = m.teams[1].players[3];
    d.pos.set(p.pos.x + dist, 0, 0);
    d.facing = -Math.PI / 2;
    d.vel.set(0, 0, 0);
    return d;
  }

  it('los seis regates se ejecutan con su animación y mantienen o liberan el balón según el gesto', () => {
    for (const kind of SKILL_KINDS) {
      const { m, p } = setupShooter(40);
      expect(m.requestSkill(p, kind, 1)).toBe(true);
      expect(p.action.kind).toBe('skill');
      for (let i = 0; i < 20; i++) { m.step(); m.events.length = 0; }
      expect(p.anim.state).toBe('skill');
      for (let i = 0; i < 60 && p.action.kind === 'skill'; i++) { m.step(); m.events.length = 0; }
      if (kind === 'rainbow') {
        // el sombrero eleva el balón hacia delante
        expect(m.ball.pos.x).toBeGreaterThan(p.pos.x - 1);
      } else {
        expect(m.owner).toBe(p);
      }
      expect(Number.isFinite(m.ball.pos.x)).toBe(true);
    }
  });

  it('la bicicleta cambia la dirección hacia el lado elegido', () => {
    const { m, p } = setupShooter(40);
    const z0 = p.pos.z;
    m.requestSkill(p, 'stepover', 1); // hacia la izquierda del jugador (mirando a +x, izquierda = -z)
    for (let i = 0; i < 60; i++) { m.step(); m.events.length = 0; }
    expect(p.pos.z).toBeLessThan(z0 - 0.5);
  });

  it('un regate puede superar al defensor (que queda descolocado y no puede entrar)', () => {
    let beats = 0;
    for (let k = 0; k < 20; k++) {
      const { m, p } = setupShooter(40);
      const d = withDefender(m, p);
      m.rng.next = (() => { let x = k / 20; return () => (x = (x + 0.37) % 1); })();
      m.requestSkill(p, 'stepover', 1);
      for (let i = 0; i < 30; i++) { m.step(); m.events.length = 0; }
      if (d.stunnedUntil > m.time) {
        beats++;
        expect(m.requestTackle(d, false)).toBe(false);
      }
    }
    expect(beats).toBeGreaterThan(3);
    expect(beats).toBeLessThan(20); // no siempre funciona
  });

  it('la ruleta protege el balón de una entrada', () => {
    const { m, p } = setupShooter(40);
    const d = withDefender(m, p, 1.1);
    m.requestSkill(p, 'roulette', 1);
    for (let i = 0; i < 6; i++) m.step();
    d.facing = Math.atan2(m.ball.pos.x - d.pos.x, m.ball.pos.z - d.pos.z);
    m.requestTackle(d, false);
    for (let i = 0; i < 20; i++) { m.step(); m.events.length = 0; }
    // el defensor no puede robar limpiamente: o falla o comete falta sobre el que gira
    expect(m.teams[1].stats.tackles).toBe(0);
    expect(m.owner).not.toBe(d);
  });
});

describe('Controles de tiros y regates (teclado estilo FIFA)', () => {
  function setup() {
    const ctx = setupShooter(18);
    const input = new Input();
    const hc = new HumanController(input, { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) }, { autoSwitch: false, passAssist: 1, powerBarTime: 1, showAimAssist: true });
    ctx.m.teams[0].human = true;
    ctx.m.teams[0].controlled = ctx.p;
    ctx.m.controllers[0] = hc;
    const step = (n: number) => { for (let i = 0; i < n; i++) { input.poll(SIM_DT); ctx.m.step(); ctx.m.events.length = 0; } };
    const tap = (code: string, frames = 1) => { input.setKey(code, true); step(frames); input.setKey(code, false); };
    return { ...ctx, input, hc, step, tap };
  }

  it('Q + D = vaselina', () => {
    const { m, p, input, step, tap } = setup();
    input.setKey('KeyQ', true);
    tap('KeyD', 20);
    step(2);
    input.setKey('KeyQ', false);
    expect(p.action.kick?.kind).toBe('chip');
    void m;
  });

  it('Q + Shift + D = tiro potente; Ctrl + D también', () => {
    const a = setup();
    a.input.setKey('KeyQ', true);
    a.input.setKey('ShiftLeft', true);
    a.tap('KeyD', 20);
    a.step(2);
    expect(a.p.action.kick?.style?.power).toBe(true);
    const b = setup();
    b.input.setKey('ControlLeft', true);
    b.tap('KeyD', 20);
    b.step(2);
    expect(b.p.action.kick?.style?.power).toBe(true);
  });

  it('doble toque de D = tiro raso', () => {
    const { p, step, tap } = setup();
    tap('KeyD', 20);
    step(3);
    tap('KeyD', 1);
    step(1);
    expect(p.action.kick?.style?.low).toBe(true);
  });

  it('D y luego S (mientras carga) = amago de tiro', () => {
    const { m, p, input, step } = setup();
    input.setKey('KeyD', true);
    step(10);
    input.setKey('KeyS', true);
    step(2);
    input.setKey('KeyS', false);
    input.setKey('KeyD', false);
    step(2);
    expect(p.action.kind).toBe('skill');
    expect(SKILL_KINDS[p.action.variant]).toBe('fakeshot');
    expect(m.teams[0].stats.shots).toBe(0);
  });

  it('I / K / J / L y R hacen regates (sombrero, arrastre, bicicleta, ruleta)', () => {
    const cases: [string, string][] = [['KeyI', 'rainbow'], ['KeyK', 'dragback'], ['KeyJ', 'stepover'], ['KeyR', 'roulette']];
    for (const [key, kind] of cases) {
      const { p, tap } = setup();
      tap(key);
      expect(p.action.kind).toBe('skill');
      expect(SKILL_KINDS[p.action.variant]).toBe(kind);
    }
  });

  it('deslizar el dedo (gesto táctil) hace un regate y sobre TIRO cambia el tipo de disparo', () => {
    const a = setup();
    a.input.pushGesture({ type: 'skill', dir: { x: 0.7, y: 0.7 } });
    a.step(1);
    expect(a.p.action.kind).toBe('skill');
    expect(SKILL_KINDS[a.p.action.variant]).toBe('elastico');
    const b = setup();
    b.input.setVirtual('shoot', true);
    b.step(20);
    b.input.pushGesture({ type: 'shot', dir: { x: 0, y: 1 } });
    b.input.setVirtual('shoot', false);
    b.step(2);
    expect(b.p.action.kick?.kind).toBe('chip');
  });

  it('con balón, Q no cambia de jugador (es el modificador de vaselina)', () => {
    const { m, p, tap } = setup();
    tap('KeyQ');
    expect(m.teams[0].controlled).toBe(p);
    void BALL_RADIUS;
  });
});
