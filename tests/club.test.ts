import { beforeEach, describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { SIM_DT } from '../src/config/constants';
import { FORMATIONS } from '../src/data/formations';
import { TEAMS } from '../src/data/teams';
import { catalog, eventDefs, getCardDef, periodDefs, periodOf } from '../src/modes/club/catalog';
import { evaluateSquad } from '../src/modes/club/chemistry';
import { Club } from '../src/modes/club/Club';
import { BATTLES, CHAMPIONS, SBCS, rivalsDivision } from '../src/modes/club/competitions';
import { addTx, ECONOMY, reconcile } from '../src/modes/club/economy';
import { MAX_INVENTORY, generateListings, listPriceBand } from '../src/modes/club/market';
import { PACKS, effectiveOdds, rollPack } from '../src/modes/club/packs';
import { levelOf, xpForLevel } from '../src/modes/club/progress';
import { buildClubTeam, sanitizeOnlineTeam } from '../src/modes/club/squads';
import { seeded } from '../src/modes/club/util';
import type { ClubIdentity } from '../src/modes/club/types';

const ID: ClubIdentity = { name: 'Club de Prueba', crest: { shape: 'shield', symbol: 'star', stripes: false }, primary: '#1d4ed8', secondary: '#facc15', pattern: 'stripes' };
const T0 = Date.UTC(2026, 9, 14, 12); // miércoles
const DAY = 86400000;
const mk = (rand = seeded(7)) => {
  const r = Club.create(ID, '4-3-3', T0, rand);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const sumLedger = (c: Club) => c.s.ledger.reduce((t, x) => t + x.amount, c.s.ledgerBase);

describe('Club · catálogo de cartas', () => {
  it('ids únicos, valoraciones y precios coherentes', () => {
    const all = [...catalog().values()];
    expect(all.length).toBeGreaterThan(5000);
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    for (const d of all.slice(0, 3000)) {
      expect(d.ovr).toBeGreaterThanOrEqual(30);
      expect(d.ovr).toBeLessThanOrEqual(99);
      expect(d.price).toBeGreaterThan(0);
      expect(Object.values(d.stats).every((v) => v >= 1 && v <= 99)).toBe(true);
    }
    // más valoración → más precio (misma rareza)
    const gold = all.filter((d) => d.rarity === 'gold').sort((a, b) => a.ovr - b.ovr);
    expect(gold[gold.length - 1].price).toBeGreaterThan(gold[0].price);
    expect(all.filter((d) => d.rarity === 'legend').length).toBe(16);
    expect(all.filter((d) => d.rarity === 'legend').every((d) => d.fictional && d.ovr >= 88)).toBe(true);
  });
  it('las cartas de evento dependen de la temporada y se encuentran por id', () => {
    const ev = eventDefs('s1');
    expect(ev.length).toBeGreaterThan(5);
    expect(getCardDef(ev[0].id)).toBeDefined();
    expect(ev.every((d) => d.rarity === 'event' && d.boost === 4)).toBe(true);
  });
});

describe('Club · química', () => {
  const defsOfClub = (clubId: string) => [...catalog().values()].filter((d) => d.clubId === clubId && d.rarity !== 'rising' && d.rarity !== 'special');
  it('la química sube con vínculos y nunca pasa de 33', () => {
    const t = TEAMS[0];
    const mates = defsOfClub(t.id).slice(0, 11);
    const ev = evaluateSquad(t.formation, mates, 'balanced', 'c_neutral');
    expect(ev.chem).toBeLessThanOrEqual(33);
    expect(ev.chem).toBeGreaterThan(10);
    const mixed = [...catalog().values()].filter((d) => d.rarity === 'silver').filter((_, i) => i % 97 === 0).slice(0, 11);
    const evMixed = evaluateSquad(t.formation, mixed, 'balanced', 'c_neutral');
    expect(evMixed.chem).toBeLessThan(ev.chem);
  });
  it('fuera de su puesto no hay química y baja la valoración, pero el jugador sigue sirviendo', () => {
    const t = TEAMS[0];
    const mates = defsOfClub(t.id).slice(0, 11);
    const ok = evaluateSquad(t.formation, mates, 'balanced', 'c_neutral');
    const wrong = mates.slice().reverse();
    const bad = evaluateSquad(t.formation, wrong, 'balanced', 'c_neutral');
    expect(bad.ovr).toBeLessThan(ok.ovr);
    expect(bad.ovr).toBeGreaterThan(20);
    expect(bad.slots.some((s) => s.fit < 0.9 && s.chem === 0)).toBe(true);
  });
  it('un jugador excelente sigue siendo útil con poca química', () => {
    const star = [...catalog().values()].filter((d) => d.role === 'DC' && d.ovr >= 85)[0];
    const ev = evaluateSquad('4-4-2', Array(11).fill(null).map((_, i) => (i === 9 ? star : null)), 'balanced', 'c_neutral');
    expect(ev.slots[9].effOvr).toBeGreaterThanOrEqual(star.ovr - 2);
  });
});

describe('Club · economía y libro contable', () => {
  it('no permite saldo negativo y el saldo coincide con el libro', () => {
    const c = mk();
    expect(c.s.coins).toBe(ECONOMY.startCoins);
    expect(addTx(c.s, 'entry', -999999, 'x', T0).ok).toBe(false);
    expect(addTx(c.s, 'entry', 1.5, 'x', T0).ok).toBe(false);
    expect(c.s.coins).toBe(ECONOMY.startCoins);
    addTx(c.s, 'reward', 100, 'x', T0);
    expect(sumLedger(c)).toBe(c.s.coins);
    c.s.coins += 777; // manipulación: el libro manda
    expect(reconcile(c.s)).toBe(false);
    expect(c.s.coins).toBe(sumLedger(c));
  });
  it('el saldo tiene un tope', () => {
    const c = mk();
    addTx(c.s, 'reward', ECONOMY.maxCoins * 2, 'x', T0);
    expect(c.s.coins).toBe(ECONOMY.maxCoins);
  });
  it('el libro se recorta sin perder el saldo', () => {
    const c = mk();
    for (let i = 0; i < ECONOMY.ledgerKeep + 50; i++) addTx(c.s, 'reward', 1, 'x', T0);
    expect(c.s.ledger.length).toBe(ECONOMY.ledgerKeep);
    expect(sumLedger(c)).toBe(c.s.coins);
  });
});

describe('Club · sobres', () => {
  it('respetan sus probabilidades', () => {
    for (const pack of PACKS.filter((p) => p.id !== 'special')) {
      const rand = seeded(11);
      const counts: Record<string, number> = {};
      let n = 0;
      for (let i = 0; i < 1500; i++) {
        const r = rollPack({ pack: { ...pack, guarantee: undefined, pityAfter: undefined }, season: 's1', rand, owned: new Map(), pity: 0 });
        for (const d of r.defs) { counts[d.rarity] = (counts[d.rarity] ?? 0) + 1; n++; }
      }
      const odds = effectiveOdds(pack, 's1');
      const total = Object.values(odds).reduce((a, b) => a + b!, 0);
      for (const [r, p] of Object.entries(odds)) {
        const expected = (p! / total) * 100;
        const got = ((counts[r] ?? 0) / n) * 100;
        expect(Math.abs(got - expected)).toBeLessThan(Math.max(1.2, expected * 0.2));
      }
    }
  });
  it('los sobres garantizan su carta mínima', () => {
    const premium = PACKS.find((p) => p.id === 'premium')!;
    const rand = seeded(5);
    for (let i = 0; i < 300; i++) {
      const r = rollPack({ pack: premium, season: 's1', rand, owned: new Map(), pity: 0 });
      expect(r.defs.some((d) => premium.guarantee!.includes(d.rarity))).toBe(true);
      expect(r.defs.length).toBe(premium.cards);
    }
  });
  it('la protección activa una carta rara tras la racha sin suerte', () => {
    const premium = PACKS.find((p) => p.id === 'premium')!;
    const rand = seeded(9);
    let rare = 0;
    for (let i = 0; i < 300; i++) if (rollPack({ pack: { ...premium, odds: { silver: 50, gold: 50 } }, season: 's1', rand, owned: new Map(), pity: 6 }).hadRare) rare++;
    expect(rare).toBe(300);
  });
  it('vender las cartas de un sobre rinde menos que su precio (no se fabrican monedas)', () => {
    for (const pack of PACKS.filter((p) => p.buyable)) {
      const rand = seeded(3);
      let total = 0;
      const N = 600;
      for (let i = 0; i < N; i++) {
        const r = rollPack({ pack, season: 's1', rand, owned: new Map(), pity: 0 });
        total += r.defs.reduce((t, d) => t + Math.max(10, Math.round(d.price * ECONOMY.quickSell)), 0);
      }
      expect(total / N).toBeLessThan(pack.price * 0.95);
    }
  });
  it('el valor de mercado medio de un sobre no supera su precio (sin arbitraje con el mercado)', () => {
    for (const pack of PACKS.filter((p) => p.buyable)) {
      const rand = seeded(21);
      let fair = 0;
      const N = 800;
      for (let i = 0; i < N; i++) fair += rollPack({ pack, season: 's1', rand, owned: new Map(), pity: 0 }).defs.reduce((t, d) => t + d.price, 0);
      expect(fair / N).toBeLessThan(pack.price * 1.02);
    }
  });
  it('flujo de compra: cobra, deja las cartas pendientes y cada una se decide una sola vez', () => {
    const c = mk();
    addTx(c.s, 'reward', 20000, 'x', T0);
    const before = c.s.coins;
    const op = c.openPack('basic', false, T0, seeded(1));
    if (!op.ok) throw new Error(op.error);
    expect(c.s.coins).toBe(before - 2000);
    const inv = c.s.inventory.length;
    expect(op.value.cards.length).toBe(5);
    const [first, second, third] = op.value.cards;
    expect(c.decideCard(op.value.id, first.uid, 'club', T0).ok).toBe(true);
    expect(c.decideCard(op.value.id, first.uid, 'club', T0).ok).toBe(false); // no se repite
    expect(c.s.inventory.length).toBe(inv + 1);
    const sell = c.decideCard(op.value.id, second.uid, 'sell', T0);
    expect(sell.ok && sell.value > 0).toBe(true);
    expect(c.decideCard(op.value.id, third.uid, 'discard', T0).ok).toBe(true);
    expect(c.s.inventory.some((x) => x.uid === third.uid)).toBe(false);
    expect(new Set(c.s.inventory.map((x) => x.uid)).size).toBe(c.s.inventory.length);
    expect(sumLedger(c)).toBe(c.s.coins);
  });
  it('rechaza compras inválidas', () => {
    const c = mk();
    expect(c.openPack('premium', false, T0).ok).toBe(false); // sin monedas (5000 < 9000)
    expect(c.openPack('promo', false, T0).ok).toBe(false); // no se compra
    expect(c.openPack('nope', false, T0).ok).toBe(false);
    expect(c.openPack('premium', true, T0).ok).toBe(false); // sin sobres gratis de ese tipo
    expect(c.s.coins).toBe(ECONOMY.startCoins);
    expect(c.openPack('promo', true, T0, seeded(2)).ok).toBe(true);
    expect(c.openPack('promo', true, T0, seeded(3)).ok).toBe(true);
    expect(c.openPack('promo', true, T0, seeded(4)).ok).toBe(false); // se acabaron los 2 de bienvenida
  });
});

describe('Club · plantillas', () => {
  it('el club inicial tiene once titulares y suplentes, sin repetidos', () => {
    const c = mk();
    const q = c.squad;
    expect(q.slots.every(Boolean)).toBe(true);
    const used = [...q.slots, ...q.bench].filter(Boolean) as string[];
    expect(new Set(used).size).toBe(used.length);
    expect(c.s.inventory.length).toBe(18);
  });
  it('arrastrar y soltar intercambia sin duplicar', () => {
    const c = mk();
    const a = c.squad.slots[1]!;
    const b = c.squad.slots[2]!;
    c.swapPos({ kind: 'slot', i: 1 }, { kind: 'slot', i: 2 });
    expect(c.squad.slots[1]).toBe(b);
    expect(c.squad.slots[2]).toBe(a);
    const benchCard = c.squad.bench[0]!;
    c.place(benchCard, { kind: 'slot', i: 1 });
    expect(c.squad.slots[1]).toBe(benchCard);
    expect(c.squad.bench.includes(benchCard)).toBe(false);
    expect(c.squad.bench.includes(b)).toBe(true); // el desplazado va al lugar de origen
    const used = [...c.squad.slots, ...c.squad.bench].filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
  it('cambiar de formación conserva a los jugadores y es válida en las cinco', () => {
    const c = mk();
    for (const f of Object.keys(FORMATIONS) as (keyof typeof FORMATIONS)[]) {
      c.setFormation(f);
      expect(c.squad.formation).toBe(f);
      const used = [...c.squad.slots, ...c.squad.bench].filter(Boolean) as string[];
      expect(new Set(used).size).toBe(used.length);
      expect(c.squad.slots.filter(Boolean).length).toBe(11);
    }
    expect(Object.keys(FORMATIONS)).toEqual(expect.arrayContaining(['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '4-1-2-1-2']));
  });
  it('se pueden guardar varias plantillas y recuperarlas', () => {
    const c = mk();
    c.setFormation('4-4-2');
    c.setRole('captain', c.squad.slots[3]);
    expect(c.newSquad().ok).toBe(true);
    c.setFormation('3-5-2');
    c.selectSquad(0);
    const re = Club.load(T0)!;
    expect(re.s.squads.length).toBe(2);
    expect(re.s.squads[0].formation).toBe('4-4-2');
    expect(re.s.squads[1].formation).toBe('3-5-2');
    expect(re.s.squads[0].captain).toBe(c.squad.slots[3]);
  });
  it('quitar una carta de la plantilla borra sus funciones', () => {
    const c = mk();
    const u = c.squad.slots[5]!;
    c.setRole('penaltyTaker', u);
    c.removeAt({ kind: 'slot', i: 5 });
    expect(c.squad.penaltyTaker).toBeNull();
  });
  it('el equipo del club juega un partido real con los atributos de las cartas', () => {
    const c = mk();
    const built = buildClubTeam(c.s, c.squad);
    expect(built.team.players.length).toBe(18);
    expect(built.team.setPieces?.penalty).toBe(c.squad.penaltyTaker);
    const star = [...catalog().values()].filter((d) => d.role === 'DC' && d.ovr >= 85)[0];
    c.s.inventory.push({ uid: 'star1', defId: star.id, acquired: T0, source: 'test' });
    c.place('star1', { kind: 'slot', i: 9 });
    const b2 = buildClubTeam(c.s, c.squad);
    // la carta mejor tiene mejores atributos reales en el partido
    expect(b2.team.players[9].attrs.shooting).toBeGreaterThan(built.team.players[9].attrs.shooting);
    const m = makeMatch({ home: b2.team, away: TEAMS[5], homeKit: b2.team.home, halfLengthSec: 60, seed: 3 });
    let steps = 0;
    while (!m.finished && steps < 520 / SIM_DT) { m.step(); m.events.length = 0; if (m.phase === 'replay') m.skipReplay(); steps++; }
    expect(m.finished).toBe(true);
    expect(m.teams[0].stats.passes).toBeGreaterThan(5);
    void SIM_DT;
  });
});

describe('Club · mercado local', () => {
  it('genera siempre las mismas cartas para un periodo y respeta los precios', () => {
    const a = generateListings(1234, 's1');
    const b = generateListings(1234, 's1');
    expect(a.map((l) => l.id + l.defId + l.buyNow)).toEqual(b.map((l) => l.id + l.defId + l.buyNow));
    expect(a.length).toBeGreaterThan(40);
    for (const l of a) { const d = getCardDef(l.defId)!; expect(l.buyNow).toBeGreaterThanOrEqual(d.price); expect(l.startBid).toBeLessThan(l.buyNow); }
  });
  it('comprar: valida monedas, caducidad y descuenta', () => {
    const c = mk();
    c.tick(T0);
    const cheap = c.s.market.listings.filter((l) => l.endsAt > T0).sort((a, b) => a.buyNow - b.buyNow)[0];
    const dear = c.s.market.listings.filter((l) => l.endsAt > T0).sort((a, b) => b.buyNow - a.buyNow)[0];
    expect(c.buyNow(dear.id, T0).ok).toBe(false); // no alcanza
    const before = c.s.coins;
    const r = c.buyNow(cheap.id, T0);
    expect(r.ok).toBe(true);
    expect(c.s.coins).toBe(before - cheap.buyNow);
    expect(c.buyNow(cheap.id, T0).ok).toBe(false); // ya no está
    expect(c.s.inventory.some((x) => x.defId === cheap.defId && x.source === 'market')).toBe(true);
    expect(c.buyNow('zzz', T0).ok).toBe(false);
    expect(sumLedger(c)).toBe(c.s.coins);
  });
  it('las pujas retienen monedas y no pueden superar lo disponible', () => {
    const c = mk();
    const l = c.s.market.listings.find((x) => x.endsAt > T0 && x.startBid <= 3000 && x.buyNow > x.startBid + 200)!;
    expect(c.bid(l.id, l.startBid - 1, T0).ok).toBe(false);
    expect(c.bid(l.id, l.buyNow, T0).ok).toBe(false);
    const b = c.bid(l.id, l.startBid, T0);
    expect(b.ok).toBe(true);
    expect(l.bidder).toBe('user');
    // al terminar, se gana o se pierde; el saldo sigue cuadrando con el libro
    c.tick(l.endsAt + 1000);
    expect(sumLedger(c)).toBe(c.s.coins);
    expect(c.s.coins).toBeGreaterThanOrEqual(0);
  });
  it('poner a la venta: banda de precio, la carta sale del club y se resuelve', () => {
    const c = mk();
    const spare = c.s.inventory.find((x) => !c.squad.slots.includes(x.uid) && !c.squad.bench.includes(x.uid));
    // todas están en la plantilla inicial: no se pueden vender
    expect(spare).toBeUndefined();
    const u = c.squad.bench[6]!;
    expect(c.list(u, 100, 1, T0).ok).toBe(false); // en plantilla
    c.removeAt({ kind: 'bench', i: 6 });
    const d = c.def(u)!;
    const band = listPriceBand(d);
    expect(c.list(u, band.min - 1, 1, T0).ok).toBe(false);
    expect(c.list(u, band.max + 1000, 1, T0).ok).toBe(false);
    expect(c.list(u, band.min, 1, T0).ok).toBe(true);
    expect(c.s.inventory.some((x) => x.uid === u)).toBe(false);
    expect(c.s.market.mine.length).toBe(1);
    const coins = c.s.coins;
    c.tick(T0 + 2 * 3600_000);
    expect(c.s.market.mine.length).toBe(0);
    const sold = c.s.coins > coins;
    expect(sold || c.s.inventory.some((x) => x.uid === u)).toBe(true); // vendida o devuelta, nunca perdida ni duplicada
    expect(sold && c.s.inventory.some((x) => x.uid === u)).toBe(false);
    expect(sumLedger(c)).toBe(c.s.coins);
  });
  it('límite diario de operaciones y de tamaño del club', () => {
    const c = mk();
    addTx(c.s, 'reward', 4_000_000, 'x', T0);
    let bought = 0;
    for (const l of c.s.market.listings.slice()) { if (l.endsAt > T0 && c.buyNow(l.id, T0).ok) bought++; }
    expect(bought).toBeLessThanOrEqual(ECONOMY.marketActionsPerDay);
    expect(bought).toBeGreaterThan(5);
    // al día siguiente se renueva
    c.tick(T0 + DAY);
    const l = c.s.market.listings.find((x) => x.endsAt > T0 + DAY)!;
    expect(c.buyNow(l.id, T0 + DAY).ok).toBe(true);
    expect(MAX_INVENTORY).toBeGreaterThan(100);
  });
  it('comprar y vender repetidamente nunca genera monedas', () => {
    const c = mk();
    addTx(c.s, 'reward', 200_000, 'x', T0);
    const start = c.s.coins;
    let t = T0;
    for (let day = 0; day < 5; day++) {
      t = T0 + day * DAY;
      c.tick(t);
      for (const l of c.s.market.listings.filter((x) => x.endsAt > t).slice(0, 10)) {
        const r = c.buyNow(l.id, t);
        if (r.ok) c.quickSell(r.value.uid, t); // la venta rápida paga menos que la compra
      }
    }
    expect(c.s.coins).toBeLessThan(start);
    expect(sumLedger(c)).toBe(c.s.coins);
  });
});

describe('Club · progreso y recompensas', () => {
  it('niveles crecientes', () => {
    expect(levelOf(0)).toBe(1);
    expect(xpForLevel(2)).toBeGreaterThan(0);
    expect(levelOf(xpForLevel(10))).toBe(10);
    expect(levelOf(xpForLevel(10) - 1)).toBe(9);
  });
  it('la recompensa de inicio de sesión se reclama una vez al día y la racha avanza', () => {
    const c = mk();
    const a = c.claimLogin(T0);
    expect(a.ok).toBe(true);
    expect(c.claimLogin(T0 + 3600_000).ok).toBe(false);
    const coins = c.s.coins;
    expect(c.claimLogin(T0 + DAY).ok).toBe(true);
    expect(c.s.progress.loginStreak).toBe(2);
    expect(c.s.coins).toBeGreaterThanOrEqual(coins);
    c.claimLogin(T0 + 5 * DAY); // se rompe la racha
    expect(c.s.progress.loginStreak).toBe(1);
  });
  it('los objetivos se reclaman una sola vez y solo si están completos', () => {
    const c = mk();
    c.tick(T0);
    const o = c.s.progress.daily.objectives[0];
    expect(c.claimObjective('daily', o.id, T0).ok).toBe(false); // sin completar
    o.progress = 9999;
    const first = c.claimObjective('daily', o.id, T0);
    expect(first.ok).toBe(true);
    const coins = c.s.coins;
    expect(c.claimObjective('daily', o.id, T0).ok).toBe(false);
    expect(c.s.coins).toBe(coins);
    // al día siguiente hay objetivos nuevos
    c.tick(T0 + DAY);
    expect(c.s.progress.daily.claimed.length).toBe(0);
  });
  it('hitos de club y de temporada: una vez', () => {
    const c = mk();
    expect(c.claimMilestone('m_win1', T0).ok).toBe(false);
    c.s.records.won = 1;
    expect(c.claimMilestone('m_win1', T0).ok).toBe(true);
    expect(c.claimMilestone('m_win1', T0).ok).toBe(false);
    c.s.progress.season.points = 150;
    expect(c.claimPass('free', 1, T0).ok).toBe(true);
    expect(c.claimPass('free', 1, T0).ok).toBe(false);
    expect(c.claimPass('free', 2, T0).ok).toBe(false);
    expect(c.claimPass('premium', 1, T0).ok).toBe(false);
  });
});

describe('Club · partidos y competiciones', () => {
  const play = (c: Club, kind: Parameters<Club['prepareMatch']>[0], opts: Parameters<Club['prepareMatch']>[2], gf: number, ga: number, t: number, extra = {}) => {
    const p = c.prepareMatch(kind, t, opts, seeded(4));
    if (!p.ok) throw new Error(p.error);
    return { p: p.value, out: c.finishMatch(p.value.meta, { gf, ga, passes: 100, passesOk: 80, shots: 8, tackles: 12, halfMinutes: 4, ...extra }, t) };
  };
  it('un partido se contabiliza una sola vez y da monedas, XP y récords', () => {
    const c = mk();
    const p = c.prepareMatch('rivals', T0, {}, seeded(1));
    if (!p.ok) throw new Error(p.error);
    const coins = c.s.coins;
    const out = c.finishMatch(p.value.meta, { gf: 2, ga: 0, passes: 90, passesOk: 70, shots: 7, tackles: 9, halfMinutes: 4 }, T0)!;
    expect(out.result).toBe('W');
    expect(c.s.coins).toBe(coins + out.coins + out.levelCoins);
    expect(out.coins).toBeGreaterThan(400);
    expect(c.s.records.won).toBe(1);
    expect(c.s.records.cleanSheets).toBe(1);
    expect(c.s.rivals.points).toBe(30);
    expect(c.finishMatch(p.value.meta, { gf: 9, ga: 0, passes: 0, passesOk: 0, shots: 0, tackles: 0, halfMinutes: 4 }, T0)).toBeNull(); // repetido
    expect(c.s.coins).toBe(coins + out.coins + out.levelCoins);
    expect(sumLedger(c)).toBe(c.s.coins);
  });
  it('el premio baja con partidos muy cortos y tras 12 partidos al día', () => {
    const c = mk();
    const short = play(c, 'rivals', {}, 1, 0, T0, { halfMinutes: 1 });
    const full = play(c, 'rivals', {}, 1, 0, T0);
    expect(short.out!.coins).toBeLessThan(full.out!.coins);
    for (let i = 0; i < 12; i++) play(c, 'rivals', {}, 1, 0, T0);
    const late = play(c, 'rivals', {}, 1, 0, T0);
    expect(late.out!.coins).toBeLessThan(full.out!.coins * 0.5);
  });
  it('abandonar cuenta como derrota sin premio', () => {
    const c = mk();
    const p = c.prepareMatch('rivals', T0, {}, seeded(1));
    if (!p.ok) throw new Error(p.error);
    const coins = c.s.coins;
    const out = c.finishMatch(p.value.meta, { gf: 5, ga: 0, passes: 0, passesOk: 0, shots: 0, tackles: 0, halfMinutes: 4, forfeit: true }, T0)!;
    expect(out.result).toBe('L');
    expect(c.s.coins).toBe(coins);
    expect(c.s.records.lost).toBe(1);
  });
  it('los amistosos no cambian nada', () => {
    const c = mk();
    const snapshot = JSON.stringify({ r: c.s.records, coins: c.s.coins, xp: c.s.xp, riv: c.s.rivals });
    const { out } = play(c, 'friendly', { oppId: TEAMS[3].id }, 4, 0, T0);
    expect(out!.coins).toBe(0);
    expect(JSON.stringify({ r: c.s.records, coins: c.s.coins, xp: c.s.xp, riv: c.s.rivals })).toBe(snapshot);
  });
  it('divisiones de Rivals', () => {
    expect(rivalsDivision(0)).toBe(10);
    expect(rivalsDivision(100)).toBe(9);
    expect(rivalsDivision(5000)).toBe(1);
  });
  it('Rivals: la recompensa semanal pide 5 partidos y se reclama una vez', () => {
    const c = mk();
    expect(c.claimRivals(T0).ok).toBe(false);
    for (let i = 0; i < 5; i++) play(c, 'rivals', {}, 1, 0, T0);
    expect(c.claimRivals(T0).ok).toBe(true);
    expect(c.claimRivals(T0).ok).toBe(false);
    // otra semana: se acredita sola lo que faltara y se reinicia el contador
    c.tick(T0 + 8 * DAY);
    expect(c.s.rivals.played).toBe(0);
    expect(c.s.rivals.claimed).toBe(false);
  });
  it('Squad Battles: una vez por batalla y día, premio solo si ganas', () => {
    const c = mk();
    const lose = play(c, 'battle', { battleId: 'b1' }, 0, 1, T0);
    expect(lose.out!.coins).toBeGreaterThan(0); // premio base de la derrota, sin el de la batalla
    expect(c.prepareMatch('battle', T0, { battleId: 'b1' }).ok).toBe(false);
    const coins = c.s.coins;
    const win = play(c, 'battle', { battleId: 'b2' }, 2, 0, T0);
    expect(c.s.coins).toBe(coins + win.out!.coins + win.out!.levelCoins);
    expect(win.out!.coins).toBeGreaterThan(BATTLES[1].reward.coins!);
    expect(c.prepareMatch('battle', T0 + DAY, { battleId: 'b1' }).ok).toBe(true);
  });
  it('Champions: requisitos, inscripción, 10 partidos y una sola recompensa', () => {
    const c = mk();
    expect(c.enterChampions(T0).ok).toBe(false); // nivel
    c.s.xp = 5000;
    addTx(c.s, 'reward', 10000, 'x', T0);
    c.s.rivals.points = 0;
    const weak = c.enterChampions(T0);
    expect(weak.ok).toBe(false); // valoración insuficiente con la plantilla inicial
    const golds = [...catalog().values()].filter((d) => d.rarity === 'gold' && d.ovr >= 76 && d.ovr <= 80).slice(0, 80);
    golds.forEach((d, i) => c.s.inventory.push({ uid: `g${i}`, defId: d.id, acquired: T0, source: 'test' }));
    c.autoBuild();
    const e = c.enterChampions(T0);
    if (!e.ok) throw new Error(e.error);
    expect(c.enterChampions(T0).ok).toBe(false);
    expect(c.claimChampions(T0).ok).toBe(false);
    for (let i = 0; i < CHAMPIONS.matches; i++) play(c, 'champions', {}, 2, 1, T0);
    expect(c.prepareMatch('champions', T0).ok).toBe(false);
    expect(c.claimChampions(T0).ok).toBe(true);
    expect(c.claimChampions(T0).ok).toBe(false);
    expect(sumLedger(c)).toBe(c.s.coins);
  });
  it('Torneo: requisito de plantilla, eliminatorias y recompensa única', () => {
    const c = mk();
    addTx(c.s, 'reward', 10000, 'x', T0);
    // buscamos una semana con la "Copa Abierta" (sin requisitos)
    let t = T0;
    for (let w = 0; w < 30; w++) { t = T0 + w * 7 * DAY; c.tick(t); const r = c.enterTournament(t); if (r.ok) break; if (w === 29) throw new Error('ninguna semana válida'); }
    expect(c.s.tournament).not.toBeNull();
    expect(c.enterTournament(t).ok).toBe(false);
    expect(c.claimTournament(t).ok).toBe(false);
    for (let r = 0; r < 3; r++) play(c, 'tournament', {}, 2, 0, t);
    expect(c.s.tournament!.finished).toBe(true);
    expect(c.prepareMatch('tournament', t).ok).toBe(false);
    expect(c.claimTournament(t).ok).toBe(true);
    expect(c.claimTournament(t).ok).toBe(false);
  });
  it('Desafíos de plantilla: consumen las cartas, respetan el límite y no usan cartas de plantillas', () => {
    const c = mk();
    c.tick(T0);
    const def = SBCS.find((d) => d.id === 'sbc_basic')!;
    const ids = c.s.inventory.map((x) => x.uid);
    expect(c.submitSbc(def.id, ids.slice(0, 11), T0).ok).toBe(false); // están en la plantilla
    // cartas libres: sobres
    addTx(c.s, 'reward', 100000, 'x', T0);
    const extra: string[] = [];
    for (let i = 0; i < 6 && extra.length < 11; i++) {
      const op = c.openPack('premium', false, T0, seeded(100 + i));
      if (!op.ok) throw new Error(op.error);
      for (const k of op.value.cards) { c.decideCard(op.value.id, k.uid, 'club', T0); extra.push(k.uid); }
    }
    const pick = extra.slice(0, 11);
    const n = c.s.inventory.length;
    const r = c.submitSbc(def.id, pick, T0);
    expect(r.ok).toBe(true);
    expect(c.s.inventory.length).toBe(n - 11);
    expect(c.submitSbc(def.id, pick, T0).ok).toBe(false); // ya no existen
    expect(c.s.packs.promo.basic).toBe(1);
    const dup = c.submitSbc(def.id, [pick[0], pick[0]], T0);
    expect(dup.ok).toBe(false);
  });
});

describe('Club · guardado', () => {
  beforeEach(() => Club.clear());
  it('el progreso sobrevive a cerrar y volver a abrir', () => {
    const c = mk();
    addTx(c.s, 'reward', 9000, 'x', T0);
    const op = c.openPack('basic', false, T0, seeded(8));
    if (!op.ok) throw new Error(op.error);
    c.keepAllPending(T0);
    const n = c.s.inventory.length;
    const coins = c.s.coins;
    const re = Club.load(T0 + 1000)!;
    expect(re.s.coins).toBe(coins);
    expect(re.s.inventory.length).toBe(n);
    expect(re.s.identity.name).toBe(ID.name);
    expect(re.s.squads[0].slots.every(Boolean)).toBe(true);
  });
  it('datos dañados se reparan (cartas inexistentes, repetidas y saldo manipulado)', () => {
    const c = mk();
    const copy = JSON.parse(JSON.stringify(c.s));
    copy.inventory.push({ uid: 'fantasma', defId: 'no-existe', acquired: 0, source: 'x' });
    copy.inventory.push({ ...copy.inventory[0] });
    copy.coins = 10_000_000;
    copy.squads[0].slots[0] = 'fantasma';
    const fixed = Club.sanitize(copy);
    expect(fixed.inventory.some((x) => x.uid === 'fantasma')).toBe(false);
    expect(new Set(fixed.inventory.map((x) => x.uid)).size).toBe(fixed.inventory.length);
    expect(fixed.coins).toBe(fixed.ledger.reduce((t, x) => t + x.amount, fixed.ledgerBase));
    expect(fixed.squads[0].slots[0]).toBeNull();
  });
  it('validación de la creación del club', () => {
    expect(Club.create({ ...ID, name: 'ab' }, '4-3-3').ok).toBe(false);
    expect(Club.create({ ...ID, primary: 'rojo' }, '4-3-3').ok).toBe(false);
    expect(Club.create(ID, '4-3-3').ok).toBe(true);
  });
});

describe('Club · evoluciones, pase, misiones y sobres nuevos', () => {
  const finish = (c: Club, gf: number, ga: number, t: number) => {
    const p = c.prepareMatch('rivals', t, {}, seeded(2));
    if (!p.ok) throw new Error(p.error);
    return c.finishMatch(p.value.meta, { gf, ga, passes: 50, passesOk: 40, shots: 5, tackles: 5, halfMinutes: 4 }, t)!;
  };
  it('una evolución sube de nivel a un titular y la carta evolucionada no se vende en el mercado', () => {
    const c = mk();
    const uid = c.squad.slots.find((u) => { const d = c.def(u)!; return d.group !== 'GK' && d.ovr <= 78; })!;
    const before = c.def(uid)!;
    expect(c.startEvo('rayo', uid, T0).ok).toBe(true);
    expect(c.startEvo('rayo', uid, T0).ok).toBe(false); // ya evoluciona
    finish(c, 1, 0, T0);
    const out = finish(c, 1, 0, T0 + 1000);
    expect(out.lines.some((l) => l.includes('nivel 1'))).toBe(true);
    const lv1 = c.def(uid)!;
    expect(lv1.evo?.level).toBe(1);
    expect(lv1.attrs.speed).toBe(Math.min(99, before.attrs.speed + 4));
    expect(c.squad.slots).toContain(uid); // sigue en la plantilla
    finish(c, 2, 0, T0 + 2000);
    finish(c, 2, 0, T0 + 3000);
    expect(c.def(uid)!.evo?.level).toBe(2);
    expect(c.evoOf(uid)).toBeUndefined();
    expect(getCardDef(c.card(uid)!.defId)?.id).toBe(c.card(uid)!.defId);
    c.removeAt({ kind: 'slot', i: c.squad.slots.indexOf(uid) });
    for (const q of c.s.squads) { q.slots = q.slots.map((u) => (u === uid ? null : u)); q.bench = q.bench.map((u) => (u === uid ? null : u)); }
    expect(c.list(uid, 1000, 1, T0).ok).toBe(false);
  });
  it('el pase: niveles por puntos, premium con monedas y reclamar todo una vez', () => {
    const c = mk();
    c.s.progress.season.points = 150 * 6;
    expect(c.claimAllPass(T0)).toBe(6);
    expect(c.claimAllPass(T0)).toBe(0);
    addTx(c.s, 'reward', 40000, 'x', T0);
    const coins = c.s.coins;
    expect(c.unlockPremiumPass(T0).ok).toBe(true);
    expect(c.s.coins).toBeLessThan(coins);
    expect(c.unlockPremiumPass(T0).ok).toBe(false);
    expect(c.claimAllPass(T0)).toBe(6);
    expect(sumLedger(c)).toBe(c.s.coins);
  });
  it('misiones: progreso por métricas, premio por tarea y por grupo', () => {
    const c = mk();
    expect(c.claimMission('ms_play1', T0).ok).toBe(false);
    finish(c, 1, 0, T0);
    expect(c.claimMission('ms_play1', T0).ok).toBe(true);
    expect(c.claimMission('ms_win1', T0).ok).toBe(true);
    expect(c.claimMission('ms_win1', T0).ok).toBe(false);
    expect(c.claimMissionGroup('g_start', T0).ok).toBe(false);
  });
  it('el sobre 82+ solo da cartas de 82 o más y el de leyenda, leyendas', () => {
    const rand = seeded(8);
    const p82 = PACKS.find((p) => p.id === 'pick82')!;
    const lg = PACKS.find((p) => p.id === 'legend')!;
    for (let i = 0; i < 200; i++) {
      expect(rollPack({ pack: p82, season: 's1', rand, owned: new Map(), pity: 0 }).defs.every((d) => d.ovr >= 82)).toBe(true);
      expect(rollPack({ pack: lg, season: 's1', rand, owned: new Map(), pity: 0 }).defs[0].rarity).toBe('legend');
    }
  });
  it('partido online del club: cuenta para los puntos online y las misiones', () => {
    const c = mk();
    const r = c.onlineTeam(T0);
    if (!r.ok) throw new Error(r.error);
    const out = c.finishMatch(r.value.meta, { gf: 2, ga: 1, passes: 10, passesOk: 8, shots: 3, tackles: 3, halfMinutes: 4 }, T0)!;
    expect(out.result).toBe('W');
    expect(c.s.online.won).toBe(1);
    expect(c.s.online.points).toBeGreaterThan(0);
    expect(c.claimMission('ms_on1', T0).ok).toBe(true);
  });
  it('la plantilla online del rival se valida (atributos 1..99, ids con prefijo, nada raro)', () => {
    const c = mk();
    const r = c.onlineTeam(T0);
    if (!r.ok) throw new Error(r.error);
    const raw = JSON.parse(JSON.stringify(r.value.team));
    raw.players[1].attrs.speed = 999;
    raw.name = '<img src=x>Club';
    const t = sanitizeOnlineTeam(raw, 'a-')!;
    expect(t.players.length).toBe(r.value.team.players.length);
    expect(t.players[1].attrs.speed).toBe(99);
    expect(t.players.every((p) => p.id.startsWith('a-'))).toBe(true);
    expect(t.name).not.toContain('<');
    expect(t.setPieces?.captain === undefined || t.setPieces.captain.startsWith('a-')).toBe(true);
    expect(sanitizeOnlineTeam({ ...raw, players: raw.players.slice(0, 5) })).toBeNull();
    expect(sanitizeOnlineTeam(null)).toBeNull();
  });
  it('los cinco tipos nuevos (Héroe, Ídolo, Relámpago, Titán, Maestro) existen, mejoran a su jugador y salen en sobres', () => {
    const all = [...catalog().values()];
    for (const r of ['hero', 'idol', 'flash', 'titan', 'maestro'] as const) {
      const ds = all.filter((d) => d.rarity === r);
      expect(ds.length).toBeGreaterThan(50);
      for (const d of ds.slice(0, 40)) {
        const base = getCardDef(d.playerId)!;
        expect(d.ovr).toBeGreaterThanOrEqual(base.ovr);
        expect(d.price).toBeGreaterThan(base.price);
      }
    }
    // un ídolo por club como mucho
    const idols = all.filter((d) => d.rarity === 'idol');
    expect(new Set(idols.map((d) => d.clubId)).size).toBe(idols.length);
    const special = PACKS.find((p) => p.id === 'special')!;
    const rand = seeded(13);
    const got = new Set<string>();
    for (let i = 0; i < 400; i++) for (const d of rollPack({ pack: special, season: 's1', rand, owned: new Map(), pity: 0 }).defs) got.add(d.rarity);
    for (const r of ['hero', 'idol', 'flash', 'titan', 'maestro']) expect(got.has(r)).toBe(true);
  });
  it('MOTM, TOTW, TOTM, TOTS y TOTY: cambian por periodo, son onces válidos y el sobre de destacados da los vigentes', () => {
    const now = T0;
    const w1 = periodDefs('totw', periodOf('totw', now, 's1'));
    const w2 = periodDefs('totw', periodOf('totw', now + 7 * DAY, 's1'));
    expect(w1.length).toBe(11);
    expect(w1.filter((d) => d.group === 'GK').length).toBe(1);
    expect(w1.map((d) => d.id).join()).not.toBe(w2.map((d) => d.id).join());
    expect(periodDefs('motm', periodOf('motm', now, 's1')).length).toBe(6);
    const toty = periodDefs('toty', periodOf('toty', now, 's1'));
    expect(toty.length).toBe(11);
    expect(Math.min(...toty.map((d) => d.ovr))).toBeGreaterThan(Math.min(...periodDefs('totm', periodOf('totm', now, 's1')).map((d) => d.ovr)) - 5);
    expect(periodDefs('tots', 's1').length).toBeGreaterThan(11 * 15);
    // la carta se encuentra por su id aunque ya no esté vigente, y mejora a la base
    for (const d of [...w1, ...toty]) {
      expect(getCardDef(d.id)?.id).toBe(d.id);
      expect(d.ovr).toBeGreaterThanOrEqual(getCardDef(d.playerId)!.ovr);
    }
    const stars = PACKS.find((p) => p.id === 'stars')!;
    const rand = seeded(17);
    const current = new Set(['motm', 'totw', 'totm', 'tots', 'toty'].flatMap((k) => periodDefs(k as never, periodOf(k as never, now, 's1')).map((d) => d.id)));
    for (let i = 0; i < 200; i++) {
      const r = rollPack({ pack: stars, season: 's1', rand, owned: new Map(), pity: 0, now });
      const special = r.defs.filter((d) => ['motm', 'totw', 'totm', 'tots', 'toty'].includes(d.rarity));
      expect(special.length).toBeGreaterThan(0);
      for (const d of special) expect(current.has(d.id)).toBe(true);
    }
  });
});
