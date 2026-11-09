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
// Advertising (fictional brands)
// ---------------------------------------------------------------------------------------------

interface Brand {
  text: string;
  bg: [string, string];
  fg: string;
  accent?: string;
  italic?: boolean;
  mark?: 'star' | 'bolt' | 'wave' | 'ring' | 'sun' | 'drop' | 'pixel' | 'ball';
}

const BRANDS: Brand[] = [
  { text: 'NOVA DRINKS', bg: ['#0a2a6b', '#1d55d6'], fg: '#ffffff', accent: '#ff9d1c', italic: true, mark: 'star' },
  { text: 'KORVEX', bg: ['#050505', '#1b1b1b'], fg: '#e8ff2a', mark: 'bolt' },
  { text: 'SOLARA AIR', bg: ['#ff7a18', '#ffcf3a'], fg: '#14204a', mark: 'sun' },
  { text: "SOFFTI'S FOOTBALL", bg: ['#0b0f14', '#16202b'], fg: '#ffffff', accent: '#38f27d', italic: true, mark: 'ball' },
  { text: 'ZENTRA BANK', bg: ['#00694a', '#00a06d'], fg: '#ffffff', mark: 'ring' },
  { text: 'VOLTIX', bg: ['#4b00c9', '#8a2bff'], fg: '#ffffff', accent: '#ffe14a', italic: true, mark: 'bolt' },
  { text: 'PIXELNET', bg: ['#ffffff', '#e9edf2'], fg: '#e0102a', mark: 'pixel' },
  { text: 'AQUAFRESCA', bg: ['#0090c8', '#29c6f0'], fg: '#ffffff', accent: '#bff6ff', mark: 'drop' },
];
export const LED_PANELS = BRANDS.length;
/** physical aspect ratio of one ad panel (length / height) */
export const LED_ASPECT = 7.5;

function drawMark(ctx: CanvasRenderingContext2D, mark: Brand['mark'], x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.22;
  ctx.beginPath();
  switch (mark) {
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
      break;
    case 'bolt':
      ctx.moveTo(x + r * 0.2, y - r);
      ctx.lineTo(x - r * 0.5, y + r * 0.1);
      ctx.lineTo(x, y + r * 0.1);
      ctx.lineTo(x - r * 0.2, y + r);
      ctx.lineTo(x + r * 0.55, y - r * 0.15);
      ctx.lineTo(x + r * 0.05, y - r * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    case 'sun':
      ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
      break;
    case 'ring':
      ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'drop':
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x + r * 0.8, y + r * 0.1, x, y + r * 0.8);
      ctx.quadraticCurveTo(x - r * 0.8, y + r * 0.1, x, y - r);
      ctx.fill();
      break;
    case 'pixel':
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) ctx.fillRect(x - r + i * r * 0.7, y - r + j * r * 0.7, r * 0.6, r * 0.6);
      break;
    case 'ball':
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        ctx.lineTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
      }
      ctx.closePath();
      ctx.fill();
      break;
    default:
      break;
  }
  ctx.restore();
}

/** LED strip with all brands side by side; one panel = 1/LED_PANELS of u. */
export function makeLedTexture(): THREE.CanvasTexture {
  const PW = 512;
  const PH = 128;
  const { c, ctx } = makeCanvas(PW * BRANDS.length, PH);
  const sx = PW / PH / LED_ASPECT; // horizontal pre-compression so text is not stretched
  BRANDS.forEach((b, i) => {
    const x0 = i * PW;
    const grad = ctx.createLinearGradient(x0, 0, x0 + PW, PH);
    grad.addColorStop(0, b.bg[0]);
    grad.addColorStop(1, b.bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(x0, 0, PW, PH);
    // subtle diagonal sheen
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(x0 + PW * 0.55, 0);
    ctx.lineTo(x0 + PW * 0.75, 0);
    ctx.lineTo(x0 + PW * 0.6, PH);
    ctx.lineTo(x0 + PW * 0.4, PH);
    ctx.fill();
    if (b.accent) {
      ctx.fillStyle = b.accent;
      ctx.fillRect(x0, PH - 10, PW, 10);
    }
    ctx.save();
    ctx.translate(x0 + PW / 2, PH / 2);
    ctx.scale(sx, 1);
    const font = `${b.italic ? 'italic ' : ''}900 ${b.text.length > 12 ? 70 : 84}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(b.text).width;
    const markR = 34;
    const total = tw + (b.mark ? markR * 2.6 : 0);
    const maxW = (PW / sx) * 0.9;
    const k = Math.min(1, maxW / total);
    ctx.scale(k, k);
    let tx = 0;
    if (b.mark) {
      drawMark(ctx, b.mark, -total / 2 + markR, 2, markR, b.accent ?? b.fg);
      tx = markR * 1.3;
    }
    ctx.fillStyle = b.fg;
    ctx.fillText(b.text, tx, 6);
    ctx.restore();
    // panel separators (LED module seams)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x0, 0, 2, PH);
  });
  // LED pixel grid
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < PH; y += 4) ctx.fillRect(0, y, c.width, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
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
      // neck + head
      ctx.fillStyle = SKIN;
      ctx.fillRect(cx - 4 * sc, headY + headR - 3, 8 * sc, 9 * sc);
      ctx.beginPath();
      ctx.ellipse(cx, headY, headR * 0.92, headR, 0, 0, Math.PI * 2);
      ctx.fill();
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
