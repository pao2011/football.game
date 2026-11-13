import { getTeam, NATIONS } from '../data/teams';
import { NATION_CONFED, type Confed } from '../data/nations';
import { GENERIC_STADIUMS } from '../data/stadiums';
import { loadJSON, removeKey, saveJSON } from '../save/Storage';
import { Rng } from '../util/math';
import { computeStandings, quickSim, roundRobin, winnerOf, type Fixture, type StandingRow } from './Competition';

/**
 * Competiciones de selecciones: Copa del Mundo, Eurocopa, Copa América, Nations League, Finalissima, las copas
 * de cada continente y las eliminatorias de cada confederación. Todas comparten el mismo motor:
 *  - fase de grupos (todos contra todos, a una o dos ruedas) con los cupos de cada confederación,
 *  - eliminatorias a partido único en cancha neutral (prórroga y penales) hasta la final,
 *  - o, en las eliminatorias mundialistas, solo la tabla: clasifican los primeros de cada grupo.
 */
export interface NationCupDef {
  id: string;
  name: string;
  /** Resumen del formato (para la pantalla de elección). */
  blurb: string;
  group: 'Mundial' | 'Continentales' | 'Eliminatorias';
  /** Selecciones por confederación (las mejores de cada una); 'ALL' en las eliminatorias de UEFA se sortea aparte. */
  quotas: Partial<Record<Confed, number>>;
  /** Grupos y tamaño (0 grupos = partido único: Finalissima, final de Oceanía). */
  groups: number;
  size: number;
  double: boolean;
  /** Clasificados por grupo a las eliminatorias (0 = no hay eliminatorias: decide la tabla). */
  qualify: number;
  /** Mejores terceros que también pasan (Eurocopa). */
  thirds?: number;
  /** Eliminatorias mundialistas: puestos de cada grupo que clasifican al Mundial. */
  spots?: number;
  /** Se juega en sede neutral (los torneos); las eliminatorias se juegan en casa de cada selección. */
  neutral: boolean;
}

const cup = (id: string, name: string, group: NationCupDef['group'], blurb: string, quotas: NationCupDef['quotas'], groups: number, size: number, double: boolean, qualify: number, extra: Partial<NationCupDef> = {}): NationCupDef =>
  ({ id, name, group, blurb, quotas, groups, size, double, qualify, neutral: true, ...extra });

export const NATION_CUPS: NationCupDef[] = [
  cup('mundial', 'Copa del Mundo', 'Mundial', '32 selecciones · 8 grupos · octavos a final', { UEFA: 13, CONMEBOL: 5, CAF: 5, AFC: 5, CONCACAF: 3, OFC: 1 }, 8, 4, false, 2),
  cup('finalissima', 'Finalissima', 'Mundial', 'Europa contra Sudamérica · partido único', { UEFA: 1, CONMEBOL: 1 }, 0, 2, false, 0),
  cup('euro', 'Eurocopa', 'Continentales', '24 selecciones · 6 grupos · pasan los 4 mejores terceros', { UEFA: 24 }, 6, 4, false, 2, { thirds: 4 }),
  cup('nationsleague', 'UEFA Nations League', 'Continentales', 'Liga A: 4 grupos a ida y vuelta · Final Four', { UEFA: 16 }, 4, 4, true, 1),
  cup('copaamerica', 'Copa América', 'Continentales', '16 selecciones · 4 grupos · cuartos a final', { CONMEBOL: 10, CONCACAF: 6 }, 4, 4, false, 2),
  cup('copaoro', 'Copa Oro', 'Continentales', 'CONCACAF · 2 grupos · semifinales y final', { CONCACAF: 8 }, 2, 4, false, 2),
  cup('copaafrica', 'Copa Africana de Naciones', 'Continentales', 'CAF · 2 grupos · semifinales y final', { CAF: 8 }, 2, 4, false, 2),
  cup('copaasia', 'Copa Asiática', 'Continentales', 'AFC · 2 grupos · semifinales y final', { AFC: 8 }, 2, 4, false, 2),
  cup('copaoceania', 'Copa de Naciones de la OFC', 'Continentales', 'Oceanía · final a partido único', { OFC: 2 }, 0, 2, false, 0),
  cup('elim-conmebol', 'Eliminatorias CONMEBOL', 'Eliminatorias', '10 selecciones · ida y vuelta · clasifican 6', { CONMEBOL: 10 }, 1, 10, true, 0, { spots: 6, neutral: false }),
  cup('elim-uefa', 'Eliminatorias UEFA', 'Eliminatorias', 'Grupo de 5 · ida y vuelta · clasifica el primero', { UEFA: 5 }, 1, 5, true, 0, { spots: 1, neutral: false }),
  cup('elim-concacaf', 'Eliminatorias CONCACAF', 'Eliminatorias', 'Octogonal final · ida y vuelta · clasifican 3', { CONCACAF: 8 }, 1, 8, true, 0, { spots: 3, neutral: false }),
  cup('elim-caf', 'Eliminatorias CAF', 'Eliminatorias', '2 grupos de 4 · ida y vuelta · clasifica el primero', { CAF: 8 }, 2, 4, true, 0, { spots: 1, neutral: false }),
  cup('elim-afc', 'Eliminatorias AFC', 'Eliminatorias', '2 grupos de 4 · ida y vuelta · clasifican 2', { AFC: 8 }, 2, 4, true, 0, { spots: 2, neutral: false }),
  cup('elim-ofc', 'Eliminatorias OFC', 'Eliminatorias', 'Ida y vuelta · clasifica el primero', { OFC: 2 }, 1, 2, true, 0, { spots: 1, neutral: false }),
];

export const getNationCup = (id: string): NationCupDef => NATION_CUPS.find((c) => c.id === id) ?? NATION_CUPS[0];

/** Selecciones que pueden jugar una competición (las de sus confederaciones). */
export function nationCupEligible(def: NationCupDef): string[] {
  return NATIONS.filter((t) => def.quotas[NATION_CONFED[t.id]]).map((t) => t.id);
}

const KO_NAMES: Record<number, string> = { 8: 'Octavos de final', 4: 'Cuartos de final', 2: 'Semifinal', 1: 'Final' };
export const GROUP_LETTERS = 'ABCDEFGH';
/** Sedes: las canchas genéricas (grandes, sin club local). La final siempre en la primera. */
const venue = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return GENERIC_STADIUMS[h % GENERIC_STADIUMS.length].id;
};

export interface NationsState {
  version: 1;
  cup: string;
  userTeam: string;
  groups: string[][];
  fixtures: Fixture[];
  seed: number;
  champion: string | null;
  /** Terminó (hay campeón o, en las eliminatorias, se jugaron todas las fechas). */
  done: boolean;
  eliminated: boolean;
}

const KEY = 'nations';

/** Las selecciones de la competición: las mejores de cada confederación según los cupos; la del usuario siempre juega. */
export function nationCupField(def: NationCupDef, userTeam: string, rng: Rng): string[] {
  const field: string[] = [];
  for (const confed of Object.keys(def.quotas) as Confed[]) {
    const ranked = NATIONS.filter((t) => NATION_CONFED[t.id] === confed).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    let pick = ranked.slice(0, def.quotas[confed]);
    // eliminatorias de UEFA: un rival de cada bombo (no los cinco mejores de Europa)
    if (def.id === 'elim-uefa') {
      const pot = Math.floor(ranked.length / def.size);
      pick = Array.from({ length: def.size }, (_, k) => ranked[k * pot + Math.floor(rng.next() * pot)]);
    }
    if (NATION_CONFED[userTeam] === confed && !pick.some((t) => t.id === userTeam)) {
      // ocupa el lugar del más parecido en nivel (en UEFA, el de su bombo) o, si no, el del último
      const me = getTeam(userTeam);
      const idx = def.id === 'elim-uefa' ? pick.map((t) => Math.abs(t.rating - me.rating)).reduce((b, d, i, a) => (d < a[b] ? i : b), 0) : pick.length - 1;
      pick[idx] = me;
    }
    field.push(...pick.map((t) => t.id));
  }
  return field;
}

/** Orden de un cuadro sembrado: el 1.º y el 2.º solo se cruzan en la final. */
function seedOrder(n: number): number[] {
  let o = [0];
  while (o.length < n) o = o.flatMap((x) => [x, 2 * o.length - 1 - x]);
  return o;
}

export class Nations {
  constructor(public state: NationsState) {}

  static create(cupId: string, userTeam: string, seed = Date.now() % 100000): Nations {
    const def = getNationCup(cupId);
    const rng = new Rng(seed);
    const field = nationCupField(def, userTeam, rng).sort((a, b) => getTeam(b).rating - getTeam(a).rating);
    let groups: string[][] = [];
    let fixtures: Fixture[] = [];
    if (def.groups === 0) {
      groups = [field];
      fixtures = [{ id: 'K1-0', home: field[0], away: field[1], round: 1, stage: 'Final', played: false, homeGoals: 0, awayGoals: 0, knockout: true }];
    } else {
      // bombos por nivel: una selección de cada bombo por grupo
      const pots = Array.from({ length: def.size }, (_, k) => field.slice(k * def.groups, (k + 1) * def.groups).sort(() => rng.next() - 0.5));
      groups = Array.from({ length: def.groups }, (_, g) => pots.map((p) => p[g]).filter(Boolean));
      const gi = groups.findIndex((g) => g.includes(userTeam));
      if (gi > 0) [groups[0], groups[gi]] = [groups[gi], groups[0]];
      fixtures = groups.flatMap((g, i) => roundRobin(g, def.double, (r) => (def.groups > 1 ? `Grupo ${GROUP_LETTERS[i]} · Fecha ${r}` : `Fecha ${r}`), `G${i}`));
    }
    const n = new Nations({ version: 1, cup: def.id, userTeam, groups, fixtures, seed, champion: null, done: false, eliminated: false });
    n.setVenues();
    n.save();
    return n;
  }

  static load(): Nations | null {
    const s = loadJSON<NationsState | null>(KEY, null);
    if (!s || s.version !== 1 || !NATION_CUPS.some((c) => c.id === s.cup)) return null;
    return new Nations(s);
  }

  static clear() {
    removeKey(KEY);
  }

  save() {
    saveJSON(KEY, this.state);
  }

  get def(): NationCupDef {
    return getNationCup(this.state.cup);
  }

  /** Torneos: sedes neutrales (la final, en la principal). Eliminatorias: cada selección juega en su cancha. */
  private setVenues() {
    for (const f of this.state.fixtures) {
      if (f.venue) continue;
      f.venue = !this.def.neutral ? venue(f.home) : f.stage === 'Final' ? GENERIC_STADIUMS[0].id : venue(this.state.cup + f.id);
    }
  }

  standings(group: number): StandingRow[] {
    const ids = this.state.groups[group];
    return computeStandings(ids, this.state.fixtures.filter((f) => !f.knockout && ids.includes(f.home)));
  }

  get userGroup(): number {
    return Math.max(0, this.state.groups.findIndex((g) => g.includes(this.state.userTeam)));
  }

  /** Eliminatorias mundialistas terminadas: ¿clasificó la selección del usuario? */
  get userQualified(): boolean {
    const pos = this.standings(this.userGroup).findIndex((r) => r.team === this.state.userTeam);
    return this.state.done && pos >= 0 && pos < (this.def.spots ?? 0);
  }

  nextUserFixture(): Fixture | null {
    return this.state.fixtures.find((f) => !f.played && (f.home === this.state.userTeam || f.away === this.state.userTeam)) ?? null;
  }

  recordUserResult(fx: Fixture, homeGoals: number, awayGoals: number, pens?: [number, number]) {
    const f = this.state.fixtures.find((x) => x.id === fx.id)!;
    f.played = true;
    f.homeGoals = homeGoals;
    f.awayGoals = awayGoals;
    if (f.knockout && homeGoals === awayGoals) f.pens = pens && pens[0] !== pens[1] ? pens : [5, 4];
    this.simulateRound(f.round);
    this.advance();
    if (!this.state.done && !this.nextUserFixture()) this.simulateAll();
    this.save();
  }

  simulateUserFixture() {
    const f = this.nextUserFixture();
    if (!f) return;
    const r = quickSim(getTeam(f.home), getTeam(f.away), new Rng(this.state.seed + f.round * 17 + 5), f.knockout);
    this.recordUserResult(f, r.h, r.a, r.pens);
  }

  /** Simula todo hasta el próximo partido del usuario (o hasta el final). */
  simulateAll() {
    let guard = 0;
    while (!this.state.done && !this.nextUserFixture() && guard++ < 60) {
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

  /** Clasificados a las eliminatorias, ya emparejados. */
  private firstTies(): [string, string][] {
    const def = this.def;
    const tables = this.state.groups.map((_, i) => this.standings(i));
    if (def.qualify === 2 && !def.thirds) {
      // cruzados: 1.º A - 2.º B, 1.º C - 2.º D… y por el otro lado 1.º B - 2.º A, 1.º D - 2.º C…
      const first = tables.map((t) => t[0].team);
      const second = tables.map((t) => t[1].team);
      const a: [string, string][] = [];
      const b: [string, string][] = [];
      for (let g = 0; g < tables.length; g += 2) {
        a.push([first[g], second[g + 1]]);
        b.push([first[g + 1], second[g]]);
      }
      return [...a, ...b];
    }
    // cuadro sembrado: primeros, segundos y mejores terceros ordenados por puntos y diferencia de gol
    const byForm = (x: StandingRow, y: StandingRow) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.localeCompare(y.team);
    const ranked: string[] = [];
    for (let p = 0; p < def.qualify; p++) ranked.push(...tables.map((t) => t[p]).sort(byForm).map((r) => r.team));
    if (def.thirds) ranked.push(...tables.map((t) => t[def.qualify]).sort(byForm).slice(0, def.thirds).map((r) => r.team));
    const order = seedOrder(ranked.length);
    const ties: [string, string][] = [];
    for (let i = 0; i < order.length; i += 2) ties.push([ranked[order[i]], ranked[order[i + 1]]]);
    return ties;
  }

  /** Genera cada ronda eliminatoria cuando termina la anterior; cierra la competición al terminar. */
  private advance() {
    const st = this.state;
    const def = this.def;
    for (let guard = 0; guard < 6 && !st.done; guard++) {
      if (st.fixtures.some((f) => !f.played)) break;
      const ko = st.fixtures.filter((f) => f.knockout);
      let ties: [string, string][];
      if (!ko.length) {
        if (def.qualify === 0) {
          // eliminatorias mundialistas: decide la tabla
          st.done = true;
          const pos = this.standings(this.userGroup).findIndex((r) => r.team === st.userTeam);
          st.eliminated = pos >= (def.spots ?? 0);
          break;
        }
        ties = this.firstTies();
      } else {
        const last = Math.max(...ko.map((f) => f.round));
        const winners = ko.filter((f) => f.round === last).map((f) => winnerOf(f)!);
        if (winners.length === 1) {
          st.champion = winners[0];
          st.done = true;
          break;
        }
        ties = [];
        for (let i = 0; i < winners.length; i += 2) ties.push([winners[i], winners[i + 1]]);
      }
      const round = Math.max(...st.fixtures.map((f) => f.round)) + 1;
      const stage = KO_NAMES[ties.length] ?? `Ronda de ${ties.length * 2}`;
      ties.forEach(([home, away], i) => st.fixtures.push({ id: `K${round}-${i}`, home, away, round, stage, played: false, homeGoals: 0, awayGoals: 0, knockout: true }));
      this.setVenues();
      if (!ties.some(([a, b]) => a === st.userTeam || b === st.userTeam)) st.eliminated = true;
    }
  }
}
