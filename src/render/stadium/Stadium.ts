import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StadiumData } from '../../data/types';
import { buildPitch } from './pitch';
import { buildGoalFrames, CornerFlags, GoalNets } from './goals';
import { buildStands } from './stands';
import { buildCrowd, type CrowdBuild } from './crowd';
import { FanEffects } from './fanfx';
import { lightPreset, makeSky, type LightPreset } from './sky';
import { makeLedTexture, makeScreenTexture, makeGlowTexture, hashString, LED_PANELS } from './textures';
import { makeStaticShadowUniforms, patchStaticShadow, type StaticShadowUniforms } from './shadowPatch';
import { CORE_A, CORE_B, STAND_R, ROOF_IN_D, ROOF } from './layout';

export type GfxQuality = 'low' | 'medium' | 'high';

interface QualitySettings {
  shadowMap: number;
  crowdMax: number;
  animateCrowd: boolean;
  roof: boolean;
  ledAnim: boolean;
  staticShadow: boolean;
  crowdShadow: boolean;
}

const QUALITY: Record<GfxQuality, QualitySettings> = {
  low: { shadowMap: 1024, crowdMax: 12000, animateCrowd: false, roof: false, ledAnim: false, staticShadow: false, crowdShadow: false },
  medium: { shadowMap: 2048, crowdMax: 30000, animateCrowd: true, roof: true, ledAnim: true, staticShadow: true, crowdShadow: false },
  high: { shadowMap: 4096, crowdMax: 42000, animateCrowd: true, roof: true, ledAnim: true, staticShadow: true, crowdShadow: true },
};

/**
 * Complete football stadium: pitch (procedural grass + markings), goals with deformable nets,
 * corner flags, ad boards (LED), dugouts & tunnel, multi-tier bowl with roof, animated
 * instanced crowd, sky dome, fog and lighting presets for day / sunset / night.
 *
 * Coordinate system follows src/config/constants.ts (x along length, z across, y up).
 * Draw calls are kept to ~20 by merging all static geometry per material.
 */
export class Stadium {
  readonly group: THREE.Group;
  readonly keyLight: THREE.DirectionalLight;

  private quality: GfxQuality;
  private q: QualitySettings;
  private preset: LightPreset;
  private nets: GoalNets;
  private flags: CornerFlags;
  private crowd: CrowdBuild;
  /** Hinchada: banderas, bengalas, fuegos artificiales y papelitos. */
  readonly fans: FanEffects;
  private sky: THREE.Mesh;
  private lights: THREE.Object3D[] = [];
  private scene: THREE.Scene | null = null;
  private time = 0;
  private excite = 0;
  private ledScrollTex: THREE.Texture | null = null;
  private textures: THREE.Texture[] = [];
  private materials: THREE.Material[] = [];
  private su: StaticShadowUniforms;
  private prevFog: THREE.Fog | THREE.FogExp2 | null = null;
  private prevBackground: THREE.Scene['background'] = null;
  private roofOn = true;
  private fogOverride: { color: string; near: number; far: number } | null = null;

  constructor(data: StadiumData, quality: GfxQuality, homeColor: string, awayColor: string, names: [string, string] = ['LOCAL', 'VISITANTE']) {
    this.quality = quality;
    this.q = QUALITY[quality] ?? QUALITY.medium;
    this.preset = lightPreset(data.timeOfDay);
    const seed = hashString(data.id || data.name);
    this.group = new THREE.Group();
    this.group.name = `stadium-${data.id}`;

    // ---- analytic stadium shadow (roof opening) uniforms
    this.su = makeStaticShadowUniforms();
    // los estadios pequeños no tienen techo: sin la sombra del anillo del techo
    const look = data.look ?? {};
    this.roofOn = this.q.roof && !data.small && look.roof !== 'none';
    // la sombra analítica del techo supone el anillo completo
    this.su.uSOn.value = this.q.staticShadow && this.preset.staticShadow && !data.small && (look.roof ?? 'ring') === 'ring' ? (data.timeOfDay === 'night' ? 2 : 1) : 0;
    this.fogOverride = data.fog ? { color: '#5c6670', near: 25, far: 150 } : null;
    this.su.uSSun.value.copy(this.preset.sunDir);
    this.su.uSCore.value.set(CORE_A, CORE_B);
    this.su.uSR.value = STAND_R + ROOF_IN_D;
    this.su.uSH.value.set(ROOF.inLong, ROOF.inEnd);
    this.su.uSDark.value = this.preset.shadowDark;

    // ---- pitch
    const pitch = buildPitch(data.grassHue, quality, seed, this.su);
    this.group.add(pitch.grass, pitch.lines);
    this.textures.push(...pitch.textures);
    this.materials.push(pitch.grass.material as THREE.Material, pitch.lines.material as THREE.Material);

    // ---- goals, nets, corner flags
    const frameMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 });
    this.materials.push(frameMat);
    const frames = new THREE.Mesh(buildGoalFrames(), frameMat);
    frames.castShadow = true;
    frames.receiveShadow = true;
    frames.name = 'goal-frames';
    this.group.add(frames);
    this.nets = new GoalNets();
    this.group.add(...this.nets.meshes);
    this.flags = new CornerFlags();
    this.materials.push(this.flags.mesh.material as THREE.Material);
    this.group.add(this.flags.mesh);

    // ---- stands, roof, boards, dugouts
    const night = data.timeOfDay === 'night';
    const sb = buildStands({ quality, standColor: data.standColor, roofColor: data.roofColor, homeColor, awayColor, roof: this.roofOn, night, upper: !data.small,
      roofSides: look.roof === 'sides', upperSides: look.upper, seats: look.seats, track: look.track, palcos: look.palcos });
    const staticMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
    staticMat.onBeforeCompile = (sh) => patchStaticShadow(sh, this.su);
    this.materials.push(staticMat);
    const addMerged = (geos: THREE.BufferGeometry[], mat: THREE.Material, name: string, receive = true) => {
      if (geos.length === 0) return null;
      const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!;
      if (geos.length > 1) geos.forEach((x) => x.dispose());
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = name;
      m.receiveShadow = receive;
      this.group.add(m);
      return m;
    };
    addMerged(sb.opaque, staticMat, 'stands');
    if (sb.roof.length) {
      const roofMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.7,
        metalness: 0.1,
        emissive: new THREE.Color(data.roofColor).multiplyScalar(night ? 0.05 : 0.14),
      });
      roofMat.onBeforeCompile = (sh) => patchStaticShadow(sh, this.su);
      this.materials.push(roofMat);
      addMerged(sb.roof, roofMat, 'roof');
    }

    const ledTex = makeLedTexture();
    ledTex.anisotropy = 8;
    this.textures.push(ledTex);
    const ledIntensity = night ? 1.0 : data.timeOfDay === 'sunset' ? 0.95 : 1.15;
    const ledStaticMat = new THREE.MeshBasicMaterial({ map: ledTex, color: new THREE.Color(ledIntensity, ledIntensity, ledIntensity) });
    this.materials.push(ledStaticMat);
    addMerged(sb.ledStatic, ledStaticMat, 'led-static', false);
    if (sb.ledScroll.length) {
      const scrollTex = ledTex.clone();
      scrollTex.needsUpdate = true;
      this.ledScrollTex = scrollTex;
      this.textures.push(scrollTex);
      const ledScrollMat = new THREE.MeshBasicMaterial({ map: scrollTex, color: ledStaticMat.color.clone() });
      this.materials.push(ledScrollMat);
      addMerged(sb.ledScroll, ledScrollMat, 'led-scroll', false);
    }

    const screenTex = makeScreenTexture(data.name, homeColor, awayColor);
    this.textures.push(screenTex);
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: new THREE.Color(ledIntensity, ledIntensity, ledIntensity) });
    this.materials.push(screenMat);
    addMerged(sb.screens, screenMat, 'screens', false);

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xbcd4e6,
      transparent: true,
      opacity: 0.3,
      roughness: 0.08,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.materials.push(glassMat);
    const glass = addMerged(sb.glass, glassMat, 'dugout-glass', false);
    if (glass) glass.renderOrder = 3;

    const lightsOn = this.preset.lightsOn;
    if (lightsOn > 0 && sb.glow.length) {
      const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1).multiplyScalar(0.45 + lightsOn * 0.75) });
      this.materials.push(glowMat);
      addMerged(sb.glow, glowMat, 'glow', false);
    } else {
      sb.glow.forEach((g) => g.dispose());
    }
    if (lightsOn > 0 && sb.flares.length) {
      const glowTex = makeGlowTexture();
      this.textures.push(glowTex);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(sb.flares, 3));
      const pm = new THREE.PointsMaterial({
        map: glowTex,
        size: this.roofOn ? 7 : 10,
        sizeAttenuation: true,
        color: new THREE.Color('#dfe9ff').multiplyScalar(0.5 + lightsOn * 0.6),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      this.materials.push(pm);
      const pts = new THREE.Points(pg, pm);
      pts.name = 'floodlight-flares';
      pts.renderOrder = 5;
      this.group.add(pts);
    }

    // ---- crowd
    const occupancy = Math.max(0.6, Math.min(0.96, data.capacity / 65000 + 0.25));
    this.crowd = buildCrowd(
      sb.rows,
      { maxCount: this.q.crowdMax, occupancy, homeColor, awayColor, seed, receiveShadow: this.q.crowdShadow },
      this.su,
    );
    this.textures.push(this.crowd.atlas);
    this.materials.push(this.crowd.material);
    this.group.add(...this.crowd.meshes);
    this.fans = new FanEffects(this.crowd.spots, { homeColor, awayColor, seed, quality, homeName: names[0], awayName: names[1], show: data.show });
    this.group.add(this.fans.group);

    // ---- sky
    this.sky = makeSky(this.preset);
    this.materials.push(this.sky.material as THREE.Material);
    this.group.add(this.sky);

    // ---- key light (sun or main floodlight bank)
    const p = this.preset;
    this.keyLight = new THREE.DirectionalLight(new THREE.Color(p.sunColor), p.sunIntensity);
    this.keyLight.name = 'stadium-key-light';
    this.keyLight.castShadow = true;
    const sh = this.keyLight.shadow;
    sh.mapSize.set(this.q.shadowMap, this.q.shadowMap);
    const cam = sh.camera as THREE.OrthographicCamera;
    const ext = 40;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 5;
    cam.far = 400;
    cam.updateProjectionMatrix();
    sh.bias = -0.0004;
    sh.normalBias = 0.025;
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.position.copy(p.sunDir).multiplyScalar(150);
    this.lights.push(this.keyLight, this.keyLight.target);

    const hemi = new THREE.HemisphereLight(new THREE.Color(p.hemiSky), new THREE.Color(p.hemiGround), p.hemiIntensity);
    hemi.name = 'stadium-hemi';
    this.lights.push(hemi);
    for (const f of p.fills) {
      const l = new THREE.DirectionalLight(new THREE.Color(f.color), f.intensity);
      l.position.copy(f.dir).multiplyScalar(100);
      l.castShadow = false;
      this.lights.push(l, l.target);
    }
  }

  /** Light direction (towards the light). Useful for re-centring the shadow camera. */
  get lightDirection(): THREE.Vector3 {
    return this.preset.sunDir.clone();
  }

  /** Convenience: move key light + its target so the shadow frustum is centred on `p`. */
  focusShadow(p: THREE.Vector3) {
    this.keyLight.target.position.copy(p);
    this.keyLight.position.copy(this.preset.sunDir).multiplyScalar(150).add(p);
    this.keyLight.target.updateMatrixWorld();
  }

  attachTo(scene: THREE.Scene): void {
    this.scene = scene;
    if (this.group.parent !== scene) scene.add(this.group);
    for (const l of this.lights) if (l.parent !== scene) scene.add(l);
    this.prevFog = scene.fog;
    this.prevBackground = scene.background;
    const fo = this.fogOverride;
    scene.fog = fo ? new THREE.Fog(new THREE.Color(fo.color), fo.near, fo.far) : new THREE.Fog(new THREE.Color(this.preset.fog), this.preset.fogNear, this.preset.fogFar);
    scene.background = new THREE.Color(this.preset.skyHorizon);
  }

  update(dt: number, excitement: number, camera: THREE.Camera, viewH = 720): void {
    const d = Math.min(Math.max(dt, 0), 0.1);
    this.time += d;
    const ex = Math.max(0, Math.min(1, excitement));
    // ease towards target excitement (fast rise, slower decay)
    const k = ex > this.excite ? 6 : 1.5;
    this.excite += (ex - this.excite) * Math.min(1, d * k);
    if (this.q.animateCrowd) {
      this.crowd.uniforms.uTime.value = this.time;
      this.crowd.uniforms.uExcite.value = this.excite;
    }
    if (this.ledScrollTex && this.q.ledAnim) {
      // advertising rotation: slide one panel every 7 s (and slowly drift)
      const period = 7;
      const tr = 0.9;
      const step = Math.floor(this.time / period);
      const f = Math.min(1, (this.time - step * period) / tr);
      const e = f * f * (3 - 2 * f);
      this.ledScrollTex.offset.x = ((step + e) / LED_PANELS) % 1;
    }
    this.flags.update(this.time);
    this.nets.update(d);
    this.fans.update(d, camera, viewH, this.excite);
    camera.getWorldPosition(this.sky.position);
  }

  netImpact(side: -1 | 1, point: THREE.Vector3, strength: number): void {
    this.nets.impact(side, point, strength);
  }

  dispose(): void {
    if (this.scene) {
      for (const l of this.lights) this.scene.remove(l);
      this.scene.remove(this.group);
      if (this.scene.fog && this.scene.fog !== this.prevFog) this.scene.fog = this.prevFog;
      this.scene.background = this.prevBackground;
      this.scene = null;
    }
    this.keyLight.shadow.map?.dispose();
    this.keyLight.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    this.nets.dispose();
    this.fans.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.materials = [];
    this.textures = [];
  }

  /** Approximate number of crowd instances (for debug overlays). */
  get crowdCount(): number {
    return this.crowd.count;
  }

  get gfxQuality(): GfxQuality {
    return this.quality;
  }
}
