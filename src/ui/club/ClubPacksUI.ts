import '../club-packs.css';
import { getCardDef } from '../../modes/club/catalog';
import { quickSellValue } from '../../modes/club/economy';
import { effectiveOdds, PACKS, packById, type PackDef } from '../../modes/club/packs';
import { currentSeason } from '../../modes/club/progress';
import { RARITIES, RARITY_NAMES, type CardDef, type PackOpening, type Rarity } from '../../modes/club/types';
import { esc, type Handlers, type Screen } from '../dom';
import type { ClubHost } from './host';
import { cardHTML, crestOf, flagSVG, fmt } from './cards';

// Pantalla "Sobres" del modo Soffti Club: tienda con probabilidades públicas + apertura animada carta a carta.
// Los sobres solo se compran con monedas del juego (nunca con dinero real).

type Stage = 'pack' | 'cards' | 'grid' | 'done';
interface LogEntry { defId: string; action: 'club' | 'sell' | 'discard'; value: number }
interface Scene { openingId: string; packId: string; stage: Stage; revealed: boolean; confirmDiscard: boolean; log: LogEntry[]; total: number; dealt?: boolean; walked?: boolean }

const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const RARE_FX: Rarity[] = ['special', 'event', 'legend'];
const isWalkout = (d: CardDef) => RARE_FX.includes(d.rarity) || (d.rarity === 'gold' && d.ovr >= 85);

let disposePrev: (() => void) | null = null;

export function packsScreen(host: ClubHost): void {
  disposePrev?.();
  const club = host.club;
  let scene: Scene | null = null;
  let showOdds = false;
  let screen: Screen;
  let raf = 0;
  let timers: number[] = [];

  // ---------- confeti (canvas persistente) ----------
  const cv = document.createElement('canvas');
  cv.className = 'cp-confetti';
  const ctx = cv.getContext('2d');
  type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number; g?: number; star?: boolean };
  let parts: P[] = [];
  let W = 0, H = 0, last = 0;
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const COLORS: Record<string, string[]> = {
    gold: ['#ffe27a', '#f6b40e', '#ffffff', '#fff3c4'],
    rising: ['#19e6a2', '#b6ffe4', '#ffffff', '#74acdf'],
    special: ['#5ee7ff', '#ff64dc', '#ffffff', '#6a8cff', '#f6b40e'],
    event: ['#ff8a2f', '#ffe08a', '#c2185b', '#ffffff'],
    legend: ['#ffd35a', '#fff1c2', '#ffffff', '#f6b40e'],
  };
  const confetti = (kind: string, big: boolean) => {
    if (reduced() || !ctx) return;
    fit();
    const cols = COLORS[kind] ?? COLORS.gold;
    const n = big ? 110 : 40;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const sp = 380 + Math.random() * 480;
      parts.push({ x: W / 2 + side * W * 0.05, y: H * 0.55, vx: side * sp * (0.2 + Math.random() * 0.6), vy: -sp * (0.7 + Math.random() * 0.5), r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, w: 5 + Math.random() * 6, h: 9 + Math.random() * 7, c: cols[(Math.random() * cols.length) | 0], life: 2.6 + Math.random() * 1.6 });
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  /** Chispas en estrella que salen del centro y se apagan (sin gravedad). */
  const sparks = (kind: string, n: number) => {
    if (reduced() || !ctx) return;
    fit();
    const cols = COLORS[kind] ?? COLORS.gold;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 520;
      parts.push({ x: W / 2, y: H * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6, vr: (Math.random() - 0.5) * 6, w: 3 + Math.random() * 5, h: 3 + Math.random() * 5, c: cols[(Math.random() * cols.length) | 0], life: 0.7 + Math.random() * 0.9, g: 0, star: true });
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  const frame = (now: number) => {
    raf = 0;
    if (!ctx || !cv.isConnected) { parts = []; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    parts = parts.filter((p) => p.life > 0 && p.y < H + 30);
    for (const p of parts) {
      p.vy += 560 * (p.g ?? 1) * dt; p.vx *= 1 - (p.star ? 1.6 : 0.7) * dt; p.vy *= 1 - (p.star ? 1.6 : 0.3) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.life -= dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.c;
      if (p.star) {
        // destello de cuatro puntas con halo
        ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = p.c; ctx.shadowBlur = 12;
        const s = p.w * 2.2;
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.28, -s * 0.28); ctx.lineTo(s, 0); ctx.lineTo(s * 0.28, s * 0.28); ctx.lineTo(0, s); ctx.lineTo(-s * 0.28, s * 0.28); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.28, -s * 0.28); ctx.closePath(); ctx.fill();
      } else { ctx.scale(1, Math.cos(p.r * 1.7)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      ctx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(frame);
  };
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(() => { if (screen?.root.isConnected) fn(); }, ms)); };

  // ---------- teclado: Enter/Espacio revelan la carta o rompen el sobre ----------
  const key = (e: KeyboardEvent) => {
    if (!screen?.root.isConnected) { cleanup(); return; }
    if (!scene || scene.revealed && scene.stage === 'cards') return;
    if (!['Enter', 'Space', 'NumpadEnter'].includes(e.code)) return;
    if (scene.stage === 'done') return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (scene.stage === 'pack') rip(); else flip();
  };
  window.addEventListener('keydown', key, true);
  const cleanup = () => {
    window.removeEventListener('keydown', key, true);
    cancelAnimationFrame(raf); raf = 0; parts = [];
    timers.forEach(clearTimeout); timers = [];
    if (disposePrev === cleanup) disposePrev = null;
  };
  disposePrev = cleanup;

  // ---------- datos ----------
  const pendingCount = () => club.s.packs.openings.reduce((t, o) => t + o.cards.filter((c) => !c.decided).length, 0);
  const openingOf = () => (scene ? club.s.packs.openings.find((o) => o.id === scene!.openingId) : undefined);
  const nextCard = (o: PackOpening | undefined) => o?.cards.find((c) => !c.decided);
  const promoOf = (id: string) => club.s.packs.promo[id] ?? 0;

  // ---------- HTML ----------
  // Sobre de aluminio: cierres dentados arriba y abajo, brillo diagonal, emblema propio por tipo y la cinta con el nombre.
  let artN = 0;
  const lite = (c: string, k: number) => { const n = parseInt(c.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`; };
  const emblem = (id: string, c: string, uid: string): string => {
    if (id === 'special') return `<defs><linearGradient id="${uid}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ee7ff"/><stop offset=".35" stop-color="#9a7bff"/><stop offset=".7" stop-color="#ff64dc"/><stop offset="1" stop-color="#ffe27a"/></linearGradient></defs>
      <path d="M60 52L84 84L60 118L36 84Z" fill="url(#${uid}r)" stroke="#fff" stroke-width="2.4"/><path d="M60 52L72 84L60 118L48 84Z" fill="#fff" opacity=".3"/><path d="M36 84H84" stroke="#fff" stroke-width="1.4" opacity=".7"/>`;
    if (id === 'premium') return `<circle cx="60" cy="86" r="27" fill="#000" opacity=".25"/><circle cx="60" cy="86" r="24" fill="${lite(c, 0.55)}" stroke="#fff" stroke-width="2.4"/>
      <path d="M60 68L65 81L79 81L68 89L72 103L60 94.5L48 103L52 89L41 81L55 81Z" fill="${lite(c, -0.45)}"/>`;
    if (id === 'promo') return `<rect x="38" y="70" width="44" height="34" rx="4" fill="${lite(c, 0.4)}" stroke="#fff" stroke-width="2.2"/><rect x="56" y="70" width="8" height="34" fill="#fff" opacity=".85"/><rect x="38" y="84" width="44" height="7" fill="#fff" opacity=".85"/>
      <path d="M60 70C50 56 40 62 48 70M60 70C70 56 80 62 72 70" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    return `<circle cx="60" cy="86" r="27" fill="#000" opacity=".25"/><circle cx="60" cy="86" r="24" fill="${lite(c, 0.5)}" stroke="#fff" stroke-width="2.4"/>
      <path d="M60 70L71 78L67 91H53L49 78Z" fill="${lite(c, -0.5)}"/><path d="M60 70V63M71 78L78 74M67 91L72 98M53 91L48 98M49 78L42 74" stroke="${lite(c, -0.5)}" stroke-width="2.2" stroke-linecap="round"/>`;
  };
  const packArt = (p: PackDef, cls = '') => {
    const u = `pk${artN++}`;
    const c = p.color;
    let crimp = 'M10 0';
    for (let i = 0; i < 27; i++) crimp += `L${10 + i * 4 + 2} ${i % 2 ? 0 : 5}`;
    crimp += 'L110 0';
    let crimpB = 'M10 176';
    for (let i = 0; i < 27; i++) crimpB += `L${10 + i * 4 + 2} ${i % 2 ? 176 : 171}`;
    crimpB += 'L110 176';
    const name = esc(p.name.replace(/^Sobre\s+/i, '').toUpperCase());
    return `<svg class="cp-art ${cls}" viewBox="0 0 120 180" style="--pc:${c}" aria-hidden="true">
      <defs>
        <linearGradient id="${u}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lite(c, 0.5)}"/><stop offset=".35" stop-color="${c}"/><stop offset=".75" stop-color="${lite(c, -0.35)}"/><stop offset="1" stop-color="${lite(c, -0.55)}"/></linearGradient>
        <linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <clipPath id="${u}b"><rect x="10" y="0" width="100" height="180" rx="3"/></clipPath>
      </defs>
      <g class="cp-art-body" clip-path="url(#${u}b)">
        <path d="M10 0H110V180H10Z" fill="url(#${u}f)"/>
        <path d="M10 22H110V150L10 118Z" fill="#fff" opacity=".12"/>
        <path d="M10 118L110 150V180H10Z" fill="#000" opacity=".2"/>
        ${Array.from({ length: 7 }, (_, i) => `<path d="M${12 + i * 15} 24L${28 + i * 15} 150" stroke="#fff" stroke-width=".6" opacity=".14"/>`).join('')}
        ${emblem(p.id, c, u)}
        <path d="M10 118H110V138H10Z" fill="#05081a" opacity=".78"/><path d="M10 118H110" stroke="#fff" stroke-width="1.2" opacity=".85"/><path d="M10 138H110" stroke="${lite(c, 0.4)}" stroke-width="1.2"/>
        <text x="60" y="132" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="13" letter-spacing="2" fill="#fff">${name}</text>
        <text x="60" y="150" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="6.2" letter-spacing="1.3" fill="#fff" opacity=".8">${p.cards} CARTAS · SOFFTI CLUB</text>
        <rect class="cp-art-shine" x="-40" y="0" width="34" height="180" fill="url(#${u}s)" transform="skewX(-16)"/>
      </g>
      <g class="cp-art-top"><path d="${crimp}V20H10Z" fill="url(#${u}f)"/><path d="M10 20H110" stroke="#000" stroke-width="1" opacity=".3"/><path d="M10 6H110V13H10Z" fill="#fff" opacity=".2"/></g>
      <g class="cp-art-bot"><path d="${crimpB}V160H10Z" fill="url(#${u}f)"/><path d="M10 160H110" stroke="#000" stroke-width="1" opacity=".3"/></g>
      <path d="M10 0V180M110 0V180" stroke="#000" stroke-width="1.4" opacity=".35"/>
    </svg>`;
  };

  const oddsBlock = (p: PackDef): string => {
    const odds = effectiveOdds(p, currentSeason(host.now()).id);
    const rows = RARITIES.filter((r) => odds[r]).map((r) => `<tr><td><i class="cp-dot cp-d-${r}"></i>${RARITY_NAMES[r]}</td><td class="num">${odds[r]}%</td></tr>`).join('');
    const guar = p.guarantee ? `Garantía: al menos 1 carta de ${p.guarantee.filter((r) => odds[r] || r === 'gold').map((r) => RARITY_NAMES[r]).join(' / ')}.` : 'Sin garantía de rareza.';
    const pity = p.pityAfter ? `Protección: tras ${p.pityAfter} sobres sin carta rara (Promesa o mejor) el siguiente trae una. Sobres seguidos sin carta rara: <b class="num">${club.s.packs.pity[p.id] ?? 0}</b>.` : 'Sin protección contra rachas.';
    return `<div class="cp-odds-pack" style="--pc:${p.color}"><h4>${esc(p.name)}</h4>
      <table class="cp-odds"><thead><tr><th>Rareza (por carta)</th><th>Prob.</th></tr></thead><tbody>${rows}</tbody></table>
      <p>${guar}</p><p>${pity}</p></div>`;
  };

  const storeHTML = (): string => {
    const coins = club.s.coins;
    const pend = pendingCount();
    const banner = pend > 0 ? `<div class="cp-banner"><span>Tienes <b class="num">${pend}</b> carta${pend === 1 ? '' : 's'} sin decidir de un sobre abierto.</span><button class="btn primary cp-btn" data-act="resume">Continuar apertura</button></div>` : '';
    const cards = PACKS.map((p) => {
      const free = promoOf(p.id);
      const miss = p.buyable ? p.price - coins : 0;
      const price = p.buyable ? `<span class="num">${fmt(p.price)}</span> ⓒ` : 'Gratis · recompensa';
      const buy = p.buyable
        ? `<button class="btn primary cp-btn" data-act="buy" data-id="${p.id}" ${miss > 0 ? 'disabled' : ''}>Comprar</button>`
        : '';
      const freeBtn = free > 0 ? `<button class="btn cp-btn cp-free" data-act="free" data-id="${p.id}">Abrir gratis <span class="num">×${free}</span></button>` : '';
      const note = p.buyable && miss > 0 ? `<div class="cp-warn">Te faltan ${fmt(miss)} ⓒ</div>` : (!p.buyable && free === 0 ? '<div class="cp-warn cp-dim">Sin sobres de este tipo ahora mismo</div>' : '');
      return `<article class="cp-pack" style="--pc:${p.color}">
        <div class="cp-pack-art">${packArt(p)}</div>
        <div class="cp-pack-info">
          <h3>${esc(p.name)}</h3>
          <p class="cp-blurb">${esc(p.blurb)}</p>
          <div class="cp-meta"><span class="cp-price">${price}</span><span class="cp-count"><b class="num">${p.cards}</b> cartas</span></div>
          <div class="cp-btns">${buy}${freeBtn}</div>${note}
        </div></article>`;
    }).join('');
    const odds = showOdds ? `<section class="cp-oddsbox"><div class="cp-odds-grid">${PACKS.map(oddsBlock).join('')}</div>
      <p class="cp-fine">Las probabilidades son las reales que usa el juego. Para reducir duplicados, si te toca una carta que ya tienes el sobre lo intenta evitar hasta 3 veces. Los sobres <b>no se compran con dinero real</b>: solo con monedas del juego o como recompensa.</p></section>` : '';
    return `<div class="cp-wrap">
      <header class="screen-header cp-head"><div><div class="crumb">SOFFTI CLUB</div><h2>Sobres</h2></div>
        <div class="cp-coins" title="Monedas del juego"><span class="cp-coin">ⓒ</span><b class="num">${fmt(coins)}</b></div></header>
      <div class="screen-body cp-body">
        ${banner}
        <p class="cp-lead">Consigue cartas con tus <b>monedas del juego</b> (no hay compras con dinero real). Cada carta se decide al revelarla: al club, vender o descartar.</p>
        <div class="cp-shop">${cards}</div>
        ${odds}
      </div>
      <footer class="screen-footer cp-foot">
        <button class="btn cp-btn" data-act="odds">${showOdds ? 'Ocultar probabilidades' : 'Probabilidades'}</button>
        <button class="btn cp-btn" data-act="back">Volver</button>
      </footer></div>`;
  };

  const sceneHTML = (): string => {
    const sc = scene!;
    const pack = packById(sc.packId) ?? PACKS[0];
    const op = openingOf();
    const head = `<div class="cp-scene-top"><button class="btn cp-btn cp-leave" data-act="leave">${sc.stage === 'done' ? 'Tienda' : 'Salir'}</button>
      <div class="cp-scene-title">${esc(pack.name)}</div><div class="cp-coins cp-coins-s"><span class="cp-coin">ⓒ</span><b class="num">${fmt(club.s.coins)}</b></div></div>`;
    let body = '';
    if (sc.stage === 'pack') {
      body = `<div class="cp-stage"><div class="cp-rip" data-act="rip" role="button" tabindex="-1" aria-label="Abrir sobre">${packArt(pack, 'cp-bigpack')}</div>
        <div class="cp-hint">Toca el sobre o pulsa Enter para abrirlo</div></div>`;
    } else if (sc.stage === 'cards') {
      const cur = nextCard(op);
      if (!op || !cur) { return ''; }
      const d = getCardDef(cur.defId)!;
      const idx = op.cards.indexOf(cur);
      const dup = (club.ownedCounts().get(d.id) ?? 0) > 1;
      const qs = quickSellValue(d);
      const dots = op.cards.map((c, i) => `<i class="${c.decided ? 'done' : i === idx ? 'cur' : ''}"></i>`).join('');
      body = `<div class="cp-stage cp-cardstage cp-r-${d.rarity}" data-key="${cur.uid}">
        <div class="cp-prog"><span class="num">Carta ${idx + 1} / ${op.cards.length}</span><span class="cp-dots">${dots}</span></div>
        <div class="cp-reveal">
          <div class="cp-flip" data-act="flip" role="button" tabindex="-1" aria-label="Revelar carta">
            <div class="cp-beams"><i></i><i></i><i></i><i></i><i></i></div>
            <div class="cp-glow"></div>
            <div class="cp-flipper ${sc.dealt ? 'next' : 'deal'}"><div class="cp-face cp-back"><div class="cp-back-in"><span>S</span><em>SOFFTI CLUB</em></div></div><div class="cp-face cp-front">${cardHTML(d, { size: 'lg' })}</div></div>
          </div>
          <div class="cp-panel hid">
            <div class="cp-cname">${esc(d.name)}</div>
            <div class="cp-chips"><span class="cp-chip cp-ch-${d.rarity}">${RARITY_NAMES[d.rarity]}</span><span class="cp-chip">${d.role} · <b class="num">${d.ovr}</b></span>${dup ? '<span class="cp-chip cp-dup">Duplicada</span>' : '<span class="cp-chip cp-new">Nueva</span>'}</div>
            <div class="cp-sub">${esc(d.clubName || 'Leyenda')} · ${esc(d.nat)}</div>
            <div class="cp-actions">
              <button class="btn primary cp-btn" data-act="keep">Enviar al club</button>
              <button class="btn cp-btn" data-act="sell">Vender rápido (+${fmt(qs)} ⓒ)</button>
              <button class="btn cp-btn ${sc.confirmDiscard ? 'danger' : ''}" data-act="discard">${sc.confirmDiscard ? '¿Seguro? Descartar' : 'Descartar'}</button>
            </div>
            <div class="cp-msg" id="cp-msg"></div>
          </div>
        </div>
        <div class="cp-hint cp-hint-flip">Toca la carta o pulsa Enter para revelarla</div>
        <div class="cp-actions cp-actions-row"><button class="btn cp-btn cp-all" data-act="showall">Revelar todas</button><button class="btn cp-btn cp-all" data-act="keepall">Enviar todas al club</button></div>
      </div>`;
    } else if (sc.stage === 'grid') {
      if (!op) return '';
      const owned = club.ownedCounts();
      const left = op.cards.filter((c) => !c.decided);
      if (!left.length) return '';
      const items = left.map((c) => ({ c, d: getCardDef(c.defId)! })).sort((a, b) => b.d.ovr - a.d.ovr);
      const dups = items.filter(({ d }) => (owned.get(d.id) ?? 0) > 1 || items.filter((x) => x.d.id === d.id).length > 1);
      const dupValue = dups.reduce((t, { d }) => t + quickSellValue(d), 0);
      body = `<div class="cp-stage cp-gridstage">
        <div class="cp-prog"><span class="num">${left.length} carta${left.length === 1 ? '' : 's'} por decidir</span></div>
        <div class="cp-grid">${items.map(({ c, d }, i) => `<div class="cp-gcard" style="--i:${i}">${cardHTML(d, { size: 'sm', badge: (owned.get(d.id) ?? 0) > 1 ? 'Duplicada' : '' })}
          <div class="cp-gbtns"><button class="btn cp-btn" data-act="gkeep" data-uid="${c.uid}" title="Enviar al club">Club</button><button class="btn cp-btn" data-act="gsell" data-uid="${c.uid}" title="Venta rápida">+${fmt(quickSellValue(d))} ⓒ</button></div></div>`).join('')}</div>
        <div class="cp-actions cp-actions-row"><button class="btn primary cp-btn" data-act="keepall">Enviar todas al club</button>${dups.length ? `<button class="btn cp-btn" data-act="selldups">Vender duplicadas (${dups.length} · +${fmt(dupValue)} ⓒ)</button>` : ''}</div>
      </div>`;
    } else {
      const kept = sc.log.filter((l) => l.action === 'club');
      const sold = sc.log.filter((l) => l.action === 'sell');
      const coins = sold.reduce((t, l) => t + l.value, 0);
      const disc = sc.log.filter((l) => l.action === 'discard').length;
      const best = [...sc.log].map((l) => getCardDef(l.defId)!).filter(Boolean).sort((a, b) => b.ovr - a.ovr)[0];
      const canFree = promoOf(pack.id) > 0;
      const canBuy = pack.buyable && club.s.coins >= pack.price;
      const again = canFree ? `<button class="btn primary cp-btn" data-act="again">Abrir otro gratis <span class="num">×${promoOf(pack.id)}</span></button>`
        : pack.buyable ? `<button class="btn primary cp-btn" data-act="again" ${canBuy ? '' : 'disabled'}>Abrir otro (${fmt(pack.price)} ⓒ)</button>` : '';
      body = `<div class="cp-stage cp-done"><h3>Sobre completado</h3>
        <div class="cp-sum"><div><b class="num">${kept.length}</b><span>al club</span></div><div><b class="num">${sold.length}</b><span>vendidas</span></div><div><b class="num">+${fmt(coins)}</b><span>monedas</span></div><div><b class="num">${disc}</b><span>descartadas</span></div></div>
        ${best ? `<div class="cp-bestline">Mejor carta: <b>${esc(best.name)}</b> · ${RARITY_NAMES[best.rarity]} ${best.ovr}</div>` : ''}
        <div class="cp-actions cp-actions-row">${canFree ? again : ''}<button class="btn cp-btn" data-act="leave">Volver a la tienda</button>${canFree ? '' : again}</div>
        ${pack.buyable && !canFree && !canBuy ? '<div class="cp-warn">No tienes monedas para otro sobre.</div>' : ''}</div>`;
    }
    return `<div class="cp-scene cp-sc-${sc.stage}" style="--pc:${pack.color}"><div class="cp-rays"></div><div class="cp-flash"></div>${body}${head}</div>`;
  };

  // ---------- pintado ----------
  const paint = () => {
    if (scene) {
      const h = sceneHTML();
      if (!h) { scene.stage = 'done'; screen.refresh(sceneHTML()); } else screen.refresh(h);
      screen.root.appendChild(cv);
      bindTilt();
    } else {
      screen.refresh(storeHTML());
    }
  };
  /** Inclinación 3D y reflejo holográfico de la carta revelada siguiendo el puntero. */
  const bindTilt = () => {
    const flip = screen.root.querySelector<HTMLElement>('.cp-flip');
    const card = flip?.querySelector<HTMLElement>('.cp-front .fc');
    if (!flip || !card || reduced()) return;
    flip.addEventListener('pointermove', (e) => {
      if (!scene?.revealed) return;
      const r = flip.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--rx', `${(-y * 16).toFixed(1)}deg`);
      card.style.setProperty('--ry', `${(x * 18).toFixed(1)}deg`);
      card.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(0)}%`);
      card.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(0)}%`);
    });
    flip.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
  };
  const stageEl = () => screen.root.querySelector<HTMLElement>('.cp-scene');
  const flash = (cls = '') => {
    const f = screen.root.querySelector<HTMLElement>('.cp-flash');
    if (!f) return;
    f.className = 'cp-flash'; void f.offsetWidth; f.className = `cp-flash on ${cls}`;
  };
  const cheer = (v: number) => { try { host.audio.cheer(v); } catch { /* sin audio */ } };
  const err = (m: string) => {
    host.toast(m, 'err');
    const box = screen.root.querySelector('#cp-msg');
    if (box) box.textContent = m;
  };

  const startScene = (op: PackOpening, resumed: boolean) => {
    scene = { openingId: op.id, packId: op.packId, stage: resumed ? 'cards' : 'pack', revealed: false, confirmDiscard: false, log: [], total: op.cards.length };
    paint();
  };

  /** Sobre: carga (tiembla y brilla cada vez más) → se rasga la parte de arriba con un destello → salen las cartas. */
  function rip() {
    if (!scene || scene.stage !== 'pack') return;
    const done = () => { if (!scene) return; scene.stage = 'cards'; scene.revealed = false; paint(); };
    if (reduced()) { done(); return; }
    const pk = screen.root.querySelector<HTMLElement>('.cp-rip');
    if (!pk || pk.classList.contains('charge')) return;
    pk.classList.add('charge');
    pk.removeAttribute('data-act');
    cheer(0.15);
    later(() => {
      pk.classList.remove('charge'); pk.classList.add('tear');
      flash('big');
      const b = document.createElement('div');
      b.className = 'cp-burst';
      stageEl()?.appendChild(b);
      confetti('gold', false);
      sparks(scene?.packId === 'special' ? 'special' : 'gold', 46);
      cheer(0.3);
    }, 1300);
    later(done, 2150);
  }

  function flip() {
    if (!scene || scene.stage !== 'cards' || scene.revealed) return;
    const op = openingOf();
    const cur = nextCard(op);
    if (!cur) return;
    const d = getCardDef(cur.defId)!;
    scene.revealed = true;
    scene.dealt = true;
    const root = screen.root;
    const f = root.querySelector<HTMLElement>('.cp-flip');
    f?.setAttribute('data-nofocus', '1');
    if (f) f.dataset.nofocus = '1';
    f?.querySelector('.cp-flipper')?.classList.add('on');
    root.querySelector('.cp-cardstage')?.classList.add('revealed');
    const hint = root.querySelector('.cp-hint-flip'); hint?.remove();
    const show = () => { root.querySelector('.cp-panel')?.classList.remove('hid'); screen.applyFocus(); };
    const wow = isWalkout(d);
    const fx = d.rarity === 'bronze' || d.rarity === 'silver' ? '' : d.rarity;
    if (reduced()) {
      show();
      if (wow) cheer(0.5);
      return;
    }
    if (fx) stageEl()?.classList.add('fx-' + d.rarity);
    if (wow && !scene.walked) {
      // revelación por pasos, como en una retransmisión: bandera → puesto → club → carta
      scene.walked = true;
      scene.revealed = false;
      f?.querySelector('.cp-flipper')?.classList.remove('on');
      root.querySelector('.cp-cardstage')?.classList.remove('revealed');
      const w = document.createElement('div');
      w.className = 'cp-walkout';
      w.innerHTML = `<div class="cp-wo-step" style="--d:0s">${flagSVG(d.nat, 120)}<span>${esc(d.nat)}</span></div>
        <div class="cp-wo-step" style="--d:1.1s"><b class="num">${d.role}</b><span>${esc(d.group === 'GK' ? 'Portero' : d.group === 'DEF' ? 'Defensa' : d.group === 'MID' ? 'Mediocampista' : 'Delantero')}</span></div>
        <div class="cp-wo-step" style="--d:2.2s">${crestOf(d, 120)}<span>${esc(d.clubName || 'Leyendas')}</span></div>`;
      stageEl()?.appendChild(w);
      cheer(0.25);
      later(() => { flash(''); sparks(fx || 'gold', 30); }, 1100);
      later(() => { flash(''); sparks(fx || 'gold', 30); cheer(0.35); }, 2200);
      later(() => { w.remove(); flip(); }, 3300);
      return;
    }
    later(() => {
      show();
      if (fx) { flash(wow ? 'big' : ''); confetti(fx, wow); sparks(fx, wow ? 90 : 36); }
      if (wow) {
        cheer(0.5);
        const w = document.createElement('div');
        w.className = 'cp-walk';
        w.textContent = '¡INCREÍBLE!';
        stageEl()?.appendChild(w);
        later(() => w.remove(), 1900);
      } else if (fx) cheer(0.2);
    }, 560);
  }

  const decideUid = (uid: string, action: 'club' | 'sell') => {
    if (!scene) return;
    const c = openingOf()?.cards.find((x) => x.uid === uid && !x.decided);
    if (!c) return;
    const r = club.decideCard(scene.openingId, uid, action, host.now());
    if (!r.ok) { err(r.error); return; }
    scene.log.push({ defId: c.defId, action, value: r.value });
    advance();
  };

  const advance = () => {
    if (!scene) return;
    scene.revealed = false; scene.confirmDiscard = false; scene.walked = false;
    scene.stage = scene.stage === 'grid' && nextCard(openingOf()) ? 'grid' : nextCard(openingOf()) ? 'cards' : 'done';
    paint();
  };

  const decide = (action: 'club' | 'sell' | 'discard') => {
    if (!scene || !scene.revealed) return;
    const cur = nextCard(openingOf());
    if (!cur) return;
    const r = club.decideCard(scene.openingId, cur.uid, action, host.now());
    if (!r.ok) { err(r.error); return; }
    scene.log.push({ defId: cur.defId, action, value: r.value });
    if (action === 'sell') host.toast(`+${fmt(r.value)} ⓒ`, 'ok');
    advance();
  };

  const startOpen = (packId: string, free: boolean) => {
    const r = club.openPack(packId, free, host.now());
    if (!r.ok) { host.toast(r.error, 'err'); paint(); return; }
    startScene(r.value, false);
  };

  const handlers: Handlers = {
    back: () => host.hub(),
    odds: () => { showOdds = !showOdds; paint(); },
    buy: (t) => startOpen(t.dataset.id!, false),
    free: (t) => startOpen(t.dataset.id!, true),
    resume: () => {
      const op = club.s.packs.openings.find((o) => o.cards.some((c) => !c.decided));
      if (op) startScene(op, true); else paint();
    },
    rip: () => rip(),
    flip: () => flip(),
    keep: () => decide('club'),
    sell: () => decide('sell'),
    discard: () => {
      if (!scene) return;
      if (!scene.confirmDiscard) {
        scene.confirmDiscard = true;
        const b = screen.root.querySelector<HTMLElement>('[data-act="discard"]');
        if (b) { b.textContent = '¿Seguro? Descartar'; b.classList.add('danger'); }
        return;
      }
      decide('discard');
    },
    showall: () => { if (!scene) return; scene.stage = 'grid'; scene.revealed = false; paint(); if (!reduced()) sparks('gold', 30); },
    gkeep: (t) => decideUid(t.dataset.uid!, 'club'),
    gsell: (t) => decideUid(t.dataset.uid!, 'sell'),
    selldups: () => {
      if (!scene) return;
      const op = openingOf();
      if (!op) return;
      const owned = club.ownedCounts();
      const seen = new Set<string>();
      let total = 0;
      for (const c of op.cards.filter((x) => !x.decided)) {
        // se queda con la primera copia si no la tenías ya en el club
        const dup = (owned.get(c.defId) ?? 0) > 1 && (seen.has(c.defId) || club.s.inventory.some((i) => i.defId === c.defId));
        seen.add(c.defId);
        if (!dup) continue;
        const r = club.decideCard(scene.openingId, c.uid, 'sell', host.now());
        if (r.ok) { total += r.value; scene.log.push({ defId: c.defId, action: 'sell', value: r.value }); }
      }
      if (total) host.toast(`Duplicadas vendidas: +${fmt(total)} ⓒ`);
      advance();
    },
    keepall: () => {
      if (!scene) return;
      const op = openingOf();
      const before = op ? op.cards.filter((c) => !c.decided).map((c) => c.defId) : [];
      const id = scene.openingId;
      club.keepAllPending(host.now());
      const after = club.s.packs.openings.find((o) => o.id === id);
      const left = after ? after.cards.filter((c) => !c.decided).length : 0;
      for (const defId of before.slice(0, before.length - left)) scene.log.push({ defId, action: 'club', value: 0 });
      if (left > 0) { host.toast(`Tu club está lleno: ${left} carta${left === 1 ? '' : 's'} sin sitio. Vende o descarta algunas.`, 'err'); scene.revealed = false; scene.stage = 'cards'; paint(); return; }
      advance();
    },
    again: () => {
      if (!scene) return;
      const id = scene.packId;
      startOpen(id, promoOf(id) > 0);
    },
    leave: () => { scene = null; parts = []; paint(); },
  };

  screen = host.show(storeHTML(), handlers, () => {
    if (scene) { scene = null; parts = []; paint(); } else host.hub();
  }, 'club-screen club-packs');
  // por si la aplicación no asigna el "back" a Screen.onBack
  if (!screen.onBack) screen.onBack = () => { if (scene) { scene = null; parts = []; paint(); } else host.hub(); };
  // aviso si vuelves con cartas pendientes: lo muestra la propia tienda (banner)
}
