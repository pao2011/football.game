// Geometría del circuito: polígono con curvas redondeadas -> muestras uniformes con normales, curvatura,
// pianos, escapatorias (césped / grava / asfalto), muros, calle de boxes, trazada ideal y perfil de velocidad.
import type { TrackDef } from './data';

/** Constantes físicas compartidas por el perfil de velocidad y la simulación. */
export const PHYS = {
  G: 9.81,
  MU: 1.7, // agarre mecánico de referencia
  KDF: 0.0025, // carga aerodinámica: aLat = mu * (G + KDF v²)
  PWR: 937, // potencia / masa (m²/s³)
  TRACTION: 12, // aceleración máxima por tracción (m/s²)
  DRAG: 0.001203, // resistencia / masa
  REF_GRIP: 0.94, // fracción de agarre que usa el perfil de referencia de la IA
};

export const ROAD = 0, KERB = 1, GRASS = 2, GRAVEL = 3, TARMAC = 4;
export const KERB_W = 1.6;
export const PIT_SPEED = 22.2; // 80 km/h
const START_OFFSET = 215; // metros de recta antes de la línea de salida (parrilla)
const PIT_RAMP = 70;
export const BOX_SPACING = 16;

export class Track {
  n = 0;
  ds = 2.5;
  length = 0;
  hw: number;
  px!: Float32Array; pz!: Float32Array;
  tx!: Float32Array; tz!: Float32Array;
  nx!: Float32Array; nz!: Float32Array;
  curv!: Float32Array;
  /** desplazamiento lateral de la trazada ideal */
  lo!: Float32Array;
  /** velocidad objetivo de referencia sobre la trazada */
  vt!: Float32Array;
  /** ancho de escapatoria y tipo de superficie a cada lado ([0] = lado +n, [1] = lado -n) */
  ro!: [Float32Array, Float32Array];
  st!: [Uint8Array, Uint8Array];
  kerb!: [Uint8Array, Uint8Array];
  /** lado de boxes (+1 = +n) e índices de entrada / longitud de la calle de boxes */
  pitSide = -1;
  pitIn = 0;
  pitLen = 0;
  boxU0 = 100;
  lapTime = 0;

  constructor(public def: TrackDef, mirror = false) {
    this.hw = def.theme === 'street' ? 5.5 : 6.5;
    this.build(mirror);
  }

  get pitLaneOff() { return this.hw + 5.5; }
  get pitBoxOff() { return this.hw + 9.5; }
  /** distancia dentro de la calle de boxes del box del equipo t */
  boxU(team: number) { return this.boxU0 + team * BOX_SPACING; }
  idx(i: number) { return ((i % this.n) + this.n) % this.n; }
  /** distancia recorrida desde la entrada a boxes para la muestra i (>= pitLen: fuera de la zona) */
  pitU(i: number) { return this.idx(i - this.pitIn) * this.ds; }
  /** desplazamiento lateral del carril de boxes a la distancia u */
  pitOffset(u: number, boxAt = -1) {
    const sm = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    const edge = this.hw - 1.8; // el carril nace y muere pegado al borde de la pista
    let o = edge + (this.pitLaneOff - edge) * Math.min(sm(u / PIT_RAMP), sm((this.pitLen - u) / PIT_RAMP));
    if (boxAt >= 0) o += (this.pitBoxOff - this.pitLaneOff) * sm(1 - Math.abs(u - boxAt) / 14);
    return o * this.pitSide;
  }
  surface(i: number, d: number): number {
    const ad = Math.abs(d);
    if (ad <= this.hw) return ROAD;
    const side = d > 0 ? 0 : 1;
    if (this.kerb[side][i] && ad < this.hw + KERB_W) return KERB;
    return this.st[side][i];
  }
  /** casilla de parrilla k (0 = pole): índice de muestra y desplazamiento lateral */
  gridSlot(k: number) {
    return { i: this.idx(-Math.round((10 + 8 * k) / this.ds)), off: (k % 2 ? 1 : -1) * this.pitSide * 2.8 };
  }

  private build(mirror: boolean) {
    const V = this.def.pts.split(';').map((s) => s.split(',').map(Number)).map(([x, y, r]) => ({ x: x * 10, y: y * 10 * (mirror ? -1 : 1), r: r || 50 }));
    const m = V.length;
    // --- curvas redondeadas (arcos tangentes a los dos tramos de cada vértice)
    const raw: number[] = [], tans: number[] = [];
    let sA = 0;
    for (let i = 0; i < m; i++) {
      const A = V[(i + m - 1) % m], B = V[i], C = V[(i + 1) % m];
      let ux = A.x - B.x, uy = A.y - B.y, vx = C.x - B.x, vy = C.y - B.y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      ux /= lu; uy /= lu; vx /= lv; vy /= lv;
      const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
      const t = Math.min(B.r / Math.tan(th / 2), 0.48 * Math.min(lu, lv));
      const r = t * Math.tan(th / 2);
      tans.push(t);
      let bx = ux + vx, by = uy + vy;
      const lb = Math.hypot(bx, by) || 1;
      const cx = B.x + (bx / lb) * (r / Math.sin(th / 2)), cy = B.y + (by / lb) * (r / Math.sin(th / 2));
      const a0 = Math.atan2(B.y + uy * t - cy, B.x + ux * t - cx);
      let da = Math.atan2(B.y + vy * t - cy, B.x + vx * t - cx) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const steps = Math.max(2, Math.ceil(Math.abs(da) * r));
      for (let k = 0; k <= steps; k++) raw.push(cx + Math.cos(a0 + (da * k) / steps) * r, cy + Math.sin(a0 + (da * k) / steps) * r);
      if (i === 0) sA = Math.abs(da) * r;
    }
    // --- remuestreo uniforme; la muestra 0 es la línea de salida
    const rn = raw.length / 2;
    const acc = new Float64Array(rn + 1);
    for (let i = 0; i < rn; i++) { const j = (i + 1) % rn; acc[i + 1] = acc[i] + Math.hypot(raw[j * 2] - raw[i * 2], raw[j * 2 + 1] - raw[i * 2 + 1]); }
    const total = acc[rn];
    const n = (this.n = Math.round(total / 2.5));
    const px = (this.px = new Float32Array(n)), pz = (this.pz = new Float32Array(n));
    let seg = 0;
    const order = Array.from({ length: n }, (_, j) => [j, (sA + START_OFFSET + (j * total) / n) % total]).sort((a, b) => a[1] - b[1]);
    for (const [j, s] of order) {
      while (acc[seg + 1] < s) seg++;
      const f = (s - acc[seg]) / (acc[seg + 1] - acc[seg] || 1), k = (seg + 1) % rn;
      px[j] = raw[seg * 2] + (raw[k * 2] - raw[seg * 2]) * f;
      pz[j] = raw[seg * 2 + 1] + (raw[k * 2 + 1] - raw[seg * 2 + 1]) * f;
    }
    // --- suavizado (crea transiciones de curvatura en las entradas y salidas de curva)
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 20; pass++) for (const a of [px, pz]) {
      for (let i = 0; i < n; i++) tmp[i] = 0.25 * a[(i + n - 1) % n] + 0.5 * a[i] + 0.25 * a[(i + 1) % n];
      a.set(tmp);
    }
    // --- tangentes, normales, curvatura
    const tx = (this.tx = new Float32Array(n)), tz = (this.tz = new Float32Array(n));
    const nx = (this.nx = new Float32Array(n)), nz = (this.nz = new Float32Array(n));
    const curv = (this.curv = new Float32Array(n));
    let len = 0;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      const dx = px[b] - px[a], dz = pz[b] - pz[a], l = Math.hypot(dx, dz);
      tx[i] = dx / l; tz[i] = dz / l; nx[i] = -tz[i]; nz[i] = tx[i];
      len += Math.hypot(px[b] - px[i], pz[b] - pz[i]);
    }
    this.length = len;
    const ds = (this.ds = len / n);
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      curv[i] = (tx[a] * tz[b] - tz[a] * tx[b]) / (2 * ds); // seno del giro entre vecinos
    }
    // orientación del polígono: boxes por el exterior del circuito
    let area = 0;
    for (let i = 0; i < n; i++) { const b = (i + 1) % n; area += px[i] * pz[b] - px[b] * pz[i]; }
    this.pitSide = area > 0 ? -1 : 1;
    const straight = Math.hypot(V[1].x - V[0].x, V[1].y - V[0].y) - tans[0] - tans[1];
    this.pitIn = this.idx(-Math.round((START_OFFSET - 15) / ds));
    this.pitLen = Math.min(straight - 55, 620);
    this.boxU0 = Math.max(PIT_RAMP + 25, (this.pitLen - 10 * BOX_SPACING) / 2);

    this.buildSurfaces();
    this.buildLine();
  }

  private buildSurfaces() {
    const { n, ds, curv, hw } = this, street = this.def.theme === 'street';
    const ro: [Float32Array, Float32Array] = (this.ro = [new Float32Array(n), new Float32Array(n)]);
    const st: [Uint8Array, Uint8Array] = (this.st = [new Uint8Array(n), new Uint8Array(n)]);
    const kerb: [Uint8Array, Uint8Array] = (this.kerb = [new Uint8Array(n), new Uint8Array(n)]);
    for (let s = 0; s < 2; s++) { ro[s].fill(street ? 2.5 : 10); st[s].fill(street ? TARMAC : GRASS); }
    const W = (m: number) => Math.round(m / ds);
    const mark = (a: Float32Array | Uint8Array, i: number, from: number, to: number, v: number) => { for (let k = W(from); k <= W(to); k++) { const j = this.idx(i + k); if (a[j] < v) a[j] = v; } };
    for (let i = 0; i < n; i++) {
      const k = Math.abs(curv[i]);
      if (k < 1 / 200) continue;
      const inside = curv[i] > 0 ? 0 : 1, outside = 1 - inside;
      if (k > 1 / 140) {
        kerb[inside][i] = 1; // piano interior en el vértice
        mark(kerb[outside], i, 10, 45, 1); // piano exterior a la salida
      }
      if (!street) {
        // grava en el exterior: zona de frenada (pasarse de frenada) y salida de curva
        const w = k > 1 / 120 ? 30 : 20;
        mark(ro[outside], i, -110, 50, w);
        mark(st[outside], i, -110, 50, GRAVEL);
      } else if (k > 1 / 60) mark(ro[outside], i, -60, 10, 6);
    }
    // recortes: el interior no puede pasar del centro de la curva ni invadir otro tramo del circuito
    const { px, pz, nx, nz } = this;
    for (let i = 0; i < n; i++) {
      const k = Math.abs(curv[i]);
      if (k > 1e-4) { const s = curv[i] > 0 ? 0 : 1; ro[s][i] = Math.min(ro[s][i], Math.max(1, 1 / k - hw - 4)); }
      for (let j = i & 1; j < n; j += 2) {
        const di = Math.abs(i - j);
        if (Math.min(di, n - di) < W(100)) continue;
        const dx = px[j] - px[i], dz = pz[j] - pz[i], d2 = dx * dx + dz * dz;
        if (d2 > 6400) continue;
        const s = dx * nx[i] + dz * nz[i] > 0 ? 0 : 1;
        ro[s][i] = Math.min(ro[s][i], Math.max(1, (Math.sqrt(d2) - 2 * hw) / 2 - 0.5));
      }
    }
    // zona de boxes: muro de boxes pegado a la pista
    const ps = this.pitSide > 0 ? 0 : 1;
    for (let u = 0; u < this.pitLen; u += ds) { const j = this.idx(this.pitIn + Math.round(u / ds)); ro[ps][j] = 2; st[ps][j] = TARMAC; kerb[ps][j] = 0; }
    // suaviza los cambios bruscos de ancho de escapatoria
    for (let s = 0; s < 2; s++) for (let pass = 0; pass < 8; pass++) {
      const a = ro[s];
      for (let i = 0; i < n; i++) a[i] = Math.min(a[i], Math.max(a[(i + 1) % n], a[(i + n - 1) % n]) + 0.4 * ds);
    }
  }

  /** Trazada ideal (banda elástica dentro de los límites) y perfil de velocidad de referencia. */
  private buildLine() {
    const { n, ds, px, pz, nx, nz, hw } = this;
    const lo = (this.lo = new Float32Array(n));
    const lim = hw - 1.3;
    for (const [k, iters] of [[10, 300], [4, 120], [1, 30]]) {
      for (let it = 0; it < iters; it++) for (let i = 0; i < n; i++) {
        const a = (i + n - k) % n, b = (i + k) % n;
        const mx = (px[a] + nx[a] * lo[a] + px[b] + nx[b] * lo[b]) / 2 - px[i], mz = (pz[a] + nz[a] * lo[a] + pz[b] + nz[b] * lo[b]) / 2 - pz[i];
        const t = mx * nx[i] + mz * nz[i];
        lo[i] = Math.max(-lim, Math.min(lim, lo[i] + 0.6 * (t - lo[i])));
      }
    }
    // curvatura de la trazada
    const k = new Float32Array(n), lx = new Float32Array(n), lz = new Float32Array(n);
    for (let i = 0; i < n; i++) { lx[i] = px[i] + nx[i] * lo[i]; lz[i] = pz[i] + nz[i] * lo[i]; }
    const sp = 3;
    for (let i = 0; i < n; i++) {
      const a = (i + n - sp) % n, b = (i + sp) % n;
      const ax = lx[i] - lx[a], az = lz[i] - lz[a], bx = lx[b] - lx[i], bz = lz[b] - lz[i];
      k[i] = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)) / (sp * ds);
    }
    const { G, MU, KDF, PWR, TRACTION, DRAG, REF_GRIP } = PHYS, mu = MU * REF_GRIP, VMAX = 95;
    const v = (this.vt = new Float32Array(n));
    for (let i = 0; i < n; i++) { const den = k[i] - mu * KDF; v[i] = den > 1e-5 ? Math.min(VMAX, Math.sqrt((mu * G) / den)) : VMAX; }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) { const b = (i + 1) % n; const a = Math.min(TRACTION, PWR / Math.max(v[i], 8)) - DRAG * v[i] * v[i]; v[b] = Math.min(v[b], Math.sqrt(v[i] * v[i] + 2 * a * ds)); }
      for (let i = n - 1; i >= 0; i--) {
        const b = (i + 1) % n, aMax = mu * (G + KDF * v[b] * v[b]), lat = Math.min(1, (v[b] * v[b] * k[b]) / aMax);
        const a = aMax * 0.92 * Math.sqrt(Math.max(0.04, 1 - lat * lat)) + DRAG * v[b] * v[b];
        v[i] = Math.min(v[i], Math.sqrt(v[b] * v[b] + 2 * a * ds));
      }
    }
    let t = 0;
    for (let i = 0; i < n; i++) t += ds / v[i];
    this.lapTime = t;
  }
}

const cache = new Map<number, Track>();
export function getTrack(i: number, defs: TrackDef[]): Track {
  let t = cache.get(i);
  if (!t) cache.set(i, (t = new Track(defs[i], i % 3 === 1))); // uno de cada tres gira en sentido horario
  return t;
}
