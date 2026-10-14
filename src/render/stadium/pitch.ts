import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  HALF_LENGTH,
  HALF_WIDTH,
  PENALTY_AREA_DEPTH,
  PENALTY_AREA_HALF_WIDTH,
  GOAL_AREA_DEPTH,
  GOAL_AREA_HALF_WIDTH,
  PENALTY_SPOT_DIST,
  CENTER_CIRCLE_RADIUS,
  CORNER_ARC_RADIUS,
} from '../../config/constants';
import { STAND_A, STAND_B, BOARD_X, BOARD_Z } from './layout';
import { makeGrassTexture, makeGrassDetail } from './textures';
import { patchStaticShadow, type StaticShadowUniforms } from './shadowPatch';

export const LINE_W = 0.12;

export interface PitchBuild {
  grass: THREE.Mesh;
  lines: THREE.Mesh;
  textures: THREE.Texture[];
}

export function buildPitch(hue: number, quality: 'low' | 'medium' | 'high', seed: number, su: StaticShadowUniforms): PitchBuild {
  const extA = STAND_A;
  const extB = STAND_B;
  const texW = quality === 'low' ? 1024 : 2048;
  const map = makeGrassTexture(hue, texW, extA, extB, BOARD_X, BOARD_Z, seed);
  map.anisotropy = quality === 'high' ? 16 : quality === 'medium' ? 8 : 4;
  const detail = makeGrassDetail(seed);
  detail.anisotropy = map.anisotropy;
  const detailRepeat = new THREE.Vector2((2 * extA) / 1.6, (2 * extB) / 1.6);
  const textures: THREE.Texture[] = [map, detail];

  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  let bump: THREE.Texture | null = null;
  if (quality !== 'low') {
    bump = detail.clone();
    bump.repeat.copy(detailRepeat);
    bump.needsUpdate = true;
    mat.bumpMap = bump;
    mat.bumpScale = 1.2;
    textures.push(bump);
  }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detail };
    sh.uniforms.uDetailRepeat = { value: detailRepeat };
    patchStaticShadow(sh, su);
    sh.fragmentShader =
      'uniform sampler2D uDetail;\nuniform vec2 uDetailRepeat;\n' +
      sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 dA = texture2D( uDetail, vMapUv * uDetailRepeat ).rgb;
          vec3 dB = texture2D( uDetail, vMapUv * uDetailRepeat * 0.137 + 0.31 ).rgb;
          diffuseColor.rgb *= mix( vec3( 1.0 ), dA * 2.0, 0.5 ) * mix( vec3( 1.0 ), dB * 2.0, 0.35 );
        }`,
      );
  };
  const geo = new THREE.PlaneGeometry(2 * extA, 2 * extB, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const grass = new THREE.Mesh(geo, mat);
  grass.receiveShadow = true;
  grass.name = 'pitch-grass';

  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xf2f4f0,
    roughness: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  lineMat.onBeforeCompile = (sh) => patchStaticShadow(sh, su);
  const lines = new THREE.Mesh(buildLineGeometry(), lineMat);
  lines.receiveShadow = true;
  lines.name = 'pitch-lines';
  return { grass, lines, textures };
}

function buildLineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const w = LINE_W;
  const Y = 0.006;
  const rect = (x0: number, z0: number, x1: number, z1: number) => {
    const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0));
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, Y, (z0 + z1) / 2);
    parts.push(g);
  };
  const ring = (cx: number, cz: number, r: number, th0: number, len: number, segs: number) => {
    const g = new THREE.RingGeometry(r - w / 2, r + w / 2, segs, 1, th0, len);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, Y, cz);
    parts.push(g);
  };
  const disc = (cx: number, cz: number, r: number) => {
    const g = new THREE.CircleGeometry(r, 20);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, Y, cz);
    parts.push(g);
  };
  const HL = HALF_LENGTH;
  const HW = HALF_WIDTH;
  // touchlines & goal lines (centered on boundary)
  rect(-HL - w / 2, HW - w / 2, HL + w / 2, HW + w / 2);
  rect(-HL - w / 2, -HW - w / 2, HL + w / 2, -HW + w / 2);
  rect(HL - w / 2, -HW + w / 2, HL + w / 2, HW - w / 2);
  rect(-HL - w / 2, -HW + w / 2, -HL + w / 2, HW - w / 2);
  // halfway line
  rect(-w / 2, -HW + w / 2, w / 2, HW - w / 2);
  ring(0, 0, CENTER_CIRCLE_RADIUS, 0, Math.PI * 2, 128);
  disc(0, 0, 0.12);
  const alpha = Math.acos((PENALTY_AREA_DEPTH - PENALTY_SPOT_DIST) / CENTER_CIRCLE_RADIUS);
  for (const s of [-1, 1]) {
    const gx = s * HL;
    // penalty area
    const px = s * (HL - PENALTY_AREA_DEPTH);
    rect(px - w / 2, -PENALTY_AREA_HALF_WIDTH - w / 2, px + w / 2, PENALTY_AREA_HALF_WIDTH + w / 2);
    for (const t of [-1, 1]) {
      const z = t * PENALTY_AREA_HALF_WIDTH;
      rect(Math.min(gx, px) + (s < 0 ? w / 2 : 0), z - w / 2, Math.max(gx, px) - (s > 0 ? w / 2 : 0), z + w / 2);
    }
    // goal area
    const ax = s * (HL - GOAL_AREA_DEPTH);
    rect(ax - w / 2, -GOAL_AREA_HALF_WIDTH - w / 2, ax + w / 2, GOAL_AREA_HALF_WIDTH + w / 2);
    for (const t of [-1, 1]) {
      const z = t * GOAL_AREA_HALF_WIDTH;
      rect(Math.min(gx, ax) + (s < 0 ? w / 2 : 0), z - w / 2, Math.max(gx, ax) - (s > 0 ? w / 2 : 0), z + w / 2);
    }
    // penalty spot & arc (outside the box only)
    const sx = s * (HL - PENALTY_SPOT_DIST);
    disc(sx, 0, 0.12);
    const mid = s > 0 ? Math.PI : 0;
    ring(sx, 0, CENTER_CIRCLE_RADIUS, mid - alpha, 2 * alpha, 48);
    // corner arcs (quarter circles inside the field)
    for (const t of [-1, 1]) {
      // RingGeometry angle th maps to direction (cos th, -sin th) in xz after rotateX(-90deg)
      const thMid = Math.atan2(t, -s);
      ring(gx, t * HW, CORNER_ARC_RADIUS, thMid - Math.PI / 4, Math.PI / 2, 16);
    }
  }
  const clean = parts.map((g) => {
    const n = g.toNonIndexed();
    g.dispose();
    n.deleteAttribute('uv');
    return n;
  });
  const merged = mergeGeometries(clean, false)!;
  clean.forEach((g) => g.dispose());
  return merged;
}
