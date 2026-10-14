import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { BALL_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH, SIM_DT } from '../src/config/constants';
import { Input } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';
import { Ball } from '../src/sim/Ball';

/** Equipo local atacando hacia +x, con el controlador humano en modo asistido o manual. */
function setup(assist: boolean) {
  const m = makeMatch({ seed: 7 });
  m.simulate(1);
  m.phase = 'play';
  const team = m.teams[0];
  team.attackDir = 1;
  m.teams[1].attackDir = -1;
  team.human = true;
  const input = new Input();
  const hc = new HumanController(input, { right: new Vector3(1, 0, 0), forward: new Vector3(0, 0, -1) }, {
    autoSwitch: false, passAssist: 1, powerBarTime: 1, showAimAssist: true, assist,
  });
  m.controllers[0] = hc;
  const step = (n: number) => { for (let i = 0; i < n; i++) { input.poll(SIM_DT); m.step(); m.events.length = 0; } };
  const tap = (code: string, frames = 1) => { input.setKey(code, true); step(frames); input.setKey(code, false); };
  // todos lejos del juego
  for (const q of m.active) q.pos.set(-40, 0, 38);
  const gk = m.teams[1].goalkeeper!;
  gk.pos.set(HALF_LENGTH - 0.5, 0, 0);
  return { m, team, input, hc, step, tap, gk };
}

/** Pone al jugador con balón en el punto dado, mirando a +x. */
function giveBall(m: ReturnType<typeof setup>['m'], team: ReturnType<typeof setup>['team'], x: number, z: number) {
  const p = team.players[9];
  p.pos.set(x, 0, z);
  p.vel.set(0, 0, 0);
  p.facing = Math.PI / 2;
  p.clearAction();
  m.ball.reset(x + 0.5, z);
  m.owner = p;
  team.controlled = p;
  return p;
}

function crossAtGoal(v: Vector3, from: Vector3) {
  const b = new Ball();
  b.pos.copy(from);
  b.vel.copy(v);
  for (let i = 0; i < 240; i++) {
    b.step(SIM_DT);
    if (b.pos.x >= HALF_LENGTH) return b.pos.clone();
  }
  return null;
}

describe('Modo asistido (móvil): pases', () => {
  function passScene(assist: boolean) {
    const s = setup(assist);
    const p = giveBall(s.m, s.team, 0, 0);
    const A = s.team.players[8]; // libre y adelantado
    const B = s.team.players[6]; // libre pero atrás
    const C = s.team.players[7]; // marcado
    const D = s.team.players[10]; // en fuera de juego, justo delante
    A.pos.set(18, 0, 10);
    B.pos.set(-15, 0, 4);
    C.pos.set(14, 0, -12);
    D.pos.set(40, 0, 0);
    const opp = s.m.teams[1].players;
    opp[3].pos.set(30, 0, 20); // penúltimo defensor: define la línea de fuera de juego
    opp[4].pos.set(14.8, 0, -12.5); // marca a C
    return { ...s, p, A, B, C, D };
  }

  it('un toque en PASE sin dirección elige al compañero libre y adelantado, no al marcado ni al fuera de juego', () => {
    const { p, A, tap, step } = passScene(true);
    tap('KeyS');
    step(1);
    expect(p.action.kick?.kind).toBe('pass');
    expect(p.action.kick?.targetId).toBe(A.id);
  });

  it('la ayuda visual señala al mismo receptor antes de pasar', () => {
    const { m, team, hc, A } = passScene(true);
    expect(hc.previewReceiver(m, team)?.id).toBe(A.id);
  });

  it('el pase asistido llega al receptor', () => {
    const { m, p, A, tap, step } = passScene(true);
    tap('KeyS');
    step(150);
    expect(m.lastTouch?.player.id === A.id || m.owner?.id === A.id).toBe(true);
    void p;
  });

  it('al pulsar PASE el control pasa al receptor antes de que el balón salga', () => {
    const { m, team, p, A, tap, step } = passScene(true);
    tap('KeyS');
    step(1);
    expect(m.owner).toBe(p); // el pasador todavía arma el golpeo
    expect(team.controlled).toBe(A);
  });

  it('el receptor no se aleja aunque el stick siga apuntando hacia el pase', () => {
    const { m, A, input, tap, step } = passScene(true);
    input.setVirtualAxes(18 / 20.6, -10 / 20.6); // hacia A (z de pantalla invertida)
    step(1);
    tap('KeyS');
    step(30);
    expect(A.pos.x).toBeLessThan(18.3);
    // al cambiar el stick a otra dirección, vuelve a obedecer
    input.setVirtualAxes(0, 1);
    step(10);
    expect(A.vel.z).toBeLessThan(-1);
    void m;
  });

  it('con el stick manda hacia esa dirección aunque haya otro más libre', () => {
    const { p, input, tap, step, B } = passScene(true);
    input.setVirtualAxes(-1, 0); // hacia atrás (−x)
    step(1);
    tap('KeyS');
    step(1);
    expect(p.action.kick?.targetId).toBe(B.id);
  });

  it('un toque rápido da potencia automática al pase elevado', () => {
    const { p, tap, step } = passScene(true);
    tap('KeyA');
    step(1);
    expect(p.action.kick?.kind === 'lob' || p.action.kick?.kind === 'cross').toBe(true);
    expect(p.action.kick!.velocity.length()).toBeGreaterThan(12);
  });
});

describe('Modo asistido (móvil): tiros', () => {
  it('un toque rápido en TIRO dispara con potencia automática; sin asistencia sale flojo', () => {
    const a = setup(true);
    const pa = giveBall(a.m, a.team, HALF_LENGTH - 20, 0);
    a.tap('KeyD');
    a.step(2);
    const manual = setup(false);
    const pm = giveBall(manual.m, manual.team, HALF_LENGTH - 20, 0);
    manual.tap('KeyD');
    manual.step(2);
    expect(pa.action.kick?.kind).toBe('shoot');
    expect(pa.action.kick!.velocity.length()).toBeGreaterThan(24);
    expect(pm.action.kick!.velocity.length()).toBeLessThan(20);
  });

  it('el imán lleva a puerta un disparo que iba un poco fuera del palo', () => {
    const { m, team, input, tap, step } = setup(true);
    const p = giveBall(m, team, HALF_LENGTH - 20, 0);
    // dirección ~14,5° hacia +z: sin ayuda llegaría a ≈ 5,2 m del centro (fuera, el palo está en 3,66)
    input.setVirtualAxes(1, -0.258);
    step(1);
    tap('KeyD');
    step(1);
    const cross = crossAtGoal(p.action.kick!.velocity, m.ball.pos);
    expect(cross).not.toBeNull();
    expect(Math.abs(cross!.z)).toBeLessThan(GOAL_HALF_WIDTH);
  });

  it('el disparo al centro se desvía de la zona del arquero', () => {
    const asis = setup(true);
    const p = giveBall(asis.m, asis.team, HALF_LENGTH - 20, 0);
    asis.input.setVirtualAxes(1, 0);
    asis.step(1);
    asis.tap('KeyD');
    asis.step(1);
    const cross = crossAtGoal(p.action.kick!.velocity, asis.m.ball.pos);
    expect(cross).not.toBeNull();
    expect(Math.abs(cross!.z - asis.gk.pos.z)).toBeGreaterThan(1.0);
    expect(Math.abs(cross!.z)).toBeLessThan(GOAL_HALF_WIDTH);
  });

  it('al cargar el tiro se calcula el punto del arco para la ayuda visual', () => {
    const { m, team, hc, input, step } = setup(true);
    giveBall(m, team, HALF_LENGTH - 20, 0);
    input.setKey('KeyD', true);
    step(10);
    expect(hc.charge?.action).toBe('shoot');
    expect(hc.aimTarget).not.toBeNull();
    expect(hc.aimTarget!.x).toBeCloseTo(HALF_LENGTH, 0);
    expect(Math.abs(hc.aimTarget!.z)).toBeLessThan(GOAL_HALF_WIDTH);
    input.setKey('KeyD', false);
    void BALL_RADIUS;
  });

  it('mantener el botón sigue siendo la barra de potencia manual', () => {
    const { m, team, input, step } = setup(true);
    const p = giveBall(m, team, HALF_LENGTH - 20, 0);
    input.setKey('KeyD', true);
    step(75); // 1,25 s: barra llena
    input.setKey('KeyD', false);
    step(2);
    expect(p.action.kick!.velocity.length()).toBeGreaterThan(28);
  });
});

describe('Modo asistido (móvil): movimiento y defensa', () => {
  it('con el joystick al máximo esprinta solo; sin asistencia no', () => {
    const a = setup(true);
    const pa = giveBall(a.m, a.team, 0, 0);
    a.input.setVirtualAxes(1, 0);
    a.step(3);
    expect(pa.sprinting).toBe(true);
    const b = setup(false);
    const pb = giveBall(b.m, b.team, 0, 0);
    b.input.setVirtualAxes(1, 0);
    b.step(3);
    expect(pb.sprinting).toBe(false);
  });

  it('con el joystick a medias camina sin esprintar', () => {
    const a = setup(true);
    const pa = giveBall(a.m, a.team, 0, 0);
    a.input.setVirtualAxes(0.5, 0);
    a.step(3);
    expect(pa.sprinting).toBe(false);
  });

  function defenseScene(assist: boolean) {
    const s = setup(assist);
    const p = s.team.players[5];
    p.pos.set(0, 0, 0);
    p.facing = Math.PI / 2; // mirando a +x, de espaldas al rival
    p.clearAction();
    const carrier = s.m.teams[1].players[9];
    carrier.pos.set(-3, 0, 0);
    carrier.clearAction();
    s.m.ball.reset(-2.4, 0);
    s.m.owner = carrier;
    s.team.controlled = p;
    return { ...s, p, carrier };
  }

  it('la entrada se orienta sola hacia el portador aunque el stick apunte a otro lado', () => {
    const a = defenseScene(true);
    a.input.setVirtualAxes(1, 0);
    a.tap('KeyD');
    a.step(1);
    expect(a.p.action.kind).toBe('tackle');
    expect(a.p.action.dir.x).toBeLessThan(-0.5);
    const b = defenseScene(false);
    b.input.setVirtualAxes(1, 0);
    b.tap('KeyD');
    b.step(1);
    expect(b.p.action.kind).toBe('tackle');
    expect(b.p.action.dir.x).toBeGreaterThan(0.5);
  });

  it('la barrida también se orienta sola hacia el portador', () => {
    const a = defenseScene(true);
    a.input.setVirtualAxes(1, 0);
    a.tap('KeyA');
    a.step(1);
    expect(a.p.action.kind).toBe('slide');
    expect(a.p.action.dir.x).toBeLessThan(-0.5);
  });
});
