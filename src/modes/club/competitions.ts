import { TEAMS } from '../../data/teams';
import type { TeamData } from '../../data/types';
import type { Reward } from './progress';
import type { CardDef, Rarity } from './types';
import { weekId, hash32, seeded, type Rand } from './util';

// Reglas de cada modo competitivo. Todos se juegan contra equipos controlados por la IA (no hay multijugador en este modo:
// ver docs/CLUB.md para los puntos de conexión de un futuro Rivals online).

// ---------- Rivals ----------
export const DIVISION_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3300]; // división 10 → 1
/** División (10 = la más baja, 1 = la más alta) según los puntos de la temporada. */
export function rivalsDivision(points: number): number {
  let d = 10;
  DIVISION_THRESHOLDS.forEach((t, i) => { if (points >= t) d = 10 - i; });
  return d;
}
export const RIVALS_POINTS = { W: 30, D: 10, L: -10 };
export const RIVALS_WEEKLY_MIN_MATCHES = 5;
export function rivalsWeeklyReward(division: number): Reward {
  return { coins: 1500 + (10 - division) * 900, packs: division <= 2 ? { premium: 1 } : division <= 5 ? { promo: 1 } : undefined, xp: 200 };
}
/** Valoración objetivo del rival según tu equipo y tu división. */
export function rivalsTarget(userOvr: number, division: number): number {
  return Math.round(userOvr * 0.5 + (62 + (10 - division) * 2.8) * 0.5);
}

// ---------- Champions ----------
export const CHAMPIONS = { entryCost: 3000, minLevel: 4, minOvr: 66, matches: 10 };
export function championsReward(wins: number): Reward {
  if (wins >= 10) return { coins: 60000, packs: { special: 2 }, xp: 1200 };
  if (wins >= 8) return { coins: 25000, packs: { special: 1 }, xp: 800 };
  if (wins >= 6) return { coins: 12000, packs: { premium: 1 }, xp: 500 };
  if (wins >= 4) return { coins: 6000, packs: { promo: 1 }, xp: 300 };
  if (wins >= 2) return { coins: 3000, xp: 150 };
  return { coins: 500, xp: 60 };
}
export function championsTarget(userOvr: number, played: number): number {
  return Math.round(userOvr + 1 + played * 0.9);
}

// ---------- Squad Battles ----------
export interface BattleDef { id: string; name: string; target: number; reward: Reward; factor: number }
export const BATTLES: BattleDef[] = [
  { id: 'b1', name: 'Principiante', target: 60, reward: { coins: 800, xp: 60 }, factor: 0.8 },
  { id: 'b2', name: 'Semiprofesional', target: 68, reward: { coins: 1500, xp: 90 }, factor: 0.9 },
  { id: 'b3', name: 'Profesional', target: 75, reward: { coins: 2500, xp: 120 }, factor: 1 },
  { id: 'b4', name: 'Clase mundial', target: 82, reward: { coins: 4000, xp: 160 }, factor: 1.15 },
  { id: 'b5', name: 'Leyenda', target: 88, reward: { coins: 6500, packs: { promo: 1 }, xp: 220 }, factor: 1.3 },
];

// ---------- Torneos ----------
export interface TournamentRule { id: string; name: string; text: string; ok: (starters: CardDef[]) => boolean }
export const TOURNAMENT_RULES: TournamentRule[] = [
  { id: 'young', name: 'Copa Jóvenes', text: 'Todos los titulares con 23 años o menos', ok: (d) => d.every((x) => x.age <= 23) },
  { id: 'argentina', name: 'Copa Albiceleste', text: 'Al menos 6 titulares argentinos', ok: (d) => d.filter((x) => x.nat === 'Argentina').length >= 6 },
  { id: 'silver', name: 'Copa Plata', text: 'Ningún titular con más de 74 de valoración', ok: (d) => d.every((x) => x.ovr <= 74) },
  { id: 'open', name: 'Copa Abierta', text: 'Sin requisitos: entra con tu mejor once', ok: () => true },
  { id: 'nolegend', name: 'Copa Pura Sangre', text: 'Sin leyendas ni cartas especiales o de evento', ok: (d) => d.every((x) => x.rarity === 'bronze' || x.rarity === 'silver' || x.rarity === 'gold' || x.rarity === 'rising') },
];
export const TOURNAMENT_ENTRY = 2000;
export const TOURNAMENT_ROUNDS = ['Cuartos de final', 'Semifinal', 'Final'];
export function tournamentRuleOf(wk: string): TournamentRule {
  return TOURNAMENT_RULES[hash32(`t|${wk}`) % TOURNAMENT_RULES.length];
}
export function tournamentReward(roundReached: number, won: boolean): Reward {
  if (won) return { coins: 12000, packs: { premium: 1 }, xp: 600 };
  return [{ coins: 500, xp: 60 }, { coins: 2000, xp: 150 }, { coins: 5000, xp: 300 }][clampIdx(roundReached)];
}
const clampIdx = (n: number) => Math.max(0, Math.min(2, n));

// ---------- Rivales de la IA ----------
const byRating = TEAMS.slice().sort((a, b) => a.rating - b.rating);
/** Equipo de la IA con una valoración cercana a la pedida (el azar elige entre los ~10 más próximos). */
export function pickOpponent(target: number, rand: Rand, exclude: string[] = []): TeamData {
  const near = byRating.filter((t) => !exclude.includes(t.id)).sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target)).slice(0, 10);
  return near[Math.floor(rand() * near.length)];
}
export function tournamentOpponents(wk: string, userOvr: number): string[] {
  const r = seeded(hash32(`topp|${wk}`));
  const out: string[] = [];
  [-4, 0, 4].forEach((d) => out.push(pickOpponent(userOvr + d, r, out).id));
  return out;
}

// ---------- Desafíos de creación de plantillas ----------
export interface SbcReq {
  text: string;
  /** Devuelve true si el conjunto de cartas cumple el requisito. */
  ok: (c: CardDef[]) => boolean;
  /** Progreso textual (ej. "3/5"). */
  progress?: (c: CardDef[]) => string;
}
export interface SbcDef {
  id: string;
  name: string;
  blurb: string;
  cards: number;
  reqs: SbcReq[];
  reward: Reward;
  /** Cuántas veces se puede completar (por semana si `weekly`). */
  limit: number;
  weekly: boolean;
}
const avg = (c: CardDef[]) => (c.length ? c.reduce((t, x) => t + x.ovr, 0) / c.length : 0);
const maxSame = (c: CardDef[], f: (d: CardDef) => string) => { const m = new Map<string, number>(); for (const d of c) { const k = f(d); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return Math.max(0, ...m.values()); };
const RANK: Record<Rarity, number> = { bronze: 0, silver: 1, gold: 2, rising: 2, flash: 2, maestro: 2, titan: 3, special: 3, hero: 3, idol: 3, event: 3, legend: 4, motm: 3, totw: 3, totm: 3, tots: 4, toty: 4 };
export const SBCS: SbcDef[] = [
  { id: 'sbc_basic', name: 'Primeros pasos', blurb: 'Reúne once cartas cualquiera con buena media.', cards: 11, limit: 3, weekly: true, reward: { packs: { basic: 1 } },
    reqs: [{ text: 'Media de valoración 62 o más', ok: (c) => avg(c) >= 62, progress: (c) => `${avg(c).toFixed(1)}/62` }] },
  { id: 'sbc_young', name: 'Joven talento', blurb: 'Tres promesas de 21 años o menos.', cards: 3, limit: 1, weekly: true, reward: { packs: { premium: 1 } },
    reqs: [{ text: 'Todos con 21 años o menos', ok: (c) => c.every((d) => d.age <= 21) }, { text: 'Media de 68 o más', ok: (c) => avg(c) >= 68, progress: (c) => `${avg(c).toFixed(1)}/68` }] },
  { id: 'sbc_league', name: 'Un solo campeonato', blurb: 'Nueve jugadores de la misma liga.', cards: 11, limit: 2, weekly: true, reward: { coins: 4000, packs: { promo: 1 } },
    reqs: [{ text: 'Al menos 9 de la misma liga', ok: (c) => maxSame(c, (d) => d.league) >= 9, progress: (c) => `${maxSame(c, (d) => d.league)}/9` }, { text: 'Media de 66 o más', ok: (c) => avg(c) >= 66, progress: (c) => `${avg(c).toFixed(1)}/66` }] },
  { id: 'sbc_nation', name: 'Orgullo nacional', blurb: 'Seis compatriotas con buena media.', cards: 8, limit: 2, weekly: true, reward: { coins: 6000 },
    reqs: [{ text: 'Al menos 6 de la misma nacionalidad', ok: (c) => maxSame(c, (d) => d.nat) >= 6, progress: (c) => `${maxSame(c, (d) => d.nat)}/6` }, { text: 'Media de 70 o más', ok: (c) => avg(c) >= 70, progress: (c) => `${avg(c).toFixed(1)}/70` }] },
  { id: 'sbc_club', name: 'Familia de club', blurb: 'Cinco jugadores del mismo club.', cards: 7, limit: 1, weekly: true, reward: { packs: { promo: 2 } },
    reqs: [{ text: 'Al menos 5 del mismo club', ok: (c) => maxSame(c, (d) => d.clubId) >= 5, progress: (c) => `${maxSame(c, (d) => d.clubId)}/5` }, { text: 'Media de 68 o más', ok: (c) => avg(c) >= 68, progress: (c) => `${avg(c).toFixed(1)}/68` }] },
  { id: 'sbc_gold', name: 'Oro puro', blurb: 'Once cartas de oro (o mejores) de alto nivel.', cards: 11, limit: 1, weekly: false, reward: { packs: { special: 1 } },
    reqs: [{ text: 'Todas de oro o mejores', ok: (c) => c.every((d) => RANK[d.rarity] >= 2) }, { text: 'Media de 78 o más', ok: (c) => avg(c) >= 78, progress: (c) => `${avg(c).toFixed(1)}/78` }] },
];
export const sbcKey = (d: SbcDef, now: number) => (d.weekly ? `${d.id}|${weekId(now)}` : d.id);

export function checkSbc(def: SbcDef, cards: CardDef[]): { ok: boolean; reqs: { text: string; ok: boolean; progress?: string }[] } {
  const reqs = [{ text: `${def.cards} cartas`, ok: cards.length === def.cards, progress: `${cards.length}/${def.cards}` }, ...def.reqs.map((r) => ({ text: r.text, ok: cards.length === def.cards && r.ok(cards), progress: r.progress?.(cards) }))];
  return { ok: reqs.every((r) => r.ok), reqs };
}
