import { catalog, eventDefs, getCardDef, niceRound } from './catalog';
import { addTx, ECONOMY, nextId } from './economy';
import { track } from './progress';
import type { CardDef, CardInstance, ClubState, Listing, Rarity, Result } from './types';
import { fail, ok } from './types';
import { clamp, dayId, hash32, seeded } from './util';

// Mercado de transferencias LOCAL y SIMULADO: no hay otros usuarios. Las cartas a la venta las genera el propio juego
// a partir de una semilla por periodo (cada 3 horas), de modo que todos los clubes ven lo mismo. Las pujas y las ventas se
// resuelven con probabilidades que dependen del precio. La interfaz (MarketBackend) está pensada para sustituir esto por un
// servidor real: ver docs/CLUB.md.

export const MARKET_EPOCH_MS = 3 * 3600_000;
export const MAX_INVENTORY = 500;
export const epochOf = (now: number) => Math.floor(now / MARKET_EPOCH_MS);

/** Contrato que tendría un mercado online real (el cliente nunca valida precios ni saldos: lo haría el servidor). */
export interface MarketBackend {
  search(filters: MarketFilters): Promise<Listing[]>;
  buyNow(listingId: string): Promise<Result<CardInstance>>;
  bid(listingId: string, amount: number): Promise<Result<void>>;
  list(cardUid: string, price: number, hours: number): Promise<Result<void>>;
}

const RARITY_WEIGHT: [Rarity, number][] = [['bronze', 24], ['silver', 34], ['gold', 30], ['rising', 6], ['special', 3.5], ['event', 1.8], ['legend', 0.7]];

let defsByRarityCache: Map<Rarity, CardDef[]> | null = null;
function defsOf(r: Rarity): CardDef[] {
  if (!defsByRarityCache) {
    defsByRarityCache = new Map();
    for (const d of catalog().values()) {
      if (!defsByRarityCache.has(d.rarity)) defsByRarityCache.set(d.rarity, []);
      defsByRarityCache.get(d.rarity)!.push(d);
    }
  }
  return defsByRarityCache.get(r) ?? [];
}

/** Cartas a la venta de un periodo (determinista). */
export function generateListings(epoch: number, season: string, count = 90): Listing[] {
  const rand = seeded(hash32(`market|${epoch}`));
  const start = epoch * MARKET_EPOCH_MS;
  const out: Listing[] = [];
  const seen = new Set<string>();
  const total = RARITY_WEIGHT.reduce((t, [, w]) => t + w, 0);
  for (let i = 0; i < count; i++) {
    let x = rand() * total;
    let r: Rarity = 'silver';
    for (const [rr, w] of RARITY_WEIGHT) { x -= w; if (x < 0) { r = rr; break; } }
    const list = r === 'event' ? eventDefs(season) : defsOf(r);
    if (!list.length) continue;
    const d = list[Math.floor(rand() * list.length)];
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const buyNow = niceRound(d.price * (1.02 + rand() * 0.25));
    const startBid = Math.max(10, niceRound(d.price * (0.6 + rand() * 0.25)));
    out.push({ id: `L${epoch}-${i}`, defId: d.id, seller: 'sim', startBid, buyNow, bid: 0, bidder: null, endsAt: start + Math.round((0.12 + rand() * 0.88) * MARKET_EPOCH_MS), steps: 0, epoch });
  }
  return out;
}

export function minNextBid(l: Listing): number {
  if (!l.bid) return l.startBid;
  const step = l.bid < 1000 ? 50 : l.bid < 10000 ? 100 : l.bid < 100000 ? 500 : 1000;
  return l.bid + step;
}

/** Monedas retenidas por las pujas del usuario que siguen abiertas. */
export function heldCoins(s: ClubState): number {
  return s.market.listings.reduce((t, l) => t + (l.bidder === 'user' ? l.bid : 0), 0);
}

function pushResult(s: ClubState, now: number, text: string, coins?: number) {
  s.market.results.unshift({ at: now, text, coins });
  if (s.market.results.length > 40) s.market.results.length = 40;
}

function addCard(s: ClubState, defId: string, source: string, now: number): CardInstance {
  const c: CardInstance = { uid: nextId(s, 'c'), defId, acquired: now, source };
  s.inventory.push(c);
  return c;
}

/** Procesa lo que ha pasado desde la última vez: fin de pujas, ventas propias y cambio de periodo. Idempotente. */
export function refreshMarket(s: ClubState, now: number, season: string) {
  const m = s.market;
  const ep = epochOf(now);
  // 1. pujas del usuario cuyo tiempo terminó
  for (const l of [...m.listings]) {
    if (l.bidder !== 'user' || l.endsAt > now) continue;
    const d = getCardDef(l.defId);
    m.listings.splice(m.listings.indexOf(l), 1);
    if (!d) continue;
    const ratio = l.bid / d.price;
    const pOut = clamp(1.05 - (ratio - 0.55) * 1.3, 0.04, 0.92); // pujas bajas: casi seguro te superan
    const outbid = (hash32(`${l.id}|${l.bid}`) % 1000) / 1000 < pOut;
    if (outbid) { pushResult(s, now, `Te superaron en la puja por ${d.name} (${l.bid.toLocaleString('es-ES')}).`); continue; }
    const tx = addTx(s, 'market-buy', -l.bid, `Puja ganada: ${d.name}`, now);
    if (!tx.ok) { pushResult(s, now, `Ganaste la puja por ${d.name}, pero no tenías monedas: se anuló.`); continue; }
    if (s.inventory.length >= MAX_INVENTORY) { addTx(s, 'refund', l.bid, `Reembolso por inventario lleno: ${d.name}`, now); pushResult(s, now, `Inventario lleno: no se pudo entregar a ${d.name} (reembolsado).`); continue; }
    const c = addCard(s, d.id, 'market', now);
    tx.value.card = c.uid;
    s.records.marketBuys++;
    pushResult(s, now, `¡Ganaste la puja por ${d.name}! (${l.bid.toLocaleString('es-ES')} monedas)`, -l.bid);
  }
  // 2. ventas propias terminadas
  for (const my of [...m.mine]) {
    if (my.endsAt > now) continue;
    m.mine.splice(m.mine.indexOf(my), 1);
    const d = getCardDef(my.card.defId);
    if (!d) continue;
    const ratio = my.price / d.price;
    const pSale = clamp(1.32 - ratio * 0.9, 0.1, 0.97);
    const sold = (hash32(`${my.id}|sale`) % 1000) / 1000 < pSale;
    if (sold) {
      const fee = Math.floor(my.price * ECONOMY.marketFee);
      addTx(s, 'market-sell', my.price, `Venta: ${d.name}`, now, my.card.uid);
      addTx(s, 'market-fee', -fee, `Comisión por ${d.name}`, now);
      s.records.marketSells++;
      pushResult(s, now, `Vendiste a ${d.name} por ${my.price.toLocaleString('es-ES')} (comisión ${fee.toLocaleString('es-ES')}).`, my.price - fee);
    } else {
      s.inventory.push(my.card);
      pushResult(s, now, `No se vendió a ${d.name}: volvió a tu club.`);
    }
  }
  // 3. nuevo periodo
  if (m.epoch !== ep || !m.listings.length) {
    // las pujas del usuario del periodo anterior ya se resolvieron arriba (todas terminan antes del cambio)
    m.epoch = ep;
    m.listings = generateListings(ep, season);
  }
}

export function actionsLeft(s: ClubState, now: number): number {
  const day = dayId(now);
  if (s.market.actionsDay !== day) { s.market.actionsDay = day; s.market.actions = 0; }
  return Math.max(0, ECONOMY.marketActionsPerDay - s.market.actions);
}
const useAction = (s: ClubState, now: number): Result<void> => {
  if (actionsLeft(s, now) <= 0) return fail(`Alcanzaste el límite de ${ECONOMY.marketActionsPerDay} operaciones de mercado por hoy.`);
  s.market.actions++;
  return ok(undefined);
};

export function buyNow(s: ClubState, listingId: string, now: number): Result<CardInstance> {
  const l = s.market.listings.find((x) => x.id === listingId);
  if (!l || l.endsAt <= now) return fail('Esa carta ya no está disponible.');
  const d = getCardDef(l.defId);
  if (!d) return fail('Carta desconocida.');
  if (l.bidder === 'user') return fail('Ya tienes la puja más alta en esta carta.');
  if (s.inventory.length >= MAX_INVENTORY) return fail(`Tu club está lleno (${MAX_INVENTORY} cartas). Vende o descarta alguna.`);
  if (s.coins - heldCoins(s) < l.buyNow) return fail('No tienes monedas suficientes (algunas están retenidas por tus pujas).');
  const a = useAction(s, now);
  if (!a.ok) return a as Result<never>;
  const tx = addTx(s, 'market-buy', -l.buyNow, `Compra: ${d.name}`, now);
  if (!tx.ok) { s.market.actions--; return tx as Result<never>; }
  s.market.listings.splice(s.market.listings.indexOf(l), 1);
  const c = addCard(s, d.id, 'market', now);
  tx.value.card = c.uid;
  s.records.marketBuys++;
  track(s, 'market', 1, now);
  return ok(c);
}

export function placeBid(s: ClubState, listingId: string, amount: number, now: number): Result<void> {
  const l = s.market.listings.find((x) => x.id === listingId);
  if (!l || l.endsAt <= now) return fail('Esa subasta ya terminó.');
  if (!Number.isInteger(amount)) return fail('Importe no válido.');
  if (amount < minNextBid(l)) return fail(`La puja mínima es ${minNextBid(l).toLocaleString('es-ES')}.`);
  if (amount >= l.buyNow) return fail('Esa puja alcanza el precio de compra inmediata: usa "Comprar ya".');
  const available = s.coins - heldCoins(s) + (l.bidder === 'user' ? l.bid : 0);
  if (available < amount) return fail('No tienes monedas suficientes (algunas están retenidas por tus pujas).');
  if (l.bidder !== 'user') { const a = useAction(s, now); if (!a.ok) return a; }
  l.bid = amount;
  l.bidder = 'user';
  return ok(undefined);
}

export function cancelBid(): Result<void> { return fail('Una puja no se puede retirar.'); }

export function usedInSquads(s: ClubState, uid: string): boolean {
  return s.squads.some((q) => q.slots.includes(uid) || q.bench.includes(uid));
}

export function listPriceBand(d: CardDef) {
  return { min: niceRound(d.price * ECONOMY.listMin), max: niceRound(d.price * ECONOMY.listMax) };
}

export function listCard(s: ClubState, uid: string, price: number, hours: 1 | 3 | 6, now: number): Result<void> {
  const i = s.inventory.findIndex((c) => c.uid === uid);
  if (i < 0) return fail('Esa carta no está en tu club.');
  const card = s.inventory[i];
  const d = getCardDef(card.defId);
  if (!d) return fail('Carta desconocida.');
  if (usedInSquads(s, uid)) return fail('La carta está en una de tus plantillas: quítala antes de venderla.');
  if (d.evo || s.evos?.some((e) => e.uid === uid)) return fail('Las cartas evolucionadas (o en evolución) no se pueden vender en el mercado.');
  const band = listPriceBand(d);
  if (!Number.isInteger(price) || price < band.min || price > band.max) return fail(`El precio debe estar entre ${band.min.toLocaleString('es-ES')} y ${band.max.toLocaleString('es-ES')}.`);
  if (s.market.mine.length >= 20) return fail('Ya tienes 20 cartas en venta.');
  const a = useAction(s, now);
  if (!a.ok) return a;
  s.inventory.splice(i, 1);
  s.market.mine.push({ id: nextId(s, 'my'), card, price, listedAt: now, endsAt: now + hours * 3600_000 });
  return ok(undefined);
}

export function unlist(s: ClubState, id: string): Result<void> {
  const i = s.market.mine.findIndex((x) => x.id === id);
  if (i < 0) return fail('Esa venta ya no existe.');
  s.inventory.push(s.market.mine[i].card);
  s.market.mine.splice(i, 1);
  return ok(undefined);
}

export function toggleWatch(s: ClubState, defId: string): boolean {
  const i = s.market.watch.indexOf(defId);
  if (i >= 0) { s.market.watch.splice(i, 1); return false; }
  if (s.market.watch.length >= 50) s.market.watch.shift();
  s.market.watch.push(defId);
  return true;
}

export interface MarketFilters {
  text?: string;
  group?: 'GK' | 'DEF' | 'MID' | 'FWD' | '';
  minOvr?: number;
  maxOvr?: number;
  league?: string;
  nat?: string;
  rarity?: Rarity | '';
  minPrice?: number;
  maxPrice?: number;
  watchOnly?: boolean;
  sort?: 'ovr' | 'price' | 'priceAsc' | 'ends' | 'name';
}

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchListings(s: ClubState, f: MarketFilters, now: number): { listing: Listing; def: CardDef }[] {
  const words = norm(f.text ?? '').split(/\s+/).filter(Boolean);
  const out: { listing: Listing; def: CardDef }[] = [];
  for (const l of s.market.listings) {
    if (l.endsAt <= now) continue;
    const d = getCardDef(l.defId);
    if (!d) continue;
    if (f.group && d.group !== f.group) continue;
    if (f.minOvr && d.ovr < f.minOvr) continue;
    if (f.maxOvr && d.ovr > f.maxOvr) continue;
    if (f.league && d.league !== f.league) continue;
    if (f.nat && d.nat !== f.nat) continue;
    if (f.rarity && d.rarity !== f.rarity) continue;
    if (f.minPrice && l.buyNow < f.minPrice) continue;
    if (f.maxPrice && l.buyNow > f.maxPrice) continue;
    if (f.watchOnly && !s.market.watch.includes(d.id)) continue;
    if (words.length) { const hay = norm(`${d.name} ${d.clubName} ${d.nat}`); if (!words.every((w) => hay.includes(w))) continue; }
    out.push({ listing: l, def: d });
  }
  const sort = f.sort ?? 'ovr';
  out.sort((a, b) => sort === 'price' ? b.listing.buyNow - a.listing.buyNow : sort === 'priceAsc' ? a.listing.buyNow - b.listing.buyNow : sort === 'ends' ? a.listing.endsAt - b.listing.endsAt : sort === 'name' ? a.def.name.localeCompare(b.def.name, 'es') : b.def.ovr - a.def.ovr || b.listing.buyNow - a.listing.buyNow);
  return out;
}

/** Venta rápida al club (35 % del valor). */
export function quickSell(s: ClubState, uid: string, now: number): Result<number> {
  const i = s.inventory.findIndex((c) => c.uid === uid);
  if (i < 0) return fail('Esa carta no está en tu club.');
  const d = getCardDef(s.inventory[i].defId);
  if (!d) return fail('Carta desconocida.');
  if (usedInSquads(s, uid)) return fail('La carta está en una de tus plantillas: quítala antes de venderla.');
  const v = Math.max(10, Math.round(d.price * ECONOMY.quickSell));
  s.inventory.splice(i, 1);
  addTx(s, 'quicksell', v, `Venta rápida: ${d.name}`, now, uid);
  return ok(v);
}
