import { Rng } from '../util/math';
import type { FormationId, KitData, PlayerData, Position, TeamData } from './types';
import { CRESTS } from './crests';
import { ROSTERS } from './rosters';

// Los 30 equipos de la Liga Profesional Argentina 2026 con sus colores, escudos y plantillas reales (rosters.ts).

const FIRST = [
  'Mateo', 'Lucas', 'Thiago', 'Bruno', 'Iker', 'Dante', 'Joaquín', 'Nico', 'Álvaro', 'Enzo', 'Gael', 'Santi',
  'Marco', 'Leo', 'Tomás', 'Rafa', 'Kai', 'Elías', 'Hugo', 'Liam', 'Ian', 'Bastián', 'Adrián', 'Valentín',
  'Facundo', 'Rodrigo', 'Emil', 'Noah', 'Oskar', 'Yago', 'Ciro', 'Lautaro', 'Matías', 'Benja', 'Félix', 'Amadou',
  'Kofi', 'Jonas', 'Pavel', 'Arturo', 'Teo', 'Milo', 'Darío', 'Simón', 'Germán', 'Ulises', 'Ramiro', 'Gonzalo',
];
const LAST = [
  'Arrieta', 'Bellini', 'Castellano', 'Duarte', 'Esquivel', 'Ferraro', 'Galván', 'Herrera', 'Ibarra', 'Jaramillo',
  'Kovač', 'Lozano', 'Mendaro', 'Navarrete', 'Olmedo', 'Peralta', 'Quiroga', 'Robledo', 'Salcedo', 'Toledo',
  'Urquiza', 'Valdivia', 'Westra', 'Yáñez', 'Zabala', 'Aranda', 'Benítez', 'Cabral', 'Dorado', 'Echeverri',
  'Fuentes', 'Garrido', 'Huerta', 'Iturbe', 'Lucero', 'Montaño', 'Nieva', 'Ortega', 'Pizarro', 'Rivas',
  'Solís', 'Tejada', 'Vargas', 'Zamora', 'Okafor', 'Mbeki', 'Lindqvist', 'Moreau', 'Novak', 'Sato',
];
const HAIR = ['#1b1209', '#2b1b0e', '#3d2614', '#5a3a1e', '#8a5a2b', '#c69a5b', '#e0c27a', '#121212', '#6b2f12'];

export interface TeamSeed {
  id: string;
  name: string;
  short: string;
  city: string;
  crest: TeamData['crest'];
  home: KitData;
  away: KitData;
  gkKit: KitData;
  formation: FormationId;
  rating: number;
  seed: number;
  /** Plantilla real: 11 titulares en el orden de la formación + 7 suplentes (portero, 2 def, 2 med, 2 del). Sus atributos se generan. */
  roster?: RosterEntry[];
}

export interface RosterEntry {
  name: string;
  number: number;
  /** Ajuste del nivel del jugador respecto a la media del equipo. */
  bonus?: number;
}

/** Equipación: camiseta, color secundario, diseño, pantalón, medias y dorsal. */
const kit = (shirt: string, shirt2: string, pattern: KitData['pattern'], shorts: string, socks: string, number: string): KitData => ({ shirt, shirt2, pattern, shorts, socks, number });
const crest = (id: string, primary: string, secondary: string): TeamData['crest'] => ({ shape: 'shield', primary, secondary, symbol: 'none', image: CRESTS[id] });
const GK_A = kit('#e8ff3a', '#a8c800', 'solid', '#1a1a1a', '#e8ff3a', '#1a1a1a');
const GK_B = kit('#ff7a1a', '#c45200', 'solid', '#2a1200', '#ff7a1a', '#2a1200');
const GK_C = kit('#1fd18a', '#0f8a5a', 'solid', '#0f3a2a', '#1fd18a', '#0f3a2a');
const GK_D = kit('#8a2be2', '#5a1aa0', 'solid', '#1a0a30', '#8a2be2', '#ffffff');

/** Liga Profesional Argentina 2026: los 30 equipos de Primera División, con sus colores. */
const SEEDS: TeamSeed[] = [
  { id: 'aldosivi', name: 'Aldosivi', short: 'ALD', city: 'Mar del Plata', crest: crest('aldosivi', '#0b7a3a', '#f5d000'),
    home: kit('#0b7a3a', '#f5d000', 'stripes', '#0b7a3a', '#0b7a3a', '#ffffff'), away: kit('#ffffff', '#0b7a3a', 'solid', '#ffffff', '#ffffff', '#0b7a3a'), gkKit: GK_B, formation: '4-4-2', rating: 73, seed: 101 },
  { id: 'argentinos', name: 'Argentinos Juniors', short: 'ARG', city: 'La Paternal', crest: crest('argentinos', '#d7182a', '#ffffff'),
    home: kit('#d7182a', '#ffffff', 'solid', '#ffffff', '#d7182a', '#ffffff'), away: kit('#ffffff', '#d7182a', 'solid', '#d7182a', '#ffffff', '#d7182a'), gkKit: GK_A, formation: '4-3-3', rating: 79, seed: 102 },
  { id: 'atltucuman', name: 'Atlético Tucumán', short: 'ATU', city: 'San Miguel de Tucumán', crest: crest('atltucuman', '#6cb4e4', '#ffffff'),
    home: kit('#ffffff', '#6cb4e4', 'stripes', '#1a2a4a', '#1a2a4a', '#1a2a4a'), away: kit('#1a2a4a', '#6cb4e4', 'solid', '#1a2a4a', '#1a2a4a', '#6cb4e4'), gkKit: GK_C, formation: '4-4-2', rating: 75, seed: 103 },
  { id: 'banfield', name: 'Banfield', short: 'BAN', city: 'Banfield', crest: crest('banfield', '#00703c', '#ffffff'),
    home: kit('#ffffff', '#00703c', 'stripes', '#ffffff', '#00703c', '#00703c'), away: kit('#00703c', '#ffffff', 'solid', '#00703c', '#00703c', '#ffffff'), gkKit: GK_A, formation: '4-4-2', rating: 75, seed: 104 },
  { id: 'barracas', name: 'Barracas Central', short: 'BAR', city: 'Barracas', crest: crest('barracas', '#d0102a', '#ffffff'),
    home: kit('#ffffff', '#d0102a', 'stripes', '#1a1a1a', '#1a1a1a', '#1a1a1a'), away: kit('#1a1a1a', '#d0102a', 'solid', '#1a1a1a', '#1a1a1a', '#ffffff'), gkKit: GK_C, formation: '4-4-2', rating: 76, seed: 105 },
  {
    // Belgrano de Córdoba ("los Piratas"). Camiseta celeste; campeón del Apertura 2026.
    id: 'belgrano', name: 'Belgrano de Córdoba', short: 'CAB', city: 'Córdoba',
    crest: crest('belgrano', '#5db8e8', '#ffffff'),
    home: { shirt: '#5db8e8', shirt2: '#ffffff', pattern: 'solid', shorts: '#ffffff', socks: '#5db8e8', number: '#ffffff' },
    away: { shirt: '#161616', shirt2: '#5db8e8', pattern: 'solid', shorts: '#161616', socks: '#161616', number: '#5db8e8' },
    gkKit: { shirt: '#e8ff3a', shirt2: '#a8c800', pattern: 'solid', shorts: '#1a1a1a', socks: '#e8ff3a', number: '#1a1a1a' },
    formation: '4-2-3-1', rating: 81, seed: 99,
    // once del 0-2 en el Cilindro ante Racing (11/10/2026, fecha 12 del Clausura); algunos dorsales estimados
    roster: [
      { name: 'Manuel Vicentini', number: 12 },
      { name: 'Leonardo Morales', number: 14 },
      { name: 'Alexis Maldonado', number: 2 },
      { name: 'Lisandro López', number: 17, bonus: 2 },
      { name: 'Adrián Spörle', number: 3 },
      { name: 'Adrián Sánchez', number: 21, bonus: 3 },
      { name: 'Franco Vázquez', number: 20, bonus: 4 },
      { name: 'Emiliano Rigoni', number: 24, bonus: 4 },
      { name: 'Lucas Zelarayán', number: 10, bonus: 5 },
      { name: 'Ramiro Hernandes', number: 51 },
      { name: 'Lucas Passerini', number: 9, bonus: 3 },
      // suplentes
      { name: 'Thiago Cardozo', number: 25 },
      { name: 'Agustín Griguol', number: 4 },
      { name: 'Federico Ricca', number: 16 },
      { name: 'Santiago Longo', number: 5 },
      { name: 'Ramiro Tulián', number: 15 },
      { name: 'Gonzalo Zelarayán', number: 29 },
      { name: 'Nicolás Fernández', number: 7 },
    ],
  },
  { id: 'boca', name: 'Boca Juniors', short: 'BOC', city: 'La Boca', crest: crest('boca', '#0b2a6b', '#f2b705'),
    home: kit('#0b2a6b', '#f2b705', 'band', '#0b2a6b', '#0b2a6b', '#f2b705'), away: kit('#f2c230', '#0b2a6b', 'solid', '#f2c230', '#f2c230', '#0b2a6b'), gkKit: GK_C, formation: '4-3-3', rating: 84, seed: 106 },
  { id: 'centralcordoba', name: 'Central Córdoba', short: 'CCO', city: 'Santiago del Estero', crest: crest('centralcordoba', '#111111', '#ffffff'),
    home: kit('#ffffff', '#111111', 'stripes', '#111111', '#111111', '#111111'), away: kit('#d0102a', '#ffffff', 'solid', '#d0102a', '#d0102a', '#ffffff'), gkKit: GK_A, formation: '4-4-2', rating: 75, seed: 107 },
  { id: 'defensa', name: 'Defensa y Justicia', short: 'DYJ', city: 'Florencio Varela', crest: crest('defensa', '#f7d417', '#0a7a3a'),
    home: kit('#f7d417', '#0a7a3a', 'solid', '#0a7a3a', '#f7d417', '#0a7a3a'), away: kit('#0a7a3a', '#f7d417', 'solid', '#0a7a3a', '#0a7a3a', '#f7d417'), gkKit: GK_D, formation: '4-2-3-1', rating: 77, seed: 108 },
  { id: 'estudiantes', name: 'Estudiantes de La Plata', short: 'EST', city: 'La Plata', crest: crest('estudiantes', '#d4111b', '#ffffff'),
    home: kit('#ffffff', '#d4111b', 'stripes', '#111111', '#111111', '#111111'), away: kit('#13235b', '#d4111b', 'solid', '#13235b', '#13235b', '#ffffff'), gkKit: GK_C, formation: '4-4-2', rating: 81, seed: 109 },
  { id: 'estudiantesrc', name: 'Estudiantes de Río Cuarto', short: 'ERC', city: 'Río Cuarto', crest: crest('estudiantesrc', '#3a9ad9', '#ffffff'),
    home: kit('#3a9ad9', '#ffffff', 'solid', '#ffffff', '#3a9ad9', '#ffffff'), away: kit('#ffffff', '#3a9ad9', 'solid', '#3a9ad9', '#ffffff', '#3a9ad9'), gkKit: GK_B, formation: '4-4-2', rating: 73, seed: 110 },
  { id: 'gimnasia', name: 'Gimnasia y Esgrima La Plata', short: 'GLP', city: 'La Plata', crest: crest('gimnasia', '#0b2459', '#ffffff'),
    home: kit('#f4f4f4', '#0b2459', 'band', '#ffffff', '#ffffff', '#0b2459'), away: kit('#0b2459', '#ffffff', 'band', '#0b2459', '#0b2459', '#ffffff'), gkKit: GK_A, formation: '4-3-3', rating: 76, seed: 111 },
  { id: 'gimnasiamza', name: 'Gimnasia y Esgrima de Mendoza', short: 'GME', city: 'Mendoza', crest: crest('gimnasiamza', '#111111', '#ffffff'),
    home: kit('#ffffff', '#111111', 'stripes', '#111111', '#111111', '#111111'), away: kit('#111111', '#ffffff', 'solid', '#111111', '#111111', '#ffffff'), gkKit: GK_B, formation: '4-4-2', rating: 73, seed: 112 },
  { id: 'huracan', name: 'Huracán', short: 'HUR', city: 'Parque Patricios', crest: crest('huracan', '#d21f2b', '#ffffff'),
    home: kit('#ffffff', '#d21f2b', 'solid', '#ffffff', '#ffffff', '#d21f2b'), away: kit('#d21f2b', '#ffffff', 'solid', '#d21f2b', '#d21f2b', '#ffffff'), gkKit: GK_C, formation: '4-2-3-1', rating: 78, seed: 113 },
  { id: 'independiente', name: 'Independiente', short: 'IND', city: 'Avellaneda', crest: crest('independiente', '#cc0000', '#ffffff'),
    home: kit('#cc0000', '#ffffff', 'solid', '#13235b', '#cc0000', '#ffffff'), away: kit('#ffffff', '#cc0000', 'solid', '#ffffff', '#ffffff', '#cc0000'), gkKit: GK_A, formation: '4-3-3', rating: 79, seed: 114 },
  { id: 'indrivadavia', name: 'Independiente Rivadavia', short: 'CSI', city: 'Mendoza', crest: crest('indrivadavia', '#13235b', '#ffffff'),
    home: kit('#13235b', '#ffffff', 'solid', '#ffffff', '#13235b', '#ffffff'), away: kit('#ffffff', '#13235b', 'solid', '#13235b', '#ffffff', '#13235b'), gkKit: GK_B, formation: '4-4-2', rating: 76, seed: 115 },
  { id: 'instituto', name: 'Instituto', short: 'INS', city: 'Córdoba', crest: crest('instituto', '#d0102a', '#ffffff'),
    home: kit('#ffffff', '#d0102a', 'stripes', '#ffffff', '#d0102a', '#d0102a'), away: kit('#d0102a', '#ffffff', 'solid', '#d0102a', '#d0102a', '#ffffff'), gkKit: GK_C, formation: '4-4-2', rating: 75, seed: 116 },
  { id: 'lanus', name: 'Lanús', short: 'LAN', city: 'Lanús', crest: crest('lanus', '#7b1a2c', '#ffffff'),
    home: kit('#7b1a2c', '#ffffff', 'solid', '#7b1a2c', '#7b1a2c', '#ffffff'), away: kit('#ffffff', '#7b1a2c', 'solid', '#ffffff', '#ffffff', '#7b1a2c'), gkKit: GK_A, formation: '4-2-3-1', rating: 80, seed: 117 },
  { id: 'newells', name: "Newell's Old Boys", short: 'NOB', city: 'Rosario', crest: crest('newells', '#c8102e', '#111111'),
    home: kit('#c8102e', '#111111', 'halves', '#111111', '#111111', '#ffffff'), away: kit('#ffffff', '#c8102e', 'solid', '#ffffff', '#ffffff', '#111111'), gkKit: GK_C, formation: '4-3-3', rating: 76, seed: 118 },
  { id: 'platense', name: 'Platense', short: 'PLA', city: 'Vicente López', crest: crest('platense', '#5a3417', '#ffffff'),
    home: kit('#ffffff', '#5a3417', 'band', '#5a3417', '#ffffff', '#5a3417'), away: kit('#5a3417', '#ffffff', 'solid', '#5a3417', '#5a3417', '#ffffff'), gkKit: GK_A, formation: '4-4-2', rating: 77, seed: 119 },
  { id: 'racing', name: 'Racing Club', short: 'RAC', city: 'Avellaneda', crest: crest('racing', '#6cc3ee', '#ffffff'),
    home: kit('#ffffff', '#6cc3ee', 'stripes', '#111111', '#111111', '#13235b'), away: kit('#13235b', '#6cc3ee', 'solid', '#13235b', '#13235b', '#ffffff'), gkKit: GK_B, formation: '4-3-3', rating: 82, seed: 120 },
  { id: 'riestra', name: 'Deportivo Riestra', short: 'RIE', city: 'Bajo Flores', crest: crest('riestra', '#111111', '#ffffff'),
    home: kit('#111111', '#ffffff', 'solid', '#111111', '#111111', '#ffffff'), away: kit('#ffffff', '#111111', 'solid', '#ffffff', '#ffffff', '#111111'), gkKit: GK_A, formation: '4-4-2', rating: 74, seed: 121 },
  { id: 'river', name: 'River Plate', short: 'RIV', city: 'Núñez', crest: crest('river', '#e31b23', '#ffffff'),
    home: kit('#ffffff', '#e31b23', 'sash', '#111111', '#ffffff', '#111111'), away: kit('#e31b23', '#111111', 'sash', '#e31b23', '#e31b23', '#ffffff'), gkKit: GK_D, formation: '4-3-3', rating: 84, seed: 122 },
  { id: 'rosariocentral', name: 'Rosario Central', short: 'CEN', city: 'Rosario', crest: crest('rosariocentral', '#0b2d6b', '#f5c400'),
    home: kit('#0b2d6b', '#f5c400', 'stripes', '#0b2d6b', '#0b2d6b', '#ffffff'), away: kit('#f5c400', '#0b2d6b', 'solid', '#f5c400', '#f5c400', '#0b2d6b'), gkKit: GK_C, formation: '4-2-3-1', rating: 80, seed: 123 },
  { id: 'sanlorenzo', name: 'San Lorenzo', short: 'SLO', city: 'Boedo', crest: crest('sanlorenzo', '#0b2d6b', '#c8102e'),
    home: kit('#0b2d6b', '#c8102e', 'stripes', '#0b2d6b', '#0b2d6b', '#ffffff'), away: kit('#ffffff', '#c8102e', 'solid', '#ffffff', '#ffffff', '#0b2d6b'), gkKit: GK_A, formation: '4-4-2', rating: 77, seed: 124 },
  { id: 'sarmiento', name: 'Sarmiento', short: 'SAR', city: 'Junín', crest: crest('sarmiento', '#00813f', '#ffffff'),
    home: kit('#00813f', '#ffffff', 'solid', '#ffffff', '#00813f', '#ffffff'), away: kit('#ffffff', '#00813f', 'solid', '#00813f', '#ffffff', '#00813f'), gkKit: GK_B, formation: '4-4-2', rating: 74, seed: 125 },
  { id: 'talleres', name: 'Talleres', short: 'TAL', city: 'Córdoba', crest: crest('talleres', '#0b2d6b', '#ffffff'),
    home: kit('#ffffff', '#0b2d6b', 'stripes', '#0b2d6b', '#0b2d6b', '#0b2d6b'), away: kit('#0b2d6b', '#ffffff', 'solid', '#0b2d6b', '#0b2d6b', '#ffffff'), gkKit: GK_A, formation: '4-2-3-1', rating: 80, seed: 126 },
  { id: 'tigre', name: 'Tigre', short: 'TIG', city: 'Victoria', crest: crest('tigre', '#1a3e8f', '#c8102e'),
    home: kit('#1a3e8f', '#c8102e', 'band', '#1a3e8f', '#1a3e8f', '#ffffff'), away: kit('#ffffff', '#1a3e8f', 'band', '#ffffff', '#ffffff', '#1a3e8f'), gkKit: GK_C, formation: '4-3-3', rating: 77, seed: 127 },
  { id: 'union', name: 'Unión de Santa Fe', short: 'UNI', city: 'Santa Fe', crest: crest('union', '#d0102a', '#ffffff'),
    home: kit('#ffffff', '#d0102a', 'stripes', '#ffffff', '#d0102a', '#d0102a'), away: kit('#13235b', '#d0102a', 'solid', '#13235b', '#13235b', '#ffffff'), gkKit: GK_A, formation: '4-4-2', rating: 77, seed: 128 },
  { id: 'velez', name: 'Vélez Sarsfield', short: 'VEL', city: 'Liniers', crest: crest('velez', '#1a4fa0', '#ffffff'),
    home: kit('#ffffff', '#1a4fa0', 'vee', '#ffffff', '#ffffff', '#1a4fa0'), away: kit('#1a4fa0', '#ffffff', 'vee', '#1a4fa0', '#1a4fa0', '#ffffff'), gkKit: GK_B, formation: '4-3-3', rating: 80, seed: 129 },
];

// Puestos de la plantilla: 11 titulares en el orden de la formación + 7 suplentes.
const SQUAD_POSITIONS: Record<FormationId, Position[]> = {
  '4-3-3': ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'],
  '4-4-2': ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD'],
  '4-2-3-1': ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD'],
  '3-5-2': ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD'],
};
const BENCH: Position[] = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD'];
const START_NUMBERS: Record<FormationId, number[]> = {
  '4-3-3': [1, 3, 4, 5, 2, 6, 8, 10, 11, 9, 7],
  '4-4-2': [1, 3, 4, 5, 2, 11, 8, 6, 7, 9, 10],
  '4-2-3-1': [1, 3, 4, 5, 2, 6, 8, 11, 10, 7, 9],
  '3-5-2': [1, 4, 5, 6, 3, 8, 10, 14, 2, 9, 11],
};

function makePlayer(rng: Rng, teamId: string, idx: number, pos: Position, number: number, rating: number, usedNames: Set<string>, real?: RosterEntry): PlayerData {
  let name = real?.name ?? '';
  for (let tries = 0; !real && tries < 50; tries++) {
    name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    if (!usedNames.has(name)) break;
  }
  usedNames.add(name);
  const base = rating + rng.range(-7, 5) - (idx >= 11 ? 4 : 0) + (real?.bonus ?? 0);
  const r = (bias: number) => Math.round(Math.max(30, Math.min(97, base + bias + rng.range(-6, 6))));
  const attrs = {
    GK: { speed: r(-25), acceleration: r(-20), passing: r(-15), shooting: r(-40), control: r(-20), defending: r(-20), stamina: r(-10), goalkeeping: r(6) },
    DEF: { speed: r(-6), acceleration: r(-6), passing: r(-6), shooting: r(-20), control: r(-8), defending: r(6), stamina: r(0), goalkeeping: r(-60) },
    MID: { speed: r(-2), acceleration: r(0), passing: r(5), shooting: r(-4), control: r(4), defending: r(-6), stamina: r(4), goalkeeping: r(-60) },
    FWD: { speed: r(4), acceleration: r(4), passing: r(-3), shooting: r(7), control: r(4), defending: r(-25), stamina: r(-2), goalkeeping: r(-60) },
  }[pos];
  return {
    id: `${teamId}-${idx}`,
    name,
    number,
    position: pos,
    attrs,
    skinTone: rng.next(),
    hairColor: rng.pick(HAIR),
    hairStyle: rng.int(0, 3),
    height: Math.round((pos === 'GK' ? rng.range(1.84, 1.95) : rng.range(1.68, 1.9)) * 100) / 100,
  };
}

export function buildTeam(s: TeamSeed): TeamData {
  const rng = new Rng(s.seed * 7919);
  const used = new Set<string>();
  const players: PlayerData[] = [];
  const starters = SQUAD_POSITIONS[s.formation];
  const { roster, ...data } = s;
  const nums = roster ? roster.slice(0, 11).map((r) => r.number) : START_NUMBERS[s.formation];
  starters.forEach((p, i) => players.push(makePlayer(rng, s.id, i, p, nums[i], s.rating, used, roster?.[i])));
  const usedNums = new Set(nums);
  let n = 12;
  BENCH.forEach((p, i) => {
    const real = roster?.[11 + i];
    if (real) usedNums.add(real.number);
    else {
      while (usedNums.has(n)) n++;
      usedNums.add(n);
    }
    players.push(makePlayer(rng, s.id, 11 + i, p, real?.number ?? n, s.rating, used, real));
  });
  return { ...data, players };
}

// plantilla real de cada club (Clausura 2026); Belgrano trae la suya en la semilla
export const TEAMS: TeamData[] = SEEDS.map((s) => buildTeam(!s.roster && ROSTERS[s.id] ? { ...s, ...ROSTERS[s.id] } : s));
/** Equipos del juego (sin los creados en el editor): los únicos que se usan en el modo online. */
export const BUILTIN_TEAM_COUNT = SEEDS.length;

export function getTeam(id: string): TeamData {
  // equipos que ya no existen (partidas guardadas, rivales online con otra versión): el primero de la lista
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}

/** Media general de un jugador para su puesto. */
export function playerOverall(p: PlayerData): number {
  const a = p.attrs;
  switch (p.position) {
    case 'GK': return Math.round(a.goalkeeping * 0.75 + a.passing * 0.1 + a.speed * 0.05 + a.acceleration * 0.1);
    case 'DEF': return Math.round(a.defending * 0.45 + a.speed * 0.15 + a.passing * 0.15 + a.control * 0.1 + a.stamina * 0.15);
    case 'MID': return Math.round(a.passing * 0.35 + a.control * 0.25 + a.shooting * 0.1 + a.defending * 0.1 + a.stamina * 0.2);
    case 'FWD': return Math.round(a.shooting * 0.4 + a.speed * 0.2 + a.control * 0.25 + a.acceleration * 0.15);
  }
}

/** Distancia perceptual simple entre colores (para elegir la equipación visitante). */
export function colorDistance(a: string, b: string): number {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
  const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
  const db = (pa & 255) - (pb & 255);
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

/** Elige la equipación del visitante para que se distinga del local. */
export function chooseAwayKit(home: TeamData, away: TeamData): KitData {
  const h = home.home;
  const dHome = Math.min(colorDistance(h.shirt, away.home.shirt), colorDistance(h.shirt2, away.home.shirt));
  const dAway = Math.min(colorDistance(h.shirt, away.away.shirt), colorDistance(h.shirt2, away.away.shirt));
  return dHome >= 70 || dHome >= dAway ? away.home : away.away;
}
