import type { Difficulty } from '../data/types';

/**
 * La dificultad modifica la calidad de decisión, precisión, tiempos de reacción y presión,
 * nunca los atributos físicos de los jugadores (sin ventajas imposibles).
 */
export interface DifficultyParams {
  /** Tiempo de reacción de la IA con balón entre decisiones (s). */
  reaction: number;
  /** Ruido en la evaluación de opciones (0 = siempre la mejor opción). */
  decisionNoise: number;
  /** Multiplicador del error de ejecución de pases/tiros. */
  kickError: number;
  /** Número de jugadores que presionan al portador. */
  pressers: number;
  /** Distancia (m) desde la que se inicia la presión. */
  pressDistance: number;
  /** Retardo de reacción del arquero ante un tiro (s). */
  gkReaction: number;
  /** Altura de la línea defensiva (0 baja .. 1 alta). */
  lineHeight: number;
  /** Probabilidad por segundo de intentar una entrada cuando es razonable. */
  tackleEagerness: number;
  /** Anticipación en intercepciones (s de predicción). */
  anticipation: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  amateur: { reaction: 0.55, decisionNoise: 0.45, kickError: 1.6, pressers: 1, pressDistance: 12, gkReaction: 0.32, lineHeight: 0.3, tackleEagerness: 0.8, anticipation: 0.2 },
  pro: { reaction: 0.38, decisionNoise: 0.25, kickError: 1.2, pressers: 1, pressDistance: 16, gkReaction: 0.22, lineHeight: 0.45, tackleEagerness: 1.4, anticipation: 0.45 },
  world: { reaction: 0.26, decisionNoise: 0.12, kickError: 0.95, pressers: 2, pressDistance: 20, gkReaction: 0.15, lineHeight: 0.55, tackleEagerness: 2.2, anticipation: 0.7 },
  legend: { reaction: 0.18, decisionNoise: 0.05, kickError: 0.8, pressers: 2, pressDistance: 24, gkReaction: 0.1, lineHeight: 0.65, tackleEagerness: 3, anticipation: 0.9 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  amateur: 'Amateur',
  pro: 'Profesional',
  world: 'Clase mundial',
  legend: 'Leyenda',
};
