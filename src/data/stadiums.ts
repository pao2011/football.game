import type { StadiumData } from './types';

export const STADIUMS: StadiumData[] = [
  { id: 'coliseo', name: 'Coliseo Aurora', capacity: 62000, timeOfDay: 'night', standColor: '#2a2f3a', roofColor: '#c9ced8', grassHue: 0.29 },
  { id: 'brasero', name: 'Estadio El Brasero', capacity: 48000, timeOfDay: 'sunset', standColor: '#4a2a22', roofColor: '#8a8f99', grassHue: 0.27 },
  { id: 'bahia', name: 'Arena Bahía', capacity: 35000, timeOfDay: 'day', standColor: '#1f3f66', roofColor: '#e8eef5', grassHue: 0.3 },
  { id: 'barrio', name: 'Cancha del Barrio', capacity: 9000, timeOfDay: 'day', standColor: '#5a4c40', roofColor: '#9aa0a8', grassHue: 0.25, small: true },
  { id: 'puerto', name: 'Estadio del Puerto', capacity: 41000, timeOfDay: 'night', standColor: '#1d2a30', roofColor: '#8d9aa3', grassHue: 0.31, fog: true },
  { id: 'monumental', name: 'Gran Monumental', capacity: 95000, timeOfDay: 'sunset', standColor: '#2b3550', roofColor: '#dfe4ec', grassHue: 0.29 },
];

export function getStadium(id: string): StadiumData {
  return STADIUMS.find((s) => s.id === id) ?? STADIUMS[0];
}
