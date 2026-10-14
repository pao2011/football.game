import type { StadiumData } from './types';

export const STADIUMS: StadiumData[] = [
  { id: 'coliseo', name: 'Coliseo Aurora', capacity: 62000, timeOfDay: 'night', standColor: '#2a2f3a', roofColor: '#c9ced8', grassHue: 0.29 },
  { id: 'brasero', name: 'Estadio El Brasero', capacity: 48000, timeOfDay: 'sunset', standColor: '#4a2a22', roofColor: '#8a8f99', grassHue: 0.27 },
  { id: 'bahia', name: 'Arena Bahía', capacity: 35000, timeOfDay: 'day', standColor: '#1f3f66', roofColor: '#e8eef5', grassHue: 0.3 },
];

export function getStadium(id: string): StadiumData {
  return STADIUMS.find((s) => s.id === id) ?? STADIUMS[0];
}
