// Apex Grand Prix — datos del campeonato. Todo el contenido (equipos, pilotos, circuitos) es ficticio.

export interface Team {
  name: string;
  short: string;
  /** colores de la decoración: principal, secundario, acento */
  c: [number, number, number];
  /** rendimiento del coche (1 = referencia) */
  perf: number;
}

export interface Driver {
  name: string;
  tla: string;
  num: number;
  team: number;
  /** habilidad 0..1 */
  skill: number;
  helmet: number;
}

export const TEAMS: Team[] = [
  { name: 'Aurora Motorsport', short: 'Aurora', c: [0x00b8a0, 0x0b1a24, 0xf2f2f2], perf: 1.0 },
  { name: 'Kestrel Racing', short: 'Kestrel', c: [0x6a2bd9, 0xe8b923, 0x14101f], perf: 0.998 },
  { name: 'Volta Engineering', short: 'Volta', c: [0xf5d000, 0x151515, 0xffffff], perf: 0.996 },
  { name: 'Titan Works', short: 'Titan', c: [0x3b4350, 0xd92332, 0xc9ced6], perf: 0.994 },
  { name: 'Cobalt Dynamics', short: 'Cobalt', c: [0x1548c8, 0xff7a1a, 0xffffff], perf: 0.991 },
  { name: 'Sierra Corse', short: 'Sierra', c: [0x0f5c3a, 0xf0e6c8, 0xc8a24a], perf: 0.989 },
  { name: 'Mirage Racing', short: 'Mirage', c: [0xd81b7a, 0x131a3a, 0x7fd4ff], perf: 0.987 },
  { name: 'Borealis GP', short: 'Borealis', c: [0x9fd8f0, 0xffffff, 0x1c3d6e], perf: 0.985 },
  { name: 'Nova Autosport', short: 'Nova', c: [0xf4f4f4, 0xe2401c, 0x202020], perf: 0.983 },
  { name: 'Onyx Performance', short: 'Onyx', c: [0x101010, 0x9be000, 0x4a4a4a], perf: 0.981 },
  { name: 'Zenith Grand Prix', short: 'Zenith', c: [0x7a1230, 0xbfc4cc, 0x1a1a1a], perf: 0.979 },
];

const D = (name: string, tla: string, num: number, team: number, skill: number, helmet: number): Driver => ({ name, tla, num, team, skill, helmet });
export const DRIVERS: Driver[] = [
  D('Mateo Rivas', 'RIV', 7, 0, 0.98, 0xffd000), D('Nils Bergström', 'BER', 21, 0, 0.9, 0x2255ff),
  D('Oliver Hartwell', 'HAR', 4, 1, 0.97, 0xff3300), D('Kenji Arakawa', 'ARA', 36, 1, 0.91, 0xffffff),
  D('Dario Conti', 'CON', 12, 2, 0.95, 0x00aa55), D('Émile Laurent', 'LAU', 9, 2, 0.92, 0x0033aa),
  D('Jack Mercer', 'MER', 45, 3, 0.94, 0xff8800), D('Ravi Anand', 'ANA', 18, 3, 0.9, 0x00cccc),
  D('Felipe Duarte', 'DUA', 27, 4, 0.93, 0x118833), D('Hugo Lindqvist', 'LIN', 8, 4, 0.89, 0xeeee22),
  D('Tomás Quiroga', 'QUI', 33, 5, 0.94, 0x66bbff), D('Sam Okafor', 'OKA', 51, 5, 0.88, 0x22aa22),
  D('Theo van Rijn', 'RIJ', 14, 6, 0.92, 0xff6600), D('Ivan Sokolov', 'SOK', 60, 6, 0.87, 0xcc0000),
  D('Yuto Hayashi', 'HAY', 23, 7, 0.91, 0xff2255), D('Marco Bellini', 'BEL', 5, 7, 0.88, 0x117733),
  D('Leon Weiss', 'WEI', 30, 8, 0.9, 0x111111), D('Diego Santamaría', 'SAN', 77, 8, 0.89, 0xffcc00),
  D('Aleks Novak', 'NOV', 19, 9, 0.9, 0x8833cc), D('Finn Callahan', 'CAL', 41, 9, 0.86, 0x22cc88),
  D('Bruno Teixeira', 'TEI', 10, 10, 0.89, 0xffee00), D('Luca Ferrand', 'FER', 66, 10, 0.85, 0x3366ff),
];

// ---------------------------------------------------------------- neumáticos
export type Compound = 'S' | 'M' | 'H' | 'I' | 'W';
export interface Tyre {
  name: string;
  color: number;
  /** agarre relativo en seco */
  grip: number;
  /** fracción de la distancia de carrera hasta llegar al "cliff" de desgaste */
  life: number;
}
export const TYRES: Record<Compound, Tyre> = {
  S: { name: 'Blando', color: 0xe8262a, grip: 1.035, life: 0.3 },
  M: { name: 'Medio', color: 0xf2d21b, grip: 1.015, life: 0.5 },
  H: { name: 'Duro', color: 0xf0f0f0, grip: 1.0, life: 0.75 },
  I: { name: 'Intermedio', color: 0x2fb344, grip: 0.9, life: 0.6 },
  W: { name: 'Lluvia', color: 0x2a6fe0, grip: 0.85, life: 0.8 },
};
export const WEAR_CLIFF = 0.75;
export const isSlick = (c: Compound) => c === 'S' || c === 'M' || c === 'H';

/** Agarre del compuesto según desgaste (0..1+), temperatura (0..1) y humedad de pista (0..1). */
export function tyreGrip(c: Compound, wear: number, temp: number, wet: number): number {
  let g: number;
  if (isSlick(c)) g = TYRES[c].grip * (1 - 0.6 * Math.min(1, wet / 0.6) ** 0.8);
  else if (c === 'I') g = 0.9 - 0.3 * Math.max(0, (wet - 0.65) / 0.35);
  else g = 0.8 + 0.05 * Math.min(1, wet / 0.5);
  const w = Math.min(wear, 1.2);
  g *= 1 - 0.05 * w - 0.25 * Math.max(0, (w - WEAR_CLIFF) / (1 - WEAR_CLIFF));
  return g * (0.93 + 0.07 * temp);
}

// ---------------------------------------------------------------- circuitos
export type Theme = 'green' | 'desert' | 'street' | 'nordic';
export interface TrackDef {
  name: string;
  place: string;
  theme: Theme;
  /** vueltas de un Gran Premio completo */
  laps: number;
  sprint?: boolean;
  /** probabilidad de lluvia */
  rain: number;
  /** vértices "x,y,r" en decámetros (r = radio de curva en metros); el primer tramo es la recta principal */
  pts: string;
}

export const TRACKS: TrackDef[] = [
  { name: 'Circuito Bahía Coral', place: 'Costa Coral', theme: 'green', laps: 58, rain: 0.15, pts: '-20,0,50;80,0,45;90,22,30;68,30,25;62,52,60;30,58,40;24,36,30;2,40,35;-22,24,50' },
  { name: 'Autódromo Sierra Alta', place: 'Sierra Alta', theme: 'green', laps: 62, sprint: true, rain: 0.25, pts: '-10,0,40;60,0,30;66,14,20;50,20,25;52,34,25;74,38,30;78,56,35;50,64,60;20,52,40;24,34,25;6,28,25;0,44,25;-16,42,30;-22,16,50' },
  { name: 'Ronda del Desierto', place: 'Oasis de Sal', theme: 'desert', laps: 55, rain: 0.02, pts: '-30,0,35;80,0,30;86,10,25;76,18,25;84,40,40;60,52,50;-10,46,30;-14,34,25;30,28,30;32,16,25;-28,14,30' },
  { name: 'Parque Lago Azul', place: 'Lago Azul', theme: 'green', laps: 52, rain: 0.3, pts: '-25,0,80;70,0,90;95,30,120;70,62,100;20,56,150;-10,70,60;-40,50,90;-45,15,100' },
  { name: 'Circuito Puerto Viejo', place: 'Puerto Viejo', theme: 'street', laps: 70, rain: 0.2, pts: '-15,0,20;55,0,18;55,18,18;38,18,15;38,32,15;62,32,18;62,50,20;20,50,18;20,36,15;4,36,15;4,50,18;-15,50,20' },
  { name: 'Anillo del Norte', place: 'Llanura Norte', theme: 'green', laps: 50, sprint: true, rain: 0.2, pts: '-40,0,90;80,0,90;100,30,110;80,60,90;30,60,30;26,54,25;18,60,30;-40,60,90;-60,30,110' },
  { name: 'Autódromo Los Pinos', place: 'Valle de Pinos', theme: 'green', laps: 60, rain: 0.35, pts: '-20,0,45;60,0,40;72,16,40;58,30,35;70,44,35;54,58,45;34,48,35;18,60,40;-4,50,35;4,32,35;-18,26,40;-30,10,40' },
  { name: 'Circuito Meseta', place: 'Meseta Central', theme: 'desert', laps: 54, rain: 0.08, pts: '-30,0,60;70,0,25;74,8,22;66,14,25;20,14,30;16,26,30;76,30,45;84,50,50;60,62,60;-20,58,70;-44,36,80;-40,10,50' },
  { name: 'Gran Vía Internacional', place: 'Ciudad Capital', theme: 'street', laps: 64, sprint: true, rain: 0.2, pts: '-10,0,25;70,0,22;70,22,22;90,22,20;90,48,25;64,48,20;64,34,18;44,34,18;44,56,25;10,56,25;10,30,20;-10,30,22' },
  { name: 'Circuito Isla Verde', place: 'Isla Verde', theme: 'green', laps: 56, rain: 0.4, pts: '-25,0,55;55,0,50;75,15,45;70,38,40;85,52,40;68,68,50;40,56,45;10,66,50;-15,50,45;-5,30,40;-30,22,45' },
  { name: 'Autódromo del Sol', place: 'Villa del Sol', theme: 'green', laps: 60, rain: 0.1, pts: '-20,0,35;75,0,35;80,16,25;62,22,22;64,36,22;82,40,25;80,58,35;30,60,50;22,44,25;34,34,22;28,22,22;6,24,25;2,44,25;-18,46,30;-26,20,45' },
  { name: 'Circuito Monte Roca', place: 'Monte Roca', theme: 'nordic', laps: 72, rain: 0.3, pts: '-13,0,30;65,0,26;73,13,22;57,21,22;62,36,24;81,39,24;83,57,26;57,65,30;39,52,24;23,62,24;5,52,24;13,31,24;-10,26,26;-18,10,26' },
  { name: 'Parque Imperial', place: 'Bosque Imperial', theme: 'green', laps: 51, sprint: true, rain: 0.2, pts: '-35,0,45;75,0,28;79,7,22;86,9,22;92,30,60;70,50,60;-20,50,28;-24,43,22;-32,43,22;-46,28,60' },
  { name: 'Circuito Río Plata', place: 'Río Plata', theme: 'green', laps: 61, rain: 0.25, pts: '-20,0,40;65,0,35;78,12,35;76,34,50;56,44,30;50,32,25;36,30,25;30,48,30;46,60,30;30,70,35;-5,62,40;-12,40,30;8,30,25;4,16,25;-22,18,30' },
  { name: 'Autódromo Las Dunas', place: 'Las Dunas', theme: 'desert', laps: 56, sprint: true, rain: 0.02, pts: '-30,0,70;60,0,60;85,20,70;80,45,35;60,48,30;55,30,30;35,28,35;30,55,50;0,65,60;-30,50,22;-18,38,22;-40,24,60' },
  { name: 'Circuito Cañón Rojo', place: 'Cañón Rojo', theme: 'desert', laps: 53, rain: 0.05, pts: '-25,0,30;85,0,28;90,12,25;60,24,30;62,38,25;92,44,30;88,60,30;10,56,35;4,42,25;30,34,25;26,20,25;-28,22,30' },
  { name: 'Circuito Estrella Polar', place: 'Fiordo Blanco', theme: 'nordic', laps: 57, sprint: true, rain: 0.35, pts: '-30,0,60;50,0,55;70,18,50;55,36,45;72,52,50;50,68,55;15,58,60;-5,70,45;-30,58,50;-20,38,40;-45,25,50' },
  { name: 'Autódromo Fin del Mundo', place: 'Cabo Austral', theme: 'nordic', laps: 55, rain: 0.3, pts: '-35,0,40;80,0,30;86,12,25;70,20,25;74,36,35;96,40,35;94,62,40;60,66,50;40,50,30;20,62,35;-10,58,40;-16,38,25;6,32,22;2,18,22;-30,20,30;-42,8,30' },
];

export const POINTS_RACE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const POINTS_SPRINT = [8, 7, 6, 5, 4, 3, 2, 1];

export const DIFFICULTY = [
  { name: 'Novato', pace: 0.9 },
  { name: 'Amateur', pace: 0.94 },
  { name: 'Profesional', pace: 0.97 },
  { name: 'Leyenda', pace: 1.0 },
];
