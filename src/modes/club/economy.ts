import type { CardDef, ClubState, Result, Tx, TxKind } from './types';
import { fail, ok } from './types';

// Economía del club. Todas las constantes están aquí para poder ajustarlas.
export const ECONOMY = {
  startCoins: 5000,
  /** Límite de monedas (contra la inflación). */
  maxCoins: 5_000_000,
  /** Comisión del mercado sobre las ventas. */
  marketFee: 0.05,
  /** Venta rápida al club: porcentaje del valor de mercado. */
  quickSell: 0.35,
  /** Partidos con premio completo al día; después se cobra el 25 %. */
  fullRewardMatches: 12,
  reducedFactor: 0.25,
  /** Máximo de operaciones de mercado al día (compras + puestas en venta). */
  marketActionsPerDay: 40,
  /** Movimientos que se conservan en el libro. */
  ledgerKeep: 400,
  /** Banda de precios al poner a la venta: entre el 70 % y el 160 % del valor de mercado. */
  listMin: 0.7,
  listMax: 1.6,
};

export const quickSellValue = (d: CardDef) => Math.max(10, Math.round(d.price * ECONOMY.quickSell));

/** Premio de un partido: resultado + goles (con tope) + portería a cero. Dificultad: 0.8..1.4. */
export function matchReward(res: 'W' | 'D' | 'L', goalsFor: number, cleanSheet: boolean, factor = 1): number {
  const base = res === 'W' ? 450 : res === 'D' ? 220 : 120;
  return Math.round((base + Math.min(5, goalsFor) * 25 + (cleanSheet ? 60 : 0)) * factor);
}

/** Valida y devuelve el siguiente id con contador (no se repite nunca). */
export function nextId(s: ClubState, prefix: string): string {
  s.counter++;
  return `${prefix}_${s.counter.toString(36)}${Math.floor(Math.random() * 1679616).toString(36)}`;
}

/** Aplica un movimiento de monedas. Rechaza gastos que dejarían el saldo en negativo. Los ingresos se recortan al tope. */
export function addTx(s: ClubState, kind: TxKind, amount: number, note: string, now: number, card?: string): Result<Tx> {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return fail('Importe no válido.');
  if (amount < 0 && s.coins + amount < 0) return fail('No tienes monedas suficientes.');
  let applied = amount;
  if (amount > 0 && s.coins + amount > ECONOMY.maxCoins) applied = Math.max(0, ECONOMY.maxCoins - s.coins);
  s.coins += applied;
  const tx: Tx = { id: nextId(s, 'tx'), at: now, kind, amount: applied, note, card, balance: s.coins };
  s.ledger.push(tx);
  if (applied > 0) s.records.coinsEarned += applied; else s.records.coinsSpent += -applied;
  while (s.ledger.length > ECONOMY.ledgerKeep) {
    const old = s.ledger.shift()!;
    s.ledgerBase = old.balance;
  }
  return ok(tx);
}

/** Comprueba que el saldo coincide con el libro contable; si no, el libro manda y se corrige. */
export function reconcile(s: ClubState): boolean {
  if (!s.ledger.length) return true;
  const sum = s.ledger.reduce((t, x) => t + x.amount, s.ledgerBase);
  if (sum === s.coins) return true;
  s.coins = Math.max(0, sum);
  return false;
}
