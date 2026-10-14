import * as THREE from 'three';
import { walk } from './layout';
import type { RowDef } from './stands';
import { makeCrowdAtlas, mulberry32, CROWD_COLS, CROWD_ROWS } from './textures';
import { patchStaticShadow, type StaticShadowUniforms } from './shadowPatch';

export interface CrowdOptions {
  maxCount: number;
  occupancy: number;
  homeColor: string;
  awayColor: string;
  seed: number;
  receiveShadow: boolean;
}

export interface CrowdBuild {
  meshes: THREE.InstancedMesh[];
  material: THREE.MeshLambertMaterial;
  atlas: THREE.Texture;
  uniforms: { uTime: { value: number }; uExcite: { value: number } };
  count: number;
  /** Muestra de asientos ocupados (para banderas, bengalas, papelitos…). n apunta hacia fuera del campo. */
  spots: FanSpot[];
}

export interface FanSpot {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  /** Hinchada visitante (fondo del visitante). */
  away: boolean;
  /** Barra brava local (fondo detrás del otro arco, gradas bajas). */
  barra: boolean;
  tier: number;
}

const NEUTRAL = ['#f2f2f2', '#1c1c1e', '#2b3a55', '#5a6270', '#8a1c1c', '#3b5e3b', '#d8c9a8', '#6d4c8a', '#c46a1f', '#9aa7b8', '#ffffff', '#2f2f35'];
const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#a86b47', '#7a4a2e', '#553522', '#f6d7bc'];
const DARK = ['#1d2433', '#14161a', '#2b3a55', '#3b2a1e', '#4a4d55', '#22252b', '#6b5a3a'];

export function buildCrowd(rows: RowDef[], o: CrowdOptions, su: StaticShadowUniforms): CrowdBuild {
  const rand = mulberry32(o.seed ^ 0x51ed27);
  // 1) count seats
  interface Seat {
    x: number;
    y: number;
    z: number;
    nx: number;
    nz: number;
    away: boolean;
    barra: boolean;
    tier: number;
  }
  const seats: Seat[][] = [[], [], [], []];
  const spacing = 0.56;
  for (const r of rows) {
    walk(r.samples, r.closed, r.d, spacing, (x, z, nx, nz) => {
      // aligned aisles (stairways) every ~13 m
      const along = Math.abs(nz) > 0.999 ? x : Math.abs(nx) > 0.999 ? z : Math.atan2(nz, nx) * 18;
      const am = ((along % 13) + 13) % 13;
      if (am < 1.15) return;
      const q = Math.abs(nz) >= Math.abs(nx) ? (nz > 0 ? 0 : 2) : nx > 0 ? 1 : 3;
      seats[q].push({ x, y: r.y, z, nx, nz, away: nx > 0.55 && r.tier < 2, barra: nx < -0.55 && r.tier < 2, tier: r.tier });
    });
  }
  const total = seats.reduce((a, s) => a + s.length, 0);
  const p = Math.min(o.occupancy, o.maxCount / Math.max(1, total));
  // when we can only afford a sparse crowd, make each billboard a bit wider to hide the gaps
  const widen = Math.min(1.45, Math.max(1, Math.sqrt(0.8 / Math.max(p, 0.05))));

  const atlas = makeCrowdAtlas();
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  const material = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.5, side: THREE.FrontSide });
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uExcite = uniforms.uExcite;
    patchStaticShadow(sh, su);
    sh.vertexShader =
      `uniform float uTime;
uniform float uExcite;
attribute vec3 aShirt;
attribute vec3 aSkin;
attribute vec3 aDark;
attribute vec4 aMisc;
varying vec3 vShirt;
varying vec3 vSkin;
varying vec3 vDark;
` +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float phase = aMisc.x;
          float energy = aMisc.z;
          float barra = step( 1.1, energy );
          float ex = clamp( max( uExcite * ( 0.35 + energy ), barra * 0.8 ), 0.0, 1.0 );
          // la barra salta casi a la vez, al ritmo del bombo (dos tiempos por salto)
          float t = mix( uTime * ( 5.0 + energy * 4.5 ) + phase * 6.2831, uTime * 7.48 + phase * 0.7, barra );
          float j = max( 0.0, sin( t ) );
          transformed.y += ex * ex * 0.42 * j * j;
          float h = position.y / 1.5;
          transformed.x += sin( uTime * 1.3 + phase * 17.0 ) * 0.035 * h * ( 0.4 + uExcite );
          float up = step( 0.42, ex ) * step( 0.0, sin( uTime * ( 0.9 + energy ) + phase * 31.0 ) );
          up = max( up, step( 0.8, ex ) );
          up = max( up, barra * step( 0.0, sin( uTime * 3.74 + phase * 0.6 ) ) );
          up = max( up, step( 0.97, aMisc.w ) * step( 0.0, sin( uTime * 0.31 + phase * 9.0 ) ) );
          vMapUv = vec2( ( aMisc.y + uv.x ) / ${CROWD_COLS.toFixed(1)}, 1.0 - ( up + 1.0 - uv.y ) / ${CROWD_ROWS.toFixed(1)} );
          vShirt = aShirt;
          vSkin = aSkin;
          vDark = aDark;
        }`,
      );
    sh.fragmentShader =
      `varying vec3 vShirt;
varying vec3 vSkin;
varying vec3 vDark;
` +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        `{
          vec4 m = texture2D( map, vMapUv );
          vec3 col = ( m.r * vShirt + m.g * vSkin + m.b * vDark ) / max( m.r + m.g + m.b, 1.0 );
          diffuseColor.rgb *= col;
          diffuseColor.a *= m.a;
        }`,
      );
  };

  const base = new THREE.PlaneGeometry(0.62, 1.5);
  base.translate(0, 0.75, 0);
  const home = new THREE.Color(o.homeColor);
  const away = new THREE.Color(o.awayColor);
  const meshes: THREE.InstancedMesh[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Color();
  const neutral = NEUTRAL.map((c) => new THREE.Color(c));
  const skins = SKIN.map((c) => new THREE.Color(c));
  const darks = DARK.map((c) => new THREE.Color(c));
  const white = new THREE.Color('#f4f4f4');
  let count = 0;
  const spots: FanSpot[] = [];
  for (const group of seats) {
    const chosen = group.filter(() => rand() < p);
    for (const s of chosen) if (rand() < (s.barra ? 0.08 : 0.035) && spots.length < 1800) spots.push({ x: s.x, y: s.y, z: s.z, nx: s.nx, nz: s.nz, away: s.away, barra: s.barra, tier: s.tier });
    if (chosen.length === 0) continue;
    const n = chosen.length;
    const g = base.clone();
    const shirt = new Float32Array(n * 3);
    const skin = new Float32Array(n * 3);
    const dark = new Float32Array(n * 3);
    const misc = new Float32Array(n * 4);
    const mesh = new THREE.InstancedMesh(g, material, n);
    chosen.forEach((s, i) => {
      const r = rand();
      let c: THREE.Color;
      if (s.away) c = r < 0.72 ? away : r < 0.8 ? white : neutral[Math.floor(rand() * neutral.length)];
      else if (s.barra) c = r < 0.86 ? home : r < 0.95 ? white : neutral[Math.floor(rand() * neutral.length)];
      else c = r < 0.56 ? home : r < 0.62 ? white : r < 0.66 ? away : neutral[Math.floor(rand() * neutral.length)];
      tmp.copy(c);
      if (c === home || c === away) tmp.multiplyScalar(0.82 + rand() * 0.3);
      tmp.toArray(shirt, i * 3);
      skins[Math.floor(rand() * skins.length)].toArray(skin, i * 3);
      darks[Math.floor(rand() * darks.length)].toArray(dark, i * 3);
      misc[i * 4] = rand();
      misc[i * 4 + 1] = Math.floor(rand() * CROWD_COLS);
      // energía: la barra brava (> 1) salta todo el partido al ritmo del bombo
      misc[i * 4 + 2] = s.barra ? 1.2 + rand() * 0.3 : rand();
      misc[i * 4 + 3] = rand();
      const jitter = (rand() - 0.5) * 0.1;
      pos.set(s.x + -s.nz * jitter, s.y, s.z + s.nx * jitter);
      q.setFromAxisAngle(Y, Math.atan2(-s.nx, -s.nz) + (rand() - 0.5) * 0.25);
      const k = 0.9 + rand() * 0.16;
      sc.set(k * widen, k * (0.94 + rand() * 0.1), 1);
      m4.compose(pos, q, sc);
      mesh.setMatrixAt(i, m4);
    });
    g.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
    g.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
    g.setAttribute('aDark', new THREE.InstancedBufferAttribute(dark, 3));
    g.setAttribute('aMisc', new THREE.InstancedBufferAttribute(misc, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
    mesh.receiveShadow = o.receiveShadow;
    mesh.castShadow = false;
    mesh.name = 'crowd';
    meshes.push(mesh);
    count += n;
  }
  base.dispose();
  return { meshes, material, atlas, uniforms, count, spots };
}
