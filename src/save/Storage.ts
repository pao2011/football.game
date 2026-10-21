// Guardado local (localStorage) con tolerancia a fallos: si el almacenamiento no está disponible
// (modo privado, pruebas), el juego sigue funcionando con valores en memoria.

const PREFIX = 'football-elite-3d:';
const memory = new Map<string, string>();

function store(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const k = PREFIX + '__test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

/** Se avisa tras cada guardado (la sincronización de cuenta lo usa para subir el progreso). */
export let onSaved: ((key: string) => void) | null = null;
export function setOnSaved(fn: (key: string) => void) { onSaved = fn; }

/** Valor tal cual está guardado (texto JSON) y escritura sin avisar; los usa la sincronización. */
export function getRaw(key: string): string | null {
  const st = store();
  return st ? st.getItem(PREFIX + key) : memory.get(key) ?? null;
}
export function setRaw(key: string, raw: string) {
  const st = store();
  if (st) st.setItem(PREFIX + key, raw);
  else memory.set(key, raw);
}

export function saveJSON(key: string, value: unknown) {
  const s = JSON.stringify(value);
  const st = store();
  try {
    if (st) st.setItem(PREFIX + key, s);
    else memory.set(key, s);
  } catch (e) {
    console.warn('No se pudo guardar', key, e);
    memory.set(key, s);
  }
  onSaved?.(key);
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const st = store();
    const raw = st ? st.getItem(PREFIX + key) : memory.get(key) ?? null;
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('Datos guardados dañados, se usan valores por defecto:', key, e);
    return fallback;
  }
}

export function removeKey(key: string) {
  try {
    store()?.removeItem(PREFIX + key);
  } catch { /* ignorar */ }
  memory.delete(key);
}
