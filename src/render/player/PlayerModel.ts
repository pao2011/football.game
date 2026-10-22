// Modelo procedural de futbolista: THREE.SkinnedMesh con esqueleto propio (21 huesos), geometría
// suave generada por barridos de secciones (bodyGeometry.ts), equipación por CanvasTexture
// (kitTextures.ts) y animación procedural (animations.ts).
//
// Convenciones:
//  - root: origen en los pies (y = 0 es el suelo); con root.rotation.y = 0 el jugador mira a +Z.
//  - Izquierda del jugador = +X local (mirando a +Z con Y arriba, la mano izquierda queda en +X).
//  - gk_dive_left  = estirada hacia la izquierda del portero (+X local).
//    gk_dive_right = estirada hacia la derecha del portero (-X local).
//  - AnimInfo.foot: 1 = pierna derecha (-X), -1 = pierna izquierda (+X).
//  - El modelo se construye a 1.80 m y se escala a spec.height (grupo interno).
//  - Solo se animan huesos; la cadera puede desplazarse en vertical (salto, barrida, estirada) y
//    ligeramente en horizontal (≤ 0.25 m en la estirada del portero).
//  - Geometrías (cuerpo por calidad/portero, pelo por estilo/calidad) y texturas de equipación
//    (por kit+dorsal+nombre) se comparten entre instancias; dispose() solo libera lo propio de la
//    instancia. PlayerModel.clearSharedCache() libera lo compartido.
import * as THREE from 'three';
import type { KitData } from '../../data/types';
import type { AnimInfo } from '../../sim/types';
import { BONE, BONE_DEFS } from './rig';
import { Animator } from './animations';
import { MAT, clearGeometryCache, getBodyGeometry, getHairGeometry } from './bodyGeometry';
import { clearKitTextureCache, shirtTexture, shortsTexture, socksTexture } from './kitTextures';

export interface PlayerVisualSpec {
  kit: KitData;
  number: number;
  name: string;
  skinTone: number;
  hairColor: string;
  hairStyle: number;
  height: number;
  isGoalkeeper: boolean;
}

export type ModelQuality = 'lite' | 'low' | 'medium' | 'high';

const SKIN_STOPS = ['#f6d8c4', '#eabd9a', '#d29a72', '#ae7651', '#8a5a3a', '#65412b', '#4a2f20'];

/** Tono de piel 0..1 (claro → oscuro). */
export function skinColor(tone: number): THREE.Color {
  const t = Math.min(1, Math.max(0, tone)) * (SKIN_STOPS.length - 1);
  const i = Math.min(SKIN_STOPS.length - 2, Math.floor(t));
  const a = new THREE.Color(SKIN_STOPS[i]);
  const b = new THREE.Color(SKIN_STOPS[i + 1]);
  return a.lerp(b, t - i);
}

const BOOT_COLORS = ['#141414', '#141414', '#f2f2f2', '#d61f2c', '#e8f21d', '#1d4fd6', '#ff6a00', '#141414'];

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class PlayerModel {
  readonly root: THREE.Group;
  private readonly body: THREE.Group;
  private readonly mesh: THREE.SkinnedMesh;
  private readonly bones: THREE.Bone[];
  private readonly skeleton: THREE.Skeleton;
  private readonly hair: THREE.Mesh;
  private readonly animator: Animator;
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly hairMat: THREE.MeshStandardMaterial;
  private readonly heightScale: number;
  private readonly quality: ModelQuality;
  private readonly spec: PlayerVisualSpec;

  constructor(spec: PlayerVisualSpec, quality: ModelQuality) {
    this.spec = { ...spec };
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = `player-${spec.number}-${spec.name}`;
    this.body = new THREE.Group();
    this.heightScale = (spec.height > 0 ? spec.height : 1.8) / 1.8;
    // ligera variación de complexión con la altura
    this.body.scale.set(this.heightScale * (0.97 + 0.03 * this.heightScale), this.heightScale, this.heightScale * (0.97 + 0.03 * this.heightScale));
    this.root.add(this.body);

    const seed = (hashStr(spec.name + '#' + spec.number) % 10000) / 10000;

    // materiales (propios de la instancia; las texturas están compartidas)
    const skin = new THREE.MeshStandardMaterial({ color: skinColor(spec.skinTone), roughness: 0.62, metalness: 0 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0 });
    const shorts = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0 });
    const socks = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
    const boots = new THREE.MeshStandardMaterial({ color: BOOT_COLORS[hashStr(spec.name) % BOOT_COLORS.length], roughness: 0.35, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.35, metalness: 0 });
    const gloves = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.7, metalness: 0 });
    this.materials = [];
    this.materials[MAT.skin] = skin;
    this.materials[MAT.shirt] = shirt;
    this.materials[MAT.shorts] = shorts;
    this.materials[MAT.socks] = socks;
    this.materials[MAT.boots] = boots;
    this.materials[MAT.dark] = dark;
    this.materials[MAT.gloves] = gloves;

    // esqueleto
    this.bones = BONE_DEFS.map((d) => {
      const b = new THREE.Bone();
      b.name = d.name;
      b.position.set(d.offset[0], d.offset[1], d.offset[2]);
      return b;
    });
    BONE_DEFS.forEach((d, i) => {
      if (d.parent >= 0) this.bones[d.parent].add(this.bones[i]);
    });

    const geo = getBodyGeometry(quality, spec.isGoalkeeper);
    this.mesh = new THREE.SkinnedMesh(geo, this.materials);
    this.mesh.name = 'body';
    this.mesh.add(this.bones[BONE.hips]);
    this.mesh.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // esfera envolvente amplia (poses tumbadas / saltos) para el frustum culling
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.75);
    this.body.add(this.mesh);

    // pelo (rígido, hijo del hueso de la cabeza)
    this.hairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.hairColor || '#2a1d14'), roughness: 0.92, metalness: 0 });
    this.hair = new THREE.Mesh(getHairGeometry(spec.hairStyle, quality), this.hairMat);
    this.hair.castShadow = true;
    this.hair.name = 'hair';
    this.bones[BONE.head].add(this.hair);
    // cejas/ojos con un tono ligado al pelo (oscurecido)
    dark.color.copy(new THREE.Color(spec.hairColor || '#2a1d14')).multiplyScalar(0.35).lerp(new THREE.Color(0x120c0a), 0.6);

    this.animator = new Animator(seed);
    this.setKit(spec.kit, spec.number, spec.name);
    this.update({ state: 'idle', time: 0, duration: 0, speed: 0, variant: 0, foot: 1 }, 0);
  }

  /** Engancha un objeto a un hueso (p. ej. la tarjeta en la mano del árbitro). */
  attachToBone(bone: number, obj: THREE.Object3D) {
    this.bones[bone].add(obj);
  }

  update(anim: AnimInfo, dt: number): void {
    const pose = this.animator.update(anim, dt, this.heightScale);
    for (let i = 0; i < this.bones.length; i++) this.bones[i].quaternion.copy(pose.q[i]);
    this.bones[BONE.hips].position.copy(pose.hips);
  }

  setKit(kit: KitData, number: number, name: string): void {
    this.spec.kit = kit;
    this.spec.number = number;
    this.spec.name = name;
    const texSize = this.quality === 'low' || this.quality === 'lite' ? 256 : 512;
    const gk = this.spec.isGoalkeeper;
    const shirt = this.materials[MAT.shirt];
    shirt.map = shirtTexture(kit, number, name, texSize, gk);
    shirt.needsUpdate = true;
    const shorts = this.materials[MAT.shorts];
    shorts.map = shortsTexture(kit, number, texSize >> 1);
    shorts.needsUpdate = true;
    const socks = this.materials[MAT.socks];
    socks.map = socksTexture(kit);
    socks.needsUpdate = true;
    // guantes del portero: claros con un toque del color secundario
    this.materials[MAT.gloves].color.set('#f4f4f4').lerp(new THREE.Color(kit.shirt2), 0.3);
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.hairMat.dispose();
    this.skeleton.dispose();
    this.root.removeFromParent();
  }

  /** Libera geometrías y texturas compartidas por todas las instancias. */
  static clearSharedCache(): void {
    clearGeometryCache();
    clearKitTextureCache();
  }
}
