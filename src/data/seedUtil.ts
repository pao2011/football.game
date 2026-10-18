import type { KitData, StadiumData, TeamData } from './types';
import type { TeamSeed } from './teams';
import { CRESTS } from './crests';

/** Equipación: camiseta, color secundario, diseño, pantalón, medias y dorsal. */
export const kit = (shirt: string, shirt2: string, pattern: KitData['pattern'], shorts: string, socks: string, number: string): KitData => ({ shirt, shirt2, pattern, shorts, socks, number });

/** Escudo: la imagen src/assets/crests/<id>.webp si existe; si no, un escudo dibujado con los colores del club. */
export const crest = (id: string, primary: string, secondary: string, shape: TeamData['crest']['shape'] = 'shield', symbol: TeamData['crest']['symbol'] = 'none'): TeamData['crest'] =>
  CRESTS[id] ? { shape, primary, secondary, symbol: 'none', image: CRESTS[id] } : { shape, primary, secondary, symbol };

export const GK_YELLOW = kit('#e8ff3a', '#a8c800', 'solid', '#1a1a1a', '#e8ff3a', '#1a1a1a');
export const GK_ORANGE = kit('#ff7a1a', '#c45200', 'solid', '#2a1200', '#ff7a1a', '#2a1200');
export const GK_GREEN = kit('#1fd18a', '#0f8a5a', 'solid', '#0f3a2a', '#1fd18a', '#0f3a2a');
export const GK_PURPLE = kit('#8a2be2', '#5a1aa0', 'solid', '#1a0a30', '#8a2be2', '#ffffff');
export const GK_BLACK = kit('#1a1a1a', '#3a3a3a', 'solid', '#1a1a1a', '#1a1a1a', '#ffffff');

/** Estadio de un club: look aproximado de la cancha real (techo, bandejas altas, butacas). */
export const stadium = (id: string, name: string, capacity: number, homeTeam: string, o: Partial<StadiumData> & { seats?: string[] } = {}): StadiumData => {
  const { seats, ...rest } = o;
  return {
    id, name, capacity, homeTeam, timeOfDay: 'night', standColor: '#2a2f3a', roofColor: '#cfd6de', grassHue: 0.28,
    look: { roof: 'none', upper: capacity > 30000 ? 'both' : 'none', seats: seats ?? ['#8a8f99'] },
    small: capacity < 12000, ...rest,
  };
};

/** Un clásico de otra liga (los de la Liga Profesional están en classics.ts). */
export interface ClassicDef {
  a: string;
  b: string;
  name: string;
}

/** Lo que aporta cada liga: equipos con su plantilla real, estadios y clásicos. */
export interface LeagueData {
  teams: TeamSeed[];
  stadiums: StadiumData[];
  classics: ClassicDef[];
}
