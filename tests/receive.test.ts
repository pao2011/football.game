import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { SIM_DT } from '../src/config/constants';
import { Input } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';

/** Pase de 22 m hacia delante; después del pase el stick queda en (sx, sy). */
function scene(sx: number, sy: number, human: boolean) {
  const m = makeMatch({ seed: 7 });
  m.simulate(1);
  m.phase = 'play';
  const team = m.teams[0];
  team.attackDir = 1;
  m.teams[1].attackDir = -1;
  const input = new Input();
  if (human) {
    team.human = true;
    m.controllers[0] = new HumanController(input, { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) }, { autoSwitch: true, passAssist: 1, powerBarTime: 1, showAimAssist: true, assist: false });
  }
  for (const q of m.active) q.pos.set(-40, 0, 38);
  m.teams[1].players[3].pos.set(35, 0, 20);
  m.teams[1].goalkeeper!.pos.set(52, 0, 0);
  const p = team.players[9];
  p.pos.set(0, 0, 0);
  p.facing = Math.PI / 2;
  p.clearAction();
  const A = team.players[8];
  A.pos.set(22, 0, 0);
  m.ball.reset(0.5, 0);
  m.owner = p;
  team.controlled = p;
  const step = (n: number) => { for (let i = 0; i < n; i++) { input.poll(SIM_DT); m.step(); m.events.length = 0; } };
  if (human) {
    input.setVirtualAxes(1, 0);
    step(1);
    input.setKey('KeyS', true);
    step(8);
    input.setKey('KeyS', false);
    step(3);
  } else {
    m.requestKick(p, { kind: 'pass', velocity: new Vector3(14, 0, 0), spin: new Vector3(), targetId: A.id, power: 0.5, errorScale: 0 });
  }
  input.setVirtualAxes(sx, sy);
  const x0 = A.pos.x;
  let t = 0;
  for (; t < 300 && m.owner !== A; t++) step(1);
  return { cameToBall: x0 - A.pos.x, got: m.owner === A, controlled: team.controlled === A };
}

describe('Los jugadores van al balón cuando se les pasa', () => {
  it('la IA sale al encuentro del pase (no lo espera quieta)', () => {
    const r = scene(0, 0, false);
    expect(r.got).toBe(true);
    expect(r.cameToBall).toBeGreaterThan(4);
  });

  for (const [name, sx, sy] of [['sin stick', 0, 0], ['con el stick hacia el pase', 1, 0], ['con el stick hacia un costado', 0, 1], ['con el stick hacia atrás', -1, 0]] as const) {
    it(`el jugador controlado va a buscar el pase ${name} y lo recibe`, () => {
      const r = scene(sx, sy, true);
      expect(r.controlled).toBe(true);
      expect(r.got).toBe(true);
      expect(r.cameToBall).toBeGreaterThan(2.5);
    });
  }
});
