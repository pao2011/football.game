// Geometría procedural del futbolista: barridos de secciones transversales (superelipses) a lo largo de
// los huesos, con pesos de piel suaves interpolados entre claves. Todo se fusiona en una única
// BufferGeometry indexada con grupos por material. Se cachea por calidad + (portero / jugador).
import * as THREE from 'three';
import { BONE } from './rig';
import {
  SHIRT_TORSO_V0, SHIRT_Y0, SHIRT_Y1, SHORTS_PELVIS_Y0, SHORTS_PELVIS_Y1, SHORTS_LEG_Y0, SHORTS_LEG_Y1, SOCK_Y0, SOCK_Y1,
} from './kitTextures';
import type { ModelQualityLike } from './types';

export const MAT = { skin: 0, shirt: 1, shorts: 2, socks: 3, boots: 4, dark: 5, gloves: 6 } as const;
export const MAT_COUNT = 7;

type W = Partial<Record<number, number>>;

interface Key {
  d: number; // distancia a lo largo del camino
  rs: number; // radio lateral
  rf: number; // radio frontal
  rb?: number; // radio trasero (por defecto = rf)
  cs?: number; // desplazamiento lateral del centro
  cf?: number; // desplazamiento frontal del centro
  pf?: number; // exponente superelipse mitad frontal
  pb?: number; // exponente mitad trasera
  w: W; // pesos de huesos
  mat?: number; // inicia una nueva sección con este material
  lin?: boolean; // el intervalo que empieza en esta clave no se subdivide
}

interface PartDef {
  path: THREE.Vector3[];
  ref: THREE.Vector3; // dirección "frontal" de referencia de las secciones
  keys: Key[];
  segments: number; // múltiplo de 4
  flipU: boolean;
  uv: (u: number, p: THREE.Vector3, d: number, mat: number) => [number, number];
  displace?: (theta: number, p: THREE.Vector3) => number;
  weights?: (p: THREE.Vector3, w: W) => W;
}

interface Quality {
  segBody: number;
  segLimb: number;
  segSmall: number;
  maxLen: number;
  segHair: number;
  hairRows: number;
}

const QUALITY: Record<ModelQualityLike, Quality> = {
  high: { segBody: 24, segLimb: 16, segSmall: 8, maxLen: 0.042, segHair: 32, hairRows: 12 },
  medium: { segBody: 20, segLimb: 12, segSmall: 8, maxLen: 0.055, segHair: 24, hairRows: 8 },
  lite: { segBody: 8, segLimb: 6, segSmall: 4, maxLen: 0.22, segHair: 10, hairRows: 4 },
  low: { segBody: 12, segLimb: 8, segSmall: 4, maxLen: 0.14, segHair: 16, hairRows: 5 },
};

// ---------------------------------------------------------------------------------------------
class Builder {
  pos: number[] = [];
  uv: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[][] = Array.from({ length: MAT_COUNT }, () => []);

  addVertex(p: THREE.Vector3, u: number, v: number, w: W) {
    const entries = Object.entries(w)
      .map(([k, val]) => [Number(k), val ?? 0] as [number, number])
      .filter((e) => e[1] > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    let sum = 0;
    for (const e of entries) sum += e[1];
    while (entries.length < 4) entries.push([0, 0]);
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    for (const e of entries) {
      this.si.push(e[0]);
      this.sw.push(sum > 0 ? e[1] / sum : 0);
    }
    return this.pos.length / 3 - 1;
  }

  get count() {
    return this.pos.length / 3;
  }

  /** Añade el contenido de otro builder, opcionalmente reflejado en X. */
  append(o: Builder, mirror: boolean, boneMap?: (b: number) => number, uvMap?: (u: number, v: number, mat: number) => [number, number]) {
    const base = this.count;
    const vertMat = new Int32Array(o.count).fill(-1);
    o.idx.forEach((list, m) => list.forEach((i) => (vertMat[i] = m)));
    for (let i = 0; i < o.count; i++) {
      this.pos.push(mirror ? -o.pos[i * 3] : o.pos[i * 3], o.pos[i * 3 + 1], o.pos[i * 3 + 2]);
      let u = o.uv[i * 2];
      let v = o.uv[i * 2 + 1];
      if (uvMap) [u, v] = uvMap(u, v, vertMat[i]);
      this.uv.push(u, v);
      for (let k = 0; k < 4; k++) {
        const b = o.si[i * 4 + k];
        this.si.push(boneMap ? boneMap(b) : b);
        this.sw.push(o.sw[i * 4 + k]);
      }
    }
    o.idx.forEach((list, m) => {
      for (let t = 0; t < list.length; t += 3) {
        if (mirror) this.idx[m].push(base + list[t], base + list[t + 2], base + list[t + 1]);
        else this.idx[m].push(base + list[t], base + list[t + 1], base + list[t + 2]);
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------
function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

interface Ring {
  d: number;
  rs: number;
  rf: number;
  rb: number;
  cs: number;
  cf: number;
  pf: number;
  pb: number;
  w: W;
}

function keyVal(k: Key, f: keyof Ring): number {
  switch (f) {
    case 'rb':
      return k.rb ?? k.rf;
    case 'cs':
      return k.cs ?? 0;
    case 'cf':
      return k.cf ?? 0;
    case 'pf':
      return k.pf ?? 2;
    case 'pb':
      return k.pb ?? 2;
    default:
      return k[f as 'd' | 'rs' | 'rf'];
  }
}

function interpRing(keys: Key[], i: number, t: number, smooth: boolean): Ring {
  const k1 = keys[i];
  const k2 = keys[Math.min(i + 1, keys.length - 1)];
  const k0 = keys[Math.max(i - 1, 0)];
  const k3 = keys[Math.min(i + 2, keys.length - 1)];
  const f = (n: keyof Ring) => {
    const a = keyVal(k1, n);
    const b = keyVal(k2, n);
    if (!smooth || n === 'd') return a + (b - a) * t;
    // evitar sobreoscilación: limitar al rango de los dos extremos
    const v = cr(keyVal(k0.lin ? k1 : k0, n), a, b, keyVal(k2.lin ? k2 : k3, n), t);
    const lo = Math.min(a, b) - Math.abs(b - a) * 0.15;
    const hi = Math.max(a, b) + Math.abs(b - a) * 0.15;
    return Math.min(hi, Math.max(lo, v));
  };
  const w: W = {};
  for (const [b, v] of Object.entries(k1.w)) w[+b] = (w[+b] ?? 0) + (v ?? 0) * (1 - t);
  for (const [b, v] of Object.entries(k2.w)) w[+b] = (w[+b] ?? 0) + (v ?? 0) * t;
  return { d: f('d'), rs: Math.max(0, f('rs')), rf: Math.max(0, f('rf')), rb: Math.max(0, f('rb')), cs: f('cs'), cf: f('cf'), pf: f('pf'), pb: f('pb'), w };
}

function pathFrame(path: THREE.Vector3[], d: number, ref: THREE.Vector3, outC: THREE.Vector3, outT: THREE.Vector3, outS: THREE.Vector3, outF: THREE.Vector3) {
  // posición y tangente en el camino poligonal (con tangente suavizada en los vértices)
  let acc = 0;
  let seg = 0;
  const lens: number[] = [];
  for (let i = 0; i < path.length - 1; i++) lens.push(path[i].distanceTo(path[i + 1]));
  while (seg < lens.length - 1 && acc + lens[seg] < d) acc += lens[seg++];
  const t = (d - acc) / lens[seg];
  outC.lerpVectors(path[seg], path[seg + 1], t);
  const dir = new THREE.Vector3().subVectors(path[seg + 1], path[seg]).normalize();
  // suavizado de la tangente cerca de las uniones
  const blendR = 0.06;
  if (seg > 0 && d - acc < blendR) {
    const prev = new THREE.Vector3().subVectors(path[seg], path[seg - 1]).normalize();
    dir.lerp(prev, 0.5 * (1 - (d - acc) / blendR)).normalize();
  }
  if (seg < lens.length - 1 && acc + lens[seg] - d < blendR) {
    const next = new THREE.Vector3().subVectors(path[seg + 2], path[seg + 1]).normalize();
    dir.lerp(next, 0.5 * (1 - (acc + lens[seg] - d) / blendR)).normalize();
  }
  outT.copy(dir);
  outF.copy(ref).addScaledVector(dir, -ref.dot(dir)).normalize();
  outS.crossVectors(outT, outF).normalize();
}

function spow(c: number, p: number) {
  return Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
}

const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _f = new THREE.Vector3();

/** Barrido de una parte del cuerpo. */
function sweep(b: Builder, def: PartDef, q: Quality) {
  const { keys } = def;
  // 1) muestrear anillos
  interface Sample { ring: Ring; mat: number; brk: boolean; prevMat: number }
  const samples: Sample[] = [];
  let mat = keys[0].mat ?? MAT.skin;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const prevMat = mat;
    const brk = i > 0 && k.mat !== undefined && k.mat !== -1;
    if (k.mat !== undefined) mat = k.mat;
    if (i === keys.length - 1) {
      samples.push({ ring: interpRing(keys, i, 0, false), mat, brk, prevMat });
      break;
    }
    const k2 = keys[i + 1];
    const len = Math.abs(k2.d - k.d) + Math.abs(k2.rs - k.rs) * 0.5;
    const n = k.lin ? 1 : Math.max(1, Math.ceil(len / q.maxLen));
    for (let j = 0; j < n; j++) {
      samples.push({ ring: interpRing(keys, i, j / n, !k.lin), mat, brk: j === 0 && brk, prevMat });
    }
  }
  const seg = Math.max(4, Math.round(def.segments / 4) * 4);
  const pts: THREE.Vector3[] = Array.from({ length: seg + 1 }, () => new THREE.Vector3());
  let prevRing: number[] | null = null;
  let prevMatOfRing = -1;
  const emitRing = (r: Ring, m: number): number[] => {
    pathFrame(def.path, r.d, def.ref, _c, _t, _s, _f);
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const cx = spow(Math.cos(th), Math.sin(th) >= 0 ? r.pf : r.pb);
      const sy = spow(Math.sin(th), Math.sin(th) >= 0 ? r.pf : r.pb);
      const rad = Math.sin(th) >= 0 ? r.rf : r.rb;
      const p = pts[j].copy(_c).addScaledVector(_s, r.cs + r.rs * cx).addScaledVector(_f, r.cf + rad * sy);
      if (def.displace) {
        const amt = def.displace(th, p);
        if (amt !== 0) {
          const dirx = Math.cos(th);
          const diry = Math.sin(th);
          p.addScaledVector(_s, dirx * amt).addScaledVector(_f, diry * amt);
        }
      }
    }
    // u por longitud de arco dentro de cada cuadrante
    const quarter = seg / 4;
    const us: number[] = new Array(seg + 1);
    for (let qd = 0; qd < 4; qd++) {
      let tot = 0;
      const cum = [0];
      for (let j = qd * quarter; j < (qd + 1) * quarter; j++) {
        tot += pts[j].distanceTo(pts[j + 1]);
        cum.push(tot);
      }
      for (let j = 0; j <= quarter; j++) {
        const frac = tot > 1e-9 ? cum[j] / tot : j / quarter;
        us[qd * quarter + j] = (qd + frac) / 4;
      }
    }
    const ids: number[] = [];
    for (let j = 0; j <= seg; j++) {
      const u = def.flipU ? 1 - us[j] : us[j];
      const [uu, vv] = def.uv(u, pts[j], r.d, m);
      ids.push(b.addVertex(pts[j], uu, vv, def.weights ? def.weights(pts[j], r.w) : r.w));
    }
    return ids;
  };
  for (const s of samples) {
    if (s.brk && prevRing) {
      // cerrar la sección anterior con un anillo en esta posición
      const endRing = emitRing(s.ring, s.prevMat);
      stitch(b, prevRing, endRing, s.prevMat, seg);
      prevRing = null;
    }
    const ring = emitRing(s.ring, s.mat);
    if (prevRing && prevMatOfRing === s.mat) stitch(b, prevRing, ring, s.mat, seg);
    prevRing = ring;
    prevMatOfRing = s.mat;
  }
}

function stitch(b: Builder, r0: number[], r1: number[], mat: number, seg: number) {
  const list = b.idx[mat];
  for (let j = 0; j < seg; j++) {
    const a = r0[j];
    const a1 = r0[j + 1];
    const c = r1[j];
    const c1 = r1[j + 1];
    list.push(a, c, a1, a1, c, c1);
  }
}

/** Elipsoide (pequeños detalles: orejas, ojos, cejas) como un barrido corto. */
function blob(
  b: Builder, from: THREE.Vector3, to: THREE.Vector3, ref: THREE.Vector3, rs: number, rf: number, w: W, mat: number, segs: number, q: Quality,
  shape: (t: number) => number = (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)),
) {
  const len = from.distanceTo(to);
  const n = q.segSmall <= 4 ? 3 : 6;
  const keys: Key[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = Math.max(0.02, shape(t));
    keys.push({ d: t * len, rs: rs * k, rf: rf * k, w, lin: false });
  }
  keys[0].mat = mat;
  sweep(b, { path: [from, to], ref, keys, segments: segs, flipU: false, uv: () => [0.5, 0.5] }, { ...q, maxLen: 10 });
}

// ---------------------------------------------------------------------------------------------
// Perfiles del cuerpo (modelo de 1.80 m)
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const FWD = V(0, 0, 1);

const H = BONE.hips;
const SP = BONE.spine;
const CH = BONE.chest;
const NK = BONE.neck;
const HD = BONE.head;

/** Claves del tronco + cuello + cabeza (d = y - 0.8). */
function torsoKeys(): Key[] {
  const k = (y: number, rs: number, rf: number, rb: number, cf: number, w: W, extra: Partial<Key> = {}): Key => ({ d: y - 0.8, rs, rf, rb, cf, w, ...extra });
  return [
    // pantalón (pelvis)
    k(0.832, 0.02, 0.02, 0.02, 0, { [H]: 1 }, { mat: MAT.shorts }),
    k(0.85, 0.1, 0.07, 0.08, 0, { [H]: 1 }),
    k(0.885, 0.155, 0.095, 0.11, 0, { [H]: 1 }),
    k(0.93, 0.172, 0.104, 0.122, 0, { [H]: 1 }),
    k(0.99, 0.168, 0.104, 0.112, 0, { [H]: 1 }, { lin: true }),
    // camiseta: dobladillo plegado por fuera del pantalón
    k(0.99, 0.162, 0.1, 0.108, 0, { [H]: 1 }, { mat: MAT.shirt, lin: true }),
    k(0.952, 0.178, 0.115, 0.124, 0, { [H]: 0.9, [SP]: 0.1 }, { lin: true }),
    k(0.962, 0.181, 0.118, 0.126, 0, { [H]: 0.9, [SP]: 0.1 }),
    k(1.04, 0.172, 0.112, 0.116, 0, { [H]: 0.6, [SP]: 0.4 }),
    k(1.13, 0.166, 0.113, 0.112, 0, { [SP]: 1 }),
    k(1.22, 0.172, 0.122, 0.112, 0.004, { [SP]: 0.6, [CH]: 0.4 }),
    k(1.31, 0.184, 0.128, 0.113, 0.006, { [CH]: 1 }),
    k(1.38, 0.198, 0.12, 0.11, 0.003, { [CH]: 1 }),
    k(1.425, 0.212, 0.106, 0.102, 0, { [CH]: 1 }, { pf: 2.7, pb: 2.7 }),
    k(1.455, 0.186, 0.092, 0.088, 0, { [CH]: 1 }, { pf: 2.6, pb: 2.6 }),
    k(1.472, 0.13, 0.078, 0.076, 0.001, { [CH]: 0.9, [NK]: 0.1 }),
    k(1.483, 0.09, 0.068, 0.068, 0.002, { [CH]: 0.8, [NK]: 0.2 }),
    k(1.503, 0.068, 0.066, 0.066, 0.004, { [CH]: 0.6, [NK]: 0.4 }, { lin: true }),
    // cuello (piel)
    k(1.496, 0.059, 0.057, 0.059, 0.004, { [CH]: 0.6, [NK]: 0.4 }, { mat: MAT.skin }),
    k(1.53, 0.057, 0.054, 0.059, 0.006, { [NK]: 1 }),
    k(1.562, 0.058, 0.058, 0.061, 0.01, { [NK]: 0.5, [HD]: 0.5 }),
    // cabeza
    k(1.576, 0.062, 0.07, 0.064, 0.016, { [HD]: 1 }),
    k(1.594, 0.069, 0.085, 0.07, 0.012, { [HD]: 1 }),
    k(1.61, 0.074, 0.088, 0.077, 0.008, { [HD]: 1 }),
    k(1.635, 0.0775, 0.09, 0.086, 0.004, { [HD]: 1 }),
    k(1.665, 0.0785, 0.092, 0.097, 0, { [HD]: 1 }),
    k(1.7, 0.077, 0.093, 0.102, 0, { [HD]: 1 }),
    k(1.73, 0.078, 0.089, 0.104, 0, { [HD]: 1 }),
    k(1.76, 0.072, 0.077, 0.097, 0, { [HD]: 1 }),
    k(1.785, 0.057, 0.058, 0.075, 0, { [HD]: 1 }),
    k(1.8, 0.032, 0.032, 0.042, 0, { [HD]: 1 }),
    k(1.806, 0.004, 0.004, 0.005, 0, { [HD]: 1 }),
  ];
}

/** Superficie de la cabeza (sin nariz) a la altura y y ángulo th (th=π/2 → frente). */
function headSurface(th: number, y: number, out: THREE.Vector3) {
  const keys = torsoKeys();
  const d = y - 0.8;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].d < d) i++;
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const t = Math.min(1, Math.max(0, (d - k1.d) / Math.max(1e-6, k2.d - k1.d)));
  const r = interpRing(keys, i, t, !k1.lin);
  const s = Math.sin(th);
  const cx = spow(Math.cos(th), s >= 0 ? r.pf : r.pb);
  const sy = spow(s, s >= 0 ? r.pf : r.pb);
  return out.set(r.rs * cx, y, r.cf + (s >= 0 ? r.rf : r.rb) * sy);
}

function noseDisplace(th: number, p: THREE.Vector3) {
  if (p.y < 1.62 || p.y > 1.72) return 0;
  let dth = th - Math.PI / 2;
  const ang = Math.exp(-((dth / 0.15) ** 2));
  if (ang < 0.01) return 0;
  // perfil vertical: punta en ~1.655, puente hasta 1.705
  const y = p.y;
  let h = 0;
  if (y < 1.655) h = 0.021 * Math.max(0, 1 - ((1.655 - y) / 0.017) ** 2);
  else h = 0.021 * (1 - (y - 1.655) / 0.052) ** 1.25;
  h = Math.max(0, h);
  // ligera depresión de las cuencas
  dth = Math.abs(dth);
  const socket = y > 1.68 && y < 1.71 && dth > 0.25 && dth < 0.75 ? -0.004 * Math.sin(((dth - 0.25) / 0.5) * Math.PI) * Math.sin(((y - 1.68) / 0.03) * Math.PI) : 0;
  return h * ang + socket;
}

function shirtUV(u: number, p: THREE.Vector3): [number, number] {
  const vt = Math.min(1, Math.max(0, (p.y - SHIRT_Y0) / (SHIRT_Y1 - SHIRT_Y0)));
  return [u, SHIRT_TORSO_V0 + (1 - SHIRT_TORSO_V0) * vt];
}

function buildTorso(b: Builder, q: Quality) {
  sweep(b, {
    path: [V(0, 0.8, 0), V(0, 1.9, 0)],
    ref: FWD,
    keys: torsoKeys(),
    segments: q.segBody,
    flipU: true,
    displace: noseDisplace,
    weights: (p, w) => {
      const f = 0.65 * smooth(0.12, 0.2, Math.abs(p.x)) * smooth(1.33, 1.4, p.y) * (1 - smooth(1.47, 1.5, p.y));
      if (f <= 0) return w;
      const out: W = {};
      for (const [k, v] of Object.entries(w)) out[+k] = (v ?? 0) * (1 - f);
      const cl = p.x > 0 ? BONE.clavL : BONE.clavR;
      out[cl] = (out[cl] ?? 0) + f;
      return out;
    },
    uv: (u, p, _d, mat) => {
      if (mat === MAT.shirt) return shirtUV(u, p);
      if (mat === MAT.shorts) return [u, 0.5 + 0.5 * Math.min(1, Math.max(0, (p.y - SHORTS_PELVIS_Y0) / (SHORTS_PELVIS_Y1 - SHORTS_PELVIS_Y0)))];
      return [u, 0.5];
    },
  }, q);
}

// Brazo izquierdo (se refleja para el derecho)
const SHOULDER = V(0.18, 1.44, -0.01);
const ELBOW = V(0.195, 1.155, -0.015);
const WRIST = V(0.203, 0.9, -0.005);

function buildArmL(b: Builder, q: Quality, gk: boolean) {
  const top = SHOULDER.clone().add(V(-0.03, 0.022, 0));
  const dTop = top.distanceTo(SHOULDER);
  const dEl = dTop + SHOULDER.distanceTo(ELBOW);
  const dWr = dEl + ELBOW.distanceTo(WRIST);
  const CL = BONE.clavL;
  const UA = BONE.uarmL;
  const FA = BONE.farmL;
  const HA = BONE.handL;
  const keys: Key[] = [
    { d: 0, rs: 0.02, rf: 0.02, w: { [CL]: 0.5, [UA]: 0.5 }, mat: MAT.shirt },
    { d: 0.02, rs: 0.042, rf: 0.046, w: { [CL]: 0.3, [UA]: 0.7 } },
    { d: 0.06, rs: 0.053, rf: 0.055, w: { [UA]: 1 } },
  ];
  if (!gk) {
    keys.push(
      { d: 0.15, rs: 0.054, rf: 0.055, w: { [UA]: 1 } },
      { d: 0.2, rs: 0.055, rf: 0.056, w: { [UA]: 1 }, lin: true },
      { d: 0.205, rs: 0.054, rf: 0.055, w: { [UA]: 1 }, lin: true },
      { d: 0.2, rs: 0.044, rf: 0.044, w: { [UA]: 1 }, lin: true },
      { d: 0.2, rs: 0.044, rf: 0.044, w: { [UA]: 1 }, mat: MAT.skin },
      { d: 0.26, rs: 0.042, rf: 0.043, w: { [UA]: 1 } },
      { d: dEl - 0.04, rs: 0.036, rf: 0.037, w: { [UA]: 0.85, [FA]: 0.15 } },
      { d: dEl, rs: 0.034, rf: 0.035, rb: 0.033, w: { [UA]: 0.5, [FA]: 0.5 } },
      { d: dEl + 0.05, rs: 0.039, rf: 0.042, w: { [UA]: 0.1, [FA]: 0.9 } },
      { d: dEl + 0.13, rs: 0.032, rf: 0.032, w: { [FA]: 1 } },
      { d: dWr - 0.015, rs: 0.024, rf: 0.028, w: { [FA]: 0.75, [HA]: 0.25 } },
      { d: dWr + 0.005, rs: 0.02, rf: 0.024, w: { [FA]: 0.4, [HA]: 0.6 } },
      { d: dWr + 0.015, rs: 0.006, rf: 0.008, w: { [HA]: 1 } },
    );
  } else {
    keys.push(
      { d: 0.15, rs: 0.054, rf: 0.056, w: { [UA]: 1 } },
      { d: dEl - 0.04, rs: 0.048, rf: 0.049, w: { [UA]: 0.85, [FA]: 0.15 } },
      { d: dEl, rs: 0.045, rf: 0.046, w: { [UA]: 0.5, [FA]: 0.5 } },
      { d: dEl + 0.06, rs: 0.046, rf: 0.048, w: { [UA]: 0.1, [FA]: 0.9 } },
      { d: dWr - 0.04, rs: 0.038, rf: 0.04, w: { [FA]: 1 } },
      { d: dWr - 0.03, rs: 0.035, rf: 0.037, w: { [FA]: 1 }, lin: true },
      { d: dWr - 0.035, rs: 0.026, rf: 0.03, w: { [FA]: 1 }, mat: MAT.gloves },
      { d: dWr - 0.035, rs: 0.026, rf: 0.03, w: { [FA]: 1 } },
      { d: dWr - 0.005, rs: 0.036, rf: 0.04, w: { [FA]: 0.5, [HA]: 0.5 } },
      { d: dWr + 0.01, rs: 0.006, rf: 0.008, w: { [HA]: 1 } },
    );
  }
  const sleeveEnd = gk ? dWr : 0.205;
  sweep(b, {
    path: [top, SHOULDER, ELBOW, WRIST, WRIST.clone().add(V(0.002, -0.1, 0.003))],
    ref: FWD,
    keys,
    segments: q.segLimb,
    flipU: false,
    uv: (u, _p, d, mat) => {
      if (mat === MAT.shirt) return [u, SHIRT_TORSO_V0 * (1 - Math.min(1, d / sleeveEnd)) * 0.98 + 0.002];
      return [u, 0.5];
    },
  }, q);
}

function buildHandL(b: Builder, q: Quality, gk: boolean) {
  const HA = BONE.handL;
  const s = gk ? 1.12 : 0.92;
  const wr = WRIST.clone();
  const tip = wr.clone().add(V(0.005, -0.185 * (gk ? 1.08 : 1), 0.012));
  const keys: Key[] = [
    { d: -0.005, rs: 0.015 * s, rf: 0.02 * s, w: { [HA]: 1 }, mat: gk ? MAT.gloves : MAT.skin },
    { d: 0.01, rs: 0.019 * s, rf: 0.029 * s, w: { [HA]: 1 } },
    { d: 0.05, rs: 0.017 * s, rf: 0.041 * s, cs: 0.0, w: { [HA]: 1 } },
    { d: 0.095, rs: 0.016 * s, rf: 0.044 * s, cs: 0.003, w: { [HA]: 1 } },
    { d: 0.135, rs: 0.013 * s, rf: 0.039 * s, cs: 0.008, w: { [HA]: 1 } },
    { d: 0.17, rs: 0.01 * s, rf: 0.03 * s, cs: 0.014, w: { [HA]: 1 } },
    { d: 0.188 * (gk ? 1.08 : 1), rs: 0.004, rf: 0.012, cs: 0.017, w: { [HA]: 1 } },
  ];
  sweep(b, { path: [wr, tip], ref: FWD, keys, segments: q.segSmall + (q.segSmall <= 4 ? 0 : 4), flipU: false, uv: () => [0.5, 0.5] }, q);
  if (q.segSmall <= 4) return;
  // pulgar
  const th0 = wr.clone().add(V(-0.008, -0.03, 0.022 * s));
  const th1 = th0.clone().add(V(-0.012, -0.05, 0.03 * s));
  const th2 = th1.clone().add(V(-0.012, -0.03, 0.005));
  sweep(b, {
    path: [th0, th1, th2],
    ref: V(1, 0, 0),
    keys: [
      { d: 0, rs: 0.012 * s, rf: 0.012 * s, w: { [HA]: 1 }, mat: gk ? MAT.gloves : MAT.skin },
      { d: 0.02, rs: 0.013 * s, rf: 0.012 * s, w: { [HA]: 1 } },
      { d: 0.07, rs: 0.009 * s, rf: 0.0085 * s, w: { [HA]: 1 } },
      { d: th0.distanceTo(th1) + th1.distanceTo(th2) - 0.002, rs: 0.003, rf: 0.003, w: { [HA]: 1 } },
    ],
    segments: q.segSmall,
    flipU: false,
    uv: () => [0.5, 0.5],
  }, q);
}

const HIP = V(0.092, 0.92, 0);
const KNEE = V(0.092, 0.49, 0.0);
const ANKLE = V(0.092, 0.075, 0);

function buildLegL(b: Builder, q: Quality) {
  const top = V(0.088, 1.0, 0);
  const dHip = top.distanceTo(HIP);
  const dKn = dHip + HIP.distanceTo(KNEE);
  const TH = BONE.thighL;
  const SH = BONE.shinL;
  const FT = BONE.footL;
  const d = (y: number) => dKn + (0.49 - y) * (y < 0.49 ? 1 : 1) + (y >= 0.49 ? 0 : 0);
  const dy = (y: number) => (y >= 0.49 ? dHip + (0.92 - y) : d(y));
  const keys: Key[] = [
    { d: 0, rs: 0.035, rf: 0.035, w: { [H]: 0.6, [TH]: 0.4 }, mat: MAT.shorts },
    { d: 0.035, rs: 0.085, rf: 0.085, rb: 0.09, w: { [H]: 0.45, [TH]: 0.55 } },
    { d: dy(0.88), rs: 0.096, rf: 0.096, rb: 0.103, w: { [H]: 0.2, [TH]: 0.8 } },
    { d: dy(0.8), rs: 0.098, rf: 0.098, rb: 0.1, w: { [TH]: 1 } },
    { d: dy(0.74), rs: 0.099, rf: 0.099, rb: 0.099, w: { [TH]: 1 }, lin: true },
    { d: dy(0.733), rs: 0.098, rf: 0.098, rb: 0.098, w: { [TH]: 1 }, lin: true },
    { d: dy(0.742), rs: 0.077, rf: 0.079, rb: 0.077, w: { [TH]: 1 }, lin: true },
    // piel: muslo y rodilla
    { d: dy(0.742), rs: 0.077, rf: 0.079, rb: 0.077, w: { [TH]: 1 }, mat: MAT.skin },
    { d: dy(0.66), rs: 0.069, rf: 0.072, rb: 0.067, w: { [TH]: 1 } },
    { d: dy(0.56), rs: 0.055, rf: 0.058, rb: 0.052, w: { [TH]: 0.92, [SH]: 0.08 } },
    { d: dy(0.5), rs: 0.05, rf: 0.056, rb: 0.048, w: { [TH]: 0.55, [SH]: 0.45 } },
    { d: dy(0.475), rs: 0.049, rf: 0.054, rb: 0.049, w: { [TH]: 0.3, [SH]: 0.7 }, lin: true },
    // medias con espinillera
    { d: dy(0.475), rs: 0.049, rf: 0.054, rb: 0.049, w: { [TH]: 0.3, [SH]: 0.7 }, mat: MAT.socks, lin: true },
    { d: dy(0.469), rs: 0.055, rf: 0.059, rb: 0.056, w: { [TH]: 0.2, [SH]: 0.8 } },
    { d: dy(0.44), rs: 0.055, rf: 0.058, rb: 0.058, w: { [TH]: 0.05, [SH]: 0.95 } },
    { d: dy(0.36), rs: 0.054, rf: 0.054, rb: 0.064, w: { [SH]: 1 } },
    { d: dy(0.26), rs: 0.045, rf: 0.046, rb: 0.048, w: { [SH]: 1 } },
    { d: dy(0.16), rs: 0.034, rf: 0.036, rb: 0.035, w: { [SH]: 1 } },
    { d: dy(0.11), rs: 0.032, rf: 0.034, rb: 0.036, w: { [SH]: 0.6, [FT]: 0.4 } },
    { d: dy(0.07), rs: 0.03, rf: 0.032, rb: 0.034, w: { [SH]: 0.2, [FT]: 0.8 } },
    { d: dy(0.055), rs: 0.01, rf: 0.01, rb: 0.01, w: { [FT]: 1 } },
  ];
  sweep(b, {
    path: [top, HIP, KNEE, ANKLE, V(0.092, -0.05, 0)],
    ref: FWD,
    keys,
    segments: q.segLimb,
    flipU: false,
    uv: (u, p, _d, mat) => {
      if (mat === MAT.shorts) return [u * 0.5, 0.5 * Math.min(1, Math.max(0, (p.y - SHORTS_LEG_Y0) / (SHORTS_LEG_Y1 - SHORTS_LEG_Y0)))];
      if (mat === MAT.socks) return [u, Math.min(1, Math.max(0, (p.y - SOCK_Y0) / (SOCK_Y1 - SOCK_Y0)))];
      return [u, 0.5];
    },
  }, q);
}

function buildBootL(b: Builder, q: Quality) {
  const FT = BONE.footL;
  const TO = BONE.toeL;
  const x = 0.092;
  const z0 = -0.072;
  const kk = (z: number, cf: number, rs: number, top: number, w: W, cs = 0, extra: Partial<Key> = {}): Key => ({
    d: z - z0, cf, rs, rf: top - cf, rb: cf, cs, pf: 2.3, pb: 5, w, ...extra,
  });
  const keys: Key[] = [
    kk(-0.072, 0.045, 0.012, 0.075, { [FT]: 1 }, 0, { mat: MAT.boots }),
    kk(-0.064, 0.05, 0.03, 0.098, { [FT]: 1 }),
    kk(-0.045, 0.055, 0.041, 0.12, { [FT]: 1 }),
    kk(-0.01, 0.058, 0.044, 0.128, { [FT]: 1 }),
    kk(0.03, 0.045, 0.046, 0.098, { [FT]: 1 }, 0.002),
    kk(0.075, 0.034, 0.049, 0.072, { [FT]: 1 }, 0.004),
    kk(0.115, 0.028, 0.05, 0.058, { [FT]: 0.5, [TO]: 0.5 }, 0.004),
    kk(0.155, 0.025, 0.045, 0.05, { [TO]: 1 }, 0.002),
    kk(0.185, 0.022, 0.035, 0.044, { [TO]: 1 }, -0.002),
    kk(0.2, 0.02, 0.022, 0.038, { [TO]: 1 }, -0.004),
    kk(0.206, 0.018, 0.004, 0.022, { [TO]: 1 }, -0.005),
  ];
  // el lado "s" del barrido apunta a -X (Z × Y); cs positivo → hacia -X (interior del pie izquierdo)
  sweep(b, {
    path: [V(x, 0, z0), V(x, 0, 0.3)],
    ref: UP,
    keys,
    segments: q.segLimb,
    flipU: false,
    uv: () => [0.5, 0.5],
  }, q);
}

function buildHeadDetailsL(b: Builder, q: Quality) {
  const seg = q.segSmall;
  const hw = { [HD]: 1 };
  // oreja
  const earC = V(0.077, 1.672, -0.008);
  blob(b, earC.clone().add(V(0, 0.032, -0.006)), earC.clone().add(V(0.002, -0.03, 0.004)), V(0.3, 0, 1).normalize(), 0.011, 0.02, hw, MAT.skin, seg, q,
    (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (1 - 0.35 * t));
  // ojo (sobre la superficie de la cara)
  const ex = 0.031;
  const ey = 1.693;
  const s = new THREE.Vector3();
  let th = Math.acos(Math.min(1, ex / 0.077));
  headSurface(th, ey, s);
  // ajustar th para que x coincida
  for (let i = 0; i < 4; i++) {
    th += (s.x - ex) / 0.08;
    headSurface(th, ey, s);
  }
  const eyeZ = s.z - 0.006;
  blob(b, V(ex, ey, eyeZ - 0.006), V(ex, ey, eyeZ + 0.007), UP, 0.0115, 0.0068, hw, MAT.dark, seg, q);
  if (q.segSmall <= 4) return;
  // ceja
  const by = 1.709;
  const b0 = new THREE.Vector3();
  const b1 = new THREE.Vector3();
  headSurface(Math.PI / 2 - 0.18, by, b0);
  headSurface(Math.PI / 2 - 0.62, by + 0.002, b1);
  b0.z -= 0.0015;
  b1.z -= 0.0025;
  blob(b, b0, b1, V(0, 0.3, 1).normalize(), 0.0035, 0.004, hw, MAT.dark, Math.max(4, seg - 2), q, (t) => 0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
  // media boca (desde el centro hacia la comisura; el reflejo completa la otra mitad)
  const my = 1.622;
  const m0 = new THREE.Vector3();
  const m1 = new THREE.Vector3();
  headSurface(Math.PI / 2, my, m0);
  headSurface(Math.PI / 2 - 0.3, my + 0.002, m1);
  m0.x = -0.004;
  m0.z -= 0.0025;
  m1.z -= 0.003;
  blob(b, m0, m1, V(0, 0.2, 1).normalize(), 0.0032, 0.004, hw, MAT.dark, 4, q, (t) => 1 - 0.6 * t * t);
}

// ---------------------------------------------------------------------------------------------
const BONE_MIRROR_MAP = (bIdx: number) => {
  const map: Record<number, number> = {
    [BONE.clavL]: BONE.clavR, [BONE.uarmL]: BONE.uarmR, [BONE.farmL]: BONE.farmR, [BONE.handL]: BONE.handR,
    [BONE.thighL]: BONE.thighR, [BONE.shinL]: BONE.shinR, [BONE.footL]: BONE.footR, [BONE.toeL]: BONE.toeR,
  };
  return map[bIdx] ?? bIdx;
};

function finalize(b: Builder): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(b.sw, 4));
  const all: number[] = [];
  for (let m = 0; m < MAT_COUNT; m++) {
    const start = all.length;
    for (const i of b.idx[m]) all.push(i);
    if (all.length > start) g.addGroup(start, all.length - start, m);
  }
  g.setIndex(all);
  g.computeVertexNormals();
  smoothCoincidentNormals(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Promedia normales de vértices coincidentes (costuras de u, polos, cambios de material). */
function smoothCoincidentNormals(g: THREE.BufferGeometry) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const map = new Map<string, number[]>();
  const qz = (v: number) => Math.round(v * 2e4);
  for (let i = 0; i < pos.count; i++) {
    const k = `${qz(pos.getX(i))},${qz(pos.getY(i))},${qz(pos.getZ(i))}`;
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push(i);
  }
  const n = new THREE.Vector3();
  const m = new THREE.Vector3();
  for (const list of map.values()) {
    if (list.length < 2) continue;
    // agrupar por similitud con el primero (evita suavizar pliegues)
    n.set(0, 0, 0);
    const ref = new THREE.Vector3(nor.getX(list[0]), nor.getY(list[0]), nor.getZ(list[0]));
    const members: number[] = [];
    for (const i of list) {
      m.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (m.dot(ref) > -0.2 || list.length > 4) {
        n.add(m);
        members.push(i);
      }
    }
    if (n.lengthSq() < 1e-10) continue;
    n.normalize();
    for (const i of members) nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
}

const bodyCache = new Map<string, THREE.BufferGeometry>();

export function getBodyGeometry(quality: ModelQualityLike, gk: boolean): THREE.BufferGeometry {
  const key = `${quality}|${gk ? 1 : 0}`;
  const hit = bodyCache.get(key);
  if (hit) return hit;
  const q = QUALITY[quality];
  const main = new Builder();
  buildTorso(main, q);
  const left = new Builder();
  buildArmL(left, q, gk);
  buildHandL(left, q, gk);
  buildLegL(left, q);
  buildBootL(left, q);
  buildHeadDetailsL(left, q);
  main.append(left, false);
  main.append(left, true, BONE_MIRROR_MAP, (u, v, mat) => (mat === MAT.shorts && v < 0.5 ? [u + 0.5, v] : [u, v]));
  const g = finalize(main);
  bodyCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Pelo: capa sobre el cráneo (en coordenadas locales del hueso de la cabeza) + extras por estilo.
export const HEAD_BONE_Y = 1.57;
const hairCache = new Map<string, THREE.BufferGeometry>();

function hairline(th: number, style: number) {
  const s = Math.sin(th);
  const front = style === 2 ? 1.738 : 1.745;
  const side = style === 2 ? 1.69 : style === 3 ? 1.69 : 1.7;
  const back = style === 3 ? 1.6 : style === 2 ? 1.615 : 1.625;
  if (s >= 0) return side + (front - side) * Math.pow(s, 1.6);
  return side + (back - side) * Math.pow(-s, 1.1);
}

function hairThickness(th: number, r: number, style: number) {
  const s = Math.sin(th);
  switch (style) {
    case 1: // rapado
      return 0.0035;
    case 2: { // rizado con volumen
      const base = 0.03 + 0.018 * (1 - r) + (s > 0 ? -0.004 : 0.004);
      const bumps = (0.006 * Math.sin(th * 9 + r * 11) * Math.sin(r * 13 + th * 3) + 0.004 * Math.sin(th * 17 - r * 7)) * smooth(0, 0.3, r);
      return base + bumps;
    }
    case 3: // recogido (coleta)
      return 0.009 + 0.004 * (1 - r);
    default: // corto
      return 0.006 + 0.016 * Math.pow(1 - r, 1.5) * (s > 0 ? 1.15 : 0.85);
  }
}

export function getHairGeometry(style: number, quality: ModelQualityLike): THREE.BufferGeometry {
  style = ((Math.floor(style) % 4) + 4) % 4;
  const key = `${style}|${quality}`;
  const hit = hairCache.get(key);
  if (hit) return hit;
  const q = QUALITY[quality];
  const seg = q.segHair;
  const rows = q.hairRows;
  const C = V(0, 1.685, -0.008);
  const pos: number[] = [];
  const idx: number[] = [];
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  const topY = 1.806;
  for (let i = 0; i <= rows; i++) {
    const r = i / rows;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const hl = hairline(th, style);
      // filas más densas cerca de la línea del pelo
      const rr = 1 - (1 - r) * (1 - r) * 0.5 - (1 - r) * 0.5;
      const y = topY + (hl - topY) * (0.25 * r + 0.75 * rr);
      if (i === 0) S.set(0, topY, 0);
      else headSurface(th, y, S);
      const taper = 1 - smooth(style === 2 ? 0.7 : 0.5, 1.0, r) * 0.93;
      const t = (i === 0 ? hairThickness(0, 0, style) : hairThickness(th, r, style)) * taper + 0.0012;
      P.subVectors(S, C);
      const len = P.length();
      P.multiplyScalar((len + t) / len).add(C);
      pos.push(P.x, P.y - HEAD_BONE_Y, P.z);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const c = a + seg + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const g = new THREE.BufferGeometry();
  // comprobación de orientación (normal hacia fuera)
  const p0 = new THREE.Vector3().fromArray(pos, idx[3 * Math.floor(idx.length / 6)] * 3);
  {
    const t0 = 3 * Math.floor(idx.length / 6);
    const a = new THREE.Vector3().fromArray(pos, idx[t0] * 3);
    const bb = new THREE.Vector3().fromArray(pos, idx[t0 + 1] * 3);
    const c = new THREE.Vector3().fromArray(pos, idx[t0 + 2] * 3);
    const nrm = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(c, a));
    const out = p0.clone().sub(V(C.x, C.y - HEAD_BONE_Y, C.z));
    if (nrm.dot(out) < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  }
  const extraPos: number[] = [];
  const extraIdx: number[] = [];
  if (style === 3) {
    // coleta: tubo desde la nuca
    const path = [V(0, 1.715, -0.1), V(0, 1.665, -0.125), V(0, 1.59, -0.14), V(0, 1.5, -0.13)];
    const b = new Builder();
    const len = path[0].distanceTo(path[1]) + path[1].distanceTo(path[2]) + path[2].distanceTo(path[3]);
    sweep(b, {
      path,
      ref: V(0, 0, -1),
      keys: [
        { d: 0, rs: 0.025, rf: 0.02, w: { 0: 1 }, mat: 0 },
        { d: 0.03, rs: 0.024, rf: 0.022, w: { 0: 1 } },
        { d: 0.06, rs: 0.017, rf: 0.016, w: { 0: 1 } },
        { d: 0.08, rs: 0.024, rf: 0.022, w: { 0: 1 } },
        { d: len * 0.6, rs: 0.026, rf: 0.022, w: { 0: 1 } },
        { d: len - 0.01, rs: 0.006, rf: 0.006, w: { 0: 1 } },
        { d: len, rs: 0.001, rf: 0.001, w: { 0: 1 } },
      ],
      segments: Math.max(8, q.segLimb - 4),
      flipU: false,
      uv: () => [0, 0],
    }, q);
    for (let i = 0; i < b.pos.length; i += 3) extraPos.push(b.pos[i], b.pos[i + 1] - HEAD_BONE_Y, b.pos[i + 2]);
    const base = pos.length / 3;
    for (const i of b.idx[0]) extraIdx.push(i + base);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pos, ...extraPos], 3));
  g.setIndex([...idx, ...extraIdx]);
  g.computeVertexNormals();
  smoothCoincidentNormals(g);
  g.computeBoundingSphere();
  hairCache.set(key, g);
  return g;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clearGeometryCache() {
  for (const g of bodyCache.values()) g.dispose();
  for (const g of hairCache.values()) g.dispose();
  bodyCache.clear();
  hairCache.clear();
}
