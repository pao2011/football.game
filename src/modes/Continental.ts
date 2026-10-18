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
    // la final y la vuelta se definen por penales si siguen empatadas (la vuelta, por el global)
    if (f.knockout && f.leg !== 1) {
      const tied = f.leg === 2 ? this.aggregate(f)[0] === this.aggregate(f)[1] : homeGoals === awayGoals;
      if (tied) f.pens = pens && pens[0] !== pens[1] ? pens : [5, 4];
    }
    this.simulateRound(f.round);
    this.advance();
    if (this.state.eliminated && !this.state.champion) this.simulateAll();
    this.save();
    return msgs;
  }

  /** Global de una vuelta: [goles del local de la vuelta, goles del visitante de la vuelta] sumando la ida. */
  aggregate(f2: Fixture): [number, number] {
    const f1 = this.state.fixtures.find((x) => x.tie === f2.tie && x.leg === 1);
    if (!f1 || !f1.played) return [f2.homeGoals, f2.awayGoals];
    return [f2.homeGoals + f1.awayGoals, f2.awayGoals + f1.homeGoals];
  }

  /** Goles de la ida de [local, visitante] de la vuelta (para el partido que se juega). */
  firstLegGoals(f2: Fixture): [number, number] {
    const f1 = this.state.fixtures.find((x) => x.tie === f2.tie && x.leg === 1);
    return f1 && f1.played ? [f1.awayGoals, f1.homeGoals] : [0, 0];
  }

  /** Ganador de una llave (ida y vuelta) o de la final. */
  private tieWinner(f: Fixture): string {
    if (f.leg !== 2) return winnerOf(f)!;
    const [h, a] = this.aggregate(f);
    if (h !== a) return h > a ? f.home : f.away;
    return f.pens && f.pens[0] > f.pens[1] ? f.home : f.away;
  }

  /** Simula también el partido del usuario. */
  simulateUserFixture() {
    const f = this.nextUserFixture();
    if (!f) return;
    const r = this.simFixture(f, new Rng(this.state.seed + f.round * 17 + 5));
    this.recordUserResult(f, r.h, r.a, r.pens);
  }

  /** Simula todo lo que queda cuando el usuario ya no juega. */
  simulateAll() {
    let guard = 0;
    while (!this.state.champion && !this.nextUserFixture() && guard++ < 30) {
      const f = this.state.fixtures.find((x) => !x.played);
      if (!f) break;
      this.simulateRound(f.round);
      this.advance();
    }
    this.save();
  }

  /** Simula un partido sin jugar: la ida y los grupos pueden empatar; la vuelta y la final se definen por penales. */
  private simFixture(f: Fixture, rng: Rng) {
    const final = f.knockout && f.leg !== 1;
    const r = quickSim(getTeam(f.home), getTeam(f.away), rng, f.knockout && f.leg !== 2 && f.leg !== 1);
    f.played = true;
    f.homeGoals = r.h;
    f.awayGoals = r.a;
    f.pens = r.pens;
    if (final && f.leg === 2) {
      const [h, a] = this.aggregate(f);
      f.pens = undefined;
      if (h === a) {
        let ph = 0, pa = 0;
        for (let i = 0; i < 5; i++) { if (rng.next() < 0.76) ph++; if (rng.next() < 0.76) pa++; }
        while (ph === pa) { if (rng.next() < 0.76) ph++; if (rng.next() < 0.76) pa++; }
        f.pens = [ph, pa];
      }
    }
    return { h: f.homeGoals, a: f.awayGoals, pens: f.pens };
  }

  private simulateRound(round: number) {
    const rng = new Rng(this.state.seed + round * 31);
    for (const f of this.state.fixtures) if (!f.played && f.round <= round) this.simFixture(f, rng);
  }

  /** Genera cada ronda eliminatoria cuando termina la anterior (octavos, cuartos y semifinales a ida y vuelta; final única). */
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
        // los partidos que cierran cada llave (la vuelta, o la final), en el orden de la llave
        const closing = ko.filter((f) => f.round === last);
        const winners = closing.map((f) => this.tieWinner(f));
        if (winners.length === 1 && closing[0].leg !== 2) {
          st.champion = winners[0];
          break;
        }
        const ties: [string, string][] = [];
        for (let i = 0; i < winners.length; i += 2) ties.push([winners[i], winners[i + 1]]);
        this.addRound(KNOCKOUT_NAMES.indexOf(closing[0].stage.replace(/ · .*$/, '')) + 1, ties);
        if (!winners.includes(st.userTeam)) st.eliminated = true;
      }
    }
  }

  /** Agrega una ronda eliminatoria: ida y vuelta (el mejor ubicado cierra en su casa) o, en la final, un solo partido neutral. */
  private addRound(idx: number, ties: [string, string][], tables?: StandingRow[][]) {
    const st = this.state;
    const isFinal = ties.length === 1;
    const rank = new Map<string, number>();
    const all = (tables ?? st.groups.map((_, i) => this.standings(i))).flat().sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
    all.forEach((r, i) => rank.set(r.team, i));
    const base = GROUP_ROUNDS + 1 + idx * 2; // octavos 7-8, cuartos 9-10, semifinales 11-12, final 13
    const legs1: Fixture[] = [];
    const legs2: Fixture[] = [];
    ties.forEach(([x, y], i) => {
      // x es el mejor sembrado de la llave salvo que y le gane en la tabla de grupos
      let better = x;
      let worse = y;
      if ((rank.get(y) ?? 99) < (rank.get(x) ?? 99)) { better = y; worse = x; }
      const tie = `K${idx}-${i}`;
      const blank = { played: false, homeGoals: 0, awayGoals: 0, knockout: true };
      if (isFinal) {
        st.fixtures.push({ ...blank, id: tie, home: x, away: y, round: GROUP_ROUNDS + 1 + idx * 2, stage: 'Final · cancha neutral', venue: this.def.finalVenue });
      } else {
        legs1.push({ ...blank, id: `${tie}a`, home: worse, away: better, round: base, stage: `${KNOCKOUT_NAMES[idx]} · Ida`, tie, leg: 1 });
        legs2.push({ ...blank, id: `${tie}b`, home: better, away: worse, round: base + 1, stage: `${KNOCKOUT_NAMES[idx]} · Vuelta`, tie, leg: 2 });
      }
    });
    st.fixtures.push(...legs1, ...legs2);
  }
}
