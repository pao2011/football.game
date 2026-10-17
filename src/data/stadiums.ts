import type { StadiumData } from './types';

export const STADIUMS: StadiumData[] = [
  { id: 'coliseo', name: 'Coliseo Aurora', capacity: 62000, timeOfDay: 'night', standColor: '#2a2f3a', roofColor: '#c9ced8', grassHue: 0.29 },
  { id: 'brasero', name: 'Estadio El Brasero', capacity: 48000, timeOfDay: 'sunset', standColor: '#4a2a22', roofColor: '#8a8f99', grassHue: 0.27 },
  { id: 'bahia', name: 'Arena Bahía', capacity: 35000, timeOfDay: 'day', standColor: '#1f3f66', roofColor: '#e8eef5', grassHue: 0.3 },
  { id: 'barrio', name: 'Cancha del Barrio', capacity: 9000, timeOfDay: 'day', standColor: '#5a4c40', roofColor: '#9aa0a8', grassHue: 0.25, small: true },
  { id: 'puerto', name: 'Estadio del Puerto', capacity: 41000, timeOfDay: 'night', standColor: '#1d2a30', roofColor: '#8d9aa3', grassHue: 0.31, fog: true },
  { id: 'monumental', name: 'Gran Monumental', capacity: 95000, timeOfDay: 'sunset', standColor: '#2b3550', roofColor: '#dfe4ec', grassHue: 0.29 },
  // Estadios de los clubes de la Liga Profesional (capacidad aproximada; tribunas con el color del club)
  { id: 'minella', name: 'José María Minella', capacity: 35000, timeOfDay: 'night', standColor: '#1d5a34', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'aldosivi' },
  { id: 'maradona', name: 'Diego Armando Maradona', capacity: 26000, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'argentinos' },
  { id: 'fierro', name: 'Monumental José Fierro', capacity: 35200, timeOfDay: 'night', standColor: '#3a6f96', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'atltucuman' },
  { id: 'florencio-sola', name: 'Florencio Sola', capacity: 34900, timeOfDay: 'day', standColor: '#1d5a3a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'banfield' },
  { id: 'tapia', name: 'Claudio Chiqui Tapia', capacity: 4400, timeOfDay: 'day', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'barracas', small: true },
  { id: 'villagra', name: 'Julio César Villagra (El Gigante de Alberdi)', capacity: 28000, timeOfDay: 'day', standColor: '#4aa6dc', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'belgrano' },
  { id: 'bombonera', name: 'La Bombonera', capacity: 57200, timeOfDay: 'night', standColor: '#1a3a7a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'boca' },
  { id: 'madre-ciudades', name: 'Madre de Ciudades', capacity: 30000, timeOfDay: 'night', standColor: '#2a2a2a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'centralcordoba' },
  { id: 'tomaghello', name: 'Norberto Tomaghello', capacity: 18000, timeOfDay: 'day', standColor: '#2a6a34', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'defensa', small: true },
  { id: 'uno', name: 'Jorge Luis Hirschi (UNO)', capacity: 30000, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'estudiantes' },
  { id: 'candini', name: 'Antonio Candini', capacity: 15000, timeOfDay: 'day', standColor: '#2a6a9a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'estudiantesrc', small: true },
  { id: 'bosque', name: 'Juan Carmelo Zerillo (El Bosque)', capacity: 24500, timeOfDay: 'sunset', standColor: '#1a2a5a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'gimnasia' },
  { id: 'legrotaglie', name: 'Víctor Legrotaglie', capacity: 11500, timeOfDay: 'day', standColor: '#2a2a2a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'gimnasiamza', small: true },
  { id: 'duco', name: 'Tomás Adolfo Ducó', capacity: 48300, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'huracan' },
  { id: 'libertadores', name: 'Libertadores de América', capacity: 42000, timeOfDay: 'night', standColor: '#9a1a1a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'independiente' },
  { id: 'gargantini', name: 'Bautista Gargantini', capacity: 24000, timeOfDay: 'sunset', standColor: '#1a2a5a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'indrivadavia' },
  { id: 'alta-cordoba', name: 'Juan Domingo Perón (Alta Córdoba)', capacity: 26500, timeOfDay: 'day', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'instituto' },
  { id: 'fortaleza', name: 'Ciudad de Lanús (La Fortaleza)', capacity: 47000, timeOfDay: 'night', standColor: '#5a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'lanus' },
  { id: 'coloso', name: 'Marcelo Bielsa (El Coloso del Parque)', capacity: 42000, timeOfDay: 'night', standColor: '#5a1a1a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'newells' },
  { id: 'vicente-lopez', name: 'Ciudad de Vicente López', capacity: 28500, timeOfDay: 'day', standColor: '#4a3020', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'platense' },
  { id: 'cilindro', name: 'Presidente Perón (El Cilindro)', capacity: 55000, timeOfDay: 'night', standColor: '#3a7aa6', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'racing' },
  { id: 'laza', name: 'Guillermo Laza', capacity: 3000, timeOfDay: 'day', standColor: '#2a2a2a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'riestra', small: true },
  { id: 'monumental-river', name: 'Más Monumental', capacity: 85000, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'river' },
  { id: 'gigante-arroyito', name: 'Gigante de Arroyito', capacity: 41600, timeOfDay: 'night', standColor: '#1a3a7a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'rosariocentral' },
  { id: 'bidegain', name: 'Pedro Bidegain (Nuevo Gasómetro)', capacity: 47900, timeOfDay: 'night', standColor: '#1a2a5a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'sanlorenzo' },
  { id: 'eva-peron', name: 'Eva Perón', capacity: 22000, timeOfDay: 'day', standColor: '#1d5a34', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'sarmiento' },
  { id: 'kempes', name: 'Mario Alberto Kempes', capacity: 57000, timeOfDay: 'night', standColor: '#1a2a5a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'talleres' },
  { id: 'dellagiovanna', name: 'José Dellagiovanna', capacity: 26300, timeOfDay: 'sunset', standColor: '#1a3a7a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'tigre' },
  { id: 'quince-abril', name: '15 de Abril', capacity: 22800, timeOfDay: 'night', standColor: '#8a1a24', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'union' },
  { id: 'amalfitani', name: 'José Amalfitani', capacity: 49500, timeOfDay: 'night', standColor: '#1a3a7a', roofColor: '#cfd6de', grassHue: 0.28, homeTeam: 'velez' },
];

/** Estadios genéricos (sin club propio): los que se reparten entre los demás equipos. */
export const GENERIC_STADIUMS = STADIUMS.filter((s) => !s.homeTeam);

/** Estadio donde juega de local un equipo (el suyo si lo tiene; si no, uno genérico por su posición en la lista). */
export function stadiumForHome(teamId: string, teamIndex: number): StadiumData {
  return STADIUMS.find((s) => s.homeTeam === teamId) ?? GENERIC_STADIUMS[Math.abs(teamIndex) % GENERIC_STADIUMS.length];
}

export function getStadium(id: string): StadiumData {
  return STADIUMS.find((s) => s.id === id) ?? STADIUMS[0];
}
