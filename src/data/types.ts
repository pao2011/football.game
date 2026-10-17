export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface PlayerAttributes {
  speed: number; // 0..100
  acceleration: number;
  passing: number;
  shooting: number;
  control: number; // control y regate
  defending: number;
  stamina: number;
  goalkeeping: number;
}

export interface PlayerData {
  id: string;
  name: string;
  number: number;
  position: Position;
  attrs: PlayerAttributes;
  skinTone: number; // 0..1
  hairColor: string;
  hairStyle: number; // 0..3
  height: number; // metros
}

export interface KitData {
  shirt: string; // color principal
  shirt2: string; // color secundario (degradado / mangas)
  /** band: franja horizontal en el pecho (Boca, Gimnasia) · halves: mitades verticales (Newell's) · vee: V en el pecho (Vélez). */
  pattern: 'solid' | 'gradient' | 'stripes' | 'hoops' | 'sash' | 'band' | 'halves' | 'vee';
  shorts: string;
  socks: string;
  number: string; // color del dorsal
}

export interface TeamData {
  id: string;
  name: string;
  short: string; // abreviatura de 3 letras
  city: string;
  crest: { shape: 'shield' | 'circle' | 'diamond'; primary: string; secondary: string; symbol: 'star' | 'ball' | 'lion' | 'wave' | 'bolt' | 'crown' | 'tower' | 'eagle' | 'none';
    /** Rayas verticales (primario/secundario) en vez del degradado, con las siglas en azul oscuro. */
    stripes?: boolean;
    /** Escudo oficial como imagen (URL); si está, sustituye al dibujado. */
    image?: string };
  home: KitData;
  away: KitData;
  gkKit: KitData;
  formation: FormationId;
  rating: number; // media orientativa 0..100
  players: PlayerData[]; // 11 titulares + suplentes (titulares = primeros 11)
}

export type FormationId = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2';

export type Difficulty = 'amateur' | 'pro' | 'world' | 'legend';

export interface StadiumLook {
  /** Techo: anillo completo, solo sobre las plateas laterales o ninguno (torres de luz). */
  roof?: 'ring' | 'sides' | 'none';
  /** Bandeja alta: en los dos laterales, solo en el de enfrente de la cámara, solo en el de la cámara o ninguna. */
  upper?: 'both' | 'far' | 'near' | 'none';
  /** Colores de las butacas: se alternan por sectores alrededor de la cancha. */
  seats?: string[];
  /** Pista de atletismo alrededor del campo (color del tartán). */
  track?: string;
  /** Lateral recto y vertical de palcos (La Bombonera), del lado de la cámara principal. */
  palcos?: boolean;
}

export interface StadiumData {
  id: string;
  name: string;
  capacity: number;
  timeOfDay: 'day' | 'sunset' | 'night';
  standColor: string;
  roofColor: string;
  grassHue: number;
  /** Rasgos de la cancha real (si falta, el estadio estándar con techo y dos bandejas altas). */
  look?: StadiumLook;
  /** Estadio propio de un club: el torneo y la carrera lo usan cuando ese equipo juega de local. */
  homeTeam?: string;
  /** Estadio pequeño (sin grada alta ni techo, con torres de luz). */
  small?: boolean;
  /** Niebla densa (puerto de noche). */
  fog?: boolean;
}
