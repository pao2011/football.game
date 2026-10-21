import '../club-packs.css';
import { getCardDef } from '../../modes/club/catalog';
import { quickSellValue } from '../../modes/club/economy';
import { effectiveOdds, PACKS, packById, type PackDef } from '../../modes/club/packs';
import { currentSeason } from '../../modes/club/progress';
import { RARITIES, RARITY_NAMES, type CardDef, type PackOpening, type Rarity } from '../../modes/club/types';
import { esc, type Handlers, type Screen } from '../dom';
import type { ClubHost } from './host';
import { cardHTML, fmt } from './cards';

// Pantalla "Sobres" del modo Soffti Club: tienda con probabilidades públicas + apertura animada carta a carta.
// Los sobres solo se compran con monedas del juego (nunca con dinero real).

type Stage = 'pack' | 'cards' | 'done';
interface LogEntry { defId: string; action: 'club' | 'sell' | 'discard'; value: number }
interface Scene { openingId: string; packId: string; stage: Stage; revealed: boolean; confirmDiscard: boolean; log: LogEntry[]; total: number }

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
  type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number };
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
  const frame = (now: number) => {
    raf = 0;
    if (!ctx || !cv.isConnected) { parts = []; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    parts = parts.filter((p) => p.life > 0 && p.y < H + 30);
    for (const p of parts) {
      p.vy += 560 * dt; p.vx *= 1 - 0.7 * dt; p.vy *= 1 - 0.3 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.life -= dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.c; ctx.scale(1, Math.cos(p.r * 1.7)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
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
  const packArt = (p: PackDef, cls = '') => `<svg class="cp-art ${cls}" viewBox="0 0 120 170" style="--pc:${p.color}" aria-hidden="true">
    <path class="cp-art-body" d="M12 14L24 8L36 14L48 8L60 14L72 8L84 14L96 8L108 14V156L96 162L84 156L72 162L60 156L48 162L36 156L24 162L12 156Z" style="fill:var(--pc)"/>
    <path d="M12 14L24 8L36 14L48 8L60 14L72 8L84 14L96 8L108 14V60L12 96Z" fill="#fff" opacity=".22"/>
    <path d="M12 156L96 162L108 156V110L12 142Z" fill="#000" opacity=".22"/>
    <circle cx="60" cy="84" r="27" fill="#000" opacity=".28"/><circle cx="60" cy="84" r="24" fill="none" stroke="#fff" stroke-width="2.5" opacity=".85"/>
    <path d="M60 68L71 76L67 89H53L49 76Z" fill="#fff" opacity=".9"/>
    <path d="M60 68V61M71 76L78 72M67 89L72 96M53 89L48 96M49 76L42 72" stroke="#fff" stroke-width="2" opacity=".8"/>
    <rect x="22" y="30" width="76" height="5" rx="2.5" fill="#fff" opacity=".7"/><rect x="34" y="40" width="52" height="3" rx="1.5" fill="#fff" opacity=".5"/>
    <path class="cp-art-shine" d="M-30 0L-10 0L40 170L20 170Z" fill="#fff" opacity=".35"/>
  </svg>`;

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
            <div class="cp-glow"></div>
            <div class="cp-flipper"><div class="cp-face cp-back"><div class="cp-back-in"><span>S</span></div></div><div class="cp-face cp-front">${cardHTML(d, { size: 'lg' })}</div></div>
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
        <button class="btn cp-btn cp-all" data-act="keepall">Enviar todas al club</button>
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
        <div class="cp-actions cp-actions-row">${again}<button class="btn cp-btn" data-act="leave">Volver a la tienda</button></div>
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
    } else {
      screen.refresh(storeHTML());
    }
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

  function rip() {
    if (!scene || scene.stage !== 'pack') return;
    const done = () => { if (!scene) return; scene.stage = 'cards'; scene.revealed = false; paint(); };
    if (reduced()) { done(); return; }
    const pk = screen.root.querySelector<HTMLElement>('.cp-rip');
    if (!pk || pk.classList.contains('shake')) return;
    pk.classList.add('shake');
    pk.removeAttribute('data-act');
    cheer(0.15);
    later(() => { pk.classList.remove('shake'); pk.classList.add('tear'); flash(); }, 900);
    later(done, 1500);
  }

  function flip() {
    if (!scene || scene.stage !== 'cards' || scene.revealed) return;
    const op = openingOf();
    const cur = nextCard(op);
    if (!cur) return;
    const d = getCardDef(cur.defId)!;
    scene.revealed = true;
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
    later(() => {
      show();
      if (fx) { flash(wow ? 'big' : ''); confetti(fx, wow); }
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

  const advance = () => {
    if (!scene) return;
    scene.revealed = false; scene.confirmDiscard = false;
    scene.stage = nextCard(openingOf()) ? 'cards' : 'done';
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
