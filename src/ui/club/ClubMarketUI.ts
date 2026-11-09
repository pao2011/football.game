import '../club-market.css';
import { LEAGUES, getLeague, leagueLogo } from '../../data/leagues';
import { catalog, getCardDef, STAT_KEYS, statLabels } from '../../modes/club/catalog';
import { linkScore } from '../../modes/club/chemistry';
import { ECONOMY } from '../../modes/club/economy';
import { actionsLeft, heldCoins, listPriceBand, minNextBid, searchListings, usedInSquads, type MarketFilters } from '../../modes/club/market';
import { defOfUid } from '../../modes/club/squads';
import { RARITIES, RARITY_NAMES, type CardDef, type Listing, type Rarity } from '../../modes/club/types';
import { el, esc } from '../dom';
import { cardHTML, fmt, miniCardHTML } from './cards';
import type { ClubHost } from './host';

// Mercado de Soffti Club (pantalla). Es un mercado LOCAL SIMULADO: no hay otros jugadores reales; las pujas y las ventas se
// resuelven con probabilidades (ver modes/club/market.ts). Pestañas: Comprar · Vender · Seguimiento · Historial.

type Tab = 'buy' | 'sell' | 'watch' | 'hist';
const TABS: { id: Tab; label: string }[] = [
  { id: 'buy', label: 'Comprar' }, { id: 'sell', label: 'Vender' }, { id: 'watch', label: 'Seguimiento' }, { id: 'hist', label: 'Historial' },
];
const GROUPS: [string, string][] = [['', 'Todas'], ['GK', 'POR'], ['DEF', 'DEF'], ['MID', 'MED'], ['FWD', 'DEL']];
const SORTS: [NonNullable<MarketFilters['sort']>, string][] = [['ovr', 'Valoración'], ['price', 'Precio (mayor)'], ['priceAsc', 'Precio (menor)'], ['ends', 'Termina antes'], ['name', 'Nombre']];

const num = (v: string): number | undefined => {
  const n = parseInt(v.replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function fmtLeft(ms: number): string {
  if (ms <= 0) return 'Terminada';
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const fmtDate = (at: number) => new Date(at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Estimación cualitativa de la probabilidad de venta (misma curva que usa el motor al cerrar la venta). */
function saleChance(price: number, d: CardDef): { label: string; cls: string } {
  const p = Math.min(0.97, Math.max(0.1, 1.32 - (price / d.price) * 0.9));
  return p >= 0.75 ? { label: 'alta', cls: 'hi' } : p >= 0.45 ? { label: 'media', cls: 'mid' } : { label: 'baja', cls: 'lo' };
}

export function marketScreen(host: ClubHost): void {
  const club = host.club;
  const short = typeof window !== 'undefined' && !!window.matchMedia?.('(max-height: 520px)').matches;

  // ---- estado de la pantalla (persiste mientras está abierta) ----
  let tab: Tab = 'buy';
  const F = { text: '', group: '', minOvr: '', maxOvr: '', league: '', nat: '', rarity: '', minPrice: '', maxPrice: '', watchOnly: false, sort: 'ovr' as NonNullable<MarketFilters['sort']> };
  const S = { text: '', sort: 'ovr' };
  let filtersOpen = !short;
  let cmp: string[] = [];
  let limit = 40;
  let histLimit = 100;
  let modal: HTMLElement | null = null;
  let onYes: (() => void) | null = null;

  const cat = [...catalog().values()];
  const nats = [...new Set(cat.map((d) => d.nat))].sort((a, b) => a.localeCompare(b, 'es'));
  const leagueIds = new Set(cat.map((d) => d.league).filter(Boolean));
  const leagues = LEAGUES.filter((l) => leagueIds.has(l.id));

  const filters = (): MarketFilters => ({
    text: F.text, group: F.group as MarketFilters['group'], minOvr: num(F.minOvr), maxOvr: num(F.maxOvr), league: F.league, nat: F.nat,
    rarity: F.rarity as Rarity | '', minPrice: num(F.minPrice), maxPrice: num(F.maxPrice), watchOnly: F.watchOnly, sort: F.sort,
  });

  // ---------------- piezas de HTML ----------------
  const statsHTML = () => {
    const s = club.s;
    const held = heldCoins(s);
    const left = actionsLeft(s, host.now());
    return `
      <div class="cm-chip"><small>Saldo</small><b class="num">${fmt(s.coins)} ⓒ</b></div>
      <div class="cm-chip"><small>Retenidas por pujas</small><b class="num ${held ? 'warn' : ''}">${fmt(held)} ⓒ</b></div>
      <div class="cm-chip"><small>Disponible</small><b class="num ok">${fmt(Math.max(0, s.coins - held))} ⓒ</b></div>
      <div class="cm-chip"><small>Operaciones hoy</small><b class="num ${left <= 5 ? 'warn' : ''}">${left} / ${ECONOMY.marketActionsPerDay}</b></div>`;
  };

  const optionsHTML = (opts: [string, string][], cur: string) => opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');

  const toolsHTML = (): string => {
    if (tab === 'buy') {
      const leagueOpts: [string, string][] = [['', 'Todas las ligas'], ...leagues.map((l) => [l.id, l.name] as [string, string])];
      const natOpts: [string, string][] = [['', 'Todas'], ...nats.map((n) => [n, n] as [string, string])];
      const rarOpts: [string, string][] = [['', 'Todas'], ...RARITIES.map((r) => [r, RARITY_NAMES[r]] as [string, string])];
      return `
      <div class="cm-bar">
        <input class="text-in cm-q" type="search" data-f="text" value="${esc(F.text)}" placeholder="Buscar jugador, equipo o país…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Buscar carta">
        <div class="cm-seg" role="group" aria-label="Posición">${GROUPS.map(([v, l]) => `<button class="cm-segb${F.group === v ? ' on' : ''}" data-act="group" data-v="${v}">${l}</button>`).join('')}</div>
        <label class="cm-fl">Orden<select data-f="sort">${optionsHTML(SORTS, F.sort)}</select></label>
        <button class="cm-btn" data-act="toggleFilters" aria-expanded="${filtersOpen}">Filtros ${filtersOpen ? '▴' : '▾'}</button>
        <span class="cm-count muted num"></span>
      </div>
      <div class="cm-adv${filtersOpen ? ' open' : ''}">
        <label class="cm-fl">Valoración mín.<input class="text-in" inputmode="numeric" data-f="minOvr" value="${esc(F.minOvr)}" placeholder="0"></label>
        <label class="cm-fl">Valoración máx.<input class="text-in" inputmode="numeric" data-f="maxOvr" value="${esc(F.maxOvr)}" placeholder="99"></label>
        <label class="cm-fl">Liga<select data-f="league">${optionsHTML(leagueOpts, F.league)}</select></label>
        <label class="cm-fl">Nacionalidad<select data-f="nat">${optionsHTML(natOpts, F.nat)}</select></label>
        <label class="cm-fl">Rareza<select data-f="rarity">${optionsHTML(rarOpts, F.rarity)}</select></label>
        <label class="cm-fl">Precio mín.<input class="text-in" inputmode="numeric" data-f="minPrice" value="${esc(F.minPrice)}" placeholder="0"></label>
        <label class="cm-fl">Precio máx.<input class="text-in" inputmode="numeric" data-f="maxPrice" value="${esc(F.maxPrice)}" placeholder="sin límite"></label>
        <label class="cm-chk"><input type="checkbox" data-f="watchOnly"${F.watchOnly ? ' checked' : ''}> Solo seguimiento ⭐</label>
        <button class="cm-btn" data-act="clearFilters">Limpiar</button>
      </div>`;
    }
    if (tab === 'sell') {
      return `
      <div class="cm-bar">
        <input class="text-in cm-q" type="search" data-f="sellText" value="${esc(S.text)}" placeholder="Buscar en tu club…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Buscar en tu club">
        <label class="cm-fl">Orden<select data-f="sellSort">${optionsHTML([['ovr', 'Valoración'], ['price', 'Valor de mercado'], ['name', 'Nombre']], S.sort)}</select></label>
        <span class="cm-count muted num"></span>
      </div>`;
    }
    return '';
  };

  /** Fila de un listado del mercado (o de una carta en seguimiento que ahora no está a la venta). */
  const rowHTML = (d: CardDef, l: Listing | null): string => {
    const s = club.s;
    const watched = s.market.watch.includes(d.id);
    const mine = !!l && l.bidder === 'user';
    const league = d.league ? getLeague(d.league) : null;
    const logo = league ? leagueLogo(league.id) : undefined;
    const meta = `<span class="cm-pos">${d.role}</span> ${esc(d.clubName || 'Leyenda')}${league ? ` · ${logo ? `<img class="cm-lg" src="${logo}" alt="" loading="lazy">` : ''}${esc(league.name)}` : ''} · ${esc(d.nat)} · ${d.age} años`;
    const common = `
      <div class="cm-card">${cardHTML(d, { size: 'sm' })}</div>`;
    const side = `<div class="cm-side">
        <button class="cm-ico${watched ? ' on' : ''}" data-act="watch" data-def="${d.id}" title="${watched ? 'Dejar de seguir' : 'Seguir'}" aria-label="Seguir">⭐</button>
        <button class="cm-ico cmp${cmp.includes(d.id) ? ' on' : ''}" data-act="cmp" data-def="${d.id}" title="Comparar (hasta 2)" aria-label="Comparar">⇄</button>
      </div>`;
    if (!l) {
      return `<article class="cm-row r-${d.rarity}" data-def="${d.id}">${common}
        <div class="cm-info"><h4>${esc(d.name)}</h4><div class="cm-meta">${meta}</div>
          <div class="cm-prices"><div><small>Valor de mercado</small><b class="num">${fmt(d.price)} ⓒ</b></div></div>
          <p class="cm-off muted">No está en el mercado en este momento.</p></div>${side}</article>`;
    }
    const minBid = minNextBid(l);
    return `<article class="cm-row r-${d.rarity}${mine ? ' mine' : ''}" data-lid="${l.id}" data-def="${d.id}">${common}
      <div class="cm-info">
        <h4>${esc(d.name)}${mine ? '<span class="cm-tag">Tu puja</span>' : ''}</h4>
        <div class="cm-meta">${meta}</div>
        <div class="cm-prices">
          <div><small>Compra ya</small><b class="num">${fmt(l.buyNow)} ⓒ</b></div>
          <div><small>${l.bid ? 'Puja actual' : 'Puja inicial'}</small><b class="num ${mine ? 'ok' : ''}">${fmt(l.bid || l.startBid)} ⓒ</b></div>
          <div><small>Mínima</small><b class="num">${fmt(minBid)} ⓒ</b></div>
          <div><small>Termina en</small><b class="num cm-time" data-end="${l.endsAt}">${fmtLeft(l.endsAt - host.now())}</b></div>
        </div>
        <div class="cm-acts">
          <button class="cm-btn primary" data-act="buy"${mine ? ' disabled title="Ya tienes la puja más alta"' : ''}>Comprar ya</button>
          <span class="cm-bidbox"><input class="text-in cm-bid" inputmode="numeric" data-enter="bid" value="${minBid}" aria-label="Importe de la puja"><button class="cm-btn" data-act="bid">Pujar</button></span>
        </div>
      </div>${side}</article>`;
  };

  const emptyHTML = (t: string) => `<p class="cm-empty muted">${t}</p>`;

  const buyHTML = (): { html: string; count: number } => {
    const found = searchListings(club.s, filters(), host.now());
    const shown = found.slice(0, limit);
    let html = shown.map(({ listing, def }) => rowHTML(def, listing)).join('');
    if (!shown.length) html = emptyHTML('Ninguna carta del mercado coincide con los filtros. El mercado se renueva cada 3 horas.');
    else if (found.length > shown.length) html += `<button class="cm-btn cm-more" data-act="more">Mostrar más (${found.length - shown.length})</button>`;
    return { html: `<div class="cm-list">${html}</div>`, count: found.length };
  };

  const watchHTML = (): string => {
    const s = club.s;
    const now = host.now();
    const rows: string[] = [];
    for (const defId of s.market.watch) {
      const d = getCardDef(defId);
      if (!d) continue;
      const l = s.market.listings.find((x) => x.defId === defId && x.endsAt > now) ?? null;
      rows.push(rowHTML(d, l));
    }
    return `<p class="cm-hint muted">Cartas que sigues (máx. 50). Si están en el mercado, ves aquí su oferta actual.</p>` +
      (rows.length ? `<div class="cm-list">${rows.join('')}</div>` : emptyHTML('No sigues ninguna carta. Pulsa ⭐ en el mercado para añadirla.'));
  };

  const sellHTML = (): { html: string; count: number } => {
    const s = club.s;
    const now = host.now();
    const words = S.text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
    const all = s.inventory.map((c) => ({ c, d: getCardDef(c.defId)! })).filter((x) => x.d);
    const free = all.filter((x) => !usedInSquads(s, x.c.uid));
    const blocked = all.length - free.length;
    let items = free.filter((x) => {
      if (!words.length) return true;
      const hay = `${x.d.name} ${x.d.clubName} ${x.d.nat}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    items.sort((a, b) => S.sort === 'price' ? b.d.price - a.d.price : S.sort === 'name' ? a.d.name.localeCompare(b.d.name, 'es') : b.d.ovr - a.d.ovr || b.d.price - a.d.price);
    const total = items.length;
    items = items.slice(0, limit);

    const mine = s.market.mine.map((m) => {
      const d = getCardDef(m.card.defId);
      if (!d) return '';
      const fee = Math.floor(m.price * ECONOMY.marketFee);
      const ch = saleChance(m.price, d);
      return `<article class="cm-my" data-id="${m.id}">
        <div class="cm-mc">${miniCardHTML(d, { cls: 'cm-mini' })}</div>
        <div class="cm-info"><h4>${esc(d.name)}</h4>
          <div class="cm-meta">Precio <b class="num">${fmt(m.price)} ⓒ</b> · recibirías <b class="num ok">${fmt(m.price - fee)} ⓒ</b> · prob. de venta <span class="cm-p ${ch.cls}">${ch.label}</span></div>
          <div class="cm-meta">Termina en <b class="num cm-time" data-end="${m.endsAt}">${fmtLeft(m.endsAt - now)}</b></div></div>
        <button class="cm-btn" data-act="unlist">Retirar</button></article>`;
    }).join('');

    const cards = items.map(({ c, d }) => {
      const band = listPriceBand(d);
      const price = Math.min(band.max, Math.max(band.min, d.price));
      const fee = Math.floor(price * ECONOMY.marketFee);
      const ch = saleChance(price, d);
      const quick = Math.max(10, Math.round(d.price * ECONOMY.quickSell));
      return `<article class="cm-row sell r-${d.rarity}" data-uid="${c.uid}" data-def="${d.id}">
        <div class="cm-card">${cardHTML(d, { size: 'sm' })}</div>
        <div class="cm-info">
          <h4>${esc(d.name)}</h4>
          <div class="cm-meta"><span class="cm-pos">${d.role}</span> ${esc(d.clubName || 'Leyenda')} · ${esc(d.nat)} · valor de mercado <b class="num">${fmt(d.price)} ⓒ</b></div>
          <div class="cm-acts">
            <label class="cm-fl">Precio (${fmt(band.min)} – ${fmt(band.max)})<input class="text-in cm-sp" inputmode="numeric" data-min="${band.min}" data-max="${band.max}" data-price="${d.price}" data-enter="list" value="${price}"></label>
            <label class="cm-fl">Duración<select class="cm-sh"><option value="1">1 hora</option><option value="3" selected>3 horas</option><option value="6">6 horas</option></select></label>
          </div>
          <div class="cm-recv meta">${recvText(price, d)}</div>
          <div class="cm-acts">
            <button class="cm-btn primary" data-act="list">Poner a la venta</button>
            <button class="cm-btn" data-act="qsell">Venta rápida · +${fmt(quick)} ⓒ</button>
          </div>
        </div>
      </article>`;
    }).join('');

    const html = `
      <div class="cm-explain">
        <p><b>Cómo vender.</b> Una carta solo se puede vender si <b>no está en ninguna de tus plantillas</b> (titulares ni suplentes): quítala de la plantilla primero${blocked ? ` · ahora hay ${fmt(blocked)} carta${blocked === 1 ? '' : 's'} en plantillas que no aparece${blocked === 1 ? '' : 'n'} aquí` : ''}.</p>
        <p>Al ponerla a la venta, el mercado simulado decide al terminar el tiempo si se vende, según lo caro que la pongas respecto a su valor. Comisión del ${Math.round(ECONOMY.marketFee * 100)} % solo si se vende. La venta rápida paga el ${Math.round(ECONOMY.quickSell * 100)} % del valor al instante.</p>
      </div>
      <h3 class="cm-h">Tus ventas activas <span class="muted num">${s.market.mine.length} / 20</span></h3>
      ${mine ? `<div class="cm-mylist">${mine}</div>` : emptyHTML('No tienes cartas a la venta.')}
      <h3 class="cm-h">Cartas disponibles para vender <span class="muted num">${fmt(total)}</span></h3>
      ${cards ? `<div class="cm-list">${cards}</div>` : emptyHTML(free.length ? 'Ninguna carta coincide con la búsqueda.' : 'No tienes cartas libres: todas están en plantillas o a la venta.')}
      ${total > items.length ? `<button class="cm-btn cm-more" data-act="more">Mostrar más (${total - items.length})</button>` : ''}`;
    return { html, count: total };
  };

  const recvText = (price: number, d: CardDef): string => {
    if (!Number.isInteger(price) || price <= 0) return 'Escribe un precio.';
    const fee = Math.floor(price * ECONOMY.marketFee);
    const ch = saleChance(price, d);
    return `Comisión ${Math.round(ECONOMY.marketFee * 100)} % (−${fmt(fee)}) · recibirías <b class="num ok">${fmt(price - fee)} ⓒ</b> · prob. de venta <span class="cm-p ${ch.cls}">${ch.label}</span>`;
  };

  const histHTML = (): string => {
    const s = club.s;
    const res = s.market.results.map((r) => `<li><span class="cm-when num">${fmtDate(r.at)}</span><span class="cm-txt">${esc(r.text)}</span>${r.coins !== undefined ? `<b class="num ${r.coins >= 0 ? 'ok' : 'bad'}">${r.coins >= 0 ? '+' : ''}${fmt(r.coins)}</b>` : ''}</li>`).join('');
    const led = [...s.ledger].reverse();
    const rows = led.slice(0, histLimit).map((t) => `<tr><td class="num">${fmtDate(t.at)}</td><td>${esc(t.note)}</td><td class="num ${t.amount >= 0 ? 'ok' : 'bad'}">${t.amount >= 0 ? '+' : ''}${fmt(t.amount)}</td><td class="num">${fmt(t.balance)}</td></tr>`).join('');
    return `
      <p class="cm-hint muted">Historial LOCAL: se guarda solo en este dispositivo (últimos ${ECONOMY.ledgerKeep} movimientos y 40 avisos). No hay cuenta ni servidor.</p>
      <h3 class="cm-h">Resultados del mercado</h3>
      ${res ? `<ul class="cm-results">${res}</ul>` : emptyHTML('Todavía no hay avisos: aparecerán al terminar tus pujas y ventas.')}
      <h3 class="cm-h">Libro de movimientos <span class="muted num">${fmt(led.length)}</span></h3>
      ${rows ? `<div class="cm-tablewrap"><table class="cm-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Saldo</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyHTML('Sin movimientos.')}
      ${led.length > histLimit ? `<button class="cm-btn cm-more" data-act="more">Mostrar más (${led.length - histLimit})</button>` : ''}`;
  };

  const cmpHTML = (): string => {
    if (!cmp.length) return '';
    const s = club.s;
    const defs = cmp.map((id) => getCardDef(id)).filter((d): d is CardDef => !!d);
    if (!defs.length) return '';
    const starters = s.squads[s.activeSquad]?.slots.map((u) => defOfUid(s, u)).filter((d): d is CardDef => !!d) ?? [];
    const buyPrice = (d: CardDef) => s.market.listings.find((l) => l.defId === d.id && l.endsAt > host.now())?.buyNow;
    const chem = (d: CardDef) => {
      const others = starters.filter((x) => x.id !== d.id);
      if (!others.length) return { v: 0, t: 'Sin titulares' };
      const sc = others.map((x) => linkScore(d, x));
      const v = sc.reduce((a, b) => a + b, 0) / others.length;
      return { v, t: `${v.toFixed(1)} / 3 · ${sc.filter((x) => x >= 1).length} vínculos` };
    };
    type Row = { label: string; vals: (string | number)[]; better?: 'hi' | 'lo'; raw?: (number | undefined)[] };
    const labels = statLabels(defs[0]);
    const rows: Row[] = [
      { label: 'Valoración', vals: defs.map((d) => d.ovr), better: 'hi', raw: defs.map((d) => d.ovr) },
      ...STAT_KEYS.map((k, i) => ({ label: labels[i], vals: defs.map((d) => d.stats[k]), better: 'hi' as const, raw: defs.map((d) => d.stats[k]) })),
      { label: 'Edad', vals: defs.map((d) => `${d.age} años`) },
      { label: 'Compra ya', vals: defs.map((d) => { const p = buyPrice(d); return p ? `${fmt(p)} ⓒ` : 'No está a la venta'; }), better: 'lo', raw: defs.map(buyPrice) },
      { label: 'Valor de mercado', vals: defs.map((d) => `${fmt(d.price)} ⓒ`), better: 'lo', raw: defs.map((d) => d.price) },
      { label: 'Química potencial', vals: defs.map((d) => chem(d).t), better: 'hi', raw: defs.map((d) => chem(d).v) },
    ];
    const cls = (r: Row, i: number) => {
      if (!r.better || !r.raw || defs.length < 2) return '';
      const a = r.raw[0], b = r.raw[1];
      if (a === undefined || b === undefined || a === b) return '';
      return (r.better === 'hi' ? a > b : a < b) === (i === 0) ? 'best' : '';
    };
    return `<section class="cm-cmpbox">
      <div class="cm-cmphead"><h3 class="cm-h">Comparar</h3><button class="cm-btn" data-act="cmpClear">Cerrar comparación</button></div>
      <div class="cm-cmpgrid" style="--n:${defs.length}">
        <div class="cm-cmpcards">${defs.map((d) => `<div class="cm-cc">${cardHTML(d, { size: 'sm' })}<b>${esc(d.name)}</b></div>`).join('')}</div>
        <table class="cm-table cm-cmptable"><tbody>${rows.map((r) => `<tr><th>${r.label}</th>${r.vals.map((v, i) => `<td class="num ${cls(r, i)}">${typeof v === 'number' ? v : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>
      <p class="cm-hint muted">Química potencial: vínculo medio (club, nacionalidad, liga) con los titulares de tu plantilla activa.${defs.length < 2 ? ' Elige otra carta con ⇄ para compararlas.' : ''}</p>
    </section>`;
  };

  // ---------------- esqueleto y pintado ----------------
  const shellHTML = () => `
    <div class="cm-shell">
      <div class="screen-header cm-header">
        <div><div class="crumb">SOFFTI CLUB</div><h2>Mercado de transferencias</h2></div>
        <span class="cm-sim" title="Las cartas y ofertas las genera el propio juego; las pujas y ventas se resuelven con probabilidades.">Mercado local simulado · no hay otros jugadores reales</span>
        <button class="cm-btn cm-back" data-act="back">Volver</button>
      </div>
      <p class="cm-note muted">Las cartas las genera el juego (se renueva cada 3 h) y tus pujas y ventas se resuelven con probabilidades al terminar el tiempo. Una puja no se puede retirar.</p>
      <div class="cm-stats">${statsHTML()}</div>
      <nav class="cm-tabs" role="tablist">${TABS.map((t) => `<button class="cm-tab${t.id === tab ? ' on' : ''}" role="tab" aria-selected="${t.id === tab}" data-act="tab" data-t="${t.id}">${t.label}</button>`).join('')}</nav>
      <div class="cm-tools">${toolsHTML()}</div>
      <div class="cm-scroll"><div class="cm-cmp">${cmpHTML()}</div><div class="cm-content"></div></div>
    </div>`;

  const q = <T extends HTMLElement>(sel: string) => s.root.querySelector(sel) as T | null;

  const paintStatus = () => { const e = q('.cm-stats'); if (e) e.innerHTML = statsHTML(); };
  const paintCmp = () => {
    const e = q('.cm-cmp');
    if (e) e.innerHTML = cmpHTML();
    s.root.querySelectorAll<HTMLElement>('[data-act="cmp"]').forEach((b) => b.classList.toggle('on', cmp.includes(b.dataset.def!)));
  };
  const paintContent = () => {
    const box = q('.cm-content');
    if (!box) return;
    const scroll = q('.cm-scroll');
    const top = scroll ? scroll.scrollTop : 0;
    let count: number | null = null;
    if (tab === 'buy') { const r = buyHTML(); box.innerHTML = r.html; count = r.count; }
    else if (tab === 'sell') { const r = sellHTML(); box.innerHTML = r.html; count = r.count; }
    else if (tab === 'watch') box.innerHTML = watchHTML();
    else box.innerHTML = histHTML();
    const c = q('.cm-count');
    if (c && count !== null) c.textContent = `${fmt(count)} ${tab === 'buy' ? 'resultados' : 'cartas'}`;
    if (scroll) scroll.scrollTop = top;
    s.applyFocus();
  };
  const paintAll = () => { paintStatus(); paintCmp(); paintContent(); };
  const paintTab = () => {
    club.tick(host.now());
    q('.cm-tools')!.innerHTML = toolsHTML();
    s.root.querySelectorAll<HTMLElement>('.cm-tab').forEach((b) => { const on = b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    q('.cm-cmp')!.style.display = tab === 'buy' || tab === 'watch' ? '' : 'none';
    limit = 40; histLimit = 100;
    const scroll = q('.cm-scroll'); if (scroll) scroll.scrollTop = 0;
    paintAll();
  };

  // ---------------- confirmación ----------------
  const closeModal = () => {
    if (!modal) return;
    modal.remove();
    modal = null; onYes = null;
    const shell = q('.cm-shell');
    if (shell) shell.style.display = '';
    const sc = q('.cm-scroll');
    if (sc) sc.scrollTop = savedScroll;
    s.applyFocus();
  };
  let savedScroll = 0;
  const confirm = (title: string, body: string, yes: string, fn: () => void) => {
    if (modal) return;
    const shell = q('.cm-shell');
    if (!shell) return;
    savedScroll = q('.cm-scroll')?.scrollTop ?? 0;
    shell.style.display = 'none';
    modal = el('div', 'cm-modal', `<div class="cm-dialog" role="dialog" aria-modal="true"><h3>${title}</h3><div class="cm-dbody">${body}</div>
      <div class="cm-dacts"><button class="cm-btn" data-act="no">Cancelar</button><button class="cm-btn primary" data-act="yes">${yes}</button></div></div>`);
    s.root.appendChild(modal);
    onYes = fn;
    (s as unknown as { focusIdx: number }).focusIdx = 1;
    s.applyFocus();
  };

  const rowListing = (t: HTMLElement): { l: Listing; d: CardDef; row: HTMLElement } | null => {
    const row = t.closest<HTMLElement>('.cm-row');
    const l = club.s.market.listings.find((x) => x.id === row?.dataset.lid);
    const d = l ? getCardDef(l.defId) : undefined;
    if (!row || !l || !d) { host.toast('Esa carta ya no está disponible.', 'err'); paintAll(); return null; }
    return { l, d, row };
  };

  const handlers: Record<string, (t: HTMLElement) => void> = {
    back: () => host.hub(),
    tab: (t) => { tab = t.dataset.t as Tab; paintTab(); },
    group: (t) => { F.group = t.dataset.v ?? ''; limit = 40; s.root.querySelectorAll<HTMLElement>('.cm-segb').forEach((b) => b.classList.toggle('on', b.dataset.v === F.group)); paintContent(); },
    toggleFilters: (t) => { filtersOpen = !filtersOpen; q('.cm-adv')?.classList.toggle('open', filtersOpen); t.textContent = `Filtros ${filtersOpen ? '▴' : '▾'}`; t.setAttribute('aria-expanded', String(filtersOpen)); },
    clearFilters: () => {
      Object.assign(F, { text: '', group: '', minOvr: '', maxOvr: '', league: '', nat: '', rarity: '', minPrice: '', maxPrice: '', watchOnly: false, sort: 'ovr' });
      limit = 40; q('.cm-tools')!.innerHTML = toolsHTML(); paintContent();
    },
    more: () => { if (tab === 'hist') histLimit += 100; else limit += 40; paintContent(); },
    watch: (t) => {
      const on = club.toggleWatch(t.dataset.def!);
      host.toast(on ? 'Carta añadida al seguimiento.' : 'Carta quitada del seguimiento.', 'ok');
      if (tab === 'watch' || F.watchOnly) paintContent();
      else s.root.querySelectorAll<HTMLElement>('[data-act="watch"]').forEach((b) => { if (b.dataset.def === t.dataset.def) b.classList.toggle('on', on); });
    },
    cmp: (t) => {
      const id = t.dataset.def!;
      cmp = cmp.includes(id) ? cmp.filter((x) => x !== id) : [...cmp.slice(-1), id];
      paintCmp();
    },
    cmpClear: () => { cmp = []; paintCmp(); },
    buy: (t) => {
      club.tick(host.now());
      const r = rowListing(t);
      if (!r) return;
      const { l, d } = r;
      confirm('Confirmar compra', `<p>¿Comprar a <b>${esc(d.name)}</b> (${d.ovr}) por <b class="num">${fmt(l.buyNow)} ⓒ</b>?</p><p class="muted">Saldo tras la compra: <span class="num">${fmt(club.s.coins - l.buyNow)} ⓒ</span>. Cuenta como una operación del día.</p>`, 'Comprar', () => {
        const res = club.buyNow(l.id, host.now());
        closeModal();
        if (!res.ok) host.toast(res.error, 'err'); else host.toast(`Has comprado a ${d.name} por ${fmt(l.buyNow)} monedas.`, 'ok');
        paintAll();
      });
    },
    bid: (t) => {
      club.tick(host.now());
      const r = rowListing(t);
      if (!r) return;
      const { l, d, row } = r;
      const input = row.querySelector<HTMLInputElement>('.cm-bid')!;
      const amount = parseInt(input.value.replace(/\D/g, ''), 10);
      if (!Number.isFinite(amount)) { host.toast('Escribe el importe de la puja.', 'err'); return; }
      confirm('Confirmar puja', `<p>¿Pujar <b class="num">${fmt(amount)} ⓒ</b> por <b>${esc(d.name)}</b>?</p><p class="muted">Esas monedas quedan retenidas hasta que termine la subasta y <b>una puja no se puede retirar</b>. Al terminar, el mercado simulado decide con probabilidades si te superan; si ganas se cobra la puja.</p>`, 'Pujar', () => {
        const res = club.bid(l.id, amount, host.now());
        closeModal();
        if (!res.ok) host.toast(res.error, 'err'); else host.toast(`Puja de ${fmt(amount)} por ${d.name} registrada.`, 'ok');
        paintAll();
      });
    },
    list: (t) => {
      club.tick(host.now());
      const row = t.closest<HTMLElement>('.cm-row');
      const uid = row?.dataset.uid;
      if (!row || !uid) return;
      const price = parseInt(row.querySelector<HTMLInputElement>('.cm-sp')!.value.replace(/\D/g, ''), 10);
      const hours = parseInt(row.querySelector<HTMLSelectElement>('.cm-sh')!.value, 10) as 1 | 3 | 6;
      const d = getCardDef(row.dataset.def!);
      const res = club.list(uid, price, hours, host.now());
      if (!res.ok) { host.toast(res.error, 'err'); return; }
      host.toast(`${d?.name ?? 'Carta'} puesta a la venta por ${fmt(price)} (${hours} h).`, 'ok');
      paintAll();
    },
    unlist: (t) => {
      const id = t.closest<HTMLElement>('.cm-my')?.dataset.id;
      if (!id) return;
      const res = club.unlist(id);
      if (!res.ok) host.toast(res.error, 'err'); else host.toast('Carta retirada de la venta: vuelve a tu club.', 'ok');
      paintAll();
    },
    qsell: (t) => {
      const row = t.closest<HTMLElement>('.cm-row');
      const uid = row?.dataset.uid;
      const d = getCardDef(row?.dataset.def ?? '');
      if (!uid || !d) return;
      const v = Math.max(10, Math.round(d.price * ECONOMY.quickSell));
      confirm('Venta rápida', `<p>¿Vender a <b>${esc(d.name)}</b> al club por <b class="num ok">${fmt(v)} ⓒ</b>?</p><p class="muted">Es el ${Math.round(ECONOMY.quickSell * 100)} % de su valor de mercado (${fmt(d.price)} ⓒ) y no se puede deshacer.</p>`, 'Vender', () => {
        const res = club.quickSell(uid, host.now());
        closeModal();
        if (!res.ok) host.toast(res.error, 'err'); else host.toast(`Vendiste a ${d.name} por ${fmt(res.value)} monedas.`, 'ok');
        paintAll();
      });
    },
    yes: () => { const f = onYes; if (f) f(); },
    no: () => closeModal(),
  };

  club.tick(host.now());
  const s = host.show(shellHTML(), handlers, () => { if (modal) closeModal(); else host.hub(); }, 'club-screen club-market');

  // filtros, búsqueda y vista previa de precio: se actualiza solo la lista (el campo no pierde el foco)
  s.root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.classList.contains('cm-sp')) {
      const d = getCardDef(t.closest<HTMLElement>('.cm-row')?.dataset.def ?? '');
      const out = t.closest('.cm-info')?.querySelector('.cm-recv');
      if (d && out) out.innerHTML = recvText(parseInt(t.value.replace(/\D/g, ''), 10), d);
      return;
    }
    const key = (t as HTMLElement).dataset.f;
    if (!key) return;
    if (key === 'sellText') S.text = t.value;
    else if (key === 'sellSort') S.sort = t.value;
    else if (key === 'watchOnly') F.watchOnly = (t as HTMLInputElement).checked;
    else (F as Record<string, unknown>)[key] = t.value;
    limit = 40;
    paintContent();
  });

  paintAll();
  q('.cm-tools')!.innerHTML = toolsHTML();
  paintContent();

  // cuenta atrás: se actualiza el texto sin volver a pintar nada; se detiene al salir de la pantalla
  let refreshing = false;
  const timer = window.setInterval(() => {
    if (!s.root.isConnected) { window.clearInterval(timer); return; }
    const now = host.now();
    let expired = false;
    s.root.querySelectorAll<HTMLElement>('.cm-time').forEach((e) => {
      const left = Number(e.dataset.end) - now;
      e.textContent = fmtLeft(left);
      e.classList.toggle('low', left > 0 && left < 5 * 60_000);
      if (left <= 0 && !e.dataset.done) { e.dataset.done = '1'; expired = true; }
    });
    if (expired && !refreshing && !modal) {
      refreshing = true;
      window.setTimeout(() => { refreshing = false; if (!s.root.isConnected || modal) return; club.tick(host.now()); paintAll(); }, 400);
    }
  }, 1000);
}
