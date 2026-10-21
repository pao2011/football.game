import { FORMATIONS } from '../../data/formations';
import { TEAMS, getTeam } from '../../data/teams';
import type { FormationId, TeamData } from '../../data/types';
import { loadJSON, removeKey, saveJSON } from '../../save/Storage';
import { catalog, getCardDef } from './catalog';
import { BATTLES, CHAMPIONS, TOURNAMENT_ENTRY, TOURNAMENT_ROUNDS, championsReward, championsTarget, checkSbc, pickOpponent, rivalsDivision, rivalsTarget, rivalsWeeklyReward, RIVALS_POINTS, RIVALS_WEEKLY_MIN_MATCHES, SBCS, sbcKey, tournamentOpponents, tournamentReward, tournamentRuleOf, type SbcDef } from './competitions';
import { addTx, ECONOMY, matchReward, nextId, reconcile } from './economy';
import * as market from './market';
import { MAX_INVENTORY } from './market';
import { PACKS, packById, rollPack } from './packs';
import { cancelEvo, cleanEvos, progressEvos, startEvo } from './evos';
import { addSeasonPoints, addXp, claimAllPass, claimLogin, claimMilestone, claimMissionGroup, claimMissionTask, claimObjective, claimPass, currentSeason, ensurePeriods, grant, levelOf, track, unlockPremiumPass, type PassTrack, type Reward } from './progress';
import * as sq from './squads';
import type { CardDef, CardInstance, ClubIdentity, ClubState, PackOpening, Result, Role, Squad } from './types';
import { fail, ok } from './types';
import { clamp, dayId, hash32, seeded, systemRand, weekId, type Rand } from './util';

const KEY = 'club';
/** Puntos del ranking online propio del club. */
export const ONLINE_POINTS = { W: 25, D: 8, L: -12 };
const TEST_FLAG = 'football-elite-3d-club-test';

export type ClubMatchKind = 'rivals' | 'champions' | 'battle' | 'tournament' | 'friendly' | 'online';
export interface ClubMatchMeta { id: string; kind: ClubMatchKind; opp: string; battleId?: string; factor: number }
export interface MatchSummary {
  gf: number; ga: number;
  /** Quién gana si hay empate en eliminatorias (por penales): 1 = tú. */
  pensWin?: boolean;
  passes: number; passesOk: number; shots: number; tackles: number;
  halfMinutes: number;
  /** Abandonó el partido: cuenta como derrota 0-3 y no da premio. */
  forfeit?: boolean;
}
export interface MatchOutcome { result: 'W' | 'D' | 'L'; coins: number; /** Monedas por subir de nivel. */ levelCoins: number; xp: number; lines: string[]; levelUps: number[] }

function blankState(identity: ClubIdentity, formation: FormationId, now: number, rand: Rand): ClubState {
  const id = `${now.toString(36)}${Math.floor(rand() * 46656).toString(36)}`;
  const s: ClubState = {
    version: 1, id, createdAt: now, identity, coins: 0, xp: 0, inventory: [], squads: [sq.newSquad('sq1', 'Plantilla 1', formation)], activeSquad: 0,
    ledger: [], ledgerBase: 0,
    packs: { openings: [], pity: {}, promo: { promo: 2 }, nextId: 1 },
    market: { epoch: -1, listings: [], watch: [], mine: [], results: [], actionsDay: '', actions: 0 },
    progress: { loginDay: '', loginStreak: 0, loginClaimedDay: '', daily: { dayId: '', objectives: [], claimed: [] }, weekly: { weekId: '', objectives: [], claimed: [] }, season: { id: '', points: 0, claimed: [], premium: false }, missions: { progress: {}, claimed: [], groups: [] }, milestones: [], matchesToday: { dayId: '', n: 0 } },
    records: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, bestStreak: 0, streak: 0, biggestWin: 0, mostGoals: 0, packsOpened: 0, sbcDone: 0, coinsEarned: 0, coinsSpent: 0, marketBuys: 0, marketSells: 0 },
    rivals: { weekId: '', points: 0, played: 0, won: 0, claimed: false },
    champions: { weekId: '', entered: false, played: 0, wins: 0, results: [], claimed: false },
    battles: { dayId: '', done: {} },
    tournament: null, evos: [], online: { played: 0, won: 0, drawn: 0, lost: 0, points: 0 }, sbcDone: {}, processed: [], inbox: [], counter: 0,
  };
  return s;
}

/** Cartas iniciales: once titulares y siete suplentes de bronce/plata en sus puestos naturales. */
function starterCards(formation: FormationId, seed: number): string[] {
  const rand = seeded(seed);
  const byRole = new Map<Role, CardDef[]>();
  for (const d of catalog().values()) {
    if ((d.rarity === 'bronze' || d.rarity === 'silver') && d.ovr >= 56 && d.ovr <= 66) {
      if (!byRole.has(d.role)) byRole.set(d.role, []);
      byRole.get(d.role)!.push(d);
    }
  }
  const roles: Role[] = [...FORMATIONS[formation].map((s) => s.role as Role), 'POR', 'DFC', 'LI', 'MC', 'MCD', 'DC', 'EI'];
  const taken = new Set<string>();
  const out: string[] = [];
  for (const r of roles) {
    const list = (byRole.get(r) ?? []).filter((d) => !taken.has(d.id));
    const pool = list.length ? list : [...catalog().values()].filter((d) => d.rarity === 'bronze' && !taken.has(d.id));
    const d = pool[Math.floor(rand() * pool.length)];
    taken.add(d.id);
    out.push(d.id);
  }
  return out;
}

export class Club {
  constructor(public s: ClubState) {}

  // ---------- Guardado ----------
  static exists(): boolean {
    return !!loadJSON<ClubState | null>(KEY, null);
  }

  static load(now = Date.now()): Club | null {
    const raw = loadJSON<ClubState | null>(KEY, null);
    if (!raw || raw.version !== 1 || !raw.identity || !Array.isArray(raw.inventory)) return null;
    const c = new Club(Club.sanitize(raw));
    c.tick(now);
    return c;
  }

  /** Valida lo guardado: repara listas, quita cartas desconocidas o repetidas y corrige el saldo con el libro contable. */
  static sanitize(raw: ClubState): ClubState {
    const s = raw;
    const base = blankState(s.identity, '4-3-3', s.createdAt ?? Date.now(), () => 0.5);
    s.records = { ...base.records, ...(s.records ?? {}) };
    s.packs = { ...base.packs, ...(s.packs ?? {}), pity: s.packs?.pity ?? {}, promo: s.packs?.promo ?? {}, openings: s.packs?.openings ?? [] };
    s.market = { ...base.market, ...(s.market ?? {}) };
    s.progress = { ...base.progress, ...(s.progress ?? {}) };
    s.progress.missions = { ...base.progress.missions, ...(s.progress.missions ?? {}) };
    s.online = { ...base.online, ...(s.online ?? {}) };
    s.evos = Array.isArray(s.evos) ? s.evos : [];
    s.rivals = { ...base.rivals, ...(s.rivals ?? {}) };
    s.champions = { ...base.champions, ...(s.champions ?? {}) };
    s.battles = { ...base.battles, ...(s.battles ?? {}) };
    s.sbcDone = s.sbcDone ?? {};
    s.processed = s.processed ?? [];
    s.inbox = s.inbox ?? [];
    s.ledger = Array.isArray(s.ledger) ? s.ledger : [];
    s.ledgerBase = s.ledgerBase ?? 0;
    const seen = new Set<string>();
    s.inventory = s.inventory.filter((c) => c && typeof c.uid === 'string' && !seen.has(c.uid) && (seen.add(c.uid), !!getCardDef(c.defId)));
    s.market.mine = (s.market.mine ?? []).filter((m) => m && m.card && getCardDef(m.card.defId));
    s.coins = Math.max(0, Math.floor(Number(s.coins) || 0));
    s.xp = Math.max(0, Math.floor(Number(s.xp) || 0));
    reconcile(s);
    cleanEvos(s);
    if (!Array.isArray(s.squads) || !s.squads.length) s.squads = [sq.newSquad('sq1', 'Plantilla 1', '4-3-3')];
    for (const q of s.squads) sq.validateSquad(s, q);
    s.activeSquad = clamp(s.activeSquad | 0, 0, s.squads.length - 1);
    return s;
  }

  save() {
    saveJSON(KEY, this.s);
  }

  static clear() {
    removeKey(KEY);
  }

  /** Crea un club nuevo con plantilla inicial, monedas y dos sobres promocionales de bienvenida. */
  static create(identity: ClubIdentity, formation: FormationId, now = Date.now(), rand: Rand = systemRand): Result<Club> {
    const name = identity.name.trim().replace(/\s+/g, ' ');
    if (name.length < 3 || name.length > 24) return fail('El nombre del club debe tener entre 3 y 24 caracteres.');
    if (!/^#[0-9a-fA-F]{6}$/.test(identity.primary) || !/^#[0-9a-fA-F]{6}$/.test(identity.secondary)) return fail('Colores no válidos.');
    const s = blankState({ ...identity, name }, formation, now, rand);
    addTx(s, 'start', ECONOMY.startCoins, 'Monedas iniciales', now);
    for (const defId of starterCards(formation, hash32(name + now))) s.inventory.push({ uid: nextId(s, 'c'), defId, acquired: now, source: 'starter' });
    const q = s.squads[0];
    sq.autoBuild(s, q);
    q.captain = q.slots[9] ?? null;
    q.penaltyTaker = q.slots[10] ?? null;
    q.freeKickTaker = q.slots[8] ?? null;
    const c = new Club(s);
    c.tick(now);
    c.save();
    return ok(c);
  }

  /** Marca el club como de pruebas (datos que no son reales). */
  get isTest() { return typeof localStorage !== 'undefined' && localStorage.getItem(TEST_FLAG) === '1'; }

  // ---------- Tiempo ----------
  /** Actualiza todo lo que depende de la fecha: objetivos, temporada, mercado y competiciones semanales. */
  tick(now: number) {
    const s = this.s;
    ensurePeriods(s, now);
    this.rolloverCompetitions(now);
    market.refreshMarket(s, now, currentSeason(now).id);
    reconcile(s);
    cleanEvos(s);
    this.save();
  }

  private notify(text: string, now: number) {
    this.s.inbox.unshift({ at: now, text });
    if (this.s.inbox.length > 30) this.s.inbox.length = 30;
  }

  private rolloverCompetitions(now: number) {
    const s = this.s;
    const wk = weekId(now);
    const day = dayId(now);
    if (s.rivals.weekId !== wk) {
      if (s.rivals.weekId && !s.rivals.claimed && s.rivals.played >= RIVALS_WEEKLY_MIN_MATCHES) {
        const r = rivalsWeeklyReward(rivalsDivision(s.rivals.points));
        grant(s, r, 'Recompensa semanal de Rivals', now);
        this.notify('Recompensa semanal de Rivals acreditada.', now);
      }
      s.rivals = { weekId: wk, points: Math.floor(s.rivals.points * 0.85), played: 0, won: 0, claimed: false };
    }
    if (s.champions.weekId !== wk) {
      if (s.champions.weekId && s.champions.entered && !s.champions.claimed) {
        grant(s, championsReward(s.champions.wins), 'Recompensa de Champions', now);
        this.notify(`Champions terminó: ${s.champions.wins} victorias. Recompensa acreditada.`, now);
      }
      s.champions = { weekId: wk, entered: false, played: 0, wins: 0, results: [], claimed: false };
    }
    if (s.tournament && s.tournament.weekId !== wk) {
      const t = s.tournament;
      if (!t.claimed) {
        const won = t.finished && t.alive && t.round >= TOURNAMENT_ROUNDS.length;
        grant(s, tournamentReward(won ? 2 : t.round, won), 'Recompensa de torneo', now);
        this.notify('El torneo terminó: recompensa acreditada.', now);
      }
      s.tournament = null;
    }
    if (s.battles.dayId !== day) s.battles = { dayId: day, done: {} };
  }

  // ---------- Consultas ----------
  def(uid: string | null): CardDef | null { return sq.defOfUid(this.s, uid); }
  get squad(): Squad { return this.s.squads[this.s.activeSquad]; }
  card(uid: string): CardInstance | undefined { return this.s.inventory.find((c) => c.uid === uid); }
  ownedCounts(): Map<string, number> {
    const m = new Map<string, number>();
    for (const c of this.s.inventory) m.set(c.defId, (m.get(c.defId) ?? 0) + 1);
    for (const o of this.s.packs.openings) for (const c of o.cards) if (!c.decided) m.set(c.defId, (m.get(c.defId) ?? 0) + 1);
    return m;
  }
  evalSquad(q: Squad = this.squad) { return sq.evalSquad(this.s, q); }
  get promoPacks(): Record<string, number> { return this.s.packs.promo; }

  // ---------- Sobres ----------
  /** Compra (o abre uno gratis de la reserva) un sobre. Las cartas quedan pendientes hasta decidir qué hacer con cada una. */
  openPack(packId: string, free: boolean, now: number, rand: Rand = systemRand): Result<PackOpening> {
    const s = this.s;
    const pack = packById(packId);
    if (!pack) return fail('Ese sobre no existe.');
    const pending = s.packs.openings.reduce((t, o) => t + o.cards.filter((c) => !c.decided).length, 0);
    if (s.inventory.length + pending + pack.cards > MAX_INVENTORY) return fail(`Tu club no tiene sitio: máximo ${MAX_INVENTORY} cartas. Vende o descarta algunas.`);
    if (free) {
      if ((s.packs.promo[packId] ?? 0) <= 0) return fail('No tienes sobres gratis de ese tipo.');
    } else {
      if (!pack.buyable) return fail('Ese sobre no se puede comprar: solo se consigue como recompensa.');
      if (s.coins - market.heldCoins(s) < pack.price) return fail('No tienes monedas suficientes.');
    }
    const roll = rollPack({ pack, season: currentSeason(now).id, rand, owned: this.ownedCounts(), pity: s.packs.pity[packId] ?? 0, now });
    if (free) s.packs.promo[packId]--;
    else { const tx = addTx(s, 'pack', -pack.price, pack.name, now); if (!tx.ok) return tx as Result<never>; }
    s.packs.pity[packId] = roll.hadRare ? 0 : (s.packs.pity[packId] ?? 0) + 1;
    const opening: PackOpening = { id: nextId(s, 'op'), packId, at: now, cards: roll.defs.map((d) => ({ uid: nextId(s, 'c'), defId: d.id, decided: false })) };
    s.packs.openings.push(opening);
    s.records.packsOpened++;
    track(s, 'packs', 1, now);
    addSeasonPoints(s, 5, now);
    this.save();
    return ok(opening);
  }

  /** Decide el destino de una carta de un sobre: club · venta rápida · descartar. */
  decideCard(openingId: string, uid: string, action: 'club' | 'sell' | 'discard', now: number): Result<number> {
    const s = this.s;
    const op = s.packs.openings.find((o) => o.id === openingId);
    const c = op?.cards.find((x) => x.uid === uid);
    if (!op || !c) return fail('Esa carta no está pendiente.');
    if (c.decided) return fail('Ya decidiste qué hacer con esta carta.');
    const d = getCardDef(c.defId);
    if (!d) return fail('Carta desconocida.');
    let value = 0;
    if (action === 'club') {
      if (s.inventory.length >= MAX_INVENTORY) return fail(`Tu club está lleno (${MAX_INVENTORY} cartas).`);
      s.inventory.push({ uid: c.uid, defId: c.defId, acquired: now, source: `pack:${op.packId}` });
    } else if (action === 'sell') {
      value = Math.max(10, Math.round(d.price * ECONOMY.quickSell));
      addTx(s, 'quicksell', value, `Venta rápida: ${d.name}`, now, c.uid);
    }
    c.decided = true;
    if (op.cards.every((x) => x.decided)) s.packs.openings.splice(s.packs.openings.indexOf(op), 1);
    this.save();
    return ok(value);
  }

  /** Envía al club todas las cartas pendientes que quepan (atajo). */
  keepAllPending(now: number) {
    for (const o of [...this.s.packs.openings]) for (const c of o.cards) if (!c.decided) this.decideCard(o.id, c.uid, 'club', now);
  }

  // ---------- Mercado ----------
  buyNow(id: string, now: number) { const r = market.buyNow(this.s, id, now); this.save(); return r; }
  bid(id: string, amount: number, now: number) { const r = market.placeBid(this.s, id, amount, now); this.save(); return r; }
  list(uid: string, price: number, hours: 1 | 3 | 6, now: number) { const r = market.listCard(this.s, uid, price, hours, now); this.save(); return r; }
  unlist(id: string) { const r = market.unlist(this.s, id); this.save(); return r; }
  quickSell(uid: string, now: number) { const r = market.quickSell(this.s, uid, now); this.save(); return r; }
  toggleWatch(defId: string) { const r = market.toggleWatch(this.s, defId); this.save(); return r; }

  // ---------- Plantillas ----------
  private touchSquad(fn: (q: Squad) => void) { const q = this.squad; fn(q); sq.validateSquad(this.s, q); this.save(); }
  setFormation(f: FormationId) { this.touchSquad((q) => sq.changeFormation(this.s, q, f)); }
  place(uid: string, pos: sq.SquadPos): Result<void> {
    if (!this.card(uid)) return fail('Esa carta no está en tu club.');
    this.touchSquad((q) => sq.place(q, uid, pos));
    return ok(undefined);
  }
  swapPos(a: sq.SquadPos, b: sq.SquadPos) { this.touchSquad((q) => sq.swap(q, a, b)); }
  removeAt(p: sq.SquadPos) { this.touchSquad((q) => sq.remove(q, p)); }
  autoBuild() { this.touchSquad((q) => sq.autoBuild(this.s, q)); }
  setRole(kind: 'captain' | 'penaltyTaker' | 'freeKickTaker', uid: string | null): Result<void> {
    const q = this.squad;
    if (uid && !q.slots.includes(uid) && !q.bench.includes(uid)) return fail('Ese jugador no está en la plantilla.');
    this.touchSquad((x) => { x[kind] = uid; });
    return ok(undefined);
  }
  setStyle(style: Squad['style'], coach: string) { this.touchSquad((q) => { q.style = style; q.coach = coach; }); }
  renameSquad(name: string) { this.touchSquad((q) => { q.name = name.trim().slice(0, 20) || q.name; }); }
  newSquad(): Result<number> {
    if (this.s.squads.length >= sq.MAX_SQUADS) return fail(`Máximo ${sq.MAX_SQUADS} plantillas guardadas.`);
    const q = sq.newSquad(nextId(this.s, 'sq'), `Plantilla ${this.s.squads.length + 1}`, this.squad.formation);
    this.s.squads.push(q);
    this.s.activeSquad = this.s.squads.length - 1;
    sq.autoBuild(this.s, q);
    this.save();
    return ok(this.s.activeSquad);
  }
  selectSquad(i: number) { if (i >= 0 && i < this.s.squads.length) { this.s.activeSquad = i; this.save(); } }
  deleteSquad(i: number): Result<void> {
    if (this.s.squads.length <= 1) return fail('Necesitas al menos una plantilla.');
    this.s.squads.splice(i, 1);
    this.s.activeSquad = clamp(this.s.activeSquad, 0, this.s.squads.length - 1);
    this.save();
    return ok(undefined);
  }
  /** Descarta una carta (sin monedas). No se puede si está en una plantilla. */
  discard(uid: string): Result<void> {
    const i = this.s.inventory.findIndex((c) => c.uid === uid);
    if (i < 0) return fail('Esa carta no está en tu club.');
    if (market.usedInSquads(this.s, uid)) return fail('La carta está en una de tus plantillas.');
    this.s.inventory.splice(i, 1);
    this.save();
    return ok(undefined);
  }

  // ---------- Competiciones ----------
  get division() { return rivalsDivision(this.s.rivals.points); }

  /** ¿Se puede jugar? (plantilla completa) */
  private requireSquad(): Result<void> {
    if (!sq.isComplete(this.squad)) return fail('Tu plantilla titular está incompleta: coloca 11 jugadores.');
    return ok(undefined);
  }

  enterChampions(now: number): Result<void> {
    const s = this.s;
    this.tick(now);
    if (s.champions.entered) return fail('Ya estás inscrito esta semana.');
    if (this.level < CHAMPIONS.minLevel) return fail(`Champions se abre en el nivel ${CHAMPIONS.minLevel}.`);
    const q = this.requireSquad();
    if (!q.ok) return q;
    if (this.evalSquad().ovr < CHAMPIONS.minOvr) return fail(`Tu equipo necesita al menos ${CHAMPIONS.minOvr} de valoración para entrar.`);
    const tx = addTx(s, 'entry', -CHAMPIONS.entryCost, 'Inscripción a Champions', now);
    if (!tx.ok) return tx as Result<never>;
    s.champions = { weekId: weekId(now), entered: true, played: 0, wins: 0, results: [], claimed: false };
    this.save();
    return ok(undefined);
  }

  claimChampions(now: number): Result<Reward> {
    const c = this.s.champions;
    if (!c.entered) return fail('No participas en Champions.');
    if (c.claimed) return fail('Ya reclamaste la recompensa de esta semana.');
    if (c.played < CHAMPIONS.matches) return fail(`Termina los ${CHAMPIONS.matches} partidos para reclamar.`);
    c.claimed = true;
    const r = championsReward(c.wins);
    grant(this.s, r, 'Recompensa de Champions', now);
    this.save();
    return ok(r);
  }

  claimRivals(now: number): Result<Reward> {
    const r = this.s.rivals;
    if (r.claimed) return fail('Ya reclamaste la recompensa semanal de Rivals.');
    if (r.played < RIVALS_WEEKLY_MIN_MATCHES) return fail(`Juega ${RIVALS_WEEKLY_MIN_MATCHES} partidos de Rivals esta semana (llevas ${r.played}).`);
    r.claimed = true;
    const rw = rivalsWeeklyReward(this.division);
    grant(this.s, rw, 'Recompensa semanal de Rivals', now);
    this.save();
    return ok(rw);
  }

  enterTournament(now: number): Result<void> {
    const s = this.s;
    this.tick(now);
    const wk = weekId(now);
    if (s.tournament && s.tournament.weekId === wk) return fail(s.tournament.finished ? 'Ya jugaste el torneo de esta semana.' : 'Ya estás inscrito: sigue jugando.');
    const q = this.requireSquad();
    if (!q.ok) return q;
    const rule = tournamentRuleOf(wk);
    const starters = sq.squadDefs(s, this.squad).filter(Boolean) as CardDef[];
    if (!rule.ok(starters)) return fail(`Tu once no cumple el requisito: ${rule.text}.`);
    const tx = addTx(s, 'entry', -TOURNAMENT_ENTRY, `Inscripción: ${rule.name}`, now);
    if (!tx.ok) return tx as Result<never>;
    s.tournament = { id: nextId(s, 'tn'), weekId: wk, teams: tournamentOpponents(wk, this.evalSquad().ovr), round: 0, alive: true, history: [], finished: false, claimed: false };
    this.save();
    return ok(undefined);
  }

  claimTournament(now: number): Result<Reward> {
    const t = this.s.tournament;
    if (!t) return fail('No participas en ningún torneo.');
    if (t.claimed) return fail('Ya reclamaste la recompensa del torneo.');
    if (!t.finished) return fail('El torneo todavía no terminó.');
    t.claimed = true;
    const won = t.alive && t.round >= TOURNAMENT_ROUNDS.length;
    const r = tournamentReward(won ? 2 : Math.max(0, t.round), won);
    grant(this.s, r, 'Recompensa de torneo', now);
    this.save();
    return ok(r);
  }

  /** Prepara un partido: devuelve los dos equipos (el tuyo con las cartas y la química) y los datos para contabilizarlo. */
  prepareMatch(kind: ClubMatchKind, now: number, opts: { battleId?: string; oppId?: string } = {}, rand: Rand = systemRand): Result<{ home: TeamData; away: TeamData; meta: ClubMatchMeta; ovr: number; chem: number }> {
    const s = this.s;
    this.tick(now);
    const sqOk = this.requireSquad();
    if (!sqOk.ok) return sqOk as Result<never>;
    const built = sq.buildClubTeam(s, this.squad);
    const ovr = built.eval.ovr;
    let opp: TeamData;
    let factor = 1;
    const meta: ClubMatchMeta = { id: nextId(s, 'm'), kind, opp: '', factor };
    switch (kind) {
      case 'rivals': opp = pickOpponent(rivalsTarget(ovr, this.division), rand); break;
      case 'champions': {
        if (!s.champions.entered) return fail('Primero inscríbete en Champions.');
        if (s.champions.played >= CHAMPIONS.matches) return fail('Ya jugaste los 10 partidos de esta semana.');
        opp = pickOpponent(championsTarget(ovr, s.champions.played), rand);
        factor = 1.2;
        break;
      }
      case 'battle': {
        const b = BATTLES.find((x) => x.id === opts.battleId);
        if (!b) return fail('Squad Battle no encontrado.');
        if (s.battles.done[b.id]) return fail('Ya jugaste esta batalla hoy: vuelve mañana.');
        opp = pickOpponent(b.target, rand);
        meta.battleId = b.id;
        factor = b.factor;
        break;
      }
      case 'tournament': {
        const t = s.tournament;
        if (!t || !t.alive || t.finished) return fail('No tienes un torneo en juego.');
        const rule = tournamentRuleOf(t.weekId);
        if (!rule.ok(sq.squadDefs(s, this.squad).filter(Boolean) as CardDef[])) return fail(`Tu once ya no cumple el requisito: ${rule.text}.`);
        opp = getTeam(t.teams[t.round]);
        factor = 1.1;
        break;
      }
      default: {
        const t = TEAMS.find((x) => x.id === opts.oppId);
        if (!t) return fail('Elige un rival.');
        opp = t;
      }
    }
    meta.opp = opp.id;
    meta.factor = factor;
    return ok({ home: built.team, away: opp, meta, ovr, chem: built.eval.chem });
  }

  /**
   * Contabiliza un partido terminado: monedas, experiencia, récords, objetivos y el progreso del modo.
   * Cada partido solo se cuenta una vez (por su id). Los amistosos no dan nada.
   */
  finishMatch(meta: ClubMatchMeta, r: MatchSummary, now: number): MatchOutcome | null {
    const s = this.s;
    if (s.processed.includes(meta.id)) return null;
    s.processed.push(meta.id);
    if (s.processed.length > 40) s.processed.shift();
    if (r.forfeit) { r = { ...r, gf: 0, ga: Math.max(3, r.ga), passes: 0, passesOk: 0, shots: 0, tackles: 0, pensWin: undefined }; }
    const draw = r.gf === r.ga && r.pensWin === undefined;
    const result: 'W' | 'D' | 'L' = r.gf > r.ga || (r.gf === r.ga && r.pensWin === true) ? 'W' : draw ? 'D' : 'L';
    if (meta.kind === 'friendly') { this.save(); return { result, coins: 0, levelCoins: 0, xp: 0, lines: ['Amistoso: no afecta a tu progreso ni a tus récords.'], levelUps: [] }; }
    this.tick(now);
    const coinsStart = s.coins;
    const lines: string[] = [];
    const cleanSheet = r.ga === 0;
    // premio: recortado en partidos cortos y a partir de 12 partidos al día
    const lenFactor = clamp(r.halfMinutes / 4, 0.25, 1);
    s.progress.matchesToday.n++;
    const capFactor = s.progress.matchesToday.n > ECONOMY.fullRewardMatches ? ECONOMY.reducedFactor : 1;
    if (capFactor < 1) lines.push(`Ya jugaste ${ECONOMY.fullRewardMatches} partidos hoy: el premio se reduce al ${Math.round(capFactor * 100)} %.`);
    if (lenFactor < 1) lines.push(`Partes de ${r.halfMinutes} min: premio al ${Math.round(lenFactor * 100)} % (el completo es con 4 min o más).`);
    const f = lenFactor * capFactor * meta.factor;
    let coins = r.forfeit ? 0 : matchReward(result, r.gf, cleanSheet, f);
    let bonus = 0;
    const xp = r.forfeit ? 0 : Math.round(((result === 'W' ? 120 : result === 'D' ? 60 : 40) + Math.min(5, r.gf) * 4) * lenFactor * capFactor);
    const rec = s.records;
    rec.played++; rec.goalsFor += r.gf; rec.goalsAgainst += r.ga;
    if (result === 'W') { rec.won++; rec.streak++; rec.bestStreak = Math.max(rec.bestStreak, rec.streak); rec.biggestWin = Math.max(rec.biggestWin, r.gf - r.ga); } else { rec.streak = 0; if (result === 'D') rec.drawn++; else rec.lost++; }
    if (cleanSheet) rec.cleanSheets++;
    rec.mostGoals = Math.max(rec.mostGoals, r.gf);
    track(s, 'matches', 1, now);
    if (result === 'W') track(s, 'wins', 1, now);
    track(s, 'goals', r.gf, now);
    if (cleanSheet) track(s, 'cleanSheets', 1, now);
    track(s, 'passes', r.passesOk, now);
    track(s, 'shots', r.shots, now);
    track(s, 'tackles', r.tackles, now);
    addSeasonPoints(s, result === 'W' ? 10 : 4, now);
    if (!r.forfeit) {
      const q = this.squad;
      if (this.evalSquad(q).chem >= 25) track(s, 'chemMatch', 1, now);
      lines.push(...progressEvos(s, q.slots, { matches: 1, wins: result === 'W' ? 1 : 0, goals: r.gf, cleanSheets: cleanSheet ? 1 : 0 }, now));
    }
    // progreso del modo
    switch (meta.kind) {
      case 'rivals': {
        const before = this.division;
        s.rivals.points = Math.max(0, s.rivals.points + RIVALS_POINTS[result]);
        s.rivals.played++;
        if (result === 'W') s.rivals.won++;
        track(s, 'rivals', 1, now);
        lines.push(`Rivals: ${RIVALS_POINTS[result] >= 0 ? '+' : ''}${RIVALS_POINTS[result]} puntos (${s.rivals.points} en total).`);
        if (this.division < before) lines.push(`¡Subes a la División ${this.division}!`);
        break;
      }
      case 'champions': {
        const c = s.champions;
        c.played++;
        if (result === 'W') c.wins++;
        c.results.push(result);
        lines.push(`Champions: ${c.wins} victorias en ${c.played} partidos.`);
        break;
      }
      case 'battle': {
        s.battles.done[meta.battleId!] = true;
        track(s, 'squadBattles', 1, now);
        const b = BATTLES.find((x) => x.id === meta.battleId);
        if (b && result === 'W') { grant(s, b.reward, `Squad Battle: ${b.name}`, now); lines.push(`Squad Battle superada: +${(b.reward.coins ?? 0).toLocaleString('es-ES')} monedas.`); bonus = b.reward.coins ?? 0; }
        else lines.push('Squad Battle: sin victoria no hay recompensa. Mañana puedes volver a intentarlo.');
        break;
      }
      case 'online': {
        const o = s.online;
        o.played++;
        if (result === 'W') o.won++; else if (result === 'D') o.drawn++; else o.lost++;
        const pts = ONLINE_POINTS[result];
        o.points = Math.max(0, o.points + pts);
        track(s, 'onlineMatch', 1, now);
        if (result === 'W') track(s, 'onlineWin', 1, now);
        lines.push(`Online: ${pts >= 0 ? '+' : ''}${pts} puntos de club (${o.points} en total).`);
        break;
      }
      case 'tournament': {
        const t = s.tournament;
        if (t) {
          t.history.push({ round: t.round, opp: meta.opp, gf: r.gf, ga: r.ga, pens: undefined });
          if (result === 'W') { t.round++; if (t.round >= TOURNAMENT_ROUNDS.length) { t.finished = true; lines.push('¡Campeón del torneo! Reclama tu recompensa.'); } else lines.push(`Pasas a ${TOURNAMENT_ROUNDS[t.round]}.`); }
          else { t.alive = false; t.finished = true; lines.push('Quedaste eliminado. Reclama tu recompensa por llegar hasta aquí.'); }
        }
        break;
      }
    }
    if (coins > 0) addTx(s, 'match', coins, `Partido (${result}) ${r.gf}-${r.ga}`, now);
    const levelUps = addXp(s, xp, now);
    if (levelUps.length) lines.push(`¡Subes al nivel ${levelUps[levelUps.length - 1]}!`);
    if (r.forfeit) lines.unshift('Abandonaste el partido: cuenta como derrota 0-3 y no da premio.');
    const levelCoins = s.coins - coinsStart - coins - bonus; // monedas por subir de nivel (de la partida o de la recompensa de la batalla)
    this.save();
    return { result, coins: coins + bonus, levelCoins, xp, lines, levelUps };
  }

  // ---------- Desafíos de plantilla ----------
  sbcAvailable(def: SbcDef, now: number) {
    const done = this.s.sbcDone[sbcKey(def, now)] ?? 0;
    return { done, left: Math.max(0, def.limit - done) };
  }
  submitSbc(id: string, uids: string[], now: number): Result<Reward> {
    const s = this.s;
    const def = SBCS.find((d) => d.id === id);
    if (!def) return fail('Desafío no encontrado.');
    if (this.sbcAvailable(def, now).left <= 0) return fail('Ya completaste este desafío el máximo de veces.');
    if (new Set(uids).size !== uids.length) return fail('Hay cartas repetidas.');
    const defs: CardDef[] = [];
    for (const u of uids) {
      const c = s.inventory.find((x) => x.uid === u);
      if (!c) return fail('Alguna carta ya no está en tu club.');
      if (market.usedInSquads(s, u)) return fail('Hay cartas que están en una plantilla guardada: quítalas primero.');
      defs.push(getCardDef(c.defId)!);
    }
    const chk = checkSbc(def, defs);
    if (!chk.ok) return fail('No se cumplen todos los requisitos.');
    s.inventory = s.inventory.filter((c) => !uids.includes(c.uid));
    const k = sbcKey(def, now);
    s.sbcDone[k] = (s.sbcDone[k] ?? 0) + 1;
    s.records.sbcDone++;
    grant(s, def.reward, `Desafío: ${def.name}`, now);
    track(s, 'sbc', 1, now);
    addSeasonPoints(s, 25, now);
    this.save();
    return ok(def.reward);
  }

  // ---------- Evoluciones ----------
  startEvo(evoId: string, uid: string, now: number) { const r = startEvo(this.s, evoId, uid, now); this.save(); return r; }
  cancelEvo(uid: string) { const r = cancelEvo(this.s, uid); this.save(); return r; }
  evoOf(uid: string) { return this.s.evos.find((e) => e.uid === uid); }

  // ---------- Pase y misiones ----------
  claimPass(track: PassTrack, level: number, now: number) { const r = claimPass(this.s, track, level, now); this.save(); return r; }
  claimAllPass(now: number) { const n = claimAllPass(this.s, now); this.save(); return n; }
  unlockPremiumPass(now: number) { const r = unlockPremiumPass(this.s, now); this.save(); return r; }
  claimMission(id: string, now: number) { const r = claimMissionTask(this.s, id, now); this.save(); return r; }
  claimMissionGroup(id: string, now: number) { const r = claimMissionGroup(this.s, id, now); this.save(); return r; }

  /** Equipo jugable del club para un partido online (plantilla activa con química). */
  onlineTeam(now: number): Result<{ team: TeamData; meta: ClubMatchMeta }> {
    this.tick(now);
    const q = this.requireSquad();
    if (!q.ok) return q as Result<never>;
    const built = sq.buildClubTeam(this.s, this.squad);
    return ok({ team: built.team, meta: { id: nextId(this.s, 'm'), kind: 'online', opp: '', factor: 1.25 } });
  }

  // ---------- Recompensas ----------
  claimLogin(now: number) { this.tick(now); const r = claimLogin(this.s, now); this.save(); return r; }
  claimObjective(scope: 'daily' | 'weekly', id: string, now: number) { const r = claimObjective(this.s, scope, id, now); this.save(); return r; }
  claimMilestone(id: string, now: number) { const r = claimMilestone(this.s, id, now); this.save(); return r; }

  get level() { return levelOf(this.s.xp); }
  get packsInReserve() { return PACKS.reduce((t, p) => t + (this.s.packs.promo[p.id] ?? 0), 0); }
}
