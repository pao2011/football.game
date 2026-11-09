import type { Vector3 } from 'three';
import type { Player } from './Player';
import type { ReplayFrame } from './Match';

// VAR y errores arbitrales. El árbitro puede equivocarse al sancionar una falta; cuanto más caliente está el partido
// (tensión) y menos tiempo queda, más probable es el error. El VAR revisa las jugadas importantes (penales, rojas directas
// y goles tras falta) cuando el juego se detiene o el balón sale, y el árbitro va al monitor a verlas.

/** Sanción de una falta. */
export interface FoulCall { card: 'yellow' | 'red' | null; warn: boolean; penalty: boolean }

export type VarKind = 'penalty' | 'red' | 'goal';
/** Por qué hay revisión: el árbitro dejó seguir (missed), pitó algo distinto (wrong) o es un chequeo de rutina (check). */
export type VarOrigin = 'foul' | 'missed' | 'goal';

export interface VarIncident {
  kind: VarKind;
  origin: VarOrigin;
  /** Instante de la jugada (para recortar el vídeo). */
  time: number;
  offender: Player;
  victim: Player;
  /** Dónde ocurrió (x, z). */
  at: { x: number; z: number };
  /** Lo que decidió el árbitro (null = no pitó). */
  called: FoulCall | null;
  /** Lo que era correcto. */
  truth: FoulCall;
  /** El VAR cambia la decisión. */
  overturn: boolean;
  /** Equipo que anotó el gol en revisión (origin 'goal'). */
  goalTeam?: 0 | 1;
  /** Rótulo de la revisión ("POSIBLE PENAL"…), descripción y resultado. */
  label: string;
  detail: string;
  verdict: string;
}

export type VarStage = 'call' | 'tv' | 'walk' | 'review' | 'footage' | 'back' | 'verdict';

export interface VarReview {
  incident: VarIncident;
  stage: VarStage;
  /** Tiempo (s) en la etapa actual. */
  t: number;
  /** Dónde está el monitor y dónde se para el árbitro. */
  monitor: Vector3;
  refSpot: Vector3;
  clip: ReplayFrame[];
  /** Duración del vídeo a cámara lenta. */
  footageLen: number;
  skipRequested: boolean;
}

export const VAR_TIMES = { call: 1.9, tv: 1.9, review: 2.4, back: 2, verdict: 3.6, walkMax: 5.5 };

/** Probabilidad de que el árbitro se equivoque en una falta: sube con la tensión y con el avance del partido. */
export function refereeErrorChance(minute: number, heat: number, goalDiff: number, cards: number): number {
  const close = goalDiff <= 1 ? 1 : goalDiff === 2 ? 0.4 : 0.1;
  const tension = Math.max(0, Math.min(1, 0.45 * heat + 0.3 * close + 0.25 * Math.min(1, cards / 8)));
  const late = Math.max(0, Math.min(1, (minute - 60) / 30));
  return 0.04 + 0.1 * tension + 0.08 * late;
}
