import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Primera División de Chile 2026 (16 clubes). Escudos aportados (src/assets/crests/cl_*.webp). Plantillas desde Transfermarkt.

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  { id: 'cl_ucatolica', name: 'Universidad Católica', short: 'UCA', city: 'Santiago', crest: crest('cl_ucatolica', '#1d4fa0', '#ffffff'),
    home: kit(W,'#1d4fa0','band','#1d4fa0',W,'#1d4fa0'), away: kit('#0e2a5e','#1d4fa0','solid','#0e2a5e','#0e2a5e',W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 74, seed: 3000 },
  { id: 'cl_colocolo', name: 'Colo-Colo', short: 'COL', city: 'Santiago', crest: crest('cl_colocolo', '#ffffff', '#111111'),
    home: kit(W,K,'solid',K,W,K), away: kit(K,W,'solid',K,K,W), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 75, seed: 3001 },
  { id: 'cl_udechile', name: 'Universidad de Chile', short: 'UCH', city: 'Santiago', crest: crest('cl_udechile', '#1b3f8f', '#d0102a'),
    home: kit('#1b3f8f','#d0102a','solid','#1b3f8f','#1b3f8f',W), away: kit(W,'#1b3f8f','solid',W,W,'#1b3f8f'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 74, seed: 3002 },
  { id: 'cl_ohiggins', name: "O'Higgins", short: 'OHI', city: 'Rancagua', crest: crest('cl_ohiggins', '#7ec8f0', '#1b3f8f'),
    home: kit('#7ec8f0',W,'solid','#7ec8f0','#7ec8f0','#1b3f8f'), away: kit('#1b3f8f','#7ec8f0','solid','#1b3f8f','#1b3f8f',W), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 70, seed: 3003 },
  { id: 'cl_coquimbo', name: 'Coquimbo Unido', short: 'COQ', city: 'Coquimbo', crest: crest('cl_coquimbo', '#f5c400', '#111111'),
    home: kit('#f5c400',K,'stripes',K,'#f5c400',K), away: kit(K,'#f5c400','solid',K,K,'#f5c400'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 73, seed: 3004 },
  { id: 'cl_audax', name: 'Audax Italiano', short: 'AUD', city: 'La Florida', crest: crest('cl_audax', '#0a7a3a', '#ffffff'),
    home: kit('#0a7a3a',W,'solid',W,'#0a7a3a',W), away: kit(W,'#0a7a3a','solid',W,W,'#0a7a3a'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 68, seed: 3005 },
  { id: 'cl_everton', name: 'Everton de Viña del Mar', short: 'EVE', city: 'Viña del Mar', crest: crest('cl_everton', '#f5c400', '#1b3f8f'),
    home: kit('#f5c400','#1b3f8f','solid','#1b3f8f','#f5c400','#1b3f8f'), away: kit('#1b3f8f','#f5c400','solid','#1b3f8f','#1b3f8f','#f5c400'), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 68, seed: 3006 },
  { id: 'cl_palestino', name: 'Palestino', short: 'PAL', city: 'Santiago', crest: crest('cl_palestino', '#0a7a3a', '#d0102a'),
    home: kit(W,'#0a7a3a','vee','#0a7a3a','#d0102a','#0a7a3a'), away: kit('#0a7a3a','#d0102a','solid','#0a7a3a','#0a7a3a',W), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 70, seed: 3007 },
  { id: 'cl_limache', name: 'Deportes Limache', short: 'LIM', city: 'Limache', crest: crest('cl_limache', '#f5c400', '#111111'),
    home: kit('#f5c400',K,'solid',K,'#f5c400',K), away: kit(K,'#f5c400','solid',K,K,'#f5c400'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 66, seed: 3008 },
  { id: 'cl_laserena', name: 'Deportes La Serena', short: 'DLS', city: 'La Serena', crest: crest('cl_laserena', '#d0102a', '#1b3f8f'),
    home: kit('#d0102a','#1b3f8f','halves','#1b3f8f','#d0102a',W), away: kit(W,'#d0102a','solid',W,W,'#d0102a'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 67, seed: 3009 },
  { id: 'cl_udeconcepcion', name: 'Universidad de Concepción', short: 'UDC', city: 'Concepción', crest: crest('cl_udeconcepcion', '#f5c400', '#1b3f8f'),
    home: kit('#f5c400','#1b3f8f','solid','#1b3f8f','#f5c400','#1b3f8f'), away: kit('#1b3f8f','#f5c400','solid','#1b3f8f','#1b3f8f','#f5c400'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 67, seed: 3010 },
  { id: 'cl_nublense', name: 'Ñublense', short: 'ÑUB', city: 'Chillán', crest: crest('cl_nublense', '#d0102a', '#ffffff'),
    home: kit('#d0102a',W,'solid','#d0102a','#d0102a',W), away: kit(W,'#d0102a','solid',W,W,'#d0102a'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 68, seed: 3011 },
  { id: 'cl_lacalera', name: 'Unión La Calera', short: 'ULC', city: 'La Calera', crest: crest('cl_lacalera', '#d0102a', '#ffffff'),
    home: kit('#d0102a',W,'solid',W,'#d0102a',W), away: kit(W,'#d0102a','solid',W,W,'#d0102a'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 66, seed: 3012 },
  { id: 'cl_huachipato', name: 'Huachipato', short: 'HUA', city: 'Talcahuano', crest: crest('cl_huachipato', '#111111', '#2a6fd0'),
    home: kit(K,'#2a6fd0','stripes',K,K,W), away: kit(W,K,'solid',W,W,K), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 69, seed: 3013 },
  { id: 'cl_cobresal', name: 'Cobresal', short: 'CSL', city: 'El Salvador', crest: crest('cl_cobresal', '#f27a1a', '#ffffff'),
    home: kit('#f27a1a',W,'solid','#f27a1a','#f27a1a',W), away: kit(K,'#f27a1a','solid',K,K,'#f27a1a'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 68, seed: 3014 },
  { id: 'cl_depconcepcion', name: 'Deportes Concepción', short: 'DCO', city: 'Concepción', crest: crest('cl_depconcepcion', '#6a1b9a', '#ffffff'),
    home: kit('#6a1b9a',W,'solid','#6a1b9a','#6a1b9a',W), away: kit(W,'#6a1b9a','solid',W,W,'#6a1b9a'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 65, seed: 3015 },
];

const stadiums: StadiumData[] = [
  stadium('cl_claro', 'Claro Arena - San Carlos de Apoquindo', 20249, 'cl_ucatolica', { seats: ['#1d4fa0','#ffffff'], standColor: '#1a3a7a', timeOfDay: 'day', look: { roof: 'ring', upper: 'none', seats: ['#1d4fa0', '#ffffff'] } }),
  stadium('cl_monumental', 'Monumental David Arellano', 43667, 'cl_colocolo', { seats: ['#ffffff','#111111'], standColor: '#2a2a2a', timeOfDay: 'night', look: { roof: 'sides', upper: 'both', seats: ['#ffffff', '#111111'] } }),
  stadium('cl_nacional', 'Nacional Julio Martínez Prádanos', 46190, 'cl_udechile', { seats: ['#1b3f8f','#d0102a'], standColor: '#1a2a5a', timeOfDay: 'night', look: { roof: 'none', upper: 'both', track: '#b4573f', seats: ['#1b3f8f', '#d0102a'] } }),
  stadium('cl_elteniente', 'El Teniente', 14450, 'cl_ohiggins', { seats: ['#7ec8f0','#ffffff'], standColor: '#3a6f96', timeOfDay: 'day' }),
  stadium('cl_sanchez', 'Francisco Sánchez Rumoroso', 17750, 'cl_coquimbo', { seats: ['#f5c400','#111111'], standColor: '#2a2a2a', timeOfDay: 'night' }),
  stadium('cl_bicentenario', 'Bicentenario de La Florida', 11367, 'cl_audax', { seats: ['#0a7a3a','#ffffff'], standColor: '#1d5a34', timeOfDay: 'day' }),
  stadium('cl_sausalito', 'Sausalito', 19200, 'cl_everton', { seats: ['#f5c400','#1b3f8f'], standColor: '#1a2a5a', timeOfDay: 'night', look: { roof: 'none', upper: 'none', track: '#b4573f', seats: ['#f5c400', '#1b3f8f'] } }),
  stadium('cl_cisterna', 'Municipal de La Cisterna', 8000, 'cl_palestino', { seats: ['#0a7a3a','#d0102a'], standColor: '#1d5a34', timeOfDay: 'day' }),
  stadium('cl_limache', 'Lucio Fariña Fernández', 7265, 'cl_limache', { seats: ['#f5c400','#111111'], standColor: '#2a2a2a', timeOfDay: 'day' }),
  stadium('cl_laportada', 'La Portada', 17134, 'cl_laserena', { seats: ['#d0102a','#1b3f8f'], standColor: '#5a1a24', timeOfDay: 'night' }),
  stadium('cl_esterroa', 'Ester Roa Rebolledo', 30448, 'cl_udeconcepcion', { seats: ['#f5c400','#1b3f8f'], standColor: '#1a2a5a', timeOfDay: 'day', look: { roof: 'none', upper: 'both', track: '#b4573f', seats: ['#f5c400', '#1b3f8f'] } }),
  stadium('cl_nelsonoyarzun', 'Nelson Oyarzún', 11319, 'cl_nublense', { seats: ['#d0102a','#ffffff'], standColor: '#8a1a24', timeOfDay: 'day' }),
  stadium('cl_chahuan', 'Nicolás Chahuán Nazar', 9200, 'cl_lacalera', { seats: ['#d0102a','#ffffff'], standColor: '#8a1a24', timeOfDay: 'day' }),
  stadium('cl_cap', 'Huachipato-CAP Acero', 10032, 'cl_huachipato', { seats: ['#111111','#2a6fd0'], standColor: '#1d2a30', timeOfDay: 'day' }),
  stadium('cl_elcobre', 'El Cobre', 11240, 'cl_cobresal', { seats: ['#f27a1a','#ffffff'], standColor: '#4a2a22', timeOfDay: 'day' }),
  stadium('cl_esterroa2', 'Ester Roa Rebolledo', 30448, 'cl_depconcepcion', { seats: ['#6a1b9a','#ffffff'], standColor: '#3a1a5a', timeOfDay: 'day', look: { roof: 'none', upper: 'both', track: '#b4573f', seats: ['#6a1b9a', '#ffffff'] } }),
];

const classics: ClassicDef[] = [
  { a: 'cl_colocolo', b: 'cl_udechile', name: 'Superclásico' },
  { a: 'cl_udechile', b: 'cl_ucatolica', name: 'Clásico Universitario' },
  { a: 'cl_colocolo', b: 'cl_ucatolica', name: 'Clásico Colo-Colo vs Universidad Católica' },
  { a: 'cl_everton', b: 'cl_limache', name: 'Clásico de la Región de Valparaíso' },
  { a: 'cl_coquimbo', b: 'cl_laserena', name: 'Clásico de la Región de Coquimbo' },
  { a: 'cl_udeconcepcion', b: 'cl_depconcepcion', name: 'Clásico Porteño de Concepción' },
  { a: 'cl_audax', b: 'cl_palestino', name: 'Clásico de Colonias' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
