import { getTeam } from '../../data/teams';
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

/** Retrato ilustrado (busto) a partir de los rasgos del jugador. */
export function avatarSVG(face: CardDef['face'], shirt = '#3b82f6'): string {
  const s = face.skin;
  const skin = `hsl(${22 + s * 6}, ${38 + s * 18}%, ${86 - s * 52}%)`;
  const shade = `hsl(${22 + s * 6}, ${38 + s * 18}%, ${70 - s * 46}%)`;
  const hair = face.hair;
  const style = face.style % 4;
  const hairPath = [
    'M30 36C30 18 70 18 70 36C66 28 34 28 30 36Z', // corto
    'M28 40C26 14 74 14 72 40C70 26 30 26 28 40Z', // volumen
    'M30 34C34 16 66 16 70 34L72 52C66 40 34 40 28 52Z', // largo
    'M32 30C38 22 62 22 68 30C60 26 40 26 32 30Z', // casi rapado
  ][style];
  return `<svg viewBox="0 0 100 100" class="fc-face" aria-hidden="true">
    <path d="M10 100C10 78 28 70 50 70C72 70 90 78 90 100Z" fill="${shirt}"/>
    <path d="M40 66H60L58 78C54 82 46 82 42 78Z" fill="${shade}"/>
    <ellipse cx="50" cy="44" rx="19" ry="23" fill="${skin}"/>
    <path d="${hairPath}" fill="${hair}"/>
    <circle cx="43" cy="46" r="1.8" fill="#1b1209"/><circle cx="57" cy="46" r="1.8" fill="#1b1209"/>
    <path d="M44 57Q50 61 56 57" stroke="#7a3b2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
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

function shirtOf(d: CardDef): string {
  if (!d.clubId) return '#222';
  try { return getTeam(d.clubId).home.shirt; } catch { return '#3b82f6'; }
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
  const stats = STAT_KEYS.map((k, i) => `<span><b>${d.stats[k]}</b>${labels[i]}</span>`).join('');
  const tag = d.rarity === 'event' ? `<div class="fc-tag">${esc(d.eventSeason ?? 'EVENTO').toUpperCase()}</div>` : d.rarity === 'rising' ? '<div class="fc-tag">PROMESA</div>' : d.rarity === 'special' ? '<div class="fc-tag">ESTRELLA</div>' : d.rarity === 'legend' ? '<div class="fc-tag">LEYENDA</div>' : '';
  return `<div class="fc fc-${d.rarity} fc-${size} ${o.cls ?? ''}" ${o.attrs ?? ''} title="${esc(d.name)} · ${RARITY_NAMES[d.rarity]}">
    <div class="fc-bg"></div>
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
    <div class="fc-stats num">${stats}</div>
    <div class="fc-foot"><span>${'★'.repeat(d.skill)}</span><span>${d.foot === 'D' ? 'Der.' : 'Izq.'}</span><span>${d.age} a.</span></div>
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
