// Textura de piel con la cara pintada (ojos, cejas, nariz, boca, barba), generada en canvas.
// La mitad superior del canvas es la cabeza (u = vuelta completa, v = altura HEAD_Y0..HEAD_Y1);
// la mitad inferior es piel lisa (cuello, brazos y piernas muestrean v = 0,5).
import * as THREE from 'three';

/** Alturas (modelo 1.80 m) que cubre la región de la cabeza: v ∈ [0.5, 1]. Compartido con bodyGeometry. */
export const HEAD_Y0 = 1.56;
export const HEAD_Y1 = 1.81;
/** u del centro de la cara (igual que el pecho en la camiseta). */
const U_FRONT = 0.75;
// semiejes de la cabeza a la altura de los ojos (ver torsoKeys)
const RS = 0.078;
const RF = 0.09;

export interface FaceSpec {
  skin: THREE.Color;
  hairColor: string;
  /** 0..1 estable por jugador: decide barba, color de ojos y forma de las cejas. */
  seed: number;
}

const cache = new Map<string, THREE.CanvasTexture>();

/** u de un punto de la cara a `x` metros del centro (longitud de arco de la elipse de la cabeza). */
function faceU(x: number) {
  const N = 64;
  const th1 = Math.acos(Math.min(1, Math.abs(x) / RS)); // π/2 = centro de la cara
  let arc = 0;
  let quarter = 0;
  for (let i = 0; i < N; i++) {
    const a = (Math.PI / 2) * (i / N);
    const b = (Math.PI / 2) * ((i + 1) / N);
    const d = Math.hypot(RS * (Math.cos(b) - Math.cos(a)), RF * (Math.sin(b) - Math.sin(a)));
    quarter += d;
    if (a >= th1) arc += d;
  }
  // +X (izquierda del jugador) = u creciente desde el centro de la cara
  return U_FRONT + Math.sign(x) * 0.25 * (arc / quarter);
}

const css = (c: THREE.Color, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;

export function faceTexture(spec: FaceSpec, size: number): THREE.CanvasTexture {
  const variant = Math.floor(spec.seed * 997) % 20;
  const key = `${spec.skin.getHexString()}|${spec.hairColor}|${variant}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = size * 2;
  const H = size;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  // los colores del canvas son sRGB: la piel se pasa de lineal a sRGB
  const skin = new THREE.Color().copy(spec.skin).convertLinearToSRGB();
  const dark = skin.clone().multiplyScalar(0.62);
  const hair = new THREE.Color(spec.hairColor).multiplyScalar(0.55);
  const X = (x: number) => faceU(x) * W;
  const Y = (y: number) => ((HEAD_Y1 - y) / (HEAD_Y1 - HEAD_Y0)) * (H / 2);
  const mx = W / (2 * Math.PI * ((RS + RF) / 2)); // px por metro en horizontal (aprox.)
  const my = H / 2 / (HEAD_Y1 - HEAD_Y0);

  g.fillStyle = css(skin);
  g.fillRect(0, 0, W, H);

  // sombra suave bajo la mandíbula y en el cuello
  const jaw = g.createLinearGradient(0, Y(1.61), 0, Y(1.565));
  jaw.addColorStop(0, css(dark, 0));
  jaw.addColorStop(1, css(dark, 0.45));
  g.fillStyle = jaw;
  g.fillRect(0, Y(1.61), W, Y(1.56) - Y(1.61));

  const blob = (x: number, y: number, rx: number, ry: number, color: string) => {
    const cx = X(x);
    const cy = Y(y);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 1);
    gr.addColorStop(0, color);
    gr.addColorStop(1, color.replace(/,[\d.]+\)$/, ',0)'));
    g.save();
    g.translate(cx, cy);
    g.scale(rx * mx, ry * my);
    g.translate(-cx, -cy);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  // barba: 0-8 afeitado, 9-13 barba de días, 14-16 barba cerrada, 17-18 perilla y bigote, 19 bigote
  const beard = variant < 9 ? 0 : variant < 14 ? 1 : variant < 17 ? 2 : variant < 19 ? 3 : 4;
  if (beard === 1 || beard === 2) {
    // contorno: patilla → mandíbula → bigote, y hacia abajo hasta el cuello; borde difuminado
    const top: [number, number][] = [[0.082, 1.69], [0.074, 1.64], [0.056, 1.612], [0.036, 1.618], [0.026, 1.64], [0, 1.645]];
    g.save();
    g.filter = `blur(${Math.max(1, Math.round(H / 128))}px)`;
    g.fillStyle = css(hair, beard === 1 ? 0.34 : 0.92);
    g.beginPath();
    g.moveTo(X(-0.08), Y(1.572));
    for (let i = 0; i < top.length; i++) g.lineTo(X(-top[i][0]), Y(top[i][1]));
    for (let i = top.length - 2; i >= 0; i--) g.lineTo(X(top[i][0]), Y(top[i][1]));
    g.lineTo(X(0.08), Y(1.572));
    g.closePath();
    g.fill();
    g.restore();
  } else if (beard >= 3) {
    blob(0, 1.637, 0.03, 0.011, css(hair, 0.85));
    if (beard === 3) blob(0, 1.597, 0.022, 0.026, css(hair, 0.85));
  }

  // mejillas y cuencas de los ojos
  const blush = skin.clone().lerp(new THREE.Color('#c0392b'), 0.5);
  for (const s of [-1, 1]) {
    blob(s * 0.045, 1.652, 0.026, 0.02, css(blush, 0.16));
    blob(s * 0.031, 1.697, 0.028, 0.02, css(dark, 0.4));
  }

  // nariz: sombra a los lados del puente, aletas y brillo en el caballete
  for (const s of [-1, 1]) {
    blob(s * 0.014, 1.672, 0.007, 0.03, css(dark, 0.35));
    blob(s * 0.008, 1.651, 0.0045, 0.0035, css(dark.clone().multiplyScalar(0.5), 0.85));
  }
  blob(0, 1.676, 0.004, 0.025, 'rgba(255,255,255,0.14)');
  blob(0, 1.645, 0.02, 0.004, css(dark, 0.4));

  // ojos
  const irisCol = ['#4a2f1b', '#4a2f1b', '#5b3a1f', '#2f2018', '#3f6a8a', '#58764a'][Math.floor(spec.seed * 61) % 6];
  for (const s of [-1, 1]) {
    const cx = X(s * 0.031);
    const cy = Y(1.693);
    const rx = 0.0135 * mx;
    const ry = 0.0064 * my;
    g.save();
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = '#efe9e2';
    g.fill();
    g.clip();
    g.fillStyle = irisCol;
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.1, 0.0058 * mx, 0.0058 * my, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0a0706';
    g.beginPath();
    g.ellipse(cx, cy - ry * 0.1, 0.0027 * mx, 0.0027 * my, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(cx + 0.002 * mx, cy - 0.002 * my, 0.0011 * mx, 0.0011 * my, 0, 0, Math.PI * 2);
    g.fill();
    // sombra del párpado sobre el ojo
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(cx - rx, cy - ry, rx * 2, ry * 0.55);
    g.restore();
    // línea de pestañas (arriba, marcada) y párpado inferior (suave)
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(20,12,8,0.95)';
    g.lineWidth = Math.max(1, 0.0016 * my);
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.03, Math.PI * 1.97);
    g.stroke();
    g.strokeStyle = css(dark, 0.7);
    g.lineWidth = Math.max(1, 0.0009 * my);
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.1, Math.PI * 0.9);
    g.stroke();
  }

  // cejas: del color del pelo, más gruesas hacia el centro; el arco cambia con la semilla
  const arch = 0.002 + (Math.floor(spec.seed * 331) % 4) * 0.0012;
  for (const s of [-1, 1]) {
    g.strokeStyle = css(hair, 0.95);
    g.lineCap = 'round';
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const a = i / steps;
      const b = (i + 1) / steps;
      const px = (t: number) => X(s * (0.012 + 0.04 * t));
      const py = (t: number) => Y(1.7105 + arch * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.003 * t * t);
      g.lineWidth = Math.max(1, (0.0052 - 0.003 * a) * my);
      g.beginPath();
      g.moveTo(px(a), py(a));
      g.lineTo(px(b), py(b));
      g.stroke();
    }
  }

  // boca: línea entre los labios, labio inferior y sombra debajo
  const lip = skin.clone().lerp(new THREE.Color('#8e3b34'), 0.45);
  blob(0, 1.6175, 0.021, 0.0058, css(lip, 0.75));
  blob(0, 1.6255, 0.02, 0.004, css(lip, 0.5));
  g.strokeStyle = css(dark.clone().multiplyScalar(0.45), 0.95);
  g.lineWidth = Math.max(1, 0.0014 * my);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(X(-0.023), Y(1.6225));
  g.quadraticCurveTo(X(0), Y(1.6205), X(0.023), Y(1.6225));
  g.stroke();
  blob(0, 1.608, 0.016, 0.004, css(dark, 0.35));

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export function clearFaceTextureCache() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
