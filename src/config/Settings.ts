import type { Bindings } from '../input/Input';
import { FIFA_CLASSIC, WASD_ALT } from '../input/Input';
import { loadJSON, saveJSON } from '../save/Storage';
import type { CameraStyle } from '../render/CameraDirector';
import type { Difficulty } from '../data/types';

export interface GameSettings {
  // Gráficos
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  resolutionScale: number; // 0.5 .. 1
  antialias: boolean;
  /** Bajar la resolución y las sombras solo si el equipo no llega a unos FPS fluidos. */
  autoQuality: boolean;
  showRadar: boolean;
  showIndicators: boolean;
  cameraStyle: CameraStyle;
  cameraZoom: number;
  replays: boolean;
  /** Avisos emergentes (atajada, falta, tiro libre…) y ayuda de controles en pantalla. */
  popups: boolean;
  touchControls: 'auto' | 'on' | 'off';
  // Audio
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  crowdVolume: number;
  /** Volumen de los sonidos del balón (dentro de los efectos). */
  ballVolume: number;
  /** Volumen del silbato del árbitro (dentro de los efectos). */
  refereeVolume: number;
  /** Sonido silenciado (tecla M o botón en la pausa); no cambia los volúmenes guardados. */
  muted: boolean;
  /** Comentarista: rótulos de transmisión durante el partido. */
  commentary: boolean;
  /** Voz del comentarista (síntesis de voz del navegador, si la hay en español). */
  commentaryVoice: boolean;
  /** Vibración del mando (gamepad) y del móvil en golpeos, entradas y goles. */
  vibration: boolean;
  // Controles
  bindings: Bindings;
  preset: 'fifa' | 'wasd' | 'custom';
  autoSwitch: boolean;
  passAssist: number;
  /** Asistencia de pase/tiro/defensa: automática (solo en pantallas táctiles), siempre o desactivada. */
  assist: 'auto' | 'on' | 'off';
  /** Segundos que tarda en llenarse la barra de potencia. */
  powerBarTime: number;
  deadzone: number;
  sensitivity: number;
  /** Cambios automáticos de los jugadores cansados (también en tu equipo). */
  autoSubs: boolean;
  /** Nombre visible en el modo online. */
  onlineName: string;
  /** Servidor online (vacío = el predeterminado). */
  onlineServer: string;
  // Partido por defecto
  halfMinutes: number;
  difficulty: Difficulty;
  /** Versión del guardado (para actualizar valores por defecto antiguos). */
  version?: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  shadows: true,
  resolutionScale: 1,
  antialias: true,
  autoQuality: true,
  showRadar: true,
  showIndicators: true,
  cameraStyle: 'broadcast',
  cameraZoom: 1,
  replays: true,
  popups: false,
  touchControls: 'auto',
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.9,
  crowdVolume: 0.7,
  ballVolume: 1,
  refereeVolume: 1,
  vibration: true,
  commentary: true,
  commentaryVoice: false,
  muted: false,
  bindings: structuredClone(FIFA_CLASSIC),
  preset: 'fifa',
  autoSwitch: true,
  passAssist: 1,
  assist: 'auto',
  powerBarTime: 0.6,
  deadzone: 0.18,
  sensitivity: 1,
  autoSubs: false,
  onlineName: '',
  onlineServer: '',
  halfMinutes: 4,
  difficulty: 'pro',
};

/** Valores por defecto para móviles y tabletas: prioriza la fluidez. */
function mobileDefaults(): Partial<GameSettings> {
  const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return coarse ? { quality: 'low', shadows: false, resolutionScale: 0.8, antialias: false, halfMinutes: 3, cameraZoom: 1.2 } : {};
}

export function loadSettings(): GameSettings {
  const s = loadJSON<Partial<GameSettings>>('settings', {});
  const merged = { ...structuredClone(DEFAULT_SETTINGS), ...mobileDefaults(), ...s };
  // completar asignaciones nuevas que no existían en guardados antiguos
  // las acciones nuevas (p. ej. regates) toman la tecla del esquema elegido, sin pisar teclas ya usadas
  const presetDefaults = structuredClone(merged.preset === 'wasd' ? WASD_ALT : FIFA_CLASSIC);
  const saved = (s.bindings ?? {}) as Partial<GameSettings['bindings']>;
  const used = new Set(Object.values(saved).flat());
  for (const k of Object.keys(presetDefaults) as (keyof GameSettings['bindings'])[]) {
    if (!saved[k]) presetDefaults[k] = presetDefaults[k].filter((code) => !used.has(code));
  }
  merged.bindings = { ...presetDefaults, ...saved };
  // v2: la barra de potencia se llena más rápido (antes 1 s por defecto)
  if ((merged.version ?? 1) < 2) {
    if (merged.powerBarTime >= 1) merged.powerBarTime = DEFAULT_SETTINGS.powerBarTime;
    merged.version = 2;
  }
  return merged;
}

export function saveSettings(s: GameSettings) {
  saveJSON('settings', s);
}
