import { Vector3 } from 'three';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sign = (v: number) => (v < 0 ? -1 : 1);

/** Distancia horizontal (plano XZ). */
export function dist2D(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function angleOf(x: number, z: number) {
  return Math.atan2(x, z);
}

/** Diferencia angular normalizada a [-PI, PI]. */
export function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function approachAngle(current: number, target: number, maxStep: number) {
  const d = angleDiff(target, current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/** Distancia de un punto P al segmento AB en el plano XZ, y parámetro t de la proyección. */
export function pointSegDist2D(
  px: number, pz: number, ax: number, az: number, bx: number, bz: number,
): { d: number; t: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 1e-9 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t - px;
  const cz = az + abz * t - pz;
  return { d: Math.sqrt(cx * cx + cz * cz), t };
}

/** Generador pseudoaleatorio determinista (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed = 1234567) {
    this.s = seed >>> 0;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  /** Aproximación gaussiana centrada en 0. */
  gauss() {
    return (this.next() + this.next() + this.next() - 1.5) / 0.5;
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

export const tmpV = () => new Vector3();
