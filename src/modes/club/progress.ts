import { addTx } from './economy';
import type { ClubState, ObjectiveProgress, Records } from './types';
import { dayId, hash32, seeded, weekId } from './util';

// Progresión: experiencia y niveles, objetivos diarios y semanales, hitos, recompensa de inicio de sesión y temporadas.
// Cada recompensa se reclama una sola vez por periodo (se guarda en `claimed`).

export interface Reward { coins?: number; xp?: number; packs?: Record<string, number> }

export function rewardText(r: Reward): string {
  const t: string[] = [];
  if (r.coins) t.push(`${r.coins.toLocaleString('es-ES')} monedas`);
  if (r.xp) t.push(`${r.xp} XP`);
  for (const [k, n] of Object.entries(r.packs ?? {})) t.push(`${n} sobre${n > 1 ? 's' : ''} ${k === 'promo' ? 'promocional' : k === 'basic' ? 'básico' : k === 'premium' ? 'premium' : k}${n > 1 ? 'es' : ''}`.replace('promocionales', 'promocionales'));
  return t.join(' + ');
}

// ---------- Niveles ----------
/** XP total necesaria para alcanzar un nivel. */
export const xpForLevel = (level: number) => (level <= 1 ? 0 : Math.round(120 * Math.pow(level - 1, 1.6)));
export function levelOf(xp: number): number {
  let l = 1;
  while (xpForLevel(l + 1) <= xp && l < 99) l++;
  return l;
}
export function levelProgress(xp: number) {
  const l = levelOf(xp);
  const a = xpForLevel(l);
  const b = xpForLevel(l + 1);
  return { level: l, into: xp - a, need: b - a, frac: l >= 99 ? 1 : (xp - a) / (b - a) };
}
/** Recompensa al alcanzar un nivel. */
export function levelReward(level: number): Reward {
  return { coins: 300 + level * 40, packs: level % 5 === 0 ? { promo: 1 } : undefined };
}

export function grant(s: ClubState, r: Reward, label: string, now: number) {
  if (r.coins) addTx(s, 'reward', r.coins, label, now);
  if (r.xp) addXp(s, r.xp, now);
  for (const [k, n] of Object.entries(r.packs ?? {})) s.packs.promo[k] = (s.packs.promo[k] ?? 0) + n;
}

/** Suma experiencia; al subir de nivel entrega la recompensa de cada nivel superado (una sola vez). */
export function addXp(s: ClubState, xp: number, now: number): number[] {
  const before = levelOf(s.xp);
  s.xp += Math.max(0, Math.round(xp));
  const after = levelOf(s.xp);
  const gained: number[] = [];
  for (let l = before + 1; l <= after; l++) {
    gained.push(l);
    const r = levelReward(l);
    if (r.coins) addTx(s, 'reward', r.coins, `Nivel ${l}`, now);
    for (const [k, n] of Object.entries(r.packs ?? {})) s.packs.promo[k] = (s.packs.promo[k] ?? 0) + n;
  }
  return gained;
}

// ---------- Temporadas ----------
export interface SeasonDef { id: string; name: string; start: number; end: number }
/** Temporadas con fechas configurables (ISO). Si la fecha actual no cae en ninguna, se generan temporadas de 8 semanas. */
export const SEASONS: SeasonDef[] = [
  { id: 's1', name: 'Temporada 1 · Apertura', start: Date.UTC(2026, 9, 1), end: Date.UTC(2026, 11, 1) },
  { id: 's2', name: 'Temporada 2 · Clausura', start: Date.UTC(2026, 11, 1), end: Date.UTC(2027, 1, 1) },
];
const SEASON_LEN = 56 * 86400000;
export function currentSeason(now: number): SeasonDef {
  const hit = SEASONS.find((s) => now >= s.start && now < s.end);
  if (hit) return hit;
  const last = SEASONS[SEASONS.length - 1];
  if (now < SEASONS[0].start) return { id: 's0', name: 'Pretemporada', start: 0, end: SEASONS[0].start };
  const n = Math.floor((now - last.end) / SEASON_LEN);
  const start = last.end + n * SEASON_LEN;
  return { id: `s${SEASONS.length + 1 + n}`, name: `Temporada ${SEASONS.length + 1 + n}`, start, end: start + SEASON_LEN };
}

export interface SeasonMilestone { id: string; points: number; reward: Reward }
export const SEASON_MILESTONES: SeasonMilestone[] = [
  { id: 'sm1', points: 100, reward: { coins: 1000 } },
  { id: 'sm2', points: 300, reward: { packs: { promo: 1 } } },
  { id: 'sm3', points: 600, reward: { coins: 3000, xp: 300 } },
  { id: 'sm4', points: 1000, reward: { packs: { premium: 1 } } },
  { id: 'sm5', points: 1600, reward: { coins: 8000, packs: { special: 1 } } },
];

// ---------- Objetivos ----------
export type Metric = 'matches' | 'wins' | 'goals' | 'cleanSheets' | 'passes' | 'shots' | 'tackles' | 'packs' | 'market' | 'sbc' | 'squadBattles' | 'rivals';
export interface ObjectiveDef { id: string; text: string; metric: Metric; target: number; reward: Reward }

export const DAILY_POOL: ObjectiveDef[] = [
  { id: 'd_play3', text: 'Juega 3 partidos', metric: 'matches', target: 3, reward: { coins: 600, xp: 80 } },
  { id: 'd_win1', text: 'Gana un partido', metric: 'wins', target: 1, reward: { coins: 500, xp: 60 } },
  { id: 'd_goals5', text: 'Marca 5 goles', metric: 'goals', target: 5, reward: { coins: 700, xp: 80 } },
  { id: 'd_clean1', text: 'Mantén la portería a cero una vez', metric: 'cleanSheets', target: 1, reward: { coins: 700, xp: 90 } },
  { id: 'd_pass80', text: 'Completa 80 pases', metric: 'passes', target: 80, reward: { coins: 600, xp: 70 } },
  { id: 'd_shots10', text: 'Remata 10 veces', metric: 'shots', target: 10, reward: { coins: 500, xp: 60 } },
  { id: 'd_tackle10', text: 'Gana 10 entradas', metric: 'tackles', target: 10, reward: { coins: 500, xp: 60 } },
  { id: 'd_pack1', text: 'Abre un sobre', metric: 'packs', target: 1, reward: { coins: 400, xp: 60 } },
  { id: 'd_battle1', text: 'Juega un Squad Battle', metric: 'squadBattles', target: 1, reward: { coins: 700, xp: 80 } },
  { id: 'd_market1', text: 'Haz una operación en el mercado', metric: 'market', target: 1, reward: { coins: 400, xp: 50 } },
];
export const WEEKLY_POOL: ObjectiveDef[] = [
  { id: 'w_win8', text: 'Gana 8 partidos', metric: 'wins', target: 8, reward: { coins: 3000, xp: 400, packs: { promo: 1 } } },
  { id: 'w_goals25', text: 'Marca 25 goles', metric: 'goals', target: 25, reward: { coins: 3000, xp: 350 } },
  { id: 'w_clean4', text: 'Cuatro partidos sin recibir gol', metric: 'cleanSheets', target: 4, reward: { coins: 3500, xp: 400 } },
  { id: 'w_pass600', text: 'Completa 600 pases', metric: 'passes', target: 600, reward: { coins: 2500, xp: 300 } },
  { id: 'w_rivals5', text: 'Juega 5 partidos de Rivals', metric: 'rivals', target: 5, reward: { coins: 3000, xp: 350, packs: { promo: 1 } } },
  { id: 'w_packs5', text: 'Abre 5 sobres', metric: 'packs', target: 5, reward: { coins: 2000, xp: 300 } },
  { id: 'w_sbc1', text: 'Completa un desafío de plantilla', metric: 'sbc', target: 1, reward: { coins: 3000, xp: 350, packs: { promo: 1 } } },
  { id: 'w_tackle60', text: 'Gana 60 entradas', metric: 'tackles', target: 60, reward: { coins: 2500, xp: 300 } },
];
export const ALL_OBJECTIVES = [...DAILY_POOL, ...WEEKLY_POOL];
export const objectiveDef = (id: string) => ALL_OBJECTIVES.find((o) => o.id === id);

function pick(pool: ObjectiveDef[], seed: string, n: number): ObjectiveProgress[] {
  const r = seeded(hash32(seed));
  const items = pool.slice();
  const out: ObjectiveProgress[] = [];
  while (out.length < n && items.length) out.push({ id: items.splice(Math.floor(r() * items.length), 1)[0].id, progress: 0 });
  return out;
}

/** Renueva objetivos, temporada y recompensa diaria según la fecha (idempotente). */
export function ensurePeriods(s: ClubState, now: number) {
  const day = dayId(now);
  const week = weekId(now);
  const p = s.progress;
  if (p.daily.dayId !== day) p.daily = { dayId: day, objectives: pick(DAILY_POOL, `d|${s.id}|${day}`, 4), claimed: [] };
  if (p.weekly.weekId !== week) p.weekly = { weekId: week, objectives: pick(WEEKLY_POOL, `w|${s.id}|${week}`, 3), claimed: [] };
  const season = currentSeason(now);
  if (p.season.id !== season.id) p.season = { id: season.id, points: 0, claimed: [] };
  if (p.matchesToday.dayId !== day) p.matchesToday = { dayId: day, n: 0 };
}

/** Suma progreso a los objetivos que miden esa métrica. */
export function track(s: ClubState, metric: Metric, n: number, now: number) {
  if (n <= 0) return;
  ensurePeriods(s, now);
  for (const list of [s.progress.daily.objectives, s.progress.weekly.objectives]) {
    for (const o of list) {
      const d = objectiveDef(o.id);
      if (d && d.metric === metric) o.progress = Math.min(d.target, o.progress + n);
    }
  }
}

export function addSeasonPoints(s: ClubState, n: number, now: number) {
  ensurePeriods(s, now);
  s.progress.season.points += n;
}

export function claimObjective(s: ClubState, scope: 'daily' | 'weekly', id: string, now: number): { ok: boolean; error?: string; reward?: Reward } {
  ensurePeriods(s, now);
  const bucket = scope === 'daily' ? s.progress.daily : s.progress.weekly;
  const o = bucket.objectives.find((x) => x.id === id);
  const d = objectiveDef(id);
  if (!o || !d) return { ok: false, error: 'Objetivo no encontrado.' };
  if (bucket.claimed.includes(id)) return { ok: false, error: 'Ya reclamaste esta recompensa.' };
  if (o.progress < d.target) return { ok: false, error: 'Todavía no completaste el objetivo.' };
  bucket.claimed.push(id);
  grant(s, d.reward, d.text, now);
  addSeasonPoints(s, scope === 'daily' ? 15 : 40, now);
  return { ok: true, reward: d.reward };
}

// ---------- Recompensa de inicio de sesión ----------
export const LOGIN_REWARDS: Reward[] = [
  { coins: 500 }, { xp: 100, coins: 200 }, { coins: 800 }, { packs: { promo: 1 } }, { coins: 1000, xp: 100 }, { xp: 250 }, { packs: { promo: 1 }, coins: 1500 },
];
export function loginStatus(s: ClubState, now: number) {
  const day = dayId(now);
  const claimed = s.progress.loginClaimedDay === day;
  const prev = dayId(now - 86400000);
  const streak = claimed ? s.progress.loginStreak : s.progress.loginDay === prev || s.progress.loginClaimedDay === prev ? s.progress.loginStreak : 0;
  return { claimed, streak, next: streak % LOGIN_REWARDS.length, reward: LOGIN_REWARDS[streak % LOGIN_REWARDS.length] };
}
export function claimLogin(s: ClubState, now: number): { ok: boolean; error?: string; reward?: Reward } {
  const st = loginStatus(s, now);
  if (st.claimed) return { ok: false, error: 'La recompensa de hoy ya fue reclamada.' };
  s.progress.loginStreak = st.streak + 1;
  s.progress.loginDay = dayId(now);
  s.progress.loginClaimedDay = dayId(now);
  grant(s, st.reward, `Inicio de sesión (día ${st.next + 1})`, now);
  return { ok: true, reward: st.reward };
}

// ---------- Hitos del club ----------
export interface MilestoneDef { id: string; text: string; test: (r: Records, s: ClubState) => number; target: number; reward: Reward }
export const MILESTONES: MilestoneDef[] = [
  { id: 'm_win1', text: 'Primera victoria', test: (r) => r.won, target: 1, reward: { coins: 500, xp: 100 } },
  { id: 'm_win10', text: '10 victorias', test: (r) => r.won, target: 10, reward: { coins: 2000, xp: 300 } },
  { id: 'm_win50', text: '50 victorias', test: (r) => r.won, target: 50, reward: { coins: 8000, packs: { premium: 1 } } },
  { id: 'm_goals50', text: '50 goles marcados', test: (r) => r.goalsFor, target: 50, reward: { coins: 2500, xp: 300 } },
  { id: 'm_goals250', text: '250 goles marcados', test: (r) => r.goalsFor, target: 250, reward: { coins: 8000, packs: { promo: 2 } } },
  { id: 'm_clean10', text: '10 porterías a cero', test: (r) => r.cleanSheets, target: 10, reward: { coins: 3000, xp: 300 } },
  { id: 'm_streak5', text: 'Racha de 5 victorias seguidas', test: (r) => r.bestStreak, target: 5, reward: { coins: 3000, packs: { promo: 1 } } },
  { id: 'm_packs10', text: 'Abre 10 sobres', test: (r) => r.packsOpened, target: 10, reward: { coins: 1500, xp: 200 } },
  { id: 'm_sbc3', text: 'Completa 3 desafíos de plantilla', test: (r) => r.sbcDone, target: 3, reward: { coins: 4000, packs: { promo: 1 } } },
  { id: 'm_market10', text: '10 operaciones de mercado', test: (r) => r.marketBuys + r.marketSells, target: 10, reward: { coins: 2000, xp: 250 } },
  { id: 'm_level10', text: 'Llega al nivel 10', test: (_r, s) => levelOf(s.xp), target: 10, reward: { coins: 3000, packs: { premium: 1 } } },
];
export function milestoneStatus(s: ClubState) {
  return MILESTONES.map((m) => ({ def: m, value: m.test(s.records, s), done: m.test(s.records, s) >= m.target, claimed: s.progress.milestones.includes(m.id) }));
}
export function claimMilestone(s: ClubState, id: string, now: number): { ok: boolean; error?: string; reward?: Reward } {
  const m = MILESTONES.find((x) => x.id === id);
  if (!m) return { ok: false, error: 'Hito no encontrado.' };
  if (s.progress.milestones.includes(id)) return { ok: false, error: 'Ya reclamaste este hito.' };
  if (m.test(s.records, s) < m.target) return { ok: false, error: 'Todavía no alcanzaste este hito.' };
  s.progress.milestones.push(id);
  grant(s, m.reward, m.text, now);
  return { ok: true, reward: m.reward };
}
export function claimSeasonMilestone(s: ClubState, id: string, now: number): { ok: boolean; error?: string; reward?: Reward } {
  ensurePeriods(s, now);
  const m = SEASON_MILESTONES.find((x) => x.id === id);
  if (!m) return { ok: false, error: 'Hito de temporada no encontrado.' };
  if (s.progress.season.claimed.includes(id)) return { ok: false, error: 'Ya reclamaste este hito.' };
  if (s.progress.season.points < m.points) return { ok: false, error: 'Todavía no tienes los puntos necesarios.' };
  s.progress.season.claimed.push(id);
  grant(s, m.reward, `Hito de temporada (${m.points} pts)`, now);
  return { ok: true, reward: m.reward };
}
