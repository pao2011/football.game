import { FORMATIONS } from '../data/formations';
import { buildTeam, playerOverall, TEAMS, type TeamSeed } from '../data/teams';
import type { FormationId, PlayerData, TeamData } from '../data/types';
import { loadJSON, removeKey, saveJSON } from '../save/Storage';
import { Rng, clamp } from '../util/math';
import { computeStandings, quickSim, roundRobin, type Fixture, type StandingRow } from './Competition';
import { applyAfterMatch, emptyAvailability, fixLineup, type AvailabilityState, type Discipline } from './Availability';

/**
 * Modo carrera: liga de 8 equipos a doble vuelta (14 jornadas). El usuario gestiona alineación
 * y formación, juega sus partidos y el resto se simula. Al final de cada temporada los jugadores
 * evolucionan (edad, minutos jugados) y comienza una nueva temporada.
 */
export interface CareerState {
  version: 1;
  userTeam: string;
  season: number;
  teams: TeamData[]; // copia propia: los atributos evolucionan
  ages: Record<string, number>;
  appearances: Record<string, number>;
  goals: Record<string, number>;
  fixtures: Fixture[];
  formation: FormationId;
  lineup: string[]; // 11 ids en orden de la formación
  history: { season: number; champion: string; userPosition: number }[];
  seed: number;
  seasonOver: boolean;
  /** Lesionados, sancionados y amarillas acumuladas del equipo del usuario. */
  availability?: AvailabilityState;
  /** Liga con dos divisiones (ids de cada una); el usuario juega la suya y la otra se simula. */
  divisions?: { first: string[]; second: string[] };
  /** Clasificación final de la otra división en la última temporada simulada. */
  otherTable?: StandingRow[];
  /** Presupuesto para fichajes (millones). */
  budget?: number;
  /** Últimas noticias (fichajes, ascensos…). */
  news?: string[];
}

/** Equipos de Segunda División (ficticios, algo más flojos). */
const SECOND_DIVISION: (Omit<TeamSeed, 'home' | 'away' | 'gkKit' | 'crest'> & { colors: [string, string] })[] = [
  { id: 'seg-sierra', name: 'Unión Sierra', short: 'UNS', city: 'Sierra Alta', formation: '4-4-2', rating: 72, seed: 101, colors: ['#2e7d32', '#ffffff'] },
  { id: 'seg-valle', name: 'Sporting Valle', short: 'SPV', city: 'Valle Verde', formation: '4-3-3', rating: 71, seed: 102, colors: ['#0d47a1', '#ffeb3b'] },
  { id: 'seg-delta', name: 'Racing Delta', short: 'RDE', city: 'Delta', formation: '4-2-3-1', rating: 70, seed: 103, colors: ['#ffffff', '#00bcd4'] },
  { id: 'seg-llano', name: 'Deportivo Llano', short: 'DLL', city: 'Los Llanos', formation: '4-4-2', rating: 69, seed: 104, colors: ['#b71c1c', '#212121'] },
  { id: 'seg-molinos', name: 'CD Molinos', short: 'MOL', city: 'Molinos', formation: '3-5-2', rating: 68, seed: 105, colors: ['#6a1b9a', '#ffffff'] },
  { id: 'seg-costa', name: 'Juventud Costa', short: 'JCO', city: 'Costa Brava', formation: '4-3-3', rating: 67, seed: 106, colors: ['#ff9800', '#1a237e'] },
  { id: 'seg-norte', name: 'Estrella del Norte', short: 'ENO', city: 'Puerto Norte', formation: '4-4-2', rating: 66, seed: 107, colors: ['#c62828', '#ffffff'] },
  { id: 'seg-cantera', name: 'Atlético Cantera', short: 'ACA', city: 'La Cantera', formation: '4-2-3-1', rating: 65, seed: 108, colors: ['#37474f', '#cddc39'] },
];

function secondDivisionTeams(): TeamData[] {
  const symbols: TeamData['crest']['symbol'][] = ['star', 'ball', 'lion', 'wave', 'bolt', 'crown', 'tower', 'eagle'];
  return SECOND_DIVISION.map((d, i) => {
    const [a, b] = d.colors;
    return buildTeam({
      id: d.id, name: d.name, short: d.short, city: d.city, formation: d.formation, rating: d.rating, seed: d.seed,
      crest: { shape: (['shield', 'circle', 'diamond'] as const)[i % 3], primary: a, secondary: b, symbol: symbols[i % symbols.length] },
      home: { shirt: a, shirt2: b, pattern: (['solid', 'stripes', 'hoops', 'sash', 'gradient'] as const)[i % 5], shorts: b, socks: a, number: b },
      away: { shirt: b, shirt2: a, pattern: 'solid', shorts: a, socks: b, number: a },
      gkKit: { shirt: '#ffd400', shirt2: '#c8a40f', pattern: 'solid', shorts: '#222222', socks: '#ffd400', number: '#222222' },
    });
  });
}

/** Precio de mercado (millones) según media y edad. */
export function playerPrice(p: PlayerData, age: number): number {
  const ovr = playerOverall(p);
  const base = Math.max(0.3, Math.pow(Math.max(0, ovr - 55) / 5, 2) * 0.55);
  const ageF = age <= 21 ? 1.4 : age <= 25 ? 1.2 : age <= 29 ? 1 : age <= 32 ? 0.65 : 0.35;
  return Math.round(base * ageF * 10) / 10;
}

export const SQUAD_MIN = 16;
export const SQUAD_MAX = 25;

const KEY = 'career';

export class Career {
  constructor(public state: CareerState) {}

  static create(userTeam: string, seed = Date.now() % 100000): Career {
    const rng = new Rng(seed);
    const first: TeamData[] = structuredClone(TEAMS);
    const second = secondDivisionTeams();
    const teams = [...first, ...second];
    const ages: Record<string, number> = {};
    for (const t of teams) for (const p of t.players) ages[p.id] = rng.int(18, 34);
    const ut = teams.find((t) => t.id === userTeam)!;
    const c = new Career({
      version: 1, userTeam, season: 1, teams, ages, appearances: {}, goals: {},
      fixtures: [], formation: ut.formation, lineup: ut.players.slice(0, 11).map((p) => p.id),
      history: [], seed, seasonOver: false,
      divisions: { first: first.map((t) => t.id), second: second.map((t) => t.id) },
      budget: Math.round(15 + (ut.rating - 70) * 1.5),
      news: [],
    });
    c.newSeasonFixtures();
    c.save();
    return c;
  }

  static load(): Career | null {
    const s = loadJSON<CareerState | null>(KEY, null);
    if (!s || s.version !== 1) return null;
    const c = new Career(s);
    c.migrate();
    return c;
  }

  static clear() {
    removeKey(KEY);
  }

  save() {
    saveJSON(KEY, this.state);
  }

  team(id: string): TeamData {
    return this.state.teams.find((t) => t.id === id)!;
  }

  get user(): TeamData {
    return this.team(this.state.userTeam);
  }

  /** Carreras guardadas antes de las divisiones: se añade la Segunda División y el presupuesto. */
  migrate() {
    const st = this.state;
    if (!st.divisions) {
      const second = secondDivisionTeams().filter((t) => !st.teams.some((x) => x.id === t.id));
      const rng = new Rng(st.seed + 7);
      for (const t of second) for (const p of t.players) st.ages[p.id] = rng.int(18, 34);
      st.divisions = { first: st.teams.map((t) => t.id), second: second.map((t) => t.id) };
      st.teams.push(...second);
    }
    st.budget ??= Math.round(15 + (this.user.rating - 70) * 1.5);
    st.news ??= [];
  }

  /** División del usuario (1 = Primera, 2 = Segunda). */
  get division(): 1 | 2 {
    return this.state.divisions?.second.includes(this.state.userTeam) ? 2 : 1;
  }

  /** Equipos de una división. */
  divisionTeams(d: 1 | 2): string[] {
    const dv = this.state.divisions;
    if (!dv) return this.state.teams.map((t) => t.id);
    return d === 1 ? dv.first : dv.second;
  }

  private newSeasonFixtures() {
    const rng = new Rng(this.state.seed + this.state.season * 101);
    const ids = this.divisionTeams(this.division).slice().sort(() => rng.next() - 0.5);
    this.state.fixtures = roundRobin(ids, true, (r) => `Jornada ${r}`, `S${this.state.season}`);
  }

  standings(): StandingRow[] {
    return computeStandings(this.divisionTeams(this.division), this.state.fixtures);
  }

  nextUserFixture(): Fixture | null {
    return this.state.fixtures.find((f) => !f.played && (f.home === this.state.userTeam || f.away === this.state.userTeam)) ?? null;
  }

  get currentRound(): number {
    const f = this.state.fixtures.find((x) => !x.played);
    return f ? f.round : this.totalRounds;
  }

  get totalRounds(): number {
    return Math.max(...this.state.fixtures.map((f) => f.round));
  }

  /** Media del equipo (para la simulación rápida) según sus mejores 11. */
  teamRating(t: TeamData): number {
    const ovr = t.players.map(playerOverall).sort((a, b) => b - a).slice(0, 11);
    return ovr.reduce((s, v) => s + v, 0) / ovr.length;
  }

  setLineup(formation: FormationId, lineup: string[]) {
    if (lineup.length !== 11) throw new Error('La alineación debe tener 11 jugadores');
    this.state.formation = formation;
    this.state.lineup = lineup;
    this.save();
  }

  /** Puestos de la formación actual (para la pantalla de alineación). */
  slots() {
    return FORMATIONS[this.state.formation];
  }

  /** Alineación para el próximo partido: los lesionados y sancionados se cambian por suplentes. */
  matchLineup(): string[] {
    return fixLineup(this.user, this.state.formation, this.state.lineup, this.state.availability);
  }

  recordUserResult(fx: Fixture, homeGoals: number, awayGoals: number, scorers: string[], discipline?: Discipline): string[] {
    const msgs = discipline ? applyAfterMatch((this.state.availability ??= emptyAvailability()), this.user, discipline) : [];
    const f = this.state.fixtures.find((x) => x.id === fx.id)!;
    f.played = true;
    f.homeGoals = homeGoals;
    f.awayGoals = awayGoals;
    for (const id of this.state.lineup) this.state.appearances[id] = (this.state.appearances[id] ?? 0) + 1;
    for (const id of scorers) this.state.goals[id] = (this.state.goals[id] ?? 0) + 1;
    // simular el resto de la jornada
    const rng = new Rng(this.state.seed + this.state.season * 7 + f.round * 13);
    for (const o of this.state.fixtures) {
      if (o.played || o.round !== f.round) continue;
      const h = this.team(o.home);
      const a = this.team(o.away);
      const r = quickSim(h, a, rng, false, this.teamRating(h), this.teamRating(a));
      o.played = true;
      o.homeGoals = r.h;
      o.awayGoals = r.a;
    }
    if (this.state.fixtures.every((x) => x.played)) this.state.seasonOver = true;
    this.save();
    return msgs;
  }

  /** Cierra la temporada: historial, evolución de jugadores y nuevo calendario. */
  startNextSeason(): { champion: string; position: number; changes: { name: string; delta: number }[]; promoted: string[]; relegated: string[]; userMove: 'up' | 'down' | null; income: number } {
    const table = this.standings();
    const champion = table[0].team;
    const position = table.findIndex((r) => r.team === this.state.userTeam) + 1;
    const userDiv = this.division;
    this.state.history.push({ season: this.state.season, champion, userPosition: position });
    // la otra división se juega entera en simulación
    const otherDiv: 1 | 2 = userDiv === 1 ? 2 : 1;
    const otherIds = this.divisionTeams(otherDiv);
    const simRng = new Rng(this.state.seed + this.state.season * 31);
    const otherFx = roundRobin(otherIds, true, (r) => `Jornada ${r}`, `O${this.state.season}`);
    for (const f of otherFx) {
      const r = quickSim(this.team(f.home), this.team(f.away), simRng, false, this.teamRating(this.team(f.home)), this.teamRating(this.team(f.away)));
      f.played = true;
      f.homeGoals = r.h;
      f.awayGoals = r.a;
    }
    const otherTable = computeStandings(otherIds, otherFx);
    this.state.otherTable = otherTable;
    // ascensos y descensos: los 2 últimos de Primera por los 2 primeros de Segunda
    const t1 = userDiv === 1 ? table : otherTable;
    const t2 = userDiv === 2 ? table : otherTable;
    const relegated = t1.slice(-2).map((r) => r.team);
    const promoted = t2.slice(0, 2).map((r) => r.team);
    const dv = this.state.divisions;
    let userMove: 'up' | 'down' | null = null;
    if (dv) {
      dv.first = dv.first.filter((id) => !relegated.includes(id)).concat(promoted);
      dv.second = dv.second.filter((id) => !promoted.includes(id)).concat(relegated);
      if (relegated.includes(this.state.userTeam)) userMove = 'down';
      if (promoted.includes(this.state.userTeam)) userMove = 'up';
    }
    // dinero: premio por posición, más en Primera; bonus por ascenso
    const income = Math.round((userDiv === 1 ? 26 - position * 2 : 12 - position) + (userMove === 'up' ? 8 : 0));
    this.state.budget = Math.round(((this.state.budget ?? 0) + Math.max(2, income)) * 10) / 10;
    const news = this.state.news ?? (this.state.news = []);
    news.unshift(`Temporada ${this.state.season}: suben ${promoted.map((id) => this.team(id).name).join(' y ')}; bajan ${relegated.map((id) => this.team(id).name).join(' y ')}`);
    news.splice(12);
    const rng = new Rng(this.state.seed + this.state.season * 977);
    const changes: { name: string; delta: number }[] = [];
    for (const t of this.state.teams) {
      for (const p of t.players) {
        const age = this.state.ages[p.id] ?? 25;
        const apps = this.state.appearances[p.id] ?? (t.id === this.state.userTeam ? 0 : 8);
        let delta = 0;
        if (age <= 23) delta = rng.int(1, 4) + (apps > 7 ? 1 : 0);
        else if (age <= 29) delta = rng.int(-1, 2) + (apps > 9 ? 1 : 0);
        else if (age <= 32) delta = rng.int(-3, 0);
        else delta = rng.int(-4, -1);
        applyDelta(p, delta);
        this.state.ages[p.id] = age + 1;
        if (t.id === this.state.userTeam && delta !== 0) changes.push({ name: p.name, delta });
        // retiro y relevo por un juvenil
        if (age + 1 > 35) {
          this.state.ages[p.id] = rng.int(17, 19);
          p.name = `${p.name.split(' ')[0]} Jr.`;
          applyDelta(p, -6);
        }
      }
      t.rating = Math.round(this.teamRating(t));
    }
    this.state.season++;
    this.state.appearances = {};
    this.state.goals = {};
    this.state.seasonOver = false;
    // nueva temporada: se borran las sanciones y las amarillas (las lesiones siguen)
    const av = this.state.availability;
    if (av) {
      av.yellows = {};
      for (const [id, o] of Object.entries(av.out)) if (o.reason === 'suspension') delete av.out[id];
    }
    this.newSeasonFixtures();
    this.save();
    return { champion, position, changes, promoted, relegated, userMove, income: Math.max(2, income) };
  }
}

// ---------------------------------------------------------------- mercado de fichajes
export interface MarketOffer {
  player: PlayerData;
  team: TeamData;
  price: number;
  age: number;
}

export function marketOffers(c: Career): MarketOffer[] {
  const out: MarketOffer[] = [];
  for (const t of c.state.teams) {
    if (t.id === c.state.userTeam) continue;
    for (const p of t.players) {
      const age = c.state.ages[p.id] ?? 25;
      out.push({ player: p, team: t, age, price: playerPrice(p, age) });
    }
  }
  return out.sort((a, b) => playerOverall(b.player) - playerOverall(a.player));
}

/** Ficha a un jugador de otro club. Devuelve un mensaje de error o null si se hizo. */
export function buyPlayer(c: Career, playerId: string): string | null {
  const st = c.state;
  const user = c.user;
  const seller = st.teams.find((t) => t.id !== st.userTeam && t.players.some((p) => p.id === playerId));
  if (!seller) return 'Ese jugador no está disponible';
  const p = seller.players.find((x) => x.id === playerId)!;
  const price = playerPrice(p, st.ages[p.id] ?? 25);
  if ((st.budget ?? 0) < price) return `No te alcanza el presupuesto (${price} M)`;
  if (user.players.length >= SQUAD_MAX) return `Tu plantilla ya tiene ${SQUAD_MAX} jugadores`;
  if (seller.players.length <= SQUAD_MIN) return `${seller.name} no quiere vender: se quedaría sin jugadores`;
  seller.players = seller.players.filter((x) => x !== p);
  // dorsal libre
  const used = new Set(user.players.map((x) => x.number));
  if (used.has(p.number)) { let n = 2; while (used.has(n)) n++; p.number = n; }
  user.players.push(p);
  st.budget = Math.round(((st.budget ?? 0) - price) * 10) / 10;
  (st.news ??= []).unshift(`Fichaje: ${p.name} llega desde ${seller.name} por ${price} M`);
  st.news.splice(12);
  c.save();
  return null;
}

/** Vende un jugador propio a otro club. */
export function sellPlayer(c: Career, playerId: string, rng = Math.random): string | null {
  const st = c.state;
  const user = c.user;
  const p = user.players.find((x) => x.id === playerId);
  if (!p) return 'Ese jugador no está en tu plantilla';
  if (user.players.length <= SQUAD_MIN) return `Necesitas al menos ${SQUAD_MIN} jugadores`;
  if (p.position === 'GK' && user.players.filter((x) => x.position === 'GK').length <= 1) return 'No puedes vender a tu único arquero';
  const buyers = st.teams.filter((t) => t.id !== st.userTeam && t.players.length < SQUAD_MAX);
  if (!buyers.length) return 'Ningún club puede ficharlo ahora';
  const buyer = buyers[Math.floor(rng() * buyers.length)];
  const price = Math.round(playerPrice(p, st.ages[p.id] ?? 25) * 0.9 * 10) / 10;
  user.players = user.players.filter((x) => x !== p);
  buyer.players.push(p);
  st.budget = Math.round(((st.budget ?? 0) + price) * 10) / 10;
  // si era titular, entra el mejor suplente disponible de su puesto
  const i = st.lineup.indexOf(p.id);
  if (i >= 0) {
    const repl = user.players.filter((x) => !st.lineup.includes(x.id)).sort((a, b) => (b.position === p.position ? 1 : 0) - (a.position === p.position ? 1 : 0) || playerOverall(b) - playerOverall(a))[0];
    if (repl) st.lineup[i] = repl.id;
  }
  (st.news ??= []).unshift(`Venta: ${p.name} se va a ${buyer.name} por ${price} M`);
  st.news.splice(12);
  c.save();
  return null;
}

function applyDelta(p: PlayerData, delta: number) {
  const a = p.attrs;
  const keys = (Object.keys(a) as (keyof typeof a)[]).filter((k) => p.position === 'GK' ? true : k !== 'goalkeeping');
  for (const k of keys) a[k] = clamp(Math.round(a[k] + delta + (Math.random() < 0.3 ? Math.sign(delta) : 0)), 25, 99);
}
