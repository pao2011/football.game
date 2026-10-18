import * as THREE from 'three';
import type { FanSpot } from './crowd';
import { mulberry32 } from './textures';
import { FanFlags } from './fanflags';

// Efectos de la hinchada: banderas que flamean en las gradas, humo de bengalas, fuegos artificiales
// y papelitos. Todo procedural (sin imágenes) y con partículas baratas (THREE.Points), para que
// funcione también en móviles. Los disparadores son: el recibimiento (inicio del partido), los goles
// y, de vez en cuando, bengalas espontáneas.

export interface FanFxOptions {
  homeColor: string;
  awayColor: string;
  seed: number;
  /** Calidad: limita el número de partículas y banderas. */
  quality: 'low' | 'medium' | 'high';
  /** Nombres de los equipos (para los trapos). */
  homeName?: string;
  awayName?: string;
  /** Cancha con espectáculo especial (el "minuto 68" de Belgrano): láseres, luces de colores y más humo y fuegos. */
  show?: boolean;
}

type Style = 0 | 1 | 2; // 0 humo (suave), 1 luz aditiva (chispas, bengalas), 2 papelitos (cuadrados)

/** Conjunto de partículas con física sencilla (velocidad, gravedad, arrastre, viento) y vida limitada. */
class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private a0: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private next = 0;
  private live = 0;
  readonly uniforms = { uScale: { value: 400 } };

  constructor(readonly max: number, private style: Style) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const frag = style === 0
      ? `float d = length(gl_PointCoord - 0.5) * 2.0;
         float a = smoothstep(1.0, 0.15, d);
         // textura de nube: dos ondas cruzadas para que no sea un círculo perfecto
         a *= 0.75 + 0.25 * sin(gl_PointCoord.x * 9.0 + vSeed) * sin(gl_PointCoord.y * 7.0 + vSeed * 1.7);
         gl_FragColor = vec4(vColor, a * vAlpha);`
      : style === 1
        ? `float d = length(gl_PointCoord - 0.5) * 2.0;
           float a = pow(max(0.0, 1.0 - d), 1.8);
           gl_FragColor = vec4(vColor * (1.0 + a), a * vAlpha);`
        : `gl_FragColor = vec4(vColor, vAlpha);`;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vSeed = position.x * 3.1 + position.z * 1.7;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(0.5, -mv.z), ${style === 2 ? '1.5' : '1.0'}, 280.0);
          if (aAlpha <= 0.001) gl_PointSize = 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vColor;
        varying float vAlpha;
        varying float vSeed;
        void main() { ${frag} }`,
      transparent: true,
      depthWrite: false,
      blending: style === 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = style === 0 ? 3 : 4;
  }

  get active() {
    return this.live > 0;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color, life: number, s0: number, s1: number, a0: number, grav: number, drag: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = a0;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.live = this.max;
  }

  update(dt: number, wx: number, wz: number, time: number) {
    if (this.live === 0) return;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const L = this.life[i];
      if (L <= 0) continue;
      const a = (this.age[i] += dt);
      if (a >= L) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      const t = a / L;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      const j = i * 3;
      // el viento arrastra más al humo y a los papelitos que a las chispas
      const w = this.style === 1 ? 0.15 : 1;
      this.vel[j] = this.vel[j] * k + wx * w * dt * 0.6;
      this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt;
      this.vel[j + 2] = this.vel[j + 2] * k + wz * w * dt * 0.6;
      if (this.style === 2) {
        // papelitos: revolotean al caer
        this.vel[j] += Math.sin(time * 3 + i) * dt * 1.2;
        this.vel[j + 2] += Math.cos(time * 2.6 + i * 1.3) * dt * 1.2;
      }
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.05) {
        this.pos[j + 1] = 0.05;
        this.vel[j] = this.vel[j + 1] = this.vel[j + 2] = 0;
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * (this.style === 0 ? Math.sqrt(t) : t);
      // envolvente de opacidad: entra rápido y se desvanece al final
      const env = this.style === 0 ? Math.min(1, t * 6) * (1 - t) * (1 - t) : this.style === 1 ? 1 - t * t : Math.min(1, (1 - t) * 4);
      this.alpha[i] = this.a0[i] * env * (this.style === 2 ? 0.75 + 0.25 * Math.sin(time * 9 + i) : 1);
    }
    this.live = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

interface Emitter {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  color: THREE.Color;
  until: number;
  acc: number;
  /** Bengala del espectáculo: humo más espeso y grande. */
  show?: boolean;
}

interface Rocket {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: THREE.Color;
  color2: THREE.Color;
  delay: number;
  big: boolean;
  /** Cohete del espectáculo: estalla en más chispas y de colores del club. */
  show?: boolean;
}

const LIMITS = {
  low: { smoke: 260, sparks: 900, confetti: 500, flags: 40, trapos: 8, drums: 8 },
  medium: { smoke: 520, sparks: 1800, confetti: 1200, flags: 100, trapos: 14, drums: 14 },
  high: { smoke: 800, sparks: 2600, confetti: 1800, flags: 150, trapos: 20, drums: 18 },
};

export class FanEffects {
  readonly group = new THREE.Group();
  /** Se llama en cada explosión de fuegos artificiales (para el sonido). Recibe la distancia a la cámara. */
  onBurst: ((distance: number) => void) | null = null;
  private smoke: Particles;
  private sparks: Particles;
  private confetti: Particles;
  // ---- espectáculo (solo en canchas con `show`)
  private readonly showOn: boolean;
  private readonly quality: 'low' | 'medium' | 'high';
  private showSmoke: Particles | null = null;
  /** Bruma celeste que cubre toda la cancha (grada y campo). */
  private hazeSmoke: Particles | null = null;
  private hazeAcc = 0;
  private showSparks: Particles | null = null;
  private lasers: { mesh: THREE.Mesh; glow: THREE.Mesh; origin: THREE.Vector3; phase: number }[] = [];
  private washes: THREE.DirectionalLight[] = [];
  /** Intensidad del espectáculo 0..1 (la manda la línea de tiempo del partido). */
  private spec = 0;
  private specTime = 0;
  private rocketAcc = 0;
  private lightAcc = 0;
  readonly flags: FanFlags;
  private emitters: Emitter[] = [];
  private rockets: Rocket[] = [];
  private confettiQueue: { spot: FanSpot; color: THREE.Color }[] = [];
  private rand: () => number;
  private time = 0;
  private nextAmbient: number;
  private wind: THREE.Vector2;
  private home: THREE.Color;
  private away: THREE.Color;
  private camPos = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private readonly homeSpots: FanSpot[];
  private readonly awaySpots: FanSpot[];
  private readonly topSpots: FanSpot[];
  /** Asientos de la tribuna de enfrente de la cámara de transmisión (los efectos se ven más ahí). */
  private readonly farSpots: FanSpot[];
  /** Barra brava local (detrás de un arco). */
  private readonly barraSpots: FanSpot[];

  constructor(private spots: FanSpot[], o: FanFxOptions) {
    this.rand = mulberry32(o.seed ^ 0x7f4a11);
    const r = this.rand;
    this.showOn = !!o.show;
    this.quality = o.quality;
    const lim = LIMITS[o.quality] ?? LIMITS.medium;
    this.home = new THREE.Color(o.homeColor);
    this.away = new THREE.Color(o.awayColor);
    this.wind = new THREE.Vector2(r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.6 + r() * 0.9);
    this.nextAmbient = 40 + r() * 40;
    const low = spots.filter((s) => s.tier <= 1);
    this.homeSpots = low.filter((s) => !s.away);
    this.awaySpots = low.filter((s) => s.away);
    if (this.awaySpots.length === 0) this.awaySpots = low.slice(0, Math.max(1, Math.floor(low.length / 6)));
    if (this.homeSpots.length === 0) this.homeSpots = low.length ? low : spots;
    const maxTier = spots.reduce((m, s) => Math.max(m, s.tier), 0);
    this.topSpots = spots.filter((s) => s.tier === maxTier);
    if (this.topSpots.length === 0) this.topSpots = spots;
    this.barraSpots = low.filter((s) => s.barra);
    if (this.barraSpots.length === 0) this.barraSpots = this.homeSpots;
    this.farSpots = low.filter((s) => s.nz < -0.5 || Math.abs(s.nx) > 0.5);
    if (this.farSpots.length === 0) this.farSpots = low.length ? low : spots;

    this.smoke = new Particles(lim.smoke, 0);
    this.sparks = new Particles(lim.sparks, 1);
    this.confetti = new Particles(lim.confetti, 2);
    this.group.add(this.smoke.points, this.confetti.points, this.sparks.points);

    // ---- banderas, trapos, bandera gigante y bombos de la barra brava
    this.flags = new FanFlags(spots, {
      home: this.home, away: this.away, homeName: o.homeName ?? 'LOCAL', awayName: o.awayName ?? 'VISITANTE',
      flags: lim.flags, trapos: lim.trapos, drums: lim.drums, rand: r,
    });
    this.group.add(this.flags.group);
    if (this.showOn) this.buildShowRig(lim.flags > 60 ? 8 : 5);
  }

  /** Láseres y luces de colores (se crean apagados al principio: así el motor no recompila shaders al encenderlos). */
  private buildShowRig(nLasers: number) {
    const colors = ['#5db8e8', '#38ff8a', '#ffffff', '#5db8e8', '#ff4d6d', '#38ff8a', '#ffffff', '#b26bff'];
    const beam = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true);
    beam.translate(0, 0.5, 0);
    const halo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true);
    halo.translate(0, 0.5, 0);
    const pool = this.topSpots.length ? this.topSpots : this.spots;
    for (let i = 0; i < nLasers; i++) {
      const c = new THREE.Color(colors[i % colors.length]);
      const mk = (g: THREE.BufferGeometry) =>
        new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const mesh = mk(beam);
      const glow = mk(halo);
      mesh.frustumCulled = glow.frustumCulled = false;
      mesh.visible = glow.visible = false;
      mesh.renderOrder = glow.renderOrder = 6;
      const s = pool[Math.floor((i / nLasers) * pool.length + this.rand() * 4) % pool.length];
      this.lasers.push({ mesh, glow, origin: new THREE.Vector3(s.x, s.y + 3, s.z), phase: this.rand() * 6.28 });
      this.group.add(mesh, glow);
    }
    // luces de colores sobre la cancha: celeste, blanca y roja, que palpitan
    for (const [col, x, z] of [['#5db8e8', 0, 60], ['#ffffff', 70, -30], ['#ff3b4a', -70, -30]] as const) {
      const l = new THREE.DirectionalLight(new THREE.Color(col), 0);
      l.position.set(x, 40, z);
      this.washes.push(l);
      this.group.add(l);
    }
  }

  /** Nivel de bruma 0..1 (sigue la intensidad del espectáculo, pero sube y baja más despacio). */
  get hazeLevel() {
    return this.haze;
  }
  private haze = 0;

  /** Intensidad del espectáculo 0..1 (humo, bengalas, fuegos, láseres y luces). */
  setSpectacle(v: number) {
    this.spec = this.showOn ? Math.max(0, Math.min(1, v)) : 0;
  }

  /** El estallido del minuto 68: bandera gigante, tanda de fuegos, bengalas por toda la cancha y papelitos. */
  spectacleBurst() {
    if (!this.showOn) return;
    this.ensureShowParticles();
    this.flags.showGiant(40);
    const cel = new THREE.Color('#7fd0ff');
    const wh = new THREE.Color('#ffffff');
    for (let i = 0; i < 44; i++) this.rocket(0.1 + i * 0.16 + this.rand() * 0.12, i % 5 === 0, i % 3 === 0 ? wh : cel, true);
    const n = this.quality === 'low' ? 12 : this.quality === 'medium' ? 20 : 28;
    for (let i = 0; i < n; i++) this.showFlare();
    this.queueConfetti(this.homeSpots, cel, this.quality === 'low' ? 500 : 1400);
    this.queueConfetti(this.farSpots, wh, this.quality === 'low' ? 200 : 600);
  }

  private ensureShowParticles() {
    if (this.showSmoke) return;
    const big = this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.7 : 0.4;
    this.showSmoke = new Particles(Math.round(2200 * big), 0);
    this.showSparks = new Particles(Math.round(4200 * big), 1);
    this.hazeSmoke = new Particles(Math.round(1100 * big), 0);
    this.group.add(this.hazeSmoke.points, this.showSmoke.points, this.showSparks.points);
  }

  /** Bengala del espectáculo: celeste, blanca o roja, en la barra, la tribuna local o la de enfrente. */
  private showFlare() {
    const r = this.rand();
    const spot = this.pick(r < 0.2 ? this.barraSpots : r < 0.8 ? this.farSpots : this.homeSpots);
    // humo solo celeste (varios tonos)
    const pal = ['#5db8e8', '#7fd0ff', '#9adcff', '#6cc4f5', '#b4e4ff'];
    const c = new THREE.Color(pal[Math.floor(this.rand() * pal.length)]);
    this.emitters.push({ x: spot.x - spot.nx * 0.4, y: spot.y + 1.2, z: spot.z - spot.nz * 0.4, nx: spot.nx, nz: spot.nz, color: c, until: this.time + 7 + this.rand() * 6, acc: 0, show: true });
  }

  private updateShow(d: number) {
    const v = this.spec;
    this.specTime += d;
    const r = this.rand;
    const tm = this.specTime;
    const on = v > 0.02;
    // luces de colores palpitantes
    for (let i = 0; i < this.washes.length; i++) {
      const p = 0.5 + 0.5 * Math.sin(tm * (7 + i * 2.3) + i * 2);
      this.washes[i].intensity = on ? v * (0.3 + 1.5 * p * p) : 0;
    }
    // láseres que barren la cancha
    this.lasers.forEach((L, k) => {
      const vis = on && v > 0.12;
      L.mesh.visible = L.glow.visible = vis;
      if (!vis) return;
      const a = tm * (0.7 + (k % 3) * 0.25) + L.phase;
      const tx = Math.cos(a) * 40 + Math.sin(a * 0.37) * 18;
      const ty = 5 + 14 * (0.5 + 0.5 * Math.sin(tm * 1.6 + k));
      const tz = Math.sin(a * 1.2) * 26;
      const dir = new THREE.Vector3(tx - L.origin.x, ty - L.origin.y, tz - L.origin.z).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      for (const m of [L.mesh, L.glow]) {
        m.position.copy(L.origin);
        m.quaternion.copy(q);
        m.scale.set(1, 110, 1);
      }
      const flick = 0.75 + 0.25 * Math.sin(tm * 23 + k * 5);
      (L.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, v * 1.4) * 0.85 * flick;
      (L.glow.material as THREE.MeshBasicMaterial).opacity = Math.min(1, v * 1.4) * 0.12 * flick;
    });
    // la bruma sube y baja más despacio que el resto del espectáculo
    this.haze += (v - this.haze) * Math.min(1, d * 0.9);
    if (this.haze < 0.002) this.haze = 0;
    if (!on) return;
    this.ensureShowParticles();
    // bengalas encendidas: cuantas más, más intenso
    const maxF = this.quality === 'low' ? 8 : this.quality === 'medium' ? 14 : 22;
    const want = Math.round(maxF * v);
    let cur = 0;
    for (const e of this.emitters) if (e.show) cur++;
    for (; cur < want; cur++) this.showFlare();
    // bruma celeste por todo el estadio, campo de juego incluido: nubes grandes y blandas a distintas alturas
    const hz = this.hazeSmoke!;
    const cap = hz.max;
    this.hazeAcc += d * (cap * 1.2 / 11) * Math.min(1, this.haze * 1.8);
    while (this.hazeAcc >= 1) {
      this.hazeAcc -= 1;
      const hx = (r() * 2 - 1) * 66;
      const hzz = (r() * 2 - 1) * 46;
      const hy = 0.5 + Math.pow(r(), 1.8) * 10;
      this.tmpC.set(['#7fd0ff', '#9adcff', '#b4e4ff', '#8fd8ff'][Math.floor(r() * 4)]);
      hz.spawn(hx, hy, hzz, (r() - 0.5) * 0.8, (r() - 0.3) * 0.25, (r() - 0.5) * 0.8, this.tmpC, 9 + r() * 5, 9 + r() * 4, 20 + r() * 12, 0.55, 0, 0.1);
    }
    // fuegos artificiales sostenidos
    this.rocketAcc += d * (0.8 + 4.2 * v);
    while (this.rocketAcc >= 1) {
      this.rocketAcc -= 1;
      this.rocket(0, r() < 0.25, r() < 0.55 ? new THREE.Color('#7fd0ff') : null, true);
    }
    // luces de celulares y destellos en las tribunas
    this.lightAcc += d * (30 + 190 * v);
    const sp = this.showSparks!;
    while (this.lightAcc >= 1) {
      this.lightAcc -= 1;
      const s = this.pick(r() < 0.6 ? this.homeSpots : this.spots);
      this.tmpC.setRGB(1, 0.95 - r() * 0.2, 0.8 + r() * 0.2);
      sp.spawn(s.x - s.nx * 0.2, s.y + 1.5 + r() * 0.6, s.z - s.nz * 0.2, 0, 0, 0, this.tmpC, 0.7 + r() * 1.3, 0.45, 0.25, 0.9, 0, 0);
    }
  }

  private pick(list: FanSpot[]) {
    return list[Math.floor(this.rand() * list.length)];
  }

  /** Como pick, pero prefiere la tribuna de enfrente de la cámara (60 %). */
  private pickFar(list: FanSpot[]) {
    if (this.rand() < 0.6) {
      const far = list.filter((s) => s.nz < -0.5 || Math.abs(s.nx) > 0.5);
      if (far.length) return this.pick(far);
    }
    return this.pick(list);
  }

  /** Bengala de humo encendida en la grada durante `seconds`. */
  private flare(spot: FanSpot, color: THREE.Color, seconds: number) {
    this.emitters.push({ x: spot.x - spot.nx * 0.4, y: spot.y + 1.2, z: spot.z - spot.nz * 0.4, nx: spot.nx, nz: spot.nz, color, until: this.time + seconds, acc: 0 });
  }

  /** Cohete lanzado desde lo alto de la grada; estalla en el aire. */
  private rocket(delay: number, big = false, team: THREE.Color | null = null, show = false) {
    const r = this.rand;
    // casi todos desde las primeras filas de enfrente (se ven con la cámara de transmisión); algunos desde arriba
    const s = this.pick(r() < 0.75 ? this.farSpots : this.topSpots);
    const palette = [new THREE.Color('#ffd23f'), new THREE.Color('#ff4d5e'), new THREE.Color('#4fc3ff'), new THREE.Color('#ffffff'), new THREE.Color('#b26bff'), new THREE.Color('#19e68c')];
    const c = team && r() < 0.6 ? team.clone().lerp(new THREE.Color('#ffffff'), 0.25) : palette[Math.floor(r() * palette.length)];
    this.rockets.push({
      x: s.x - s.nx * 2, y: s.y + 2, z: s.z - s.nz * 2,
      vx: -s.nx * (2 + r() * 3) + (r() - 0.5) * 3, vy: 16 + r() * 5, vz: -s.nz * (2 + r() * 3) + (r() - 0.5) * 3,
      color: c, color2: palette[Math.floor(r() * palette.length)], delay, big, show,
    });
  }

  /** Recibimiento: fuegos artificiales, bengalas de ambas hinchadas y lluvia de papelitos. */
  welcome() {
    this.flags.showGiant(18);
    for (let i = 0; i < 16; i++) this.rocket(0.2 + i * 0.32 + this.rand() * 0.3, i % 4 === 0, i % 2 ? this.home : null);
    for (let i = 0; i < 6; i++) this.flare(this.pick(this.barraSpots), this.smokeColor(this.home), 10 + this.rand() * 6);
    for (let i = 0; i < 5; i++) this.flare(this.pickFar(this.homeSpots), this.smokeColor(this.home), 9 + this.rand() * 6);
    for (let i = 0; i < 5; i++) this.flare(this.pick(this.awaySpots), this.smokeColor(this.away), 9 + this.rand() * 6);
    this.queueConfetti(this.homeSpots, this.home, 700);
    this.queueConfetti(this.awaySpots, this.away, 250);
  }

  /** Gol: la hinchada del equipo que marca enciende bengalas, tira papelitos y hay fuegos artificiales. */
  goal(team: 0 | 1) {
    const spots = team === 0 ? this.homeSpots : this.awaySpots;
    if (team === 0) this.flags.showGiant(10);
    const c = team === 0 ? this.home : this.away;
    for (let i = 0; i < 6; i++) this.flare(this.pickFar(spots), this.smokeColor(c), 7 + this.rand() * 5);
    for (let i = 0; i < 5; i++) this.rocket(0.4 + i * 0.45 + this.rand() * 0.3, i === 2, c);
    this.queueConfetti(spots, c, 450);
  }

  /** Humo del color del club (algo aclarado) o, a veces, rojo de bengala. */
  private smokeColor(c: THREE.Color) {
    const r = this.rand();
    if (r < 0.25) return new THREE.Color('#e8473a');
    if (r < 0.4) return new THREE.Color('#f2f2f2');
    return c.clone().lerp(new THREE.Color('#ffffff'), 0.2);
  }

  private queueConfetti(spots: FanSpot[], c: THREE.Color, n: number) {
    for (let i = 0; i < n; i++) this.confettiQueue.push({ spot: this.pick(spots), color: this.rand() < 0.55 ? new THREE.Color('#f7f7f2') : c });
  }

  /**
   * Avanza los efectos. viewH: alto del lienzo en píxeles (para el tamaño de las partículas).
   */
  update(dt: number, camera: THREE.Camera, viewH: number, excitement: number) {
    const d = Math.min(Math.max(dt, 0), 0.1);
    this.time += d;
    const r = this.rand;
    const cam = camera as THREE.PerspectiveCamera;
    const scale = viewH / (2 * Math.tan(((cam.fov ?? 40) * Math.PI) / 360));
    this.smoke.uniforms.uScale.value = scale;
    this.sparks.uniforms.uScale.value = scale;
    this.confetti.uniforms.uScale.value = scale;
    if (this.showSmoke) this.showSmoke.uniforms.uScale.value = scale;
    if (this.hazeSmoke) this.hazeSmoke.uniforms.uScale.value = scale;
    if (this.showSparks) this.showSparks.uniforms.uScale.value = scale;
    this.flags.update(d, excitement);
    if (this.showOn) this.updateShow(d);
    camera.getWorldPosition(this.camPos);

    // bengalas espontáneas de vez en cuando (más si el partido está caliente)
    if (this.time > this.nextAmbient) {
      this.nextAmbient = this.time + (55 + r() * 70) * (1 - 0.4 * excitement);
      // la mayoría de las bengalas las prende la barra brava
      const k = r();
      const list = k < 0.55 ? this.barraSpots : k < 0.8 ? this.awaySpots : this.homeSpots;
      const col = list === this.awaySpots ? this.away : this.home;
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) this.flare(list === this.homeSpots ? this.pickFar(list) : this.pick(list), this.smokeColor(col), 8 + r() * 6);
    }

    // emisores de humo
    const wx = this.wind.x;
    const wz = this.wind.y;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (this.time > e.until) {
        this.emitters.splice(i, 1);
        continue;
      }
      const smokeSet = e.show && this.showSmoke ? this.showSmoke : this.smoke;
      const sparkSet = e.show && this.showSparks ? this.showSparks : this.sparks;
      e.acc += d * (e.show ? 7 : 15);
      while (e.acc >= 1) {
        e.acc -= 1;
        const shade = 0.85 + r() * 0.3;
        this.tmpC.copy(e.color).multiplyScalar(shade);
        if (e.show) {
          // humo espeso y enorme que cubre la tribuna
          smokeSet.spawn(e.x + (r() - 0.5) * 0.6, e.y, e.z + (r() - 0.5) * 0.6,
            (r() - 0.5) * 0.9 - e.nx * 2.6, 0.9 + r() * 1.1, (r() - 0.5) * 0.9 - e.nz * 2.6,
            this.tmpC, 8 + r() * 5, 2.6, 14 + r() * 8, 0.5, -0.02, 0.35);
          continue;
        }
        this.smoke.spawn(e.x + (r() - 0.5) * 0.4, e.y, e.z + (r() - 0.5) * 0.4,
          (r() - 0.5) * 0.6 - e.nx * 0.5, 1.4 + r() * 1.2, (r() - 0.5) * 0.6 - e.nz * 0.5,
          this.tmpC, 5 + r() * 3, 1.8, 10 + r() * 4, 0.7, -0.05, 0.35);
      }
      // resplandor de la bengala
      if (r() < 0.85) {
        if (e.show) this.tmpC.setRGB(0.55 + r() * 0.2, 0.85, 1);
        else this.tmpC.setRGB(1, 0.35 + r() * 0.25, 0.15);
        sparkSet.spawn(e.x, e.y + 0.2, e.z, (r() - 0.5) * 0.6, 0.6 + r(), (r() - 0.5) * 0.6, this.tmpC, 0.18 + r() * 0.12, 0.9 + r() * 0.5, 0.3, 0.9, 0, 0);
      }
    }

    // cohetes
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const k = this.rockets[i];
      if (k.delay > 0) {
        k.delay -= d;
        continue;
      }
      k.vy -= 9.8 * d;
      k.x += k.vx * d;
      k.y += k.vy * d;
      k.z += k.vz * d;
      const spk = k.show && this.showSparks ? this.showSparks : this.sparks;
      const smk = k.show && this.showSmoke ? this.showSmoke : this.smoke;
      this.tmpC.setRGB(1, 0.75, 0.4);
      spk.spawn(k.x, k.y, k.z, (r() - 0.5) * 0.8, -1 - r(), (r() - 0.5) * 0.8, this.tmpC, 0.5, 0.35, 0.1, 0.8, 2, 0.5);
      if (k.vy < 3) {
        this.rockets.splice(i, 1);
        const n = k.show ? (k.big ? 210 : 130) : k.big ? 150 : 90;
        const sp = k.big ? 15 : 11;
        for (let j = 0; j < n; j++) {
          // dirección uniforme en la esfera
          const u = r() * 2 - 1;
          const th = r() * Math.PI * 2;
          const s = Math.sqrt(1 - u * u);
          const v = sp * (0.75 + r() * 0.3);
          const c = j % 5 === 0 ? k.color2 : k.color;
          spk.spawn(k.x, k.y, k.z, s * Math.cos(th) * v, u * v, s * Math.sin(th) * v, c, 1.5 + r() * 0.9, k.show ? 0.8 : 0.55, 0.3, 1, 3.5, 1.4);
        }
        // humo tenue de la explosión
        this.tmpC.setRGB(0.55, 0.55, 0.58);
        for (let j = 0; j < 6; j++) smk.spawn(k.x + (r() - 0.5) * 3, k.y + (r() - 0.5) * 3, k.z + (r() - 0.5) * 3, 0, 0.2, 0, this.tmpC, 4 + r() * 2, 3, 9, 0.18, 0, 0.2);
        this.onBurst?.(this.camPos.distanceTo(new THREE.Vector3(k.x, k.y, k.z)));
      }
    }

    // papelitos (se sueltan poco a poco)
    const nConf = Math.min(this.confettiQueue.length, Math.ceil(d * 600));
    for (let i = 0; i < nConf; i++) {
      const q = this.confettiQueue.pop()!;
      const s = q.spot;
      this.confetti.spawn(s.x - s.nx * r() * 2, s.y + 2.5 + r() * 5, s.z - s.nz * r() * 2,
        -s.nx * (1 + r() * 2) + (r() - 0.5), 1 + r() * 2.5, -s.nz * (1 + r() * 2) + (r() - 0.5),
        q.color, 6 + r() * 4, 0.16, 0.14, 1, 1.4, 1.1);
    }

    this.smoke.update(d, wx, wz, this.time);
    this.sparks.update(d, wx, wz, this.time);
    this.confetti.update(d, wx, wz, this.time);
    this.showSmoke?.update(d, wx, wz, this.time);
    this.hazeSmoke?.update(d, wx, wz, this.time);
    this.showSparks?.update(d, wx, wz, this.time);
  }

  /** Hay efectos en marcha (para pruebas). */
  get busy() {
    return this.emitters.length > 0 || this.rockets.length > 0 || this.smoke.active || this.sparks.active || this.confetti.active || !!this.showSmoke?.active || !!this.hazeSmoke?.active || !!this.showSparks?.active;
  }

  get flagCount() {
    return this.flags.flagCount;
  }

  dispose() {
    this.smoke.dispose();
    this.sparks.dispose();
    this.confetti.dispose();
    this.showSmoke?.dispose();
    this.hazeSmoke?.dispose();
    this.showSparks?.dispose();
    for (const L of this.lasers) {
      L.mesh.geometry.dispose();
      L.glow.geometry.dispose();
      (L.mesh.material as THREE.Material).dispose();
      (L.glow.material as THREE.Material).dispose();
    }
    for (const l of this.washes) l.dispose();
    this.flags.dispose();
  }
}
