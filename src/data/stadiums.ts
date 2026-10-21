import type { StadiumData } from './types';
import { EXTRA_LEAGUES } from './leagues/index';

const BASE_STADIUMS: StadiumData[] = [
  { id: 'coliseo', name: 'Coliseo Aurora', capacity: 62000, timeOfDay: 'night', standColor: '#2a2f3a', roofColor: '#c9ced8', grassHue: 0.29 },
  { id: 'brasero', name: 'Estadio El Brasero', capacity: 48000, timeOfDay: 'sunset', standColor: '#4a2a22', roofColor: '#8a8f99', grassHue: 0.27 },
  { id: 'bahia', name: 'Arena Bahía', capacity: 35000, timeOfDay: 'day', standColor: '#1f3f66', roofColor: '#e8eef5', grassHue: 0.3 },
  { id: 'barrio', name: 'Cancha del Barrio', capacity: 9000, timeOfDay: 'day', standColor: '#5a4c40', roofColor: '#9aa0a8', grassHue: 0.25, small: true },
  { id: 'puerto', name: 'Estadio del Puerto', capacity: 41000, timeOfDay: 'night', standColor: '#1d2a30', roofColor: '#8d9aa3', grassHue: 0.31, fog: true },
  { id: 'monumental', name: 'Gran Monumental', capacity: 95000, timeOfDay: 'sunset', standColor: '#2b3550', roofColor: '#dfe4ec', grassHue: 0.29 },
  // Estadios de los clubes de la Liga Profesional (capacidad aproximada). look: techo, bandeja alta, butacas,
  // pista y palcos según la cancha real (aproximado con lo que permite el generador de estadios)
  // sedes neutrales de las finales de las copas de la UEFA (2026)
  { id: 'puskas-arena', name: 'Puskás Aréna', capacity: 67215, timeOfDay: 'night', standColor: '#2a3a5a', roofColor: '#cfd6de', grassHue: 0.28, look: { roof: 'ring', upper: 'both', seats: ['#2a5aa8', '#ffffff'] } },
  { id: 'besiktas-park', name: 'Beşiktaş Park', capacity: 42590, timeOfDay: 'night', standColor: '#1a1a1a', roofColor: '#cfd6de', grassHue: 0.28, look: { roof: 'ring', upper: 'both', seats: ['#111111', '#ffffff'] } },
  { id: 'leipzig-arena', name: 'Red Bull Arena Leipzig', capacity: 47069, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, look: { roof: 'ring', upper: 'both', seats: ['#d71920', '#ffffff'] } },
  // sedes neutrales de las finales de las copas de la CONMEBOL
  { id: 'centenario', name: 'Estadio Centenario', capacity: 60235, timeOfDay: 'night', standColor: '#3a2a2a', roofColor: '#cfd6de', grassHue: 0.28, look: { roof: 'none', upper: 'both', seats: ['#6cb4e4', '#ffffff'] } },
  { id: 'defensores-chaco', name: 'Defensores del Chaco', capacity: 42354, timeOfDay: 'night', standColor: '#2a3a5a', roofColor: '#cfd6de', grassHue: 0.28, look: { roof: 'sides', upper: 'both', seats: ['#c8102e', '#ffffff', '#0b2d6b'] } },
  { id: 'minella', name: 'José María Minella', capacity: 35000, timeOfDay: 'night', standColor: '#1d5a34', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'aldosivi', look: { roof: 'none', upper: 'none', track: '#b4573f', seats: ['#9aa0a8'] } },
  { id: 'maradona', name: 'Diego Armando Maradona', capacity: 26000, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'argentinos', look: { roof: 'none', upper: 'none', seats: ['#c8102e', '#ffffff'] } },
  { id: 'fierro', name: 'Monumental José Fierro', capacity: 35200, timeOfDay: 'night', standColor: '#3a6f96', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'atltucuman', look: { roof: 'none', upper: 'far', seats: ['#6cb4e4', '#ffffff'] } },
  { id: 'florencio-sola', name: 'Florencio Sola', capacity: 34900, timeOfDay: 'day', standColor: '#1d5a3a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'banfield', look: { roof: 'none', upper: 'none', seats: ['#00703c', '#ffffff'] } },
  { id: 'tapia', name: 'Claudio Chiqui Tapia', capacity: 4400, timeOfDay: 'day', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'barracas', look: { roof: 'none', upper: 'none', seats: ['#d0102a', '#ffffff'] }, small: true },
  { id: 'villagra', name: 'Julio César Villagra (El Gigante de Alberdi)', capacity: 28000, timeOfDay: 'day', standColor: '#4aa6dc', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'belgrano', show: true, look: { roof: 'none', upper: 'none', seats: ['#5db8e8', '#ffffff'] } },
  { id: 'bombonera', name: 'La Bombonera', capacity: 57200, timeOfDay: 'night', standColor: '#1a3a7a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'boca', look: { roof: 'none', upper: 'far', palcos: true, seats: ['#1a3a8a', '#f2b705'] } },
  { id: 'madre-ciudades', name: 'Madre de Ciudades', capacity: 30000, timeOfDay: 'night', standColor: '#2a2a2a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'centralcordoba', look: { roof: 'ring', upper: 'none', seats: ['#1c1c1c', '#ffffff', '#d0102a'] } },
  { id: 'tomaghello', name: 'Norberto Tomaghello', capacity: 18000, timeOfDay: 'day', standColor: '#2a6a34', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'defensa', look: { roof: 'none', upper: 'none', seats: ['#f7d417', '#0a7a3a'] }, small: true },
  { id: 'uno', name: 'Jorge Luis Hirschi (UNO)', capacity: 30000, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'estudiantes', look: { roof: 'ring', upper: 'none', seats: ['#d4111b', '#ffffff'] } },
  { id: 'candini', name: 'Antonio Candini', capacity: 15000, timeOfDay: 'day', standColor: '#2a6a9a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'estudiantesrc', look: { roof: 'none', upper: 'none', seats: ['#3a9ad9', '#ffffff'] }, small: true },
  { id: 'bosque', name: 'Juan Carmelo Zerillo (El Bosque)', capacity: 24500, timeOfDay: 'sunset', standColor: '#1a2a5a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'gimnasia', look: { roof: 'none', upper: 'none', seats: ['#0b2459', '#ffffff'] } },
  { id: 'legrotaglie', name: 'Víctor Legrotaglie', capacity: 11500, timeOfDay: 'day', standColor: '#2a2a2a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'gimnasiamza', look: { roof: 'none', upper: 'none', seats: ['#1c1c1c', '#ffffff'] }, small: true },
  { id: 'duco', name: 'Tomás Adolfo Ducó', capacity: 48300, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'huracan', look: { roof: 'none', upper: 'both', seats: ['#ffffff', '#d21f2b'] } },
  { id: 'libertadores', name: 'Libertadores de América', capacity: 42000, timeOfDay: 'night', standColor: '#9a1a1a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'independiente', look: { roof: 'ring', upper: 'both', seats: ['#cc0000'] } },
  { id: 'gargantini', name: 'Bautista Gargantini', capacity: 24000, timeOfDay: 'sunset', standColor: '#1a2a5a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'indrivadavia', look: { roof: 'none', upper: 'none', seats: ['#13235b', '#ffffff'] } },
  { id: 'alta-cordoba', name: 'Juan Domingo Perón (Alta Córdoba)', capacity: 26500, timeOfDay: 'day', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'instituto', look: { roof: 'none', upper: 'none', seats: ['#d0102a', '#ffffff'] } },
  { id: 'fortaleza', name: 'Ciudad de Lanús (La Fortaleza)', capacity: 47000, timeOfDay: 'night', standColor: '#5a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'lanus', look: { roof: 'none', upper: 'both', seats: ['#7b1a2c'] } },
  { id: 'coloso', name: 'Marcelo Bielsa (El Coloso del Parque)', capacity: 42000, timeOfDay: 'night', standColor: '#5a1a1a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'newells', look: { roof: 'sides', upper: 'both', seats: ['#c8102e', '#1c1c1c'] } },
  { id: 'vicente-lopez', name: 'Ciudad de Vicente López', capacity: 28500, timeOfDay: 'day', standColor: '#4a3020', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'platense', look: { roof: 'none', upper: 'none', seats: ['#5a3417', '#ffffff'] } },
  { id: 'cilindro', name: 'Presidente Perón (El Cilindro)', capacity: 55000, timeOfDay: 'night', standColor: '#3a7aa6', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'racing', look: { roof: 'none', upper: 'both', seats: ['#6cc3ee', '#ffffff'] } },
  { id: 'laza', name: 'Guillermo Laza', capacity: 3000, timeOfDay: 'day', standColor: '#2a2a2a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'riestra', look: { roof: 'none', upper: 'none', seats: ['#1c1c1c', '#ffffff'] }, small: true },
  { id: 'monumental-river', name: 'Más Monumental', capacity: 85000, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'river', look: { roof: 'none', upper: 'both', seats: ['#e31b23', '#ffffff'] } },
  { id: 'gigante-arroyito', name: 'Gigante de Arroyito', capacity: 41600, timeOfDay: 'night', standColor: '#1a3a7a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'rosariocentral', look: { roof: 'none', upper: 'both', seats: ['#0b2d6b', '#f5c400'] } },
  { id: 'bidegain', name: 'Pedro Bidegain (Nuevo Gasómetro)', capacity: 47900, timeOfDay: 'night', standColor: '#1a2a5a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'sanlorenzo', look: { roof: 'none', upper: 'both', seats: ['#0b2d6b', '#c8102e'] } },
  { id: 'eva-peron', name: 'Eva Perón', capacity: 22000, timeOfDay: 'day', standColor: '#1d5a34', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'sarmiento', look: { roof: 'none', upper: 'none', seats: ['#00813f', '#ffffff'] } },
  { id: 'kempes', name: 'Mario Alberto Kempes', capacity: 57000, timeOfDay: 'night', standColor: '#1a2a5a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'talleres', look: { roof: 'sides', upper: 'both', track: '#9a4a3a', seats: ['#0b2d6b', '#ffffff'] } },
  { id: 'dellagiovanna', name: 'José Dellagiovanna', capacity: 26300, timeOfDay: 'sunset', standColor: '#1a3a7a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'tigre', look: { roof: 'none', upper: 'none', seats: ['#1a3e8f', '#c8102e'] } },
  { id: 'quince-abril', name: '15 de Abril', capacity: 22800, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'union', look: { roof: 'none', upper: 'none', seats: ['#d0102a', '#ffffff'] } },
  { id: 'amalfitani', name: 'José Amalfitani', capacity: 49500, timeOfDay: 'night', standColor: '#1a3a7a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'velez', look: { roof: 'sides', upper: 'both', seats: ['#1a4fa0', '#ffffff'] } },
];

/** Estadios de todas las ligas: los de la Liga Profesional van primero y los de las demás ligas después. */
export const STADIUMS: StadiumData[] = [...BASE_STADIUMS, ...Object.values(EXTRA_LEAGUES).flatMap((l) => l.stadiums)];

/** Estadios genéricos (sin club propio): los que se reparten entre los demás equipos. */
export const GENERIC_STADIUMS = STADIUMS.filter((s) => !s.homeTeam);

/** Estadio donde juega de local un equipo (el suyo si lo tiene; si no, uno genérico por su posición en la lista). */
export function stadiumForHome(teamId: string, teamIndex: number): StadiumData {
  return STADIUMS.find((s) => s.homeTeam === teamId) ?? GENERIC_STADIUMS[Math.abs(teamIndex) % GENERIC_STADIUMS.length];
}

export function getStadium(id: string): StadiumData {
  return STADIUMS.find((s) => s.id === id) ?? STADIUMS[0];
}
