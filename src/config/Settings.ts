import type { Bindings } from '../input/Input';
import { FIFA_CLASSIC } from '../input/Input';
import { loadJSON, saveJSON } from '../save/Storage';
import type { CameraStyle } from '../render/CameraDirector';
import type { Difficulty } from '../data/types';

export interface GameSettings {
  // Gráficos
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  resolutionScale: number; // 0.5 .. 1
  antialias: boolean;
  showRadar: boolean;
  showIndicators: boolean;
  cameraStyle: CameraStyle;
  cameraZoom: number;
  replays: boolean;
  touchControls: 'auto' | 'on' | 'off';
  // Audio
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  crowdVolume: number;
  // Controles
  bindings: Bindings;
  preset: 'fifa' | 'wasd' | 'custom';
  autoSwitch: boolean;
  passAssist: number;
  powerBarTime: number;
  deadzone: number;
  sensitivity: number;
  // Partido por defecto
  halfMinutes: number;
  difficulty: Difficulty;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  shadows: true,
  resolutionScale: 1,
  antialias: true,
  showRadar: true,
  showIndicators: true,
  cameraStyle: 'broadcast',
  cameraZoom: 1,
  replays: true,
  touchControls: 'auto',
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.9,
  crowdVolume: 0.7,
  bindings: structuredClone(FIFA_CLASSIC),
  preset: 'fifa',
  autoSwitch: true,
  passAssist: 1,
  powerBarTime: 1,
  deadzone: 0.18,
  sensitivity: 1,
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
  merged.bindings = { ...structuredClone(FIFA_CLASSIC), ...(s.bindings ?? {}) };
  return merged;
}

export function saveSettings(s: GameSettings) {
  saveJSON('settings', s);
}
