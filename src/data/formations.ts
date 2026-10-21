import type { FormationId, Position } from './types';

/**
 * Posición base de cada puesto en coordenadas normalizadas del propio equipo:
 *  depth: 0 = propia línea de gol, 1 = línea de gol rival
 *  lateral: -1 = banda izquierda, 1 = banda derecha (mirando hacia el arco rival)
 * El sistema táctico desplaza y comprime estas posiciones según el balón y la fase de juego.
 */
export interface FormationSlot {
  role: string; // etiqueta del puesto (POR, LD, DFC, MC...)
  position: Position;
  depth: number;
  lateral: number;
  /** Libertad para incorporarse al ataque (0..1). */
  attackFreedom: number;
}

const GK: FormationSlot = { role: 'POR', position: 'GK', depth: 0.03, lateral: 0, attackFreedom: 0 };

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  '4-3-3': [
    GK,
    { role: 'LI', position: 'DEF', depth: 0.22, lateral: -0.75, attackFreedom: 0.5 },
    { role: 'DFC', position: 'DEF', depth: 0.18, lateral: -0.27, attackFreedom: 0.1 },
    { role: 'DFC', position: 'DEF', depth: 0.18, lateral: 0.27, attackFreedom: 0.1 },
    { role: 'LD', position: 'DEF', depth: 0.22, lateral: 0.75, attackFreedom: 0.5 },
    { role: 'MCD', position: 'MID', depth: 0.36, lateral: 0, attackFreedom: 0.3 },
    { role: 'MC', position: 'MID', depth: 0.46, lateral: -0.38, attackFreedom: 0.6 },
    { role: 'MC', position: 'MID', depth: 0.46, lateral: 0.38, attackFreedom: 0.6 },
    { role: 'EI', position: 'FWD', depth: 0.66, lateral: -0.7, attackFreedom: 0.9 },
    { role: 'DC', position: 'FWD', depth: 0.72, lateral: 0, attackFreedom: 1 },
    { role: 'ED', position: 'FWD', depth: 0.66, lateral: 0.7, attackFreedom: 0.9 },
  ],
  '4-4-2': [
    GK,
    { role: 'LI', position: 'DEF', depth: 0.22, lateral: -0.75, attackFreedom: 0.45 },
    { role: 'DFC', position: 'DEF', depth: 0.18, lateral: -0.27, attackFreedom: 0.1 },
    { role: 'DFC', position: 'DEF', depth: 0.18, lateral: 0.27, attackFreedom: 0.1 },
    { role: 'LD', position: 'DEF', depth: 0.22, lateral: 0.75, attackFreedom: 0.45 },
    { role: 'MI', position: 'MID', depth: 0.45, lateral: -0.72, attackFreedom: 0.75 },
    { role: 'MC', position: 'MID', depth: 0.41, lateral: -0.22, attackFreedom: 0.45 },
    { role: 'MC', position: 'MID', depth: 0.41, lateral: 0.22, attackFreedom: 0.45 },
    { role: 'MD', position: 'MID', depth: 0.45, lateral: 0.72, attackFreedom: 0.75 },
    { role: 'DC', position: 'FWD', depth: 0.68, lateral: -0.2, attackFreedom: 1 },
    { role: 'DC', position: 'FWD', depth: 0.68, lateral: 0.2, attackFreedom: 1 },
  ],
  '4-2-3-1': [
    GK,
    { role: 'LI', position: 'DEF', depth: 0.22, lateral: -0.75, attackFreedom: 0.5 },
    { role: 'DFC', position: 'DEF', depth: 0.18, lateral: -0.27, attackFreedom: 0.1 },
    { role: 'DFC', position: 'DEF', depth: 0.18, lateral: 0.27, attackFreedom: 0.1 },
    { role: 'LD', position: 'DEF', depth: 0.22, lateral: 0.75, attackFreedom: 0.5 },
    { role: 'MCD', position: 'MID', depth: 0.36, lateral: -0.22, attackFreedom: 0.3 },
    { role: 'MCD', position: 'MID', depth: 0.36, lateral: 0.22, attackFreedom: 0.3 },
    { role: 'MI', position: 'MID', depth: 0.56, lateral: -0.68, attackFreedom: 0.85 },
    { role: 'MCO', position: 'MID', depth: 0.56, lateral: 0, attackFreedom: 0.85 },
    { role: 'MD', position: 'MID', depth: 0.56, lateral: 0.68, attackFreedom: 0.85 },
    { role: 'DC', position: 'FWD', depth: 0.72, lateral: 0, attackFreedom: 1 },
  ],
  '4-1-2-1-2': [
    GK,
    { role: 'LI', position: 'DEF', depth: 0.22, lateral: -0.75, attackFreedom: 0.5 },
    { role: 'DFC', position: 'DEF', depth: 0.18, lateral: -0.27, attackFreedom: 0.1 },
    { role: 'DFC', position: 'DEF', depth: 0.18, lateral: 0.27, attackFreedom: 0.1 },
    { role: 'LD', position: 'DEF', depth: 0.22, lateral: 0.75, attackFreedom: 0.5 },
    { role: 'MCD', position: 'MID', depth: 0.34, lateral: 0, attackFreedom: 0.25 },
    { role: 'MC', position: 'MID', depth: 0.45, lateral: -0.38, attackFreedom: 0.6 },
    { role: 'MC', position: 'MID', depth: 0.45, lateral: 0.38, attackFreedom: 0.6 },
    { role: 'MCO', position: 'MID', depth: 0.58, lateral: 0, attackFreedom: 0.9 },
    { role: 'DC', position: 'FWD', depth: 0.7, lateral: -0.2, attackFreedom: 1 },
    { role: 'DC', position: 'FWD', depth: 0.7, lateral: 0.2, attackFreedom: 1 },
  ],
  '3-5-2': [
    GK,
    { role: 'DFC', position: 'DEF', depth: 0.19, lateral: -0.45, attackFreedom: 0.15 },
    { role: 'DFC', position: 'DEF', depth: 0.17, lateral: 0, attackFreedom: 0.05 },
    { role: 'DFC', position: 'DEF', depth: 0.19, lateral: 0.45, attackFreedom: 0.15 },
    { role: 'CAI', position: 'MID', depth: 0.42, lateral: -0.82, attackFreedom: 0.8 },
    { role: 'MCD', position: 'MID', depth: 0.36, lateral: 0, attackFreedom: 0.3 },
    { role: 'MC', position: 'MID', depth: 0.47, lateral: -0.33, attackFreedom: 0.6 },
    { role: 'MC', position: 'MID', depth: 0.47, lateral: 0.33, attackFreedom: 0.6 },
    { role: 'CAD', position: 'MID', depth: 0.42, lateral: 0.82, attackFreedom: 0.8 },
    { role: 'DC', position: 'FWD', depth: 0.69, lateral: -0.2, attackFreedom: 1 },
    { role: 'DC', position: 'FWD', depth: 0.69, lateral: 0.2, attackFreedom: 1 },
  ],
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];
