import '../club-squad.css';
import { FORMATIONS } from '../../data/formations';
import type { FormationId } from '../../data/types';
import { STAT_KEYS, statLabels } from '../../modes/club/catalog';
import { COACHES, STYLE_NAMES, evaluateSquad } from '../../modes/club/chemistry';
import { ROLE_NAMES, roleFit } from '../../modes/club/roles';
import { BENCH_SIZE, type SquadPos } from '../../modes/club/squads';
import { RARITIES, RARITY_NAMES, type CardDef, type Result, type Role, type StyleId } from '../../modes/club/types';
import { esc } from '../dom';
import { cardHTML, miniCardHTML, natCode } from './cards';
import type { ClubHost } from './host';

type Line = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';
type SortKey = 'ovr' | 'pos' | 'rarity' | 'name' | 'age';

const LINES: [Line, string][] = [['ALL', 'Todas'], ['GK', 'POR'], ['DEF', 'DEF'], ['MID', 'MED'], ['FWD', 'DEL']];
const GROUP_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;
const GROUP_LABEL = { GK: 'POR', DEF: 'DEF', MID: 'MED', FWD: 'DEL' } as const;
const ROLE_KEYS = ['captain', 'penaltyTaker', 'freeKickTaker'] as const;
type RoleKey = (typeof ROLE_KEYS)[number];
const MAX_ROWS = 200;

const keyOf = (p: SquadPos) => `${p.kind === 'slot' ? 's' : 'b'}:${p.i}`;
const parsePos = (k: string): SquadPos | null => {
  const m = /^([sb]):(\d+)$/.exec(k);
  return m ? { kind: m[1] === 's' ? 'slot' : 'bench', i: +m[2] } : null;
};
const same = (a: SquadPos | null, b: SquadPos | null) => !!a && !!b && a.kind === b.kind && a.i === b.i;
const fitLabel = (f: number) => (f >= 1 ? 'Natural' : f >= 0.92 ? 'Alternativo' : f >= 0.82 ? 'Misma línea' : f >= 0.55 ? 'Otra línea' : 'Portero / campo');
const fitCls = (f: number) => (f >= 0.92 ? 'good' : f >= 0.82 ? 'mid' : 'bad');

export function squadScreen(host: ClubHost): void {
  const club = host.club;
  let selPos: SquadPos | null = null;
  let selUid: string | null = null; // carta del club (fuera de la plantilla) seleccionada
  let query = '';
  let line: Line = 'ALL';
  let sort: SortKey = 'ovr';
  let modal = false;
  let cmpSlot = -1;
  let cmpCand = '';
  let scr: ReturnType<ClubHost['show']>;

  const q = () => club.squad;
  const uidAt = (p: SquadPos) => (p.kind === 'slot' ? q().slots[p.i] : q().bench[p.i]);
  const posOf = (uid: string): SquadPos | null => {
    const i = q().slots.indexOf(uid);
    if (i >= 0) return { kind: 'slot', i };
    const b = q().bench.indexOf(uid);
    return b >= 0 ? { kind: 'bench', i: b } : null;
  };
  const cur = (): string | null => (selPos ? uidAt(selPos) : selUid);
  const check = (r: Result<unknown>) => { if (!r.ok) host.toast(r.error, 'err'); return r.ok; };
  const clearSel = () => { selPos = null; selUid = null; cmpSlot = -1; cmpCand = ''; };

  // ---------- Vistas ----------
  const marks = (uid: string | null) => {
    if (!uid) return '';
    const s = q();
    const m = [s.captain === uid ? 'C' : '', s.penaltyTaker === uid ? 'P' : '', s.freeKickTaker === uid ? 'TL' : ''].filter(Boolean);
    return m.length ? `<span class="cs-marks">${m.map((x) => `<i>${x}</i>`).join('')}</span>` : '';
  };

  const options = (opts: [string, string][], val: string) => opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const field = (label: string, name: string, opts: [string, string][], val: string) =>
    `<label class="cs-f"><span>${label}</span><select data-act="noop" data-sel="${name}">${options(opts, val)}</select></label>`;

  const pitchHTML = (ev: ReturnType<typeof club.evalSquad>) => {
    const fs = FORMATIONS[q().formation];
    const X = (l: number) => 50 + l * 40;
    const Y = (d: number) => 88 - (d / 0.75) * 76;
    const links = ev.links.filter((l) => l.score >= 0).map((l) =>
      `<line class="cs-link l${l.score}" x1="${X(fs[l.a].lateral)}" y1="${Y(fs[l.a].depth)}" x2="${X(fs[l.b].lateral)}" y2="${Y(fs[l.b].depth)}"/>`).join('');
    const slots = fs.map((sl, i) => {
      const uid = q().slots[i];
      const d = club.def(uid);
      const e = ev.slots[i];
      const p: SquadPos = { kind: 'slot', i };
      const sel = same(selPos, p) ? ' sel' : '';
      const body = d && uid
        ? `${miniCardHTML(d, { chem: e.chem, effOvr: e.effOvr, pos: sl.role })}${marks(uid)}`
        : `<div class="cs-empty"><b>+</b><span>${sl.role}</span></div>`;
      return `<div class="cs-slot${sel}${d ? '' : ' empty'}" style="left:${X(sl.lateral)}%;top:${Y(sl.depth)}%" data-act="pos" data-k="${keyOf(p)}" data-drop="${keyOf(p)}" ${d ? `data-drag="${keyOf(p)}"` : ''}>${body}</div>`;
    }).join('');
    return `<div class="cs-pitchwrap"><div class="cs-pitch">
      <svg class="cs-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="3" y="2" width="94" height="96"/><line x1="3" y1="50" x2="97" y2="50"/><circle cx="50" cy="50" r="9"/>
        <rect x="26" y="2" width="48" height="15"/><rect x="38" y="2" width="24" height="6"/>
        <rect x="26" y="83" width="48" height="15"/><rect x="38" y="92" width="24" height="6"/>
      </svg>
      <svg class="cs-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${links}</svg>
      ${slots}</div></div>`;
  };

  const benchHTML = (ev: ReturnType<typeof club.evalSquad>) => {
    void ev;
    const cells = Array.from({ length: BENCH_SIZE }, (_, i) => {
      const p: SquadPos = { kind: 'bench', i };
      const uid = q().bench[i];
      const d = club.def(uid);
      const sel = same(selPos, p) ? ' sel' : '';
      return `<div class="cs-bslot${sel}${d ? '' : ' empty'}" data-act="pos" data-k="${keyOf(p)}" data-drop="${keyOf(p)}" ${d ? `data-drag="${keyOf(p)}"` : ''}>${
        d && uid ? `${miniCardHTML(d)}${marks(uid)}` : '<div class="cs-empty"><b>+</b><span>SUP</span></div>'}</div>`;
    }).join('');
    return `<div class="cs-bench"><h3>Banco</h3><div class="cs-bgrid">${cells}</div></div>`;
  };

  const rowsHTML = () => {
    const items = club.s.inventory.map((c) => ({ uid: c.uid, d: club.def(c.uid)! })).filter((x) => x.d && (line === 'ALL' || x.d.group === line) &&
      (!query.trim() || `${x.d.name} ${x.d.short} ${x.d.clubName} ${x.d.nat} ${x.d.role}`.toLowerCase().includes(query.trim().toLowerCase())));
    const tie = (a: { d: CardDef }, b: { d: CardDef }) => b.d.ovr - a.d.ovr || a.d.name.localeCompare(b.d.name, 'es');
    items.sort((a, b) => {
      switch (sort) {
        case 'pos': return GROUP_ORDER[a.d.group] - GROUP_ORDER[b.d.group] || a.d.role.localeCompare(b.d.role) || tie(a, b);
        case 'rarity': return RARITIES.indexOf(b.d.rarity) - RARITIES.indexOf(a.d.rarity) || tie(a, b);
        case 'name': return a.d.name.localeCompare(b.d.name, 'es');
        case 'age': return a.d.age - b.d.age || tie(a, b);
        default: return tie(a, b);
      }
    });
    if (!items.length) return '<div class="cs-none">Ninguna carta coincide con el filtro.</div>';
    const rows = items.slice(0, MAX_ROWS).map(({ uid, d }) => {
      const p = posOf(uid);
      const sel = cur() === uid ? ' sel' : '';
      const tag = p ? `<span class="cs-tag ${p.kind}">${p.kind === 'slot' ? 'Titular' : 'Suplente'}</span>` : '';
      return `<div class="cs-row${p ? ' in' : ''}${sel}" data-act="inv" data-uid="${esc(uid)}">
        <span class="cs-handle" data-drag="i:${esc(uid)}">${miniCardHTML(d)}</span>
        <span class="cs-info"><b>${esc(d.name)}</b><small>${d.role} · ${esc(d.clubName || 'Leyenda')} · ${natCode(d.nat)} · ${d.age} a.</small><small class="cs-r-${d.rarity}">${RARITY_NAMES[d.rarity]}</small></span>
        ${tag}${marks(uid)}</div>`;
    }).join('');
    return rows + (items.length > MAX_ROWS ? `<div class="cs-none">Mostrando ${MAX_ROWS} de ${items.length}. Usa el buscador.</div>` : '');
  };

  const listHTML = () => `<section class="cs-list" data-drop="list">
    <div class="cs-list-head">
      <input class="cs-search" type="search" placeholder="Buscar jugador, club, país…" value="${esc(query)}" data-act="focusEl" data-enter="blurEl" aria-label="Buscar">
      <div class="cs-chips">${LINES.map(([v, l]) => `<button class="cs-chip${v === line ? ' on' : ''}" data-act="line" data-v="${v}">${l}</button>`).join('')}</div>
      ${field('Orden', 'sort', [['ovr', 'Valoración'], ['pos', 'Puesto'], ['rarity', 'Rareza'], ['name', 'Nombre'], ['age', 'Edad']], sort)}
    </div>
    <div class="cs-list-body">${rowsHTML()}</div>
    <div class="cs-list-foot">Arrastra una carta a un puesto, o tócala y luego toca el puesto.</div>
  </section>`;

  // ---------- Panel de acciones y comparación ----------
  const compareHTML = (uid: string): string => {
    const s = q();
    const p = posOf(uid);
    let slot = -1;
    let cand: string | null = null;
    let picker = '';
    if (p?.kind === 'slot') {
      slot = p.i;
      const bench = s.bench.filter(Boolean) as string[];
      if (!bench.length) return '';
      const g = FORMATIONS[s.formation][slot].position;
      cand = bench.includes(cmpCand) ? cmpCand : bench.map((u) => ({ u, d: club.def(u)! })).sort((a, b) => Number(b.d.group === g) - Number(a.d.group === g) || b.d.ovr - a.d.ovr)[0].u;
      picker = field('Suplente', 'cmpCand', bench.map((u) => [u, `${club.def(u)!.role} · ${club.def(u)!.short} (${club.def(u)!.ovr})`]), cand);
    } else {
      cand = uid;
      const ev0 = club.evalSquad();
      const filled = s.slots.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
      if (!filled.length) return '';
      const cd = club.def(uid)!;
      const fs = FORMATIONS[s.formation];
      slot = filled.includes(cmpSlot) ? cmpSlot
        : (filled.find((i) => fs[i].role === cd.role) ?? filled.filter((i) => fs[i].position === cd.group).sort((a, b) => ev0.slots[a].effOvr - ev0.slots[b].effOvr)[0] ?? filled[0]);
      picker = field('Titular', 'cmpSlot', filled.map((i) => [String(i), `${fs[i].role} · ${club.def(s.slots[i])!.short} (${club.def(s.slots[i])!.ovr})`]), String(slot));
    }
    const inc = club.def(s.slots[slot])!;
    const cd = club.def(cand)!;
    const ev = club.evalSquad();
    const defs = s.slots.map((u) => club.def(u));
    defs[slot] = cd;
    const ev2 = evaluateSquad(s.formation, defs, s.style, s.coach);
    const a = ev.slots[slot];
    const b = ev2.slots[slot];
    const lbl = statLabels(inc);
    const row = (name: string, x: number, y: number, extra = '') =>
      `<div class="cs-crow${extra}"><b class="num ${x > y ? 'win' : ''}">${x}</b><span>${name}</span><b class="num ${y > x ? 'win' : ''}">${y}</b></div>`;
    const stats = STAT_KEYS.map((k, i) => row(lbl[i], inc.stats[k], cd.stats[k])).join('');
    const delta = ev2.ovr - ev.ovr;
    return `<div class="cs-cmp">
      <div class="cs-cmp-head"><span>${esc(inc.short)}<small>${a.role} · titular</small></span><span>${esc(cd.short)}<small>${cd.role} · ${fitLabel(roleFit(cd.role, cd.alt, a.role as Role))}</small></span></div>
      ${stats}${row('En el puesto', a.effOvr, b.effOvr, ' big')}${row('Química', a.chem, b.chem)}
      <div class="cs-crow team"><span>Equipo ${ev.ovr} → <b class="num ${delta > 0 ? 'win' : delta < 0 ? 'lose' : ''}">${ev2.ovr}</b> (${delta > 0 ? '+' : ''}${delta}) · Química ${ev.chem} → ${ev2.chem}</span></div>
      <div class="cs-cmp-foot">${picker}<button class="btn primary cs-btn" data-act="doSub" data-slot="${slot}" data-uid="${esc(cand)}">Sustituir</button></div>
    </div>`;
  };

  const actionsHTML = () => {
    const uid = cur();
    const d = club.def(uid);
    if (!uid || !d) return `<div class="cs-actions empty"><p>Toca un puesto o una carta para ver sus acciones. También puedes arrastrar.</p></div>`;
    const s = q();
    const p = posOf(uid);
    const btn = (k: RoleKey, label: string) => {
      const on = s[k] === uid;
      return `<button class="btn cs-btn${on ? ' on' : ''}" data-act="role" data-r="${k}" ${p ? '' : 'disabled'}>${label}</button>`;
    };
    return `<div class="cs-actions">
      <div class="cs-who"><b>${esc(d.name)}</b><small>${d.ovr} · ${d.role} · ${p ? (p.kind === 'slot' ? 'Titular' : 'Suplente') : 'Fuera de la plantilla'}</small></div>
      <div class="cs-btns">
        <button class="btn cs-btn" data-act="view">Ver carta</button>
        <button class="btn cs-btn danger" data-act="remove" ${p ? '' : 'disabled'}>Quitar</button>
        ${btn('captain', 'Capitán')}${btn('penaltyTaker', 'Penales')}${btn('freeKickTaker', 'Tiros libres')}
        <button class="btn cs-btn" data-act="deselect">Cerrar</button>
      </div>
      ${compareHTML(uid)}
    </div>`;
  };

  const modalHTML = () => {
    const uid = cur();
    const d = club.def(uid);
    if (!uid || !d) return '';
    const p = posOf(uid);
    const ev = club.evalSquad();
    let fitRow = '<div><span>Puesto actual</span><b>No es titular</b></div>';
    if (p?.kind === 'slot') {
      const e = ev.slots[p.i];
      fitRow = `<div><span>Puesto actual</span><b>${e.role} · ${ROLE_NAMES[e.role]}</b></div>
        <div><span>Ajuste</span><b class="cs-fit ${fitCls(e.fit)}">${fitLabel(e.fit)} (${Math.round(e.fit * 100)}%)</b></div>
        <div><span>Química</span><b>${e.chem}/3</b></div><div><span>Valoración efectiva</span><b>${e.effOvr}</b></div>`;
    } else if (p) fitRow = '<div><span>Puesto actual</span><b>Suplente</b></div>';
    return `<div class="cs-modal" data-act="closeModal"><div class="cs-modal-box" data-act="noop">
      <div class="cs-modal-card">${cardHTML(d, { size: 'lg', captain: q().captain === uid })}</div>
      <div class="cs-detail">
        <h3>${esc(d.name)}</h3>
        <div><span>Rareza</span><b>${RARITY_NAMES[d.rarity]}${d.eventSeason ? ` · ${esc(d.eventSeason)}` : ''}</b></div>
        <div><span>Puesto natural</span><b>${d.role} · ${ROLE_NAMES[d.role]}</b></div>
        <div><span>Alternativos</span><b>${d.alt.length ? d.alt.join(', ') : '—'}</b></div>
        <div><span>Club</span><b>${esc(d.clubName || 'Leyenda')}</b></div>
        <div><span>País</span><b>${esc(d.nat)}</b></div>
        <div><span>Edad / pie</span><b>${d.age} años · ${d.foot === 'D' ? 'derecho' : 'izquierdo'}</b></div>
        <div><span>Filigranas</span><b>${'★'.repeat(d.skill)}${'☆'.repeat(5 - d.skill)}</b></div>
        ${fitRow}
        <button class="btn primary cs-btn" data-act="closeModal">Cerrar</button>
      </div></div></div>`;
  };

  const html = () => {
    const s = q();
    const ev = club.evalSquad();
    const chemPct = Math.round((ev.chem / 33) * 100);
    const tabs = club.s.squads.map((x, i) => `<button class="cs-tab${i === club.s.activeSquad ? ' on' : ''}" data-act="tab" data-i="${i}">${esc(x.name)}</button>`).join('');
    return `<div class="cs-head">
      <div class="cs-top">
        <button class="btn cs-btn" data-act="back">‹ Volver</button>
        <h2>Plantilla</h2>
        <input class="cs-name" value="${esc(s.name)}" maxlength="20" data-act="focusEl" data-enter="blurEl" data-sel="name" aria-label="Nombre de la plantilla">
        <div class="cs-stat"><small>Valoración</small><b class="num">${ev.ovr}</b></div>
        <div class="cs-stat cs-chem"><small>Química</small><b class="num">${ev.chem}<em>/33</em></b><div class="cs-bar"><i class="${chemPct >= 66 ? 'hi' : chemPct >= 33 ? 'md' : 'lo'}" style="width:${chemPct}%"></i></div></div>
      </div>
      <div class="cs-ctrl">
        <div class="cs-tabs">${tabs}<button class="cs-tab add" data-act="newTab" aria-label="Nueva plantilla">+</button><button class="cs-tab add" data-act="delTab" aria-label="Borrar plantilla">🗑</button></div>
        ${field('Formación', 'formation', Object.keys(FORMATIONS).map((f) => [f, f]), s.formation)}
        ${field('Estilo', 'style', (Object.keys(STYLE_NAMES) as StyleId[]).map((k) => [k, STYLE_NAMES[k]]), s.style)}
        ${field('Entrenador', 'coach', COACHES.map((c) => [c.id, c.name]), s.coach)}
        <button class="btn primary cs-btn" data-act="auto">Autocompletar mejor once</button>
      </div>
    </div>
    <div class="cs-main">
      ${pitchHTML(ev)}
      <div class="cs-mid">${benchHTML(ev)}${actionsHTML()}</div>
      ${listHTML()}
    </div>
    ${modal ? modalHTML() : ''}`;
  };

  const refresh = () => {
    const sc = () => scr.root.querySelector<HTMLElement>('.cs-list-body');
    const mid = () => scr.root.querySelector<HTMLElement>('.cs-mid');
    const top = sc()?.scrollTop ?? 0;
    const midTop = mid()?.scrollTop ?? 0;
    scr.refresh(html());
    const b = sc();
    if (b) b.scrollTop = top;
    const m = mid();
    if (m) m.scrollTop = midTop;
  };

  // ---------- Acciones ----------
  const onPos = (p: SquadPos) => {
    if (selUid) {
      check(club.place(selUid, p));
      selUid = null; selPos = p;
    } else if (selPos && !same(selPos, p)) {
      club.swapPos(selPos, p);
      selPos = p;
    } else selPos = same(selPos, p) ? null : p;
    cmpSlot = -1; cmpCand = '';
    refresh();
  };

  const onInv = (uid: string) => {
    const p = posOf(uid);
    if (selPos) {
      if (uidAt(selPos) === uid) selPos = null;
      else { check(club.place(uid, selPos)); selPos = posOf(uid); }
    } else if (selUid === uid) selUid = null;
    else if (p) { selPos = p; selUid = null; } else { selUid = uid; }
    cmpSlot = -1; cmpCand = '';
    refresh();
  };

  const handlers = {
    back: () => host.hub(),
    noop: () => {},
    focusEl: (t: HTMLElement) => t.focus(),
    blurEl: (t: HTMLElement) => t.blur(),
    pos: (t: HTMLElement) => { const p = parsePos(t.dataset.k ?? ''); if (p) onPos(p); },
    inv: (t: HTMLElement) => onInv(t.dataset.uid!),
    line: (t: HTMLElement) => { line = t.dataset.v as Line; refresh(); },
    tab: (t: HTMLElement) => { club.selectSquad(+t.dataset.i!); clearSel(); refresh(); },
    newTab: () => { if (check(club.newSquad())) { clearSel(); refresh(); } },
    delTab: () => {
      if (club.s.squads.length <= 1) { host.toast('Necesitas al menos una plantilla.', 'err'); return; }
      if (typeof confirm === 'function' && !confirm(`¿Borrar la plantilla "${q().name}"?`)) return;
      if (check(club.deleteSquad(club.s.activeSquad))) { clearSel(); refresh(); }
    },
    auto: () => { club.autoBuild(); clearSel(); refresh(); },
    view: () => { modal = true; refresh(); },
    closeModal: () => { modal = false; refresh(); },
    deselect: () => { clearSel(); refresh(); },
    remove: () => { if (selPos) { club.removeAt(selPos); clearSel(); refresh(); } },
    role: (t: HTMLElement) => {
      const uid = cur();
      const k = t.dataset.r as RoleKey;
      if (!uid) return;
      check(club.setRole(k, q()[k] === uid ? null : uid));
      refresh();
    },
    doSub: (t: HTMLElement) => {
      const i = +t.dataset.slot!;
      if (check(club.place(t.dataset.uid!, { kind: 'slot', i }))) { selPos = { kind: 'slot', i }; selUid = null; cmpSlot = -1; cmpCand = ''; refresh(); }
    },
  };

  scr = host.show(html(), handlers, () => { if (modal) { modal = false; refresh(); } else host.hub(); }, 'club-screen club-squad');
  const root = scr.root;

  // ---------- Selectores y buscador ----------
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const name = t.dataset?.sel;
    if (!name) return;
    const v = t.value;
    if (name === 'formation') { club.setFormation(v as FormationId); clearSel(); }
    else if (name === 'style') club.setStyle(v as StyleId, q().coach);
    else if (name === 'coach') club.setStyle(q().style, v);
    else if (name === 'name') club.renameSquad(v);
    else if (name === 'sort') sort = v as SortKey;
    else if (name === 'cmpSlot') cmpSlot = +v;
    else if (name === 'cmpCand') cmpCand = v;
    refresh();
  });
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.classList?.contains('cs-search')) return;
    query = t.value;
    const body = root.querySelector<HTMLElement>('.cs-list-body');
    if (body) body.innerHTML = rowsHTML();
  });

  // ---------- Arrastrar y soltar (puntero: ratón y táctil) ----------
  let swallow = false;
  root.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const src = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (!src) return;
    const from = src.dataset.drag!;
    const sx = e.clientX; const sy = e.clientY;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;

    const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]') ?? null;
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
        const fm = src.querySelector<HTMLElement>('.fm');
        ghost = document.createElement('div');
        ghost.className = 'cs-ghost';
        if (fm) {
          const c = fm.cloneNode(true) as HTMLElement;
          c.style.fontSize = `${Math.max(parseFloat(getComputedStyle(fm).fontSize) || 10, 8) * 1.15}px`;
          ghost.appendChild(c);
        }
        root.appendChild(ghost);
        root.classList.add('cs-dragging');
        root.classList.toggle('cs-from-pos', !from.startsWith('i:'));
        src.classList.add('cs-src');
      }
      ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -60%)`;
      const t = targetAt(ev.clientX, ev.clientY);
      if (t !== over) { over?.classList.remove('cs-over'); over = t; over?.classList.add('cs-over'); }
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      ghost?.remove();
      over?.classList.remove('cs-over');
      src.classList.remove('cs-src');
      root.classList.remove('cs-dragging', 'cs-from-pos');
    };
    const cancel = () => end();
    const up = (ev: PointerEvent) => {
      const dragged = !!ghost;
      const to = dragged ? targetAt(ev.clientX, ev.clientY)?.dataset.drop ?? null : null;
      end();
      if (!dragged) return;
      swallow = true;
      setTimeout(() => { swallow = false; }, 80);
      if (to) drop(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  });

  function drop(from: string, to: string) {
    const target = parsePos(to);
    if (from.startsWith('i:')) {
      if (!target) return;
      if (check(club.place(from.slice(2), target))) { selPos = target; selUid = null; }
    } else {
      const a = parsePos(from);
      if (!a) return;
      if (to === 'list') { club.removeAt(a); clearSel(); }
      else if (target && !same(a, target)) { club.swapPos(a, target); selPos = target; selUid = null; }
      else return;
    }
    cmpSlot = -1; cmpCand = '';
    refresh();
  }
}
