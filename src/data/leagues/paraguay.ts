import type { TeamSeed } from '../teams';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE, GK_BLACK } from '../seedUtil';
import type { LeagueData } from '../seedUtil';
void GK_PURPLE; void GK_BLACK;

// Primera División de Paraguay 2026 (12 clubes). Plantillas generadas aparte.
const TEAMS: TeamSeed[] = [
  { id: 'py_olimpia', name: "Club Olimpia", short: "OLI", city: "Asunción", crest: crest('py_olimpia', '#ffffff', '#1a1a1a'),
    home: kit('#ffffff', '#1a1a1a', 'solid', '#1a1a1a', '#ffffff', '#1a1a1a'), away: kit('#1a1a1a', '#ffffff', 'solid', '#1a1a1a', '#1a1a1a', '#ffffff'), gkKit: GK_ORANGE, formation: '4-3-3', rating: 76, seed: 6000, },
  { id: 'py_cerro', name: "Cerro Porteño", short: "CER", city: "Asunción", crest: crest('py_cerro', '#0a2a66', '#c8102e'),
    home: kit('#0a2a66', '#c8102e', 'stripes', '#0a2a66', '#0a2a66', '#ffffff'), away: kit('#ffffff', '#c8102e', 'hoops', '#ffffff', '#ffffff', '#0a2a66'), gkKit: GK_YELLOW, formation: '4-3-3', rating: 76, seed: 6001, },
  { id: 'py_libertad', name: "Club Libertad", short: "LIB", city: "Asunción", crest: crest('py_libertad', '#1a1a1a', '#ffffff'),
    home: kit('#ffffff', '#1a1a1a', 'stripes', '#1a1a1a', '#1a1a1a', '#1a1a1a'), away: kit('#1a1a1a', '#6a6a6a', 'solid', '#1a1a1a', '#1a1a1a', '#ffffff'), gkKit: GK_ORANGE, formation: '4-2-3-1', rating: 75, seed: 6002, },
  { id: 'py_guarani', name: "Club Guaraní", short: "GUA", city: "Asunción", crest: crest('py_guarani', '#f5c400', '#1a1a1a'),
    home: kit('#f5c400', '#1a1a1a', 'stripes', '#1a1a1a', '#f5c400', '#1a1a1a'), away: kit('#ffffff', '#1a1a1a', 'solid', '#1a1a1a', '#ffffff', '#1a1a1a'), gkKit: GK_GREEN, formation: '4-4-2', rating: 71, seed: 6003, },
  { id: 'py_nacional', name: "Club Nacional", short: "NAC", city: "Asunción", crest: crest('py_nacional', '#0a2a8a', '#c8102e'),
    home: kit('#ffffff', '#0a2a8a', 'solid', '#0a2a8a', '#ffffff', '#0a2a8a'), away: kit('#0a1f7a', '#ffffff', 'solid', '#0a1f7a', '#0a1f7a', '#ffffff'), gkKit: GK_YELLOW, formation: '4-4-2', rating: 70, seed: 6004, },
  { id: 'py_ameliano', name: "Sportivo Ameliano", short: "AME", city: "Asunción", crest: crest('py_ameliano', '#0a2a8a', '#ffffff'),
    home: kit('#ffffff', '#0a2a66', 'vee', '#0a2a66', '#ffffff', '#0a2a66'), away: kit('#1a3fd0', '#ffffff', 'solid', '#1a3fd0', '#1a3fd0', '#ffffff'), gkKit: GK_ORANGE, formation: '4-4-2', rating: 68, seed: 6005, },
  { id: 'py_trinidense', name: "Sportivo Trinidense", short: "TRI", city: "Asunción", crest: crest('py_trinidense', '#0a1f4a', '#f5c400'),
    home: kit('#0a1f4a', '#f5c400', 'sash', '#0a1f4a', '#0a1f4a', '#f5c400'), away: kit('#f5c400', '#0a1f4a', 'solid', '#0a1f4a', '#f5c400', '#0a1f4a'), gkKit: GK_GREEN, formation: '4-4-2', rating: 68, seed: 6006, },
  { id: 'py_luqueno', name: "Sportivo Luqueño", short: "LUQ", city: "Luque", crest: crest('py_luqueno', '#0a3a9a', '#f5c400'),
    home: kit('#f5c400', '#0a3a9a', 'stripes', '#0a3a9a', '#f5c400', '#0a3a9a'), away: kit('#ffffff', '#0a3a9a', 'solid', '#0a3a9a', '#ffffff', '#0a3a9a'), gkKit: GK_ORANGE, formation: '4-4-2', rating: 67, seed: 6007, },
  { id: 'py_recoleta', name: "Recoleta FC", short: "REC", city: "Asunción", crest: crest('py_recoleta', '#f5c400', '#1a1a1a'),
    home: kit('#f5c400', '#1a1a1a', 'solid', '#1a1a1a', '#f5c400', '#1a1a1a'), away: kit('#1a1a1a', '#f5c400', 'solid', '#1a1a1a', '#1a1a1a', '#f5c400'), gkKit: GK_GREEN, formation: '4-4-2', rating: 66, seed: 6008, },
  { id: 'py_2demayo', name: "Sportivo 2 de Mayo", short: "DOS", city: "Pedro Juan Caballero", crest: crest('py_2demayo', '#0a3a9a', '#ffffff'),
    home: kit('#ffffff', '#0a3a9a', 'hoops', '#0a3a9a', '#ffffff', '#0a3a9a'), away: kit('#ff4a2a', '#0a3a9a', 'solid', '#0a3a9a', '#ff4a2a', '#ffffff'), gkKit: GK_YELLOW, formation: '4-4-2', rating: 65, seed: 6009, },
  { id: 'py_rubionu', name: "Rubio Ñu", short: "RÑU", city: "Asunción", crest: crest('py_rubionu', '#1f7a3a', '#ffffff'),
    home: kit('#ffffff', '#1f7a3a', 'stripes', '#ffffff', '#ffffff', '#1f7a3a'), away: kit('#0f5a2a', '#ffffff', 'solid', '#0f5a2a', '#0f5a2a', '#ffffff'), gkKit: GK_ORANGE, formation: '4-4-2', rating: 65, seed: 6010, },
  { id: 'py_sanlorenzo', name: "Sportivo San Lorenzo", short: "SSL", city: "San Lorenzo", crest: crest('py_sanlorenzo', '#c8102e', '#ffffff'),
    home: kit('#c8102e', '#ffffff', 'hoops', '#ffffff', '#c8102e', '#c8102e'), away: kit('#1a2450', '#c8102e', 'solid', '#1a2450', '#1a2450', '#ffffff'), gkKit: GK_YELLOW, formation: '4-4-2', rating: 64, seed: 6011, },
];

const STADIUMS = [
  stadium('py_estadio_ueno_osvaldo_dominguez_dibb', "Estadio Ueno Osvaldo Dominguez Dibb", 20000, 'py_olimpia', { seats: ['#ffffff','#1a1a1a'], standColor: '#2a2a2a', look: { roof: 'sides', upper: 'none', palcos: true, seats: ['#ffffff', '#1a1a1a'] } }),
  stadium('py_estadio_general_pablo_rojas', "Estadio General Pablo Rojas", 45000, 'py_cerro', { seats: ['#0a2a66','#c8102e'], standColor: '#1a2a55', look: { roof: 'ring', upper: 'both', palcos: true, seats: ['#0a2a66', '#c8102e'] } }),
  stadium('py_estadio_la_huerta', "Estadio La Huerta", 10000, 'py_libertad', { seats: ['#ffffff','#1a1a1a'], standColor: '#2a2a2a', look: { roof: 'sides', upper: 'none', seats: ['#ffffff', '#1a1a1a'] } }),
  stadium('py_estadio_rogelio_livieres', "Estadio Rogelio Livieres", 8000, 'py_guarani', { seats: ['#f5c400','#1a1a1a'], standColor: '#3a3320', look: { roof: 'none', upper: 'none', seats: ['#f5c400', '#1a1a1a'] } }),
  stadium('py_estadio_arsenio_erico', "Estadio Arsenio Erico", 7500, 'py_nacional', { seats: ['#0a2a8a','#c8102e','#ffffff'], standColor: '#1a2a55', look: { roof: 'none', upper: 'none', seats: ['#0a2a8a', '#ffffff'] } }),
  stadium('py_estadio_la_fortaleza_del_pikysyry', "Estadio La Fortaleza del Pikysyry", 7000, 'py_ameliano', { seats: ['#1a3fd0','#ffffff'], standColor: '#1a2a55', look: { roof: 'none', upper: 'none', seats: ['#1a3fd0', '#ffffff'] } }),
  stadium('py_estadio_martin_torres', "Estadio Martín Torres", 3000, 'py_trinidense', { seats: ['#0a1f4a','#f5c400'], standColor: '#1a2040', look: { roof: 'none', upper: 'none', seats: ['#0a1f4a', '#f5c400'] } }),
  stadium('py_estadio_feliciano_caceres', "Estadio Feliciano Cáceres", 26974, 'py_luqueno', { seats: ['#0a3a9a','#f5c400'], standColor: '#1a2a55', look: { roof: 'sides', upper: 'both', seats: ['#0a3a9a', '#f5c400'] } }),
  stadium('py_estadio_ricardo_gregor', "Estadio Ricardo Gregor", 4000, 'py_recoleta', { seats: ['#f5c400','#1a1a1a'], standColor: '#2a2a2a', look: { roof: 'none', upper: 'none', seats: ['#f5c400', '#1a1a1a'] } }),
  stadium('py_estadio_rio_parapiti', "Estadio Río Parapití", 25000, 'py_2demayo', { seats: ['#0a3a9a','#ffffff'], standColor: '#1a2a55', look: { roof: 'none', upper: 'none', seats: ['#0a3a9a', '#ffffff'] } }),
  stadium('py_estadio_la_arboleda', "Estadio La Arboleda", 8000, 'py_rubionu', { seats: ['#1f7a3a','#ffffff'], standColor: '#1d3a28', look: { roof: 'none', upper: 'none', seats: ['#1f7a3a', '#ffffff'] } }),
  stadium('py_estadio_gunther_vogel', "Estadio Gunther Vogel", 5000, 'py_sanlorenzo', { seats: ['#c8102e','#ffffff'], standColor: '#3a1a22', look: { roof: 'none', upper: 'none', seats: ['#c8102e', '#ffffff'] } }),
];

export const DATA: LeagueData = {
  teams: TEAMS,
  stadiums: STADIUMS,
  classics: [
    { a: 'py_olimpia', b: 'py_cerro', name: 'Superclásico paraguayo' },
    { a: 'py_olimpia', b: 'py_libertad', name: 'Clásico Olimpia - Libertad' },
    { a: 'py_cerro', b: 'py_libertad', name: 'Clásico Cerro Porteño - Libertad' },
    { a: 'py_olimpia', b: 'py_guarani', name: 'Clásico Olimpia - Guaraní' },
    { a: 'py_cerro', b: 'py_guarani', name: 'Clásico Cerro Porteño - Guaraní' },
  ],
};
