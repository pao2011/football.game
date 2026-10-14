// Animaciones procedurales del futbolista. Cada estado produce una Pose (rotaciones locales + posición
// de la cadera) en espacio de modelo de 1.80 m. El Animator mezcla entre estados (crossfade con slerp),
// acumula la fase de la zancada a partir de la velocidad (para que los pies no patinen) y aplica la
// restricción de suelo final.
//
// Convenciones (ver rig.ts): +X = izquierda del jugador, +Z = adelante.
//  - gk_dive_left  = estirada hacia la IZQUIERDA del portero = +X local.
//  - gk_dive_right = estirada hacia la DERECHA del portero   = -X local.
//  - foot = 1 → golpea con la pierna derecha (-X); foot = -1 → izquierda (+X). Se anima la versión
//    derecha y se refleja la pose para la izquierda.
import * as THREE from 'three';
import type { AnimInfo, AnimState } from '../../sim/types';
import { ANKLE_H, BONE, HIPS_REST_Y, Pose, SHIN_LEN, THIGH_LEN, clampFeetToGround, hipJoint, solveLeg } from './rig';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ utilidades
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (x: number) => x - Math.floor(x);

/** Pista de claves [t0, v0, t1, v1, ...] interpolada con Hermite (tangentes Catmull-Rom). */
function tr(t: number, k: number[]): number {
  const n = k.length / 2;
  if (t <= k[0]) return k[1];
  if (t >= k[(n - 1) * 2]) return k[(n - 1) * 2 + 1];
  let i = 0;
  while (i < n - 2 && t > k[(i + 1) * 2]) i++;
  const t0 = k[i * 2];
  const v0 = k[i * 2 + 1];
  const t1 = k[i * 2 + 2];
  const v1 = k[i * 2 + 3];
  const h = t1 - t0;
  const s = (t - t0) / h;
  const slope = (a: number) => {
    // tangente en la clave a (diferencias finitas no uniformes), en unidades de valor/tiempo
    if (a <= 0 || a >= n - 1) return 0;
    const ta = k[(a - 1) * 2];
    const tb = k[(a + 1) * 2];
    const va = k[(a - 1) * 2 + 1];
    const vb = k[(a + 1) * 2 + 1];
    const vc = k[a * 2 + 1];
    // si es un extremo local, tangente nula (evita sobreoscilación)
    if ((vc - va) * (vb - vc) <= 0) return 0;
    return (vb - va) / (tb - ta);
  };
  const m0 = slope(i) * h;
  const m1 = slope(i + 1) * h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * m1;
}

/** Interpolación lineal en tabla por velocidad. */
function tbl(speeds: number[], vals: number[], v: number) {
  if (v <= speeds[0]) return vals[0];
  for (let i = 1; i < speeds.length; i++) {
    if (v <= speeds[i]) return lerp(vals[i - 1], vals[i], (v - speeds[i - 1]) / (speeds[i] - speeds[i - 1]));
  }
  return vals[vals.length - 1];
}

const _e = new THREE.Euler();
// Búferes circulares para evitar asignaciones por fotograma
const _qRing = Array.from({ length: 16 }, () => new THREE.Quaternion());
let _qi = 0;
const _vRing = Array.from({ length: 32 }, () => new THREE.Vector3());
let _vi = 0;
/** Orientación del pie en modelo (grados): pitch (+ = puntera abajo), yaw (+ = hacia +X), roll. */
function footQ(pitch: number, yaw: number, roll = 0) {
  _e.set(pitch * D2R, yaw * D2R, roll * D2R, 'YXZ');
  _qi = (_qi + 1) % _qRing.length;
  return _qRing[_qi].setFromEuler(_e);
}

/** Altura del tobillo para que la suela apoye con una inclinación dada (grados). */
function ankleForPitch(pitchDeg: number) {
  const a = pitchDeg * D2R;
  const heel = 0.072 * Math.cos(a) - 0.06 * Math.sin(a);
  const ball = 0.072 * Math.cos(a) + 0.11 * Math.sin(a);
  return Math.max(heel, ball, 0.03) + 0.002;
}

/** Vector temporario (búfer circular): válido solo dentro de la evaluación actual. */
const V = (x: number, y: number, z: number) => {
  _vi = (_vi + 1) % _vRing.length;
  return _vRing[_vi].set(x, y, z);
};
const FWD = new THREE.Vector3(0, 0, 1);
const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _pole = new THREE.Vector3();
const _hj = new THREE.Vector3();

export interface Ctx {
  state: AnimState;
  t: number;
  n: number; // tiempo normalizado (0..1) para acciones
  v: number; // velocidad en unidades de modelo (m/s de un jugador de 1.80)
  phase: number; // fase de zancada acumulada (ciclos)
  jphase: number; // fase de pasos laterales
  foot: number;
  variant: number;
  seed: number;
}

// ------------------------------------------------------------------ marcha
const GS = [0, 1.4, 3.0, 5.0, 7.0, 9.0];
export const GAIT = {
  L: [1.0, 1.3, 2.1, 2.85, 3.45, 4.0],
  beta: [0.62, 0.6, 0.42, 0.35, 0.3, 0.26],
  hipsY: [0.955, 0.955, 0.95, 0.945, 0.94, 0.935],
  lift: [0.03, 0.07, 0.17, 0.27, 0.34, 0.4],
  kick: [0, 0, 0.06, 0.12, 0.16, 0.2],
  lean: [0, 3, 8, 12, 16, 21],
  arm: [3, 18, 32, 42, 52, 60],
  elbow: [10, 16, 70, 82, 88, 92],
  yaw: [0, 6, 8, 9, 10, 10],
  comp: [0, 0, 0.03, 0.04, 0.045, 0.05],
  width: [0.1, 0.09, 0.075, 0.068, 0.062, 0.058],
  strike: [0, -14, -8, -3, 0, 4],
  toeoff: [0, 26, 32, 38, 42, 46],
  front: [0.4, 0.42, 0.4, 0.38, 0.36, 0.34],
};

export function strideLength(v: number, dribble: boolean) {
  return tbl(GS, GAIT.L, v) * (dribble ? 0.72 : 1);
}

interface FootState {
  pos: THREE.Vector3;
  pitch: number;
  toe: number;
  stance: boolean;
  s: number; // progreso del vuelo (0..1) si !stance
  fwd: number; // -1..1 adelantamiento
}

function gaitFoot(p: number, v: number, side: 0 | 1, dribble: boolean, touch: number, out: FootState) {
  const L = strideLength(v, dribble);
  const beta = tbl(GS, GAIT.beta, v);
  const S = beta * L;
  const zF = S * tbl(GS, GAIT.front, v);
  const zB = zF - S;
  const strike = tbl(GS, GAIT.strike, v);
  const toeoff = tbl(GS, GAIT.toeoff, v);
  const x = (side === 0 ? 1 : -1) * tbl(GS, GAIT.width, v);
  if (p < beta) {
    const s = p / beta;
    const z = zF - S * s;
    let pitch = 0;
    if (s < 0.18) pitch = lerp(strike, 0, sstep(0, 0.18, s));
    else if (s > 0.55) pitch = lerp(0, toeoff, sstep(0.55, 1, s));
    out.pos.set(x, ankleForPitch(pitch), z);
    out.pitch = pitch;
    out.toe = pitch > 0 ? -pitch : 0;
    out.stance = true;
    out.s = 0;
  } else {
    const s = (p - beta) / (1 - beta);
    out.s = s;
    // Hermite con retracción parcial al final (velocidad relativa ~ suelo)
    const m = -0.22 * S * (1 - beta) / beta;
    const s2 = s * s;
    const s3 = s2 * s;
    let z = (2 * s3 - 3 * s2 + 1) * zB + (s3 - 2 * s2 + s) * m + (-2 * s3 + 3 * s2) * zF + (s3 - s2) * m;
    const kick = tbl(GS, GAIT.kick, v);
    z -= kick * Math.sin(Math.PI * s) * (1 - s) * 1.6;
    const lift = tbl(GS, GAIT.lift, v);
    const run = sstep(1.6, 3.5, v);
    const liftShape = Math.sin(Math.PI * Math.pow(s, lerp(1, 0.7, run)));
    let y = lerp(ankleForPitch(toeoff), ankleForPitch(strike), s) + lift * liftShape;
    let pitch = lerp(toeoff, strike, sstep(0, 0.85, s)) - 12 * run * Math.sin(Math.PI * s);
    if (touch > 0) {
      // toque de balón: el pie se estira hacia delante y baja
      const b = Math.sin(Math.PI * sstep(0.45, 1, s)) * touch;
      z += 0.12 * b;
      y = lerp(y, ANKLE_H + 0.03, b * 0.7);
      pitch = lerp(pitch, 25, b);
    }
    out.pos.set(x, y, z);
    out.pitch = pitch;
    out.toe = lerp(-toeoff, 0, sstep(0, 0.5, s));
    out.stance = false;
  }
  const half = Math.max(0.05, S * 0.5);
  out.fwd = clamp((out.pos.z - (zF + zB) / 2) / half, -1.2, 1.2);
}

const fsL: FootState = { pos: new THREE.Vector3(), pitch: 0, toe: 0, stance: true, s: 0, fwd: 0 };
const fsR: FootState = { pos: new THREE.Vector3(), pitch: 0, toe: 0, stance: true, s: 0, fwd: 0 };

function locomotion(c: Ctx, p: Pose, dribble = false) {
  const v = c.v;
  const ph = c.phase;
  const pR = frac(ph);
  const pL = frac(ph + 0.5);
  const cyc = Math.floor(ph);
  const touch = dribble && cyc % 2 === 0 ? 1 : 0;
  gaitFoot(pL, v, 0, dribble, 0, fsL);
  gaitFoot(pR, v, 1, dribble, touch, fsR);
  const fR = (fsR.fwd - fsL.fwd) * 0.5;
  const lean = tbl(GS, GAIT.lean, v) + (dribble ? 8 : 0);
  const yaw = tbl(GS, GAIT.yaw, v) * fR;
  const walk = 1 - sstep(1.6, 3.2, v);
  // cadera
  p.rot(BONE.hips, lean * 0.3, yaw, 0);
  const sway = 0.012 * walk * Math.sin(TAU * ph);
  const beta = tbl(GS, GAIT.beta, v);
  let hipsY = tbl(GS, GAIT.hipsY, v) - (dribble ? 0.025 : 0);
  const comp = tbl(GS, GAIT.comp, v);
  if (fsR.stance) hipsY -= comp * Math.sin(Math.PI * (pR / beta));
  if (fsL.stance) hipsY -= comp * Math.sin(Math.PI * (pL / beta));
  p.hips.set(sway, hipsY, 0);
  // limitar altura por alcance de los pies apoyados (o casi apoyados)
  const R = (THIGH_LEN + SHIN_LEN) * 0.985;
  for (const [fs, side] of [[fsL, 0], [fsR, 1]] as const) {
    // peso de la restricción: 1 apoyado, se desvanece suavemente al despegar / aparece antes de apoyar
    const w = fs.stance ? 1 : Math.max(1 - sstep(0, 0.4, fs.s), sstep(0.6, 1, fs.s));
    if (w <= 0) continue;
    hipJoint(p, side, _hj);
    const dx = fs.pos.x - _hj.x;
    const dz = fs.pos.z - _hj.z;
    const offY = _hj.y - p.hips.y;
    const maxY = fs.pos.y + Math.sqrt(Math.max(0.04, R * R - dx * dx - dz * dz)) - offY;
    if (p.hips.y > maxY) p.hips.y -= w * (p.hips.y - maxY);
  }
  // pies en el aire fuera de alcance: acercar el objetivo (evita rodilla bloqueada y saltos)
  for (const [fs, side] of [[fsL, 0], [fsR, 1]] as const) {
    hipJoint(p, side, _hj);
    _ta.subVectors(fs.pos, _hj);
    const d = _ta.length();
    if (d > R) fs.pos.copy(_hj).addScaledVector(_ta, R / d);
  }
  // piernas
  _pole.set(0, 0.05, 1);
  solveLeg(p, 0, fsL.pos, _pole, footQ(fsL.pitch, 5));
  solveLeg(p, 1, fsR.pos, _pole, footQ(fsR.pitch, -5));
  p.rot(BONE.toeL, fsL.toe);
  p.rot(BONE.toeR, fsR.toe);
  // tronco
  p.rot(BONE.spine, lean * 0.35, -yaw * 0.6, 0);
  p.rot(BONE.chest, lean * 0.3 + (dribble ? 4 : 0), -yaw * 0.9, 0);
  p.rot(BONE.neck, -lean * 0.45 + (dribble ? 6 : 0), yaw * 0.3, 0);
  p.rot(BONE.head, -lean * 0.3 + (dribble ? 8 : 0), yaw * 0.2, 0);
  // brazos (opuestos a las piernas)
  const arm = tbl(GS, GAIT.arm, v);
  const elbow = tbl(GS, GAIT.elbow, v) * (dribble ? 0.75 : 1);
  const abd = (dribble ? 18 : 8) + 2 * (1 - walk);
  const off = -4 * (1 - walk);
  const aL = -arm * fR + off;
  const aR = arm * fR + off;
  p.rot(BONE.uarmL, aL, 0, abd);
  p.rot(BONE.uarmR, aR, 0, -abd);
  p.rot(BONE.farmL, -(elbow + Math.max(0, -aL) * 0.35), 0, 0);
  p.rot(BONE.farmR, -(elbow + Math.max(0, -aR) * 0.35), 0, 0);
  p.rot(BONE.handL, 0, 0, -8);
  p.rot(BONE.handR, 0, 0, 8);
  p.rot(BONE.clavL, 0, -fR * 3 * (1 - walk), 0);
  p.rot(BONE.clavR, 0, -fR * 3 * (1 - walk), 0);
}

function idle(c: Ctx, p: Pose) {
  const t = c.t + c.seed * 10;
  const sway = 0.014 * Math.sin(t * 0.55) + 0.006 * Math.sin(t * 1.3);
  const breathe = Math.sin(t * 1.35);
  p.hips.set(sway, 0.955 - 0.004 * Math.abs(Math.sin(t * 0.55)), 0);
  p.rot(BONE.hips, 2, 2 * Math.sin(t * 0.37), -sway * 60);
  solveLeg(p, 0, V(0.115, ANKLE_H, 0.025), FWD, footQ(0, 9));
  solveLeg(p, 1, V(-0.115, ANKLE_H, -0.035), FWD, footQ(0, -9));
  p.rot(BONE.spine, 2, 0, sway * 40);
  p.rot(BONE.chest, -1 + 1.2 * breathe, 0, sway * 30);
  const look = 10 * Math.sin(t * 0.29) + 5 * Math.sin(t * 0.71 + 1);
  p.rot(BONE.neck, 2, look * 0.4, 0);
  p.rot(BONE.head, 1 + 2 * Math.sin(t * 0.21), look * 0.6, 0);
  p.rot(BONE.clavL, 0, 0, 1.2 * breathe);
  p.rot(BONE.clavR, 0, 0, -1.2 * breathe);
  p.rot(BONE.uarmL, -3, 0, 7 + 1.5 * breathe);
  p.rot(BONE.uarmR, -3, 0, -7 - 1.5 * breathe);
  p.rot(BONE.farmL, -14);
  p.rot(BONE.farmR, -14);
  p.rot(BONE.handL, 0, 0, -6);
  p.rot(BONE.handR, 0, 0, 6);
}

const _tmpPose = new Pose();
const _tmpPose2 = new Pose();

/** Piernas/cuerpo base: parado o en movimiento según la velocidad. */
function base(c: Ctx, p: Pose) {
  idle(c, p);
  const w = sstep(0.06, 0.5, c.v);
  if (w > 0) {
    _tmpPose.reset();
    locomotion(c, _tmpPose);
    p.blend(_tmpPose, w);
  }
}

function jockey(c: Ctx, p: Pose, gk = false) {
  const t = c.t + c.seed * 7;
  const mv = sstep(0.1, 1.2, c.v);
  const jp = c.jphase;
  const step = Math.sin(TAU * jp);
  const lift = (s: number) => Math.max(0, s) * 0.06 * mv;
  const wid = gk ? 0.22 : 0.2;
  const bob = 0.01 * Math.sin(t * (gk ? 9 : 5)) * (1 - mv);
  p.hips.set(0.03 * step * mv, (gk ? 0.8 : 0.84) + bob - 0.015 * Math.abs(step) * mv, 0);
  p.rot(BONE.hips, gk ? 18 : 16, 0, 0);
  const sL = wid + 0.05 * step * mv;
  const sR = wid - 0.05 * step * mv;
  _pole.set(0.25, 0, 1);
  solveLeg(p, 0, V(sL, ANKLE_H + lift(Math.sin(TAU * jp + 0.6)), gk ? 0.03 : 0.1), _pole, footQ(0, 14));
  _pole.set(-0.25, 0, 1);
  solveLeg(p, 1, V(-sR, ANKLE_H + lift(-Math.sin(TAU * jp + 0.6)), gk ? 0 : -0.12), _pole, footQ(0, -14));
  p.rot(BONE.spine, gk ? 12 : 12, 0, 0);
  p.rot(BONE.chest, gk ? 6 : 8, 0, 0);
  p.rot(BONE.neck, -14, 0, 0);
  p.rot(BONE.head, -10, 0, 0);
  if (gk) {
    p.rot(BONE.uarmL, -38, 0, 32);
    p.rot(BONE.uarmR, -38, 0, -32);
    p.rot(BONE.farmL, -45, 0, 0);
    p.rot(BONE.farmR, -45, 0, 0);
    p.rot(BONE.handL, -10, 0, -25);
    p.rot(BONE.handR, -10, 0, 25);
  } else {
    p.rot(BONE.uarmL, -22, 0, 22);
    p.rot(BONE.uarmR, -22, 0, -22);
    p.rot(BONE.farmL, -45);
    p.rot(BONE.farmR, -45);
  }
}

// ------------------------------------------------------------------ golpeos (pierna derecha)
type KickKind = 'pass' | 'lob' | 'shoot';
function kick(c: Ctx, p: Pose, kind: KickKind) {
  const n = c.n;
  const K = <T,>(s: T, l: T, pa: T) => (kind === 'shoot' ? s : kind === 'lob' ? l : pa);
  const thighX = tr(n, K(
    [0, 5, 0.28, 45, 0.38, 8, 0.45, -46, 0.62, -82, 0.8, -45, 1, -3],
    [0, 5, 0.28, 40, 0.38, 5, 0.45, -42, 0.65, -90, 0.85, -45, 1, -3],
    [0, 5, 0.28, 28, 0.38, 2, 0.45, -34, 0.65, -45, 1, -3],
  ));
  const shinX = tr(n, K(
    [0, 18, 0.28, 108, 0.38, 85, 0.45, 22, 0.55, 8, 0.65, 12, 0.8, 35, 1, 15],
    [0, 18, 0.28, 95, 0.38, 75, 0.45, 24, 0.65, 15, 1, 15],
    [0, 15, 0.28, 72, 0.38, 55, 0.45, 18, 0.65, 15, 1, 12],
  ));
  const footX = tr(n, K([0, 8, 0.3, 35, 0.45, 42, 0.7, 25, 1, 3], [0, 8, 0.3, 22, 0.45, 18, 0.7, 10, 1, 0], [0, 0, 0.45, -5, 1, 0]));
  const thighY = tr(n, K([0, 0, 0.45, -6, 1, 0], [0, 0, 0.45, -15, 1, 0], [0, 0, 0.3, -25, 0.45, -50, 0.65, -40, 1, 0]));
  const yaw = tr(n, K([0, 0, 0.28, -18, 0.45, 8, 0.65, 24, 1, 0], [0, 0, 0.28, -15, 0.45, 5, 0.65, 18, 1, 0], [0, 0, 0.28, -10, 0.45, 4, 0.65, 10, 1, 0]));
  const hipsY = tr(n, K([0, 0.94, 0.3, 0.905, 0.45, 0.9, 0.65, 0.915, 1, 0.945], [0, 0.94, 0.3, 0.905, 0.45, 0.9, 0.7, 0.915, 1, 0.945], [0, 0.945, 0.35, 0.915, 0.5, 0.91, 1, 0.945]));
  const roll = -tr(n, [0, 0, 0.3, 6, 0.45, 12, 0.7, 10, 1, 0]) * (kind === 'pass' ? 0.6 : 1);
  const lean = tr(n, K([0, 4, 0.45, 10, 0.7, 6, 1, 3], [0, 0, 0.45, -10, 0.7, -14, 1, -3], [0, 3, 0.45, 6, 1, 2]));
  const spineX = tr(n, K([0, 4, 0.45, 10, 0.75, 6, 1, 2], [0, 0, 0.45, -8, 0.8, -8, 1, 0], [0, 2, 0.45, 8, 1, 2]));
  const env = sstep(0, 0.3, n) * (1 - sstep(0.75, 1, n));
  p.hips.set(0.045 * env, hipsY, 0);
  p.rot(BONE.hips, lean, yaw, roll);
  p.rot(BONE.thighR, thighX, thighY, -4 - roll * 0.5);
  p.rot(BONE.shinR, shinX);
  p.rot(BONE.footR, footX);
  _pole.set(0.1, 0, 1);
  solveLeg(p, 0, V(0.15, ANKLE_H, 0.06), _pole, footQ(0, 10));
  p.rot(BONE.spine, spineX, -yaw * 0.5, -roll * 0.4);
  p.rot(BONE.chest, spineX * 0.6, -yaw * 0.5, -roll * 0.3);
  p.rot(BONE.neck, 8 * env, 0, 0);
  p.rot(BONE.head, 12 * env, 0, 0);
  const s = kind === 'shoot' ? 1.15 : kind === 'pass' ? 0.8 : 1;
  p.rot(BONE.uarmL, tr(n, [0, -5, 0.45, -25, 1, -5]) * s, 0, tr(n, [0, 14, 0.3, 45, 0.45, 65, 0.7, 50, 1, 12]) * s);
  p.rot(BONE.uarmR, tr(n, [0, 5, 0.3, -25, 0.45, 30, 0.7, 22, 1, 4]) * s, 0, -tr(n, [0, 12, 0.3, 30, 0.45, 35, 1, 10]) * s);
  p.rot(BONE.farmL, -tr(n, [0, 15, 0.45, 30, 1, 15]));
  p.rot(BONE.farmR, -tr(n, [0, 15, 0.45, 35, 1, 15]));
}

function trap(c: Ctx, p: Pose) {
  const n = c.n;
  if (c.variant % 2 === 1) {
    // control con el pecho
    const e = sstep(0, 0.3, n) * (1 - sstep(0.65, 1, n));
    idle(c, p);
    p.hips.y = 0.955 - 0.05 * e;
    solveLeg(p, 0, V(0.13, ANKLE_H, 0.06), FWD, footQ(0, 10));
    solveLeg(p, 1, V(-0.13, ANKLE_H, -0.08), FWD, footQ(0, -10));
    p.rot(BONE.spine, -14 * e, 0, 0);
    p.rot(BONE.chest, -12 * e, 0, 0);
    p.rot(BONE.neck, 18 * e, 0, 0);
    p.rot(BONE.head, 14 * e, 0, 0);
    p.rot(BONE.uarmL, -20 * e, 0, 10 + 45 * e);
    p.rot(BONE.uarmR, -20 * e, 0, -10 - 45 * e);
    p.rot(BONE.farmL, -15 - 30 * e);
    p.rot(BONE.farmR, -15 - 30 * e);
    return;
  }
  // control con el interior del pie derecho
  const e = sstep(0, 0.35, n) * (1 - sstep(0.6, 1, n));
  p.hips.set(0.04 * e, 0.95 - 0.05 * e, 0);
  p.rot(BONE.hips, 4 * e, -6 * e, 0);
  p.rot(BONE.thighR, tr(n, [0, 0, 0.35, -38, 0.55, -26, 1, 0]), -38 * e, -6 * e);
  p.rot(BONE.shinR, tr(n, [0, 10, 0.35, 32, 0.55, 42, 1, 10]));
  p.rot(BONE.footR, -10 * e);
  solveLeg(p, 0, V(0.13, ANKLE_H, 0.02), FWD, footQ(0, 10));
  p.rot(BONE.spine, 8 * e, 4 * e, 0);
  p.rot(BONE.chest, 6 * e, 0, 0);
  p.rot(BONE.neck, 12 * e, 0, 0);
  p.rot(BONE.head, 18 * e, 0, 0);
  p.rot(BONE.uarmL, -15 * e, 0, 12 + 35 * e);
  p.rot(BONE.uarmR, 10 * e, 0, -12 - 30 * e);
  p.rot(BONE.farmL, -20 - 15 * e);
  p.rot(BONE.farmR, -20 - 15 * e);
}

function header(c: Ctx, p: Pose) {
  const n = c.n;
  const fl = clamp((n - 0.25) / 0.6, 0, 1);
  const air = n > 0.25 && n < 0.85 ? 0.5 * Math.sin(Math.PI * fl) : 0;
  const crouch = tr(n, [0, 0, 0.17, 0.13, 0.25, 0.06, 0.3, 0, 0.85, 0, 0.92, 0.11, 1, 0.02]);
  p.hips.set(0, 0.955 - crouch + air, 0);
  p.rot(BONE.hips, tr(n, [0, 4, 0.2, 14, 0.4, -6, 0.55, 10, 0.8, 4, 1, 2]), 0, 0);
  const tuck = 0.16 * (air / 0.5);
  const fy = ANKLE_H + air + tuck;
  const pitch = 35 * (air / 0.5);
  solveLeg(p, 0, V(0.1, Math.max(ANKLE_H, fy - 0.0) + (air > 0 ? 0 : 0), air > 0 ? -0.06 : 0.02), FWD, footQ(pitch, 6));
  solveLeg(p, 1, V(-0.1, fy + 0.04 * (air / 0.5), air > 0 ? -0.1 : -0.02), FWD, footQ(pitch, -6));
  const nod = tr(n, [0, 0, 0.3, -12, 0.45, -18, 0.56, 22, 0.7, 10, 1, 0]);
  p.rot(BONE.spine, nod * 0.5, 0, 0);
  p.rot(BONE.chest, nod * 0.4, 0, 0);
  p.rot(BONE.neck, nod * 0.6, 0, 0);
  p.rot(BONE.head, nod * 0.9, 0, 0);
  const a = sstep(0.1, 0.35, n) * (1 - sstep(0.8, 1, n));
  p.rot(BONE.uarmL, -10 - 55 * a, 0, 10 + 35 * a);
  p.rot(BONE.uarmR, -10 - 55 * a, 0, -10 - 35 * a);
  p.rot(BONE.farmL, -15 - 60 * a);
  p.rot(BONE.farmR, -15 - 60 * a);
}

function tackle(c: Ctx, p: Pose) {
  const n = c.n;
  const e = sstep(0, 0.28, n) * (1 - sstep(0.7, 1, n));
  p.hips.set(0.04 * e, 0.955 - 0.2 * e, 0);
  p.rot(BONE.hips, 14 * e, -12 * e, 0);
  _pole.set(-0.6, 0.2, 1);
  solveLeg(p, 1, V(lerp(-0.1, -0.32, e), ANKLE_H + 0.015 * e, lerp(0, 0.62, e)), _pole, footQ(-15 * e, -55 * e, 10 * e));
  _pole.set(0.2, 0, 1);
  solveLeg(p, 0, V(0.15, ANKLE_H, lerp(0.02, -0.24, e)), _pole, footQ(0, 12));
  p.rot(BONE.spine, 12 * e, 8 * e, 0);
  p.rot(BONE.chest, 10 * e, 6 * e, 0);
  p.rot(BONE.neck, -8 * e, 0, 0);
  p.rot(BONE.head, 6 * e, 0, 0);
  p.rot(BONE.uarmL, -30 * e, 0, 12 + 40 * e);
  p.rot(BONE.uarmR, 15 * e, 0, -12 - 35 * e);
  p.rot(BONE.farmL, -20 - 25 * e);
  p.rot(BONE.farmR, -20 - 20 * e);
}

function slide(c: Ctx, p: Pose) {
  const n = c.n;
  const e = sstep(0, 0.24, n);
  const up = sstep(0.82, 1, n) * 0.3;
  const k = e * (1 - up);
  p.hips.set(0.02 * k, lerp(0.95, 0.15, k), lerp(0, -0.05, k));
  p.rot(BONE.hips, -55 * k, -10 * k, 6 * k);
  // pierna derecha (de ataque) estirada sobre el suelo
  _pole.set(0, 1, 0.2);
  solveLeg(p, 1, V(lerp(-0.1, -0.16, k), lerp(ANKLE_H, 0.1, k), lerp(0, 0.86, k)), _pole, footQ(-45 * k, -18 * k));
  // pierna izquierda flexionada debajo
  _pole.set(0.9, 0.6, 0.3);
  solveLeg(p, 0, V(lerp(0.12, 0.25, k), lerp(ANKLE_H, 0.06, k), lerp(0, 0.3, k)), _pole, footQ(-10 * k, 50 * k, 60 * k));
  p.rot(BONE.spine, -6 * k, 6 * k, 0);
  p.rot(BONE.chest, 10 * k, 4 * k, 0);
  p.rot(BONE.neck, 22 * k, 0, 0);
  p.rot(BONE.head, 16 * k, 0, 0);
  // brazo izquierdo atrás apoyado, derecho arriba
  p.rot(BONE.uarmL, 55 * k, 0, 10 + 30 * k);
  p.rot(BONE.farmL, -10 * k);
  p.rot(BONE.uarmR, -70 * k, 0, -12 - 25 * k);
  p.rot(BONE.farmR, -15 - 30 * k);
}

function fallen(c: Ctx, p: Pose) {
  const t = c.t + c.seed * 5;
  const br = Math.sin(t * 2.2);
  const v = c.variant % 2;
  p.hips.set(0, 0.118, 0);
  p.rot(BONE.hips, -90, 0, v ? 8 : -4);
  p.rot(BONE.spine, 3 + 1.5 * br, 0, 0);
  p.rot(BONE.chest, 2, 0, v ? -6 : 3);
  p.rot(BONE.neck, 10, v ? 25 : -12, 0);
  p.rot(BONE.head, 8, v ? 15 : -8, 0);
  _pole.set(0, 1, 0);
  if (v === 0) {
    solveLeg(p, 0, V(0.15, 0.085, 0.86), _pole, footQ(-70, 15));
    solveLeg(p, 1, V(-0.13, ANKLE_H, 0.5), _pole, footQ(0, -8));
    p.rot(BONE.uarmL, 0, 0, 72);
    p.rot(BONE.uarmR, -30, 0, -45);
    p.rot(BONE.farmL, -25);
    p.rot(BONE.farmR, -60);
  } else {
    // se sujeta la rodilla
    solveLeg(p, 0, V(0.13, 0.12, 0.42), _pole, footQ(-10, 10));
    solveLeg(p, 1, V(-0.16, 0.085, 0.85), _pole, footQ(-70, -15));
    p.rot(BONE.uarmL, -55, 0, 20);
    p.rot(BONE.uarmR, -60, 0, -5);
    p.rot(BONE.farmL, -50);
    p.rot(BONE.farmR, -45);
  }
}

function getup(c: Ctx, p: Pose) {
  const n = c.n;
  const hx = tr(n, [0, -90, 0.3, -25, 0.5, 20, 0.65, 38, 0.85, 12, 1, 2]);
  const hy = tr(n, [0, 0.118, 0.25, 0.13, 0.45, 0.32, 0.65, 0.6, 0.85, 0.88, 1, 0.955]);
  p.hips.set(0, hy, 0);
  p.rot(BONE.hips, hx, 0, 0);
  const fz = tr(n, [0, 0.82, 0.3, 0.45, 0.55, 0.12, 0.7, 0.05, 1, 0.0]);
  const fy = tr(n, [0, 0.09, 0.3, ANKLE_H, 1, ANKLE_H]);
  _pole.set(0, 0.6, 1);
  solveLeg(p, 0, V(0.14, fy, fz + 0.04), _pole, footQ(tr(n, [0, -60, 0.3, 0, 1, 0]), 8));
  solveLeg(p, 1, V(-0.14, fy, fz - 0.06), _pole, footQ(tr(n, [0, -60, 0.3, 0, 1, 0]), -8));
  const sp = tr(n, [0, 3, 0.3, 25, 0.6, 20, 1, 2]);
  p.rot(BONE.spine, sp, 0, 0);
  p.rot(BONE.chest, sp * 0.6, 0, 0);
  p.rot(BONE.neck, tr(n, [0, 15, 0.4, 0, 0.7, -15, 1, 0]), 0, 0);
  p.rot(BONE.head, tr(n, [0, 5, 0.7, -10, 1, 0]), 0, 0);
  const ax = tr(n, [0, -20, 0.3, -55, 0.55, -35, 0.75, -15, 1, -3]);
  const az = tr(n, [0, 40, 0.3, 18, 0.55, 25, 1, 7]);
  p.rot(BONE.uarmL, ax, 0, az);
  p.rot(BONE.uarmR, ax, 0, -az);
  p.rot(BONE.farmL, -tr(n, [0, 30, 0.3, 15, 1, 14]));
  p.rot(BONE.farmR, -tr(n, [0, 30, 0.3, 15, 1, 14]));
}

function throwin(c: Ctx, p: Pose) {
  const n = c.n;
  const ax = tr(n, [0, -150, 0.2, -168, 0.45, -178, 0.6, -125, 0.75, -75, 1, -25]);
  const el = tr(n, [0, -60, 0.35, -112, 0.55, -35, 0.75, -10, 1, -15]);
  const sp = tr(n, [0, -3, 0.4, -9, 0.6, 8, 0.8, 11, 1, 3]);
  p.hips.set(0, tr(n, [0, 0.94, 0.4, 0.92, 0.6, 0.93, 1, 0.945]), 0);
  p.rot(BONE.hips, sp * 0.4, 0, 0);
  solveLeg(p, 0, V(0.12, ANKLE_H, 0.2), FWD, footQ(0, 6));
  solveLeg(p, 1, V(-0.12, ankleForPitch(25), -0.2), FWD, footQ(25, -6));
  p.rot(BONE.toeR, -25);
  p.rot(BONE.spine, sp, 0, 0);
  p.rot(BONE.chest, sp * 0.8, 0, 0);
  p.rot(BONE.neck, -sp * 0.8, 0, 0);
  p.rot(BONE.head, -sp * 0.4, 0, 0);
  p.rot(BONE.clavL, 0, 0, 8);
  p.rot(BONE.clavR, 0, 0, -8);
  p.rot(BONE.uarmL, ax, 0, -9);
  p.rot(BONE.uarmR, ax, 0, 9);
  p.rot(BONE.farmL, el, 0, 0);
  p.rot(BONE.farmR, el, 0, 0);
  p.rot(BONE.handL, -20, 0, -20);
  p.rot(BONE.handR, -20, 0, 20);
}

// ------------------------------------------------------------------ portero
function gkDive(c: Ctx, p: Pose) {
  // versión hacia la DERECHA (-X); la izquierda es el espejo
  const n = c.n;
  const rz = tr(n, [0, 0, 0.12, -4, 0.3, 38, 0.45, 72, 0.6, 86, 1, 88]);
  const hy = tr(n, [0, 0.8, 0.12, 0.72, 0.28, 0.93, 0.4, 0.99, 0.55, 0.7, 0.68, 0.25, 0.8, 0.205, 1, 0.2]);
  const hx = tr(n, [0, 0, 0.12, 0.04, 0.4, -0.15, 0.7, -0.22, 1, -0.22]);
  p.hips.set(hx, hy, 0);
  p.rot(BONE.hips, tr(n, [0, 15, 0.3, 5, 1, 0]), 0, rz);
  p.rot(BONE.spine, tr(n, [0, 10, 0.3, 0, 1, 0]), 0, tr(n, [0, 0, 0.4, 8, 1, 2]));
  p.rot(BONE.chest, tr(n, [0, 5, 1, 0]), 0, tr(n, [0, 0, 0.4, 6, 1, 0]));
  p.rot(BONE.neck, tr(n, [0, -12, 0.4, 0, 1, 0]), 0, tr(n, [0, 0, 0.6, -14, 1, -18]));
  p.rot(BONE.head, -6, 0, tr(n, [0, 0, 0.6, -10, 1, -10]));
  const ax = tr(n, [0, -38, 0.15, -75, 0.35, -165, 0.72, -172, 0.86, -125, 1, -85]);
  const el = tr(n, [0, -45, 0.3, -12, 0.72, -12, 0.9, -60, 1, -95]);
  p.rot(BONE.uarmL, ax, 0, tr(n, [0, 32, 0.35, 8, 1, -8]));
  p.rot(BONE.uarmR, ax, 0, tr(n, [0, -32, 0.35, -10, 1, 6]));
  p.rot(BONE.farmL, el);
  p.rot(BONE.farmR, el);
  p.rot(BONE.handL, -15, 0, -20);
  p.rot(BONE.handR, -15, 0, 20);
  p.rot(BONE.thighL, tr(n, [0, -35, 0.12, -55, 0.3, -5, 0.6, -18, 1, -30]), 0, tr(n, [0, 8, 0.3, 18, 0.6, 10, 1, 4]));
  p.rot(BONE.shinL, tr(n, [0, 55, 0.12, 85, 0.3, 8, 0.6, 25, 1, 50]));
  p.rot(BONE.thighR, tr(n, [0, -35, 0.12, -45, 0.3, -30, 0.6, -18, 1, -12]), 0, tr(n, [0, -8, 0.3, -4, 1, 0]));
  p.rot(BONE.shinR, tr(n, [0, 55, 0.12, 75, 0.3, 55, 0.6, 30, 1, 45]));
  p.rot(BONE.footL, tr(n, [0, -15, 0.3, 30, 1, 15]));
  p.rot(BONE.footR, tr(n, [0, -15, 0.3, 25, 1, 10]));
  // pies plantados durante la carga
  const w = 1 - sstep(0.12, 0.24, n);
  if (w > 0) {
    _tmpPose2.copy(p);
    _pole.set(0.3, 0, 1);
    solveLeg(_tmpPose2, 0, V(0.22, ANKLE_H, 0.0), _pole, footQ(0, 12));
    _pole.set(-0.3, 0, 1);
    solveLeg(_tmpPose2, 1, V(-0.22, ANKLE_H, 0.0), _pole, footQ(0, -12));
    for (const b of [BONE.thighL, BONE.shinL, BONE.footL, BONE.thighR, BONE.shinR, BONE.footR]) p.q[b].slerp(_tmpPose2.q[b], w);
  }
}

function gkCatch(c: Ctx, p: Pose) {
  const n = c.n;
  idle(c, p);
  const hy = tr(n, [0, 0.9, 0.55, 0.86, 1, 0.9]);
  p.hips.y = hy;
  p.rot(BONE.hips, tr(n, [0, 10, 0.5, 16, 1, 10]), 0, 0);
  solveLeg(p, 0, V(0.15, ANKLE_H, 0.02), V(0.2, 0, 1), footQ(0, 10));
  solveLeg(p, 1, V(-0.15, ANKLE_H, -0.02), V(-0.2, 0, 1), footQ(0, -10));
  const sp = tr(n, [0, 6, 0.55, 16, 1, 12]);
  p.rot(BONE.spine, sp, 0, 0);
  p.rot(BONE.chest, sp * 0.6, 0, 0);
  p.rot(BONE.neck, 4, 0, 0);
  p.rot(BONE.head, 10, 0, 0);
  holdArms(p, sstep(0.3, 0.6, n), tr(n, [0, -35, 0.3, -78, 0.6, -40, 1, -38]), tr(n, [0, 30, 0.3, 10, 1, 8]), tr(n, [0, -30, 0.3, -22, 0.6, -112, 1, -116]));
}

function holdArms(p: Pose, hold: number, ax: number, az: number, el: number) {
  p.rot(BONE.uarmL, ax, 0, az);
  p.rot(BONE.uarmR, ax, 0, -az);
  p.rot(BONE.farmL, el, lerp(0, -40, hold), 0);
  p.rot(BONE.farmR, el, lerp(0, 40, hold), 0);
  p.rot(BONE.handL, lerp(-10, 10, hold), 0, lerp(-25, -10, hold));
  p.rot(BONE.handR, lerp(-10, 10, hold), 0, lerp(25, 10, hold));
}

function gkHold(c: Ctx, p: Pose) {
  base(c, p);
  p.rot(BONE.chest, 4, 0, 0);
  holdArms(p, 1, -36, 6, -118);
}

function gkThrow(c: Ctx, p: Pose) {
  // saque con la mano derecha por encima del hombro
  const n = c.n;
  p.hips.set(0, tr(n, [0, 0.94, 0.4, 0.9, 0.6, 0.9, 1, 0.94]), 0);
  const yaw = tr(n, [0, 0, 0.3, -28, 0.5, 10, 0.7, 25, 1, 5]);
  p.rot(BONE.hips, tr(n, [0, 2, 0.5, 10, 0.75, 15, 1, 4]), yaw * 0.6, 0);
  solveLeg(p, 0, V(0.12, ANKLE_H, tr(n, [0, 0.04, 0.35, 0.34, 1, 0.34])), FWD, footQ(0, 10));
  solveLeg(p, 1, V(-0.13, ankleForPitch(tr(n, [0, 0, 0.5, 0, 0.75, 30, 1, 25])), -0.18), FWD, footQ(tr(n, [0, 0, 0.5, 0, 0.75, 30, 1, 25]), -15));
  p.rot(BONE.toeR, -tr(n, [0, 0, 0.5, 0, 0.75, 30, 1, 25]));
  p.rot(BONE.spine, tr(n, [0, 2, 0.35, -8, 0.6, 15, 1, 8]), yaw * 0.4, tr(n, [0, 0, 0.35, -10, 0.55, 6, 1, 0]));
  p.rot(BONE.chest, tr(n, [0, 2, 0.6, 10, 1, 4]), yaw * 0.6, 0);
  p.rot(BONE.neck, -5, -yaw * 0.6, 0);
  p.rot(BONE.head, 0, -yaw * 0.4, 0);
  p.rot(BONE.uarmR, tr(n, [0, -36, 0.3, 45, 0.45, 125, 0.56, 200, 0.75, 290, 1, 330]), 0, tr(n, [0, -6, 0.3, -25, 0.5, -15, 1, -10]));
  p.rot(BONE.farmR, tr(n, [0, -118, 0.3, -15, 0.56, -8, 1, -20]));
  p.rot(BONE.uarmL, tr(n, [0, -36, 0.3, -75, 0.5, -60, 0.75, -10, 1, 0]), 0, tr(n, [0, 6, 0.3, 20, 1, 12]));
  p.rot(BONE.farmL, tr(n, [0, -118, 0.25, -10, 1, -20]));
}

function gkKick(c: Ctx, p: Pose) {
  const n = c.n;
  const hy = tr(n, [0, 0.945, 0.4, 0.9, 0.55, 0.96, 0.68, 1.03, 0.85, 0.93, 1, 0.95]);
  p.hips.set(0.03, hy, 0);
  p.rot(BONE.hips, tr(n, [0, 5, 0.45, 0, 0.62, -14, 0.85, -6, 1, 2]), tr(n, [0, 0, 0.35, -8, 0.6, 12, 1, 0]), 0);
  p.rot(BONE.thighR, tr(n, [0, 8, 0.3, 30, 0.47, -55, 0.65, -108, 0.82, -70, 1, -5]), 0, -4);
  p.rot(BONE.shinR, tr(n, [0, 20, 0.3, 85, 0.47, 18, 0.65, 6, 0.85, 25, 1, 15]));
  p.rot(BONE.footR, tr(n, [0, 0, 0.47, 42, 0.7, 30, 1, 2]));
  const air = Math.max(0, hy - 0.955);
  solveLeg(p, 0, V(0.12, ANKLE_H + air, 0.04), FWD, footQ(air * 300, 8));
  p.rot(BONE.spine, tr(n, [0, 5, 0.47, 2, 0.65, -10, 1, 2]), 0, 0);
  p.rot(BONE.chest, 2, 0, 0);
  p.rot(BONE.neck, 6, 0, 0);
  p.rot(BONE.head, 10, 0, 0);
  const rel = sstep(0.3, 0.42, n);
  p.rot(BONE.uarmL, lerp(-55, -40, rel), 0, lerp(8, 60, rel));
  p.rot(BONE.uarmR, lerp(-55, 25, rel), 0, lerp(-8, -50, rel));
  p.rot(BONE.farmL, lerp(-60, -20, rel));
  p.rot(BONE.farmR, lerp(-60, -25, rel));
}

// ------------------------------------------------------------------ celebraciones / reacciones
function celebrate(c: Ctx, p: Pose) {
  const v = ((c.variant % 4) + 4) % 4;
  const t = c.t;
  if (v === 0) {
    base(c, p);
    const sh = Math.sin(t * 7) * 6;
    p.rot(BONE.uarmL, -165 + sh, 0, 22);
    p.rot(BONE.uarmR, -165 - sh, 0, -22);
    p.rot(BONE.farmL, -18);
    p.rot(BONE.farmR, -18);
    p.addRot(BONE.chest, -8, 0, 0);
    p.addRot(BONE.neck, -10, 0, 0);
    p.addRot(BONE.head, -12, 0, 0);
  } else if (v === 1) {
    // de rodillas, arqueado hacia atrás
    const e = sstep(0, 0.35, t);
    p.hips.set(0, lerp(0.95, 0.535, e), lerp(0, -0.02, e));
    p.rot(BONE.hips, -14 * e, 0, 0);
    p.rot(BONE.thighL, 14 * e + 4, 0, 4);
    p.rot(BONE.thighR, 14 * e + 4, 0, -4);
    p.rot(BONE.shinL, 92 * e);
    p.rot(BONE.shinR, 92 * e);
    p.rot(BONE.footL, 55 * e);
    p.rot(BONE.footR, 55 * e);
    const scream = Math.sin(t * 3) * 3;
    p.rot(BONE.spine, -12 * e, 0, 0);
    p.rot(BONE.chest, -12 * e, 0, 0);
    p.rot(BONE.neck, -10 * e, 0, 0);
    p.rot(BONE.head, (-20 + scream) * e, 0, 0);
    p.rot(BONE.uarmL, -20 * e, 0, 10 + 100 * e);
    p.rot(BONE.uarmR, -20 * e, 0, -10 - 100 * e);
    p.rot(BONE.farmL, -10 - 15 * e);
    p.rot(BONE.farmR, -10 - 15 * e);
  } else if (v === 2) {
    // saltos con puño
    const P = 0.9;
    const cyc = (t % P) / P;
    const air = cyc > 0.25 && cyc < 0.75 ? 0.32 * Math.sin(Math.PI * (cyc - 0.25) / 0.5) : 0;
    const crouch = 0.09 * (Math.max(0, Math.sin(Math.PI * clamp(cyc / 0.25, 0, 1))) + Math.max(0, Math.sin(Math.PI * clamp((cyc - 0.75) / 0.25, 0, 1))));
    const an = air / 0.32;
    p.hips.set(0, 0.955 - crouch + air, 0);
    p.rot(BONE.hips, 6 - 6 * an, 0, 0);
    const fy = ANKLE_H + air + 0.1 * an;
    solveLeg(p, 0, V(0.12, fy, 0.0), FWD, footQ(30 * an, 8));
    solveLeg(p, 1, V(-0.12, fy, -0.03), FWD, footQ(30 * an, -8));
    p.rot(BONE.spine, -4 * an, 0, 0);
    p.rot(BONE.chest, -6 * an, 0, 0);
    p.rot(BONE.neck, -8 * an, 0, 0);
    p.rot(BONE.head, -15 * an, 0, 0);
    p.rot(BONE.uarmR, lerp(-95, -172, an), 0, -18);
    p.rot(BONE.farmR, lerp(-100, -8, an));
    p.rot(BONE.handR, -20, 0, 0);
    p.rot(BONE.uarmL, -25, 0, 18);
    p.rot(BONE.farmL, -105);
  } else {
    // avión
    base(c, p);
    const bank = 18 * Math.sin(t * 2.2);
    p.addRot(BONE.spine, 0, 0, bank * 0.6);
    p.addRot(BONE.chest, 0, 0, bank * 0.4);
    p.addRot(BONE.neck, 0, 0, -bank * 0.5);
    p.rot(BONE.uarmL, 8, 0, 86);
    p.rot(BONE.uarmR, 8, 0, -86);
    p.rot(BONE.farmL, -6);
    p.rot(BONE.farmR, -6);
    p.rot(BONE.handL, 0, 0, 5);
    p.rot(BONE.handR, 0, 0, -5);
  }
}

function dejected(c: Ctx, p: Pose) {
  const v = ((c.variant % 2) + 2) % 2;
  if (v === 0) {
    // manos a la cabeza
    const v0 = c.v;
    c.v = Math.min(c.v, 1.5);
    base(c, p);
    c.v = v0;
    p.addRot(BONE.chest, 6, 0, 0);
    p.addRot(BONE.neck, 10, 0, 0);
    p.addRot(BONE.head, 8 + 4 * Math.sin(c.t * 0.8), 0, 0);
    p.rot(BONE.clavL, 0, 0, 10);
    p.rot(BONE.clavR, 0, 0, -10);
    p.rot(BONE.uarmL, -55, 0, 128);
    p.rot(BONE.uarmR, -55, 0, -128);
    p.rot(BONE.farmL, -150, -10, 0);
    p.rot(BONE.farmR, -150, 10, 0);
    p.rot(BONE.handL, 0, 0, -20);
    p.rot(BONE.handR, 0, 0, 20);
  } else {
    // manos en las rodillas
    const br = Math.sin(c.t * 2.8);
    p.hips.set(0, 0.85, -0.04);
    p.rot(BONE.hips, 32, 0, 0);
    _pole.set(0, 0, 1);
    solveLeg(p, 0, V(0.14, ANKLE_H, 0.05), _pole, footQ(0, 10));
    solveLeg(p, 1, V(-0.14, ANKLE_H, 0.02), _pole, footQ(0, -10));
    p.rot(BONE.spine, 18 + br, 0, 0);
    p.rot(BONE.chest, 10 + br, 0, 0);
    p.rot(BONE.neck, -12, 0, 0);
    p.rot(BONE.head, 6, 0, 0);
    p.rot(BONE.uarmL, -48, 0, 4);
    p.rot(BONE.uarmR, -48, 0, -4);
    p.rot(BONE.farmL, -12);
    p.rot(BONE.farmR, -12);
  }
}

// ------------------------------------------------------------------ regates (pie derecho, salida hacia +X)
// variantes: 0 bicicleta, 1 ruleta, 2 elástico, 3 sombrero, 4 arrastre, 5 amago de tiro
function skillMove(c: Ctx, p: Pose) {
  const n = c.n;
  const v = c.variant;
  const plant = () => {
    _pole.set(0.1, 0, 1);
    solveLeg(p, 0, V(0.15, ANKLE_H, 0.02), _pole, footQ(0, 10));
  };
  const arms = (open: number) => {
    p.rot(BONE.uarmL, -10, 0, 18 + 40 * open);
    p.rot(BONE.uarmR, -10, 0, -18 - 40 * open);
    p.rot(BONE.farmL, -30);
    p.rot(BONE.farmR, -30);
  };
  if (v === 5) {
    // amago: armado del disparo que se corta y sale en conducción lateral
    if (n < 0.55) {
      const cc = { ...c, n: (n / 0.55) * 0.36 };
      kick(cc, p, 'shoot');
    } else {
      const w = sstep(0.55, 1, n);
      kick({ ...c, n: 0.36 }, p, 'shoot');
      _tmpPose.reset();
      trap({ ...c, n: 0.35 + 0.5 * w, variant: 0 }, _tmpPose);
      p.blend(_tmpPose, w);
    }
    return;
  }
  if (v === 0) {
    // bicicleta: la pierna derecha rodea el balón de dentro hacia fuera y el cuerpo amaga hacia la derecha
    const e = sstep(0, 0.2, n) * (1 - sstep(0.8, 1, n));
    const sweep = tr(n, [0, 25, 0.25, 30, 0.45, -10, 0.6, -38, 0.8, -20, 1, 0]);
    p.hips.set(-0.06 * tr(n, [0, 0, 0.45, 1, 0.65, 0.4, 1, -0.6]), 0.93 - 0.03 * e, 0);
    p.rot(BONE.hips, 6 * e, -sweep * 0.25, -8 * tr(n, [0, 0, 0.5, 1, 0.8, -0.5, 1, 0]));
    p.rot(BONE.thighR, tr(n, [0, -5, 0.2, -38, 0.5, -42, 0.7, -20, 1, 0]), sweep, -10 * e);
    p.rot(BONE.shinR, tr(n, [0, 15, 0.25, 55, 0.5, 40, 0.75, 25, 1, 10]));
    p.rot(BONE.footR, 15 * e);
    plant();
    p.rot(BONE.spine, 8 * e, sweep * 0.15, 6 * e);
    p.rot(BONE.chest, 5 * e, 0, 0);
    p.rot(BONE.neck, 10 * e, 0, 0);
    p.rot(BONE.head, 14 * e, 0, 0);
    arms(e);
    return;
  }
  if (v === 2) {
    // elástico: empuje con el exterior hacia fuera y latigazo con el interior hacia dentro
    const e = sstep(0, 0.15, n) * (1 - sstep(0.75, 1, n));
    const yaw = tr(n, [0, 0, 0.25, -32, 0.42, -30, 0.55, 34, 0.75, 20, 1, 0]);
    p.hips.set(0.05 * tr(n, [0, 0, 0.3, -1, 0.55, 1, 1, 0.3]), 0.93 - 0.03 * e, 0);
    p.rot(BONE.hips, 8 * e, yaw * 0.3, tr(n, [0, 0, 0.3, 6, 0.55, -8, 1, 0]));
    p.rot(BONE.thighR, -28 * e, yaw, -6 * e);
    p.rot(BONE.shinR, 30 + 20 * e);
    p.rot(BONE.footR, 10 * e, 0, tr(n, [0, 0, 0.3, -20, 0.55, 22, 1, 0]));
    plant();
    p.rot(BONE.spine, 10 * e, yaw * 0.2, 0);
    p.rot(BONE.chest, 6 * e, 0, 0);
    p.rot(BONE.head, 16 * e, 0, 0);
    arms(e * 1.2);
    return;
  }
  if (v === 1) {
    // ruleta: el pie derecho pisa y arrastra, luego el izquierdo (el giro lo hace la simulación)
    const e = sstep(0, 0.15, n) * (1 - sstep(0.85, 1, n));
    const r = sstep(0.05, 0.45, n) * (1 - sstep(0.45, 0.6, n));
    const l = sstep(0.45, 0.65, n) * (1 - sstep(0.75, 0.95, n));
    p.hips.set(0, 0.9 - 0.04 * e, 0);
    p.rot(BONE.hips, 10 * e, 0, 0);
    p.rot(BONE.thighR, -30 * r, -10 * r, -12 * r);
    p.rot(BONE.shinR, 20 + 25 * r);
    p.rot(BONE.footR, -20 * r);
    if (l > 0.01) {
      p.rot(BONE.thighL, -30 * l, 10 * l, 12 * l);
      p.rot(BONE.shinL, 20 + 25 * l);
      p.rot(BONE.footL, -20 * l);
      _pole.set(-0.1, 0, 1);
      solveLeg(p, 1, V(-0.15, ANKLE_H, 0.0), _pole, footQ(0, -10));
    } else {
      plant();
    }
    p.rot(BONE.spine, 12 * e, 0, 0);
    p.rot(BONE.chest, 6 * e, 0, 0);
    p.rot(BONE.head, 18 * e, 0, 0);
    arms(e * 1.3);
    return;
  }
  if (v === 3) {
    // sombrero: el talón derecho levanta el balón por detrás y por encima de la cabeza
    const e = sstep(0, 0.15, n) * (1 - sstep(0.8, 1, n));
    const hop = Math.sin(clamp((n - 0.3) / 0.35, 0, 1) * Math.PI);
    p.hips.set(0, 0.92 + 0.07 * hop, 0);
    p.rot(BONE.hips, -6 * hop + 6 * e, 0, 0);
    p.rot(BONE.thighR, tr(n, [0, 0, 0.2, -18, 0.32, 18, 0.45, 35, 0.7, 10, 1, 0]), 0, -6 * e);
    p.rot(BONE.shinR, tr(n, [0, 15, 0.2, 35, 0.32, 70, 0.45, 135, 0.65, 70, 1, 15]));
    p.rot(BONE.footR, tr(n, [0, 0, 0.32, 30, 0.45, 50, 1, 0]));
    plant();
    p.rot(BONE.spine, 6 * e - 8 * hop, 0, 0);
    p.rot(BONE.chest, 4 * e, 0, 0);
    p.rot(BONE.neck, -10 * hop, 0, 0);
    p.rot(BONE.uarmL, -20 * hop, 0, 25 + 35 * e);
    p.rot(BONE.uarmR, -20 * hop, 0, -25 - 35 * e);
    p.rot(BONE.farmL, -40);
    p.rot(BONE.farmR, -40);
    return;
  }
  // 4 arrastre: planta del pie sobre el balón y tirón hacia atrás
  const e = sstep(0, 0.15, n) * (1 - sstep(0.8, 1, n));
  p.hips.set(0, 0.93 - 0.03 * e, -0.03 * e);
  p.rot(BONE.hips, -4 * e, tr(n, [0, 0, 0.5, 0, 0.75, 25, 1, 40]), 0);
  p.rot(BONE.thighR, tr(n, [0, 0, 0.2, -38, 0.4, -30, 0.6, 12, 0.8, 5, 1, 0]), 0, -4 * e);
  p.rot(BONE.shinR, tr(n, [0, 15, 0.2, 25, 0.4, 30, 0.6, 45, 1, 15]));
  p.rot(BONE.footR, tr(n, [0, 0, 0.2, -25, 0.5, -20, 0.7, 10, 1, 0]));
  plant();
  p.rot(BONE.spine, -4 * e, 0, 0);
  p.rot(BONE.head, 12 * e, 0, 0);
  arms(e * 0.8);
}

// ------------------------------------------------------------------ despacho
const DEFAULT_DUR: Partial<Record<AnimState, number>> = {
  pass: 0.45, lob: 0.55, shoot: 0.55, header: 0.75, tackle: 0.6, slide: 1.0, getup: 1.2, throwin: 1.0, trap: 0.4, skill: 0.6,
  gk_dive_left: 1.1, gk_dive_right: 1.1, gk_catch: 0.5, gk_throw: 0.8, gk_kick: 0.85,
};

function evalState(c: Ctx, p: Pose) {
  p.reset();
  const right = c.foot >= 0;
  switch (c.state) {
    case 'idle':
      return idle(c, p);
    case 'locomotion':
      return base(c, p);
    case 'dribble': {
      idle(c, p);
      const w = sstep(0.1, 0.7, c.v);
      if (w > 0) {
        _tmpPose.reset();
        locomotion(c, _tmpPose, true);
        p.blend(_tmpPose, w);
      }
      return;
    }
    case 'jockey':
      return jockey(c, p);
    case 'pass':
    case 'lob':
    case 'shoot':
      kick(c, p, c.state);
      if (!right) p.mirror();
      return;
    case 'trap':
      trap(c, p);
      if (!right) p.mirror();
      return;
    case 'skill':
      skillMove(c, p);
      if (!right) p.mirror();
      return;
    case 'header':
      return header(c, p);
    case 'tackle':
      tackle(c, p);
      if (!right) p.mirror();
      return;
    case 'slide':
      slide(c, p);
      if (!right) p.mirror();
      return;
    case 'fallen':
      return fallen(c, p);
    case 'getup':
      return getup(c, p);
    case 'throwin':
      return throwin(c, p);
    case 'gk_ready':
      return jockey(c, p, true);
    case 'gk_dive_right':
      return gkDive(c, p);
    case 'gk_dive_left':
      gkDive(c, p);
      p.mirror();
      return;
    case 'gk_catch':
      return gkCatch(c, p);
    case 'gk_hold':
      return gkHold(c, p);
    case 'gk_throw':
      gkThrow(c, p);
      if (!right) p.mirror();
      return;
    case 'gk_kick':
      gkKick(c, p);
      if (!right) p.mirror();
      return;
    case 'celebrate':
      return celebrate(c, p);
    case 'dejected':
      return dejected(c, p);
    default:
      return idle(c, p);
  }
}

function blendTime(from: AnimState | '', to: AnimState) {
  if (from === '') return 0;
  if (to === 'gk_dive_left' || to === 'gk_dive_right') return 0.1;
  if (from === 'slide' && to === 'fallen') return 0.3;
  if (from === 'fallen' || to === 'fallen') return 0.25;
  if (to === 'pass' || to === 'shoot' || to === 'lob' || to === 'trap' || to === 'skill') return 0.12;
  if (to === 'celebrate' || to === 'dejected' || to === 'throwin') return 0.3;
  if ((from === 'locomotion' || from === 'dribble') && (to === 'locomotion' || to === 'dribble')) return 0.25;
  return 0.16;
}

const _ad = new THREE.Vector3();
const _cq = new THREE.Quaternion();
/** Eleva las clavículas cuando los brazos suben por encima de la horizontal (hombros más naturales). */
function autoShrug(p: Pose) {
  for (const side of [0, 1] as const) {
    const ua = side === 0 ? BONE.uarmL : BONE.uarmR;
    const cl = side === 0 ? BONE.clavL : BONE.clavR;
    _ad.set(0, -1, 0).applyQuaternion(p.q[ua]);
    const elev = Math.asin(clamp(_ad.y, -1, 1)) / D2R; // -90 colgando, +90 arriba
    const k = Math.max(0, elev + 20) * 0.22;
    if (k <= 0) continue;
    _e.set(0, 0, (side === 0 ? 1 : -1) * k * D2R);
    _cq.setFromEuler(_e);
    p.q[cl].premultiply(_cq);
  }
}

export class Animator {
  private readonly out = new Pose();
  private readonly target = new Pose();
  private state: AnimState | '' = '';
  private lastTime = 0;
  private blendT = 1;
  private blendDur = 0;
  private wPrev = 0;
  private phase: number;
  private jphase = 0;
  private vs = 0;
  private readonly ctx: Ctx;

  constructor(private readonly seed: number) {
    this.phase = frac(seed * 3.7);
    this.ctx = { state: 'idle', t: 0, n: 0, v: 0, phase: 0, jphase: 0, foot: 1, variant: 0, seed };
  }

  /** heightScale = altura del jugador / 1.80. Devuelve la pose final (referencia interna). */
  update(anim: AnimInfo, dt: number, heightScale: number): Pose {
    dt = clamp(dt, 0, 0.1);
    const vModel = Math.max(0, anim.speed) / Math.max(0.5, heightScale);
    const k = 1 - Math.exp(-dt / 0.12);
    this.vs += (vModel - this.vs) * k;
    const dribble = anim.state === 'dribble';
    this.phase += (this.vs * dt) / strideLength(this.vs, dribble);
    if (this.phase > 1e4) this.phase -= 1e4;
    this.jphase += (this.vs * dt) / 0.9;
    const restart = anim.state === this.state && anim.time + 1e-4 < this.lastTime - 0.05;
    if (anim.state !== this.state || restart) {
      this.blendDur = restart ? 0.18 : blendTime(this.state, anim.state);
      this.blendT = 0;
      this.wPrev = 0;
      this.state = anim.state;
    }
    this.lastTime = anim.time;
    const c = this.ctx;
    c.state = anim.state;
    c.t = Math.max(0, anim.time);
    const dur = anim.duration > 0 ? anim.duration : DEFAULT_DUR[anim.state] ?? 1;
    c.n = clamp(c.t / dur, 0, 1);
    c.v = this.vs;
    c.phase = this.phase;
    c.jphase = this.jphase;
    c.foot = anim.foot >= 0 ? 1 : -1;
    c.variant = Math.floor(anim.variant || 0);
    evalState(c, this.target);
    autoShrug(this.target);
    this.blendT += dt;
    if (this.blendDur > 0 && this.blendT < this.blendDur) {
      // crossfade incremental: equivale a slerp(desde, objetivo, w) con objetivo fijo, pero parte siempre
      // de la salida anterior, así que nunca "salta" al cruzar rotaciones relativas de ~180°.
      const w = sstep(0, 1, this.blendT / this.blendDur);
      const a = 1 - (1 - w) / Math.max(1e-4, 1 - this.wPrev);
      this.wPrev = w;
      this.out.blend(this.target, clamp(a, 0, 1));
    } else {
      this.out.copy(this.target);
    }
    clampFeetToGround(this.out);
    return this.out;
  }
}

export { HIPS_REST_Y };
