import { FORMATIONS } from '../data/formations';
import { playerOverall, TEAMS } from '../data/teams';
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
}

const KEY = 'career';

export class Career {
  constructor(public state: CareerState) {}

  static create(userTeam: string, seed = Date.now() % 100000): Career {
    const rng = new Rng(seed);
    const teams: TeamData[] = structuredClone(TEAMS);
    const ages: Record<string, number> = {};
    for (const t of teams) for (const p of t.players) ages[p.id] = rng.int(18, 34);
    const ut = teams.find((t) => t.id === userTeam)!;
    const c = new Career({
      version: 1, userTeam, season: 1, teams, ages, appearances: {}, goals: {},
      fixtures: [], formation: ut.formation, lineup: ut.players.slice(0, 11).map((p) => p.id),
      history: [], seed, seasonOver: false,
    });
    c.newSeasonFixtures();
    c.save();
    return c;
  }

  static load(): Career | null {
    const s = loadJSON<CareerState | null>(KEY, null);
    if (!s || s.version !== 1) return null;
    return new Career(s);
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

  private newSeasonFixtures() {
    const rng = new Rng(this.state.seed + this.state.season * 101);
    const ids = this.state.teams.map((t) => t.id).sort(() => rng.next() - 0.5);
    this.state.fixtures = roundRobin(ids, true, (r) => `Jornada ${r}`, `S${this.state.season}`);
  }

  standings(): StandingRow[] {
    return computeStandings(this.state.teams.map((t) => t.id), this.state.fixtures);
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
  startNextSeason(): { champion: string; position: number; changes: { name: string; delta: number }[] } {
    const table = this.standings();
    const champion = table[0].team;
    const position = table.findIndex((r) => r.team === this.state.userTeam) + 1;
    this.state.history.push({ season: this.state.season, champion, userPosition: position });
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
    return { champion, position, changes };
  }
}

function applyDelta(p: PlayerData, delta: number) {
  const a = p.attrs;
  const keys = (Object.keys(a) as (keyof typeof a)[]).filter((k) => p.position === 'GK' ? true : k !== 'goalkeeping');
  for (const k of keys) a[k] = clamp(Math.round(a[k] + delta + (Math.random() < 0.3 ? Math.sign(delta) : 0)), 25, 99);
}
