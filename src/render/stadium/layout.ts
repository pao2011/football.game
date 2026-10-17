import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH } from '../../config/constants';

/**
 * Stadium layout. The bowl is built around a rounded rectangle whose inner face (d = 0)
 * has half extents STAND_A (x) / STAND_B (z) and corner radius STAND_R.
 * Every point of a stand is described by a perimeter sample (core point + outward normal)
 * plus a profile (d = distance behind the inner face, y = height).
 */
export const STAND_A = HALF_LENGTH + 8; // 60.5
export const STAND_B = HALF_WIDTH + 7; // 41
export const STAND_R = 10;
export const CORE_A = STAND_A - STAND_R;
export const CORE_B = STAND_B - STAND_R;

export const BOARD_X = HALF_LENGTH + 5; // ad boards behind the goal lines
export const BOARD_Z = HALF_WIDTH + 4; // ad boards along the touchlines
/** Dugouts / tunnel side (far side from a broadcast camera placed at +z). */
export const BENCH_SIDE = -1;

export const FACADE_D = 34;
export const ROOF_IN_D = 4;
export const ROOF = { inLong: 34, outLong: 40, inEnd: 27, outEnd: 33, thick: 1.2 };

export interface PSample {
  cx: number;
  cz: number;
  nx: number;
  nz: number;
  sec: number;
}

export type V3 = [number, number, number];
export type V2 = [number, number];

export function samplePoint(s: PSample, d: number): [number, number] {
  const r = STAND_R + d;
  return [s.cx + s.nx * r, s.cz + s.nz * r];
}

/** sec: 0 long +z, 1 corner, 2 end +x, 3 corner, 4 long -z, 5 corner, 6 end -x, 7 corner */
export function sectionSamples(sec: number, cornerSegs: number, straightSegs = 1): PSample[] {
  const a = CORE_A;
  const b = CORE_B;
  const out: PSample[] = [];
  if (sec % 2 === 0) {
    const defs = [
      [-a, b, a, b, 0, 1],
      [a, b, a, -b, 1, 0],
      [a, -b, -a, -b, 0, -1],
      [-a, -b, -a, b, -1, 0],
    ][sec / 2];
    for (let i = 0; i <= straightSegs; i++) {
      const t = i / straightSegs;
      out.push({ cx: defs[0] + (defs[2] - defs[0]) * t, cz: defs[1] + (defs[3] - defs[1]) * t, nx: defs[4], nz: defs[5], sec });
    }
  } else {
    const k = (sec - 1) / 2;
    const c = [
      [a, b],
      [a, -b],
      [-a, -b],
      [-a, b],
    ][k];
    const th0 = Math.PI / 2 - (k * Math.PI) / 2;
    for (let i = 0; i <= cornerSegs; i++) {
      const th = th0 - (i / cornerSegs) * (Math.PI / 2);
      out.push({ cx: c[0], cz: c[1], nx: Math.cos(th), nz: Math.sin(th), sec });
    }
  }
  return out;
}

/** Closed ring of samples around the whole bowl (last sample != first). */
export function ringSamples(cornerSegs: number, straightSegs = 1): PSample[] {
  const out: PSample[] = [];
  for (let sec = 0; sec < 8; sec++) {
    const s = sectionSamples(sec, cornerSegs, straightSegs);
    for (let i = sec === 0 ? 0 : 1; i < s.length; i++) out.push(s[i]);
  }
  out.pop(); // duplicate of the first sample
  return out;
}

// ---------------------------------------------------------------------------------------------
// Geometry builder (non-indexed triangles with position / normal / color / uv)
// ---------------------------------------------------------------------------------------------

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];

  tri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, color: THREE.Color, ua: V2 = [0, 0], ub: V2 = [0, 0], uc: V2 = [0, 0]) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const gx = e1y * e2z - e1z * e2y;
    const gy = e1z * e2x - e1x * e2z;
    const gz = e1x * e2y - e1y * e2x;
    const dot = gx * (na[0] + nb[0] + nc[0]) + gy * (na[1] + nb[1] + nc[1]) + gz * (na[2] + nb[2] + nc[2]);
    if (gx * gx + gy * gy + gz * gz < 1e-12) return; // degenerate
    if (dot < 0) {
      [b, c] = [c, b];
      [nb, nc] = [nc, nb];
      [ub, uc] = [uc, ub];
    }
    this.pos.push(...a, ...b, ...c);
    this.nor.push(...na, ...nb, ...nc);
    this.col.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
    this.uv.push(...ua, ...ub, ...uc);
  }

  /** Quad a-b-c-d (any winding; orientation fixed by normal). */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, color: THREE.Color, uvs?: [V2, V2, V2, V2]) {
    const u = uvs ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.tri(a, b, c, n, n, n, color, u[0], u[1], u[2]);
    this.tri(a, c, d, n, n, n, color, u[0], u[2], u[3]);
  }

  get empty() {
    return this.pos.length === 0;
  }

  geometry(opts: { color?: boolean; uv?: boolean } = { color: true }): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (opts.color !== false) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (opts.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/** Convert any built-in geometry to non-indexed position/normal/color (uv dropped). */
export function prep(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, keepUv = false): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (g !== ng) g.dispose();
  if (!keepUv && ng.getAttribute('uv')) ng.deleteAttribute('uv');
  if (!ng.getAttribute('normal')) ng.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = ng.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

// ---------------------------------------------------------------------------------------------
// Lofting a 2D profile (d, y) along perimeter samples
// ---------------------------------------------------------------------------------------------

export interface ProfPt {
  d: number;
  y: number;
  /** multiplier for the per-sample y offset (0 = fixed height) */
  o?: number;
}

export interface ProfSeg {
  a: ProfPt;
  b: ProfPt;
  color: THREE.Color;
}

export type YOff = (s: PSample) => number;

function profWorld(s: PSample, p: ProfPt, yOff?: YOff): V3 {
  const r = STAND_R + p.d;
  return [s.cx + s.nx * r, p.y + (p.o ?? 0) * (yOff ? yOff(s) : 0), s.cz + s.nz * r];
}

export function loftInto(gb: GeoBuilder, samples: PSample[], closed: boolean, segs: ProfSeg[], yOff?: YOff, uvLen = 1, colorAt?: (s: PSample, x: number, z: number, base: THREE.Color) => THREE.Color) {
  const n = samples.length;
  const count = closed ? n : n - 1;
  for (const seg of segs) {
    const dd = seg.b.d - seg.a.d;
    const dy = seg.b.y - seg.a.y;
    const len = Math.hypot(dd, dy) || 1;
    const Nd = -dy / len;
    const Ny = dd / len;
    let u = 0;
    for (let i = 0; i < count; i++) {
      const s0 = samples[i];
      const s1 = samples[(i + 1) % n];
      const a0 = profWorld(s0, seg.a, yOff);
      const b0 = profWorld(s0, seg.b, yOff);
      const a1 = profWorld(s1, seg.a, yOff);
      const b1 = profWorld(s1, seg.b, yOff);
      const n0: V3 = [s0.nx * Nd, Ny, s0.nz * Nd];
      const n1: V3 = [s1.nx * Nd, Ny, s1.nz * Nd];
      const l = Math.hypot(a1[0] - a0[0], a1[2] - a0[2]);
      const u0 = u;
      const u1 = u + l / uvLen;
      u = u1;
      const col = colorAt ? colorAt(s0, (a0[0] + a1[0]) / 2, (a0[2] + a1[2]) / 2, seg.color) : seg.color;
      gb.tri(a0, b0, a1, n0, n0, n1, col, [u0, 0], [u0, 1], [u1, 0]);
      gb.tri(a1, b0, b1, n1, n0, n1, col, [u1, 0], [u0, 1], [u1, 1]);
    }
  }
}

/** Closed polygon profile -> segments (color i belongs to segment pts[i] -> pts[i+1]). */
export function polySegs(pts: ProfPt[], colors: THREE.Color[]): ProfSeg[] {
  const segs: ProfSeg[] = [];
  for (let i = 0; i < pts.length; i++) {
    segs.push({ a: pts[i], b: pts[(i + 1) % pts.length], color: colors[i] });
  }
  return segs;
}

/** Double-sided end cap of a profile polygon placed at a sample. */
export function capInto(gb: GeoBuilder, s: PSample, pts: ProfPt[], color: THREE.Color, yOff?: YOff) {
  const contour = pts.map((p) => new THREE.Vector2(p.d, p.y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const t: V3 = [-s.nz, 0, s.nx];
  const tn: V3 = [s.nz, 0, -s.nx];
  for (const [i, j, k] of tris) {
    const a = profWorld(s, pts[i], yOff);
    const b = profWorld(s, pts[j], yOff);
    const c = profWorld(s, pts[k], yOff);
    gb.tri(a, b, c, t, t, t, color);
    gb.tri(a, b, c, tn, tn, tn, color);
  }
}

/** Walk along a sample polyline at depth d, emitting points every `spacing` metres. */
export function walk(
  samples: PSample[],
  closed: boolean,
  d: number,
  spacing: number,
  cb: (x: number, z: number, nx: number, nz: number, s: PSample, along: number) => void,
) {
  const n = samples.length;
  const count = closed ? n : n - 1;
  let carry = spacing * 0.5;
  let along = 0;
  for (let i = 0; i < count; i++) {
    const s0 = samples[i];
    const s1 = samples[(i + 1) % n];
    const [x0, z0] = samplePoint(s0, d);
    const [x1, z1] = samplePoint(s1, d);
    const l = Math.hypot(x1 - x0, z1 - z0);
    let t = carry;
    while (t <= l) {
      const f = l > 0 ? t / l : 0;
      let nx = s0.nx + (s1.nx - s0.nx) * f;
      let nz = s0.nz + (s1.nz - s0.nz) * f;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      cb(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, nx, nz, s0, along + t);
      t += spacing;
    }
    carry = t - l;
    along += l;
  }
}
