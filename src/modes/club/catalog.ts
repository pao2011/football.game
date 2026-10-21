import { FORMATIONS } from '../../data/formations';
import { leagueOfTeam } from '../../data/leagues';
import { TEAMS, playerOverall } from '../../data/teams';
import type { PlayerAttributes, PlayerData, Position } from '../../data/types';
import { ROLE_ALT, ROLE_GROUP } from './roles';
import type { CardDef, CardStats, Rarity, Role } from './types';
import { clamp, hash32 } from './util';

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
export const RARITY_PRICE: Record<Rarity, number> = { bronze: 1, silver: 1, gold: 1, rising: 1.3, special: 1.6, event: 1.5, legend: 2 };

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
  const boost = kind === 'rising' ? 3 : kind === 'special' ? 3 : kind === 'event' ? 4 : 0;
  const attrs = boost ? boostAttrs(p.attrs, boost) : p.attrs;
  const pd: PlayerData = { ...p, attrs };
  const ovr = clamp(playerOverall(pd), 30, 99);
  const rarity: Rarity = kind === 'base' ? (ovr < 65 ? 'bronze' : ovr < 75 ? 'silver' : 'gold') : kind;
  const stats = statsOf(attrs, p.height, p.position === 'GK');
  const suffix = kind === 'base' ? '' : kind === 'rising' ? '~rs' : kind === 'special' ? '~sp' : `~ev~${season}`;
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
    t.players.forEach((p, i) => {
      const role: Role = i < 11 ? (slots[i].role as Role) : BENCH_ROLES[(i - 11) % BENCH_ROLES.length];
      const ctx = { p, role, teamId: t.id, teamName: t.name, league: lg?.id ?? '', country, fictional: !p.name };
      const base = make(ctx, 'base');
      map.set(base.id, base);
      const age = base.age;
      if (age <= 21 && base.ovr >= 62 && base.ovr < 82) { const c = make(ctx, 'rising'); map.set(c.id, c); }
      if (base.ovr >= 83) { const c = make(ctx, 'special'); map.set(c.id, c); }
    });
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
    const t = TEAMS.find((x) => x.id === d.clubId);
    const p = t?.players.find((x) => x.id === d.playerId);
    if (!t || !p) continue;
    const lg = leagueOfTeam(t.id);
    const country = COUNTRY_ALIAS[lg?.country ?? ''] ?? lg?.country ?? 'Argentina';
    const i = t.players.indexOf(p);
    const role: Role = i < 11 ? (FORMATIONS[t.formation][i].role as Role) : BENCH_ROLES[(i - 11) % BENCH_ROLES.length];
    out.push(make({ p, role, teamId: t.id, teamName: t.name, league: lg?.id ?? '', country, fictional: !p.name }, 'event', season));
  }
  eventCache.set(season, out);
  return out;
}

/** Busca una definición por id (incluye las de evento, que se calculan por temporada). */
export function getCardDef(id: string): CardDef | undefined {
  const hit = catalog().get(id);
  if (hit) return hit;
  const m = /^(.+)~ev~(.+)$/.exec(id);
  if (m) return eventDefs(m[2]).find((d) => d.id === id);
  return undefined;
}

export function defsByRarity(r: Rarity): CardDef[] {
  const out: CardDef[] = [];
  for (const d of catalog().values()) if (d.rarity === r) out.push(d);
  return out;
}

export const SKILL_STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
