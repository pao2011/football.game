import { getTeam, TEAMS } from '../data/teams';
import { loadJSON, removeKey, saveJSON } from '../save/Storage';
import { Rng } from '../util/math';
import { computeStandings, quickSim, roundRobin, winnerOf, type Fixture, type StandingRow } from './Competition';
import { applyAfterMatch, emptyAvailability, fixLineup, type AvailabilityState, type Discipline } from './Availability';

/**
 * Copa Élite: 8 equipos, dos grupos de 4 (todos contra todos), semifinales cruzadas y final.
 * Las eliminatorias se resuelven con prórroga y penales.
 */
export interface TournamentState {
  version: 1;
  userTeam: string;
  groups: { A: string[]; B: string[] };
  fixtures: Fixture[];
  seed: number;
  champion: string | null;
  eliminated: boolean;
  /** Lesionados, sancionados y amarillas acumuladas del equipo del usuario. */
  availability?: AvailabilityState;
}

const KEY = 'tournament';

export class Tournament {
  constructor(public state: TournamentState) {}

  static create(userTeam: string, seed = Date.now() % 100000): Tournament {
    const rng = new Rng(seed);
    // 8 equipos: el del usuario y otros 7 (con equipos propios del editor puede haber más de 8 en total)
    const others = TEAMS.map((t) => t.id).filter((id) => id !== userTeam).sort(() => rng.next() - 0.5).slice(0, 7);
    const ids = [userTeam, ...others].sort(() => rng.next() - 0.5);
    const A = ids.slice(0, 4);
    const B = ids.slice(4, 8);
    // el usuario siempre está en el grupo A para simplificar la lectura
    if (!A.includes(userTeam)) {
      const bi = B.indexOf(userTeam);
      [A[0], B[bi]] = [B[bi], A[0]];
    }
    const fixtures = [
      ...roundRobin(A, false, (r) => `Grupo A · Fecha ${r}`, 'A'),
      ...roundRobin(B, false, (r) => `Grupo B · Fecha ${r}`, 'B'),
    ];
    const t = new Tournament({ version: 1, userTeam, groups: { A, B }, fixtures, seed, champion: null, eliminated: false });
    t.save();
    return t;
  }

  static load(): Tournament | null {
    const s = loadJSON<TournamentState | null>(KEY, null);
    if (!s || s.version !== 1) return null;
    return new Tournament(s);
  }

  save() {
    saveJSON(KEY, this.state);
  }

  static clear() {
    removeKey(KEY);
  }

  standings(group: 'A' | 'B'): StandingRow[] {
    const ids = this.state.groups[group];
    return computeStandings(ids, this.state.fixtures.filter((f) => ids.includes(f.home)));
  }

  /** Próximo partido del usuario (o null si terminó). */
  nextUserFixture(): Fixture | null {
    return this.state.fixtures.find((f) => !f.played && (f.home === this.state.userTeam || f.away === this.state.userTeam)) ?? null;
  }

  get finished() {
    return this.state.champion !== null;
  }

  /** Registra el resultado del partido del usuario y simula el resto de la ronda. */
  /** Alineación del usuario para el próximo partido (sin lesionados ni sancionados). */
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
    f.pens = pens;
    this.simulateRound(f.round, f.knockout);
    this.advance();
    this.save();
    return msgs;
  }

  private simulateRound(round: number, knockout: boolean) {
    const rng = new Rng(this.state.seed + round * 31 + (knockout ? 999 : 0));
    for (const f of this.state.fixtures) {
      if (f.played || f.round !== round || f.knockout !== knockout) continue;
      const r = quickSim(getTeam(f.home), getTeam(f.away), rng, f.knockout);
      f.played = true;
      f.homeGoals = r.h;
      f.awayGoals = r.a;
      f.pens = r.pens;
    }
  }

  /** Avanza automáticamente: genera semifinales/final cuando terminan las rondas previas. */
  private advance() {
    const fx = this.state.fixtures;
    const groupDone = fx.filter((f) => !f.knockout).every((f) => f.played);
    const semis = fx.filter((f) => f.stage === 'Semifinal');
    if (groupDone && semis.length === 0) {
      const a = this.standings('A');
      const b = this.standings('B');
      fx.push(
        { id: 'SF1', home: a[0].team, away: b[1].team, round: 10, stage: 'Semifinal', played: false, homeGoals: 0, awayGoals: 0, knockout: true },
        { id: 'SF2', home: b[0].team, away: a[1].team, round: 10, stage: 'Semifinal', played: false, homeGoals: 0, awayGoals: 0, knockout: true },
      );
      const u = this.state.userTeam;
      if (![a[0].team, a[1].team, b[0].team, b[1].team].includes(u)) {
        this.state.eliminated = true;
      }
    }
    const semis2 = fx.filter((f) => f.stage === 'Semifinal');
    if (semis2.length === 2 && semis2.every((f) => f.played) && !fx.some((f) => f.stage === 'Final')) {
      const w1 = winnerOf(semis2[0])!;
      const w2 = winnerOf(semis2[1])!;
      fx.push({ id: 'F', home: w1, away: w2, round: 11, stage: 'Final', played: false, homeGoals: 0, awayGoals: 0, knockout: true });
      if (![w1, w2].includes(this.state.userTeam)) this.state.eliminated = true;
    }
    const final = fx.find((f) => f.stage === 'Final');
    if (final && final.played) this.state.champion = winnerOf(final);
    // Si el usuario quedó eliminado, se simula el resto automáticamente
    if (this.state.eliminated && !this.state.champion) {
      for (const r of [10, 11]) {
        const pending = fx.filter((f) => f.round === r && !f.played);
        if (pending.length) {
          this.simulateRound(r, true);
          this.advance();
          return;
        }
      }
    }
  }
}
