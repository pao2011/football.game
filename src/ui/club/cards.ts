import { getTeam } from '../../data/teams';
import type { KitData } from '../../data/types';
import { STAT_KEYS, statLabels } from '../../modes/club/catalog';
import { RARITY_NAMES, type CardDef } from '../../modes/club/types';
import { crestSVG } from '../Crest';
import { esc } from '../dom';

// Cartas coleccionables de Soffti Club: diseño propio (no copia ninguna carta comercial). Todas las rarezas comparten la
// misma estructura (valoración, puesto, retrato, nombre, seis estadísticas) y cambian de color, marco y efectos.

const NAT_CODE: Record<string, string> = {
  Argentina: 'ARG', Brasil: 'BRA', Uruguay: 'URU', Colombia: 'COL', Chile: 'CHI', Paraguay: 'PAR', Ecuador: 'ECU', Venezuela: 'VEN', 'Perú': 'PER', Bolivia: 'BOL',
  'España': 'ESP', Francia: 'FRA', Italia: 'ITA', Alemania: 'ALE', Inglaterra: 'ING', Portugal: 'POR', 'Países Bajos': 'PAI', 'Bélgica': 'BEL', 'Turquía': 'TUR', Escocia: 'ESC',
  Nigeria: 'NGA', Suecia: 'SUE',
};
export const natCode = (n: string) => NAT_CODE[n] ?? n.slice(0, 3).toUpperCase();

let uid = 0;
const hex = (c: string) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (c: string, k: number) => { const [r, g, b] = hex(c); const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

/** Retrato ilustrado (busto) con la camiseta del club: piel con volumen, orejas, cejas, ojos, barba opcional y 6 peinados. */
export function avatarSVG(face: CardDef['face'], kit: Pick<KitData, 'shirt' | 'shirt2' | 'pattern'> | string = '#3b82f6'): string {
  const k = typeof kit === 'string' ? { shirt: kit, shirt2: '#ffffff', pattern: 'solid' as const } : kit;
  const id = `av${uid++}`;
  const h = Math.floor(face.skin * 997 + face.height * 311) >>> 0;
  const s = face.skin;
  const skin = `hsl(${24 + s * 6}, ${40 + s * 16}%, ${84 - s * 50}%)`;
  const skinLo = `hsl(${20 + s * 6}, ${44 + s * 16}%, ${62 - s * 42}%)`;
  const skinHi = `hsl(${26 + s * 6}, ${40 + s * 14}%, ${92 - s * 52}%)`;
  const hair = face.hair;
  const hairHi = mix(hair, 0.35);
  const hairLo = mix(hair, -0.4);
  const style = (face.style + (h % 3)) % 6;
  const beard = (h >> 3) % 5 === 0 ? 2 : (h >> 3) % 5 === 1 ? 1 : 0; // 0 sin barba · 1 sombra · 2 barba
  const HAIR = [
    'M31 40C30 17 70 17 69 40C66 29 34 29 31 40Z', // corto
    'M27 44C22 12 78 12 73 44C72 30 28 30 27 44Z', // volumen
    'M29 36C34 14 66 14 71 36L74 62C68 44 32 44 26 62Z', // largo
    'M33 31C40 23 60 23 67 31C60 27 40 27 33 31Z', // rapado
    'M30 38C31 16 69 14 70 38C67 28 56 22 40 24C34 26 31 31 30 38Z', // peinado hacia atrás
    'M28 38C24 22 34 12 44 14C46 8 58 8 60 14C70 12 78 24 72 38C70 30 66 25 50 25C34 25 30 30 28 38Z', // rizado
  ][style];
  const strip = (c1: string, c2: string) => {
    switch (k.pattern) {
      case 'stripes': return Array.from({ length: 9 }, (_, i) => `<rect x="${i * 12 - 6}" y="70" width="6" height="45" fill="${i % 2 ? c1 : c2}"/>`).join('');
      case 'hoops': return Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${76 + i * 9}" width="100" height="4.5" fill="${c2}"/>`).join('');
      case 'band': return `<rect x="0" y="88" width="100" height="9" fill="${c2}"/>`;
      case 'halves': return `<rect x="50" y="70" width="50" height="45" fill="${c2}"/>`;
      case 'sash': return `<path d="M0 78L30 70L100 110L100 125Z" fill="${c2}"/>`;
      case 'vee': return `<path d="M30 76L50 104L70 76L70 70L30 70Z" fill="${c2}"/>`;
      case 'gradient': return `<rect x="0" y="70" width="100" height="45" fill="url(#${id}g)"/>`;
      default: return '';
    }
  };
  const shirt = k.shirt;
  const beardSVG = beard === 0 ? '' : beard === 1
    ? `<path d="M33 50C34 66 66 66 67 50C66 60 34 60 33 50Z" fill="${hair}" opacity="0.35"/>`
    : `<path d="M32 48C31 72 69 72 68 48C66 60 60 58 50 61C40 58 34 60 32 48Z" fill="${hair}" opacity="0.85"/>`;
  return `<svg viewBox="0 0 100 112" class="fc-face" aria-hidden="true">
    <defs>
      <radialGradient id="${id}f" cx="38%" cy="32%" r="78%"><stop offset="0" stop-color="${skinHi}"/><stop offset="0.5" stop-color="${skin}"/><stop offset="1" stop-color="${skinLo}"/></radialGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(shirt, 0.18)}"/><stop offset="1" stop-color="${mix(shirt, -0.3)}"/></linearGradient>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shirt}"/><stop offset="1" stop-color="${k.shirt2}"/></linearGradient>
      <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hairHi}"/><stop offset="0.6" stop-color="${hair}"/><stop offset="1" stop-color="${hairLo}"/></linearGradient>
      <clipPath id="${id}c"><path d="M2 112C2 88 20 80 38 77L62 77C80 80 98 88 98 112Z"/></clipPath>
    </defs>
    <ellipse cx="50" cy="108" rx="46" ry="5" fill="#000" opacity="0.22"/>
    <g clip-path="url(#${id}c)"><rect x="0" y="70" width="100" height="45" fill="url(#${id}s)"/>${strip(shirt, k.shirt2)}<path d="M0 100C30 92 70 92 100 100V112H0Z" fill="#000" opacity="0.12"/></g>
    <path d="M38 77L50 93L62 77L60 74C56 79 44 79 40 74Z" fill="${mix(k.shirt2, 0.1)}" stroke="${mix(shirt, -0.35)}" stroke-width="0.8"/>
    <path d="M42 62H58L59 78C55 84 45 84 41 78Z" fill="${skinLo}"/><path d="M42 70C48 76 54 76 58 70L58 76C53 80 47 80 42 76Z" fill="#000" opacity="0.14"/>
    <ellipse cx="31.5" cy="49" rx="3.6" ry="5.2" fill="url(#${id}f)"/><ellipse cx="68.5" cy="49" rx="3.6" ry="5.2" fill="url(#${id}f)"/>
    <ellipse cx="50" cy="47" rx="19.5" ry="24" fill="url(#${id}f)"/>
    <path d="M50 72C42 72 34 64 32 52C34 66 42 74 50 74C58 74 66 66 68 52C66 64 58 72 50 72Z" fill="#000" opacity="0.1"/>
    ${beardSVG}
    <path d="${HAIR}" fill="url(#${id}h)"/>
    <path d="${HAIR}" fill="none" stroke="${hairLo}" stroke-width="0.8" opacity="0.5"/>
    <path d="M37 40Q42 37.5 47 40M53 40Q58 37.5 63 40" stroke="${hairLo}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <ellipse cx="42" cy="46.5" rx="3.2" ry="2" fill="#fff"/><ellipse cx="58" cy="46.5" rx="3.2" ry="2" fill="#fff"/>
    <circle cx="42.3" cy="46.6" r="1.6" fill="#2a1b12"/><circle cx="58.3" cy="46.6" r="1.6" fill="#2a1b12"/><circle cx="42.8" cy="46" r="0.5" fill="#fff"/><circle cx="58.8" cy="46" r="0.5" fill="#fff"/>
    <path d="M50 47C49 52 48 55 49.5 56.5C50.5 57.3 52 57 52.5 56" stroke="${skinLo}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M44 61.5Q50 65 56 61.5" stroke="#8a3b2c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M44 62.5Q50 59.5 56 62.5" stroke="${skinLo}" stroke-width="0.8" fill="none" opacity="0.6"/>
  </svg>`;
}

export interface CardOpts {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Química del jugador en su puesto (0..3): muestra los puntos. */
  chem?: number;
  /** Valoración efectiva en el puesto (si difiere de la de la carta). */
  effOvr?: number;
  /** Puesto en el que juega (si difiere del natural). */
  pos?: string;
  price?: boolean;
  /** Texto extra bajo la carta (precio, estado…). */
  badge?: string;
  cls?: string;
  /** Atributos data-* extra: ya escapados. */
  attrs?: string;
  captain?: boolean;
}

function shirtOf(d: CardDef): Pick<KitData, 'shirt' | 'shirt2' | 'pattern'> {
  if (!d.clubId) return { shirt: '#1b1b1b', shirt2: '#f6b40e', pattern: 'band' };
  try { return getTeam(d.clubId).home; } catch { return { shirt: '#3b82f6', shirt2: '#ffffff', pattern: 'solid' }; }
}

export function crestOf(d: CardDef, size: number): string {
  if (!d.clubId) return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" fill="#f6b40e"/></svg>`;
  try { return crestSVG(getTeam(d.clubId), size); } catch { return ''; }
}

/** HTML de una carta. */
export function cardHTML(d: CardDef, o: CardOpts = {}): string {
  const size = o.size ?? 'md';
  const labels = statLabels(d);
  const ovr = o.effOvr ?? d.ovr;
  const delta = o.effOvr !== undefined && o.effOvr !== d.ovr ? (o.effOvr > d.ovr ? 'up' : 'down') : '';
  const chem = o.chem !== undefined ? `<div class="fc-chem c${o.chem}" title="Química ${o.chem}/3">${[0, 1, 2].map((i) => `<i class="${i < o.chem! ? 'on' : ''}"></i>`).join('')}</div>` : '';
  const stats = STAT_KEYS.map((k, i) => `<span><b>${d.stats[k]}</b>${labels[i]}</span>`);
  const tag = d.rarity === 'event' ? `<div class="fc-tag">${esc(d.eventSeason ?? 'EVENTO').toUpperCase()}</div>` : d.rarity === 'rising' ? '<div class="fc-tag">PROMESA</div>' : d.rarity === 'special' ? '<div class="fc-tag">ESTRELLA</div>' : d.rarity === 'legend' ? '<div class="fc-tag">LEYENDA</div>' : '';
  return `<div class="fc fc-${d.rarity} fc-${size} ${o.cls ?? ''}" ${o.attrs ?? ''} title="${esc(d.name)} · ${RARITY_NAMES[d.rarity]}">
    <div class="fc-bg"></div><div class="fc-art"></div>
    <div class="fc-top">
      <div class="fc-ovr num ${delta}">${ovr}</div>
      <div class="fc-pos">${o.pos ?? d.role}</div>
      <div class="fc-nat">${natCode(d.nat)}</div>
      <div class="fc-club">${crestOf(d, 28)}</div>
    </div>
    ${chem}
    <div class="fc-photo">${avatarSVG(d.face, shirtOf(d))}</div>
    ${tag}
    <div class="fc-name">${esc(d.short)}</div>
    <div class="fc-stats num"><div>${stats.slice(0, 3).join('')}</div><i></i><div>${stats.slice(3).join('')}</div></div>
    <div class="fc-skill" title="Filigranas y pierna hábil">${d.skill}★ · ${d.foot}</div>
    ${o.captain ? '<div class="fc-cap">C</div>' : ''}
    ${o.price ? `<div class="fc-price num">${d.price.toLocaleString('es-ES')} ⓒ</div>` : ''}
    ${o.badge ? `<div class="fc-badge">${o.badge}</div>` : ''}
  </div>`;
}

/** Versión compacta (para listas y la cancha): valoración, puesto, retrato y nombre. */
export function miniCardHTML(d: CardDef, o: CardOpts = {}): string {
  const ovr = o.effOvr ?? d.ovr;
  const chem = o.chem !== undefined ? `<div class="fm-chem c${o.chem}">${[0, 1, 2].map((i) => `<i class="${i < o.chem! ? 'on' : ''}"></i>`).join('')}</div>` : '';
  return `<div class="fm fc-${d.rarity} ${o.cls ?? ''}" ${o.attrs ?? ''} title="${esc(d.name)}">
    <div class="fm-bg"></div><div class="fm-ovr num">${ovr}</div><div class="fm-pos">${o.pos ?? d.role}</div>
    <div class="fm-photo">${avatarSVG(d.face, shirtOf(d))}</div><div class="fm-name">${esc(d.short)}</div>${chem}${o.captain ? '<div class="fm-cap">C</div>' : ''}
  </div>`;
}

export const fmt = (n: number) => n.toLocaleString('es-ES');
