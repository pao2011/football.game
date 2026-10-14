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
