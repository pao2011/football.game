import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { HALF_LENGTH, SIM_DT } from '../src/config/constants';
import { solveKickThrough } from '../src/sim/Kicks';
import { Ball } from '../src/sim/Ball';
import { buildCross, chooseCrossTarget, type CrossStyle } from '../src/ai/Actions';
import { Input } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';
import { shapeTarget, updateTeamTactics } from '../src/ai/TeamAI';

/** Altura del balón al pasar por la vertical de un punto (trayectoria real). */
function heightAt(from: Vector3, v: Vector3, spin: Vector3, pt: Vector3) {
  const b = new Ball();
  b.pos.copy(from);
  b.vel.copy(v);
  b.spin.copy(spin);
  let best = { d: Infinity, y: 0 };
  for (let i = 0; i < 300; i++) {
    b.step(SIM_DT);
    const d = Math.hypot(b.pos.x - pt.x, b.pos.z - pt.z);
    if (d < best.d) best = { d, y: b.pos.y };
  }
  return best;
}

/** Centro desde la banda con 3 rematadores, 4 defensores y el arquero. */
function crossScene(seed: number) {
  const m = makeMatch({ seed });
  m.simulate(1);
  m.phase = 'play';
  const t = m.teams[0];
  const g = t.attackDir;
  const o = m.teams[1];
  const side = seed % 2 ? 1 : -1;
  const p = t.players[10];
  p.pos.set(g * (HALF_LENGTH - 8), 0, side * 24);
  p.vel.set(0, 0, 0);
  p.clearAction();
  m.ball.reset(g * (HALF_LENGTH - 7.5), side * 24);
  m.owner = p;
  const atk = [t.players[9], t.players[8], t.players[7]];
  atk[0].pos.set(g * (HALF_LENGTH - 14), 0, side * 4);
  atk[1].pos.set(g * (HALF_LENGTH - 16), 0, -side * 3);
  atk[2].pos.set(g * (HALF_LENGTH - 20), 0, 0);
  const defs = o.active.filter((q) => !q.isGK).slice(0, 4);
  defs[0].pos.set(g * (HALF_LENGTH - 8), 0, side * 3);
  defs[1].pos.set(g * (HALF_LENGTH - 9), 0, -side * 2);
  defs[2].pos.set(g * (HALF_LENGTH - 12), 0, 0);
  defs[3].pos.set(g * (HALF_LENGTH - 6), 0, side * 10);
  for (const q of [...t.active, ...o.active]) if (!atk.includes(q) && !defs.includes(q) && q !== p && !q.isGK) q.pos.set(-g * 10, 0, q.pos.z);
  return { m, t, p, atk };
}

describe('Centros', () => {
  it('el balón pasa por el punto pedido a la altura pedida (con efecto)', () => {
    const from = new Vector3(45, 0.11, 24);
    for (const [tz, ty, spin] of [[2, 1.8, 22], [-3, 1.4, -22], [0, 0.8, 14]] as const) {
      const target = new Vector3(38, ty, tz);
      const sol = solveKickThrough(from, target, 24, spin)!;
      expect(sol).not.toBeNull();
      const h = heightAt(from, sol.velocity, sol.spin, target);
      expect(h.d).toBeLessThan(0.3);
      expect(Math.abs(h.y - ty)).toBeLessThan(0.25);
    }
  });

  for (const [style, lo, hi] of [['normal', 0.9, 2.7], ['driven', 1.0, 1.9], ['low', 0.4, 1.2]] as const) {
    it(`centro ${style}: llega al rematador a altura de ${style === 'low' ? 'cintura' : 'cabeza'}`, () => {
      const { m, t, p } = crossScene(3);
      const { receiver, point } = chooseCrossTarget(m, t, p);
      expect(receiver).not.toBeNull();
      const req = buildCross(m, p, point, style as CrossStyle, 1, receiver);
      expect(req.kind).toBe('cross');
      const h = heightAt(m.ball.pos.clone(), req.velocity, req.spin, point);
      expect(h.d).toBeLessThan(1.6);
      expect(h.y).toBeGreaterThan(lo);
      expect(h.y).toBeLessThan(hi);
    });
  }

  it('los rematadores atacan el área (primer palo, penal y segundo palo) cuando un compañero va a centrar', () => {
    const { m, t, p } = crossScene(4);
    updateTeamTactics(m, t);
    const runners = t.active.filter((q) => q !== p && q.duty === 'run' && t.u(q.tacticalTarget) > HALF_LENGTH - 17);
    expect(runners.length).toBeGreaterThanOrEqual(2);
  });

  it('los centros de la IA terminan en remate de los atacantes y en goles', () => {
    let first = 0;
    let goals = 0;
    const N = 20;
    for (let seed = 1; seed <= N; seed++) {
      const { m, t, p } = crossScene(seed);
      const { receiver, point } = chooseCrossTarget(m, t, p);
      m.requestKick(p, buildCross(m, p, point, 'normal', 1, receiver));
      let decided = false;
      for (let i = 0; i < 60 * 5; i++) {
        m.step(SIM_DT);
        for (const e of m.events) if (e.type === 'goal' && e.team === 0) goals++;
        m.events.length = 0;
        const lt = m.lastTouch;
        if (!decided && lt && lt.player !== p) {
          decided = true;
          if (lt.player.team === 0) first++;
        }
        if (m.phase !== 'play') break;
      }
    }
    // un atacante toca primero en la gran mayoría y algunos acaban en gol
    expect(first).toBeGreaterThanOrEqual(N * 0.8);
    expect(goals).toBeGreaterThanOrEqual(2);
  });
});

describe('Esquema clásico de FIFA (mando y teclado)', () => {
  function setup() {
    const { m, t, p } = crossScene(5);
    t.human = true;
    const input = new Input();
    const hc = new HumanController(input, { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) }, {
      autoSwitch: false, passAssist: 1, powerBarTime: 1, showAimAssist: true, assist: false,
    });
    m.controllers[0] = hc;
    t.controlled = p;
    const kicks: { kind: string; speed: number; vy: number }[] = [];
    const orig = m.requestKick.bind(m);
    m.requestKick = (pl, req) => { if (pl === p) kicks.push({ kind: req.kind, speed: req.velocity.length(), vy: req.velocity.y }); return orig(pl, req); };
    const step = (n: number) => { for (let i = 0; i < n; i++) { input.poll(SIM_DT); m.step(); m.events.length = 0; } };
    const tap = (code: string, frames = 6) => { input.setKey(code, true); step(frames); input.setKey(code, false); step(1); };
    return { m, t, p, input, hc, kicks, step, tap };
  }
  const lastCross = (k: { kind: string; vy: number; speed: number }[]) => k.filter((x) => x.kind === 'cross').pop();

  it('X (A) = centro; RB + X (Shift + A) = centro tenso (más bajo)', () => {
    const a = setup();
    a.tap('KeyA', 20);
    a.step(25);
    const normal = lastCross(a.kicks)!;
    expect(normal).toBeTruthy();
    const b = setup();
    b.input.setKey('ShiftLeft', true);
    b.tap('KeyA', 20);
    b.input.setKey('ShiftLeft', false);
    b.step(25);
    const driven = lastCross(b.kicks)!;
    expect(driven).toBeTruthy();
    expect(driven.vy).toBeLessThan(normal.vy);
  });

  it('X dos veces = centro bajo; tres veces = centro raso', () => {
    const a = setup();
    a.tap('KeyA', 3);
    a.tap('KeyA', 3);
    a.step(30);
    const low = a.p.action.kick ?? null;
    const b = setup();
    b.tap('KeyA', 3);
    b.tap('KeyA', 3);
    b.tap('KeyA', 3);
    b.step(30);
    const c = setup();
    c.tap('KeyA', 3);
    c.step(30);
    const vy = (s: ReturnType<typeof setup>) => s.m.lastTouch?.player === s.p ? s.m.ball.vel.y : NaN;
    void low;
    // altura de salida: normal > bajo > raso
    expect(vy(c)).toBeGreaterThan(vy(a));
    expect(vy(a)).toBeGreaterThan(vy(b));
    expect(Math.abs(b.m.ball.pos.y)).toBeLessThan(0.6);
  });

  it('RB + A = pase tenso (más rápido que el normal)', () => {
    const a = setup();
    a.m.ball.reset(a.p.pos.x + 0.5 * a.t.attackDir, 0);
    a.p.pos.set(0, 0, 0);
    a.m.ball.reset(0.5 * a.t.attackDir, 0);
    a.tap('KeyS', 10);
    a.step(2);
    const b = setup();
    b.p.pos.set(0, 0, 0);
    b.m.ball.reset(0.5 * b.t.attackDir, 0);
    b.input.setKey('ShiftLeft', true);
    b.tap('KeyS', 10);
    b.input.setKey('ShiftLeft', false);
    b.step(2);
    const pa = a.kicks.find((k) => k.kind === 'pass')!;
    const pb = b.kicks.find((k) => k.kind === 'pass')!;
    expect(pb.speed).toBeGreaterThan(pa.speed * 1.15);
  });

  it('LB + Y (Q + W) = pase al hueco bombeado', () => {
    const a = setup();
    a.p.pos.set(0, 0, 0);
    a.m.ball.reset(0.5 * a.t.attackDir, 0);
    a.input.setKey('KeyQ', true);
    a.tap('KeyW', 10);
    a.input.setKey('KeyQ', false);
    a.step(2);
    const k = a.kicks.pop()!;
    expect(k.kind).toBe('lob');
    expect(k.vy).toBeGreaterThan(5);
  });

  it('LB (Q) solo, con el balón, pide un desmarque a un compañero adelantado', () => {
    const a = setup();
    a.p.pos.set(0, 0, 0);
    a.m.ball.reset(0.5 * a.t.attackDir, 0);
    a.tap('KeyQ', 6);
    const runner = a.t.active.find((q) => q.forcedRunUntil > a.m.time);
    expect(runner).toBeTruthy();
    updateTeamTactics(a.m, a.t);
    expect(runner!.duty).toBe('run');
    expect(a.t.u(runner!.forcedRunTarget)).toBeGreaterThan(a.t.u(runner!.pos));
    expect(a.kicks.length).toBe(0); // no golpea
  });

  it('cruceta ← → = mentalidad: el bloque se adelanta o se atrasa', () => {
    const a = setup();
    const q = a.t.players[5];
    const before = a.t.u(shapeTarget(a.m, a.t, q, true));
    a.input.padTactic = 1;
    a.hc.update(a.m, a.t, SIM_DT);
    a.input.padTactic = 0;
    a.hc.update(a.m, a.t, SIM_DT);
    expect(a.t.mentality).toBe(1);
    expect(a.t.u(shapeTarget(a.m, a.t, q, true))).toBeGreaterThan(before + 2);
  });
});
