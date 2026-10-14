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
  pattern: 'solid' | 'gradient' | 'stripes' | 'hoops' | 'sash';
  shorts: string;
  socks: string;
  number: string; // color del dorsal
}

export interface TeamData {
  id: string;
  name: string;
  short: string; // abreviatura de 3 letras
  city: string;
  crest: { shape: 'shield' | 'circle' | 'diamond'; primary: string; secondary: string; symbol: 'star' | 'ball' | 'lion' | 'wave' | 'bolt' | 'crown' | 'tower' | 'eagle' };
  home: KitData;
  away: KitData;
  gkKit: KitData;
  formation: FormationId;
  rating: number; // media orientativa 0..100
  players: PlayerData[]; // 11 titulares + suplentes (titulares = primeros 11)
}

export type FormationId = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2';

export type Difficulty = 'amateur' | 'pro' | 'world' | 'legend';

export interface StadiumData {
  id: string;
  name: string;
  capacity: number;
  timeOfDay: 'day' | 'sunset' | 'night';
  standColor: string;
  roofColor: string;
  grassHue: number;
}
