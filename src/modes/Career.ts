import { FORMATIONS } from '../data/formations';
import { LEAGUE_IDS, ZONE_A, ZONE_B, ZONE_PAIRS, classicName } from '../data/classics';
import { STADIUMS } from '../data/stadiums';
import { playerOverall, TEAMS } from '../data/teams';
import type { FormationId, PlayerData, TeamData } from '../data/types';
import { loadJSON, removeKey, saveJSON } from '../save/Storage';
import { Rng, clamp } from '../util/math';
import { computeStandings, quickSim, roundRobin, winnerOf, type Fixture, type StandingRow } from './Competition';
import { applyAfterMatch, emptyAvailability, fixLineup, type AvailabilityState, type Discipline } from './Availability';

/**
 * Modo carrera: Liga Profesional de 30 equipos en dos zonas de 15. Cada temporada tiene dos torneos,
 * Apertura y Clausura: todos contra todos dentro de la zona (14 fechas) más un interzonal en la fecha libre
 * (los clásicos son el interzonal), y los 8 primeros de cada zona juegan los playoffs (octavos, cuartos,
 * semifinales y final a partido único; la final en cancha neutral). Además hay una tabla anual con los
 * dos torneos. El usuario gestiona alineación y formación, juega sus partidos y el resto se simula.
 */
export type TorneoId = 'apertura' | 'clausura';
export type LeaguePhase = 'regular' | 'playoffs' | 'done';

export interface SeasonRecord {
  season: number;
  apertura: string;
  clausura: string;
  annual: string;
  /** Posición del usuario en la tabla anual. */
  userPosition: number;
}

export interface CareerState {
  version: 2;
  userTeam: string;
  season: number;
  teams: TeamData[]; // copia propia: los atributos evolucionan
  ages: Record<string, number>;
  appearances: Record<string, number>;
  goals: Record<string, number>;
  /** Zonas de la liga (ids). */
  zones: { A: string[]; B: string[] };
  torneo: TorneoId;
  phase: LeaguePhase;
  /** Partidos del torneo en juego (fase regular y playoffs). */
  fixtures: Fixture[];
  /** Fase regular del Apertura ya terminado (cuenta para la tabla anual durante el Clausura). */
  aperturaFixtures: Fixture[];
  /** Campeón del Apertura de esta temporada. */
  aperturaChampion?: string;
  formation: FormationId;
  lineup: string[]; // 11 ids en orden de la formación
  history: SeasonRecord[];
  seed: number;
  /** Termino el Clausura: falta cerrar la temporada. */
  seasonOver: boolean;
  /** Lesionados, sancionados y amarillas acumuladas del equipo del usuario. */
  availability?: AvailabilityState;
  /** Presupuesto para fichajes (millones). */
  budget?: number;
  /** Últimas noticias. */
  news?: string[];
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

export const TORNEO_NAMES: Record<TorneoId, string> = { apertura: 'Torneo Apertura', clausura: 'Torneo Clausura' };
/** Rondas de playoffs, de la primera a la final. */
export const PLAYOFF_ROUNDS = ['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final'];
const REGULAR_ROUNDS = 15;
/** Estadios donde se juegan las finales (se elige el primero que no sea de un finalista). */
const NEUTRAL_VENUES = ['kempes', 'madre-ciudades', 'gigante-arroyito', 'coloso', 'cilindro'];

const KEY = 'career';

export class Career {
  constructor(public state: CareerState) {}

  static create(userTeam: string, seed = Date.now() % 100000): Career {
    const rng = new Rng(seed);
    const zones = { A: ZONE_A.slice(), B: ZONE_B.slice() };
    const all = structuredClone(TEAMS);
    // un equipo propio (del editor): ocupa el lugar del peor equipo sin clásico
    if (!LEAGUE_IDS.includes(userTeam)) {
      const classic = new Set(ZONE_PAIRS.filter((p) => p.classic).flatMap((p) => [p.a, p.b]));
      const weakest = LEAGUE_IDS.filter((id) => !classic.has(id)).map((id) => all.find((t) => t.id === id)!).sort((a, b) => a.rating - b.rating)[0];
      for (const z of [zones.A, zones.B]) { const i = z.indexOf(weakest.id); if (i >= 0) z[i] = userTeam; }
    }
    const ids = new Set([...zones.A, ...zones.B]);
    const teams = all.filter((t) => ids.has(t.id));
    const ages: Record<string, number> = {};
    for (const t of teams) for (const p of t.players) ages[p.id] = rng.int(18, 34);
    const ut = teams.find((t) => t.id === userTeam) ?? teams[0];
    const c = new Career({
      version: 2, userTeam: ut.id, season: 1, teams, ages, appearances: {}, goals: {}, zones,
      torneo: 'apertura', phase: 'regular', fixtures: [], aperturaFixtures: [],
      formation: ut.formation, lineup: ut.players.slice(0, 11).map((p) => p.id),
      history: [], seed, seasonOver: false,
      budget: Math.round(15 + (ut.rating - 70) * 1.5),
      news: [],
    });
    c.fixtures_new();
    c.save();
    return c;
  }

  static load(): Career | null {
    const s = loadJSON<CareerState | null>(KEY, null);
    // las carreras de antes de la liga de 30 equipos (version 1) no se pueden convertir
    if (!s || s.version !== 2) return null;
    const c = new Career(s);
    s.budget ??= Math.round(15 + (c.user.rating - 70) * 1.5);
    s.news ??= [];
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

  /** Zona del usuario. */
  get userZone(): 'A' | 'B' {
    return this.state.zones.A.includes(this.state.userTeam) ? 'A' : 'B';
  }

  get allTeams(): string[] {
    return [...this.state.zones.A, ...this.state.zones.B];
  }

  /** Nombre del clásico entre dos equipos de la liga (null si no lo es). */
  classicOf(f: Fixture): string | null {
    return classicName(f.home, f.away);
  }

  /** Estadio neutral de un partido (id), si se juega en cancha neutral. */
  venueOf(f: Fixture): string | null {
    return f.venue ?? null;
  }

  // ---------------------------------------------------------------- calendario
  /** Calendario del torneo: zonas de 15 y, en la fecha libre de cada pareja, el interzonal. */
  private regularFixtures(): Fixture[] {
    const st = this.state;
    const rng = new Rng(st.seed + st.season * 101 + (st.torneo === 'clausura' ? 55 : 0));
    // el orden de las parejas se mezcla igual en las dos zonas: las fechas libres de las parejas coinciden
    const pairs = st.zones.A.map((a, i) => ({ a, b: st.zones.B[i] }));
    for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
    const tag = `S${st.season}${st.torneo === 'apertura' ? 'A' : 'C'}`;
    const stage = (r: number) => `Fecha ${r}`;
    const za = roundRobin(pairs.map((p) => p.a), false, stage, `${tag}a`);
    const zb = roundRobin(pairs.map((p) => p.b), false, stage, `${tag}b`);
    const out = [...za, ...zb];
    // interzonal en la fecha libre; la localía se invierte de un torneo a otro
    for (const p of pairs) {
      const played = new Set(za.filter((f) => f.home === p.a || f.away === p.a).map((f) => f.round));
      let bye = 1;
      while (played.has(bye)) bye++;
      const aHome = (pairs.indexOf(p) % 2 === 0) !== (st.torneo === 'clausura');
      out.push({
        id: `${tag}x-${p.a}`, home: aHome ? p.a : p.b, away: aHome ? p.b : p.a, round: bye, stage: classicName(p.a, p.b) ? `Fecha ${bye} · ${classicName(p.a, p.b)}` : `Fecha ${bye} · Interzonal`,
        played: false, homeGoals: 0, awayGoals: 0, knockout: false,
      });
    }
    return out.sort((x, y) => x.round - y.round);
  }

  private fixtures_new() {
    this.state.fixtures = this.regularFixtures();
    this.state.phase = 'regular';
  }

  get regularFx(): Fixture[] {
    return this.state.fixtures.filter((f) => !f.knockout);
  }

  get playoffFx(): Fixture[] {
    return this.state.fixtures.filter((f) => f.knockout);
  }

  /** Tabla de una zona en el torneo en juego. */
  zoneStandings(z: 'A' | 'B'): StandingRow[] {
    return computeStandings(this.state.zones[z], this.state.fixtures);
  }

  /** Tabla de la zona del usuario. */
  standings(): StandingRow[] {
    return this.zoneStandings(this.userZone);
  }

  /** Tabla anual: los partidos de fase regular de los dos torneos de la temporada. */
  annualStandings(): StandingRow[] {
    return computeStandings(this.allTeams, [...this.state.aperturaFixtures, ...this.regularFx]);
  }

  nextUserFixture(): Fixture | null {
    return this.state.fixtures.find((f) => !f.played && (f.home === this.state.userTeam || f.away === this.state.userTeam)) ?? null;
  }

  /** Rondas jugadas y totales para mostrar el avance del torneo. */
  get currentRound(): number {
    const f = this.state.fixtures.find((x) => !x.played);
    return f ? f.round : this.state.phase === 'done' ? 19 : REGULAR_ROUNDS;
  }

  get totalRounds(): number {
    return REGULAR_ROUNDS;
  }

  /** Nombre de la ronda de playoffs de un partido. */
  playoffName(f: Fixture): string {
    return f.stage;
  }

  // ---------------------------------------------------------------- simulación
  /** Media del equipo (para la simulación rápida) según sus mejores 11. */
  teamRating(t: TeamData): number {
    const ovr = t.players.map(playerOverall).sort((a, b) => b - a).slice(0, 11);
    return ovr.reduce((s, v) => s + v, 0) / ovr.length;
  }

  private simFixture(o: Fixture, rng: Rng) {
    const h = this.team(o.home);
    const a = this.team(o.away);
    // en un clásico la diferencia de nivel pesa menos
    const k = classicName(o.home, o.away) ? 0.5 : 1;
    const hr = this.teamRating(h);
    const ar = this.teamRating(a);
    const mid = (hr + ar) / 2;
    const r = quickSim(h, a, rng, o.knockout, mid + (hr - mid) * k, mid + (ar - mid) * k);
    o.played = true;
    o.homeGoals = r.h;
    o.awayGoals = r.a;
    if (r.pens) o.pens = r.pens;
  }

  /** Simula los partidos sin jugar de una ronda. */
  private simRound(round: number, rng: Rng) {
    for (const o of this.state.fixtures) if (!o.played && o.round === round) this.simFixture(o, rng);
  }

  private rngFor(salt: number) {
    return new Rng(this.state.seed + this.state.season * 7 + salt * 13 + (this.state.torneo === 'clausura' ? 3 : 0));
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

  /** Posición de cada equipo en su zona (para sembrar los playoffs). */
  private zoneOrder(z: 'A' | 'B'): string[] {
    return this.zoneStandings(z).map((r) => r.team);
  }

  /** Cuando se completa una etapa, arma la siguiente (playoffs o cierre del torneo). */
  private advance() {
    const st = this.state;
    for (let guard = 0; guard < 8; guard++) {
      if (st.phase === 'done') return;
      if (st.fixtures.some((f) => !f.played)) return;
      if (st.phase === 'regular') {
        const a = this.zoneOrder('A').slice(0, 8);
        const b = this.zoneOrder('B').slice(0, 8);
        // llave: cada zona contra la otra, el mejor sembrado contra el peor
        const ties: [string, string][] = [
          [a[0], b[7]], [a[3], b[4]], [b[1], a[6]], [b[2], a[5]],
          [b[0], a[7]], [b[3], a[4]], [a[1], b[6]], [a[2], b[5]],
        ];
        st.phase = 'playoffs';
        this.addPlayoffRound(0, ties);
      } else {
        const last = Math.max(...this.playoffFx.map((f) => f.round));
        const round = this.playoffFx.filter((f) => f.round === last);
        const winners = round.map((f) => winnerOf(f)!);
        if (winners.length === 1) {
          st.phase = 'done';
          this.finishTorneo(winners[0]);
          return;
        }
        const ties: [string, string][] = [];
        for (let i = 0; i < winners.length; i += 2) ties.push([winners[i], winners[i + 1]]);
        this.addPlayoffRound(last - REGULAR_ROUNDS, ties);
      }
    }
  }

  /** Posición dentro del torneo (menor = mejor sembrado) para decidir la localía. */
  private seedOf(id: string): number {
    const z = this.state.zones.A.includes(id) ? 'A' : 'B';
    return this.zoneOrder(z).indexOf(id);
  }

  private addPlayoffRound(nameIdx: number, ties: [string, string][]) {
    const st = this.state;
    const name = PLAYOFF_ROUNDS[nameIdx];
    const isFinal = ties.length === 1;
    const round = REGULAR_ROUNDS + nameIdx + 1;
    ties.forEach(([x, y], i) => {
      let home = x;
      let away = y;
      if (!isFinal && this.seedOf(y) < this.seedOf(x)) { home = y; away = x; }
      let venue: string | undefined;
      if (isFinal) {
        venue = (NEUTRAL_VENUES.find((v) => { const s = STADIUMS.find((q) => q.id === v); return s && s.homeTeam !== home && s.homeTeam !== away; }) ?? NEUTRAL_VENUES[0]);
      }
      st.fixtures.push({
        id: `S${st.season}${st.torneo === 'apertura' ? 'A' : 'C'}p${nameIdx}-${i}`, home, away, round, stage: isFinal ? 'Final · cancha neutral' : name,
        played: false, homeGoals: 0, awayGoals: 0, knockout: true, venue,
      });
    });
  }

  private finishTorneo(champion: string) {
    const st = this.state;
    const news = (st.news ??= []);
    news.unshift(`${TORNEO_NAMES[st.torneo]} ${st.season}: campeón ${this.team(champion).name}`);
    news.splice(12);
    if (st.torneo === 'apertura') st.aperturaChampion = champion;
    else st.seasonOver = true;
  }

  /** Registra el partido del usuario y simula el resto de la ronda. */
  recordUserResult(fx: Fixture, homeGoals: number, awayGoals: number, scorers: string[], discipline?: Discipline, pens?: [number, number]): string[] {
    const msgs = discipline ? applyAfterMatch((this.state.availability ??= emptyAvailability()), this.user, discipline) : [];
    const f = this.state.fixtures.find((x) => x.id === fx.id)!;
    f.played = true;
    f.homeGoals = homeGoals;
    f.awayGoals = awayGoals;
    if (f.knockout && homeGoals === awayGoals) f.pens = pens && pens[0] !== pens[1] ? pens : [5, 4];
    for (const id of this.state.lineup) this.state.appearances[id] = (this.state.appearances[id] ?? 0) + 1;
    for (const id of scorers) this.state.goals[id] = (this.state.goals[id] ?? 0) + 1;
    this.simRound(f.round, this.rngFor(f.round));
    this.advance();
    this.save();
    return msgs;
  }

  /** Simula también el partido del usuario (y el resto de su ronda). */
  simulateUserFixture() {
    const f = this.nextUserFixture();
    if (!f) return;
    this.simFixture(f, this.rngFor(f.round + 100));
    this.recordUserResult(f, f.homeGoals, f.awayGoals, [], undefined, f.pens);
  }

  /** Simula la ronda en juego completa (cuando el usuario no tiene partido, p. ej. eliminado). */
  simulateRound() {
    const f = this.state.fixtures.find((x) => !x.played);
    if (!f) return;
    this.simRound(f.round, this.rngFor(f.round));
    this.advance();
    this.save();
  }

  /** Simula hasta terminar el torneo o hasta que el usuario tenga que jugar. */
  simulateUntilUserOrEnd() {
    let guard = 0;
    while (this.state.phase !== 'done' && !this.nextUserFixture() && guard++ < 40) this.simulateRound();
  }

  /** El usuario sigue en carrera en los playoffs (no perdió una llave). */
  get userInPlayoffs(): boolean {
    return this.state.phase === 'playoffs' && !!this.nextUserFixture();
  }

  /** Campeón del torneo en juego (si terminó). */
  get torneoChampion(): string | null {
    if (this.state.phase !== 'done') return null;
    const fin = this.playoffFx.filter((f) => f.played).slice(-1)[0];
    return fin ? winnerOf(fin) : null;
  }

  /** Cuántas fases de playoffs superó el usuario / cómo le fue (para el resumen). */
  userPlayoffResult(): string {
    const mine = this.playoffFx.filter((f) => f.home === this.state.userTeam || f.away === this.state.userTeam);
    if (!mine.length) return 'No clasificaste a los playoffs';
    const last = mine[mine.length - 1];
    if (!last.played) return `En playoffs: ${last.stage}`;
    if (winnerOf(last) === this.state.userTeam) return last.stage.startsWith('Final') ? '¡Campeón!' : `Pasaste ${last.stage}`;
    return `Eliminado en ${last.stage.startsWith('Final') ? 'la final' : last.stage.toLowerCase()}`;
  }

  /** Cierra el Apertura y arma el Clausura. */
  startClausura() {
    const st = this.state;
    if (st.torneo !== 'apertura' || st.phase !== 'done') return;
    st.aperturaFixtures = this.regularFx;
    st.torneo = 'clausura';
    this.fixtures_new();
    this.save();
  }

  /** Cierra la temporada: historial, evolución de jugadores y nuevo Apertura. */
  startNextSeason(): { apertura: string; clausura: string; annual: string; position: number; changes: { name: string; delta: number }[]; income: number } {
    const st = this.state;
    const annual = this.annualStandings();
    const position = annual.findIndex((r) => r.team === st.userTeam) + 1;
    const apertura = st.aperturaChampion ?? annual[0].team;
    const clausura = this.torneoChampion ?? annual[0].team;
    st.history.push({ season: st.season, apertura, clausura, annual: annual[0].team, userPosition: position });
    // dinero: premio por la tabla anual y por títulos
    const titles = (apertura === st.userTeam ? 1 : 0) + (clausura === st.userTeam ? 1 : 0);
    const income = Math.max(2, Math.round(30 - position * 0.8) + titles * 6);
    st.budget = Math.round(((st.budget ?? 0) + income) * 10) / 10;
    const news = (st.news ??= []);
    news.unshift(`Temporada ${st.season}: tabla anual para ${this.team(annual[0].team).name}`);
    news.splice(12);
    const rng = new Rng(st.seed + st.season * 977);
    const changes: { name: string; delta: number }[] = [];
    for (const t of st.teams) {
      for (const p of t.players) {
        const age = st.ages[p.id] ?? 25;
        const apps = st.appearances[p.id] ?? (t.id === st.userTeam ? 0 : 8);
        let delta = 0;
        if (age <= 23) delta = rng.int(1, 4) + (apps > 7 ? 1 : 0);
        else if (age <= 29) delta = rng.int(-1, 2) + (apps > 9 ? 1 : 0);
        else if (age <= 32) delta = rng.int(-3, 0);
        else delta = rng.int(-4, -1);
        applyDelta(p, delta);
        st.ages[p.id] = age + 1;
        if (t.id === st.userTeam && delta !== 0) changes.push({ name: p.name, delta });
        // retiro y relevo por un juvenil
        if (age + 1 > 35) {
          st.ages[p.id] = rng.int(17, 19);
          p.name = `${p.name.split(' ')[0]} Jr.`;
          applyDelta(p, -6);
        }
      }
      t.rating = Math.round(this.teamRating(t));
    }
    st.season++;
    st.appearances = {};
    st.goals = {};
    st.seasonOver = false;
    st.torneo = 'apertura';
    st.aperturaFixtures = [];
    st.aperturaChampion = undefined;
    // nueva temporada: se borran las sanciones y las amarillas (las lesiones siguen)
    const av = st.availability;
    if (av) {
      av.yellows = {};
      for (const [id, o] of Object.entries(av.out)) if (o.reason === 'suspension') delete av.out[id];
    }
    this.fixtures_new();
    this.save();
    return { apertura, clausura, annual: annual[0].team, position, changes, income };
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
