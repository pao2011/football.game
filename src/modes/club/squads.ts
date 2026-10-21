import { FORMATIONS } from '../../data/formations';
import type { FormationId, KitData, PlayerData, TeamData } from '../../data/types';
import { chemAttrBonus, coachById, evaluateSquad, type SquadEval } from './chemistry';
import { getCardDef } from './catalog';
import { fitPenalty } from './roles';
import type { CardDef, ClubIdentity, ClubState, Squad, StyleId } from './types';
import { clamp } from './util';

export const BENCH_SIZE = 7;
export const MAX_SQUADS = 5;

export function newSquad(id: string, name: string, formation: FormationId): Squad {
  return { id, name, formation, slots: Array(11).fill(null), bench: Array(BENCH_SIZE).fill(null), captain: null, penaltyTaker: null, freeKickTaker: null, style: 'balanced', coach: 'c_gomez' };
}

export const defOfUid = (s: ClubState, uid: string | null): CardDef | null => {
  if (!uid) return null;
  const c = s.inventory.find((x) => x.uid === uid);
  return c ? getCardDef(c.defId) ?? null : null;
};

export function squadDefs(s: ClubState, q: Squad): (CardDef | null)[] {
  return q.slots.map((u) => defOfUid(s, u));
}

export function evalSquad(s: ClubState, q: Squad): SquadEval {
  return evaluateSquad(q.formation, squadDefs(s, q), q.style, q.coach);
}

/** Repara una plantilla: quita cartas que ya no existen o repetidas y corrige tamaños y roles. */
export function validateSquad(s: ClubState, q: Squad) {
  const have = new Set(s.inventory.map((c) => c.uid));
  const seen = new Set<string>();
  const clean = (u: string | null) => { if (!u || !have.has(u) || seen.has(u)) return null; seen.add(u); return u; };
  q.slots = Array.from({ length: 11 }, (_, i) => clean(q.slots[i] ?? null));
  q.bench = Array.from({ length: BENCH_SIZE }, (_, i) => clean(q.bench[i] ?? null));
  const on = (u: string | null) => !!u && (q.slots.includes(u) || q.bench.includes(u));
  if (!on(q.captain)) q.captain = null;
  if (!on(q.penaltyTaker)) q.penaltyTaker = null;
  if (!on(q.freeKickTaker)) q.freeKickTaker = null;
  if (!FORMATIONS[q.formation]) q.formation = '4-3-3';
}

/** Cambia la formación conservando a los jugadores en los puestos más parecidos. */
export function changeFormation(s: ClubState, q: Squad, f: FormationId) {
  const old = q.slots.map((u, i) => ({ u, role: FORMATIONS[q.formation][i].role, group: FORMATIONS[q.formation][i].position }));
  const slots = FORMATIONS[f];
  const next: (string | null)[] = Array(11).fill(null);
  const left = old.filter((o) => o.u);
  // primero los mismos puestos exactos, luego la misma línea
  for (const pass of ['role', 'group'] as const) {
    slots.forEach((sl, i) => {
      if (next[i]) return;
      const k = left.findIndex((o) => (pass === 'role' ? o.role === sl.role : o.group === sl.position));
      if (k >= 0) { next[i] = left[k].u; left.splice(k, 1); }
    });
  }
  // lo que sobra va al banco (si hay sitio) o se queda sin plantilla
  for (const o of left) { const b = q.bench.indexOf(null); if (b >= 0) q.bench[b] = o.u; }
  q.formation = f;
  q.slots = next;
  // los huecos vacíos de la nueva formación se rellenan con el banco por línea
  slots.forEach((sl, i) => {
    if (q.slots[i]) return;
    const b = q.bench.findIndex((u) => { const d = defOfUid(s, u); return d && d.group === sl.position; });
    if (b >= 0) { q.slots[i] = q.bench[b]; q.bench[b] = null; }
  });
  fillEmpty(s, q);
  validateSquad(s, q);
}

/** Rellena los huecos de la alineación con las mejores cartas libres del club (no pisa a nadie). */
export function fillEmpty(s: ClubState, q: Squad) {
  const slots = FORMATIONS[q.formation];
  const used = new Set([...q.slots, ...q.bench].filter(Boolean) as string[]);
  slots.forEach((sl, i) => {
    if (q.slots[i]) return;
    // primero el banco, luego el resto del club; siempre el de mejor ajuste
    const pool = [...q.bench.filter(Boolean) as string[], ...s.inventory.map((c) => c.uid).filter((u) => !used.has(u))];
    let best: { u: string; sc: number } | null = null;
    for (const u of pool) {
      if (q.slots.includes(u)) continue;
      const d = defOfUid(s, u);
      if (!d) continue;
      const fit = d.role === sl.role ? 1 : d.alt.includes(sl.role as never) ? 0.92 : d.group === sl.position ? 0.82 : d.group === 'GK' || sl.position === 'GK' ? 0.25 : 0.55;
      const sc = d.ovr - fitPenalty(fit) * 1.2;
      if (!best || sc > best.sc) best = { u, sc };
    }
    if (best) {
      const b = q.bench.indexOf(best.u);
      if (b >= 0) q.bench[b] = null;
      q.slots[i] = best.u;
      used.add(best.u);
    }
  });
}

export type SquadPos = { kind: 'slot'; i: number } | { kind: 'bench'; i: number };

function get(q: Squad, p: SquadPos) { return p.kind === 'slot' ? q.slots[p.i] : q.bench[p.i]; }
function set(q: Squad, p: SquadPos, u: string | null) { if (p.kind === 'slot') q.slots[p.i] = u; else q.bench[p.i] = u; }

/** Coloca una carta del club en un puesto (si ya estaba en la plantilla, intercambia posiciones). */
export function place(q: Squad, uid: string, to: SquadPos) {
  let from: SquadPos | null = null;
  q.slots.forEach((u, i) => { if (u === uid) from = { kind: 'slot', i }; });
  q.bench.forEach((u, i) => { if (u === uid) from = { kind: 'bench', i }; });
  const displaced = get(q, to);
  set(q, to, uid);
  if (from) set(q, from, displaced);
}

/** Intercambia el contenido de dos puestos (arrastrar y soltar entre posiciones). */
export function swap(q: Squad, a: SquadPos, b: SquadPos) {
  const ua = get(q, a);
  const ub = get(q, b);
  set(q, a, ub);
  set(q, b, ua);
}

export function remove(q: Squad, p: SquadPos) {
  const u = get(q, p);
  set(q, p, null);
  if (u && !q.slots.includes(u) && !q.bench.includes(u)) {
    if (q.captain === u) q.captain = null;
    if (q.penaltyTaker === u) q.penaltyTaker = null;
    if (q.freeKickTaker === u) q.freeKickTaker = null;
  }
}

/** Mejor once posible con las cartas del club (y 7 suplentes). Respeta los puestos naturales y alternativos. */
export function autoBuild(s: ClubState, q: Squad, pool?: string[]) {
  const uids = pool ?? s.inventory.map((c) => c.uid);
  const defs = uids.map((u) => ({ u, d: defOfUid(s, u)! })).filter((x) => x.d);
  const slots = FORMATIONS[q.formation];
  const used = new Set<string>();
  const slotOrder = slots.map((_, i) => i).sort((a, b) => (slots[a].position === 'GK' ? -1 : 0) - (slots[b].position === 'GK' ? -1 : 0));
  q.slots = Array(11).fill(null);
  for (const i of slotOrder) {
    let best: { u: string; sc: number } | null = null;
    for (const { u, d } of defs) {
      if (used.has(u)) continue;
      const fit = d.role === slots[i].role ? 1 : d.alt.includes(slots[i].role as never) ? 0.92 : d.group === slots[i].position ? 0.82 : d.group === 'GK' || slots[i].position === 'GK' ? 0.25 : 0.55;
      const sc = d.ovr - fitPenalty(fit) * 1.2 + (fit === 1 ? 1 : 0);
      if (!best || sc > best.sc) best = { u, sc };
    }
    if (best) { q.slots[i] = best.u; used.add(best.u); }
  }
  const want: ('GK' | 'DEF' | 'MID' | 'FWD')[] = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD'];
  q.bench = Array(BENCH_SIZE).fill(null);
  want.forEach((g, bi) => {
    const c = defs.filter((x) => !used.has(x.u) && x.d.group === g).sort((a, b) => b.d.ovr - a.d.ovr)[0] ?? defs.filter((x) => !used.has(x.u)).sort((a, b) => b.d.ovr - a.d.ovr)[0];
    if (c) { q.bench[bi] = c.u; used.add(c.u); }
  });
  validateSquad(s, q);
}

export const isComplete = (q: Squad) => q.slots.every(Boolean);

// ---------- Del club al partido ----------
const dark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.35);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
};
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; };
const inkFor = (bg: string) => (lum(bg) > 0.55 ? '#111111' : '#ffffff');

export function clubKits(id: ClubIdentity): { home: KitData; away: KitData; gk: KitData } {
  const { primary: p, secondary: c } = id;
  const home: KitData = { shirt: p, shirt2: c, pattern: id.pattern, shorts: lum(p) > 0.8 ? c : p, socks: p, number: inkFor(p) };
  const away: KitData = { shirt: c, shirt2: p, pattern: 'solid', shorts: c, socks: c, number: inkFor(c) };
  const gk: KitData = lum(p) > 0.5 && lum(c) > 0.5 ? { shirt: '#1a1a1a', shirt2: '#444444', pattern: 'solid', shorts: '#1a1a1a', socks: '#1a1a1a', number: '#ffffff' } : { shirt: '#e8ff3a', shirt2: '#a8c800', pattern: 'solid', shorts: '#1a1a1a', socks: '#e8ff3a', number: '#1a1a1a' };
  void dark;
  return { home, away, gk };
}

export interface BuiltClub { team: TeamData; eval: SquadEval; uidOfPlayer: Map<string, string> }

/**
 * Convierte la plantilla en un equipo jugable. Cada carta aporta sus atributos reales al partido; el puesto (ajuste),
 * la química y el capitán los modifican. Los suplentes juegan con sus atributos base.
 */
export function buildClubTeam(s: ClubState, q: Squad): BuiltClub {
  const defs = squadDefs(s, q);
  const ev = evaluateSquad(q.formation, defs, q.style, q.coach);
  const slots = FORMATIONS[q.formation];
  const used = new Set<number>();
  const num = (d: CardDef) => { let n = d.number > 0 && d.number < 100 ? d.number : 1; while (used.has(n)) n = (n % 99) + 1; used.add(n); return n; };
  const players: PlayerData[] = [];
  const uidOf = new Map<string, string>();
  slots.forEach((sl, i) => {
    const d = defs[i];
    const e = ev.slots[i];
    if (!d) throw new Error('Plantilla incompleta');
    const uid = q.slots[i]!;
    const delta = -fitPenalty(e.fit) + chemAttrBonus(e.chem) + (q.captain === uid ? 2 : 0);
    const a = d.attrs;
    const f = (v: number) => clamp(Math.round(v + delta), 1, 99);
    // un portero fuera de la portería (o al revés) conserva su atributo de portero para no inutilizarlo del todo
    players.push({
      id: uid, name: d.name, number: num(d), position: sl.position,
      attrs: { speed: f(a.speed), acceleration: f(a.acceleration), passing: f(a.passing), shooting: f(a.shooting), control: f(a.control), defending: f(a.defending), stamina: f(a.stamina), goalkeeping: sl.position === 'GK' ? f(a.goalkeeping) : a.goalkeeping },
      skinTone: d.face.skin, hairColor: d.face.hair, hairStyle: d.face.style, height: d.face.height,
    });
    uidOf.set(uid, uid);
  });
  const bench = q.bench.map((u) => defOfUid(s, u)).map((d, i) => ({ d, u: q.bench[i] })).filter((x) => x.d) as { d: CardDef; u: string }[];
  for (const { d, u } of bench) {
    players.push({ id: u, name: d.name, number: num(d), position: d.group, attrs: { ...d.attrs }, skinTone: d.face.skin, hairColor: d.face.hair, hairStyle: d.face.style, height: d.face.height });
  }
  const id = s.identity;
  const kits = clubKits(id);
  const initials = id.name.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').trim().split(/\s+/);
  const short = (initials.length >= 3 ? initials.slice(0, 3).map((w) => w[0]).join('') : id.name.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase().padEnd(3, 'X');
  const team: TeamData = {
    id: `club-${s.id}`, name: id.name, short, city: 'Mi club',
    crest: { shape: id.crest.shape, primary: id.primary, secondary: id.secondary, symbol: id.crest.symbol, stripes: id.crest.stripes },
    home: kits.home, away: kits.away, gkKit: kits.gk, formation: q.formation, rating: ev.ovr, players,
    setPieces: { penalty: q.penaltyTaker ?? undefined, freeKick: q.freeKickTaker ?? undefined, captain: q.captain ?? undefined },
  };
  return { team, eval: ev, uidOfPlayer: uidOf };
}

export const styleOf = (q: Squad): StyleId => q.style;
export const coachName = (q: Squad) => coachById(q.coach).name;

/**
 * Valida la plantilla de club que llega de otro jugador (online): forma, tamaños, colores y atributos 1..99.
 * shortcut: el anfitrión confía en los atributos que manda el rival (dentro de 1..99); un servidor con cuentas
 * tendría que reconstruir el equipo desde las cartas del club para evitar trampas.
 */
export function sanitizeOnlineTeam(raw: unknown, prefix = ''): TeamData | null {
  const t = raw as TeamData;
  if (!t || typeof t !== 'object' || !Array.isArray(t.players) || t.players.length < 11 || t.players.length > 18) return null;
  const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  const str = (v: unknown, n: number, d: string) => (typeof v === 'string' && v.trim() ? v.replace(/[<>&"'`]/g, '').slice(0, n) : d);
  const num = (v: unknown, a: number, b: number, d: number) => (Number.isFinite(Number(v)) ? clamp(Number(v), a, b) : d);
  const kit = (k: Partial<KitData> | undefined): KitData => ({ shirt: hex(k?.shirt, '#3355aa'), shirt2: hex(k?.shirt2, '#ffffff'), pattern: (['solid', 'stripes', 'hoops', 'sash', 'band', 'halves', 'vee', 'gradient'] as const).find((p) => p === k?.pattern) ?? 'solid', shorts: hex(k?.shorts, '#ffffff'), socks: hex(k?.socks, '#3355aa'), number: hex(k?.number, '#ffffff') });
  if (!FORMATIONS[t.formation]) return null;
  const positions = ['GK', 'DEF', 'MID', 'FWD'] as const;
  const ids = new Set<string>();
  const players: PlayerData[] = [];
  for (const p of t.players) {
    const id = str(p?.id, 40, '') && `${prefix}${str(p?.id, 40, '')}`;
    const position = positions.find((x) => x === p?.position);
    if (!id || ids.has(id) || !position) return null;
    ids.add(id);
    const a = p.attrs ?? ({} as PlayerData['attrs']);
    const at = (k: keyof PlayerData['attrs']) => Math.round(num(a[k], 1, 99, 50));
    players.push({ id, name: str(p.name, 30, 'Jugador'), number: Math.round(num(p.number, 1, 99, 1)), position,
      attrs: { speed: at('speed'), acceleration: at('acceleration'), passing: at('passing'), shooting: at('shooting'), control: at('control'), defending: at('defending'), stamina: at('stamina'), goalkeeping: at('goalkeeping') },
      skinTone: num(p.skinTone, 0, 1, 0.5), hairColor: hex(p.hairColor, '#2a1b12'), hairStyle: Math.round(num(p.hairStyle, 0, 5, 0)), height: num(p.height, 1.6, 2.05, 1.8) });
  }
  if (players[0].position !== 'GK') return null;
  const c = t.crest ?? ({} as TeamData['crest']);
  const setPiece = (v: unknown) => (typeof v === 'string' && ids.has(prefix + v) ? prefix + v : undefined);
  return {
    id: `online-${prefix}${str(t.id, 40, 'club')}`, name: str(t.name, 24, 'Club rival'), short: str(t.short, 3, 'RIV').toUpperCase(), city: 'Online',
    crest: { shape: (['shield', 'circle', 'diamond'] as const).find((x) => x === c.shape) ?? 'shield', primary: hex(c.primary, '#3355aa'), secondary: hex(c.secondary, '#ffffff'), symbol: (['star', 'ball', 'lion', 'wave', 'bolt', 'crown', 'tower', 'eagle', 'none'] as const).find((x) => x === c.symbol) ?? 'star', stripes: !!c.stripes },
    home: kit(t.home), away: kit(t.away), gkKit: kit(t.gkKit), formation: t.formation, rating: Math.round(num(t.rating, 1, 99, 60)), players,
    setPieces: { penalty: setPiece(t.setPieces?.penalty), freeKick: setPiece(t.setPieces?.freeKick), captain: setPiece(t.setPieces?.captain) },
  };
}
