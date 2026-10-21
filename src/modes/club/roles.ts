import type { Position } from '../../data/types';
import type { Role } from './types';

export const ROLE_GROUP: Record<Role, Position> = {
  POR: 'GK', LI: 'DEF', DFC: 'DEF', LD: 'DEF',
  MCD: 'MID', MC: 'MID', MI: 'MID', MD: 'MID', MCO: 'MID', CAI: 'MID', CAD: 'MID',
  EI: 'FWD', ED: 'FWD', DC: 'FWD',
};

/** Puestos alternativos naturales de cada puesto (juegan casi igual de bien en ellos). */
export const ROLE_ALT: Record<Role, Role[]> = {
  POR: [], LI: ['CAI', 'MI', 'DFC'], LD: ['CAD', 'MD', 'DFC'], DFC: ['MCD'],
  MCD: ['DFC', 'MC'], MC: ['MCD', 'MCO', 'MI', 'MD'], MCO: ['MC', 'EI', 'ED', 'DC'],
  MI: ['LI', 'CAI', 'EI', 'MC'], MD: ['LD', 'CAD', 'ED', 'MC'], CAI: ['LI', 'MI'], CAD: ['LD', 'MD'],
  EI: ['MI', 'DC', 'MCO'], ED: ['MD', 'DC', 'MCO'], DC: ['MCO', 'EI', 'ED'],
};

/** Ajuste de un jugador a un puesto: 1 natural · 0,92 alternativo · 0,82 misma línea · 0,55 otra línea · 0,25 con el portero. */
export function roleFit(player: Role, alt: readonly Role[], slot: Role): number {
  if (player === slot) return 1;
  if (alt.includes(slot)) return 0.92;
  const a = ROLE_GROUP[player];
  const b = ROLE_GROUP[slot];
  if (a === 'GK' || b === 'GK') return 0.25;
  return a === b ? 0.82 : 0.55;
}

/** Puntos de atributo que se pierden por jugar fuera de su puesto natural. */
export const fitPenalty = (fit: number) => Math.round((1 - fit) * 18 * 10) / 10;

export const ROLE_NAMES: Record<Role, string> = {
  POR: 'Portero', LI: 'Lateral izq.', DFC: 'Central', LD: 'Lateral der.', MCD: 'Pivote', MC: 'Mediocentro', MI: 'Medio izq.',
  MD: 'Medio der.', MCO: 'Mediapunta', CAI: 'Carrilero izq.', CAD: 'Carrilero der.', EI: 'Extremo izq.', ED: 'Extremo der.', DC: 'Delantero',
};
