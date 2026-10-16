// Clima del partido: afecta a la física del balón (rodadura, botes y viento) y al render y el sonido.
import { Vector3 } from 'three';

export type Weather = 'clear' | 'rain' | 'snow' | 'wind';

export const WEATHER_NAMES: Record<Weather, string> = {
  clear: 'Despejado',
  rain: 'Lluvia',
  snow: 'Nieve',
  wind: 'Viento',
};

export const WEATHER_ICONS: Record<Weather, string> = { clear: '', rain: '🌧', snow: '❄', wind: '💨' };

/** Entorno físico del balón. */
export interface BallEnv {
  /** Multiplicador de la deceleración por rodadura (lluvia: el balón corre más; nieve: se frena). */
  roll: number;
  /** Multiplicador del coeficiente de restitución del bote (césped mojado o nieve: bota menos). */
  bounce: number;
  /** Velocidad horizontal que conserva el balón al botar (lluvia: patina; nieve: se clava). */
  skid: number;
  /** Viento (m/s) en el plano del campo: desvía los balones que van por el aire. */
  wind: Vector3;
}

export function defaultEnv(): BallEnv {
  return { roll: 1, bounce: 1, skid: 0.84, wind: new Vector3() };
}

/** Entorno del balón para un clima; la dirección del viento sale de la semilla del partido. */
export function weatherEnv(w: Weather, seed: number): BallEnv {
  const env = defaultEnv();
  const ang = ((seed * 9301 + 49297) % 233280) / 233280 * Math.PI * 2;
  const windSpeed = w === 'wind' ? 7.5 : w === 'rain' ? 2.5 : w === 'snow' ? 1.5 : 0;
  env.wind.set(Math.cos(ang) * windSpeed, 0, Math.sin(ang) * windSpeed);
  if (w === 'rain') {
    env.roll = 0.68;
    env.bounce = 0.82;
    env.skid = 0.93;
  } else if (w === 'snow') {
    env.roll = 1.7;
    env.bounce = 0.66;
    env.skid = 0.72;
  }
  return env;
}

/** Clima al azar para torneos y carrera (casi siempre despejado). */
export function randomWeather(r: number): Weather {
  return r < 0.68 ? 'clear' : r < 0.84 ? 'rain' : r < 0.93 ? 'wind' : 'snow';
}
