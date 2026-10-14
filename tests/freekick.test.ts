import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeMatch } from './helpers';
import { BALL_RADIUS, GOAL_HALF_WIDTH, HALF_LENGTH, SIM_DT } from '../src/config/constants';
import { Input } from '../src/input/Input';
import { HumanController } from '../src/control/HumanController';
import { solveCurvedKick } from '../src/sim/Kicks';
import { Ball } from '../src/sim/Ball';

/** Recorre el disparo con la física real y devuelve el punto donde cruza la línea de gol. */
function crossing(from: Vector3, v: Vector3, spin: Vector3, gx: number) {
  const b = new Ball();
  b.pos.copy(from);
  b.vel.copy(v);
  b.spin.copy(spin);
  let maxSide = 0;
  for (let i = 0; i < 300; i++) {
    const px = b.pos.x;
    const pz = b.pos.z;
    const py = b.pos.y;
    b.step(SIM_DT);
    // desviación lateral respecto de la línea recta salida → objetivo (para medir la curva)
    maxSide = Math.max(maxSide, Math.abs(b.pos.z - from.z - ((b.pos.x - from.x) * v.z) / v.x));
    if ((b.pos.x - gx) * Math.sign(gx) >= 0) {
      const k = (gx - px) / (b.pos.x - px);
      return { z: pz + (b.pos.z - pz) * k, y: py + (b.pos.y - py) * k, maxSide };
    }
  }
  return null;
}

describe('Tiro libre con trayectoria (estilo FC)', () => {
  for (const [gx, z0, aimZ, aimY, spin] of [
    [HALF_LENGTH, 6, -2.5, 2.0, 40],
    [HALF_LENGTH, -4, 2.8, 1.2, -55],
    [-HALF_LENGTH, 0, 1.5, 2.2, 0],
    [-HALF_LENGTH, 8, -3.0, 0.8, 60],
  ] as const) {
    it(`el balón pasa por el punto elegido (arco x=${gx}, efecto ${spin})`, () => {
      const from = new Vector3(gx - Math.sign(gx) * 24, BALL_RADIUS, z0);
      const path: Vector3[] = [];
      const sol = solveCurvedKick(from, gx, aimZ, aimY, 25, spin, path);
      const c = crossing(from, sol.velocity, sol.spin, gx)!;
      expect(c).not.toBeNull();
      expect(Math.abs(c.z - aimZ)).toBeLessThan(0.15);
      expect(Math.abs(c.y - aimY)).toBeLessThan(0.15);
      // el recorrido dibujado acaba en ese mismo punto
      const last = path[path.length - 1];
      expect(last.distanceTo(new Vector3(gx, aimY, aimZ))).toBeLessThan(0.2);
      if (spin !== 0) expect(c.maxSide).toBeGreaterThan(0.6); // la curva se nota
    });
  }

  function setup() {
    const m = makeMatch({ seed: 3 });
    m.simulate(1);
    const team = m.teams[0];
    team.human = true;
    const input = new Input();
    const g = team.attackDir;
    // cámara detrás del balón mirando al arco rival: derecha de la pantalla = +z si se ataca hacia +x
    const hc = new HumanController(input, { right: new Vector3(0, 0, g), forward: new Vector3(g, 0, 0) }, {
      autoSwitch: false, passAssist: 1, powerBarTime: 1, showAimAssist: true, assist: false,
    });
    m.controllers[0] = hc;
    m.setupRestart('freekick', 0, new Vector3(g * (HALF_LENGTH - 23), BALL_RADIUS, 5), true);
    const step = (n: number) => { for (let i = 0; i < n; i++) { input.poll(SIM_DT); m.step(); m.events.length = 0; } };
    step(40); // colocación y lanzador listo
    return { m, team, input, hc, step, g };
  }

  it('el lanzador humano entra en modo trayectoria con recorrido y punto de mira', () => {
    const { m, hc, team } = setup();
    expect(m.restart?.stage).toBe('ready');
    expect(m.restart?.taker).toBe(team.controlled);
    const fk = hc.freeKick!;
    expect(fk).not.toBeNull();
    expect(fk.path.length).toBeGreaterThan(10);
    expect(Math.abs(fk.target.x)).toBeCloseTo(HALF_LENGTH + 0.3, 1);
  });

  it('el stick mueve la mira y J/L cambian el efecto', () => {
    const { hc, input, step } = setup();
    const z0 = hc.freeKick!.aimZ;
    const y0 = hc.freeKick!.aimY;
    input.setVirtualAxes(1, 0);
    step(20);
    input.setVirtualAxes(0, 1);
    step(20);
    input.setVirtualAxes(0, 0);
    expect(hc.freeKick!.aimZ).toBeGreaterThan(z0 + 0.5);
    expect(hc.freeKick!.aimY).toBeGreaterThan(y0 + 0.3);
    input.setKey('KeyL', true);
    step(30);
    input.setKey('KeyL', false);
    expect(hc.freeKick!.curve).toBeGreaterThan(0.4);
    input.setKey('KeyJ', true);
    step(60);
    input.setKey('KeyJ', false);
    expect(hc.freeKick!.curve).toBeLessThan(-0.4);
  });

  it('al soltar TIRO el balón sigue la trayectoria mostrada y llega cerca del punto de mira', () => {
    const { m, hc, input, step, team, g } = setup();
    // apuntar a la escuadra lejana con algo de efecto
    hc.freeKick!.aimZ = -2.4 * g;
    hc.freeKick!.aimY = 2.0;
    hc.freeKick!.curve = 0.4;
    // sin rivales que se crucen (barrera y arquero apartados) para medir solo la trayectoria
    for (const q of m.teams[1].active) q.pos.set(-g * 30, 0, 30);
    input.setKey('KeyD', true);
    step(42); // 0,7 s de carga
    const preview = hc.freeKick!.path.map((v) => v.clone());
    const target = hc.freeKick!.target.clone();
    input.setKey('KeyD', false);
    let crossed: Vector3 | null = null;
    for (let i = 0; i < 240 && !crossed; i++) {
      step(1);
      if (Math.abs(m.ball.pos.x) >= HALF_LENGTH && m.ball.pos.x * g > 0) crossed = m.ball.pos.clone();
    }
    expect(crossed).not.toBeNull();
    // margen por el error de ejecución del jugador (pequeño en los tiros libres)
    expect(Math.abs(crossed!.z - target.z)).toBeLessThan(1.3);
    expect(Math.abs(crossed!.y - target.y)).toBeLessThan(1.0);
    expect(preview.length).toBeGreaterThan(10);
    expect(Math.abs(crossed!.z)).toBeLessThan(GOAL_HALF_WIDTH + 1.5);
    expect(hc.freeKick).toBeNull();
    void team;
  });
});
