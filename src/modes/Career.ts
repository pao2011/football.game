import { FORMATIONS } from '../data/formations';
import { ZONE_A, ZONE_B, ZONE_PAIRS, classicName } from '../data/classics';
import { getLeague, leagueOfTeam, type LeagueDef } from '../data/leagues';
import { STADIUMS } from '../data/stadiums';
import { playerOverall, TEAMS } from '../data/teams';
import type { FormationId, PlayerData, TeamData } from '../data/types';
import { loadJSON, removeKey, saveJSON } from '../save/Storage';
import { Rng, clamp } from '../util/math';
import { computeStandings, quickSim, roundRobin, winnerOf, type Fixture, type StandingRow } from './Competition';
import { applyAfterMatch, emptyAvailability, fixLineup, type AvailabilityState, type Discipline } from './Availability';

/**
 * Modo carrera: el usuario dirige un club en una de las ligas del juego (Liga Profesional de 30 equipos en dos
 * zonas, Primera Nacional, Brasileirão, Chile, Colombia, Perú, Paraguay; ver data/leagues.ts). Cada temporada tiene
 * uno o dos torneos (Apertura y Clausura); según la liga hay playoffs (final en cancha neutral) y tabla anual.
 * El usuario gestiona alineación y formación, juega sus partidos y el resto se simula.
 */
export type LeaguePhase = 'regular' | 'playoffs' | 'done';

export interface SeasonRecord {
  season: number;
  /** Campeón de cada torneo de la temporada. */
  champions: string[];
  /** Campeón de la temporada (el de la tabla anual si la liga la tiene; si no, el del último torneo). */
  champion: string;
  /** Posición del usuario en la tabla de la temporada. */
  userPosition: number;
}

export interface CareerState {
  version: 3;
  /** Liga (id de data/leagues.ts). */
  league: string;
  userTeam: string;
  season: number;
  teams: TeamData[]; // copia propia: los atributos evolucionan
  ages: Record<string, number>;
  appearances: Record<string, number>;
  goals: Record<string, number>;
  /** Zonas de la liga (ids); la B queda vacía en las ligas de una sola tabla. */
  zones: { A: string[]; B: string[] };
  /** Torneo en juego (índice en los torneos de la liga). */
  torneoIdx: number;
  phase: LeaguePhase;
  /** Fechas de la fase regular del torneo en juego. */
  regularRounds: number;
  /** Partidos del torneo en juego (fase regular y playoffs). */
  fixtures: Fixture[];
  /** Fase regular de los torneos ya terminados de esta temporada (cuenta para la tabla anual). */
  prevFixtures: Fixture[];
  /** Campeones de los torneos ya terminados de esta temporada. */
  torneoChampions: string[];
  formation: FormationId;
  lineup: string[]; // 11 ids en orden de la formación
  history: SeasonRecord[];
  seed: number;
  /** Terminó el último torneo: falta cerrar la temporada. */
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

/** Rondas de playoffs según cuántos clasifican (8 por zona en dos zonas = 16 equipos). */
const PLAYOFF_NAMES: Record<number, string[]> = {
  16: ['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final'],
  8: ['Cuartos de final', 'Semifinal', 'Final'],
  4: ['Semifinal', 'Final'],
};
/** Estadios donde se juegan las finales (se elige el primero que no sea de un finalista). */
const NEUTRAL_VENUES = ['kempes', 'madre-ciudades', 'gigante-arroyito', 'coloso', 'cilindro'];

const KEY = 'career';

export class Career {
  constructor(public state: CareerState) {}

  static create(userTeam: string, seed = Date.now() % 100000, leagueId?: string): Career {
    const rng = new Rng(seed);
    const all = structuredClone(TEAMS);
    // liga: la elegida o la del equipo (un equipo propio del editor juega en la Liga Profesional)
    const def: LeagueDef = leagueId ? getLeague(leagueId) : leagueOfTeam(userTeam) ?? getLeague('lpf');
    let ids = def.teamIds().slice();
    // un equipo propio (del editor): ocupa el lugar del peor equipo de la liga (sin clásico)
    let swapped: string | null = null;
    if (!ids.includes(userTeam)) {
      const classic = new Set(def.id === 'lpf' ? ZONE_PAIRS.filter((p) => p.classic).flatMap((p) => [p.a, p.b]) : []);
      const weakest = ids.filter((id) => !classic.has(id)).map((id) => all.find((t) => t.id === id)!).filter(Boolean).sort((a, b) => a.rating - b.rating)[0];
      if (weakest) {
        swapped = weakest.id;
        ids = ids.map((id) => (id === swapped ? userTeam : id));
      }
    }
    const swap = (id: string) => (id === swapped ? userTeam : id);
    const zones = def.id === 'lpf' ? { A: ZONE_A.map(swap), B: ZONE_B.map(swap) } : splitZones(ids, def.format.zones, all);
    const inLeague = new Set([...zones.A, ...zones.B]);
    const teams = all.filter((t) => inLeague.has(t.id));
    const ages: Record<string, number> = {};
    for (const t of teams) for (const p of t.players) ages[p.id] = rng.int(18, 34);
    const ut = teams.find((t) => t.id === userTeam) ?? teams[0];
    const c = new Career({
      version: 3, league: def.id, userTeam: ut.id, season: 1, teams, ages, appearances: {}, goals: {}, zones,
      torneoIdx: 0, phase: 'regular', regularRounds: 0, prevFixtures: [], torneoChampions: [],
      fixtures: [], formation: ut.formation, lineup: ut.players.slice(0, 11).map((p) => p.id),
      history: [], seed, seasonOver: false,
      budget: Math.round(15 + (ut.rating - 70) * 1.5),
      news: [],
    });
    c.newTorneo();
    c.save();
    return c;
  }

  static load(): Career | null {
    const s = loadJSON<CareerState | null>(KEY, null);
    // las carreras de versiones anteriores (una sola liga, formato distinto) no se pueden convertir
    if (!s || s.version !== 3) return null;
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

  /** Datos de la liga de esta carrera. */
  get league(): LeagueDef {
    return getLeague(this.state.league);
  }

  get fmt() {
    return this.league.format;
  }

  /** Nombre del torneo en juego. */
  get torneoName(): string {
    return this.fmt.torneos[this.state.torneoIdx];
  }

  /** Es el último torneo de la temporada. */
  get lastTorneo(): boolean {
    return this.state.torneoIdx >= this.fmt.torneos.length - 1;
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
  /** Calendario del torneo: zonas y, si son impares y hay dos, el interzonal en la fecha libre de cada pareja. */
  private regularFixtures(): Fixture[] {
    const st = this.state;
    const fmt = this.fmt;
    const double = fmt.rr === 'double';
    const rng = new Rng(st.seed + st.season * 101 + st.torneoIdx * 55);
    const tag = `S${st.season}T${st.torneoIdx}`;
    const stage = (r: number) => `Fecha ${r}`;
    // el orden de los equipos se mezcla para que cada temporada tenga otro calendario
    const shuffle = <T,>(a: T[]) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
    if (!st.zones.B.length) {
      const fx = roundRobin(shuffle(st.zones.A), double, stage, tag);
      st.regularRounds = Math.max(...fx.map((f) => f.round));
      return fx;
    }
    // zonas de distinto tamaño (cantidad impar de clubes): cada una juega la suya, sin interzonales
    if (st.zones.A.length !== st.zones.B.length) {
      const fx = [...roundRobin(shuffle(st.zones.A), double, stage, `${tag}a`), ...roundRobin(shuffle(st.zones.B), double, stage, `${tag}b`)];
      st.regularRounds = Math.max(...fx.map((f) => f.round));
      return fx.sort((x, y) => x.round - y.round);
    }
    // dos zonas: se mezclan las parejas (igual en las dos zonas: las fechas libres de las parejas coinciden)
    const pairs = shuffle(st.zones.A.map((a, i) => ({ a, b: st.zones.B[i] })));
    const za = roundRobin(pairs.map((p) => p.a), double, stage, `${tag}a`);
    const zb = roundRobin(pairs.map((p) => p.b), double, stage, `${tag}b`);
    const out = [...za, ...zb];
    const odd = pairs.length % 2 === 1;
    st.regularRounds = pairs.length - (odd ? 0 : 1);
    if (double) st.regularRounds *= 2;
    if (odd && !double) {
      for (const p of pairs) {
        const played = new Set(za.filter((f) => f.home === p.a || f.away === p.a).map((f) => f.round));
        let bye = 1;
        while (played.has(bye)) bye++;
        // la localía se alterna entre parejas y se invierte de un torneo a otro
        const aHome = (pairs.indexOf(p) % 2 === 0) !== (st.torneoIdx % 2 === 1);
        const cl = classicName(p.a, p.b);
        out.push({
          id: `${tag}x-${p.a}`, home: aHome ? p.a : p.b, away: aHome ? p.b : p.a, round: bye, stage: cl ? `Fecha ${bye} · ${cl}` : `Fecha ${bye} · Interzonal`,
          played: false, homeGoals: 0, awayGoals: 0, knockout: false,
        });
      }
    }
    return out.sort((x, y) => x.round - y.round);
  }

  /** Arma el calendario del torneo que empieza. */
  private newTorneo() {
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

  /** Tabla de la temporada: fases regulares de todos los torneos (en dos zonas, también los interzonales). */
  annualStandings(): StandingRow[] {
    return computeStandings(this.allTeams, [...this.state.prevFixtures, ...this.regularFx]);
  }

  nextUserFixture(): Fixture | null {
    return this.state.fixtures.find((f) => !f.played && (f.home === this.state.userTeam || f.away === this.state.userTeam)) ?? null;
  }

  /** Fecha en juego. */
  get currentRound(): number {
    const f = this.state.fixtures.find((x) => !x.played);
    return f ? f.round : this.state.regularRounds;
  }

  get totalRounds(): number {
    return this.state.regularRounds;
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

  /** Simula los partidos sin jugar de una ronda y de las anteriores (fechas libres del usuario en ligas de equipos impares). */
  private simRound(round: number, rng: Rng) {
    for (const o of this.state.fixtures) if (!o.played && o.round <= round) this.simFixture(o, rng);
  }

  private rngFor(salt: number) {
    return new Rng(this.state.seed + this.state.season * 7 + salt * 13 + this.state.torneoIdx * 3);
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
    const q = this.fmt.playoffs;
    for (let guard = 0; guard < 8; guard++) {
      if (st.phase === 'done') return;
      if (st.fixtures.some((f) => !f.played)) return;
      if (st.phase === 'regular') {
        if (!q) {
          st.phase = 'done';
          this.finishTorneo(this.zoneOrder('A')[0]);
          return;
        }
        const a = this.zoneOrder('A').slice(0, q);
        let ties: [string, string][];
        if (st.zones.B.length) {
          // llave: cada zona contra la otra, el mejor sembrado contra el peor
          const b = this.zoneOrder('B').slice(0, q);
          ties = [[a[0], b[7]], [a[3], b[4]], [b[1], a[6]], [b[2], a[5]], [b[0], a[7]], [b[3], a[4]], [a[1], b[6]], [a[2], b[5]]];
        } else {
          ties = [[a[0], a[7]], [a[3], a[4]], [a[1], a[6]], [a[2], a[5]]];
        }
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
        this.addPlayoffRound(last - st.regularRounds, ties);
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
    const qualified = this.fmt.playoffs * (st.zones.B.length ? 2 : 1);
    const name = (PLAYOFF_NAMES[qualified] ?? PLAYOFF_NAMES[16])[nameIdx] ?? 'Final';
    const isFinal = ties.length === 1;
    const round = st.regularRounds + nameIdx + 1;
    ties.forEach(([x, y], i) => {
      let home = x;
      let away = y;
      if (!isFinal && this.seedOf(y) < this.seedOf(x)) { home = y; away = x; }
      let venue: string | undefined;
      if (isFinal && this.fmt.neutralFinal) {
        venue = (NEUTRAL_VENUES.find((v) => { const s = STADIUMS.find((q) => q.id === v); return s && s.homeTeam !== home && s.homeTeam !== away; }) ?? NEUTRAL_VENUES[0]);
      }
      st.fixtures.push({
        id: `S${st.season}T${st.torneoIdx}p${nameIdx}-${i}`, home, away, round, stage: isFinal ? (venue ? 'Final · cancha neutral' : 'Final') : name,
        played: false, homeGoals: 0, awayGoals: 0, knockout: true, venue,
      });
    });
  }

  private finishTorneo(champion: string) {
    const st = this.state;
    st.torneoChampions[st.torneoIdx] = champion;
    const news = (st.news ??= []);
    news.unshift(`${this.torneoName} ${st.season}: campeón ${this.team(champion).name}`);
    news.splice(12);
    if (this.lastTorneo) st.seasonOver = true;
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
    while (this.state.phase !== 'done' && !this.nextUserFixture() && guard++ < 80) this.simulateRound();
  }

  /** El usuario sigue en carrera en los playoffs (no perdió una llave). */
  get userInPlayoffs(): boolean {
    return this.state.phase === 'playoffs' && !!this.nextUserFixture();
  }

  /** Campeón del torneo en juego (si terminó). */
  get torneoChampion(): string | null {
    return this.state.phase === 'done' ? this.state.torneoChampions[this.state.torneoIdx] ?? null : null;
  }

  /** Cómo le fue al usuario en el torneo (para el resumen). */
  userPlayoffResult(): string {
    if (!this.fmt.playoffs) {
      const pos = this.zoneStandings(this.userZone).findIndex((r) => r.team === this.state.userTeam) + 1;
      return `Terminaste ${pos}.º`;
    }
    const mine = this.playoffFx.filter((f) => f.home === this.state.userTeam || f.away === this.state.userTeam);
    if (!mine.length) return 'No clasificaste a los playoffs';
    const last = mine[mine.length - 1];
    if (!last.played) return `En playoffs: ${last.stage}`;
    if (winnerOf(last) === this.state.userTeam) return last.stage.startsWith('Final') ? '¡Campeón!' : `Pasaste ${last.stage}`;
    return `Eliminado en ${last.stage.startsWith('Final') ? 'la final' : last.stage.toLowerCase()}`;
  }

  /** Cierra el torneo terminado y arma el siguiente de la temporada (p. ej. el Clausura). */
  startNextTorneo() {
    const st = this.state;
    if (st.phase !== 'done' || this.lastTorneo) return;
    st.prevFixtures = [...st.prevFixtures, ...this.regularFx];
    st.torneoIdx++;
    this.newTorneo();
    this.save();
  }

  /** Cierra la temporada: historial, evolución de jugadores y nuevo primer torneo. */
  startNextSeason(): { champions: string[]; champion: string; position: number; changes: { name: string; delta: number }[]; income: number } {
    const st = this.state;
    const table = this.annualStandings();
    const position = table.findIndex((r) => r.team === st.userTeam) + 1;
    const champions = st.torneoChampions.slice();
    const champion = this.fmt.annual ? table[0].team : champions[champions.length - 1];
    st.history.push({ season: st.season, champions, champion, userPosition: position });
    // dinero: premio por la tabla y por títulos
    const titles = champions.filter((c) => c === st.userTeam).length;
    const income = Math.max(2, Math.round(30 - position * (24 / Math.max(8, table.length)) ) + titles * 6);
    st.budget = Math.round(((st.budget ?? 0) + income) * 10) / 10;
    const news = (st.news ??= []);
    news.unshift(`Temporada ${st.season}: campeón ${this.team(champion).name}`);
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
    st.torneoIdx = 0;
    st.prevFixtures = [];
    st.torneoChampions = [];
    // nueva temporada: se borran las sanciones y las amarillas (las lesiones siguen)
    const av = st.availability;
    if (av) {
      av.yellows = {};
      for (const [id, o] of Object.entries(av.out)) if (o.reason === 'suspension') delete av.out[id];
    }
    this.newTorneo();
    this.save();
    return { champions, champion, position, changes, income };
  }
}

/** Reparte los equipos en zonas: una sola o dos (por nivel, en serpentina, para que sean parejas). */
function splitZones(ids: string[], zones: 1 | 2, all: TeamData[]): { A: string[]; B: string[] } {
  if (zones === 1) return { A: ids.slice(), B: [] };
  const rated = ids.slice().sort((x, y) => (all.find((t) => t.id === y)?.rating ?? 0) - (all.find((t) => t.id === x)?.rating ?? 0));
  const A: string[] = [];
  const B: string[] = [];
  rated.forEach((id, i) => ((i % 4 === 0 || i % 4 === 3) ? A : B).push(id));
  return { A, B };
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
