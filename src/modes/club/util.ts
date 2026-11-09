// Utilidades del modo Club: hash determinista, números aleatorios con semilla y fechas por periodos.

/** Hash FNV-1a de 32 bits (determinista: mismos datos → mismas cartas en todos los dispositivos). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rand = () => number;

/** Generador con semilla (mulberry32). */
export function seeded(seed: number): Rand {
  let s = seed >>> 0;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Aleatorio del sistema para las acciones del usuario (sobres, mercado). Se puede sustituir en las pruebas. */
export const systemRand: Rand = () => {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
};

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const DAY = 86400000;
/** Id del día (UTC, AAAA-MM-DD). */
export function dayId(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
/** Id de la semana (lunes UTC de esa semana). */
export function weekId(now: number): string {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY).toISOString().slice(0, 10);
}
export const msToDay = (now: number) => DAY - (now % DAY);

/** Elige un elemento según pesos. */
export function weighted<T>(items: readonly T[], weight: (t: T) => number, r: Rand): T {
  let total = 0;
  for (const i of items) total += weight(i);
  let x = r() * total;
  for (const i of items) {
    x -= weight(i);
    if (x < 0) return i;
  }
  return items[items.length - 1];
}
