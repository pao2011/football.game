import { catalog, defsByRarity, eventDefs } from './catalog';
import type { CardDef, Rarity } from './types';
import { weighted, type Rand } from './util';

// Sobres: precio, cartas y probabilidades por rareza (en %). Las probabilidades son públicas (se muestran en pantalla)
// y se pueden ajustar aquí. No se compran con dinero real: solo con monedas del juego o como recompensa.

export interface PackDef {
  id: string;
  name: string;
  blurb: string;
  /** Precio en monedas; 0 = solo se consigue como recompensa. */
  price: number;
  cards: number;
  /** Probabilidad (%) de cada rareza en cada carta. */
  odds: Partial<Record<Rarity, number>>;
  /** Al menos una carta de estas rarezas. */
  guarantee?: Rarity[];
  /** Protección: tras N sobres sin carta rara (Promesa o mejor), la siguiente trae una. */
  pityAfter?: number;
  buyable: boolean;
  color: string;
}

export const RARE: Rarity[] = ['rising', 'special', 'event', 'legend'];

export const PACKS: PackDef[] = [
  { id: 'basic', name: 'Sobre básico', blurb: 'Jugadores de bronce y plata para empezar a armar el club.', price: 2000, cards: 5, odds: { bronze: 62, silver: 35, gold: 3 }, buyable: true, color: '#b87333' },
  { id: 'premium', name: 'Sobre premium', blurb: 'Garantiza al menos una carta de oro.', price: 9000, cards: 5, odds: { silver: 58, gold: 38, rising: 3, special: 0.9, legend: 0.1 }, guarantee: ['gold', 'rising', 'special', 'event', 'legend'], pityAfter: 6, buyable: true, color: '#e8c25a' },
  { id: 'special', name: 'Sobre especial', blurb: 'Promesas, cartas especiales, de evento y leyendas ficticias.', price: 24000, cards: 4, odds: { gold: 74, rising: 13, special: 7, event: 5, legend: 1 }, guarantee: RARE, buyable: true, color: '#7fe0ff' },
  { id: 'promo', name: 'Sobre promocional', blurb: 'Regalo por objetivos, recompensas y hitos. No se compra.', price: 0, cards: 3, odds: { silver: 60, gold: 36, rising: 4 }, buyable: false, color: '#c28bff' },
];

export const packById = (id: string) => PACKS.find((p) => p.id === id);

/** Las probabilidades efectivas (sin eventos si no hay cartas de evento esa temporada). */
export function effectiveOdds(p: PackDef, season: string): Partial<Record<Rarity, number>> {
  const odds = { ...p.odds };
  if (odds.event && !eventDefs(season).length) delete odds.event;
  return odds;
}

function pool(r: Rarity, season: string): CardDef[] {
  return r === 'event' ? eventDefs(season) : defsByRarity(r);
}

const cachePools = new Map<string, { defs: CardDef[]; w: number[]; total: number }>();
function weightedPool(r: Rarity, season: string) {
  const key = `${r}|${season}`;
  let c = cachePools.get(key);
  if (!c) {
    const defs = pool(r, season);
    // las cartas más valiosas de una misma rareza salen menos
    const w = defs.map((d) => 1 / Math.pow(Math.max(20, d.price), 0.5));
    c = { defs, w, total: w.reduce((a, b) => a + b, 0) };
    cachePools.set(key, c);
  }
  return c;
}

function pickDef(r: Rarity, season: string, rand: Rand): CardDef {
  const c = weightedPool(r, season);
  let x = rand() * c.total;
  for (let i = 0; i < c.defs.length; i++) {
    x -= c.w[i];
    if (x < 0) return c.defs[i];
  }
  return c.defs[c.defs.length - 1];
}

export interface RollInput {
  pack: PackDef;
  season: string;
  rand: Rand;
  /** Copias que ya tiene el club de cada defId (protección contra duplicados). */
  owned: ReadonlyMap<string, number>;
  /** Sobres seguidos sin carta rara de este tipo. */
  pity: number;
}

/** Tira un sobre: devuelve las cartas y si se activó la protección. Las probabilidades salen de `pack.odds`. */
export function rollPack(inp: RollInput): { defs: CardDef[]; pityUsed: boolean; hadRare: boolean } {
  const { pack, season, rand, owned } = inp;
  const odds = effectiveOdds(pack, season);
  const rarities = Object.keys(odds) as Rarity[];
  const taken = new Map<string, number>();
  const draw = (r: Rarity): CardDef => {
    // protección contra duplicados: hasta 3 intentos de evitar una carta que ya tienes (o ya salió en este sobre)
    let d = pickDef(r, season, rand);
    for (let t = 0; t < 3 && ((owned.get(d.id) ?? 0) + (taken.get(d.id) ?? 0) > 0); t++) d = pickDef(r, season, rand);
    taken.set(d.id, (taken.get(d.id) ?? 0) + 1);
    return d;
  };
  const defs: CardDef[] = [];
  for (let i = 0; i < pack.cards; i++) defs.push(draw(weighted(rarities, (r) => odds[r]!, rand)));
  let pityUsed = false;
  const rareOk = (d: CardDef) => RARE.includes(d.rarity);
  if (pack.pityAfter && inp.pity >= pack.pityAfter && !defs.some(rareOk)) {
    const r = weighted(RARE.filter((x) => pool(x, season).length), (x) => ({ rising: 60, special: 25, event: 12, legend: 3 }[x as 'rising'] ?? 1), rand);
    defs[defs.length - 1] = draw(r);
    pityUsed = true;
  }
  if (pack.guarantee && !defs.some((d) => pack.guarantee!.includes(d.rarity))) {
    const opts = pack.guarantee.filter((r) => odds[r] || r === 'gold').filter((r) => pool(r, season).length);
    const r = weighted(opts, (x) => odds[x] ?? 1, rand);
    // sustituye a la carta más barata
    let idx = 0;
    defs.forEach((d, i) => { if (d.price < defs[idx].price) idx = i; });
    defs[idx] = draw(r);
  }
  // las mejores cartas se revelan al final
  defs.sort((a, b) => a.price - b.price);
  return { defs, pityUsed, hadRare: defs.some(rareOk) };
}

/** Valor medio (venta rápida) de un sobre simulado: se usa en las pruebas para comprobar que los sobres no dan monedas gratis. */
export function catalogSize() { return catalog().size; }
