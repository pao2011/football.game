// Render 3D (three.js): circuito, coches, boxes, escenario, cielo, lluvia, partículas y cámaras.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DRIVERS, TEAMS, TYRES, type Theme } from './data';
import { Track, GRASS, GRAVEL, KERB_W, BOX_SPACING } from './track';
import type { Sim, Car } from './sim';

const THEMES: Record<Theme, { ground: number; lawn: number; tree: number; hill: number; kerb: number }> = {
  green: { ground: 0x4a7733, lawn: 0x5c8f3d, tree: 0x2c5626, hill: 0x47693a, kerb: 0xd0202a },
  desert: { ground: 0xc7a269, lawn: 0xd3b47d, tree: 0x8d7448, hill: 0xb58a57, kerb: 0x1d57b8 },
  street: { ground: 0x5a5d61, lawn: 0x6c6f73, tree: 0x8f959c, hill: 0x767b82, kerb: 0xd0202a },
  nordic: { ground: 0xe4ebef, lawn: 0xd5dfe5, tree: 0x27463a, hill: 0xf1f4f6, kerb: 0x1f8a4c },
};
const SPONSORS = ['APEX GP', 'VOLTIA', 'NIMBUS AIR', 'KRONO', 'ORBITAL', 'LUMEN'];
const CARBON = 0x15161a;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 4;
  return tx;
}
const noiseTex = () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 150 + Math.random() * 105; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
});
const bannerTex = () => canvasTex(2048, 64, (g) => {
  const cols = ['#e9e9e9', '#c81e2a', '#1b3f8f', '#111', '#e0b400', '#0a7d5a'];
  for (let i = 0; i < 16; i++) {
    g.fillStyle = cols[i % 2 ? (i >> 1) % cols.length : 0]; g.fillRect(i * 128, 0, 128, 64);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(i * 128, 0, 2, 64); g.fillRect(i * 128, 56, 128, 8);
    if (i % 2) { g.fillStyle = i % 4 === 3 && (i >> 1) % cols.length === 4 ? '#111' : '#fff'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText(SPONSORS[(i >> 1) % SPONSORS.length], i * 128 + 64, 42, 118); }
  }
});
const crowdTex = () => canvasTex(256, 128, (g) => {
  g.fillStyle = '#2b2f36'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `hsl(${Math.random() * 360},${40 + Math.random() * 40}%,${40 + Math.random() * 35}%)`; g.fillRect(Math.random() * 256, Math.random() * 128, 3, 4); }
});
const blobTex = () => canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}, false);

/** Acumulador de cuádruples con color por vértice. */
class Geo {
  p: number[] = []; c: number[] = []; u: number[] = [];
  private col = new THREE.Color();
  quad(a: number[], b: number[], c: number[], d: number[], color: number, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    // a-b: borde cercano; c-d: borde lejano
    this.p.push(...a, ...b, ...c, ...b, ...d, ...c);
    this.u.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1);
    this.col.setHex(color);
    for (let i = 0; i < 6; i++) this.c.push(this.col.r, this.col.g, this.col.b);
  }
  /** franja a lo largo del circuito entre dos desplazamientos laterales; color(i) = null omite el tramo */
  strip(t: Track, from: number, count: number, a: (i: number) => number, b: (i: number) => number, y: number, color: (i: number) => number | null, wall = 0) {
    for (let k = 0; k < count; k++) {
      const i = t.idx(from + k), j = t.idx(i + 1), col = color(i);
      if (col === null) continue;
      let a0 = a(i), b0 = wall ? a0 : b(i), a1 = a(j), b1 = wall ? a1 : b(j);
      if (b0 < a0) { [a0, b0] = [b0, a0]; [a1, b1] = [b1, a1]; }
      const P = (m: number, o: number, yy: number) => [t.px[m] + t.nx[m] * o, yy, t.pz[m] + t.nz[m] * o];
      const v0 = (i * t.ds) / 4, v1 = v0 + t.ds / 4;
      if (wall) {
        // en los muros la textura corre a lo largo (u = distancia, v = altura)
        this.quad(P(i, a0, y), P(i, a0, y + wall), P(j, a1, y), P(j, a1, y + wall), col);
        const U0 = v0 / 16, U1 = v1 / 16;
        this.u.splice(this.u.length - 12, 12, U0, 0, U0, 1, U1, 0, U0, 1, U1, 1, U1, 0);
      } else this.quad(P(i, a0, y), P(i, b0, y), P(j, a1, y), P(j, b1, y), col, a0 / 4, v0, b0 / 4, v1);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeVertexNormals();
    return g;
  }
}
/** caja con secciones distintas delante y detrás: [yInferior, ySuperior, semiancho] */
function wedge(x0: number, x1: number, r: number[], f: number[], zc = 0) {
  const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i) > 0 ? f : r;
    p.setXYZ(i, p.getX(i) > 0 ? x1 : x0, p.getY(i) > 0 ? s[1] : s[0], zc + (p.getZ(i) > 0 ? 1 : -1) * s[2]);
  }
  g.computeVertexNormals();
  return g;
}
function paint(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

/** Monoplaza genérico: morro, alerones, pontones, halo, casco. Decoración por colores de equipo. */
function carGeometry(c1: number, c2: number, c3: number, helmet: number, tcam: number) {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, col: number) => parts.push(paint(g, col));
  add(wedge(-2.3, 1.9, [0.03, 0.09, 0.72], [0.03, 0.09, 0.45]), CARBON); // fondo plano
  add(wedge(0.1, 1.9, [0.09, 0.62, 0.36], [0.12, 0.42, 0.24]), c1); // monocasco
  add(wedge(1.9, 3.05, [0.12, 0.42, 0.24], [0.14, 0.24, 0.09]), c1); // morro
  add(wedge(2.7, 3.06, [0.13, 0.3, 0.13], [0.14, 0.245, 0.092]), c3);
  add(wedge(-0.6, 0.1, [0.09, 0.7, 0.34], [0.09, 0.62, 0.36]), c1);
  add(wedge(-2.2, -0.6, [0.12, 0.42, 0.1], [0.09, 0.7, 0.34]), c1); // cubierta motor
  add(wedge(-1.3, -0.4, [0.6, 0.78, 0.06], [0.68, 0.98, 0.14]), c2); // toma de aire
  add(wedge(-2.2, -1.2, [0.4, 0.78, 0.015], [0.6, 0.8, 0.015]), c3); // aleta
  for (const s of [-1, 1]) {
    add(wedge(-1.7, 0.7, [0.09, 0.3, 0.16], [0.09, 0.52, 0.3], s * 0.62), c2); // pontones
    add(wedge(0.68, 0.72, [0.14, 0.48, 0.24], [0.14, 0.48, 0.24], s * 0.62), CARBON);
    add(wedge(2.4, 3.0, [0.05, 0.32, 0.012], [0.05, 0.2, 0.012], s * 0.93), c3); // derivas delanteras
    add(wedge(-2.65, -2.15, [0.45, 1.02, 0.012], [0.45, 1.02, 0.012], s * 0.5), c1); // derivas traseras
    add(wedge(0.7, 0.82, [0.58, 0.64, 0.07], [0.58, 0.64, 0.07], s * 0.47), c1); // retrovisores
    for (const [x, y] of [[1.75, 0.22], [1.75, 0.42], [-1.85, 0.22], [-1.85, 0.4]]) add(wedge(x - 0.03, x + 0.03, [y, y + 0.03, 0.3], [y, y + 0.03, 0.3], s * 0.5), CARBON); // suspensión
  }
  add(wedge(2.45, 3.0, [0.07, 0.11, 0.93], [0.07, 0.1, 0.93]), c2); // alerón delantero
  add(wedge(2.4, 2.75, [0.19, 0.22, 0.9], [0.14, 0.17, 0.9]), c1);
  add(wedge(-2.55, -2.2, [0.9, 0.93, 0.5], [0.84, 0.87, 0.5]), c2); // alerón trasero
  add(wedge(-2.62, -2.38, [1.0, 1.03, 0.5], [0.94, 0.97, 0.5]), c3);
  add(wedge(-2.5, -2.25, [0.42, 0.45, 0.45], [0.42, 0.45, 0.45]), CARBON);
  add(wedge(-2.4, -2.2, [0.3, 0.86, 0.03], [0.3, 0.86, 0.03]), CARBON);
  add(wedge(-2.6, -2.2, [0.1, 0.3, 0.5], [0.05, 0.12, 0.6]), CARBON); // difusor
  add(wedge(-2.64, -2.6, [0.3, 0.4, 0.04], [0.3, 0.4, 0.04]), 0xff2020); // luz de lluvia
  const halo = new THREE.TorusGeometry(0.33, 0.035, 6, 14, Math.PI);
  halo.rotateX(Math.PI / 2); halo.rotateY(Math.PI / 2); halo.scale(1.7, 1, 1); halo.translate(0.28, 0.8, 0);
  add(halo, CARBON);
  add(wedge(0.8, 0.95, [0.55, 0.8, 0.025], [0.5, 0.6, 0.025]), CARBON);
  const hel = new THREE.SphereGeometry(0.15, 12, 8); hel.translate(0.2, 0.7, 0);
  add(hel, helmet);
  add(wedge(0.27, 0.36, [0.68, 0.75, 0.11], [0.68, 0.74, 0.08]), 0x101010); // visera
  add(wedge(-0.8, -0.66, [0.98, 1.04, 0.035], [0.98, 1.04, 0.035]), tcam);
  return mergeGeometries(parts)!;
}
function safetyCarGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, col: number) => parts.push(paint(g, col));
  add(wedge(-2.2, 2.3, [0.18, 0.72, 0.92], [0.18, 0.55, 0.88]), 0xb9c0c8);
  add(wedge(-1.5, 0.6, [0.72, 1.18, 0.7], [0.72, 1.12, 0.74]), 0x1a1d22);
  add(wedge(0.6, 1.2, [0.72, 1.12, 0.74], [0.6, 0.7, 0.8]), 0x1a1d22);
  add(wedge(-0.6, -0.3, [1.18, 1.3, 0.5], [1.18, 1.3, 0.5]), 0xff9a00);
  add(wedge(-2.25, -2.2, [0.5, 0.62, 0.8], [0.5, 0.62, 0.8]), 0xff2020);
  return mergeGeometries(parts)!;
}

const WHEELS = [[1.75, -0.8, 0.31], [1.75, 0.8, 0.31], [-1.85, -0.8, 0.4], [-1.85, 0.8, 0.4]];
const MAXP = 500;

export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, 1, 0.3, 6000);
  camMode = 0;
  showLine = true;
  quality = 1;
  scale = 1;
  private world = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  private hemi = new THREE.HemisphereLight(0xcfe2ff, 0x556644, 0.9);
  private sky = new Sky();
  private pmrem: THREE.PMREMGenerator;
  private env?: THREE.WebGLRenderTarget;
  private noise = noiseTex();
  private banner = bannerTex();
  private crowd = crowdTex();
  private road!: THREE.MeshStandardMaterial;
  private paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.3 });
  private bodies = new Map<Car, THREE.Mesh>();
  private tyres!: THREE.InstancedMesh;
  private rings!: THREE.InstancedMesh;
  private blobs!: THREE.InstancedMesh;
  private crew!: THREE.InstancedMesh;
  private crewK: number[] = [];
  private lineMesh!: THREE.InstancedMesh;
  private lamps: THREE.Mesh[] = [];
  private rainMesh!: THREE.LineSegments;
  private parts!: THREE.Points;
  private pPos = new Float32Array(MAXP * 3); private pVel = new Float32Array(MAXP * 3); private pCol = new Float32Array(MAXP * 4); private pSize = new Float32Array(MAXP); private pLife = new Float32Array(MAXP);
  private pNext = 0;
  private camH = 0;
  private camPos = new THREE.Vector3();
  private shake = 0;
  private m4 = new THREE.Matrix4(); private m4b = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v3 = new THREE.Vector3(); private col = new THREE.Color();
  private track!: Track;
  private lastWet = -1;
  private trash: { dispose(): void }[] = [];

  constructor(canvas: HTMLCanvasElement, quality: number) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.renderer.shadowMap.enabled = quality >= 2;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.sky.scale.setScalar(5000);
    this.scene.add(this.sky, this.hemi, this.sun, this.sun.target, this.world);
    this.sun.castShadow = quality >= 2;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.resize();
  }

  setQuality(q: number) {
    this.quality = q;
    this.renderer.shadowMap.enabled = this.sun.castShadow = q >= 2;
    if (this.blobs) this.blobs.visible = q < 2;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality >= 2 ? 2 : this.quality === 1 ? 1.5 : 1) * this.scale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private setSky(rain: number) {
    const u = this.sky.material.uniforms, el = THREE.MathUtils.degToRad(38), az = THREE.MathUtils.degToRad(215);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - el, az);
    u.sunPosition.value.copy(dir);
    u.turbidity.value = 3 + rain * 17; u.rayleigh.value = 1.6 - rain * 1.3; u.mieCoefficient.value = 0.004 + rain * 0.05; u.mieDirectionalG.value = 0.8;
    this.sun.userData.dir = dir;
    this.sun.intensity = 2.6 - rain * 1.9;
    this.hemi.intensity = 0.9 - rain * 0.25;
    const fog = new THREE.Color(0xbcd0e2).lerp(new THREE.Color(0x7d868d), rain);
    this.scene.fog = new THREE.Fog(fog, 250 - rain * 150, 2600 - rain * 1700);
    this.env?.dispose();
    const s = new THREE.Scene(); s.add(this.sky);
    this.env = this.pmrem.fromScene(s, 0, 0.3, 6000);
    this.scene.add(this.sky);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.75 - rain * 0.3;
  }

  // ------------------------------------------------------------------ construcción de la escena
  load(sim: Sim) {
    const t = (this.track = sim.track), th = THEMES[t.def.theme], W = this.world, n = t.n, hw = t.hw;
    W.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    W.clear();
    this.trash.forEach((x) => x.dispose()); this.trash = [];
    this.bodies.clear(); this.lamps = []; this.lastWet = -1;
    this.setSky(Math.max(sim.rain, sim.wet));
    const std = (o: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, ...o }); this.trash.push(m); return m; };
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => { const x = new THREE.Mesh(g, m); x.receiveShadow = shadow; W.add(x); return x; };
    const vc = std({ vertexColors: true, map: this.noise });

    // suelo y colinas lejanas
    let cx = 0, cz = 0, rad = 0;
    for (let i = 0; i < n; i++) { cx += t.px[i] / n; cz += t.pz[i] / n; }
    for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(t.px[i] - cx, t.pz[i] - cz));
    const gt = this.noise.clone(); gt.repeat.set(900, 900); gt.needsUpdate = true; this.trash.push(gt);
    const ground = mesh(new THREE.CircleGeometry(4500, 48).rotateX(-Math.PI / 2), std({ color: th.ground, map: gt }));
    ground.position.set(cx, -0.06, cz);
    const hills: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7.3) * 0.1, r = rad + 900 + ((i * 53) % 7) * 160, hh = 90 + ((i * 37) % 9) * 38;
      hills.push(new THREE.ConeGeometry(420 + ((i * 29) % 5) * 110, hh, 7, 1).translate(cx + Math.cos(a) * r, hh / 2 - 6, cz + Math.sin(a) * r));
    }
    mesh(mergeGeometries(hills)!, std({ color: th.hill, flatShading: true }), false);

    // escapatorias, asfalto, líneas, pianos
    const run = new Geo(), mk = new Geo();
    for (let s = 0; s < 2; s++) {
      const sg = s ? -1 : 1;
      run.strip(t, 0, n, () => sg * hw, (i) => sg * (hw + t.ro[s][i]), 0.01, (i) => (t.st[s][i] === GRAVEL ? 0xcdb98c : t.st[s][i] === GRASS ? th.lawn : 0x54575c));
      mk.strip(t, 0, n, () => sg * (hw - 0.22), () => sg * hw, 0.035, () => 0xf2f2f2);
      mk.strip(t, 0, n, () => sg * hw, () => sg * (hw + KERB_W), 0.045, (i) => (t.kerb[s][i] ? (i & 1 ? 0xf4f4f4 : th.kerb) : null));
    }
    mesh(run.build(), vc);
    const roadG = new Geo();
    roadG.strip(t, 0, n, () => -hw, () => hw, 0.02, () => 0xffffff);
    this.road = std({ map: this.noise, color: 0x3b3d42, roughness: 0.9 });
    mesh(roadG.build(), this.road);

    // boxes: explanada, líneas, cajones de equipo
    const ps = t.pitSide, pN = Math.floor(t.pitLen / t.ds);
    const pitG = new Geo();
    pitG.strip(t, t.pitIn, pN, () => ps * (hw + 2.3), () => ps * (hw + 13), 0.02, () => 0xffffff);
    mesh(pitG.build(), std({ map: this.noise, color: 0x45484d }));
    mk.strip(t, t.pitIn + 14, pN - 28, () => ps * (hw + 7.6), () => ps * (hw + 7.8), 0.04, () => 0xf2f2f2);
    const frame = (u: number) => { const i = t.idx(t.pitIn + Math.round(u / t.ds)); return { i, x: t.px[i], z: t.pz[i], rot: -Math.atan2(t.tz[i], t.tx[i]) }; };
    const at = (i: number, along: number, off: number, y: number) => [t.px[i] + t.tx[i] * along + t.nx[i] * off, y, t.pz[i] + t.tz[i] * along + t.nz[i] * off];
    const rect = (g: Geo, i: number, a0: number, a1: number, o0: number, o1: number, y: number, col: number) => { if (o1 < o0) [o0, o1] = [o1, o0]; g.quad(at(i, a0, o0, y), at(i, a0, o1, y), at(i, a1, o0, y), at(i, a1, o1, y), col); };
    TEAMS.forEach((tm, k) => { const f = frame(t.boxU(k)); rect(mk, f.i, -3.2, 3.2, ps * (hw + 8.2), ps * (hw + 10.8), 0.04, tm.c[0]); });
    // línea de meta y casillas de parrilla
    for (let k = 0; k < 2 * hw; k++) for (let r = 0; r < 2; r++) rect(mk, 0, r * 0.6, r * 0.6 + 0.6, -hw + k, -hw + k + 1, 0.04, (k + r) & 1 ? 0x111111 : 0xf4f4f4);
    for (let k = 0; k < 22; k++) { const s = t.gridSlot(k); rect(mk, s.i, 2.9, 3.15, s.off - 1.2, s.off + 1.2, 0.04, 0xf2f2f2); rect(mk, s.i, 1.2, 3.15, s.off - 1.3, s.off - 1.1, 0.04, 0xf2f2f2); rect(mk, s.i, 1.2, 3.15, s.off + 1.1, s.off + 1.3, 0.04, 0xf2f2f2); }
    mesh(mk.build(), std({ vertexColors: true, roughness: 0.7 }));

    // muros con publicidad (y muro de boxes con huecos en la entrada y la salida)
    const wl = new Geo();
    for (let s = 0; s < 2; s++) {
      const sg = s ? -1 : 1;
      wl.strip(t, 0, n, (i) => sg * (hw + t.ro[s][i]), () => 0, 0, (i) => { const u = t.pitU(i); return sg === ps && u < t.pitLen && (u < 74 || u > t.pitLen - 74) ? null : 0xffffff; }, 1.15);
    }
    const wm = mesh(wl.build(), std({ map: this.banner, side: THREE.DoubleSide, roughness: 0.8 }));
    wm.castShadow = true;

    // edificio de boxes, garajes y mecánicos
    const u0 = t.boxU(0) - 14, u1 = t.boxU(10) + 14, fm = frame((u0 + u1) / 2);
    const bld = mesh(new THREE.BoxGeometry(u1 - u0, 7, 10), std({ color: 0xe6e8ea, roughness: 0.8 }));
    bld.position.set(fm.x + t.nx[fm.i] * ps * (hw + 19), 3.5, fm.z + t.nz[fm.i] * ps * (hw + 19)); bld.rotation.y = fm.rot; bld.castShadow = true;
    const doors = new THREE.InstancedMesh(new THREE.BoxGeometry(BOX_SPACING - 1.5, 1.1, 0.4), std({ roughness: 0.5 }), 11);
    const holes = new THREE.InstancedMesh(new THREE.BoxGeometry(BOX_SPACING - 3, 3.4, 0.5), std({ color: 0x14161a }), 11);
    TEAMS.forEach((tm, k) => {
      const f = frame(t.boxU(k)), o = ps * (hw + 13.9);
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, f.rot);
      doors.setMatrixAt(k, this.m4.compose(this.v3.set(f.x + t.nx[f.i] * o, 4.4, f.z + t.nz[f.i] * o), this.q, new THREE.Vector3(1, 1, 1)));
      doors.setColorAt(k, this.col.setHex(tm.c[0]));
      holes.setMatrixAt(k, this.m4.compose(this.v3.set(f.x + t.nx[f.i] * o, 1.7, f.z + t.nz[f.i] * o), this.q, new THREE.Vector3(1, 1, 1)));
    });
    W.add(doors, holes);
    const body = new THREE.CylinderGeometry(0.2, 0.24, 1.25, 7).translate(0, 0.63, 0), head = new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.42, 0);
    this.crew = new THREE.InstancedMesh(mergeGeometries([paint(body, 0xffffff), paint(head, 0x888888)])!, std({ vertexColors: true, roughness: 0.8 }), 11 * 14);
    this.crew.castShadow = true;
    TEAMS.forEach((tm, k) => { for (let m = 0; m < 14; m++) this.crew.setColorAt(k * 14 + m, this.col.setHex(tm.c[0])); });
    this.crewK = new Array(11).fill(-1);
    W.add(this.crew);

    // pórtico de salida con semáforo
    const gi = 8, pole = new THREE.BoxGeometry(0.4, 7, 0.4);
    const gan: THREE.BufferGeometry[] = [pole.clone().translate(0, 3.5, -hw - 3), pole.clone().translate(0, 3.5, hw + 3), new THREE.BoxGeometry(0.6, 0.9, 2 * hw + 6.4).translate(0, 7, 0), new THREE.BoxGeometry(0.5, 1.2, 5.6).translate(-0.2, 6, 0)];
    const gm = mesh(mergeGeometries(gan)!, std({ color: 0x23262b, roughness: 0.6 }));
    gm.position.set(t.px[gi], 0, t.pz[gi]); gm.rotation.y = -Math.atan2(t.tz[gi], t.tx[gi]); gm.castShadow = true;
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0x220000 }));
      l.position.set(-0.5, 6, (k - 2) * 1.05); gm.add(l); this.lamps.push(l);
    }

    // tribunas: recta principal y exterior de las frenadas más fuertes
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(9, 0), new THREE.Vector2(9, 8), new THREE.Vector2(8.4, 8), new THREE.Vector2(0, 1.6)]);
    const standGeo = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
    const seats = new THREE.BufferGeometry();
    seats.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.66, 0, 0, 1.66, 1, 8.4, 8.06, 0, 8.4, 8.06, 1], 3));
    seats.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 6, 0, 0, 1, 6, 1], 2));
    seats.setIndex([0, 1, 2, 1, 3, 2]);
    seats.computeVertexNormals();
    const concrete = std({ color: 0x9a9da1 }), crowdM = std({ map: this.crowd, side: THREE.DoubleSide });
    const stand = (i: number, side: number, len: number) => {
      // grada local: +x se aleja de la pista, +z a lo largo
      const o = hw + t.ro[side > 0 ? 0 : 1][i] + 3, ox = t.nx[i] * side, oz = t.nz[i] * side;
      for (const m of [mesh(standGeo, concrete, false), mesh(seats, crowdM, false)]) {
        m.matrixAutoUpdate = false;
        m.matrix.makeBasis(new THREE.Vector3(ox, 0, oz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-oz * len, 0, ox * len)).setPosition(t.px[i] + ox * o + (oz * len) / 2, 0, t.pz[i] + oz * o - (ox * len) / 2);
        m.castShadow = true;
      }
    };
    for (let u = 60; u < t.pitLen - 80; u += 95) stand(frame(u).i, -ps, 85);
    const mins: number[] = [];
    for (let i = 0; i < n; i++) if (t.vt[i] < 45 && t.vt[i] <= t.vt[t.idx(i - 1)] && t.vt[i] < t.vt[t.idx(i + 1)] && mins.every((m) => Math.min(Math.abs(m - i), n - Math.abs(m - i)) > 120) && t.pitU(i) > t.pitLen + 60) mins.push(i);
    if (t.def.theme !== 'street') for (const i of mins.slice(0, 5)) { const s = t.curv[i] > 0 ? -1 : 1; if (t.ro[s > 0 ? 0 : 1][i] > 12) stand(t.idx(i - 8), s, 60); }

    // vegetación / edificios
    const rnd = (() => { let s = 12345 + n; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const street = t.def.theme === 'street', count = Math.round((street ? 170 : t.def.theme === 'desert' ? 160 : 620) * (this.quality === 0 ? 0.55 : 1));
    const tree = street
      ? paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff)
      : t.def.theme === 'desert'
        ? paint(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.6, 1).translate(0, 0.3, 0), th.tree)
        : mergeGeometries([paint(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 5).translate(0, 1.2, 0), 0x4a3524), paint(new THREE.ConeGeometry(2.3, 5, 7).translate(0, 4.4, 0), th.tree), paint(new THREE.ConeGeometry(1.6, 4, 7).translate(0, 7, 0), t.def.theme === 'nordic' ? 0xeaf0f2 : th.tree)])!;
    const trees = new THREE.InstancedMesh(tree, std({ vertexColors: true, flatShading: true }), count);
    trees.castShadow = this.quality >= 2;
    let placed = 0;
    for (let tries = 0; tries < count * 12 && placed < count; tries++) {
      const i = Math.floor(rnd() * n), sg = rnd() < 0.5 ? 1 : -1, s = sg > 0 ? 0 : 1;
      const o = sg * (hw + t.ro[s][i] + (street ? 26 : 5) + rnd() * rnd() * (street ? 70 : 120));
      const x = t.px[i] + t.nx[i] * o, z = t.pz[i] + t.nz[i] * o;
      let ok = true;
      for (let j = 0; j < n && ok; j += 3) { const d = Math.hypot(x - t.px[j], z - t.pz[j]), u = t.pitU(j); if (d < hw + Math.max(t.ro[0][j], t.ro[1][j]) + (street ? 24 : 4) || (u < t.pitLen && d < (street ? 62 : 46))) ok = false; }
      if (!ok) continue;
      const sc = 0.7 + rnd() * 0.9;
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, street ? -Math.atan2(t.tz[i], t.tx[i]) : rnd() * 6.3);
      trees.setMatrixAt(placed, this.m4.compose(this.v3.set(x, 0, z), this.q, street ? new THREE.Vector3(14 + rnd() * 16, 10 + rnd() * rnd() * 70, 14 + rnd() * 14) : new THREE.Vector3(sc, sc, sc)));
      trees.setColorAt(placed, street ? this.col.setHSL(0.58, 0.08, 0.45 + rnd() * 0.35) : this.col.setScalar(0.75 + rnd() * 0.35));
      placed++;
    }
    trees.count = placed;
    W.add(trees);

    // coches
    for (const c of sim.cars) this.addCar(c);
    const cap = sim.cars.length + 1;
    const tg = mergeGeometries([paint(new THREE.CylinderGeometry(0.36, 0.36, 1, 18).rotateX(Math.PI / 2), 0x121212), paint(new THREE.CylinderGeometry(0.24, 0.24, 1.02, 14).rotateX(Math.PI / 2), 0x2a2c30)])!;
    this.tyres = new THREE.InstancedMesh(tg, std({ vertexColors: true, roughness: 0.85 }), cap * 4);
    this.tyres.castShadow = true;
    const ring = mergeGeometries([new THREE.RingGeometry(0.27, 0.315, 20).translate(0, 0, 0.505), new THREE.RingGeometry(0.27, 0.315, 20).rotateY(Math.PI).translate(0, 0, -0.505)])!;
    this.rings = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial(), cap * 4);
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }), cap);
    this.blobs.visible = this.quality < 2;
    for (const im of [this.tyres, this.rings, this.blobs]) { im.frustumCulled = false; W.add(im); }

    // trazada ideal
    this.lineMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false }), 46);
    this.lineMesh.frustumCulled = false;
    W.add(this.lineMesh);

    // lluvia y partículas
    const rp = new Float32Array(900 * 6);
    for (let i = 0; i < 900; i++) { const x = (Math.random() - 0.5) * 50, y = Math.random() * 22, z = (Math.random() - 0.5) * 50; rp.set([x, y, z, x + 0.15, y - 0.9, z], i * 6); }
    this.rainMesh = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rp, 3)), new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.5 }));
    this.rainMesh.frustumCulled = false;
    W.add(this.rainMesh);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('pcol', new THREE.BufferAttribute(this.pCol, 4));
    pg.setAttribute('psize', new THREE.BufferAttribute(this.pSize, 1));
    this.pLife.fill(0); this.pCol.fill(0);
    this.parts = new THREE.Points(pg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'attribute vec4 pcol; attribute float psize; varying vec4 c; void main(){ c = pcol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * 420.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 c; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(c.rgb, c.a * (1.0 - d * 2.0)); }',
    }));
    this.parts.frustumCulled = false;
    W.add(this.parts);
    const p = sim.player ?? sim.cars[0];
    this.camH = p.h; this.camPos.set(p.x - Math.cos(p.h) * 8, 3, p.z - Math.sin(p.h) * 8);
    this.camera.position.copy(this.camPos);
  }

  private addCar(c: Car) {
    let g: THREE.BufferGeometry;
    if (c.isSC) g = safetyCarGeometry();
    else { const tm = TEAMS[c.team], mate = DRIVERS.findIndex((d) => d.team === c.team) !== c.di; g = carGeometry(tm.c[0], tm.c[1], tm.c[2], c.driver.helmet, mate ? 0xf5d000 : 0x101010); }
    const m = new THREE.Mesh(g, this.paintMat);
    m.castShadow = true;
    this.world.add(m);
    this.bodies.set(c, m);
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, a: number, size: number, life: number) {
    const i = this.pNext; this.pNext = (i + 1) % MAXP;
    this.pPos.set([x, y, z], i * 3); this.pVel.set([vx, vy, vz], i * 3); this.pCol.set([r, g, b, a], i * 4); this.pSize[i] = size; this.pLife[i] = life;
  }

  // ------------------------------------------------------------------ fotograma
  frame(sim: Sim, dt: number, target: Car) {
    const t = this.track, cars = sim.cars;
    if (Math.abs(sim.wet - this.lastWet) > 0.05) {
      this.lastWet = sim.wet;
      this.setSky(Math.max(sim.rain, sim.wet * 0.8));
      this.road.roughness = 0.9 - 0.65 * sim.wet; this.road.color.setHex(0x3b3d42).multiplyScalar(1 - 0.45 * sim.wet);
    }
    if (sim.sc && !this.bodies.has(sim.sc)) this.addCar(sim.sc);
    const one = this.v3.set(1, 1, 1).clone(), UP = THREE.Object3D.DEFAULT_UP, cam = this.camera.position;
    let w = 0;
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k], body = this.bodies.get(c);
      if (!body) continue;
      body.visible = c.active;
      if (!c.active) continue;
      body.position.set(c.x, c.surf === 1 ? 0.03 : 0, c.z);
      body.rotation.y = -c.h;
      const near = (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 < 160 * 160;
      this.m4b.makeRotationY(-c.h).setPosition(c.x, 0, c.z);
      for (let q = 0; q < 4; q++) {
        const [wx, wz, ww] = WHEELS[q];
        this.q.setFromAxisAngle(UP, q < 2 ? -c.steer * 0.32 : 0);
        this.m4.compose(this.v3.set(wx, 0.36, wz), this.q, one.set(1, 1, ww)).premultiply(this.m4b);
        this.tyres.setMatrixAt(w, this.m4); this.rings.setMatrixAt(w, this.m4);
        this.rings.setColorAt(w, this.col.setHex(c.isSC ? 0x333333 : TYRES[c.tyre].color));
        w++;
      }
      this.blobs.setMatrixAt(k, this.m4.makeRotationY(-c.h).setPosition(c.x, 0.05, c.z));
      // partículas: polvo, humo, spray
      if (near && c.speed > 6) {
        const bx = c.x - Math.cos(c.h) * 2.2, bz = c.z - Math.sin(c.h) * 2.2, r = Math.random;
        if ((c.surf === GRASS || c.surf === GRAVEL) && r() < 0.6) { const g = c.surf === GRAVEL || t.def.theme === 'desert'; this.emit(bx, 0.3, bz, c.vx * 0.2 + r() - 0.5, 1.5 + r(), c.vz * 0.2 + r() - 0.5, g ? 0.78 : 0.35, g ? 0.7 : 0.4, g ? 0.52 : 0.22, 0.6, 2.2, 1.1); }
        else if (c.slide > 3.5 && r() < 0.5) this.emit(bx, 0.3, bz, c.vx * 0.3, 1 + r(), c.vz * 0.3, 0.9, 0.9, 0.9, 0.35, 2.4, 1);
        if (sim.wet > 0.25 && c.speed > 22 && r() < 0.7) this.emit(bx, 0.5, bz, c.vx * 0.55 + (r() - 0.5) * 3, 2 + r() * 2, c.vz * 0.55 + (r() - 0.5) * 3, 0.82, 0.85, 0.88, 0.3 * sim.wet, 4.5, 1.2);
      }
    }
    this.tyres.count = this.rings.count = w;
    this.tyres.instanceMatrix.needsUpdate = this.rings.instanceMatrix.needsUpdate = this.blobs.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    for (const f of sim.fx) for (let k = 0; k < Math.min(14, 3 + f.power); k++) this.emit(f.x, 0.5, f.z, (Math.random() - 0.5) * 12, Math.random() * 6, (Math.random() - 0.5) * 12, 1, 0.6 + Math.random() * 0.3, 0.2, 1, 0.5, 0.5);
    for (let i = 0; i < MAXP; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      this.pVel[i * 3] *= 0.96; this.pVel[i * 3 + 2] *= 0.96; this.pSize[i] *= 1 + dt * 1.2;
      this.pCol[i * 4 + 3] *= this.pLife[i] <= 0 ? 0 : 1 - dt * 1.4;
    }
    const pa = this.parts.geometry.attributes;
    pa.position.needsUpdate = pa.pcol.needsUpdate = pa.psize.needsUpdate = true;

    // semáforo y mecánicos
    this.lamps.forEach((l, k) => (l.material as THREE.MeshBasicMaterial).color.setHex(k < sim.lights ? 0xff1a1a : 0x220000));
    this.updateCrew(sim, dt);

    // cámara
    const c = target, fx = Math.cos(c.h), fz = Math.sin(c.h);
    let d = c.h - this.camH; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    this.camH += d * Math.min(1, dt * 7);
    const hx = Math.cos(this.camH), hz = Math.sin(this.camH), portrait = this.camera.aspect < 1;
    this.shake = c.surf !== 0 && c.speed > 8 ? 0.05 : c.speed * 0.00012;
    const sh = () => (Math.random() - 0.5) * this.shake;
    if (this.camMode === 2) {
      cam.set(c.x + fx * 0.12, 0.98, c.z + fz * 0.12);
      this.camera.lookAt(c.x + fx * 30 + sh() * 20, 0.75 + sh() * 10, c.z + fz * 30);
      this.camera.fov = portrait ? 92 : 76;
    } else {
      const far = this.camMode === 1, back = far ? 10.5 : 6.6, up = far ? 4.2 : 2.25;
      this.camPos.set(c.x - hx * back, up, c.z - hz * back);
      cam.lerp(this.camPos, Math.min(1, dt * 14));
      this.camera.lookAt(c.x + hx * 7 + sh() * 8, 0.9 + sh() * 4, c.z + hz * 7);
      this.camera.fov = (portrait ? 84 : 62) + Math.min(14, c.speed * 0.15);
    }
    this.camera.updateProjectionMatrix();
    const dir = this.sun.userData.dir as THREE.Vector3;
    this.sun.target.position.set(c.x, 0, c.z);
    this.sun.position.set(c.x + dir.x * 150, dir.y * 150, c.z + dir.z * 150);
    this.sky.position.copy(cam);

    // lluvia
    this.rainMesh.visible = sim.rain > 0.05;
    if (this.rainMesh.visible) {
      (this.rainMesh.material as THREE.LineBasicMaterial).opacity = 0.2 + 0.5 * sim.rain;
      const rp = this.rainMesh.geometry.attributes.position as THREE.BufferAttribute, a = rp.array as Float32Array, fall = dt * 28;
      for (let i = 0; i < a.length; i += 6) { a[i + 1] -= fall; a[i + 4] -= fall; if (a[i + 4] < 0) { a[i + 1] += 22; a[i + 4] += 22; } }
      rp.needsUpdate = true;
      this.rainMesh.position.set(cam.x + hx * 12, 0, cam.z + hz * 12);
    }

    // trazada ideal por delante del jugador
    const lm = this.lineMesh, pl = sim.player;
    lm.visible = this.showLine && !!pl && c === pl && !pl.inPit;
    if (lm.visible && pl) {
      for (let k = 0; k < 46; k++) {
        const i = t.idx(pl.si + 3 + k * 2), j = t.idx(i + 2);
        this.q.setFromAxisAngle(UP, -Math.atan2(t.tz[i], t.tx[i]) + Math.PI / 2);
        lm.setMatrixAt(k, this.m4.compose(this.v3.set(t.px[i] + t.nx[i] * t.lo[i], 0.06, t.pz[i] + t.nz[i] * t.lo[i]), this.q, one.set(1, 1, 1)));
        const braking = t.vt[j] < t.vt[i] - 0.15, need = t.vt[i] * (sim.wet > 0.2 ? 0.85 : 1);
        lm.setColorAt(k, this.col.setHex(braking ? (pl.speed > need * 0.92 ? 0xff2a2a : 0xffc400) : pl.speed > need * 1.03 ? 0xffc400 : 0x24e06a));
      }
      lm.instanceMatrix.needsUpdate = true;
      if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** los mecánicos esperan junto al garaje y rodean el coche cuando entra a su cajón */
  private updateCrew(sim: Sim, dt: number) {
    const t = this.track, ps = t.pitSide, one = new THREE.Vector3(1, 1, 1);
    this.q.identity();
    let dirty = false;
    for (let k = 0; k < 11; k++) {
      const busy = sim.cars.some((c) => c.team === k && c.active && (c.pit === 3 || (c.pit === 2 && c.pitStop && t.boxU(k) - c.pitU < 30)));
      const prev = this.crewK[k], next = prev < 0 ? 0 : Math.max(0, Math.min(1, prev + (busy ? dt * 2.5 : -dt * 1.5)));
      if (next === prev) continue;
      this.crewK[k] = next; dirty = true;
      const i = t.idx(t.pitIn + Math.round(t.boxU(k) / t.ds)), base = ps * t.pitBoxOff;
      for (let m = 0; m < 14; m++) {
        // posiciones de servicio: 3 por rueda + gatos delantero y trasero
        const wq = m < 12 ? WHEELS[m % 4] : null, grp = m >> 2;
        const sa = wq ? wq[0] + (grp === 1 ? 0.55 : grp === 2 ? -0.55 : 0) : m === 12 ? 3.5 : -3.2;
        const so = wq ? Math.sign(wq[1]) * (grp === 0 ? 1.45 : 1.85) : 0;
        const ra = -5.5 + m * 0.85, ro = 3.4; // espera en fila delante del garaje
        const a = ra + (sa - ra) * next, o = base + ps * ro + (so - ps * ro) * next;
        this.crew.setMatrixAt(k * 14 + m, this.m4.compose(this.v3.set(t.px[i] + t.tx[i] * a + t.nx[i] * o, 0, t.pz[i] + t.tz[i] * a + t.nz[i] * o), this.q, one));
      }
    }
    if (dirty) this.crew.instanceMatrix.needsUpdate = true;
  }
}
