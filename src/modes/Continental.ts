import { LEAGUES, leagueOfTeam } from '../data/leagues';
import { getTeam, TEAMS } from '../data/teams';
import { loadJSON, removeKey, saveJSON } from '../save/Storage';
import { Rng } from '../util/math';
import { computeStandings, quickSim, roundRobin, winnerOf, type Fixture, type StandingRow } from './Competition';
import { applyAfterMatch, emptyAvailability, fixLineup, type AvailabilityState, type Discipline } from './Availability';

/**
 * Copas de la CONMEBOL: Libertadores y Sudamericana con 32 clubes de las ligas del juego (con cupos por país), ocho
 * grupos de cuatro a ida y vuelta, y octavos, cuartos, semifinales y final a partido único (con prórroga y penales).
 * La final se juega en cancha neutral. Si el usuario queda eliminado, el resto se simula.
 */
export type CupId = 'libertadores' | 'sudamericana';

export interface CupDef {
  id: CupId;
  name: string;
  /** Cupos por liga (id de data/leagues.ts): los mejores de cada liga; la Sudamericana toma a los siguientes. */
  quotas: Record<string, number>;
  /** Estadio de la final. */
  finalVenue: string;
}

const LIB_QUOTAS: Record<string, number> = { brasil: 6, lpf: 6, colombia: 3, chile: 3, ecuador: 3, paraguay: 3, uruguay: 3, peru: 2, bolivia: 2, venezuela: 1 };
const SUD_QUOTAS: Record<string, number> = { brasil: 6, lpf: 6, colombia: 3, chile: 2, ecuador: 2, paraguay: 2, uruguay: 3, peru: 3, bolivia: 3, venezuela: 2 };

export const CUPS: Record<CupId, CupDef> = {
  libertadores: { id: 'libertadores', name: 'CONMEBOL Libertadores', quotas: LIB_QUOTAS, finalVenue: 'centenario' },
  sudamericana: { id: 'sudamericana', name: 'CONMEBOL Sudamericana', quotas: SUD_QUOTAS, finalVenue: 'defensores-chaco' },
};

export const KNOCKOUT_NAMES = ['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final'];
const GROUP_ROUNDS = 6;
const GROUP_LETTERS = 'ABCDEFGH';

export interface ContinentalState {
  version: 1;
  cup: CupId;
  userTeam: string;
  groups: string[][];
  fixtures: Fixture[];
  seed: number;
  champion: string | null;
  eliminated: boolean;
  availability?: AvailabilityState;
}

const KEY = 'continental';

/** Los 32 clubes de la copa: los mejores de cada liga según sus cupos (la Sudamericana toma los que siguen a los de la Libertadores). */
export function cupField(cup: CupId, userTeam: string): string[] {
  const def = CUPS[cup];
  const field: string[] = [];
  for (const l of LEAGUES) {
    if (!def.quotas[l.id]) continue;
    const ranked = l.teamIds().map((id) => getTeam(id)).filter((t, i, a) => t && a.findIndex((x) => x.id === t.id) === i).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    const skip = cup === 'sudamericana' ? LIB_QUOTAS[l.id] ?? 0 : 0;
    field.push(...ranked.slice(skip, skip + def.quotas[l.id]).map((t) => t.id));
  }
  // el equipo del usuario siempre juega: ocupa el lugar del peor clasificado
  if (!field.includes(userTeam)) {
    const worst = field.map((id) => getTeam(id)).sort((a, b) => a.rating - b.rating)[0];
    if (worst) field[field.indexOf(worst.id)] = userTeam;
  }
  return field;
}

/** Equipos que pueden jugar las copas (los de todas las ligas menos la segunda división argentina). */
export function cupEligibleTeams(): string[] {
  return LEAGUES.filter((l) => l.id !== 'primeranacional').flatMap((l) => l.teamIds()).filter((id) => TEAMS.some((t) => t.id === id));
}

export class Continental {
  constructor(public state: ContinentalState) {}

  static create(cup: CupId, userTeam: string, seed = Date.now() % 100000): Continental {
    const rng = new Rng(seed);
    const field = cupField(cup, userTeam).sort((a, b) => getTeam(b).rating - getTeam(a).rating);
    const country = (id: string) => leagueOfTeam(id)?.country ?? id;
    // cuatro bombos de ocho: un club de cada bombo por grupo, sin repetir país si se puede
    const pots = [0, 1, 2, 3].map((k) => field.slice(k * 8, k * 8 + 8));
    let groups: string[][] = [];
    for (let attempt = 0; attempt < 300; attempt++) {
      const ps = pots.map((p) => p.slice().sort(() => rng.next() - 0.5));
      groups = [0, 1, 2, 3, 4, 5, 6, 7].map((g) => ps.map((p) => p[g]));
      if (groups.every((g) => new Set(g.map(country)).size === g.length)) break;
    }
    // el usuario siempre en el grupo A (más fácil de leer)
    const gi = groups.findIndex((g) => g.includes(userTeam));
    if (gi > 0) [groups[0], groups[gi]] = [groups[gi], groups[0]];
    const fixtures: Fixture[] = groups.flatMap((g, i) => roundRobin(g, true, (r) => `Grupo ${GROUP_LETTERS[i]} · Fecha ${r}`, `G${i}`));
    const c = new Continental({ version: 1, cup, userTeam, groups, fixtures, seed, champion: null, eliminated: false });
    c.save();
    return c;
  }

  static load(): Continental | null {
    const s = loadJSON<ContinentalState | null>(KEY, null);
    if (!s || s.version !== 1) return null;
    return new Continental(s);
  }

  static clear() {
    removeKey(KEY);
  }

  save() {
    saveJSON(KEY, this.state);
  }

  get def(): CupDef {
    return CUPS[this.state.cup];
  }

  get finished() {
    return this.state.champion !== null;
  }

  standings(group: number): StandingRow[] {
    const ids = this.state.groups[group];
    return computeStandings(ids, this.state.fixtures.filter((f) => !f.knockout && ids.includes(f.home)));
  }

  get userGroup(): number {
    return this.state.groups.findIndex((g) => g.includes(this.state.userTeam));
  }

  nextUserFixture(): Fixture | null {
    return this.state.fixtures.find((f) => !f.played && (f.home === this.state.userTeam || f.away === this.state.userTeam)) ?? null;
  }

  matchLineup(): string[] {
    const t = getTeam(this.state.userTeam);
    return fixLineup(t, t.formation, t.players.slice(0, 11).map((p) => p.id), this.state.availability);
  }

  recordUserResult(fx: Fixture, homeGoals: number, awayGoals: number, pens?: [number, number], discipline?: Discipline): string[] {
    const msgs = discipline ? applyAfterMatch((this.state.availability ??= emptyAvailability()), getTeam(this.state.userTeam), discipline) : [];
    const f = this.state.fixtures.find((x) => x.id === fx.id)!;
    f.played = true;
    f.homeGoals = homeGoals;
    f.awayGoals = awayGoals;
    if (f.knockout && homeGoals === awayGoals) f.pens = pens && pens[0] !== pens[1] ? pens : [5, 4];
    this.simulateRound(f.round);
    this.advance();
    if (this.state.eliminated && !this.state.champion) this.simulateAll();
    this.save();
    return msgs;
  }

  /** Simula también el partido del usuario. */
  simulateUserFixture() {
    const f = this.nextUserFixture();
    if (!f) return;
    const r = quickSim(getTeam(f.home), getTeam(f.away), new Rng(this.state.seed + f.round * 17 + 5), f.knockout);
    this.recordUserResult(f, r.h, r.a, r.pens);
  }

  /** Simula todo lo que queda cuando el usuario ya no juega. */
  simulateAll() {
    let guard = 0;
    while (!this.state.champion && !this.nextUserFixture() && guard++ < 20) {
      const f = this.state.fixtures.find((x) => !x.played);
      if (!f) break;
      this.simulateRound(f.round);
      this.advance();
    }
    this.save();
  }

  private simulateRound(round: number) {
    const rng = new Rng(this.state.seed + round * 31);
    for (const f of this.state.fixtures) {
      if (f.played || f.round > round) continue;
      const r = quickSim(getTeam(f.home), getTeam(f.away), rng, f.knockout);
      f.played = true;
      f.homeGoals = r.h;
      f.awayGoals = r.a;
      f.pens = r.pens;
    }
  }

  /** Genera cada ronda eliminatoria cuando termina la anterior; si el usuario queda afuera, simula el resto. */
  private advance() {
    const st = this.state;
    for (let guard = 0; guard < 8; guard++) {
      const fx = st.fixtures;
      if (fx.some((f) => !f.played)) break;
      const ko = fx.filter((f) => f.knockout);
      if (!ko.length) {
        // fin de grupos: pasan los dos primeros
        const tables = st.groups.map((_, i) => this.standings(i));
        const first = tables.map((t) => t[0].team);
        const second = tables.map((t) => t[1].team);
        const ties: [string, string][] = [[0, 1], [2, 3], [4, 5], [6, 7], [1, 0], [3, 2], [5, 4], [7, 6]].map(([a, b]) => [first[a], second[b]]);
        this.addRound(0, ties, tables);
        if (!ties.some(([a, b]) => a === st.userTeam || b === st.userTeam)) st.eliminated = true;
      } else {
        const last = Math.max(...ko.map((f) => f.round));
        const winners = ko.filter((f) => f.round === last).map((f) => winnerOf(f)!);
        if (winners.length === 1) {
          st.champion = winners[0];
          break;
        }
        const ties: [string, string][] = [];
        for (let i = 0; i < winners.length; i += 2) ties.push([winners[i], winners[i + 1]]);
        this.addRound(last - GROUP_ROUNDS, ties);
        if (!winners.includes(st.userTeam)) st.eliminated = true;
      }
    }
  }

  private addRound(idx: number, ties: [string, string][], tables?: StandingRow[][]) {
    const st = this.state;
    const isFinal = ties.length === 1;
    // el mejor de la fase de grupos es local
    const rank = new Map<string, number>();
    const all = (tables ?? st.groups.map((_, i) => this.standings(i))).flat().sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    all.forEach((r, i) => rank.set(r.team, i));
    ties.forEach(([x, y], i) => {
      let home = x;
      let away = y;
      if (!isFinal && (rank.get(y) ?? 99) < (rank.get(x) ?? 99) && idx > 0) { home = y; away = x; }
      st.fixtures.push({
        id: `K${idx}-${i}`, home, away, round: GROUP_ROUNDS + idx + 1, stage: isFinal ? 'Final · cancha neutral' : KNOCKOUT_NAMES[idx],
        played: false, homeGoals: 0, awayGoals: 0, knockout: true, venue: isFinal ? this.def.finalVenue : undefined,
      });
    });
  }
}
