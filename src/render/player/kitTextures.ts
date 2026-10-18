// Texturas de equipación generadas en canvas (camiseta con patrón + dorsal + nombre, pantalón con número, medias).
// Las texturas se cachean por clave (kit + dorsal + nombre + tamaño) y se comparten entre jugadores.
import * as THREE from 'three';
import type { KitData } from '../../data/types';

// ---- Layout UV compartido con la geometría (bodyGeometry.ts) ----
/** Camiseta: torso ocupa v ∈ [SHIRT_TORSO_V0, 1]; mangas v ∈ [0, SHIRT_TORSO_V0]. */
export const SHIRT_TORSO_V0 = 0.25;
/** Alturas (modelo 1.80 m) que cubre la región del torso de la textura. */
export const SHIRT_Y0 = 0.955;
export const SHIRT_Y1 = 1.495;
/** u: 0 = costado izquierdo (+X), 0.25 = centro espalda, 0.5 = costado derecho, 0.75 = centro pecho. */
export const SHIRT_U_BACK = 0.25;
export const SHIRT_U_FRONT = 0.75;
/** Pantalón: pelvis v ∈ [0.5, 1] (y de SHORTS_PELVIS_Y0 a SHORTS_PELVIS_Y1); piernas v ∈ [0, 0.5]. */
export const SHORTS_PELVIS_Y0 = 0.83;
export const SHORTS_PELVIS_Y1 = 1.0;
export const SHORTS_LEG_Y0 = 0.735;
export const SHORTS_LEG_Y1 = 1.0;
/** Medias: v de SOCK_Y0 (0) a SOCK_Y1 (1). */
export const SOCK_Y0 = 0.08;
export const SOCK_Y1 = 0.475;

// Escalas aproximadas (px/m) para no deformar los textos
const SHIRT_BACK_HALF_PERIM = 0.47; // m (media circunferencia del torso a la altura del dorsal)
const SHORTS_LEG_PERIM = 0.62;

const cache = new Map<string, THREE.CanvasTexture>();

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function contrastOutline(fill: string, bg: string) {
  // contorno sutil que separa el número del fondo
  const lf = luminance(fill);
  const lb = luminance(bg);
  if (Math.abs(lf - lb) > 0.45) return 'rgba(0,0,0,0.25)';
  return lf > 0.5 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.8)';
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}

const FONT = '"Montserrat", "Arial Black", "Helvetica Neue", "DejaVu Sans", Arial, sans-serif';

/** Dibuja un texto centrado en (cx, cy) con altura de mayúscula ~h px y compresión horizontal sx. */
function drawText(
  ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, h: number, sx: number,
  fill: string, outline: string, maxW: number, strokeK = 0.09,
) {
  const size = h / 0.74;
  ctx.save();
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width * sx;
  const fit = w > maxW ? maxW / w : 1;
  ctx.translate(cx, cy);
  ctx.scale(sx * fit, 1);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * strokeK);
  ctx.strokeStyle = outline;
  ctx.strokeText(text, 0, size * 0.04);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, size * 0.04);
  ctx.restore();
}

function drawPattern(ctx: CanvasRenderingContext2D, kit: KitData, W: number, y0: number, h: number, sleeves: boolean) {
  const { shirt, shirt2 } = kit;
  ctx.fillStyle = shirt;
  ctx.fillRect(0, y0, W, h);
  switch (kit.pattern) {
    case 'gradient': {
      if (sleeves) break;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
      g.addColorStop(0, shirt);
      g.addColorStop(0.25, shirt);
      g.addColorStop(1, shirt2);
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, W, h);
      break;
    }
    case 'stripes': {
      const n = 14; // franjas alrededor del torso
      const p = W / n;
      ctx.fillStyle = shirt2;
      // centradas: franja de color principal en el centro del pecho y espalda
      for (let i = 0; i < n; i++) ctx.fillRect(i * p + p * 0.25, y0, p / 2, h);
      break;
    }
    case 'hoops': {
      const n = sleeves ? 2 : 7;
      const p = h / n;
      ctx.fillStyle = shirt2;
      for (let i = 0; i < n; i++) ctx.fillRect(0, y0 + i * p + p / 2, W, p / 2);
      break;
    }
    case 'sash': {
      if (sleeves) break;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, W, h);
      ctx.clip();
      ctx.strokeStyle = shirt2;
      ctx.lineWidth = W * 0.085;
      ctx.lineCap = 'butt';
      // frente (u 0.5..1): del hombro izquierdo (u≈0.93) a la cadera derecha (u≈0.56)
      ctx.beginPath();
      ctx.moveTo(W * 0.95, y0 - h * 0.05);
      ctx.lineTo(W * 0.55, y0 + h * 1.05);
      ctx.stroke();
      // espalda (u 0..0.5): del hombro izquierdo (u≈0.05) a la cadera derecha (u≈0.45)
      ctx.beginPath();
      ctx.moveTo(W * 0.05, y0 - h * 0.05);
      ctx.lineTo(W * 0.45, y0 + h * 1.05);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'band': {
      // franja horizontal ancha a la altura del pecho (también en las mangas)
      ctx.fillStyle = shirt2;
      ctx.fillRect(0, y0 + h * (sleeves ? 0.35 : 0.3), W, h * (sleeves ? 0.3 : 0.22));
      break;
    }
    case 'halves': {
      if (sleeves) break;
      // frente (u 0.5..1) y espalda (u 0..0.5): cada uno partido al medio
      ctx.fillStyle = shirt2;
      ctx.fillRect(W * 0.75, y0, W * 0.25, h);
      ctx.fillRect(W * 0.25, y0, W * 0.25, h);
      break;
    }
    case 'vee': {
      if (sleeves) break;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, W, h);
      ctx.clip();
      ctx.strokeStyle = shirt2;
      ctx.lineWidth = W * 0.06;
      ctx.lineJoin = 'miter';
      // V en el pecho: de los hombros (u≈0.56 y 0.94) al centro (u 0.75)
      ctx.beginPath();
      ctx.moveTo(W * 0.55, y0 - h * 0.02);
      ctx.lineTo(W * 0.75, y0 + h * 0.5);
      ctx.lineTo(W * 0.95, y0 - h * 0.02);
      ctx.stroke();
      ctx.restore();
      break;
    }
    default:
      break;
  }
}

function yToShirtCanvas(y: number, H: number) {
  const v = SHIRT_TORSO_V0 + (1 - SHIRT_TORSO_V0) * (y - SHIRT_Y0) / (SHIRT_Y1 - SHIRT_Y0);
  return (1 - v) * H;
}

export function shirtTexture(kit: KitData, number: number, name: string, size: number, longSleeves: boolean): THREE.CanvasTexture {
  const key = `shirt|${JSON.stringify(kit)}|${number}|${name}|${size}|${longSleeves ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = size;
  const H = size;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const torsoH = H * (1 - SHIRT_TORSO_V0);
  drawPattern(ctx, kit, W, 0, torsoH, false);
  drawPattern(ctx, kit, W, torsoH, H - torsoH, true);
  // ligera sombra/tono en la parte baja del torso para volumen
  const trim = kit.shirt2.toLowerCase() === kit.shirt.toLowerCase() ? shade(kit.shirt, 0.6) : kit.shirt2;
  // cuello
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, W, Math.max(2, torsoH * 0.035));
  // puños de las mangas (parte inferior de la región de mangas)
  ctx.fillRect(0, H - (H - torsoH) * (longSleeves ? 0.06 : 0.12), W, (H - torsoH) * (longSleeves ? 0.06 : 0.12));
  // costuras laterales sutiles
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect(0, 0, W * 0.006, torsoH);
  ctx.fillRect(W * 0.497, 0, W * 0.006, torsoH);
  ctx.fillRect(W * 0.994, 0, W * 0.006, torsoH);

  const pxPerMx = (W * 0.5) / SHIRT_BACK_HALF_PERIM;
  const pxPerMy = torsoH / (SHIRT_Y1 - SHIRT_Y0);
  const sx = pxPerMx / pxPerMy;
  const numColor = kit.number;
  const busy = kit.pattern === 'stripes' || kit.pattern === 'hoops';
  const outline = busy ? (luminance(numColor) > 0.5 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)') : contrastOutline(numColor, kit.shirt);
  // número 0 = sin dorsal (árbitro)
  const num = number > 0 ? String(number) : '';
  // dorsal en la espalda
  const yTop = yToShirtCanvas(1.33, H);
  const yBot = yToShirtCanvas(1.1, H);
  drawText(ctx, num, W * SHIRT_U_BACK, (yTop + yBot) / 2, yBot - yTop, sx, numColor, outline, W * 0.4, busy ? 0.13 : 0.09);
  // nombre encima del dorsal
  const nTop = yToShirtCanvas(1.405, H);
  const nBot = yToShirtCanvas(1.36, H);
  drawText(ctx, name.toUpperCase(), W * SHIRT_U_BACK, (nTop + nBot) / 2, nBot - nTop, sx, numColor, outline, W * 0.36, busy ? 0.2 : 0.09);
  // número pequeño en el pecho (lado derecho del jugador)
  const fTop = yToShirtCanvas(1.37, H);
  const fBot = yToShirtCanvas(1.3, H);
  drawText(ctx, num, W * 0.665, (fTop + fBot) / 2, fBot - fTop, sx, numColor, outline, W * 0.1);
  // escudo en el pecho (lado izquierdo del jugador)
  {
    const cx = W * 0.84;
    const cy = (fTop + fBot) / 2;
    const r = (fBot - fTop) * 0.55;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, 1);
    ctx.beginPath();
    ctx.moveTo(-r, -r);
    ctx.lineTo(r, -r);
    ctx.lineTo(r, r * 0.2);
    ctx.quadraticCurveTo(r, r * 0.9, 0, r * 1.3);
    ctx.quadraticCurveTo(-r, r * 0.9, -r, r * 0.2);
    ctx.closePath();
    ctx.fillStyle = numColor;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.25);
    ctx.strokeStyle = trim;
    ctx.stroke();
    ctx.restore();
  }
  const tex = finish(canvas);
  cache.set(key, tex);
  return tex;
}

export function shortsTexture(kit: KitData, number: number, size: number): THREE.CanvasTexture {
  const key = `shorts|${kit.shorts}|${kit.shirt}|${kit.shirt2}|${kit.number}|${number}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = size;
  const H = size;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = kit.shorts;
  ctx.fillRect(0, 0, W, H);
  const accent = kit.shirt2.toLowerCase() !== kit.shorts.toLowerCase() ? kit.shirt2 : kit.shirt.toLowerCase() !== kit.shorts.toLowerCase() ? kit.shirt : shade(kit.shorts, 0.6);
  // cinturilla (parte superior de la región de pelvis)
  ctx.fillStyle = shade(kit.shorts, 0.85);
  ctx.fillRect(0, 0, W, H * 0.04);
  // franjas laterales en las piernas (costado exterior: u=0.5 de cada pierna)
  ctx.fillStyle = accent;
  ctx.fillRect(W * 0.25 - W * 0.012, H * 0.5, W * 0.024, H * 0.5);
  ctx.fillRect(W * 0.75 - W * 0.012, H * 0.5, W * 0.024, H * 0.5);
  // ribete del bajo
  ctx.fillRect(0, H - H * 0.03, W, H * 0.03);
  // número en la pernera izquierda (frente: u=0.25 → x = 0.125 W)
  const legV = (y: number) => 0.5 * (y - SHORTS_LEG_Y0) / (SHORTS_LEG_Y1 - SHORTS_LEG_Y0);
  const yTop = (1 - legV(0.865)) * H;
  const yBot = (1 - legV(0.785)) * H;
  const pxPerMx = (W * 0.5) / SHORTS_LEG_PERIM;
  const pxPerMy = (H * 0.5) / (SHORTS_LEG_Y1 - SHORTS_LEG_Y0);
  drawText(ctx, number > 0 ? String(number) : '', W * 0.125, (yTop + yBot) / 2, yBot - yTop, pxPerMx / pxPerMy, kit.number === kit.shorts ? accent : kit.number, contrastOutline(kit.number, kit.shorts), W * 0.14);
  const tex = finish(canvas);
  cache.set(key, tex);
  return tex;
}

export function socksTexture(kit: KitData): THREE.CanvasTexture {
  const key = `socks|${kit.socks}|${kit.shirt}|${kit.shirt2}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = kit.socks;
  ctx.fillRect(0, 0, 16, 128);
  const band = kit.shirt2.toLowerCase() !== kit.socks.toLowerCase() ? kit.shirt2 : kit.shirt.toLowerCase() !== kit.socks.toLowerCase() ? kit.shirt : shade(kit.socks, 0.65);
  ctx.fillStyle = band;
  ctx.fillRect(0, 128 * 0.07, 16, 128 * 0.07);
  ctx.fillStyle = shade(kit.socks, 0.88);
  ctx.fillRect(0, 0, 16, 128 * 0.035);
  const tex = finish(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  cache.set(key, tex);
  return tex;
}

/** Libera todas las texturas de equipación cacheadas. */
export function clearKitTextureCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
