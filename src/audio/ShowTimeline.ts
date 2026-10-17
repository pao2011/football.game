/**
 * "El minuto 68" de la cancha de Belgrano: el tema de la hinchada y el espectáculo (humo, bengalas, fuegos
 * artificiales, láseres, luces y gritos) siguen el reloj del partido. Los tiempos están en minutos transcurridos
 * (minuto 66 en el marcador = entre 65:00 y 66:00).
 *
 *   audio:   entra en silencio en el 66, a todo volumen en el 68, así hasta el 70 y baja hasta apagarse en el 72.
 *   visual:  se gesta desde el 67, estalla en el 68 y se apaga hacia el 71.
 */
export const SHOW = {
  audioStart: 65, // 66:00 en el marcador
  audioFull: 67, // 68:00
  audioHold: 69, // 70:00
  audioEnd: 72,
  visStart: 66, // 67:00
  visPeak: 67, // 68:00: el estallido
  visHold: 68.5,
  visEnd: 71,
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface ShowLevels {
  /** Volumen del tema 0..1. */
  audio: number;
  /** Intensidad del espectáculo 0..1. */
  visual: number;
  /** El tema tiene que estar sonando (entre el inicio y el fin). */
  audioOn: boolean;
}

/** Niveles en el minuto transcurrido t (matchSeconds / 60). */
export function showLevels(t: number): ShowLevels {
  const audio = smooth(SHOW.audioStart, SHOW.audioFull, t) * (1 - smooth(SHOW.audioHold, SHOW.audioEnd, t));
  const visual = smooth(SHOW.visStart, SHOW.visPeak, t) * (1 - smooth(SHOW.visHold, SHOW.visEnd, t));
  return { audio, visual, audioOn: t >= SHOW.audioStart && t < SHOW.audioEnd };
}
