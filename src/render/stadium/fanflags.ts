import * as THREE from 'three';
import type { FanSpot } from './crowd';

// Banderas de la hinchada: banderas con mástil (varios diseños y tamaños), trapos colgados en la
// baranda de la primera fila (con texto), la bandera gigante de la barra brava y los bombos.

/** Diseños de tela compartidos (0 tricolor vertical, 1 franjas horizontales, 2 banda diagonal, 3 mitades, 4 escudo). */
const PATTERN_GLSL = `
vec3 flagPattern(vec2 uv, float pat, vec3 c1, vec3 c2) {
  float m;
  if (pat < 0.5) m = step(0.34, uv.x) * step(uv.x, 0.66);
  else if (pat < 1.5) m = step(0.34, uv.y) * step(uv.y, 0.66);
  else if (pat < 2.5) m = step(abs(uv.x - uv.y * 0.7 - 0.15), 0.17);
  else if (pat < 3.5) m = step(0.5, uv.x);
  else {
    vec2 d = (uv - 0.5) * vec2(1.7, 1.0);
    float r = length(d);
    m = step(r, 0.3) * (1.0 - step(r, 0.2)) + step(r, 0.12);
  }
  return mix(c1, c2, m);
}
// trama de la tela y un poco de suciedad para que no parezca plástico
float cloth(vec2 uv) {
  return 0.94 + 0.06 * sin(uv.y * 140.0) * sin(uv.x * 90.0);
}`;

export interface FlagsOptions {
  home: THREE.Color;
  away: THREE.Color;
  homeName: string;
  awayName: string;
  flags: number;
  trapos: number;
  drums: number;
  rand: () => number;
}

/** Textura con los textos de los trapos (si hay DOM; en las pruebas sin navegador se omite). */
function makeTextAtlas(lines: string[]): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128 * lines.length;
  const g = c.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((t, i) => {
    let size = 92;
    g.font = `900 ${size}px Arial Black, Impact, sans-serif`;
    while (g.measureText(t).width > 960 && size > 30) {
      size -= 4;
      g.font = `900 ${size}px Arial Black, Impact, sans-serif`;
    }
    const y = i * 128 + 66;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(t, 512, y);
    g.fillStyle = '#ffffff';
    g.fillText(t, 512, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export class FanFlags {
  readonly group = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  private giantUniforms = { uTime: { value: 0 }, uShow: { value: 0 } };
  private flagMesh: THREE.InstancedMesh;
  private poleMesh: THREE.InstancedMesh;
  private trapoMesh: THREE.InstancedMesh | null = null;
  private giant: THREE.Mesh | null = null;
  private drums: THREE.InstancedMesh | null = null;
  private drumBase: THREE.Matrix4[] = [];
  private textTex: THREE.Texture | null;
  private showUntil = -1;
  private time = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly tmpV = new THREE.Vector3();
  private disposables: { dispose(): void }[] = [];

  constructor(spots: FanSpot[], o: FlagsOptions) {
    const r = o.rand;
    const low = spots.filter((s) => s.tier <= 1);
    const barra = low.filter((s) => s.barra);
    const white = new THREE.Color('#f4f4f4');
    const black = new THREE.Color('#141414');
    const colorsFor = (s: FanSpot) => {
      const c1 = s.away ? o.away : o.home;
      const k = r();
      const c2 = k < 0.55 ? white : k < 0.75 ? black : c1.clone().multiplyScalar(0.4);
      return [c1, c2] as const;
    };
    const Y = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();

    // ---------------- banderas con mástil ----------------
    // la mitad, en la barra brava
    const nFlags = Math.min(o.flags, low.length);
    const chosen: FanSpot[] = [];
    const pool = [...low];
    for (let i = 0; i < nFlags && pool.length; i++) {
      const src = barra.length && i % 2 === 0 ? barra : pool;
      chosen.push(src[Math.floor(r() * src.length)]);
    }
    const fg = new THREE.PlaneGeometry(1, 1, 16, 4);
    fg.translate(0.5, 0, 0);
    const phase = new Float32Array(Math.max(1, chosen.length));
    const col1 = new Float32Array(Math.max(1, chosen.length) * 3);
    const col2 = new Float32Array(Math.max(1, chosen.length) * 3);
    const pat = new Float32Array(Math.max(1, chosen.length));
    const fm = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      vertexShader: `uniform float uTime;
        uniform float uExcite;
        attribute float aPhase;
        attribute float aPat;
        attribute vec3 aCol1;
        attribute vec3 aCol2;
        varying vec2 vUv;
        varying vec3 vC1;
        varying vec3 vC2;
        varying float vPat;
        varying float vShade;
        void main() {
          vUv = uv;
          vC1 = aCol1;
          vC2 = aCol2;
          vPat = aPat;
          vec3 p = position;
          float w = uv.x;
          float speed = 5.0 + 3.0 * uExcite;
          float k1 = uv.x * 6.0 - uTime * speed + aPhase * 6.28;
          float k2 = uv.x * 3.1 + uv.y * 2.0 - uTime * speed * 0.7 + aPhase * 4.0;
          float amp = (0.16 + 0.2 * uExcite) * w;
          p.z += (sin(k1) * 0.7 + sin(k2) * 0.3) * amp;
          // la tela cae un poco hacia el extremo libre
          p.y -= w * w * 0.12 * (1.0 - uExcite * 0.5);
          // el hincha agita la bandera de lado a lado
          float swing = sin(uTime * (1.3 + uExcite * 2.6) + aPhase * 9.0) * (0.2 + 0.6 * uExcite);
          p.z += swing * w * 0.8;
          // sombreado por la pendiente de la ola (pliegues)
          float slope = (cos(k1) * 0.7 * 6.0 + cos(k2) * 0.3 * 3.1) * amp;
          vShade = 0.6 + 0.4 / sqrt(1.0 + slope * slope * 0.35);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying vec2 vUv;
        varying vec3 vC1;
        varying vec3 vC2;
        varying float vPat;
        varying float vShade;
        ${PATTERN_GLSL}
        void main() {
          vec3 c = flagPattern(vUv, vPat, vC1, vC2) * vShade * cloth(vUv);
          if (!gl_FrontFacing) c *= 0.82;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.flagMesh = new THREE.InstancedMesh(fg, fm, Math.max(1, chosen.length));
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.035, 1, 5).translate(0, 0.5, 0);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x4a4038 });
    this.poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, Math.max(1, chosen.length));
    chosen.forEach((s, i) => {
      const big = s.barra ? 1.15 + r() * 0.5 : 0.8 + r() * 0.5;
      const fw = 2.3 * big;
      const fh = 1.45 * big;
      const poleH = 2.6 + fh * 0.6;
      q.setFromAxisAngle(Y, Math.atan2(-s.nx, -s.nz) + (r() - 0.5) * 0.7);
      pos.set(s.x, s.y + 1.2, s.z);
      this.m4.compose(pos, q, sc.set(1, poleH, 1));
      this.poleMesh.setMatrixAt(i, this.m4);
      pos.set(s.x, s.y + 1.2 + poleH - fh / 2, s.z);
      this.m4.compose(pos, q, sc.set(fw, fh, 1));
      this.flagMesh.setMatrixAt(i, this.m4);
      const [c1, c2] = colorsFor(s);
      c1.toArray(col1, i * 3);
      c2.toArray(col2, i * 3);
      pat[i] = Math.floor(r() * 5);
      phase[i] = r();
    });
    fg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    fg.setAttribute('aPat', new THREE.InstancedBufferAttribute(pat, 1));
    fg.setAttribute('aCol1', new THREE.InstancedBufferAttribute(col1, 3));
    fg.setAttribute('aCol2', new THREE.InstancedBufferAttribute(col2, 3));
    this.flagMesh.count = chosen.length;
    this.poleMesh.count = chosen.length;
    this.flagMesh.frustumCulled = false;
    this.poleMesh.frustumCulled = false;
    this.flagMesh.name = 'fan-flags';
    this.group.add(this.flagMesh, this.poleMesh);
    this.disposables.push(fg, fm, poleGeo, poleMat, this.flagMesh, this.poleMesh);

    // ---------------- trapos en la baranda de la primera fila ----------------
    const lines = [o.homeName.toUpperCase(), 'LA BARRA', 'VAMOS', 'ALENTANDO', o.awayName.toUpperCase()];
    this.textTex = makeTextAtlas(lines);
    const tier0 = spots.filter((s) => s.tier === 0);
    const minY = tier0.reduce((m, s) => Math.min(m, s.y), Infinity);
    const front = tier0.filter((s) => s.y <= minY + 0.8);
    // primero la barra, luego el resto; separados para que no se monten
    const ordered = [...front.filter((s) => s.barra), ...front.filter((s) => !s.barra).sort(() => r() - 0.5)];
    const traps: { s: FanSpot; w: number }[] = [];
    for (const s of ordered) {
      if (traps.length >= o.trapos) break;
      const w = 5.5 + r() * 3.5;
      if (traps.some((t) => Math.hypot(t.s.x - s.x, t.s.z - s.z) < (t.w + w) / 2 + 0.6)) continue;
      traps.push({ s, w });
    }
    if (traps.length) {
      const tg = new THREE.PlaneGeometry(1, 1, 14, 3);
      const n = traps.length;
      const tPhase = new Float32Array(n);
      const tCol1 = new Float32Array(n * 3);
      const tCol2 = new Float32Array(n * 3);
      const tText = new Float32Array(n);
      const tm = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uText: { value: this.textTex }, uHasText: { value: this.textTex ? 1 : 0 }, uLines: { value: lines.length } },
        side: THREE.DoubleSide,
        vertexShader: `uniform float uTime;
          attribute float aPhase;
          attribute float aText;
          attribute vec3 aCol1;
          attribute vec3 aCol2;
          varying vec2 vUv;
          varying vec3 vC1;
          varying vec3 vC2;
          varying float vText;
          varying float vShade;
          void main() {
            vUv = uv;
            vC1 = aCol1;
            vC2 = aCol2;
            vText = aText;
            vec3 p = position;
            // cuelga de arriba: se mueve más abajo
            float hang = 1.0 - uv.y;
            float k = uv.x * 9.0 + uTime * 1.6 + aPhase * 6.28;
            p.z += sin(k) * 0.06 * hang;
            vShade = 0.85 + 0.15 * cos(k);
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `uniform sampler2D uText;
          uniform float uHasText;
          uniform float uLines;
          varying vec2 vUv;
          varying vec3 vC1;
          varying vec3 vC2;
          varying float vText;
          varying float vShade;
          ${PATTERN_GLSL}
          void main() {
            // franjas: color del club arriba y abajo, color secundario en el centro con el texto
            vec3 c = flagPattern(vec2(0.5, vUv.y), 1.0, vC1, vC2);
            if (uHasText > 0.5) {
              vec2 tuv = vec2(vUv.x, (uLines - 1.0 - vText + clamp((vUv.y - 0.12) / 0.76, 0.0, 1.0)) / uLines);
              vec4 t = texture2D(uText, tuv);
              c = mix(c, t.rgb, t.a);
            }
            c *= vShade * cloth(vUv);
            if (!gl_FrontFacing) c *= 0.8;
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      this.trapoMesh = new THREE.InstancedMesh(tg, tm, n);
      traps.forEach(({ s, w }, i) => {
        q.setFromAxisAngle(Y, Math.atan2(-s.nx, -s.nz));
        pos.set(s.x - s.nx * 1.0, s.y - 0.35, s.z - s.nz * 1.0);
        this.m4.compose(pos, q, sc.set(w, 1.25, 1));
        this.trapoMesh!.setMatrixAt(i, this.m4);
        const c1 = s.away ? o.away : o.home;
        c1.toArray(tCol1, i * 3);
        (r() < 0.7 ? white : black).toArray(tCol2, i * 3);
        tText[i] = s.away ? 4 : s.barra ? (i % 2 ? 1 : 0) : Math.floor(r() * 4);
        tPhase[i] = r();
      });
      tg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(tPhase, 1));
      tg.setAttribute('aText', new THREE.InstancedBufferAttribute(tText, 1));
      tg.setAttribute('aCol1', new THREE.InstancedBufferAttribute(tCol1, 3));
      tg.setAttribute('aCol2', new THREE.InstancedBufferAttribute(tCol2, 3));
      this.trapoMesh.frustumCulled = false;
      this.trapoMesh.name = 'fan-trapos';
      this.group.add(this.trapoMesh);
      this.disposables.push(tg, tm, this.trapoMesh);
    }
    if (this.textTex) this.disposables.push(this.textTex);

    // ---------------- bandera gigante de la barra ----------------
    if (barra.length > 8) {
      const n = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (const s of barra) {
        n.x += s.nx;
        n.z += s.nz;
        c.x += s.x;
        c.y += s.y;
        c.z += s.z;
      }
      n.normalize();
      c.divideScalar(barra.length);
      const t = new THREE.Vector3(-n.z, 0, n.x);
      let tMin = Infinity;
      let tMax = -Infinity;
      let dMin = Infinity;
      let dMax = -Infinity;
      let yAtMin = 0;
      let yAtMax = 0;
      for (const s of barra) {
        const u = (s.x - c.x) * t.x + (s.z - c.z) * t.z;
        const d = (s.x - c.x) * n.x + (s.z - c.z) * n.z;
        tMin = Math.min(tMin, u);
        tMax = Math.max(tMax, u);
        if (d < dMin) { dMin = d; yAtMin = s.y; }
        if (d > dMax) { dMax = d; yAtMax = s.y; }
      }
      const slope = Math.atan2(Math.max(0.5, yAtMax - yAtMin), Math.max(1, dMax - dMin));
      const width = THREE.MathUtils.clamp((tMax - tMin) * 0.75, 14, 36);
      const height = THREE.MathUtils.clamp((dMax - dMin) / Math.cos(slope) * 0.85, 7, 16);
      const up = new THREE.Vector3(0, 1, 0);
      const along = n.clone().multiplyScalar(Math.cos(slope)).addScaledVector(up, Math.sin(slope)); // sube por la grada
      const normal = up.clone().multiplyScalar(Math.cos(slope)).addScaledVector(n, -Math.sin(slope)); // hacia el campo y arriba
      const basis = new THREE.Matrix4().makeBasis(t, along, normal);
      // borde inferior en las primeras filas de la barra, levantada sobre las cabezas
      const bottom = c.clone().addScaledVector(n, dMin - 0).setY(yAtMin + 2.0);
      basis.setPosition(bottom);
      const gg = new THREE.PlaneGeometry(1, 1, 40, 18).translate(0, 0.5, 0);
      gg.scale(width, height, 1);
      const gm = new THREE.ShaderMaterial({
        uniforms: { ...this.giantUniforms, uC1: { value: o.home.clone() }, uC2: { value: white.clone() } },
        side: THREE.DoubleSide,
        vertexShader: `uniform float uTime;
          uniform float uShow;
          varying vec2 vUv;
          varying float vShade;
          void main() {
            vUv = uv;
            vec3 p = position;
            // se despliega desde abajo
            p.y *= uShow;
            // la gente de abajo la sacude: olas que la cruzan
            float k1 = uv.x * 7.0 - uTime * 2.4;
            float k2 = uv.y * 5.0 + uTime * 1.9 + uv.x * 2.0;
            p.z += (sin(k1) * 0.55 + sin(k2) * 0.45) * 0.55 * uShow;
            vShade = 0.72 + 0.14 * cos(k1) + 0.14 * cos(k2);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `uniform vec3 uC1;
          uniform vec3 uC2;
          varying vec2 vUv;
          varying float vShade;
          ${PATTERN_GLSL}
          void main() {
            vec3 c = flagPattern(vUv, 0.0, uC1, uC2);
            // escudo grande en el centro
            vec2 d = (vUv - 0.5) * vec2(2.2, 1.0);
            float r = length(d);
            c = mix(c, uC1 * 0.75, step(r, 0.22));
            c = mix(c, uC2, step(r, 0.16) * (1.0 - step(r, 0.11)));
            c *= vShade * cloth(vUv * 3.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      this.giant = new THREE.Mesh(gg, gm);
      this.giant.matrixAutoUpdate = false;
      this.giant.matrix.copy(basis);
      this.giant.frustumCulled = false;
      this.giant.visible = false;
      this.giant.name = 'fan-giant-flag';
      this.group.add(this.giant);
      this.disposables.push(gg, gm);
    }

    // ---------------- bombos de la barra ----------------
    const drumSpots = [...barra].sort((a, b) => a.tier - b.tier || a.y - b.y).filter((_, i) => i % 2 === 0).slice(0, o.drums);
    if (drumSpots.length) {
      const dg = new THREE.CylinderGeometry(0.4, 0.4, 0.55, 14);
      const side = new THREE.MeshBasicMaterial({ color: o.home.clone().multiplyScalar(0.85) });
      const head = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
      this.drums = new THREE.InstancedMesh(dg, [side, head, head], drumSpots.length);
      drumSpots.forEach((s, i) => {
        // el parche mira a un costado (eje a lo largo de la grada), a la altura de la cintura
        q.setFromUnitVectors(Y, this.tmpV.set(-s.nz, 0, s.nx).normalize());
        pos.set(s.x - s.nx * 0.45, s.y + 0.95, s.z - s.nz * 0.45);
        const m = new THREE.Matrix4().compose(pos, q, sc.set(1, 1, 1));
        this.drumBase.push(m);
        this.drums!.setMatrixAt(i, m);
      });
      this.drums.frustumCulled = false;
      this.drums.name = 'fan-drums';
      this.group.add(this.drums);
      this.disposables.push(dg, side, head, this.drums);
    }
  }

  /** Despliega la bandera gigante durante `seconds`. */
  showGiant(seconds: number) {
    this.showUntil = Math.max(this.showUntil, this.time + seconds);
  }

  update(dt: number, excitement: number) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uExcite.value += (excitement - this.uniforms.uExcite.value) * Math.min(1, dt * 2);
    if (this.giant) {
      const target = this.time < this.showUntil ? 1 : 0;
      const u = this.giantUniforms.uShow;
      u.value += (target - u.value) * Math.min(1, dt * (target ? 0.9 : 1.6));
      if (target === 0 && u.value < 0.01) u.value = 0;
      this.giantUniforms.uTime.value = this.time;
      this.giant.visible = u.value > 0.005;
    }
    if (this.drums) {
      // los bombos saltan con cada golpe (mismo pulso que el salto de la barra)
      for (let i = 0; i < this.drumBase.length; i++) {
        const b = Math.abs(Math.sin(this.time * 7.48 + i * 0.3)) * 0.07;
        this.m4.copy(this.drumBase[i]);
        this.m4.elements[13] += b;
        this.drums.setMatrixAt(i, this.m4);
      }
      this.drums.instanceMatrix.needsUpdate = true;
    }
  }

  get flagCount() {
    return this.flagMesh.count;
  }

  get trapoCount() {
    return this.trapoMesh?.count ?? 0;
  }

  get drumCount() {
    return this.drumBase.length;
  }

  get giantVisible() {
    return !!this.giant?.visible;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
