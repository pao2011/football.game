import { LEAGUES, leagueOfTeam } from '../data/leagues';
import { getTeam, TEAMS } from '../data/teams';
import { loadJSON, removeKey, saveJSON } from '../save/Storage';
import { Rng } from '../util/math';
import { computeStandings, quickSim, roundRobin, winnerOf, type Fixture, type StandingRow } from './Competition';
import { applyAfterMatch, emptyAvailability, fixLineup, type AvailabilityState, type Discipline } from './Availability';

/**
 * Copas internacionales de clubes con los equipos de las ligas del juego (con cupos por país):
 *  - CONMEBOL Libertadores y Sudamericana: 32 clubes, 8 grupos de 4 a ida y vuelta.
 *  - UEFA Champions League, Europa League y Conference League: 36 clubes en una fase de liga de 8 partidos
 *    (los 8 primeros pasan a octavos, del 9.º al 24.º juegan el play-off).
 * Después, las eliminatorias son a ida y vuelta (define el global, con prórroga y penales) y la final es un solo
 * partido en cancha neutral. Si el usuario queda eliminado o espera su próxima ronda, el resto se simula.
 */
export type CupId = 'libertadores' | 'sudamericana' | 'champions' | 'europa' | 'conference';

export interface CupDef {
  id: CupId;
  name: string;
  confed: 'CONMEBOL' | 'UEFA';
  /** 'groups': 8 grupos de 4 · 'league': fase de liga única de 36 clubes. */
  format: 'groups' | 'league';
  size: 32 | 36;
  /** Cupos por liga (id de data/leagues.ts): los mejores de cada liga, después de los que toman las copas anteriores. */
  quotas: Record<string, number>;
  /** Cupos que ya toman las copas superiores de la misma confederación (se saltean). */
  skip: Record<string, number>;
  /** Estadio de la final. */
  finalVenue: string;
}

const LIB_QUOTAS: Record<string, number> = { brasil: 6, lpf: 6, colombia: 3, chile: 3, ecuador: 3, paraguay: 3, uruguay: 3, peru: 2, bolivia: 2, venezuela: 1 };
const SUD_QUOTAS: Record<string, number> = { brasil: 6, lpf: 6, colombia: 3, chile: 2, ecuador: 2, paraguay: 2, uruguay: 3, peru: 3, bolivia: 3, venezuela: 2 };
const UCL_QUOTAS: Record<string, number> = { eng: 5, esp: 5, ita: 5, ger: 5, fra: 4, por: 3, ned: 3, bel: 2, tur: 2, sco: 2 };
const UEL_QUOTAS: Record<string, number> = { eng: 5, esp: 4, ita: 4, ger: 4, fra: 4, por: 3, ned: 3, bel: 3, tur: 3, sco: 3 };
const UECL_QUOTAS: Record<string, number> = { eng: 2, esp: 3, ita: 3, ger: 3, fra: 3, por: 4, ned: 4, bel: 4, tur: 5, sco: 5 };
const sum = (a: Record<string, number>, b: Record<string, number>) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)]));

export const CUPS: Record<CupId, CupDef> = {
  libertadores: { id: 'libertadores', name: 'CONMEBOL Libertadores', confed: 'CONMEBOL', format: 'groups', size: 32, quotas: LIB_QUOTAS, skip: {}, finalVenue: 'centenario' },
  sudamericana: { id: 'sudamericana', name: 'CONMEBOL Sudamericana', confed: 'CONMEBOL', format: 'groups', size: 32, quotas: SUD_QUOTAS, skip: LIB_QUOTAS, finalVenue: 'defensores-chaco' },
  champions: { id: 'champions', name: 'UEFA Champions League', confed: 'UEFA', format: 'league', size: 36, quotas: UCL_QUOTAS, skip: {}, finalVenue: 'puskas-arena' },
  europa: { id: 'europa', name: 'UEFA Europa League', confed: 'UEFA', format: 'league', size: 36, quotas: UEL_QUOTAS, skip: UCL_QUOTAS, finalVenue: 'besiktas-park' },
  conference: { id: 'conference', name: 'UEFA Conference League', confed: 'UEFA', format: 'league', size: 36, quotas: UECL_QUOTAS, skip: sum(UCL_QUOTAS, UEL_QUOTAS), finalVenue: 'leipzig-arena' },
};

/** Rondas eliminatorias de cada formato. */
const STAGES: Record<CupDef['format'], string[]> = {
  groups: ['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final'],
  league: ['Play-off', 'Octavos de final', 'Cuartos de final', 'Semifinal', 'Final'],
};
export const KNOCKOUT_NAMES = STAGES.groups;
/** Partidos de la fase inicial (rondas 1 a N). */
const INITIAL_ROUNDS: Record<CupDef['format'], number> = { groups: 6, league: 8 };
const GROUP_LETTERS = 'ABCDEFGH';

export interface ContinentalState {
  version: 2;
  cup: CupId;
  userTeam: string;
  /** Grupos (8 de 4) o, en la fase de liga, un solo arreglo con los 36 clubes. */
  groups: string[][];
  fixtures: Fixture[];
  seed: number;
  champion: string | null;
  eliminated: boolean;
  availability?: AvailabilityState;
}

const KEY = 'continental';

/** Los clubes de la copa: los mejores de cada liga según sus cupos (las copas siguientes toman a los que van después). */
export function cupField(cup: CupId, userTeam: string): string[] {
  const def = CUPS[cup];
  const field: string[] = [];
  for (const l of LEAGUES) {
    if (!def.quotas[l.id]) continue;
    const ranked = l.teamIds().map((id) => getTeam(id)).filter((t, i, a) => t && a.findIndex((x) => x.id === t.id) === i).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    const skip = def.skip[l.id] ?? 0;
    field.push(...ranked.slice(skip, skip + def.quotas[l.id]).map((t) => t.id));
  }
  // el equipo del usuario siempre juega: ocupa el lugar del peor clasificado
  if (!field.includes(userTeam)) {
    const worst = field.map((id) => getTeam(id)).sort((a, b) => a.rating - b.rating)[0];
    if (worst) field[field.indexOf(worst.id)] = userTeam;
  }
  return field;
}

/** Equipos que pueden jugar una copa (los de las ligas con cupo en ella). */
export function cupEligibleTeams(cup: CupId): string[] {
  const q = CUPS[cup].quotas;
  return LEAGUES.filter((l) => q[l.id]).flatMap((l) => l.teamIds()).filter((id) => TEAMS.some((t) => t.id === id));
}

/** Fase de liga de 36 clubes: cada uno juega 8 partidos (4 de local y 4 de visitante) contra rivales de todos los bombos. */
function leaguePhase(ids: string[]): Fixture[] {
  const n = ids.length;
  const out: Fixture[] = [];
  [5, 9, 13, 17].forEach((k, j) => {
    // offsets impares: en la fecha 2j+1 reciben los pares y en la 2j+2 los impares: todos juegan una vez por fecha
    for (let i = 0; i < n; i++) {
      const round = 2 * j + 1 + (i % 2);
      out.push({ id: `L${round}-${i}`, home: ids[i], away: ids[(i + k) % n], round, stage: `Fase de liga · Fecha ${round}`, played: false, homeGoals: 0, awayGoals: 0, knockout: false });
    }
  });
  return out.sort((a, b) => a.round - b.round);
}

export class Continental {
  constructor(public state: ContinentalState) {}

  static create(cup: CupId, userTeam: string, seed = Date.now() % 100000): Continental {
    const rng = new Rng(seed);
    const def = CUPS[cup];
    const field = cupField(cup, userTeam).sort((a, b) => getTeam(b).rating - getTeam(a).rating);
    let groups: string[][];
    let fixtures: Fixture[];
    if (def.format === 'league') {
      groups = [field];
      fixtures = leaguePhase(field);
    } else {
      const country = (id: string) => leagueOfTeam(id)?.country ?? id;
      // cuatro bombos de ocho: un club de cada bombo por grupo, sin repetir país si se puede
      const pots = [0, 1, 2, 3].map((k) => field.slice(k * 8, k * 8 + 8));
      groups = [];
      for (let attempt = 0; attempt < 300; attempt++) {
        const ps = pots.map((p) => p.slice().sort(() => rng.next() - 0.5));
        groups = [0, 1, 2, 3, 4, 5, 6, 7].map((g) => ps.map((p) => p[g]));
        if (groups.every((g) => new Set(g.map(country)).size === g.length)) break;
      }
      // el usuario siempre en el grupo A (más fácil de leer)
      const gi = groups.findIndex((g) => g.includes(userTeam));
      if (gi > 0) [groups[0], groups[gi]] = [groups[gi], groups[0]];
      fixtures = groups.flatMap((g, i) => roundRobin(g, true, (r) => `Grupo ${GROUP_LETTERS[i]} · Fecha ${r}`, `G${i}`));
    }
    const c = new Continental({ version: 2, cup, userTeam, groups, fixtures, seed, champion: null, eliminated: false });
    c.save();
    return c;
  }

  static load(): Continental | null {
    const s = loadJSON<ContinentalState | null>(KEY, null);
    if (!s || s.version !== 2) return null;
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
    return Math.max(0, this.state.groups.findIndex((g) => g.includes(this.state.userTeam)));
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
    // eliminado o esperando la próxima ronda (p. ej. entre los 8 primeros de la fase de liga): se simula hasta su próximo partido
    if (!this.state.champion && !this.nextUserFixture()) this.simulateAll();
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

  /** Simula todo hasta el próximo partido del usuario (o hasta el campeón). */
  simulateAll() {
    let guard = 0;
    while (!this.state.champion && !this.nextUserFixture() && guard++ < 40) {
      const f = this.state.fixtures.find((x) => !x.played);
      if (!f) break;
      this.simulateRound(f.round);
      this.advance();
    }
    this.save();
  }

  /** Simula un partido sin jugar: la fase inicial y las idas pueden empatar; la vuelta y la final se definen por penales. */
  private simFixture(f: Fixture, rng: Rng) {
    const r = quickSim(getTeam(f.home), getTeam(f.away), rng, f.knockout && f.leg === undefined);
    f.played = true;
    f.homeGoals = r.h;
    f.awayGoals = r.a;
    f.pens = r.pens;
    if (f.leg === 2) {
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

  /** Posición en la fase inicial de cada club (0 = el mejor), para sembrar las llaves y decidir quién cierra en casa. */
  private ranks(): Map<string, number> {
    const rank = new Map<string, number>();
    const all = this.state.groups.map((_, i) => this.standings(i));
    if (this.def.format === 'league') all[0].forEach((r, i) => rank.set(r.team, i));
    else all.flat().sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf).forEach((r, i) => rank.set(r.team, i));
    return rank;
  }

  /** Genera cada ronda eliminatoria cuando termina la anterior. */
  private advance() {
    const st = this.state;
    const fmt = this.def.format;
    const stages = STAGES[fmt];
    for (let guard = 0; guard < 8; guard++) {
      const fx = st.fixtures;
      if (fx.some((f) => !f.played)) break;
      const ko = fx.filter((f) => f.knockout);
      let ties: [string, string][];
      let idx: number;
      if (!ko.length) {
        idx = 0;
        if (fmt === 'league') {
          // 9.º vs 24.º, 10.º vs 23.º… (los 8 primeros esperan en octavos)
          const order = this.standings(0).map((r) => r.team);
          ties = Array.from({ length: 8 }, (_, i) => [order[8 + i], order[23 - i]] as [string, string]);
        } else {
          const tables = st.groups.map((_, i) => this.standings(i));
          const first = tables.map((t) => t[0].team);
          const second = tables.map((t) => t[1].team);
          ties = ([[0, 1], [2, 3], [4, 5], [6, 7], [1, 0], [3, 2], [5, 4], [7, 6]] as [number, number][]).map(([a, b]) => [first[a], second[b]] as [string, string]);
        }
      } else {
        const last = Math.max(...ko.map((f) => f.round));
        // los partidos que cierran cada llave (la vuelta, o la final), en el orden de la llave
        const closing = ko.filter((f) => f.round === last);
        const winners = closing.map((f) => this.tieWinner(f));
        if (winners.length === 1 && closing[0].leg !== 2) {
          st.champion = winners[0];
          break;
        }
        idx = stages.indexOf(closing[0].stage.replace(/ · .*$/, '')) + 1;
        ties = [];
        if (fmt === 'league' && idx === 1) {
          // octavos: el 1.º contra el ganador del play-off 16.º-17.º, el 2.º contra el 15.º-18.º…
          const order = this.standings(0).map((r) => r.team);
          for (let s = 0; s < 8; s++) ties.push([order[s], winners[7 - s]]);
        } else if (fmt === 'league' && idx === 2) {
          // cuartos: 1.º-8.º por arriba y 2.º-7.º por abajo (cuadro sembrado)
          for (const [a, b] of [[0, 3], [1, 2], [4, 7], [5, 6]]) ties.push([winners[a], winners[b]]);
        } else {
          for (let i = 0; i < winners.length; i += 2) ties.push([winners[i], winners[i + 1]]);
        }
      }
      this.addRound(idx, ties);
      const inRound = ties.some(([a, b]) => a === st.userTeam || b === st.userTeam);
      // eliminado: no está en esta ronda y tampoco espera en octavos (los 8 primeros de la fase de liga)
      const waiting = fmt === 'league' && idx === 0 && (this.ranks().get(st.userTeam) ?? 99) < 8;
      if (!inRound && !waiting) st.eliminated = true;
    }
  }

  /** Agrega una ronda eliminatoria: ida y vuelta (el mejor ubicado cierra en su casa) o, en la final, un solo partido neutral. */
  private addRound(idx: number, ties: [string, string][]) {
    const st = this.state;
    const fmt = this.def.format;
    const isFinal = idx === STAGES[fmt].length - 1;
    const rank = this.ranks();
    const name = STAGES[fmt][idx];
    const base = INITIAL_ROUNDS[fmt] + 1 + idx * 2;
    const legs1: Fixture[] = [];
    const legs2: Fixture[] = [];
    ties.forEach(([x, y], i) => {
      // x es el mejor sembrado de la llave salvo que y le gane en la tabla de la fase inicial
      let better = x;
      let worse = y;
      if ((rank.get(y) ?? 99) < (rank.get(x) ?? 99)) { better = y; worse = x; }
      const tie = `K${idx}-${i}`;
      const blank = { played: false, homeGoals: 0, awayGoals: 0, knockout: true };
      if (isFinal) {
        st.fixtures.push({ ...blank, id: tie, home: x, away: y, round: base, stage: 'Final · cancha neutral', venue: this.def.finalVenue });
      } else {
        legs1.push({ ...blank, id: `${tie}a`, home: worse, away: better, round: base, stage: `${name} · Ida`, tie, leg: 1 });
        legs2.push({ ...blank, id: `${tie}b`, home: better, away: worse, round: base + 1, stage: `${name} · Vuelta`, tie, leg: 2 });
      }
    });
    st.fixtures.push(...legs1, ...legs2);
  }
}
