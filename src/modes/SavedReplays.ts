// Repeticiones guardadas: las últimas jugadas que el usuario decide conservar. Se guardan en el almacenamiento
// local con una codificación compacta (números redondeados y nombres de animación indexados) para que quepan
// varias sin llenar el espacio disponible.
import type { ReplayFrame } from '../sim/Match';
import type { KitData, TeamData } from '../data/types';
import { loadJSON, saveJSON } from '../save/Storage';

export const MAX_SAVED_REPLAYS = 8;
const KEY = 'replays';

export interface SavedReplayMeta {
  id: string;
  /** Fecha (ms). */
  date: number;
  title: string;
  /** Minuto del partido (texto del reloj). */
  clock: string;
  score: string;
  stadiumId: string;
  /** Lado del arco hacia el que va la jugada (+1 / −1): la cámara de repetición mira hacia ese arco. */
  goalSide: 1 | -1;
}

export interface SavedReplay extends SavedReplayMeta {
  home: TeamData;
  away: TeamData;
  homeKit: KitData;
  awayKit: KitData;
  weather?: string;
  /** Fotogramas codificados (ver `encodeFrames`). */
  data: EncodedFrames;
}

export interface EncodedFrames {
  ids: string[];
  states: string[];
  /** Por fotograma: [tm, bx, by, bz, ...por jugador (x, z, f, estado, t, sp, d, v, ft) o null si no está]. */
  f: (number | null)[][];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function encodeFrames(frames: ReplayFrame[]): EncodedFrames {
  const ids: string[] = [];
  const states: string[] = [];
  const idIdx = new Map<string, number>();
  const stIdx = new Map<string, number>();
  for (const fr of frames) for (const p of fr.players) if (!idIdx.has(p.id)) { idIdx.set(p.id, ids.length); ids.push(p.id); }
  const f = frames.map((fr) => {
    const row: (number | null)[] = [r3(fr.tm), r2(fr.ball[0]), r2(fr.ball[1]), r2(fr.ball[2])];
    const slots: (number | null)[] = new Array(ids.length * 9).fill(null);
    for (const p of fr.players) {
      let si = stIdx.get(p.s);
      if (si === undefined) { si = states.length; stIdx.set(p.s, si); states.push(p.s); }
      const o = idIdx.get(p.id)! * 9;
      slots[o] = r2(p.x); slots[o + 1] = r2(p.z); slots[o + 2] = r2(p.f); slots[o + 3] = si;
      slots[o + 4] = r3(p.t); slots[o + 5] = r2(p.sp); slots[o + 6] = r3(p.d); slots[o + 7] = p.v; slots[o + 8] = p.ft;
    }
    return row.concat(slots);
  });
  return { ids, states, f };
}

export function decodeFrames(e: EncodedFrames): ReplayFrame[] {
  return e.f.map((row) => {
    const players: ReplayFrame['players'] = [];
    for (let i = 0; i < e.ids.length; i++) {
      const o = 4 + i * 9;
      if (row[o] === null || row[o] === undefined) continue;
      players.push({
        id: e.ids[i], x: row[o]!, z: row[o + 1]!, f: row[o + 2]!, s: e.states[row[o + 3]!], t: row[o + 4]!,
        sp: row[o + 5]!, d: row[o + 6]!, v: row[o + 7]!, ft: row[o + 8]!,
      });
    }
    return { tm: row[0]!, ball: [row[1]!, row[2]!, row[3]!], players };
  });
}

export function listReplays(): SavedReplay[] {
  return loadJSON<SavedReplay[]>(KEY, []);
}

/** Guarda una repetición (las más viejas salen si se supera el máximo). Devuelve false si no hubo espacio. */
export function saveReplay(r: SavedReplay): boolean {
  let list = [r, ...listReplays().filter((x) => x.id !== r.id)].slice(0, MAX_SAVED_REPLAYS);
  // si el almacenamiento está lleno se van descartando las más viejas
  while (list.length) {
    saveJSON(KEY, list);
    if (listReplays().some((x) => x.id === r.id)) return true;
    list = list.slice(0, -1);
  }
  return false;
}

export function deleteReplay(id: string) {
  saveJSON(KEY, listReplays().filter((x) => x.id !== id));
}

/** Recorta los últimos `seconds` de la grabación del partido. */
export function lastSeconds(frames: ReplayFrame[], seconds: number): ReplayFrame[] {
  if (!frames.length) return [];
  const end = frames[frames.length - 1].tm;
  return frames.filter((f) => f.tm >= end - seconds);
}
