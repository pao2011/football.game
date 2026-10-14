// Tipos compartidos entre la simulación y la capa de presentación.
// La simulación NO depende de three.js para renderizar; solo usa Vector3 como estructura matemática.

/** Estado de animación que la simulación expone al renderizador. */
export type AnimState =
  | 'idle'
  | 'locomotion' // caminar/trotar/correr, mezclado por speed
  | 'dribble' // carrera conduciendo el balón
  | 'jockey' // posición defensiva lateral (contener)
  | 'pass' // pase raso
  | 'lob' // pase elevado / centro
  | 'shoot' // disparo
  | 'header' // salto y cabezazo
  | 'tackle' // entrada de pie
  | 'slide' // barrida
  | 'fallen' // caído tras una falta / barrida
  | 'getup'
  | 'throwin' // saque de banda
  | 'gk_ready' // arquero preparado
  | 'gk_dive_left'
  | 'gk_dive_right'
  | 'gk_catch' // atajada de frente / blocaje
  | 'gk_hold' // arquero con balón en manos
  | 'gk_throw' // saque con la mano
  | 'gk_kick' // despeje / saque de volea
  | 'celebrate' // celebración
  | 'dejected' // reacción a gol en contra / error
  | 'trap'; // control del balón

export interface AnimInfo {
  state: AnimState;
  /** Tiempo (s) desde que empezó el estado actual. */
  time: number;
  /** Duración esperada del estado (para acciones puntuales), 0 si es cíclico. */
  duration: number;
  /** Velocidad horizontal actual en m/s (para mezclar caminar/correr). */
  speed: number;
  /** Variante (p. ej. tipo de celebración). */
  variant: number;
  /** Lado del pie que golpea: 1 derecho, -1 izquierdo. */
  foot: number;
}

export type MatchEventType =
  | 'kick' // golpeo de balón (power 0..1)
  | 'bounce'
  | 'post'
  | 'net'
  | 'whistle' // kind: 'short' | 'long' | 'final'
  | 'goal'
  | 'save'
  | 'foul'
  | 'card'
  | 'offside'
  | 'out'
  | 'tackle'
  | 'nearMiss'
  | 'phase';

export interface MatchEvent {
  type: MatchEventType;
  team?: number;
  playerId?: string;
  power?: number;
  kind?: string;
  text?: string;
  x?: number;
  z?: number;
}
