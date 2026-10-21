import type { FormationId, PlayerAttributes, Position } from '../../data/types';

// Modo "Soffti Club": colección de cartas, plantilla, química, sobres, mercado local y competiciones.
// Todo el estado del club es un objeto serializable (ClubState) que se guarda en localStorage (ver state.ts).

export type Rarity = 'bronze' | 'silver' | 'gold' | 'rising' | 'special' | 'event' | 'legend';
export const RARITIES: Rarity[] = ['bronze', 'silver', 'gold', 'rising', 'special', 'event', 'legend'];
export const RARITY_NAMES: Record<Rarity, string> = {
  bronze: 'Bronce', silver: 'Plata', gold: 'Oro', rising: 'Promesa', special: 'Especial', event: 'Evento', legend: 'Leyenda',
};

/** Puesto con el nombre que usa el juego (POR, LI, DFC…). */
export type Role = 'POR' | 'LI' | 'DFC' | 'LD' | 'MCD' | 'MC' | 'MI' | 'MD' | 'MCO' | 'CAI' | 'CAD' | 'EI' | 'ED' | 'DC';

export interface CardStats { pac: number; sho: number; pas: number; dri: number; def: number; phy: number }

/** Definición (inmutable) de un futbolista coleccionable. */
export interface CardDef {
  id: string;
  /** Id del jugador del juego del que sale (vacío en las leyendas, que son ficticias). */
  playerId: string;
  name: string;
  /** Apellido o nombre corto para la carta. */
  short: string;
  ovr: number;
  role: Role;
  alt: Role[];
  group: Position;
  nat: string;
  /** Equipo del juego (vacío en leyendas). */
  clubId: string;
  clubName: string;
  /** Id de la liga del club ('' si no tiene). */
  league: string;
  age: number;
  stats: CardStats;
  foot: 'D' | 'I';
  /** Estrellas de filigranas 1..5. */
  skill: number;
  rarity: Rarity;
  /** Bonus de atributos respecto al jugador base (cartas especiales). */
  boost: number;
  eventSeason?: string;
  /** Atributos de partido (ya con el bonus de la carta). */
  attrs: PlayerAttributes;
  /** Precio estimado de mercado (monedas). */
  price: number;
  number: number;
  face: { skin: number; hair: string; style: number; height: number };
  /** true si el nombre es de un personaje ficticio (leyendas) o inventado por el juego. */
  fictional: boolean;
}

/** Carta que posee el club: una instancia única con su propio id. */
export interface CardInstance {
  uid: string;
  defId: string;
  acquired: number;
  source: string;
}

export type StyleId = 'balanced' | 'possession' | 'counter' | 'press';

export interface Squad {
  id: string;
  name: string;
  formation: FormationId;
  /** Titulares en el orden de la formación (uid o null). */
  slots: (string | null)[];
  /** Suplentes (7). */
  bench: (string | null)[];
  captain: string | null;
  penaltyTaker: string | null;
  freeKickTaker: string | null;
  style: StyleId;
  coach: string;
}

export interface ClubIdentity {
  name: string;
  /** Escudo original: forma + símbolo + colores. */
  crest: { shape: 'shield' | 'circle' | 'diamond'; symbol: 'star' | 'ball' | 'lion' | 'wave' | 'bolt' | 'crown' | 'tower' | 'eagle' | 'none'; stripes: boolean };
  primary: string;
  secondary: string;
  pattern: 'solid' | 'stripes' | 'hoops' | 'sash' | 'band' | 'halves' | 'vee' | 'gradient';
}

export type TxKind =
  | 'start' | 'match' | 'pack' | 'quicksell' | 'market-buy' | 'market-sell' | 'market-fee' | 'reward' | 'entry' | 'sbc' | 'refund';

/** Movimiento de monedas (libro contable). */
export interface Tx {
  id: string;
  at: number;
  kind: TxKind;
  /** Positivo = ingreso, negativo = gasto. */
  amount: number;
  note: string;
  /** Carta implicada (uid o defId). */
  card?: string;
  /** Saldo tras el movimiento. */
  balance: number;
}

export interface PackOpening {
  id: string;
  packId: string;
  at: number;
  /** Cartas obtenidas: pendientes de decidir (enviar al club, vender o descartar). */
  cards: { uid: string; defId: string; decided: boolean }[];
}

export interface Listing {
  id: string;
  defId: string;
  /** 'sim' = mercado simulado (no hay otros usuarios reales). */
  seller: 'sim';
  startBid: number;
  buyNow: number;
  /** Puja actual (0 = sin pujas) y quién la hizo. */
  bid: number;
  bidder: 'user' | 'sim' | null;
  endsAt: number;
  /** Ronda de simulación de pujas ya procesadas. */
  steps: number;
  epoch: number;
}

export interface MyListing {
  id: string;
  card: CardInstance;
  price: number;
  listedAt: number;
  endsAt: number;
}

export type MarketResult = { at: number; text: string; coins?: number };

export interface ObjectiveProgress { id: string; progress: number }

export interface Records {
  played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number;
  cleanSheets: number; bestStreak: number; streak: number; biggestWin: number; mostGoals: number;
  packsOpened: number; sbcDone: number; coinsEarned: number; coinsSpent: number; marketBuys: number; marketSells: number;
}

export interface RivalsState { weekId: string; points: number; played: number; won: number; claimed: boolean }
export interface ChampionsState { weekId: string; entered: boolean; played: number; wins: number; results: ('W' | 'D' | 'L')[]; claimed: boolean }
export interface BattlesState { dayId: string; done: Record<string, boolean> }
export interface TournamentState {
  id: string;
  weekId: string;
  teams: string[];
  round: number;
  alive: boolean;
  history: { round: number; opp: string; gf: number; ga: number; pens?: [number, number] }[];
  finished: boolean;
  claimed: boolean;
}

export interface ClubState {
  version: 1;
  id: string;
  createdAt: number;
  identity: ClubIdentity;
  coins: number;
  xp: number;
  inventory: CardInstance[];
  squads: Squad[];
  activeSquad: number;
  ledger: Tx[];
  /** Saldo anterior al primer movimiento conservado (el libro se recorta; el saldo se puede verificar). */
  ledgerBase: number;
  packs: { openings: PackOpening[]; pity: Record<string, number>; promo: Record<string, number>; nextId: number };
  market: { epoch: number; listings: Listing[]; watch: string[]; mine: MyListing[]; results: MarketResult[]; actionsDay: string; actions: number };
  progress: {
    loginDay: string; loginStreak: number; loginClaimedDay: string;
    daily: { dayId: string; objectives: ObjectiveProgress[]; claimed: string[] };
    weekly: { weekId: string; objectives: ObjectiveProgress[]; claimed: string[] };
    season: { id: string; points: number; claimed: string[] };
    milestones: string[];
    matchesToday: { dayId: string; n: number };
  };
  records: Records;
  rivals: RivalsState;
  champions: ChampionsState;
  battles: BattlesState;
  tournament: TournamentState | null;
  sbcDone: Record<string, number>;
  /** Partidos ya contabilizados (evita cobrar dos veces el mismo). */
  processed: string[];
  /** Avisos para el jugador (recompensas automáticas, etc.). */
  inbox: { at: number; text: string }[];
  counter: number;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (error: string): Result<never> => ({ ok: false, error });
