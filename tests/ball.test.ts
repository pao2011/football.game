import { describe, expect, it } from 'vitest';
import { Ball, groundPassSpeed, groundRollDistance } from '../src/sim/Ball';
import { BALL_RADIUS, GOAL_HALF_WIDTH, GOAL_HEIGHT, HALF_LENGTH, SIM_DT } from '../src/config/constants';
import { aimedShotVelocity, curledShot } from '../src/sim/Kicks';
import { Vector3 } from 'three';

function run(b: Ball, seconds: number, onStep?: (b: Ball) => void) {
  const ev = { post: false, net: false, bounces: 0 };
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const e = b.step(SIM_DT);
    if (e.post) ev.post = true;
    if (e.net) ev.net = true;
    if (e.bounce > 0) ev.bounces++;
    onStep?.(b);
  }
  return ev;
}

describe('Física del balón', () => {
  it('cae por gravedad, rebota y termina en reposo sobre el césped', () => {
    const b = new Ball();
    b.pos.set(0, 5, 0);
    const ev = run(b, 6);
    expect(ev.bounces).toBeGreaterThan(1);
    expect(b.pos.y).toBeCloseTo(BALL_RADIUS, 3);
    expect(Math.abs(b.vel.y)).toBeLessThan(0.01);
  });

  it('los rebotes pierden energía (nunca gana altura)', () => {
    const b = new Ball();
    b.pos.set(0, 4, 0);
    let maxAfterFirst = 0;
    let bounced = false;
    run(b, 5, (bb) => {
      if (bb.pos.y <= BALL_RADIUS + 0.001) bounced = true;
      if (bounced) maxAfterFirst = Math.max(maxAfterFirst, bb.pos.y);
    });
    expect(maxAfterFirst).toBeLessThan(4 * 0.5);
  });

  it('un pase raso se frena por rozamiento y recorre la distancia prevista', () => {
    const b = new Ball();
    const v0 = groundPassSpeed(25, 0.5);
    b.vel.set(v0, 0, 0);
    run(b, 15);
    expect(b.speed).toBeLessThan(0.05);
    expect(b.pos.x).toBeGreaterThan(23);
    expect(b.pos.x).toBeLessThan(27.5);
    expect(groundRollDistance(v0)).toBeGreaterThan(24);
  });

  it('nunca se acelera sin motivo (energía decreciente en rodadura)', () => {
    const b = new Ball();
    b.vel.set(12, 0, 7);
    let prev = b.speed;
    run(b, 6, (bb) => {
      expect(bb.speed).toBeLessThanOrEqual(prev + 1e-6);
      prev = bb.speed;
    });
  });

  it('un disparo apuntado pasa por el punto objetivo del arco', () => {
    const b = new Ball();
    b.pos.set(HALF_LENGTH - 20, BALL_RADIUS, 3);
    const target = new Vector3(HALF_LENGTH, 1.5, -2);
    b.vel.copy(aimedShotVelocity(b.pos, target, 25));
    let crossed: Vector3 | null = null;
    run(b, 2, (bb) => {
      if (!crossed && bb.pos.x >= HALF_LENGTH) crossed = bb.pos.clone();
    });
    expect(crossed).not.toBeNull();
    expect(crossed!.y).toBeGreaterThan(1.2);
    expect(crossed!.y).toBeLessThan(1.8);
    expect(crossed!.z).toBeGreaterThan(-2.6);
    expect(crossed!.z).toBeLessThan(-1.4);
  });

  it('el efecto Magnus curva la trayectoria y el tiro con rosca llega cerca del objetivo', () => {
    const b = new Ball();
    b.pos.set(HALF_LENGTH - 22, BALL_RADIUS, 0);
    const target = new Vector3(HALF_LENGTH, 1.4, 2.8);
    const { velocity, spin } = curledShot(b.pos, target, 24, 1, 50);
    b.vel.copy(velocity);
    b.spin.copy(spin);
    let crossed: Vector3 | null = null;
    let maxDev = 0;
    run(b, 2, (bb) => {
      if (!crossed && bb.pos.x >= HALF_LENGTH) crossed = bb.pos.clone();
      maxDev = Math.max(maxDev, Math.abs(bb.pos.z));
    });
    expect(crossed).not.toBeNull();
    expect(Math.abs(crossed!.z - 2.8)).toBeLessThan(1.2);
  });

  it('rebota en el poste y no atraviesa la red', () => {
    const b = new Ball();
    b.pos.set(HALF_LENGTH - 10, 1, GOAL_HALF_WIDTH + 0.06);
    b.vel.set(25, 0.6, 0);
    const ev = run(b, 1.2);
    expect(ev.post).toBe(true);
    expect(b.pos.x).toBeLessThan(HALF_LENGTH + 0.2);
  });

  it('la red retiene el balón dentro del arco', () => {
    const b = new Ball();
    b.pos.set(HALF_LENGTH - 6, 1, 0);
    b.vel.set(32, 1, 0.5);
    const ev = run(b, 3);
    expect(ev.net).toBe(true);
    expect(b.pos.x).toBeGreaterThan(HALF_LENGTH);
    expect(b.pos.x).toBeLessThan(HALF_LENGTH + 2.2);
    expect(Math.abs(b.pos.z)).toBeLessThan(GOAL_HALF_WIDTH);
    expect(b.pos.y).toBeLessThan(GOAL_HEIGHT);
  });

  it('desde fuera, la red lateral impide entrar al arco', () => {
    const b = new Ball();
    b.pos.set(HALF_LENGTH + 1, 0.5, GOAL_HALF_WIDTH + 3);
    b.vel.set(0, 0, -15);
    run(b, 1);
    expect(Ball.insideGoalVolume(b.pos)).toBe(0);
  });
});
