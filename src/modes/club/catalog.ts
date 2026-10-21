import { FORMATIONS } from '../../data/formations';
import { leagueOfTeam } from '../../data/leagues';
import { TEAMS, playerOverall } from '../../data/teams';
import type { PlayerAttributes, PlayerData, Position } from '../../data/types';
import { evoBoost, evoById } from './evoDefs';
import { ROLE_ALT, ROLE_GROUP } from './roles';
import type { CardDef, CardStats, Rarity, Role } from './types';
import { clamp, dayId, hash32, weekId } from './util';

// Catálogo de cartas: un jugador del juego = una carta base (bronce/plata/oro según su valoración), más versiones
// Promesa y Especial de algunos de ellos, cartas de Evento de cada temporada y Leyendas FICTICIAS (personajes inventados).
// La edad, la nacionalidad, la pierna hábil y las filigranas no existen en los datos de los equipos: se generan de forma
// determinista a partir del id del jugador (siempre salen igual).

const NATIONS = [
  'Argentina', 'Brasil', 'Uruguay', 'Colombia', 'Chile', 'Paraguay', 'Ecuador', 'Venezuela', 'Perú', 'Bolivia',
  'España', 'Francia', 'Italia', 'Alemania', 'Inglaterra', 'Portugal', 'Países Bajos', 'Bélgica', 'Turquía', 'Escocia',
];
const COUNTRY_ALIAS: Record<string, string> = { 'Brasil': 'Brasil', 'Reino Unido': 'Inglaterra' };

/** Valor de mercado (monedas) según la valoración: interpolación logarítmica entre estos puntos. */
const PRICE_KNOTS: [number, number][] = [[40, 10], [50, 25], [60, 100], [70, 550], [75, 1200], [80, 2400], [85, 5000], [90, 14000], [95, 40000], [99, 100000]];
export const RARITY_PRICE: Record<Rarity, number> = { bronze: 1, silver: 1, gold: 1, rising: 1.3, special: 1.6, event: 1.5, legend: 2, hero: 1.6, idol: 1.7, flash: 1.3, titan: 1.4, maestro: 1.4,
  motm: 1.3, totw: 1.5, totm: 1.7, tots: 1.9, toty: 2.3,
  potm: 1.5, totgs: 1.7, halloween: 1.6, navidad: 1.6, carnaval: 1.6 };

export function basePrice(ovr: number): number {
  const o = clamp(ovr, 40, 99);
  for (let i = 1; i < PRICE_KNOTS.length; i++) {
    const [o1, p1] = PRICE_KNOTS[i];
    if (o <= o1) {
      const [o0, p0] = PRICE_KNOTS[i - 1];
      return Math.exp(Math.log(p0) + ((o - o0) / (o1 - o0)) * (Math.log(p1) - Math.log(p0)));
    }
  }
  return 100000;
}

/** Redondea a un paso "agradable" (como los precios de mercado). */
export function niceRound(v: number): number {
  const step = v < 200 ? 5 : v < 1000 ? 10 : v < 10000 ? 50 : v < 100000 ? 250 : 1000;
  return Math.max(10, Math.round(v / step) * step);
}

export function cardPrice(ovr: number, rarity: Rarity, age: number): number {
  let v = basePrice(ovr) * RARITY_PRICE[rarity];
  if (age <= 21 && ovr >= 70) v *= 1.15; // las jóvenes promesas se cotizan más
  if (age >= 35) v *= 0.8;
  return niceRound(v);
}

export function statsOf(a: PlayerAttributes, height: number, gk: boolean): CardStats {
  if (gk) {
    const g = a.goalkeeping;
    return { pac: clamp(Math.round(g * 0.96), 1, 99), sho: clamp(Math.round(g * 0.97), 1, 99), pas: clamp(a.passing, 1, 99), dri: clamp(Math.round(g * 1.02), 1, 99), def: clamp(g, 1, 99), phy: clamp(Math.round(a.speed * 0.8 + a.acceleration * 0.2), 1, 99) };
  }
  return {
    pac: clamp(Math.round(a.speed * 0.55 + a.acceleration * 0.45), 1, 99),
    sho: clamp(a.shooting, 1, 99),
    pas: clamp(a.passing, 1, 99),
    dri: clamp(a.control, 1, 99),
    def: clamp(a.defending, 1, 99),
    phy: clamp(Math.round(a.stamina * 0.85 + (height - 1.78) * 40), 1, 99),
  };
}

/** Nombres de las seis estadísticas (distintos para porteros). */
export const STAT_LABELS = { out: ['RIT', 'TIR', 'PAS', 'REG', 'DEF', 'FÍS'], gk: ['EST', 'MAN', 'SAQ', 'REF', 'VEL', 'POS'] };
export const STAT_KEYS: (keyof CardStats)[] = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
export const statLabels = (d: Pick<CardDef, 'group'>) => (d.group === 'GK' ? STAT_LABELS.gk : STAT_LABELS.out);

const boostAttrs = (a: PlayerAttributes, b: number): PlayerAttributes => ({
  speed: clamp(a.speed + b, 1, 99), acceleration: clamp(a.acceleration + b, 1, 99), passing: clamp(a.passing + b, 1, 99), shooting: clamp(a.shooting + b, 1, 99),
  control: clamp(a.control + b, 1, 99), defending: clamp(a.defending + b, 1, 99), stamina: clamp(a.stamina + b, 1, 99), goalkeeping: clamp(a.goalkeeping + b, 1, 99),
});

/** Mejora de atributos de cada tipo de carta especial. */
const plus = (a: PlayerAttributes, b: Partial<PlayerAttributes>): PlayerAttributes => {
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k as keyof PlayerAttributes] = clamp(o[k as keyof PlayerAttributes] + (v ?? 0), 1, 99);
  return o;
};
const KIND_BOOST: Partial<Record<Rarity, (a: PlayerAttributes) => PlayerAttributes>> = {
  rising: (a) => boostAttrs(a, 3), special: (a) => boostAttrs(a, 3), event: (a) => boostAttrs(a, 4),
  hero: (a) => boostAttrs(a, 5), idol: (a) => boostAttrs(a, 4),
  flash: (a) => plus(a, { speed: 9, acceleration: 9, control: 2 }),
  titan: (a) => plus(a, { defending: 6, goalkeeping: 6, stamina: 3, passing: 1 }),
  maestro: (a) => plus(a, { passing: 6, control: 6, shooting: 2 }),
  motm: (a) => boostAttrs(a, 3), totw: (a) => boostAttrs(a, 4), totm: (a) => boostAttrs(a, 5), tots: (a) => boostAttrs(a, 6), toty: (a) => boostAttrs(a, 8),
  potm: (a) => boostAttrs(a, 4), totgs: (a) => boostAttrs(a, 5), halloween: (a) => boostAttrs(a, 5), navidad: (a) => boostAttrs(a, 5), carnaval: (a) => boostAttrs(a, 5),
};
const KIND_CODE: Partial<Record<Rarity, string>> = { rising: 'rs', special: 'sp', hero: 'hr', idol: 'id', flash: 'fl', titan: 'tt', maestro: 'ms', motm: 'mm', totw: 'tw', totm: 'tm', tots: 'ts', toty: 'ty', potm: 'pm', totgs: 'tg', halloween: 'hw', navidad: 'nv', carnaval: 'cv' };

const tierOf = (ovr: number): Rarity => (ovr < 65 ? 'bronze' : ovr < 75 ? 'silver' : 'gold');

const BENCH_ROLES: Role[] = ['POR', 'DFC', 'DFC', 'MC', 'MC', 'DC', 'DC'];

function skillOf(dri: number, h: number): number {
  const v = dri + ((h % 7) - 3);
  return v < 52 ? 1 : v < 63 ? 2 : v < 74 ? 3 : v < 84 ? 4 : 5;
}

function ageOf(h: number): number {
  const x = (h >>> 8) % 100;
  const y = (h >>> 16) % 6;
  return x < 22 ? 17 + (y % 5) : x < 58 ? 22 + y % 5 : x < 86 ? 27 + y % 5 : 32 + y;
}

function make(base: { p: PlayerData; role: Role; teamId: string; teamName: string; league: string; country: string; fictional: boolean }, kind: Rarity | 'base', season?: string): CardDef {
  const { p } = base;
  const h = hash32(p.id);
  const age = ageOf(h);
  const foreign = (h >>> 4) % 100 < 22;
  // los extranjeros suelen ser de la misma región (Sudamérica o Europa)
  const sa = NATIONS.indexOf(base.country) < 10;
  const pool = (h >>> 3) % 100 < 85 ? (sa ? NATIONS.slice(0, 10) : NATIONS.slice(10)) : NATIONS;
  const nat = foreign ? pool[(h >>> 12) % pool.length] : base.country;
  const attrs = kind === 'base' ? p.attrs : KIND_BOOST[kind]!(p.attrs);
  const boost = kind === 'base' ? 0 : Math.max(...Object.keys(attrs).map((k) => attrs[k as keyof PlayerAttributes] - p.attrs[k as keyof PlayerAttributes]));
  const pd: PlayerData = { ...p, attrs };
  const ovr = clamp(playerOverall(pd), 30, 99);
  const rarity: Rarity = kind === 'base' ? tierOf(ovr) : kind;
  const stats = statsOf(attrs, p.height, p.position === 'GK');
  const suffix = kind === 'base' ? '' : kind === 'event' ? `~ev~${season}` : isPeriodKind(kind) ? `~${KIND_CODE[kind]}~${season}` : `~${KIND_CODE[kind]}`;
  const parts = p.name.trim().split(/\s+/);
  const short = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
  return {
    id: p.id + suffix, playerId: p.id, name: p.name, short, ovr, role: base.role, alt: ROLE_ALT[base.role], group: ROLE_GROUP[base.role],
    nat, clubId: base.teamId, clubName: base.teamName, league: base.league, age, stats, foot: (h >>> 20) % 100 < 74 ? 'D' : 'I',
    skill: skillOf(stats.dri, h), rarity, boost, eventSeason: season, attrs, price: cardPrice(ovr, rarity, age), number: p.number,
    face: { skin: p.skinTone, hair: p.hairColor, style: p.hairStyle, height: p.height }, fictional: base.fictional,
  };
}

// ---------- Leyendas ficticias ----------
interface LegendSeed { name: string; nat: string; role: Role; ovr: number; age: number }
export const LEGEND_SEEDS: LegendSeed[] = [
  { name: 'Ricardo Valverde', nat: 'Argentina', role: 'DC', ovr: 93, age: 38 },
  { name: 'Matías Souto', nat: 'España', role: 'MCO', ovr: 91, age: 40 },
  { name: 'Ismael Okonkwo', nat: 'Nigeria', role: 'EI', ovr: 90, age: 39 },
  { name: 'Andrés Pellegrini', nat: 'Argentina', role: 'MC', ovr: 92, age: 41 },
  { name: 'Lucien Marchetti', nat: 'Francia', role: 'DFC', ovr: 90, age: 42 },
  { name: 'Tomás Aranguren', nat: 'Argentina', role: 'POR', ovr: 91, age: 43 },
  { name: 'Bernardo Almeida', nat: 'Brasil', role: 'ED', ovr: 93, age: 40 },
  { name: 'Viktor Hallström', nat: 'Suecia', role: 'DC', ovr: 89, age: 44 },
  { name: 'Santiago Peñarol', nat: 'Uruguay', role: 'MCD', ovr: 90, age: 41 },
  { name: 'Hugo Delacroix', nat: 'Francia', role: 'LI', ovr: 89, age: 42 },
  { name: 'Joaquín Berrondo', nat: 'Argentina', role: 'ED', ovr: 91, age: 39 },
  { name: 'Carlos Montenegro', nat: 'Colombia', role: 'MCO', ovr: 92, age: 40 },
  { name: 'Dario Lombardi', nat: 'Italia', role: 'DFC', ovr: 91, age: 45 },
  { name: 'Álvaro Quintanilla', nat: 'Chile', role: 'LD', ovr: 88, age: 41 },
  { name: 'Marcelo Tavares', nat: 'Brasil', role: 'LI', ovr: 90, age: 42 },
  { name: 'Emeka Adebayo', nat: 'Nigeria', role: 'DC', ovr: 92, age: 43 },
];

/** Perfil de atributos por línea para fabricar una leyenda con la valoración pedida. */
const PROFILE: Record<Position, PlayerAttributes> = {
  GK: { speed: 55, acceleration: 55, passing: 70, shooting: 30, control: 55, defending: 40, stamina: 70, goalkeeping: 100 },
  DEF: { speed: 85, acceleration: 82, passing: 88, shooting: 62, control: 80, defending: 100, stamina: 92, goalkeeping: 10 },
  MID: { speed: 84, acceleration: 86, passing: 100, shooting: 88, control: 98, defending: 82, stamina: 94, goalkeeping: 10 },
  FWD: { speed: 96, acceleration: 98, passing: 84, shooting: 100, control: 98, defending: 42, stamina: 86, goalkeeping: 10 },
};

function legendDef(seed: LegendSeed, i: number): CardDef {
  const group = ROLE_GROUP[seed.role];
  const prof = PROFILE[group];
  let k = seed.ovr / 100;
  let attrs = prof;
  let ovr = 0;
  for (let it = 0; it < 40; it++) {
    const f = (v: number) => clamp(Math.round(v * k), 20, 99);
    attrs = { speed: f(prof.speed), acceleration: f(prof.acceleration), passing: f(prof.passing), shooting: f(prof.shooting), control: f(prof.control), defending: f(prof.defending), stamina: f(prof.stamina), goalkeeping: f(prof.goalkeeping) };
    ovr = playerOverall({ attrs, position: group } as PlayerData);
    if (ovr === seed.ovr) break;
    k += (seed.ovr - ovr) * 0.004;
  }
  const h = hash32(seed.name);
  const stats = statsOf(attrs, 1.8, group === 'GK');
  const parts = seed.name.split(' ');
  return {
    id: `lg_${i + 1}`, playerId: '', name: seed.name, short: parts.slice(1).join(' '), ovr, role: seed.role, alt: ROLE_ALT[seed.role], group, nat: seed.nat,
    clubId: '', clubName: 'Leyendas', league: '', age: seed.age, stats, foot: h % 4 === 0 ? 'I' : 'D', skill: skillOf(stats.dri, h), rarity: 'legend', boost: 0,
    attrs, price: cardPrice(ovr, 'legend', 30), number: 10 + (i % 10), face: { skin: (h % 100) / 100, hair: ['#1b1209', '#5a3a1e', '#c69a5b', '#8a8a8a'][h % 4], style: h % 4, height: 1.8 },
    fictional: true,
  };
}

// ---------- Construcción del catálogo ----------
let cache: Map<string, CardDef> | null = null;
const eventCache = new Map<string, CardDef[]>();

function build(): Map<string, CardDef> {
  const map = new Map<string, CardDef>();
  for (const t of TEAMS) {
    const lg = leagueOfTeam(t.id);
    const country = COUNTRY_ALIAS[lg?.country ?? ''] ?? lg?.country ?? 'Argentina';
    const slots = FORMATIONS[t.formation];
    const idol: { ctx: Parameters<typeof make>[0] | null; ovr: number } = { ctx: null, ovr: 69 };
    t.players.forEach((p, i) => {
      const role: Role = i < 11 ? (slots[i].role as Role) : BENCH_ROLES[(i - 11) % BENCH_ROLES.length];
      const ctx = { p, role, teamId: t.id, teamName: t.name, league: lg?.id ?? '', country, fictional: !p.name };
      const base = make(ctx, 'base');
      map.set(base.id, base);
      const { age, ovr, group, stats } = base;
      const add = (k: Rarity) => { const c = make(ctx, k); map.set(c.id, c); };
      if (age <= 21 && ovr >= 62 && ovr < 82) add('rising');
      if (ovr >= 83) add('special');
      // Héroe: veteranos · Relámpago: los más rápidos · Titán: defensas y porteros · Maestro: medios de buen pie
      if (age >= 31 && ovr >= 74 && ovr <= 86) add('hero');
      if (group !== 'GK' && group !== 'DEF' && stats.pac >= 78 && ovr >= 68 && ovr <= 85) add('flash');
      if ((group === 'DEF' || group === 'GK') && ovr >= 78) add('titan');
      if (group === 'MID' && stats.pas >= 78 && ovr >= 74) add('maestro');
      if (ovr > idol.ovr) { idol.ctx = ctx; idol.ovr = ovr; }
    });
    // Ídolo: el mejor jugador de cada club
    if (idol.ctx) { const c = make(idol.ctx, 'idol'); map.set(c.id, c); }
  }
  LEGEND_SEEDS.forEach((s, i) => { const d = legendDef(s, i); map.set(d.id, d); });
  return map;
}

export function catalog(): Map<string, CardDef> {
  if (!cache) cache = build();
  return cache;
}

/** Cartas de Evento de una temporada (versiones mejoradas de jugadores de oro, elegidas por la semilla de la temporada). */
export function eventDefs(season: string): CardDef[] {
  const hit = eventCache.get(season);
  if (hit) return hit;
  const out: CardDef[] = [];
  for (const d of catalog().values()) {
    if (d.rarity !== 'gold' || d.ovr < 76 || d.ovr > 87) continue;
    if (hash32(`${season}|${d.id}`) % 100 >= 2) continue; // ~2 % de los de oro
    const ctx = ctxOf(d);
    if (ctx) out.push(make(ctx, 'event', season));
  }
  eventCache.set(season, out);
  return out;
}

/** Datos de origen (jugador, club, puesto) de una carta base, para fabricar sus versiones especiales. */
function ctxOf(d: CardDef): Parameters<typeof make>[0] | null {
  const t = TEAMS.find((x) => x.id === d.clubId);
  const p = t?.players.find((x) => x.id === d.playerId);
  if (!t || !p) return null;
  const lg = leagueOfTeam(t.id);
  const country = COUNTRY_ALIAS[lg?.country ?? ''] ?? lg?.country ?? 'Argentina';
  const i = t.players.indexOf(p);
  const role: Role = i < 11 ? (FORMATIONS[t.formation][i].role as Role) : BENCH_ROLES[(i - 11) % BENCH_ROLES.length];
  return { p, role, teamId: t.id, teamName: t.name, league: lg?.id ?? '', country, fictional: !p.name };
}

// ---------- Cartas por periodo: Jugador del partido (día), Equipo de la semana, del mes, de la temporada y del año;
// Jugador del mes, Equipo de la fase de grupos (cada 2 semanas) y promociones de calendario (Noche de brujas, Navidad, Carnaval) ----------
export type PeriodKind = 'motm' | 'totw' | 'totm' | 'tots' | 'toty' | 'potm' | 'totgs' | 'halloween' | 'navidad' | 'carnaval';
export const PERIOD_KINDS: PeriodKind[] = ['motm', 'totw', 'totm', 'tots', 'toty', 'potm', 'totgs', 'halloween', 'navidad', 'carnaval'];
export const isPeriodKind = (r: string): r is PeriodKind => (PERIOD_KINDS as string[]).includes(r);
const CODE_KIND: Record<string, PeriodKind> = { mm: 'motm', tw: 'totw', tm: 'totm', ts: 'tots', ty: 'toty', pm: 'potm', tg: 'totgs', hw: 'halloween', nv: 'navidad', cv: 'carnaval' };
const DAY_MS = 86400000;

/** Promociones de calendario: [mes-día de inicio, mes-día de fin] (UTC). Navidad cruza el cambio de año. */
export const SEASONAL: Partial<Record<PeriodKind, { from: number; to: number; text: string }>> = {
  halloween: { from: 1024, to: 1103, text: 'Del 24 de octubre al 3 de noviembre' },
  navidad: { from: 1215, to: 106, text: 'Del 15 de diciembre al 6 de enero' },
  carnaval: { from: 201, to: 229, text: 'Todo febrero' },
};
const monthDay = (now: number) => { const d = new Date(now); return (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };

/** Periodo vigente de cada tipo: día, semana (lunes), mes, quincena, temporada del club o año ('' = promoción fuera de fecha). */
export function periodOf(k: PeriodKind, now: number, season: string): string {
  const year = new Date(now).getUTCFullYear();
  switch (k) {
    case 'motm': return dayId(now);
    case 'totw': return weekId(now);
    case 'totm': case 'potm': return dayId(now).slice(0, 7);
    case 'totgs': return `g${Math.floor(Date.parse(weekId(now)) / (14 * DAY_MS))}`;
    case 'tots': return season;
    case 'toty': return String(year);
    default: {
      const w = SEASONAL[k]!;
      const md = monthDay(now);
      if (w.from <= w.to) return md >= w.from && md <= w.to ? String(year) : '';
      return md >= w.from ? String(year) : md <= w.to ? String(year - 1) : '';
    }
  }
}

/** Fin del periodo vigente (ms). */
export function periodEnd(k: PeriodKind, now: number, seasonEnd: number): number {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  switch (k) {
    case 'motm': return Date.UTC(y, d.getUTCMonth(), d.getUTCDate() + 1);
    case 'totw': return Date.parse(`${weekId(now)}T00:00:00Z`) + 7 * DAY_MS;
    case 'totm': case 'potm': return Date.UTC(y, d.getUTCMonth() + 1, 1);
    case 'totgs': return (Math.floor(Date.parse(weekId(now)) / (14 * DAY_MS)) + 1) * 14 * DAY_MS;
    case 'tots': return seasonEnd;
    case 'toty': return Date.UTC(y + 1, 0, 1);
    case 'halloween': return Date.UTC(y, 10, 4);
    case 'carnaval': return Date.UTC(y, 2, 1);
    default: return Date.UTC(monthDay(now) <= 106 ? y : y + 1, 0, 7); // navidad
  }
}

const XI: Record<Position, number> = { GK: 1, DEF: 4, MID: 3, FWD: 3 };
/** Un once (1-4-3-3) de la lista, en el orden dado. */
function pickXI(list: CardDef[]): CardDef[] {
  const left = { ...XI };
  return list.filter((d) => left[d.group]-- > 0);
}

const periodCache = new Map<string, CardDef[]>();
/** Cartas de un periodo (deterministas: mismas para todos los clubes). */
export function periodDefs(kind: PeriodKind, period: string): CardDef[] {
  if (!period) return [];
  const key = `${kind}|${period}`;
  const hit = periodCache.get(key);
  if (hit) return hit;
  const base = [...catalog().values()].filter((d) => (d.rarity === 'bronze' || d.rarity === 'silver' || d.rarity === 'gold') && d.playerId);
  const h = (d: CardDef) => hash32(`${key}|${d.id}`);
  // las del año y la temporada premian a los mejores; un pequeño azar por periodo cambia quién entra en los empates
  const byRating = (xs: CardDef[]) => xs.slice().sort((a, b) => b.ovr + (h(b) % 3) - (a.ovr + (h(a) % 3)));
  const byLuck = (xs: CardDef[]) => xs.slice().sort((a, b) => h(a) - h(b));
  let picked: CardDef[];
  switch (kind) {
    case 'motm': picked = byLuck(base.filter((d) => d.ovr >= 70 && d.ovr <= 86)).slice(0, 6); break;
    case 'totw': picked = pickXI(byLuck(base.filter((d) => d.ovr >= 76 && d.ovr <= 88))); break;
    case 'totm': picked = pickXI(byLuck(base.filter((d) => d.ovr >= 80 && d.ovr <= 90))); break;
    case 'toty': picked = pickXI(byRating(base)); break;
    case 'totgs': picked = pickXI(byLuck(base.filter((d) => d.ovr >= 78 && d.ovr <= 90))); break;
    case 'potm': {
      // el mejor de cada liga del mes (un pequeño azar por mes decide los empates)
      const leagues = [...new Set(base.map((d) => d.league).filter(Boolean))];
      picked = leagues.map((lg) => byRating(base.filter((d) => d.league === lg && d.ovr <= 90))[0]).filter(Boolean);
      break;
    }
    case 'halloween': case 'navidad': case 'carnaval': picked = byLuck(base.filter((d) => d.ovr >= 74 && d.ovr <= 88)).slice(0, 22); break;
    default: {
      // un once por liga
      const leagues = [...new Set(base.map((d) => d.league).filter(Boolean))];
      picked = leagues.flatMap((lg) => pickXI(byRating(base.filter((d) => d.league === lg))));
    }
  }
  const out = picked.map((d) => ctxOf(d)).filter(Boolean).map((c) => make(c!, kind, period));
  periodCache.set(key, out);
  return out;
}

/** Busca una definición por id (incluye las de evento, que se calculan por temporada). */
export function getCardDef(id: string): CardDef | undefined {
  const hit = catalog().get(id);
  if (hit) return hit;
  const e = /^(.+)~evo~([a-z]+)~(\d+)$/.exec(id);
  if (e) return evolvedDef(e[1], e[2], Number(e[3]));
  const m = /^(.+)~ev~(.+)$/.exec(id);
  if (m) return eventDefs(m[2]).find((d) => d.id === id);
  const pk = /^(.+)~(mm|tw|tm|ts|ty|pm|tg|hw|nv|cv)~(.+)$/.exec(id);
  if (pk) return periodDefs(CODE_KIND[pk[2]], pk[3]).find((d) => d.id === id);
  return undefined;
}

export const evolvedId = (baseId: string, evoId: string, level: number) => `${baseId}~evo~${evoId}~${level}`;

const evoCache = new Map<string, CardDef>();
/** Carta tras `level` niveles de una evolución: atributos sumados, valoración y estadísticas recalculadas. */
export function evolvedDef(baseId: string, evoId: string, level: number): CardDef | undefined {
  const id = evolvedId(baseId, evoId, level);
  const hit = evoCache.get(id);
  if (hit) return hit;
  const base = getCardDef(baseId);
  const evo = evoById(evoId);
  if (!base || base.evo || !evo || level < 1 || level > evo.levels.length) return undefined;
  const b = evoBoost(evo, level);
  const a = base.attrs;
  const attrs: PlayerAttributes = {
    speed: clamp(a.speed + b.speed, 1, 99), acceleration: clamp(a.acceleration + b.acceleration, 1, 99), passing: clamp(a.passing + b.passing, 1, 99), shooting: clamp(a.shooting + b.shooting, 1, 99),
    control: clamp(a.control + b.control, 1, 99), defending: clamp(a.defending + b.defending, 1, 99), stamina: clamp(a.stamina + b.stamina, 1, 99), goalkeeping: clamp(a.goalkeeping + b.goalkeeping, 1, 99),
  };
  const ovr = clamp(playerOverall({ attrs, position: base.group } as PlayerData), 30, 99);
  const baseTier = base.rarity === 'bronze' || base.rarity === 'silver' || base.rarity === 'gold';
  const skill = Math.min(5, base.skill + evo.levels.slice(0, level).reduce((t, l) => t + (l.skill ?? 0), 0));
  const d: CardDef = {
    ...base, id, ovr, attrs, stats: statsOf(attrs, base.face.height, base.group === 'GK'), skill,
    rarity: baseTier ? tierOf(ovr) : base.rarity, evo: { id: evoId, level, name: evo.name },
  };
  evoCache.set(id, d);
  return d;
}

/** Id de la carta original (sin evolución). */
export const baseIdOf = (id: string) => id.replace(/~evo~[a-z]+~\d+$/, '');

export function defsByRarity(r: Rarity): CardDef[] {
  const out: CardDef[] = [];
  for (const d of catalog().values()) if (d.rarity === r) out.push(d);
  return out;
}

export const SKILL_STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
