import type { KitData, TeamData } from '../data/types';

// Escudos y camisetas originales generados como SVG.

const SYMBOLS: Record<TeamData['crest']['symbol'], string> = {
  star: 'M50 22 L57 40 L76 40 L61 52 L67 71 L50 59 L33 71 L39 52 L24 40 L43 40 Z',
  ball: 'M50 26 a22 22 0 1 0 0.01 0 Z M50 36 L60 43 L56 55 L44 55 L40 43 Z',
  lion: 'M34 62 C30 46 36 30 50 28 C64 30 70 46 66 62 C60 56 56 58 50 66 C44 58 40 56 34 62 Z M44 44 a3 3 0 1 0 0.01 0 Z M56 44 a3 3 0 1 0 0.01 0 Z',
  wave: 'M24 52 C32 40 40 40 46 50 C52 60 60 60 66 50 C70 44 74 44 76 46 L76 58 C70 56 66 64 58 66 C50 68 44 60 40 56 C34 50 28 54 24 60 Z',
  bolt: 'M54 20 L34 54 L48 54 L42 80 L66 42 L52 42 L60 20 Z',
  crown: 'M28 64 L28 38 L40 50 L50 32 L60 50 L72 38 L72 64 Z M28 68 L72 68 L72 74 L28 74 Z',
  tower: 'M38 74 L38 40 L34 40 L34 30 L40 30 L40 34 L46 34 L46 30 L54 30 L54 34 L60 34 L60 30 L66 30 L66 40 L62 40 L62 74 Z M46 74 L46 60 a4 4 0 0 1 8 0 L54 74 Z',
  none: '',
  eagle: 'M50 30 L56 40 L76 34 L64 50 L72 52 L58 58 L54 72 L50 64 L46 72 L42 58 L28 52 L36 50 L24 34 L44 40 Z',
};

export function crestSVG(t: TeamData, size = 100): string {
  const c = t.crest;
  if (c.image) return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><image href="${c.image}" x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet"/></svg>`;
  let shape = '';
  if (c.shape === 'shield') shape = 'M50 4 L90 14 L90 46 C90 72 72 88 50 96 C28 88 10 72 10 46 L10 14 Z';
  else if (c.shape === 'circle') shape = 'M50 4 a46 46 0 1 0 0.01 0 Z';
  else shape = 'M50 2 L96 50 L50 98 L4 50 Z';
  const id = `g${t.id}`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.primary}"/><stop offset="1" stop-color="${shade(c.primary, -0.35)}"/></linearGradient></defs>
    <path d="${shape}" fill="${c.secondary}"/>
    ${c.stripes
      ? `<pattern id="${id}s" width="16" height="100" patternUnits="userSpaceOnUse"><rect width="8" height="100" fill="${c.primary}"/><rect x="8" width="8" height="100" fill="${c.secondary}"/></pattern>
    <path d="${shape}" fill="url(#${id}s)" transform="translate(50 50) scale(0.88) translate(-50 -50)"/>`
      : `<path d="${shape}" fill="url(#${id})" transform="translate(50 50) scale(0.88) translate(-50 -50)"/>`}
    <path d="${SYMBOLS[c.symbol]}" fill="${c.secondary}" fill-rule="evenodd" transform="translate(50 52) scale(0.62) translate(-50 -50)"/>
    ${c.stripes
      ? `<text x="50" y="62" font-family="Rajdhani, Arial" font-weight="800" font-size="30" text-anchor="middle" fill="#0b3d6b" stroke="#ffffff" stroke-width="3" paint-order="stroke">${t.short}</text>`
      : `<text x="50" y="${c.shape === 'diamond' ? 80 : 86}" font-family="Rajdhani, Arial" font-weight="700" font-size="12" text-anchor="middle" fill="${c.secondary}">${t.short}</text>`}
  </svg>`;
}

export function kitSVG(k: KitData, size = 54): string {
  const id = `k${Math.random().toString(36).slice(2, 8)}`;
  let fill = k.shirt;
  let defs = '';
  if (k.pattern === 'gradient') {
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.shirt}"/><stop offset="1" stop-color="${k.shirt2}"/></linearGradient>`;
    fill = `url(#${id})`;
  } else if (k.pattern === 'stripes') {
    defs = `<pattern id="${id}" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="6" height="10" fill="${k.shirt}"/><rect x="6" width="6" height="10" fill="${k.shirt2}"/></pattern>`;
    fill = `url(#${id})`;
  } else if (k.pattern === 'hoops') {
    defs = `<pattern id="${id}" width="10" height="12" patternUnits="userSpaceOnUse"><rect width="10" height="6" fill="${k.shirt}"/><rect y="6" width="10" height="6" fill="${k.shirt2}"/></pattern>`;
    fill = `url(#${id})`;
  } else if (k.pattern === 'band') {
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.36" stop-color="${k.shirt}"/><stop offset="0.36" stop-color="${k.shirt2}"/><stop offset="0.56" stop-color="${k.shirt2}"/><stop offset="0.56" stop-color="${k.shirt}"/></linearGradient>`;
    fill = `url(#${id})`;
  } else if (k.pattern === 'halves') {
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0.5" stop-color="${k.shirt}"/><stop offset="0.5" stop-color="${k.shirt2}"/></linearGradient>`;
    fill = `url(#${id})`;
  } else if (k.pattern === 'sash') {
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0.42" stop-color="${k.shirt}"/><stop offset="0.42" stop-color="${k.shirt2}"/><stop offset="0.58" stop-color="${k.shirt2}"/><stop offset="0.58" stop-color="${k.shirt}"/></linearGradient>`;
    fill = `url(#${id})`;
  }
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>
    <path d="M30 10 L42 6 Q50 14 58 6 L70 10 L94 26 L84 44 L74 38 L74 92 L26 92 L26 38 L16 44 L6 26 Z" fill="${fill}" stroke="rgba(0,0,0,0.35)" stroke-width="2"/>
    ${k.pattern === 'vee' ? `<path d="M36 8 L50 44 L64 8" fill="none" stroke="${k.shirt2}" stroke-width="7"/>` : ''}
    <text x="50" y="66" font-family="Rajdhani, Arial" font-weight="700" font-size="30" text-anchor="middle" fill="${k.number}">10</text></svg>`;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
