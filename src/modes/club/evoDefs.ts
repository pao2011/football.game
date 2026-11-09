import type { PlayerAttributes, Position } from '../../data/types';
import type { Rarity } from './types';

// Evoluciones: mejoras por niveles de una carta concreta. Se desbloquea un nivel al cumplir sus tareas jugando con la
// carta de titular. Cada nivel suma atributos; la carta evolucionada es una definición nueva (id con "~evo~") que el
// catálogo calcula al vuelo, así que plantillas, química y partidos la usan sin cambios. Solo datos: la lógica está en evos.ts.

export type EvoMetric = 'matches' | 'wins' | 'goals' | 'cleanSheets';
export interface EvoTask { metric: EvoMetric; target: number; text: string }
export interface EvoLevel { tasks: EvoTask[]; boost: Partial<PlayerAttributes>; skill?: number }
export interface EvoDef {
  id: string;
  name: string;
  blurb: string;
  /** Coste en monedas para empezarla (0 = gratis). */
  cost: number;
  req: { text: string; maxOvr: number; groups?: Position[]; rarities?: Rarity[]; maxAge?: number };
  levels: EvoLevel[];
}

const t = (metric: EvoMetric, target: number): EvoTask => ({
  metric, target,
  text: metric === 'matches' ? `Juega ${target} partido${target > 1 ? 's' : ''} de titular` : metric === 'wins' ? `Gana ${target} partido${target > 1 ? 's' : ''} de titular` : metric === 'goals' ? `Tu equipo marca ${target} goles con él en el campo` : `${target} portería${target > 1 ? 's' : ''} a cero con él de titular`,
});
const all = (n: number): Partial<PlayerAttributes> => ({ speed: n, acceleration: n, passing: n, shooting: n, control: n, defending: n, stamina: n, goalkeeping: n });

export const EVOS: EvoDef[] = [
  { id: 'rayo', name: 'Velocidad de rayo', blurb: 'Más ritmo para extremos y laterales.', cost: 0,
    req: { text: 'Jugador de campo · valoración 78 o menos', maxOvr: 78, groups: ['DEF', 'MID', 'FWD'] },
    levels: [{ tasks: [t('matches', 2)], boost: { speed: 4, acceleration: 4 } }, { tasks: [t('wins', 2)], boost: { speed: 3, acceleration: 3, control: 2 } }] },
  { id: 'goleador', name: 'Instinto goleador', blurb: 'Definición y control para los que pisan el área.', cost: 2000,
    req: { text: 'Medio o delantero · valoración 79 o menos', maxOvr: 79, groups: ['MID', 'FWD'] },
    levels: [{ tasks: [t('goals', 4)], boost: { shooting: 3, control: 2 } }, { tasks: [t('wins', 2)], boost: { shooting: 3, acceleration: 2 } }, { tasks: [t('goals', 6)], boost: { shooting: 2, control: 2 }, skill: 1 }] },
  { id: 'muro', name: 'Muro defensivo', blurb: 'Marca, anticipación y pulmones.', cost: 1500,
    req: { text: 'Defensa o medio · valoración 76 o menos', maxOvr: 76, groups: ['DEF', 'MID'] },
    levels: [{ tasks: [t('matches', 2)], boost: { defending: 3, stamina: 2 } }, { tasks: [t('cleanSheets', 1)], boost: { defending: 3, speed: 2 } }, { tasks: [t('wins', 3)], boost: { defending: 2, passing: 2, stamina: 2 } }] },
  { id: 'manos', name: 'Manos seguras', blurb: 'Reflejos y colocación para tu portero.', cost: 1500,
    req: { text: 'Portero · valoración 78 o menos', maxOvr: 78, groups: ['GK'] },
    levels: [{ tasks: [t('matches', 2)], boost: { goalkeeping: 3 } }, { tasks: [t('cleanSheets', 2)], boost: { goalkeeping: 4, passing: 2 } }] },
  { id: 'joya', name: 'Joya juvenil', blurb: 'Un juvenil que crece partido a partido.', cost: 3000,
    req: { text: '22 años o menos · valoración 74 o menos', maxOvr: 74, maxAge: 22 },
    levels: [{ tasks: [t('matches', 3)], boost: all(2) }, { tasks: [t('wins', 3)], boost: all(2) }, { tasks: [t('matches', 5), t('goals', 8)], boost: all(3), skill: 1 }] },
  { id: 'bronce', name: 'De bronce a oro', blurb: 'Convierte una carta de bronce en una de oro.', cost: 800,
    req: { text: 'Carta de bronce · valoración 64 o menos', maxOvr: 64, rarities: ['bronze'] },
    levels: [{ tasks: [t('matches', 2)], boost: all(3) }, { tasks: [t('wins', 2)], boost: all(3) }, { tasks: [t('matches', 4)], boost: all(4) }] },
];

export const evoById = (id: string) => EVOS.find((e) => e.id === id);

/** Atributos sumados por los primeros `level` niveles de una evolución. */
export function evoBoost(e: EvoDef, level: number): PlayerAttributes {
  const out: PlayerAttributes = { speed: 0, acceleration: 0, passing: 0, shooting: 0, control: 0, defending: 0, stamina: 0, goalkeeping: 0 };
  for (const l of e.levels.slice(0, level)) for (const [k, v] of Object.entries(l.boost)) out[k as keyof PlayerAttributes] += v ?? 0;
  return out;
}
