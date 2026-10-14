import * as THREE from 'three';
import type { FanSpot } from './crowd';
import { mulberry32 } from './textures';

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
}

const LIMITS = {
  low: { smoke: 260, sparks: 900, confetti: 500, flags: 26 },
  medium: { smoke: 520, sparks: 1800, confetti: 1200, flags: 70 },
  high: { smoke: 800, sparks: 2600, confetti: 1800, flags: 110 },
};

export class FanEffects {
  readonly group = new THREE.Group();
  /** Se llama en cada explosión de fuegos artificiales (para el sonido). Recibe la distancia a la cámara. */
  onBurst: ((distance: number) => void) | null = null;
  private smoke: Particles;
  private sparks: Particles;
  private confetti: Particles;
  private flagMesh: THREE.InstancedMesh;
  private poleMesh: THREE.InstancedMesh;
  private flagUniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
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

  constructor(private spots: FanSpot[], o: FanFxOptions) {
    this.rand = mulberry32(o.seed ^ 0x7f4a11);
    const r = this.rand;
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
    this.farSpots = low.filter((s) => s.nz < -0.5 || Math.abs(s.nx) > 0.5);
    if (this.farSpots.length === 0) this.farSpots = low.length ? low : spots;

    this.smoke = new Particles(lim.smoke, 0);
    this.sparks = new Particles(lim.sparks, 1);
    this.confetti = new Particles(lim.confetti, 2);
    this.group.add(this.smoke.points, this.confetti.points, this.sparks.points);

    // ---- banderas en las gradas (flamean con el viento y más fuerte con la emoción del partido)
    const nFlags = Math.min(lim.flags, low.length);
    const fg = new THREE.PlaneGeometry(2.4, 1.5, 12, 2);
    fg.translate(1.2, 0, 0);
    const phase = new Float32Array(nFlags);
    const col2 = new Float32Array(nFlags * 3);
    const fm = new THREE.ShaderMaterial({
      uniforms: this.flagUniforms,
      side: THREE.DoubleSide,
      vertexShader: `uniform float uTime;
        uniform float uExcite;
        attribute float aPhase;
        attribute vec3 aCol2;
        varying vec2 vUv;
        varying vec3 vC1;
        varying vec3 vC2;
        varying float vShade;
        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING_COLOR
            vC1 = instanceColor;
          #else
            vC1 = vec3(1.0);
          #endif
          vC2 = aCol2;
          vec3 p = position;
          float w = uv.x;
          float amp = 0.18 + 0.2 * uExcite;
          float wave = sin(uv.x * 5.5 - uTime * (5.0 + 3.0 * uExcite) + aPhase * 6.28);
          p.z += wave * amp * w;
          p.y += cos(uv.x * 4.0 - uTime * 4.0 + aPhase * 3.0) * 0.05 * w;
          // el hincha agita la bandera de lado a lado
          float swing = sin(uTime * (1.4 + uExcite * 2.5) + aPhase * 9.0) * (0.25 + 0.55 * uExcite);
          p.z += swing * w * 0.9;
          vShade = 0.72 + 0.28 * cos(uv.x * 5.5 - uTime * 5.0 + aPhase * 6.28);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying vec2 vUv;
        varying vec3 vC1;
        varying vec3 vC2;
        varying float vShade;
        void main() {
          // tres franjas verticales: color del club, color secundario, color del club
          float mid = step(0.34, vUv.x) * step(vUv.x, 0.66);
          vec3 c = mix(vC1, vC2, mid);
          gl_FragColor = vec4(c * vShade, 1.0);
        }`,
    });
    this.flagMesh = new THREE.InstancedMesh(fg, fm, Math.max(1, nFlags));
    this.poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 4).translate(0, 1.6, 0), new THREE.MeshBasicMaterial({ color: 0x3a3a3a }), Math.max(1, nFlags));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const white = new THREE.Color('#f4f4f4');
    const used = new Set<number>();
    for (let i = 0; i < nFlags; i++) {
      let k = Math.floor(r() * low.length);
      for (let t = 0; t < 6 && used.has(k); t++) k = Math.floor(r() * low.length);
      used.add(k);
      const s = low[k];
      q.setFromAxisAngle(Y, Math.atan2(-s.nx, -s.nz) + (r() - 0.5) * 0.5);
      m4.compose(new THREE.Vector3(s.x, s.y + 1.3, s.z), q, one);
      this.poleMesh.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(s.x, s.y + 3.9, s.z), q, one);
      this.flagMesh.setMatrixAt(i, m4);
      const c = s.away ? this.away : this.home;
      this.flagMesh.setColorAt(i, c);
      (r() < 0.6 ? white : c.clone().multiplyScalar(0.45)).toArray(col2, i * 3);
      phase[i] = r();
    }
    fg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    fg.setAttribute('aCol2', new THREE.InstancedBufferAttribute(col2, 3));
    this.flagMesh.count = nFlags;
    this.poleMesh.count = nFlags;
    this.flagMesh.frustumCulled = false;
    this.poleMesh.frustumCulled = false;
    this.flagMesh.name = 'fan-flags';
    this.group.add(this.flagMesh, this.poleMesh);
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
  private rocket(delay: number, big = false, team: THREE.Color | null = null) {
    const r = this.rand;
    // casi todos desde las primeras filas de enfrente (se ven con la cámara de transmisión); algunos desde arriba
    const s = this.pick(r() < 0.75 ? this.farSpots : this.topSpots);
    const palette = [new THREE.Color('#ffd23f'), new THREE.Color('#ff4d5e'), new THREE.Color('#4fc3ff'), new THREE.Color('#ffffff'), new THREE.Color('#b26bff'), new THREE.Color('#19e68c')];
    const c = team && r() < 0.6 ? team.clone().lerp(new THREE.Color('#ffffff'), 0.25) : palette[Math.floor(r() * palette.length)];
    this.rockets.push({
      x: s.x - s.nx * 2, y: s.y + 2, z: s.z - s.nz * 2,
      vx: -s.nx * (2 + r() * 3) + (r() - 0.5) * 3, vy: 16 + r() * 5, vz: -s.nz * (2 + r() * 3) + (r() - 0.5) * 3,
      color: c, color2: palette[Math.floor(r() * palette.length)], delay, big,
    });
  }

  /** Recibimiento: fuegos artificiales, bengalas de ambas hinchadas y lluvia de papelitos. */
  welcome() {
    for (let i = 0; i < 16; i++) this.rocket(0.2 + i * 0.32 + this.rand() * 0.3, i % 4 === 0, i % 2 ? this.home : null);
    for (let i = 0; i < 9; i++) this.flare(this.pickFar(this.homeSpots), this.smokeColor(this.home), 9 + this.rand() * 6);
    for (let i = 0; i < 5; i++) this.flare(this.pick(this.awaySpots), this.smokeColor(this.away), 9 + this.rand() * 6);
    this.queueConfetti(this.homeSpots, this.home, 700);
    this.queueConfetti(this.awaySpots, this.away, 250);
  }

  /** Gol: la hinchada del equipo que marca enciende bengalas, tira papelitos y hay fuegos artificiales. */
  goal(team: 0 | 1) {
    const spots = team === 0 ? this.homeSpots : this.awaySpots;
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
    this.flagUniforms.uTime.value = this.time;
    this.flagUniforms.uExcite.value += (excitement - this.flagUniforms.uExcite.value) * Math.min(1, d * 2);
    camera.getWorldPosition(this.camPos);

    // bengalas espontáneas de vez en cuando (más si el partido está caliente)
    if (this.time > this.nextAmbient) {
      this.nextAmbient = this.time + (55 + r() * 70) * (1 - 0.4 * excitement);
      const away = r() < 0.35;
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) this.flare(this.pickFar(away ? this.awaySpots : this.homeSpots), this.smokeColor(away ? this.away : this.home), 8 + r() * 6);
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
      e.acc += d * 15;
      while (e.acc >= 1) {
        e.acc -= 1;
        const shade = 0.85 + r() * 0.3;
        this.tmpC.copy(e.color).multiplyScalar(shade);
        this.smoke.spawn(e.x + (r() - 0.5) * 0.4, e.y, e.z + (r() - 0.5) * 0.4,
          (r() - 0.5) * 0.6 - e.nx * 0.5, 1.4 + r() * 1.2, (r() - 0.5) * 0.6 - e.nz * 0.5,
          this.tmpC, 5 + r() * 3, 1.8, 10 + r() * 4, 0.7, -0.05, 0.35);
      }
      // resplandor de la bengala
      if (r() < 0.85) {
        this.tmpC.setRGB(1, 0.35 + r() * 0.25, 0.15);
        this.sparks.spawn(e.x, e.y + 0.2, e.z, (r() - 0.5) * 0.6, 0.6 + r(), (r() - 0.5) * 0.6, this.tmpC, 0.18 + r() * 0.12, 0.9 + r() * 0.5, 0.3, 0.9, 0, 0);
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
      this.tmpC.setRGB(1, 0.75, 0.4);
      this.sparks.spawn(k.x, k.y, k.z, (r() - 0.5) * 0.8, -1 - r(), (r() - 0.5) * 0.8, this.tmpC, 0.5, 0.35, 0.1, 0.8, 2, 0.5);
      if (k.vy < 3) {
        this.rockets.splice(i, 1);
        const n = k.big ? 150 : 90;
        const sp = k.big ? 15 : 11;
        for (let j = 0; j < n; j++) {
          // dirección uniforme en la esfera
          const u = r() * 2 - 1;
          const th = r() * Math.PI * 2;
          const s = Math.sqrt(1 - u * u);
          const v = sp * (0.75 + r() * 0.3);
          const c = j % 5 === 0 ? k.color2 : k.color;
          this.sparks.spawn(k.x, k.y, k.z, s * Math.cos(th) * v, u * v, s * Math.sin(th) * v, c, 1.5 + r() * 0.9, 0.55, 0.3, 1, 3.5, 1.4);
        }
        // humo tenue de la explosión
        this.tmpC.setRGB(0.55, 0.55, 0.58);
        for (let j = 0; j < 6; j++) this.smoke.spawn(k.x + (r() - 0.5) * 3, k.y + (r() - 0.5) * 3, k.z + (r() - 0.5) * 3, 0, 0.2, 0, this.tmpC, 4 + r() * 2, 3, 9, 0.18, 0, 0.2);
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
  }

  /** Hay efectos en marcha (para pruebas). */
  get busy() {
    return this.emitters.length > 0 || this.rockets.length > 0 || this.smoke.active || this.sparks.active || this.confetti.active;
  }

  get flagCount() {
    return this.flagMesh.count;
  }

  dispose() {
    this.smoke.dispose();
    this.sparks.dispose();
    this.confetti.dispose();
    this.flagMesh.geometry.dispose();
    (this.flagMesh.material as THREE.Material).dispose();
    this.flagMesh.dispose();
    this.poleMesh.geometry.dispose();
    (this.poleMesh.material as THREE.Material).dispose();
    this.poleMesh.dispose();
  }
}
