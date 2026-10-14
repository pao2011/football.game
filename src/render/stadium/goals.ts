import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALF_LENGTH, HALF_WIDTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, GOAL_DEPTH, GOAL_DEPTH_TOP, POST_RADIUS } from '../../config/constants';
import { prep } from './layout';
import { makeNetTexture, NET_TILE_W, NET_TILE_H } from './textures';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Cylinder between two points. */
export function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.ColorRepresentation, segs = 12): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, segs, 1, false);
  const dir = tmpA.subVectors(b, a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  g.applyQuaternion(q);
  const mid = tmpB.addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return prep(g, color);
}

/** Goal frames (posts, crossbar, supports) for both goals + corner flag poles, merged. */
export function buildGoalFrames(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = POST_RADIUS;
  const hw = GOAL_HALF_WIDTH + r; // post centre
  const H = GOAL_HEIGHT;
  const white = 0xf7f7f7;
  const support = 0xc9ccd1;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const s of [-1, 1]) {
    const gx = s * HALF_LENGTH;
    const X = (e: number) => gx + s * e; // e = depth behind goal line
    for (const t of [-1, 1]) {
      parts.push(tube(V(gx, 0, t * hw), V(gx, H + 2 * r, t * hw), r, white, 16));
    }
    parts.push(tube(V(gx, H + r, -hw - r), V(gx, H + r, hw + r), r, white, 16));
    const sr = 0.024;
    const nb = hw; // net/support line
    for (const t of [-1, 1]) {
      const z = t * nb;
      parts.push(tube(V(X(r), H + r * 0.5, z), V(X(GOAL_DEPTH_TOP), H, z), sr, support, 6));
      parts.push(tube(V(X(GOAL_DEPTH_TOP), H, z), V(X(GOAL_DEPTH), 0.02, z), sr, support, 6));
      parts.push(tube(V(X(r), 0.02, z), V(X(GOAL_DEPTH), 0.02, z), sr, support, 6));
    }
    parts.push(tube(V(X(GOAL_DEPTH_TOP), H, -nb), V(X(GOAL_DEPTH_TOP), H, nb), sr, support, 6));
    parts.push(tube(V(X(GOAL_DEPTH), 0.02, -nb), V(X(GOAL_DEPTH), 0.02, nb), sr, support, 6));
  }
  // corner flag poles (white / yellow bands)
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const x = s * HALF_LENGTH;
      const z = t * HALF_WIDTH;
      for (let i = 0; i < 5; i++) {
        parts.push(tube(V(x, i * 0.3, z), V(x, (i + 1) * 0.3, z), 0.018, i % 2 ? 0xf2f2f2 : 0xffcc00, 6));
      }
    }
  }
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

// ---------------------------------------------------------------------------------------------
// Corner flags (animated cloth)
// ---------------------------------------------------------------------------------------------
export class CornerFlags {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;
  private geo: THREE.BufferGeometry;
  private cols = 6;
  private rows = 3;
  private flagCount = 4;
  constructor() {
    const parts: THREE.BufferGeometry[] = [];
    const W = 0.45;
    const Hh = 0.32;
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const g = new THREE.PlaneGeometry(W, Hh, this.cols, this.rows);
        g.translate(W / 2, 1.5 - Hh / 2, 0);
        // point the flag away from the pitch diagonally
        g.rotateY(Math.atan2(-t, s));
        g.translate(s * HALF_LENGTH, 0, t * HALF_WIDTH);
        parts.push(g);
      }
    }
    this.geo = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    this.base = (this.geo.getAttribute('position').array as Float32Array).slice();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd21a, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x332200 });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true;
    this.mesh.name = 'corner-flags';
  }
  update(time: number) {
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const b = this.base;
    const per = (this.cols + 1) * (this.rows + 1);
    for (let f = 0; f < this.flagCount; f++) {
      for (let j = 0; j <= this.rows; j++) {
        for (let i = 0; i <= this.cols; i++) {
          const k = f * per + j * (this.cols + 1) + i;
          const u = i / this.cols;
          const w = Math.sin(time * 5.5 - u * 4 + f * 1.7) * 0.06 * u + Math.sin(time * 9 + u * 7) * 0.012 * u;
          a[k * 3] = b[k * 3] + w * 0.6;
          a[k * 3 + 1] = b[k * 3 + 1] - u * u * 0.03;
          a[k * 3 + 2] = b[k * 3 + 2] + w;
        }
      }
    }
    pos.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Nets with impact bulges
// ---------------------------------------------------------------------------------------------
interface Impact {
  p: THREE.Vector3;
  amp: number;
  sigma: number;
  t: number;
}

interface NetData {
  mesh: THREE.Mesh;
  base: Float32Array;
  dir: Float32Array;
  pin: Float32Array;
  impacts: Impact[];
  dirty: boolean;
}

export class GoalNets {
  readonly meshes: THREE.Mesh[] = [];
  readonly texture: THREE.Texture;
  private nets: NetData[] = [];
  private material: THREE.MeshLambertMaterial;

  constructor() {
    this.texture = makeNetTexture();
    this.texture.anisotropy = 8;
    this.material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: this.texture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      alphaTest: 0.02,
    });
    for (const s of [-1, 1] as const) {
      const net = this.buildNet(s);
      this.nets.push(net);
      this.meshes.push(net.mesh);
    }
  }

  private buildNet(s: -1 | 1): NetData {
    const pos: number[] = [];
    const uv: number[] = [];
    const dir: number[] = [];
    const pin: number[] = [];
    const idx: number[] = [];
    const H = GOAL_HEIGHT;
    const hw = GOAL_HALF_WIDTH + POST_RADIUS;
    const r = POST_RADIUS;
    const gx = s * HALF_LENGTH;
    const X = (e: number) => gx + s * e;
    const sag = 0.12;
    const addGrid = (nu: number, nv: number, f: (u: number, v: number) => { p: [number, number, number]; uv: [number, number]; d: [number, number, number]; w: number }) => {
      const start = pos.length / 3;
      for (let j = 0; j <= nv; j++) {
        for (let i = 0; i <= nu; i++) {
          const o = f(i / nu, j / nv);
          pos.push(...o.p);
          uv.push(...o.uv);
          dir.push(...o.d);
          pin.push(o.w);
        }
      }
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const a = start + j * (nu + 1) + i;
          const b = a + 1;
          const c = a + nu + 1;
          const d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
    };
    const backE = (v: number) => GOAL_DEPTH + (GOAL_DEPTH_TOP - GOAL_DEPTH) * v; // v = height fraction
    // back net: u across (z), v up
    addGrid(28, 12, (u, v) => {
      const z = -hw + 2 * hw * u;
      const y = H * v;
      const w = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.05));
      const e = backE(v) + sag * w * 0.8 + 0.05 * (1 - v) * (1 - v);
      return { p: [X(e), y, z], uv: [z / NET_TILE_W, y / NET_TILE_H], d: [s, 0.15, 0], w };
    });
    // roof net: u across, v depth
    addGrid(28, 7, (u, v) => {
      const z = -hw + 2 * hw * u;
      const e = r + (GOAL_DEPTH_TOP - r) * v;
      const w = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      const y = H + r * (1 - v) - sag * w;
      return { p: [X(e), y, z], uv: [z / NET_TILE_W, e / NET_TILE_H], d: [s * 0.4, 0.9, 0], w };
    });
    // side nets: u depth, v up
    for (const t of [-1, 1]) {
      addGrid(9, 12, (u, v) => {
        const y = H * v;
        const e = r + (backE(v) - r) * u;
        const w = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        const z = t * (hw + sag * 0.5 * w);
        return { p: [X(e), y, z], uv: [e / NET_TILE_W, y / NET_TILE_H], d: [0, 0, t], w };
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    (g.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.name = s < 0 ? 'net-west' : 'net-east';
    mesh.renderOrder = 2;
    return { mesh, base: new Float32Array(pos), dir: new Float32Array(dir), pin: new Float32Array(pin), impacts: [], dirty: false };
  }

  impact(side: -1 | 1, point: THREE.Vector3, strength: number) {
    const net = this.nets[side < 0 ? 0 : 1];
    const st = Math.max(0, Math.min(1, strength));
    if (st <= 0.001) return;
    if (net.impacts.length > 6) net.impacts.shift();
    net.impacts.push({ p: point.clone(), amp: 0.15 + 0.6 * st, sigma: 0.55 + 0.45 * st, t: 0 });
  }

  update(dt: number) {
    for (const net of this.nets) {
      if (net.impacts.length === 0 && !net.dirty) continue;
      for (const im of net.impacts) im.t += dt;
      net.impacts = net.impacts.filter((im) => im.t < 2.5);
      const pos = net.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      const b = net.base;
      const n = b.length / 3;
      if (net.impacts.length === 0) {
        a.set(b);
        net.dirty = false;
      } else {
        const amps = net.impacts.map((im) => {
          const t = im.t;
          return im.amp * (1 - Math.exp(-t * 28)) * Math.exp(-t * 3.0) * Math.cos(t * 8.5);
        });
        for (let i = 0; i < n; i++) {
          const bx = b[i * 3];
          const by = b[i * 3 + 1];
          const bz = b[i * 3 + 2];
          let disp = 0;
          for (let k = 0; k < net.impacts.length; k++) {
            const im = net.impacts[k];
            const dx = bx - im.p.x;
            const dy = by - im.p.y;
            const dz = bz - im.p.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            disp += amps[k] * Math.exp(-d2 / (2 * im.sigma * im.sigma));
          }
          disp *= net.pin[i];
          a[i * 3] = bx + net.dir[i * 3] * disp;
          a[i * 3 + 1] = by + net.dir[i * 3 + 1] * disp;
          a[i * 3 + 2] = bz + net.dir[i * 3 + 2] * disp;
        }
        net.dirty = true;
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    for (const n of this.nets) n.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
