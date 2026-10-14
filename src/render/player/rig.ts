// Rig del futbolista: definición de huesos, pose (cuaterniones locales), FK, IK de piernas y espejo.
// Todas las medidas están en "espacio de modelo" de un jugador de 1.80 m (luego se escala el grupo).
// Ejes: +X = izquierda del jugador, +Y = arriba, +Z = adelante. Todos los huesos tienen rotación de
// reposo identidad, así que las rotaciones locales se expresan en ejes "del cuerpo":
//   - columna/cuello/cabeza: +X = flexión hacia delante
//   - muslo: -X = pierna adelante; tibia: +X = flexión de rodilla; pie: +X = puntera abajo
//   - brazo: -X = brazo adelante; +Z = (izquierdo) abducción / (derecho) aducción; antebrazo: -X = flexión de codo
//   - Y positivo gira +Z hacia +X (hacia la izquierda del jugador)
import * as THREE from 'three';

export const BONE = {
  hips: 0,
  spine: 1,
  chest: 2,
  neck: 3,
  head: 4,
  clavL: 5,
  uarmL: 6,
  farmL: 7,
  handL: 8,
  clavR: 9,
  uarmR: 10,
  farmR: 11,
  handR: 12,
  thighL: 13,
  shinL: 14,
  footL: 15,
  toeL: 16,
  thighR: 17,
  shinR: 18,
  footR: 19,
  toeR: 20,
} as const;
export const BONE_COUNT = 21;

export interface BoneDef {
  name: string;
  parent: number;
  offset: [number, number, number];
}

export const HIPS_REST_Y = 0.97;
export const THIGH_LEN = 0.43;
export const SHIN_LEN = 0.415;
export const ANKLE_H = 0.075;
export const UPPERARM_LEN = 0.285;
export const FOREARM_LEN = 0.255;

const L = (name: string, parent: number, x: number, y: number, z: number): BoneDef => ({ name, parent, offset: [x, y, z] });

export const BONE_DEFS: BoneDef[] = [
  L('hips', -1, 0, HIPS_REST_Y, 0),
  L('spine', BONE.hips, 0, 0.1, 0),
  L('chest', BONE.spine, 0, 0.17, 0),
  L('neck', BONE.chest, 0, 0.23, 0),
  L('head', BONE.neck, 0, 0.1, 0),
  L('clavicle.L', BONE.chest, 0.025, 0.18, -0.005),
  L('upperArm.L', BONE.clavL, 0.155, 0.02, -0.005),
  L('foreArm.L', BONE.uarmL, 0.015, -UPPERARM_LEN, -0.005),
  L('hand.L', BONE.farmL, 0.008, -FOREARM_LEN, 0.01),
  L('clavicle.R', BONE.chest, -0.025, 0.18, -0.005),
  L('upperArm.R', BONE.clavR, -0.155, 0.02, -0.005),
  L('foreArm.R', BONE.uarmR, -0.015, -UPPERARM_LEN, -0.005),
  L('hand.R', BONE.farmR, -0.008, -FOREARM_LEN, 0.01),
  L('thigh.L', BONE.hips, 0.092, -0.05, 0),
  L('shin.L', BONE.thighL, 0, -THIGH_LEN, 0),
  L('foot.L', BONE.shinL, 0, -SHIN_LEN, 0),
  L('toe.L', BONE.footL, 0, -0.05, 0.115),
  L('thigh.R', BONE.hips, -0.092, -0.05, 0),
  L('shin.R', BONE.thighR, 0, -THIGH_LEN, 0),
  L('foot.R', BONE.shinR, 0, -SHIN_LEN, 0),
  L('toe.R', BONE.footR, 0, -0.05, 0.115),
];

/** Índice del hueso simétrico. */
export const MIRROR_BONE: number[] = BONE_DEFS.map((d, i) => {
  if (d.name.endsWith('.L')) return BONE_DEFS.findIndex((o) => o.name === d.name.slice(0, -2) + '.R');
  if (d.name.endsWith('.R')) return BONE_DEFS.findIndex((o) => o.name === d.name.slice(0, -2) + '.L');
  return i;
});

/** Posiciones de reposo (bind) en espacio de modelo. */
export const REST_POS: THREE.Vector3[] = (() => {
  const out: THREE.Vector3[] = [];
  BONE_DEFS.forEach((d, i) => {
    const p = new THREE.Vector3(...d.offset);
    if (d.parent >= 0) p.add(out[d.parent]);
    out[i] = p;
  });
  return out;
})();

const D2R = Math.PI / 180;
const _e = new THREE.Euler();

export class Pose {
  readonly q: THREE.Quaternion[] = [];
  readonly hips = new THREE.Vector3(0, HIPS_REST_Y, 0);
  constructor() {
    for (let i = 0; i < BONE_COUNT; i++) this.q.push(new THREE.Quaternion());
  }
  reset(): this {
    for (const q of this.q) q.identity();
    this.hips.set(0, HIPS_REST_Y, 0);
    return this;
  }
  copy(o: Pose): this {
    for (let i = 0; i < BONE_COUNT; i++) this.q[i].copy(o.q[i]);
    this.hips.copy(o.hips);
    return this;
  }
  /** Rotación local en grados (orden XYZ). */
  rot(bone: number, x: number, y = 0, z = 0): this {
    _e.set(x * D2R, y * D2R, z * D2R, 'XYZ');
    this.q[bone].setFromEuler(_e);
    return this;
  }
  /** Multiplica una rotación extra (grados) sobre la actual (post-multiplicación local). */
  addRot(bone: number, x: number, y = 0, z = 0): this {
    _e.set(x * D2R, y * D2R, z * D2R, 'XYZ');
    _tq.setFromEuler(_e);
    this.q[bone].multiply(_tq);
    return this;
  }
  /** Interpola hacia otra pose (t=1 → o). */
  blend(o: Pose, t: number): this {
    if (t <= 0) return this;
    if (t >= 1) return this.copy(o);
    for (let i = 0; i < BONE_COUNT; i++) this.q[i].slerp(o.q[i], t);
    this.hips.lerp(o.hips, t);
    return this;
  }
  /** Espejo izquierda/derecha (reflexión en X). */
  mirror(): this {
    const tmp = _mirrorTmp;
    for (let i = 0; i < BONE_COUNT; i++) {
      const s = this.q[MIRROR_BONE[i]];
      tmp[i].set(s.x, -s.y, -s.z, s.w);
    }
    for (let i = 0; i < BONE_COUNT; i++) this.q[i].copy(tmp[i]);
    this.hips.x = -this.hips.x;
    return this;
  }
}
const _tq = new THREE.Quaternion();
const _mirrorTmp: THREE.Quaternion[] = Array.from({ length: BONE_COUNT }, () => new THREE.Quaternion());

/** Cinemática directa: cuaterniones y posiciones en espacio de modelo. */
export function forwardKinematics(pose: Pose, outQ: THREE.Quaternion[], outP: THREE.Vector3[]) {
  for (let i = 0; i < BONE_COUNT; i++) {
    const d = BONE_DEFS[i];
    if (d.parent < 0) {
      outQ[i].copy(pose.q[i]);
      outP[i].copy(pose.hips);
    } else {
      outP[i].set(d.offset[0], d.offset[1], d.offset[2]).applyQuaternion(outQ[d.parent]).add(outP[d.parent]);
      outQ[i].copy(outQ[d.parent]).multiply(pose.q[i]);
    }
  }
}

export function makeFKBuffers() {
  return {
    q: Array.from({ length: BONE_COUNT }, () => new THREE.Quaternion()),
    p: Array.from({ length: BONE_COUNT }, () => new THREE.Vector3()),
  };
}

// ---------------------------------------------------------------- IK de piernas
const _hq = new THREE.Quaternion();
const _hqi = new THREE.Quaternion();
const _hj = new THREE.Vector3();
const _d = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _td = new THREE.Vector3();
const _sd = new THREE.Vector3();
const _z = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qt = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _tmpq = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);

function basisQuat(dir: THREE.Vector3, front: THREE.Vector3, out: THREE.Quaternion) {
  // eje local -Y → dir, +Z → front (ortogonalizado)
  _y.copy(dir).negate();
  _z.copy(front).addScaledVector(_y, -front.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** Posición en modelo de la cadera (articulación del muslo) para la rotación/posición de hips actual. */
export function hipJoint(pose: Pose, side: 0 | 1, out: THREE.Vector3) {
  const def = BONE_DEFS[side === 0 ? BONE.thighL : BONE.thighR];
  return out.set(def.offset[0], def.offset[1], def.offset[2]).applyQuaternion(pose.q[BONE.hips]).add(pose.hips);
}

/**
 * IK analítica de dos huesos para una pierna. side 0 = izquierda, 1 = derecha.
 * target = posición del tobillo en espacio de modelo; pole = dirección hacia la que apunta la rodilla (modelo);
 * footQ = orientación del pie en modelo (null → conserva la local actual).
 */
export function solveLeg(pose: Pose, side: 0 | 1, target: THREE.Vector3, pole: THREE.Vector3 | null, footQ: THREE.Quaternion | null) {
  const thigh = side === 0 ? BONE.thighL : BONE.thighR;
  const shin = thigh + 1;
  const foot = thigh + 2;
  _hq.copy(pose.q[BONE.hips]);
  _hqi.copy(_hq).invert();
  hipJoint(pose, side, _hj);
  _d.copy(target).sub(_hj).applyQuaternion(_hqi);
  _pole.copy(pole ?? FWD).applyQuaternion(_hqi);
  const a = THIGH_LEN;
  const b = SHIN_LEN;
  let dist = _d.length();
  if (dist < 1e-5) _d.set(0, -1, 0), (dist = 1);
  const dn = _d.multiplyScalar(1 / dist);
  dist = Math.min(Math.max(dist, 0.12), (a + b) * 0.9995);
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const A = Math.acos(Math.min(1, Math.max(-1, cosA)));
  // perpendicular de la dirección del polo respecto a la línea cadera→tobillo
  const pp = _pole.addScaledVector(dn, -_pole.dot(dn));
  if (pp.lengthSq() < 1e-8) pp.set(0, 0, 1).addScaledVector(dn, -dn.z);
  pp.normalize();
  _td.copy(dn).multiplyScalar(Math.cos(A)).addScaledVector(pp, Math.sin(A)); // dirección del muslo
  _sd.copy(dn).multiplyScalar(dist).addScaledVector(_td, -a).normalize(); // dirección de la tibia
  basisQuat(_td, pp, _qt);
  basisQuat(_sd, pp, _qs);
  pose.q[thigh].copy(_qt);
  pose.q[shin].copy(_tmpq.copy(_qt).invert().multiply(_qs));
  if (footQ) {
    // local pie = (hips * Qs)^-1 * footQ
    _qf.copy(_hq).multiply(_qs).invert().multiply(footQ);
    pose.q[foot].copy(_qf);
  }
}

// ---------------------------------------------------------------- Restricción de suelo
const fk = makeFKBuffers();
const SOLE_POINTS_FOOT = [new THREE.Vector3(0, -0.07, -0.06), new THREE.Vector3(0.03, -0.068, 0.1), new THREE.Vector3(-0.03, -0.068, 0.1)];
const SOLE_POINTS_TOE = [new THREE.Vector3(0, -0.018, 0.085)];
const _sp = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _fq = new THREE.Quaternion();
const _kneeDir = new THREE.Vector3();

/** Evita que los pies atraviesen el suelo re-resolviendo la IK de la pierna afectada. */
export function clampFeetToGround(pose: Pose, minY = 0.004) {
  forwardKinematics(pose, fk.q, fk.p);
  for (const side of [0, 1] as const) {
    const foot = side === 0 ? BONE.footL : BONE.footR;
    const toe = foot + 1;
    let low = Infinity;
    for (const sp of SOLE_POINTS_FOOT) {
      _sp.copy(sp).applyQuaternion(fk.q[foot]).add(fk.p[foot]);
      low = Math.min(low, _sp.y);
    }
    for (const sp of SOLE_POINTS_TOE) {
      _sp.copy(sp).applyQuaternion(fk.q[toe]).add(fk.p[toe]);
      low = Math.min(low, _sp.y);
    }
    if (low < minY) {
      const delta = minY - low;
      _ankle.copy(fk.p[foot]);
      _ankle.y += delta;
      _fq.copy(fk.q[foot]);
      // polo: dirección actual de la rodilla (frente del muslo)
      _kneeDir.set(0, 0, 1).applyQuaternion(fk.q[foot - 2]);
      solveLeg(pose, side, _ankle, _kneeDir, _fq);
    }
  }
}
