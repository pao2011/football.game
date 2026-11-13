import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH, PITCH_LENGTH, GOAL_HALF_WIDTH } from '../../config/constants';

export type RGB = [number, number, number];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** HSL (0..1) -> sRGB 0..255 */
export function hsl(h: number, s: number, l: number): RGB {
  h = ((h % 1) + 1) % 1;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

class ValueNoise {
  private g: Float32Array;
  constructor(private size: number, rand: () => number) {
    this.g = new Float32Array(size * size);
    for (let i = 0; i < this.g.length; i++) this.g[i] = rand();
  }
  get(x: number, y: number): number {
    const s = this.size;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % s) + s) % s;
    const y0 = ((yi % s) + s) % s;
    const x1 = (x0 + 1) % s;
    const y1 = (y0 + 1) % s;
    const g = this.g;
    const a = g[y0 * s + x0] + (g[y0 * s + x1] - g[y0 * s + x0]) * fx;
    const b = g[y1 * s + x0] + (g[y1 * s + x1] - g[y1 * s + x0]) * fx;
    return a + (b - a) * fy;
  }
}

const gauss = (dx: number, dz: number, sx: number, sz: number) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dz * dz) / (2 * sz * sz));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Macro grass texture covering the ground plane x in [-extA, extA], z in [-extB, extB].
 * Canvas row 0 = z = -extB (flipY maps it to v = 1, which is world -z for a plane rotated -90deg on X).
 */
export function makeGrassTexture(hue: number, width: number, extA: number, extB: number, boardX: number, boardZ: number, seed: number): THREE.CanvasTexture {
  const W = width;
  const H = Math.round((width * extB) / extA);
  const { c, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const rand = mulberry32(seed);
  const n1 = new ValueNoise(64, rand);
  const n2 = new ValueNoise(128, rand);
  const n3 = new ValueNoise(256, rand);

  const light = hsl(hue, 0.4, 0.355);
  const dark = hsl(hue, 0.46, 0.29);
  const worn = hsl(hue * 0.6, 0.34, 0.37);
  const band = hsl(hue + 0.02, 0.22, 0.16);
  const stripeW = PITCH_LENGTH / 18;
  const pxPerM = W / (2 * extA);

  for (let py = 0; py < H; py++) {
    const z = -extB + ((py + 0.5) / H) * 2 * extB;
    for (let px = 0; px < W; px++) {
      const x = -extA + ((px + 0.5) / W) * 2 * extA;
      const a = n1.get(x / 9, z / 9);
      const b = n2.get(x / 2.4, z / 2.4);
      const cc = n3.get(x / 0.55, z / 0.55);
      const f = 1 + 0.12 * (a - 0.5) + 0.08 * (b - 0.5) + 0.07 * (cc - 0.5);
      let r: number, g: number, bl: number;
      const outside = Math.abs(x) > boardX + 0.7 || Math.abs(z) > boardZ + 0.7;
      if (outside) {
        const f2 = 1 + 0.18 * (b - 0.5) + 0.12 * (cc - 0.5);
        r = band[0] * f2;
        g = band[1] * f2;
        bl = band[2] * f2;
      } else {
        // mowing stripes with a soft 1px edge
        const sx = (x + HALF_LENGTH) / stripeW;
        const fr = sx - Math.floor(sx);
        const edge = Math.min(fr, 1 - fr) * stripeW * pxPerM;
        let st = Math.floor(sx) & 1 ? 1 : 0;
        let mixv = st;
        if (edge < 0.8) mixv = 0.5 + (st - 0.5) * (edge / 0.8);
        // faint cross stripes for a premium "checker" cut
        const sz = (z + HALF_WIDTH) / (stripeW * 1.25);
        const cross = Math.floor(sz) & 1 ? 0.012 : -0.012;
        r = (dark[0] + (light[0] - dark[0]) * mixv) * (f + cross);
        g = (dark[1] + (light[1] - dark[1]) * mixv) * (f + cross);
        bl = (dark[2] + (light[2] - dark[2]) * mixv) * (f + cross);
        // wear
        let w = 0;
        for (const sgn of [-1, 1]) {
          const gx = sgn * HALF_LENGTH;
          w += 1.0 * gauss(x - (gx - sgn * 2.2), z, 2.6, GOAL_HALF_WIDTH + 0.8);
          w += 0.35 * gauss(x - (gx - sgn * 5), z, 4.5, 7);
          w += 0.55 * gauss(x - (gx - sgn * 11), z, 1.0, 1.0);
        }
        w += 0.55 * gauss(x, z, 2.2, 2.2) + 0.2 * gauss(x, z, 9, 12);
        // assistant referee runs
        if (x > 0 && x < HALF_LENGTH) w += 0.45 * gauss(0, z - (HALF_WIDTH + 1.2), 1, 0.55);
        if (x < 0 && x > -HALF_LENGTH) w += 0.45 * gauss(0, z + (HALF_WIDTH + 1.2), 1, 0.55);
        w = Math.min(1, w);
        const patch = smooth(0.25, 0.8, b * 0.55 + cc * 0.45 + w * 0.35);
        const ww = w * patch * 0.85;
        r += (worn[0] * f - r) * ww;
        g += (worn[1] * f - g) * ww;
        bl += (worn[2] * f - bl) * ww;
      }
      const o = (py * W + px) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = bl;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Tileable fine grass detail (grey around 0.5; used as color multiplier and bump). */
export function makeGrassDetail(seed: number): THREE.CanvasTexture {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, S, S);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  ctx.lineCap = 'round';
  for (let i = 0; i < 5200; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const len = 2 + rand() * 7;
    const ang = rand() * Math.PI * 2;
    const v = Math.round(70 + rand() * 130);
    ctx.strokeStyle = `rgba(${v},${v},${v},0.7)`;
    ctx.lineWidth = 0.8 + rand() * 1.1;
    const dx = Math.cos(ang) * len;
    const dy = Math.sin(ang) * len;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        if (x + ox < -10 || x + ox > S + 10 || y + oy < -10 || y + oy > S + 10) continue;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + dx, y + oy + dy);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Hexagonal net mesh, alpha in the alpha channel. Tile = 3s x sqrt(3)s, s = hex side. */
export const NET_TILE_W = 0.36; // metres (hex side 0.12)
export const NET_TILE_H = NET_TILE_W / Math.sqrt(3);
export function makeNetTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 74;
  const { c, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const s = W / 3;
  const hh = H / 2; // sqrt(3)/2 * s (scaled)
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 3.2;
  const hex = (cx: number, cy: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * s;
      const y = cy + Math.sin(a) * s;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  for (const [cx, cy] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
    [1.5 * s, hh],
    [1.5 * s, -hh],
    [1.5 * s, H + hh],
  ]) {
    hex(cx, cy);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Advertising: marcas deportivas (src/assets/brands), un solo anuncio a la vez en todas las pantallas
// ---------------------------------------------------------------------------------------------

const BRAND_LOGOS = import.meta.glob('../../assets/brands/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
/** physical aspect ratio of one ad (length / height): cada anuncio ocupa un tramo largo del cartel */
export const LED_ASPECT = 16;

export interface LedAds {
  tex: THREE.CanvasTexture;
  /** Cantidad de anuncios de la rotación. */
  count: number;
  /** Pinta el anuncio i (módulo count) en todas las pantallas. */
  show(i: number): void;
}

/**
 * Pantallas LED: la textura es un único anuncio que se repite a lo largo de los carteles, así todo el
 * estadio muestra la misma marca; Stadium la va cambiando cada pocos segundos con show().
 */
export function makeLedAds(): LedAds {
  const PH = 128;
  const PW = PH * LED_ASPECT;
  const { c, ctx } = makeCanvas(PW, PH);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const imgs = Object.keys(BRAND_LOGOS).sort().map((key) => {
    const img = new Image();
    img.src = BRAND_LOGOS[key];
    return img;
  });
  let current = -1;
  const paint = (i: number) => {
    const img = imgs[i];
    const bg = ctx.createLinearGradient(0, 0, 0, PH);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#e4e8ee');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, PW, PH);
    if (img?.complete && img.naturalWidth > 0) {
      // logo grande y centrado, con aire a los lados; los isotipos angostos se repiten tres veces a lo largo
      const k = Math.min((PH * 0.78) / img.height, (PW * 0.6) / img.width);
      const w = img.width * k;
      const h = img.height * k;
      const xs = w < PW * 0.2 ? [PW / 6, PW / 2, (PW * 5) / 6] : [PW / 2];
      for (const x of xs) ctx.drawImage(img, x - w / 2, (PH - h) / 2, w, h);
    }
    // costura entre módulos y trama de píxeles LED
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, 3, PH);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let y = 0; y < PH; y += 4) ctx.fillRect(0, y, PW, 1);
    tex.needsUpdate = true;
  };
  const show = (i: number) => {
    if (!imgs.length) return;
    current = ((i % imgs.length) + imgs.length) % imgs.length;
    paint(current);
  };
  // si el logo en pantalla todavía no había cargado, se pinta al llegar
  imgs.forEach((img, i) => { img.onload = () => { if (i === current) paint(i); }; });
  show(0);
  return { tex, count: imgs.length, show };
}

export function makeScreenTexture(name: string, home: string, away: string): THREE.CanvasTexture {
  const W = 1024;
  const H = 320;
  const { c, ctx } = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#05070d');
  g.addColorStop(1, '#141d33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = home;
  ctx.fillRect(0, 0, 26, H);
  ctx.fillStyle = away;
  ctx.fillRect(W - 26, 0, 26, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 900 92px "Arial Black", Arial, sans-serif';
  ctx.fillText(name.toUpperCase(), W / 2, H * 0.4, W * 0.88);
  ctx.font = '700 44px Arial, sans-serif';
  ctx.fillStyle = '#38f27d';
  ctx.fillText("SOFFTI'S FOOTBALL GAME  •  LIVE", W / 2, H * 0.76, W * 0.8);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Crowd atlas: 8 variants (columns) x 2 poses (rows: arms down, arms up)
// R = shirt mask (intensity = shade), G = skin, B = dark (hair / trousers), A = alpha
// ---------------------------------------------------------------------------------------------
export const CROWD_COLS = 8;
export const CROWD_ROWS = 2;
export function makeCrowdAtlas(): THREE.CanvasTexture {
  const CW = 64;
  const CH = 160;
  const { c, ctx } = makeCanvas(CW * CROWD_COLS, CH * CROWD_ROWS);
  ctx.clearRect(0, 0, c.width, c.height);
  const SHIRT = (k = 1) => `rgb(${Math.round(255 * k)},0,0)`;
  const SKIN = 'rgb(0,255,0)';
  const DARK = 'rgb(0,0,255)';
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  };
  const limb = (x0: number, y0: number, x1: number, y1: number, w: number, style: string) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  for (let v = 0; v < CROWD_COLS; v++) {
    for (let pose = 0; pose < CROWD_ROWS; pose++) {
      ctx.save();
      ctx.translate(v * CW, pose * CH);
      const child = v === 5;
      const wide = v === 1 || v === 6;
      const top = child ? 34 : 10;
      const sc = child ? 0.82 : 1;
      const cx = CW / 2 + (v === 3 ? 1 : 0);
      const headR = 11 * sc;
      const headY = top + headR + 2;
      const shoulderY = headY + headR + 6 * sc;
      const bw = (wide ? 44 : 36) * sc;
      const hipY = shoulderY + 58 * sc;
      // legs / trousers
      ctx.fillStyle = DARK;
      rr(cx - bw * 0.42, hipY - 6, bw * 0.84, CH - hipY + 6, 4);
      // arms (behind torso when down)
      const shirtShade = v === 6 ? 0.62 : 1;
      const armW = 9 * sc;
      const sleeveSkin = v === 0 || v === 4 || v === 7; // short sleeves
      if (pose === 0) {
        for (const sgn of [-1, 1]) {
          const ax = cx + sgn * (bw / 2 - 2);
          limb(ax, shoulderY + 5, ax + sgn * 3, hipY - 6, armW, sleeveSkin ? SKIN : SHIRT(shirtShade));
          if (sleeveSkin) limb(ax, shoulderY + 5, ax + sgn * 1.5, shoulderY + 22, armW + 1, SHIRT(shirtShade));
          ctx.fillStyle = SKIN;
          ctx.beginPath();
          ctx.arc(ax + sgn * 3, hipY - 4, armW * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (const sgn of [-1, 1]) {
          const ax = cx + sgn * (bw / 2 - 3);
          const hx = cx + sgn * (bw / 2 + 6);
          const hy = Math.max(4, top - 6 + (v % 3) * 3);
          limb(ax, shoulderY + 4, hx, hy + 6, armW, sleeveSkin ? SKIN : SHIRT(shirtShade));
          if (sleeveSkin) limb(ax, shoulderY + 4, ax + sgn * 4, shoulderY - 10, armW + 1, SHIRT(shirtShade));
          ctx.fillStyle = SKIN;
          ctx.beginPath();
          ctx.arc(hx, hy + 4, armW * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (v === 4) {
          // scarf held above the head
          ctx.fillStyle = SHIRT(1);
          ctx.fillRect(cx - bw / 2 - 4, Math.max(2, top - 6), bw + 8, 7);
        }
      }
      // torso
      ctx.fillStyle = SHIRT(shirtShade);
      rr(cx - bw / 2, shoulderY, bw, hipY - shoulderY + 4, 9 * sc);
      if (v === 4 && pose === 0) {
        // scarf around the neck
        ctx.fillStyle = SHIRT(0.55);
        ctx.fillRect(cx - bw / 2 + 4, shoulderY + 2, bw - 8, 6);
        ctx.fillRect(cx + 4, shoulderY + 2, 6, 26);
      }
      if (v === 6) {
        // jacket zip / open front showing tee
        ctx.fillStyle = SHIRT(1);
        ctx.fillRect(cx - 4, shoulderY + 4, 8, hipY - shoulderY - 4);
      }
      // cuello de la prenda y pliegue bajo el pecho (tono más oscuro de la misma camiseta)
      ctx.fillStyle = SHIRT(shirtShade * 0.72);
      ctx.fillRect(cx - 7 * sc, shoulderY, 14 * sc, 3);
      ctx.fillRect(cx - bw / 2 + 3, hipY - 4, bw - 6, 3);
      // neck + head
      ctx.fillStyle = 'rgb(0,190,0)'; // el cuello queda en sombra bajo el mentón
      ctx.fillRect(cx - 4 * sc, headY + headR - 3, 8 * sc, 9 * sc);
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.ellipse(cx, headY, headR * 0.92, headR, 0, 0, Math.PI * 2);
      ctx.fill();
      // cara: ojos y boca (abierta, gritando, con los brazos en alto)
      ctx.fillStyle = DARK;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + sgn * headR * 0.36, headY + headR * 0.08, 1.3 * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgb(0,70,0)';
      if (pose === 0) ctx.fillRect(cx - headR * 0.3, headY + headR * 0.52, headR * 0.6, 1.5);
      else {
        ctx.beginPath();
        ctx.ellipse(cx, headY + headR * 0.55, headR * 0.26, headR * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // hair / caps
      if (v === 2) {
        ctx.fillStyle = SHIRT(0.8);
        ctx.beginPath();
        ctx.ellipse(cx, headY - headR * 0.35, headR * 1.02, headR * 0.7, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(cx - headR * 1.25, headY - headR * 0.4, headR * 2.5, 3);
      } else if (v !== 7) {
        ctx.fillStyle = DARK;
        ctx.beginPath();
        ctx.ellipse(cx, headY - headR * 0.3, headR * 0.98, headR * 0.75, 0, Math.PI, 0);
        ctx.fill();
        if (v === 3) {
          // long hair
          ctx.fillRect(cx - headR, headY - headR * 0.3, 5, headR * 2.1);
          ctx.fillRect(cx + headR - 5, headY - headR * 0.3, 5, headR * 2.1);
        }
      }
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function makeGlowTexture(): THREE.CanvasTexture {
  const S = 64;
  const { c, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
