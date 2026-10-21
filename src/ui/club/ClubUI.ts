import type { AudioEngine } from '../../audio/AudioEngine';
import { FORMATIONS } from '../../data/formations';
import { getTeam } from '../../data/teams';
import type { FormationId, KitData, TeamData } from '../../data/types';
import { eventDefs, evolvedId, getCardDef, statLabels, STAT_KEYS } from '../../modes/club/catalog';
import { COACHES } from '../../modes/club/chemistry';
import { Club, ONLINE_POINTS, type ClubMatchKind, type ClubMatchMeta } from '../../modes/club/Club';
import { BATTLES, CHAMPIONS, SBCS, TOURNAMENT_ENTRY, TOURNAMENT_ROUNDS, checkSbc, championsReward, rivalsDivision, rivalsWeeklyReward, tournamentRuleOf, RIVALS_WEEKLY_MIN_MATCHES, DIVISION_THRESHOLDS } from '../../modes/club/competitions';
import { ECONOMY } from '../../modes/club/economy';
import { MAX_INVENTORY, usedInSquads } from '../../modes/club/market';
import { EVOS, MAX_ACTIVE_EVOS, evoEligible } from '../../modes/club/evos';
import { evoById } from '../../modes/club/evoDefs';
import { ALL_OBJECTIVES, DAILY_POOL, LOGIN_REWARDS, MILESTONES, MISSIONS, PASS_LEVELS, PASS_LEVEL_POINTS, PASS_PREMIUM_COST, currentSeason, levelProgress, loginStatus, milestoneStatus, missionsPending, objectiveDef, passClaimed, passLevel, passPending, passReward, rewardText } from '../../modes/club/progress';
import { PACKS } from '../../modes/club/packs';
import { RARITY_NAMES, type CardInstance, type ClubIdentity, type Rarity } from '../../modes/club/types';
import { dayId, weekId } from '../../modes/club/util';
import { crestSVG, kitSVG } from '../Crest';
import { el, esc, type Handlers, type Screen } from '../dom';
import { cardHTML, fmt, miniCardHTML } from './cards';
import type { ClubHost } from './host';
import { packsScreen } from './ClubPacksUI';
import { marketScreen } from './ClubMarketUI';
import { squadScreen } from './ClubSquadUI';

/** Lo que el modo Club necesita de la aplicación. */
export interface ClubApp {
  show(html: string, handlers: Handlers, back: (() => void) | null, cls?: string): Screen;
  audio: AudioEngine;
  mainMenu(): void;
  /** Juega un partido del club (el equipo del usuario es siempre el local). */
  playClubMatch(home: TeamData, away: TeamData, meta: ClubMatchMeta, opts: { knockout: boolean }): void;
  /** Elegir un equipo del juego con el buscador. */
  pickTeam(title: string, onPick: (id: string) => void, back: () => void): void;
  /** Partido online con la plantilla del club (conecta con el servidor si hace falta). */
  clubOnline(): void;
}

const COLORS = ['#c8102e', '#e8590c', '#f6b40e', '#facc15', '#16a34a', '#0b7a3a', '#0ea5e9', '#1d4ed8', '#0b1d5b', '#7c3aed', '#be185d', '#ffffff', '#9ca3af', '#111111'];
const SHAPES: ClubIdentity['crest']['shape'][] = ['shield', 'circle', 'diamond'];
const SYMBOLS: ClubIdentity['crest']['symbol'][] = ['star', 'ball', 'lion', 'wave', 'bolt', 'crown', 'tower', 'eagle', 'none'];
const SYMBOL_NAMES: Record<string, string> = { star: 'Estrella', ball: 'Pelota', lion: 'León', wave: 'Ola', bolt: 'Rayo', crown: 'Corona', tower: 'Torre', eagle: 'Águila', none: 'Sin símbolo' };
const PATTERNS: ClubIdentity['pattern'][] = ['solid', 'stripes', 'hoops', 'sash', 'band', 'halves', 'vee', 'gradient'];
const PATTERN_NAMES: Record<string, string> = { solid: 'Lisa', stripes: 'Vertical', hoops: 'Horizontal', sash: 'Banda cruzada', band: 'Franja', halves: 'Mitades', vee: 'En V', gradient: 'Degradado' };

export function identityTeam(id: ClubIdentity): TeamData {
  const kit: KitData = { shirt: id.primary, shirt2: id.secondary, pattern: id.pattern, shorts: id.primary, socks: id.primary, number: '#ffffff' };
  const short = id.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  return { id: 'club-preview', name: id.name, short, city: '', crest: { shape: id.crest.shape, primary: id.primary, secondary: id.secondary, symbol: id.crest.symbol, stripes: id.crest.stripes }, home: kit, away: kit, gkKit: kit, formation: '4-3-3', rating: 60, players: [] };
}

const ATTR_NAMES: Record<string, string> = { speed: 'velocidad', acceleration: 'aceleración', passing: 'pase', shooting: 'tiro', control: 'regate', defending: 'defensa', stamina: 'resistencia', goalkeeping: 'portería' };
const bar = (frac: number, cls = '') => `<div class="cb-bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></i></div>`;
const when = (t: number) => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Modo Soffti Club: creación del club, panel principal, colección, objetivos, competiciones y desafíos de plantilla. */
export class ClubUI implements ClubHost {
  club!: Club;
  private screen: Screen | null = null;
  private toastTimer = 0;
  private draft: ClubIdentity & { formation: FormationId } = { name: 'Mi Club FC', crest: { shape: 'shield', symbol: 'star', stripes: false }, primary: '#1d4ed8', secondary: '#facc15', pattern: 'stripes', formation: '4-3-3' };

  constructor(private app: ClubApp) {}

  get audio() { return this.app.audio; }
  now() { return Date.now(); }

  show(html: string, handlers: Handlers, back: (() => void) | null, cls = ''): Screen {
    this.screen = this.app.show(html, handlers, back, cls);
    return this.screen;
  }

  toast(text: string, kind: 'ok' | 'err' = 'ok') {
    document.querySelector('.club-toast')?.remove();
    const t = el('div', `club-toast ${kind}`, esc(text));
    document.body.appendChild(t);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? 3600 : 2400);
  }

  goto(screen: Parameters<ClubHost['goto']>[0]) {
    switch (screen) {
      case 'squad': squadScreen(this); break;
      case 'packs': packsScreen(this); break;
      case 'market': marketScreen(this); break;
      case 'collection': this.collection(); break;
      case 'competitions': this.competitions(); break;
      case 'objectives': this.objectives('objetivos'); break;
      case 'history': this.objectives('estadisticas'); break;
      case 'sbc': this.sbc(); break;
      case 'evos': this.evos(); break;
      case 'pass': this.objectives('pase'); break;
      case 'missions': this.objectives('misiones'); break;
      case 'online': this.app.clubOnline(); break;
    }
  }

  // ==================================================================
  // Entrada y creación del club
  // ==================================================================
  open() {
    const c = Club.load(this.now());
    if (c) { this.club = c; this.hub(); } else this.createClub();
  }

  private createClub(error = '') {
    const d = this.draft;
    const colorRow = (key: 'primary' | 'secondary') => `<div class="cb-colors">${COLORS.map((c) => `<button class="cb-sw ${d[key].toLowerCase() === c ? 'on' : ''}" data-color="${key}:${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}<input type="color" class="cb-colorpick" data-colorpick="${key}" value="${d[key]}" aria-label="Color personalizado"></div>`;
    const preview = () => { const t = identityTeam(d); return `<div class="cb-prev-crest">${crestSVG(t, 150)}</div><div class="cb-prev-name">${esc(d.name || 'Tu club')}</div><div class="cb-prev-kit">${kitSVG(t.home, 90)}</div>`; };
    const html = `
      <div class="screen-header"><div><div class="crumb">SOFFTI CLUB</div><h2>Crea tu club</h2></div></div>
      <div class="screen-body"><div class="cb-create">
        <div class="panel cb-form">
          <label class="cb-l">Nombre del club</label>
          <input class="text-in cb-name" maxlength="24" value="${esc(d.name)}" data-enter="create" autocomplete="off" spellcheck="false">
          ${error ? `<div class="sub-msg">${esc(error)}</div>` : ''}
          <label class="cb-l">Escudo</label>
          <div class="cb-chips">${SHAPES.map((s) => `<button class="cb-chip ${d.crest.shape === s ? 'on' : ''}" data-shape="${s}">${{ shield: 'Escudo', circle: 'Círculo', diamond: 'Rombo' }[s]}</button>`).join('')}
            <button class="cb-chip ${d.crest.stripes ? 'on' : ''}" data-stripes="1">Rayado</button></div>
          <div class="cb-chips">${SYMBOLS.map((s) => `<button class="cb-chip ${d.crest.symbol === s ? 'on' : ''}" data-symbol="${s}">${SYMBOL_NAMES[s]}</button>`).join('')}</div>
          <label class="cb-l">Color principal</label>${colorRow('primary')}
          <label class="cb-l">Color secundario</label>${colorRow('secondary')}
          <label class="cb-l">Camiseta</label>
          <div class="cb-chips">${PATTERNS.map((p) => `<button class="cb-chip ${d.pattern === p ? 'on' : ''}" data-pattern="${p}">${PATTERN_NAMES[p]}</button>`).join('')}</div>
          <label class="cb-l">Formación inicial</label>
          <div class="cb-chips">${(Object.keys(FORMATIONS) as FormationId[]).map((f) => `<button class="cb-chip ${d.formation === f ? 'on' : ''}" data-form="${f}">${f}</button>`).join('')}</div>
        </div>
        <div class="panel cb-side">
          <div class="cb-prev">${preview()}</div>
          <div class="cb-welcome"><b>Tu paquete de bienvenida</b>
            <ul><li>${fmt(ECONOMY.startCoins)} monedas</li><li>Una plantilla inicial de 18 jugadores (bronce y plata)</li><li>2 sobres promocionales gratis</li><li>Tu progreso se guarda solo en este dispositivo</li></ul>
          </div>
        </div>
      </div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button><button class="btn primary" data-act="create">Crear club</button></div>`;
    const s = this.show(html, {
      back: () => this.app.mainMenu(),
      create: () => {
        const name = (s.root.querySelector('.cb-name') as HTMLInputElement).value;
        d.name = name;
        const r = Club.create({ name, crest: d.crest, primary: d.primary, secondary: d.secondary, pattern: d.pattern }, d.formation, this.now());
        if (!r.ok) { this.createClub(r.error); return; }
        this.club = r.value;
        this.toast('¡Club creado! Revisa tus sobres de bienvenida.');
        this.hub();
      },
    }, () => this.app.mainMenu(), 'club-screen club-create');
    const redraw = () => { (s.root.querySelector('.cb-prev') as HTMLElement).innerHTML = preview(); };
    s.root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('cb-name')) { d.name = t.value; redraw(); }
      else if (t.dataset.colorpick) { (d as unknown as Record<string, string>)[t.dataset.colorpick] = t.value; redraw(); }
    });
    s.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      const ds = b.dataset;
      if (ds.color) { const [k, v] = ds.color.split(':'); (d as unknown as Record<string, string>)[k] = v; }
      else if (ds.shape) d.crest.shape = ds.shape as never;
      else if (ds.symbol) d.crest.symbol = ds.symbol as never;
      else if (ds.stripes) d.crest.stripes = !d.crest.stripes;
      else if (ds.pattern) d.pattern = ds.pattern as never;
      else if (ds.form) d.formation = ds.form as FormationId;
      else return;
      d.name = (s.root.querySelector('.cb-name') as HTMLInputElement).value;
      this.createClub(error);
    });
  }

  // ==================================================================
  // Panel principal
  // ==================================================================
  /** Recompensas listas para reclamar (se muestran como globos en el panel). */
  pendingClaims(): number {
    const c = this.club, now = this.now();
    c.tick(now);
    let n = loginStatus(c.s, now).claimed ? 0 : 1;
    for (const [list, claimed] of [[c.s.progress.daily.objectives, c.s.progress.daily.claimed], [c.s.progress.weekly.objectives, c.s.progress.weekly.claimed]] as const) {
      for (const o of list) { const d = objectiveDef(o.id); if (d && o.progress >= d.target && !claimed.includes(o.id)) n++; }
    }
    n += milestoneStatus(c.s).filter((m) => m.done && !m.claimed).length;
    n += passPending(c.s) + missionsPending(c.s);
    return n;
  }

  hub() {
    const c = this.club;
    const now = this.now();
    c.tick(now);
    const s = c.s;
    const q = c.squad;
    const ev = c.evalSquad();
    const lv = levelProgress(s.xp);
    const season = currentSeason(now);
    const daysLeft = Math.max(0, Math.ceil((season.end - now) / 86400000));
    const idTeam = identityTeam(s.identity);
    const claims = this.pendingClaims();
    const promos = c.packsInReserve;
    const pending = s.packs.openings.reduce((t, o) => t + o.cards.filter((x) => !x.decided).length, 0);
    const slots = FORMATIONS[q.formation];
    const pitch = slots.map((sl, i) => {
      const d = c.def(q.slots[i]);
      const left = 50 + sl.lateral * 42;
      const top = 94 - sl.depth * 88;
      return `<div class="cb-dot" style="left:${left}%;top:${top}%">${d ? miniCardHTML(d, { effOvr: ev.slots[i].effOvr, cls: 'cb-mini' }) : '<span class="cb-empty">+</span>'}</div>`;
    }).join('');
    const login = loginStatus(s, now);
    const rule = tournamentRuleOf(weekId(now));
    const evCount = eventDefs(season.id).length;
    const news: string[] = [
      `<b>${esc(season.name)}</b> · quedan ${daysLeft} días · ${s.progress.season.points} puntos de temporada`,
      evCount ? `Cartas de evento de la temporada: ${evCount} disponibles en sobres especiales y en el mercado.` : '',
      `Torneo semanal: <b>${esc(rule.name)}</b> — ${esc(rule.text)}.`,
      s.champions.entered ? `Champions: ${s.champions.wins} victorias en ${s.champions.played}/${CHAMPIONS.matches} partidos.` : `Champions abre cada semana (nivel ${CHAMPIONS.minLevel}+, ${fmt(CHAMPIONS.entryCost)} monedas).`,
      `Rivals: División ${rivalsDivision(s.rivals.points)} · ${s.rivals.points} puntos.`,
      ...s.inbox.slice(0, 3).map((m) => `${esc(m.text)}`),
    ].filter(Boolean);
    const tile = (act: string, icon: string, title: string, sub: string, badge = '') => `<button class="cb-tile" data-act="${act}"><span class="cb-ico">${icon}</span><b>${title}</b><small>${sub}</small>${badge ? `<span class="cb-badge">${badge}</span>` : ''}</button>`;
    const html = `
      <div class="cb-hub">
        <div class="cb-top">
          <div class="cb-id">${crestSVG(idTeam, 64)}<div><div class="cb-clubname">${esc(s.identity.name)}</div><div class="cb-sub">Plantilla: ${esc(q.name)} · ${q.formation}</div></div></div>
          <div class="cb-lv"><div class="cb-lvnum num">${lv.level}</div><div class="cb-lvinfo"><small>NIVEL · ${lv.into}/${lv.need} XP</small>${bar(lv.frac)}</div></div>
          <div class="cb-coins num" title="Monedas del juego (no se compran con dinero real)"><span>ⓒ</span>${fmt(s.coins)}</div>
        </div>
        <div class="cb-main">
          <div class="panel cb-squad">
            <div class="cb-ph"><h3>Plantilla activa</h3><div class="cb-ovrs"><span class="num">${ev.ovr}</span><small>VALORACIÓN</small><span class="num">${ev.chem}</span><small>QUÍMICA</small></div></div>
            <div class="cb-pitch">${pitch}</div>
            <button class="btn primary" data-act="squad">Gestionar plantilla</button>
          </div>
          <div class="cb-tiles">
            ${tile('packs', '🎴', 'Sobres', promos ? `${promos} gratis para abrir` : 'Abre y colecciona', pending ? `${pending}` : promos ? `${promos}` : '')}
            ${tile('market', '🔁', 'Mercado', 'Compra y vende (simulado)')}
            ${tile('competitions', '🏆', 'Competiciones', `Online · Rivals · Champions · Batallas · Torneo`)}
            ${tile('objectives', '🎯', 'Objetivos', 'Diarios, semanales y temporada', claims ? `${claims}` : '')}
            ${tile('sbc', '🧩', 'Desafíos', 'Crea plantillas por premios')}
            ${tile('collection', '🗂️', 'Colección', `${s.inventory.length}/${MAX_INVENTORY} cartas`)}
            ${tile('evos', '🧬', 'Evoluciones', s.evos.length ? `${s.evos.length} en curso` : 'Mejora a tus jugadores')}
            ${tile('pass', '🎟️', 'Pase', `Nivel ${passLevel(s.progress.season.points)}/${PASS_LEVELS}${s.progress.season.premium ? ' · premium' : ''}`, passPending(s) ? `${passPending(s)}` : '')}
            ${tile('online', '🌐', 'Online', s.online.played ? `${s.online.points} pts · ${s.online.won}V ${s.online.drawn}E ${s.online.lost}D` : 'Tu club contra otros clubes')}
            ${tile('history', '📊', 'Récords', `${s.records.played} partidos · ${s.records.won} victorias`)}
          </div>
          <div class="panel cb-news">
            <h3>Noticias y eventos</h3>
            <button class="btn ${login.claimed ? '' : 'primary'}" data-act="login" ${login.claimed ? 'disabled' : ''}>${login.claimed ? `Recompensa de hoy reclamada (racha ${login.streak})` : `Reclamar recompensa diaria · día ${login.next + 1}: ${esc(rewardText(login.reward))}`}</button>
            <ul>${news.map((n) => `<li>${n}</li>`).join('')}</ul>
            ${c.isTest ? '<div class="cb-test">DATOS DE PRUEBA</div>' : ''}
          </div>
        </div>
      </div>
      <div class="screen-footer"><button class="btn" data-act="back">Menú</button><button class="btn danger" data-act="reset">Borrar club</button></div>`;
    this.show(html, {
      back: () => this.app.mainMenu(),
      squad: () => this.goto('squad'), packs: () => this.goto('packs'), market: () => this.goto('market'), competitions: () => this.goto('competitions'),
      objectives: () => this.goto('objectives'), sbc: () => this.goto('sbc'), collection: () => this.goto('collection'), history: () => this.goto('history'),
      evos: () => this.goto('evos'), pass: () => this.goto('pass'), online: () => this.goto('online'),
      login: () => { const r = c.claimLogin(this.now()); if (r.ok) this.toast(`Recompensa diaria: ${rewardText(r.reward!)}`); else this.toast(r.error ?? 'No disponible', 'err'); this.hub(); },
      reset: () => this.confirm('¿Borrar tu club?', 'Se perderán para siempre tus cartas, monedas y progreso. Esta acción no se puede deshacer.', 'Borrar', () => { Club.clear(); this.app.mainMenu(); }, () => this.hub()),
    }, () => this.app.mainMenu(), 'club-screen club-hub');
  }

  /** Diálogo de confirmación. */
  confirm(title: string, text: string, okLabel: string, onOk: () => void, onCancel: () => void) {
    this.show(`<div class="panel modal" style="margin:auto;text-align:center"><div class="crumb">CONFIRMAR</div><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="screen-footer" style="justify-content:center"><button class="btn" data-act="no">Cancelar</button><button class="btn danger" data-act="yes">${esc(okLabel)}</button></div></div>`, { no: onCancel, yes: onOk }, onCancel, 'club-screen');
  }

  // ==================================================================
  // Colección
  // ==================================================================
  private colFilter = { text: '', rarity: '' as Rarity | '', group: '', sort: 'ovr' };
  private collection() {
    const c = this.club;
    const f = this.colFilter;
    const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const list = (): { ci: CardInstance; d: NonNullable<ReturnType<typeof getCardDef>> }[] => {
      const words = norm(f.text).split(/\s+/).filter(Boolean);
      const out = c.s.inventory.map((ci) => ({ ci, d: getCardDef(ci.defId)! })).filter((x) => x.d)
        .filter((x) => (!f.rarity || x.d.rarity === f.rarity) && (!f.group || x.d.group === f.group) && words.every((w) => norm(`${x.d.name} ${x.d.clubName} ${x.d.nat}`).includes(w)));
      out.sort((a, b) => f.sort === 'name' ? a.d.name.localeCompare(b.d.name, 'es') : f.sort === 'price' ? b.d.price - a.d.price : f.sort === 'age' ? a.d.age - b.d.age : f.sort === 'recent' ? b.ci.acquired - a.ci.acquired : b.d.ovr - a.d.ovr);
      return out;
    };
    const grid = () => {
      const l = list();
      const inSq = (u: string) => usedInSquads(c.s, u);
      return { html: l.map(({ ci, d }) => `<div class="cb-colcard" data-uid="${ci.uid}">${cardHTML(d, { size: 'sm', badge: inSq(ci.uid) ? 'En plantilla' : '' })}</div>`).join('') || '<p class="muted">No hay cartas que coincidan.</p>', n: l.length };
    };
    const g0 = grid();
    const s = this.show(`
      <div class="screen-header"><div><div class="crumb">SOFFTI CLUB</div><h2>Colección</h2></div></div>
      <div class="ts-bar">
        <input class="text-in ts-q" type="search" placeholder="Buscar por nombre, club o nacionalidad…" value="${esc(f.text)}" autocomplete="off" aria-label="Buscar carta">
        <label class="ts-sel">Rareza<select class="cb-rar"><option value="">Todas</option>${(Object.keys(RARITY_NAMES) as Rarity[]).map((r) => `<option value="${r}" ${f.rarity === r ? 'selected' : ''}>${RARITY_NAMES[r]}</option>`).join('')}</select></label>
        <label class="ts-sel">Línea<select class="cb-grp">${[['', 'Todas'], ['GK', 'Porteros'], ['DEF', 'Defensas'], ['MID', 'Medios'], ['FWD', 'Delanteros']].map(([v, n]) => `<option value="${v}" ${f.group === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="ts-sel">Orden<select class="cb-sort">${[['ovr', 'Valoración'], ['price', 'Valor'], ['recent', 'Recientes'], ['name', 'Nombre'], ['age', 'Edad']].map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <span class="ts-count num cb-count">${g0.n} cartas</span>
      </div>
      <div class="screen-body"><div class="cb-colgrid">${g0.html}</div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, { back: () => this.hub() }, () => this.hub(), 'club-screen club-collection');
    const redraw = () => { const g = grid(); (s.root.querySelector('.cb-colgrid') as HTMLElement).innerHTML = g.html; (s.root.querySelector('.cb-count') as HTMLElement).textContent = `${g.n} cartas`; };
    (s.root.querySelector('.ts-q') as HTMLInputElement).addEventListener('input', (e) => { f.text = (e.target as HTMLInputElement).value; redraw(); });
    (s.root.querySelector('.cb-rar') as HTMLSelectElement).addEventListener('change', (e) => { f.rarity = (e.target as HTMLSelectElement).value as Rarity | ''; redraw(); });
    (s.root.querySelector('.cb-grp') as HTMLSelectElement).addEventListener('change', (e) => { f.group = (e.target as HTMLSelectElement).value; redraw(); });
    (s.root.querySelector('.cb-sort') as HTMLSelectElement).addEventListener('change', (e) => { f.sort = (e.target as HTMLSelectElement).value; redraw(); });
    s.root.querySelector('.cb-colgrid')!.addEventListener('click', (e) => { const u = ((e.target as HTMLElement).closest('[data-uid]') as HTMLElement | null)?.dataset.uid; if (u) this.cardDetail(u); });
  }

  /** Ficha de una carta del club con sus acciones. */
  cardDetail(uid: string, back: () => void = () => this.collection()) {
    const c = this.club;
    const ci = c.card(uid);
    const d = ci ? getCardDef(ci.defId) : null;
    if (!ci || !d) { back(); return; }
    const used = usedInSquads(c.s, uid);
    const evo = c.evoOf(uid);
    const labels = statLabels(d);
    const sell = Math.max(10, Math.round(d.price * ECONOMY.quickSell));
    this.show(`<div class="screen-header"><div><div class="crumb">CARTA · ${RARITY_NAMES[d.rarity].toUpperCase()}</div><h2>${esc(d.name)}</h2></div></div>
      <div class="screen-body"><div class="cb-detail">
        <div class="cb-detcard">${cardHTML(d, { size: 'lg' })}</div>
        <div class="panel cb-detinfo">
          <table class="tbl"><tr><td>Posición</td><td>${d.role} <span class="muted">(alt.: ${d.alt.join(', ') || '—'})</span></td></tr>
            <tr><td>Club</td><td>${esc(d.clubName)}</td></tr><tr><td>Nacionalidad</td><td>${esc(d.nat)}</td></tr><tr><td>Edad</td><td>${d.age}</td></tr>
            <tr><td>Pierna hábil / filigranas</td><td>${d.foot === 'D' ? 'Derecha' : 'Izquierda'} · ${'★'.repeat(d.skill)}</td></tr>
            ${STAT_KEYS.map((k, i) => `<tr><td>${labels[i]}</td><td class="num">${d.stats[k]}</td></tr>`).join('')}
            <tr><td>Valor de mercado</td><td class="num">${fmt(d.price)} ⓒ</td></tr><tr><td>Venta rápida</td><td class="num">${fmt(sell)} ⓒ</td></tr>
            <tr><td>Origen</td><td>${esc(ci.source)} · ${when(ci.acquired)}</td></tr></table>
          ${d.fictional && d.rarity === 'legend' ? '<p class="muted" style="font-size:12px">Leyenda ficticia: personaje inventado por el juego.</p>' : ''}
          <div class="cb-detact">
            <button class="btn" data-act="sell" ${used ? 'disabled' : ''}>Venta rápida (+${fmt(sell)})</button>
            <button class="btn" data-act="market" ${used || d.evo || evo ? 'disabled' : ''}>Poner en el mercado</button>
            ${!d.evo && !evo && EVOS.some((e) => evoEligible(e, d)) ? '<button class="btn" data-act="evolve">Evolucionar</button>' : ''}
            <button class="btn danger" data-act="discard" ${used ? 'disabled' : ''}>Descartar</button>
          </div>
          ${used ? '<p class="muted">Está en una plantilla: quítala de ahí para poder venderla o descartarla.</p>' : ''}
          ${d.evo ? `<p class="muted">🧬 Evolución <b>${esc(d.evo.name)}</b> · nivel ${d.evo.level}. No se puede vender en el mercado.</p>` : ''}
          ${evo ? `<p class="muted">🧬 En evolución: <b>${esc(evoById(evo.evoId)?.name ?? '')}</b> (nivel ${evo.level + 1}).</p>` : ''}
        </div></div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, {
      back,
      sell: () => { const r = c.quickSell(uid, this.now()); if (r.ok) { this.toast(`Vendida por ${fmt(r.value)} monedas`); back(); } else this.toast(r.error, 'err'); },
      market: () => this.goto('market'),
      evolve: () => { const e = EVOS.find((x) => evoEligible(x, d)); if (e) this.evoPick(e.id, uid); },
      discard: () => this.confirm('¿Descartar la carta?', `${d.name} se elimina de tu club sin recibir monedas.`, 'Descartar', () => { const r = c.discard(uid); if (!r.ok) this.toast(r.error, 'err'); back(); }, () => this.cardDetail(uid, back)),
    }, back, 'club-screen club-detail');
  }

  // ==================================================================
  // Objetivos, hitos, temporada y estadísticas
  // ==================================================================
  private objTab: 'objetivos' | 'misiones' | 'pase' | 'hitos' | 'estadisticas' = 'objetivos';
  private objectives(tab: typeof this.objTab) {
    this.objTab = tab;
    const c = this.club;
    const now = this.now();
    c.tick(now);
    const s = c.s;
    const lv = levelProgress(s.xp);
    const tabs: [typeof tab, string][] = [['objetivos', 'Objetivos'], ['misiones', `Misiones${missionsPending(s) ? ` (${missionsPending(s)})` : ''}`], ['pase', `Pase de temporada${passPending(s) ? ` (${passPending(s)})` : ''}`], ['hitos', 'Hitos'], ['estadisticas', 'Estadísticas y récords']];
    const handlers: Handlers = { back: () => this.hub() };
    const objRow = (scope: 'daily' | 'weekly', o: { id: string; progress: number }, claimed: string[]) => {
      const d = objectiveDef(o.id);
      if (!d) return '';
      const done = o.progress >= d.target;
      const isClaimed = claimed.includes(o.id);
      handlers[`obj-${scope}-${o.id}`] = () => { const r = c.claimObjective(scope, o.id, this.now()); if (r.ok) this.toast(`Reclamado: ${rewardText(r.reward!)}`); else this.toast(r.error ?? 'Error', 'err'); this.objectives(this.objTab); };
      return `<div class="cb-obj ${isClaimed ? 'done' : ''}"><div class="cb-objt"><b>${esc(d.text)}</b><small>${esc(rewardText(d.reward))}</small>${bar(o.progress / d.target)}</div><div class="cb-objn num">${Math.min(o.progress, d.target)}/${d.target}</div>
        <button class="btn ${done && !isClaimed ? 'primary' : ''}" data-act="obj-${scope}-${o.id}" ${!done || isClaimed ? 'disabled' : ''}>${isClaimed ? 'Reclamado' : 'Reclamar'}</button></div>`;
    };
    let body = '';
    if (tab === 'objetivos') {
      const login = loginStatus(s, now);
      handlers.login = () => { const r = c.claimLogin(this.now()); if (r.ok) this.toast(`Recompensa diaria: ${rewardText(r.reward!)}`); else this.toast(r.error ?? 'No disponible', 'err'); this.objectives('objetivos'); };
      const strip = LOGIN_REWARDS.map((r, i) => `<div class="cb-day ${i < login.streak % 7 || (login.claimed && i === (login.streak - 1) % 7) ? 'got' : ''} ${i === login.next && !login.claimed ? 'now' : ''}"><small>Día ${i + 1}</small><span>${esc(rewardText(r))}</span></div>`).join('');
      body = `<div class="grid2"><div>
        <div class="panel"><h3>Recompensa de inicio de sesión</h3><div class="cb-days">${strip}</div>
          <button class="btn ${login.claimed ? '' : 'primary'}" data-act="login" ${login.claimed ? 'disabled' : ''}>${login.claimed ? 'Ya reclamaste la de hoy' : 'Reclamar recompensa de hoy'}</button></div>
        <div class="panel" style="margin-top:14px"><h3>Objetivos diarios <small class="muted">(se renuevan a las 00:00 UTC)</small></h3>${s.progress.daily.objectives.map((o) => objRow('daily', o, s.progress.daily.claimed)).join('')}</div>
        </div><div>
        <div class="panel"><h3>Objetivos semanales <small class="muted">(se renuevan cada lunes)</small></h3>${s.progress.weekly.objectives.map((o) => objRow('weekly', o, s.progress.weekly.claimed)).join('')}</div>
        <div class="panel" style="margin-top:14px"><h3>Experiencia del club</h3><p>Nivel <b class="num">${lv.level}</b> · ${lv.into}/${lv.need} XP</p>${bar(lv.frac)}<p class="muted" style="font-size:12px">Cada nivel da monedas y, cada 5, un sobre promocional. La experiencia sale de partidos, objetivos, desafíos y sobres: no depende solo de ganar.</p></div>
        </div></div>`;
    } else if (tab === 'pase') {
      const season = currentSeason(now);
      const pts = s.progress.season.points;
      const lvl = passLevel(pts);
      const prem = !!s.progress.season.premium;
      const into = lvl >= PASS_LEVELS ? PASS_LEVEL_POINTS : pts - lvl * PASS_LEVEL_POINTS;
      const daysLeft = Math.max(0, Math.ceil((season.end - now) / 86400000));
      const cell = (track: 'free' | 'premium', l: number) => {
        const got = passClaimed(s, track, l);
        const open = l <= lvl && (track === 'free' || prem);
        const r = passReward(track, l);
        const big = !!r.packs;
        if (open && !got) handlers[`ps-${track}-${l}`] = () => { const x = c.claimPass(track, l, this.now()); if (x.ok) this.toast(`Pase: ${rewardText(x.reward!)}`); else this.toast(x.error ?? 'Error', 'err'); this.objectives('pase'); };
        return `<button class="cb-pcell ${track} ${got ? 'got' : open ? 'ready' : l <= lvl ? 'lock' : ''} ${big ? 'big' : ''}" ${open && !got ? `data-act="ps-${track}-${l}"` : 'disabled'} title="${esc(rewardText(r))}">
          <span class="cb-pico">${got ? '✓' : r.packs ? '🎴' : r.coins ? 'ⓒ' : '★'}</span><small>${esc(rewardText(r))}</small></button>`;
      };
      const cols = Array.from({ length: PASS_LEVELS }, (_, k) => k + 1).map((l) => `<div class="cb-pcol ${l <= lvl ? 'reached' : ''} ${l === lvl + 1 ? 'next' : ''}"><div class="cb-plv num">${l}</div>${cell('free', l)}${cell('premium', l)}</div>`).join('');
      handlers.passAll = () => { const n = c.claimAllPass(this.now()); this.toast(n ? `Reclamadas ${n} recompensas del pase` : 'Nada para reclamar', n ? 'ok' : 'err'); this.objectives('pase'); };
      handlers.passPremium = () => this.confirm('¿Desbloquear el pase premium?', `Cuesta ${fmt(PASS_PREMIUM_COST)} monedas del juego y dura hasta el final de ${season.name}. Las recompensas de los niveles ya alcanzados quedan listas para reclamar.`, 'Desbloquear', () => { const x = c.unlockPremiumPass(this.now()); if (x.ok) this.toast('¡Pase premium desbloqueado!'); else this.toast(x.error ?? 'Error', 'err'); this.objectives('pase'); }, () => this.objectives('pase'));
      body = `<div class="panel cb-pass"><div class="cb-passhead">
          <div><h3>${esc(season.name)}</h3><p class="muted">Quedan ${daysLeft} días. Sube de nivel con puntos de temporada: partidos, objetivos, misiones, sobres, desafíos y evoluciones.</p></div>
          <div class="cb-passlv"><span class="num">${lvl}</span><small>NIVEL DEL PASE</small>${bar(lvl >= PASS_LEVELS ? 1 : into / PASS_LEVEL_POINTS)}<small class="muted num">${lvl >= PASS_LEVELS ? 'Pase completado' : `${into}/${PASS_LEVEL_POINTS} pts al nivel ${lvl + 1}`}</small></div>
          <div class="cb-btnrow"><button class="btn primary" data-act="passAll" ${passPending(s) ? '' : 'disabled'}>Reclamar todo</button>${prem ? '<span class="cb-premtag">PREMIUM ACTIVO</span>' : `<button class="btn cb-premb" data-act="passPremium">Pase premium · ${fmt(PASS_PREMIUM_COST)} ⓒ</button>`}</div></div>
        <div class="cb-ptrack-labels"><span>GRATIS</span><span class="${prem ? '' : 'muted'}">PREMIUM ${prem ? '' : '🔒'}</span></div>
        <div class="cb-ptrack">${cols}</div></div>`;
    } else if (tab === 'misiones') {
      const m = s.progress.missions;
      body = `<div class="cb-missions">${MISSIONS.map((g) => {
        const done = g.tasks.filter((t) => m.claimed.includes(t.id)).length;
        const groupReady = done === g.tasks.length && !m.groups.includes(g.id);
        handlers[`mg-${g.id}`] = () => { const r = c.claimMissionGroup(g.id, this.now()); if (r.ok) this.toast(`Grupo completado: ${rewardText(r.reward!)}`); else this.toast(r.error ?? 'Error', 'err'); this.objectives('misiones'); };
        const rows = g.tasks.map((t) => {
          const v = Math.min(t.target, m.progress[t.id] ?? 0);
          const got = m.claimed.includes(t.id);
          handlers[`mt-${t.id}`] = () => { const r = c.claimMission(t.id, this.now()); if (r.ok) this.toast(`Misión: ${rewardText(r.reward!)}`); else this.toast(r.error ?? 'Error', 'err'); this.objectives('misiones'); };
          return `<div class="cb-obj ${got ? 'done' : ''}"><div class="cb-objt"><b>${esc(t.text)}</b><small>${esc(rewardText(t.reward))}</small>${bar(v / t.target)}</div><div class="cb-objn num">${v}/${t.target}</div>
            <button class="btn ${v >= t.target && !got ? 'primary' : ''}" data-act="mt-${t.id}" ${v < t.target || got ? 'disabled' : ''}>${got ? 'Reclamado' : 'Reclamar'}</button></div>`;
        }).join('');
        return `<div class="panel cb-mgroup ${m.groups.includes(g.id) ? 'done' : ''}"><div class="cb-mhead"><div><h3>${esc(g.name)}</h3><small class="muted">${esc(g.blurb)}</small></div><div class="cb-mprog num">${done}/${g.tasks.length}</div></div>${rows}
          <div class="cb-mreward"><span>Premio del grupo: <b>${esc(rewardText(g.reward))}</b></span><button class="btn ${groupReady ? 'primary' : ''}" data-act="mg-${g.id}" ${groupReady ? '' : 'disabled'}>${m.groups.includes(g.id) ? 'Conseguido' : 'Reclamar grupo'}</button></div></div>`;
      }).join('')}</div>`;
    } else if (tab === 'hitos') {
      body = `<div class="panel"><h3>Hitos del club</h3>${milestoneStatus(s).map((m) => {
        handlers[`ms-${m.def.id}`] = () => { const r = c.claimMilestone(m.def.id, this.now()); if (r.ok) this.toast(`Reclamado: ${rewardText(r.reward!)}`); else this.toast(r.error ?? 'Error', 'err'); this.objectives('hitos'); };
        return `<div class="cb-obj ${m.claimed ? 'done' : ''}"><div class="cb-objt"><b>${esc(m.def.text)}</b><small>${esc(rewardText(m.def.reward))}</small>${bar(m.value / m.def.target)}</div><div class="cb-objn num">${Math.min(m.value, m.def.target)}/${m.def.target}</div><button class="btn ${m.done && !m.claimed ? 'primary' : ''}" data-act="ms-${m.def.id}" ${!m.done || m.claimed ? 'disabled' : ''}>${m.claimed ? 'Reclamado' : 'Reclamar'}</button></div>`;
      }).join('')}</div>`;
    } else {
      const r = s.records;
      const row = (k: string, v: string | number) => `<tr><td>${k}</td><td class="num">${typeof v === 'number' ? fmt(v) : v}</td></tr>`;
      body = `<div class="grid2"><div class="panel"><h3>Partidos</h3><table class="tbl">${row('Jugados', r.played)}${row('Victorias', r.won)}${row('Empates', r.drawn)}${row('Derrotas', r.lost)}${row('Goles a favor', r.goalsFor)}${row('Goles en contra', r.goalsAgainst)}${row('Porterías a cero', r.cleanSheets)}${row('Racha actual de victorias', r.streak)}${row('Mejor racha', r.bestStreak)}${row('Mayor victoria (diferencia)', r.biggestWin)}${row('Más goles en un partido', r.mostGoals)}</table></div>
        <div class="panel"><h3>Club y economía</h3><table class="tbl">${row('Sobres abiertos', r.packsOpened)}${row('Desafíos completados', r.sbcDone)}${row('Compras en el mercado', r.marketBuys)}${row('Ventas en el mercado', r.marketSells)}${row('Monedas ganadas (total)', r.coinsEarned)}${row('Monedas gastadas (total)', r.coinsSpent)}${row('División de Rivals', `${rivalsDivision(s.rivals.points)} (${s.rivals.points} pts)`)}${row('Club creado', new Date(s.createdAt).toLocaleDateString('es-ES'))}</table></div></div>`;
    }
    const tabBtns = tabs.map(([t, n]) => { handlers[`tab-${t}`] = () => this.objectives(t); return `<button class="btn ${tab === t ? 'primary' : ''}" data-act="tab-${t}">${n}</button>`; }).join('');
    this.show(`<div class="screen-header"><div><div class="crumb">SOFFTI CLUB</div><h2>Progreso</h2></div></div>
      <div class="cb-tabs">${tabBtns}</div><div class="screen-body">${body}</div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, handlers, () => this.hub(), 'club-screen club-obj');
    void DAILY_POOL; void ALL_OBJECTIVES; void MILESTONES;
  }

  // ==================================================================
  // Competiciones
  // ==================================================================
  private play(kind: ClubMatchKind, opts: { battleId?: string; oppId?: string } = {}) {
    const r = this.club.prepareMatch(kind, this.now(), opts);
    if (!r.ok) { this.toast(r.error, 'err'); this.competitions(); return; }
    this.app.playClubMatch(r.value.home, r.value.away, r.value.meta, { knockout: kind === 'tournament' });
  }

  competitions() {
    const c = this.club;
    const now = this.now();
    c.tick(now);
    const s = c.s;
    const ev = c.evalSquad();
    const complete = ev.filled === 11;
    const handlers: Handlers = { back: () => this.hub(), squad: () => this.goto('squad') };
    const call = (name: string, fn: () => void) => { handlers[name] = fn; return name; };
    const div = rivalsDivision(s.rivals.points);
    const nextT = DIVISION_THRESHOLDS[10 - div + 1];
    const prevT = DIVISION_THRESHOLDS[10 - div];
    const rivalsR = rivalsWeeklyReward(div);
    const warn = complete ? '' : '<div class="sub-msg">Tu plantilla titular está incompleta. <button class="btn" data-act="squad">Arreglar</button></div>';
    const rivals = `<div class="panel cb-comp"><h3>Rivals</h3><p class="muted">Partidos clasificatorios contra rivales de tu nivel. Gana puntos (+30 victoria, +10 empate, −10 derrota), sube de división y cobra la recompensa semanal.</p>
      <div class="cb-divrow"><div class="cb-divbadge num">${div}</div><div><b>División ${div}</b><small class="muted"> · ${s.rivals.points} puntos</small>${nextT !== undefined ? bar((s.rivals.points - prevT) / (nextT - prevT)) + `<small class="muted">${nextT - s.rivals.points} puntos para la División ${div - 1}</small>` : '<small class="muted">División máxima</small>'}</div></div>
      <p>Esta semana: <b class="num">${s.rivals.played}</b> partidos (${RIVALS_WEEKLY_MIN_MATCHES} para la recompensa) · <b class="num">${s.rivals.won}</b> victorias</p>
      <p class="muted" style="font-size:12px">Recompensa semanal (División ${div}): ${esc(rewardText(rivalsR))}. Si no la reclamas, se acredita sola al cambiar de semana.</p>
      <div class="cb-btnrow"><button class="btn primary" data-act="${call('rv-play', () => this.play('rivals'))}" ${complete ? '' : 'disabled'}>Jugar un partido</button>
      <button class="btn" data-act="${call('rv-claim', () => { const r = c.claimRivals(this.now()); if (r.ok) this.toast(`Reclamado: ${rewardText(r.value)}`); else this.toast(r.error, 'err'); this.competitions(); })}" ${s.rivals.claimed || s.rivals.played < RIVALS_WEEKLY_MIN_MATCHES ? 'disabled' : ''}>${s.rivals.claimed ? 'Reclamada' : 'Reclamar semanal'}</button></div></div>`;
    const ch = s.champions;
    const chChips = Array.from({ length: CHAMPIONS.matches }, (_, i) => { const r = ch.results[i]; return `<span class="cb-res ${r ?? ''}">${r ?? '·'}</span>`; }).join('');
    const champions = `<div class="panel cb-comp"><h3>Champions</h3><p class="muted">Acceso limitado: una inscripción por semana (nivel ${CHAMPIONS.minLevel}+, valoración ${CHAMPIONS.minOvr}+, ${fmt(CHAMPIONS.entryCost)} monedas). Juegas ${CHAMPIONS.matches} partidos contra rivales cada vez más fuertes y los premios dependen de tus victorias.</p>
      ${ch.entered ? `<div class="cb-resrow">${chChips}</div><p><b class="num">${ch.wins}</b> victorias · ${ch.played}/${CHAMPIONS.matches} partidos</p><p class="muted" style="font-size:12px">Premio actual: ${esc(rewardText(championsReward(ch.wins)))}</p>` : `<p class="muted" style="font-size:12px">Premios: 2 victorias ${esc(rewardText(championsReward(2)))} · 6 victorias ${esc(rewardText(championsReward(6)))} · 10 victorias ${esc(rewardText(championsReward(10)))}.</p>`}
      <div class="cb-btnrow">${!ch.entered ? `<button class="btn primary" data-act="${call('ch-enter', () => { const r = c.enterChampions(this.now()); if (r.ok) this.toast('Inscripción completada'); else this.toast(r.error, 'err'); this.competitions(); })}" ${complete ? '' : 'disabled'}>Inscribirme (${fmt(CHAMPIONS.entryCost)} ⓒ)</button>`
        : `<button class="btn primary" data-act="${call('ch-play', () => this.play('champions'))}" ${ch.played >= CHAMPIONS.matches || !complete ? 'disabled' : ''}>Jugar partido ${Math.min(ch.played + 1, CHAMPIONS.matches)}</button><button class="btn" data-act="${call('ch-claim', () => { const r = c.claimChampions(this.now()); if (r.ok) this.toast(`Reclamado: ${rewardText(r.value)}`); else this.toast(r.error, 'err'); this.competitions(); })}" ${ch.claimed || ch.played < CHAMPIONS.matches ? 'disabled' : ''}>${ch.claimed ? 'Reclamado' : 'Reclamar premio'}</button>`}</div></div>`;
    const battles = `<div class="panel cb-comp"><h3>Squad Battles</h3><p class="muted">Enfréntate a equipos de la IA de distinto nivel. Cada batalla se juega una vez al día y da su premio solo si ganas.</p>
      ${BATTLES.map((b) => { const done = !!s.battles.done[b.id]; return `<div class="cb-battle ${done ? 'done' : ''}"><div><b>${esc(b.name)}</b><small class="muted"> · rival ~${b.target}</small><div class="muted" style="font-size:12px">${esc(rewardText(b.reward))}</div></div><button class="btn ${done ? '' : 'primary'}" data-act="${call(`bt-${b.id}`, () => this.play('battle', { battleId: b.id }))}" ${done || !complete ? 'disabled' : ''}>${done ? 'Jugada hoy' : 'Jugar'}</button></div>`; }).join('')}</div>`;
    const wk = weekId(now);
    const rule = tournamentRuleOf(wk);
    const t = s.tournament;
    const ladder = t ? TOURNAMENT_ROUNDS.map((rn, i) => { const h = t.history.find((x) => x.round === i); const oppT = t.teams[i]; const state = h ? (h.gf > h.ga ? 'win' : 'loss') : i === t.round && t.alive && !t.finished ? 'now' : ''; return `<div class="cb-step ${state}"><b>${rn}</b><small>${esc(oppT ? oppName(oppT) : '')}${h ? ` · ${h.gf}-${h.ga}` : ''}</small></div>`; }).join('') : '';
    const tournament = `<div class="panel cb-comp"><h3>Torneo semanal · ${esc(rule.name)}</h3><p class="muted">Requisito de plantilla: <b>${esc(rule.text)}</b>. Eliminatorias de partido único (con prórroga y penales). Inscripción: ${fmt(TOURNAMENT_ENTRY)} monedas.</p>
      ${t && t.weekId === wk ? `<div class="cb-ladder">${ladder}</div>` : ''}
      <div class="cb-btnrow">${!t || t.weekId !== wk ? `<button class="btn primary" data-act="${call('tn-enter', () => { const r = c.enterTournament(this.now()); if (r.ok) this.toast('Inscripción completada'); else this.toast(r.error, 'err'); this.competitions(); })}" ${complete ? '' : 'disabled'}>Inscribirme (${fmt(TOURNAMENT_ENTRY)} ⓒ)</button>`
        : `<button class="btn primary" data-act="${call('tn-play', () => this.play('tournament'))}" ${t.finished || !t.alive ? 'disabled' : ''}>Jugar ${t.finished ? '' : TOURNAMENT_ROUNDS[t.round]}</button><button class="btn" data-act="${call('tn-claim', () => { const r = c.claimTournament(this.now()); if (r.ok) this.toast(`Reclamado: ${rewardText(r.value)}`); else this.toast(r.error, 'err'); this.competitions(); })}" ${t.claimed || !t.finished ? 'disabled' : ''}>${t.claimed ? 'Reclamado' : 'Reclamar premio'}</button>`}</div></div>`;
    const on = s.online;
    const online = `<div class="panel cb-comp cb-online"><h3>🌐 Online · club contra club</h3><p class="muted">Tu plantilla (con su química y sus evoluciones) contra la de otro jugador real. Partes de 4 minutos. Victoria +${ONLINE_POINTS.W}, empate +${ONLINE_POINTS.D}, derrota ${ONLINE_POINTS.L} puntos de club; premios en monedas un 25 % mayores. Abandonar cuenta como derrota.</p>
      <p><b class="num">${on.points}</b> puntos · <b class="num">${on.won}</b>V <b class="num">${on.drawn}</b>E <b class="num">${on.lost}</b>D</p>
      <div class="cb-btnrow"><button class="btn primary" data-act="${call('on-play', () => this.goto('online'))}" ${complete ? '' : 'disabled'}>Buscar rival online</button></div></div>`;
    const friendly = `<div class="panel cb-comp"><h3>Amistoso</h3><p class="muted">Juega contra cualquier equipo del juego. No afecta a tu clasificación, récords, objetivos ni economía.</p>
      <div class="cb-btnrow"><button class="btn primary" data-act="${call('fr-play', () => this.app.pickTeam('Elige tu rival amistoso', (id) => this.play('friendly', { oppId: id }), () => this.competitions()))}" ${complete ? '' : 'disabled'}>Elegir rival y jugar</button></div></div>`;
    this.show(`<div class="screen-header"><div><div class="crumb">SOFFTI CLUB · EQUIPO ${ev.ovr} · QUÍMICA ${ev.chem}</div><h2>Competiciones</h2></div></div>
      <div class="screen-body">${warn}<div class="cb-compgrid">${online}${rivals}${champions}${battles}${tournament}${friendly}</div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, handlers, () => this.hub(), 'club-screen club-comp');
  }

  // ==================================================================
  // Evoluciones
  // ==================================================================
  private evos() {
    const c = this.club;
    const now = this.now();
    c.tick(now);
    const s = c.s;
    const handlers: Handlers = { back: () => this.hub() };
    const boostText = (b: Record<string, number | undefined>) => Object.entries(b).filter(([, v]) => v).map(([k, v]) => `+${v} ${ATTR_NAMES[k] ?? k}`).join(' · ');
    const active = s.evos.map((a) => {
      const e = evoById(a.evoId)!;
      const d = c.def(a.uid);
      if (!d) return '';
      const lvl = e.levels[a.level];
      handlers[`evc-${a.uid}`] = () => this.confirm('¿Cancelar la evolución?', `${d.name} conserva los niveles ya conseguidos, pero pierde el progreso del nivel actual y no se devuelven monedas.`, 'Cancelar evolución', () => { c.cancelEvo(a.uid); this.evos(); }, () => this.evos());
      const tasks = lvl.tasks.map((t, i) => `<div class="cb-evtask"><span>${esc(t.text)}</span><b class="num">${Math.min(t.target, a.progress[i] ?? 0)}/${t.target}</b>${bar((a.progress[i] ?? 0) / t.target)}</div>`).join('');
      const inXI = c.squad.slots.includes(a.uid);
      return `<div class="panel cb-evact"><div class="cb-evcard">${cardHTML(d, { size: 'sm' })}</div><div class="cb-evinfo">
        <div class="crumb">${esc(e.name.toUpperCase())} · NIVEL ${a.level + 1}/${e.levels.length}</div><h3>${esc(d.name)}</h3>
        <div class="cb-evpips">${e.levels.map((_, i) => `<i class="${i < a.level ? 'on' : i === a.level ? 'cur' : ''}"></i>`).join('')}</div>
        ${tasks}<small class="muted">Al completarlo: ${esc(boostText(lvl.boost))}${lvl.skill ? ' · +1★ filigranas' : ''}</small>
        ${inXI ? '' : '<div class="sub-msg">No es titular en tu plantilla activa: solo progresa jugando de titular.</div>'}
        <div class="cb-btnrow"><button class="btn" data-act="evc-${a.uid}">Cancelar</button></div></div></div>`;
    }).join('');
    const list = EVOS.map((e) => {
      const eligible = s.inventory.filter((ci) => { const d = getCardDef(ci.defId); return d && evoEligible(e, d) && !s.evos.some((x) => x.uid === ci.uid); }).length;
      handlers[`evs-${e.id}`] = () => this.evoPick(e.id);
      const lv = e.levels.map((l, i) => `<li><b>Nivel ${i + 1}:</b> ${esc(l.tasks.map((t) => t.text).join(' y '))} → <span class="cb-evboost">${esc(boostText(l.boost))}${l.skill ? ' · +1★' : ''}</span></li>`).join('');
      return `<div class="panel cb-evo"><div class="cb-evohead"><h3>${esc(e.name)}</h3><span class="cb-evocost num">${e.cost ? `${fmt(e.cost)} ⓒ` : 'GRATIS'}</span></div>
        <p class="muted">${esc(e.blurb)}</p><p><b>Requisito:</b> ${esc(e.req.text)}</p><ol class="cb-evlv">${lv}</ol>
        <div class="cb-btnrow"><button class="btn primary" data-act="evs-${e.id}" ${eligible && s.evos.length < MAX_ACTIVE_EVOS ? '' : 'disabled'}>Elegir jugador (${eligible} posibles)</button></div></div>`;
    }).join('');
    this.show(`<div class="screen-header"><div><div class="crumb">SOFFTI CLUB · ${s.evos.length}/${MAX_ACTIVE_EVOS} EN CURSO</div><h2>Evoluciones</h2></div></div>
      <div class="screen-body"><p class="muted">Mejora una carta de tu club jugando con ella de titular. Cada nivel completado le suma atributos para siempre; la carta evolucionada lleva el sello EVO y no se puede vender en el mercado.</p>
      ${active ? `<h3 class="cb-sect">En curso</h3><div class="cb-evactgrid">${active}</div>` : ''}
      <h3 class="cb-sect">Disponibles</h3><div class="cb-evogrid">${list}</div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, handlers, () => this.hub(), 'club-screen club-evos');
  }

  /** Elegir la carta para una evolución, con la vista previa del resultado final. */
  private evoPick(evoId: string, sel = '') {
    const c = this.club;
    const e = evoById(evoId)!;
    const cands = c.s.inventory.map((ci) => ({ ci, d: getCardDef(ci.defId)! })).filter((x) => x.d && evoEligible(e, x.d) && !c.s.evos.some((a) => a.uid === x.ci.uid)).sort((a, b) => b.d.ovr - a.d.ovr);
    const chosen = cands.find((x) => x.ci.uid === sel) ?? cands[0];
    const after = chosen ? getCardDef(evolvedId(chosen.d.id, e.id, e.levels.length)) : undefined;
    const grid = cands.map(({ ci, d }) => `<div class="cb-colcard ${chosen?.ci.uid === ci.uid ? 'sel' : ''}" data-uid="${ci.uid}">${cardHTML(d, { size: 'xs' })}</div>`).join('');
    const s = this.show(`<div class="screen-header"><div><div class="crumb">EVOLUCIÓN · ${esc(e.req.text.toUpperCase())}</div><h2>${esc(e.name)}</h2></div></div>
      <div class="screen-body"><div class="cb-evpick">
        <div class="panel cb-evprev">${chosen && after ? `<div class="cb-evba">${cardHTML(chosen.d, { size: 'md' })}<span class="cb-evarrow">➜</span>${cardHTML(after, { size: 'md' })}</div>
          <p class="muted">Tras ${e.levels.length} niveles: <b class="num">${chosen.d.ovr} → ${after.ovr}</b>${e.cost ? ` · cuesta ${fmt(e.cost)} monedas` : ''}.</p>` : '<p class="muted">No tienes cartas que cumplan el requisito.</p>'}
          <button class="btn primary" data-act="start" ${chosen ? '' : 'disabled'}>Empezar evolución</button></div>
        <div class="cb-colgrid cb-sbcgrid">${grid}</div></div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, {
      back: () => this.evos(),
      start: () => { if (!chosen) return; const r = c.startEvo(e.id, chosen.ci.uid, this.now()); if (r.ok) { this.toast(`Evolución en marcha: ${chosen.d.name}`); this.evos(); } else this.toast(r.error, 'err'); },
    }, () => this.evos(), 'club-screen club-evos');
    s.root.querySelector('.cb-sbcgrid')?.addEventListener('click', (ev) => { const u = ((ev.target as HTMLElement).closest('[data-uid]') as HTMLElement | null)?.dataset.uid; if (u) this.evoPick(evoId, u); });
  }

  // ==================================================================
  // Desafíos de creación de plantillas
  // ==================================================================
  private sbc() {
    const c = this.club;
    const now = this.now();
    const handlers: Handlers = { back: () => this.hub() };
    const rows = SBCS.map((d) => {
      const a = c.sbcAvailable(d, now);
      handlers[`sbc-${d.id}`] = () => this.sbcBuilder(d.id);
      return `<div class="panel cb-sbc"><div><h3>${esc(d.name)}</h3><p class="muted">${esc(d.blurb)}</p><ul>${d.reqs.map((r) => `<li>${esc(r.text)}</li>`).join('')}<li>${d.cards} cartas</li></ul></div>
        <div class="cb-sbcr"><div class="muted">Recompensa</div><b>${esc(rewardText(d.reward))}</b><small class="muted">${a.left}/${d.limit} disponibles${d.weekly ? ' esta semana' : ''}</small>
        <button class="btn primary" data-act="sbc-${d.id}" ${a.left <= 0 ? 'disabled' : ''}>${a.left <= 0 ? 'Completado' : 'Resolver'}</button></div></div>`;
    }).join('');
    this.show(`<div class="screen-header"><div><div class="crumb">SOFFTI CLUB</div><h2>Desafíos de creación de plantillas</h2></div></div>
      <div class="screen-body"><p class="muted">Entrega cartas de tu club que cumplan los requisitos a cambio de recompensas. Las cartas entregadas se consumen. No se pueden usar cartas que estén en tus plantillas guardadas.</p>${rows}</div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, handlers, () => this.hub(), 'club-screen club-sbc');
  }

  private sbcSel = new Set<string>();
  private sbcText = '';
  private sbcBuilder(id: string, reset = true) {
    const c = this.club;
    const def = SBCS.find((d) => d.id === id)!;
    if (reset) { this.sbcSel = new Set(); this.sbcText = ''; }
    const free = c.s.inventory.filter((ci) => !usedInSquads(c.s, ci.uid));
    const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const chosen = () => [...this.sbcSel].map((u) => getCardDef(c.card(u)!.defId)!).filter(Boolean);
    const status = () => checkSbc(def, chosen());
    const reqHTML = () => status().reqs.map((r) => `<li class="${r.ok ? 'ok' : ''}">${r.ok ? '✓' : '○'} ${esc(r.text)}${r.progress ? ` <span class="num muted">${esc(r.progress)}</span>` : ''}</li>`).join('');
    const list = () => {
      const words = norm(this.sbcText).split(/\s+/).filter(Boolean);
      return free.map((ci) => ({ ci, d: getCardDef(ci.defId)! })).filter((x) => x.d && words.every((w) => norm(`${x.d.name} ${x.d.clubName} ${x.d.nat}`).includes(w))).sort((a, b) => a.d.ovr - b.d.ovr)
        .map(({ ci, d }) => `<div class="cb-colcard ${this.sbcSel.has(ci.uid) ? 'sel' : ''}" data-uid="${ci.uid}">${cardHTML(d, { size: 'xs' })}</div>`).join('') || '<p class="muted">No tienes cartas libres.</p>';
    };
    const s = this.show(`<div class="screen-header"><div><div class="crumb">DESAFÍO · ${esc(rewardText(def.reward))}</div><h2>${esc(def.name)}</h2></div></div>
      <div class="screen-body"><div class="cb-sbcb">
        <div class="panel"><h3>Requisitos</h3><ul class="cb-reqs">${reqHTML()}</ul><p class="num cb-selcount">${this.sbcSel.size}/${def.cards} cartas elegidas</p>
          <button class="btn primary cb-submit" data-act="submit" ${status().ok ? '' : 'disabled'}>Entregar y reclamar</button> <button class="btn" data-act="clear">Limpiar</button></div>
        <div><input class="text-in ts-q" type="search" placeholder="Buscar carta…" value="${esc(this.sbcText)}" aria-label="Buscar carta"><div class="cb-colgrid cb-sbcgrid" style="margin-top:10px">${list()}</div></div>
      </div></div><div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, {
      back: () => this.sbc(),
      clear: () => { this.sbcSel.clear(); this.sbcBuilder(id, false); },
      submit: () => { const r = c.submitSbc(def.id, [...this.sbcSel], this.now()); if (r.ok) { this.toast(`¡Desafío completado! ${rewardText(r.value)}`); this.sbc(); } else { this.toast(r.error, 'err'); this.sbcBuilder(id, false); } },
    }, () => this.sbc(), 'club-screen club-sbc');
    const update = () => {
      (s.root.querySelector('.cb-reqs') as HTMLElement).innerHTML = reqHTML();
      (s.root.querySelector('.cb-selcount') as HTMLElement).textContent = `${this.sbcSel.size}/${def.cards} cartas elegidas`;
      (s.root.querySelector('.cb-submit') as HTMLButtonElement).disabled = !status().ok;
    };
    const grid = s.root.querySelector('.cb-sbcgrid') as HTMLElement;
    grid.addEventListener('click', (e) => {
      const node = (e.target as HTMLElement).closest('[data-uid]') as HTMLElement | null;
      if (!node) return;
      const u = node.dataset.uid!;
      if (this.sbcSel.has(u)) this.sbcSel.delete(u); else if (this.sbcSel.size < def.cards) this.sbcSel.add(u); else this.toast(`Máximo ${def.cards} cartas`, 'err');
      node.classList.toggle('sel', this.sbcSel.has(u));
      update();
    });
    (s.root.querySelector('.ts-q') as HTMLInputElement).addEventListener('input', (e) => { this.sbcText = (e.target as HTMLInputElement).value; grid.innerHTML = list(); });
  }

  // ==================================================================
  // Resultado de un partido del club (se muestra en la pantalla de resultado)
  // ==================================================================
  resultHTML(out: NonNullable<ReturnType<Club['finishMatch']>>): string {
    return `<div class="cb-result"><div class="crumb">SOFFTI CLUB</div>
      <div class="cb-rewards"><div><span class="num">+${fmt(out.coins)}</span><small>MONEDAS</small></div><div><span class="num">+${out.xp}</span><small>XP</small></div>${out.levelCoins ? `<div><span class="num">+${fmt(out.levelCoins)}</span><small>POR NIVEL</small></div>` : ''}</div>
      ${out.lines.map((l) => `<div class="muted">${esc(l)}</div>`).join('')}</div>`;
  }
}

function oppName(id: string): string {
  try { return getTeam(id).name; } catch { return id; }
}
