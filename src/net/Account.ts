import { getRaw, loadJSON, removeKey, saveJSON, setOnSaved, setRaw } from '../save/Storage';
import { serverCandidates } from './NetClient';

/** Claves de progreso que viajan con la cuenta (las mismas que acepta server/accounts.mjs). */
export const SYNC_KEYS = ['club', 'career', 'tournament', 'continental', 'achievements', 'customTeams', 'online-profile'];

export interface Session { token: string; name: string; email: string }
type Entry = { v: string; t: number };

export const session = (): Session | null => loadJSON<Session | null>('account', null);
const meta = () => loadJSON<Record<string, number>>('sync-meta', {});

let base = ''; // servidor que respondió la última vez
let custom = '';
export const setAccountServer = (s: string) => { custom = s; base = ''; };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = session();
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s.token}` } : {}) };
  const hosts = base ? [base] : serverCandidates(custom).map((u) => u.replace(/^ws/, 'http').replace(/\/ws\/?$/, ''));
  let last: unknown = new Error('Sin conexión con el servidor');
  for (const h of hosts) {
    try {
      const r = await fetch(`${h}/api/${path}`, { ...init, headers });
      const j = await r.json();
      base = h;
      if (!r.ok) throw Object.assign(new Error(j.error || 'Error del servidor'), { fatal: true });
      return j as T;
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e;
      last = e;
    }
  }
  throw new Error(last instanceof Error && last.message !== 'Failed to fetch' ? last.message : 'No se pudo conectar con el servidor. Si es el gratuito, puede tardar ~1 minuto en despertar.');
}

/** Sube el progreso local y, con `apply`, trae lo más reciente de la nube. Devuelve true si cambió algo local. */
export async function syncNow(apply: boolean): Promise<boolean> {
  if (!session()) return false;
  const m = meta();
  const out: Record<string, Entry> = {};
  for (const k of SYNC_KEYS) { const v = getRaw(k); if (v) out[k] = { v, t: m[k] ?? 0 }; }
  const { data } = await call<{ data: Record<string, Entry> }>('sync', { method: 'PUT', body: JSON.stringify({ data: out }) });
  let changed = false;
  for (const [k, e] of Object.entries(data)) {
    if (!apply || !SYNC_KEYS.includes(k) || (e.t <= (m[k] ?? 0) && getRaw(k))) continue;
    m[k] = e.t;
    setRaw(k, e.v);
    changed = true;
  }
  saveJSON('sync-meta', m);
  return changed;
}

async function enter(path: 'register' | 'login', body: object): Promise<Session> {
  const r = await call<{ token: string; user: { name: string; email: string } }>(path, { method: 'POST', body: JSON.stringify(body) });
  const s = { token: r.token, ...r.user };
  saveJSON('account', s);
  return s;
}
export const register = (name: string, email: string, password: string) => enter('register', { name, email, password });
export const login = (who: string, password: string) => enter('login', { who, password });

export async function logout() {
  try { await call('logout', { method: 'POST', body: '{}' }); } catch { /* sin conexión: igualmente se cierra aquí */ }
  removeKey('account');
}

let timer = 0;
/** Marca la hora de cada guardado del progreso y lo sube a la nube pasados unos segundos. */
export function startSync() {
  setOnSaved((k) => {
    if (!SYNC_KEYS.includes(k)) return;
    stamp(k);
    if (!session()) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => syncNow(false).catch(() => undefined), 5000);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && session()) syncNow(false).catch(() => undefined); });
}

function stamp(k: string) {
  const m = meta();
  m[k] = Date.now();
  setRaw('sync-meta', JSON.stringify(m));
}
