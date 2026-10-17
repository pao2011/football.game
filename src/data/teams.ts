import { Rng } from '../util/math';
import type { FormationId, KitData, PlayerData, Position, TeamData } from './types';

// Equipos ficticios (nombres, escudos y equipaciones originales) y Belgrano de Córdoba, con su plantilla real.

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

const SEEDS: TeamSeed[] = [
  {
    id: 'aurora', name: 'Aurora FC', short: 'AUR', city: 'Puerto Aurora',
    crest: { shape: 'shield', primary: '#5b2bb5', secondary: '#f49ad8', symbol: 'star' },
    home: { shirt: '#f49ad8', shirt2: '#4a1fa8', pattern: 'gradient', shorts: '#3d1d9a', socks: '#3d1d9a', number: '#ffffff' },
    away: { shirt: '#f4f1fa', shirt2: '#c9b8f0', pattern: 'solid', shorts: '#f4f1fa', socks: '#f4f1fa', number: '#4a1fa8' },
    gkKit: { shirt: '#1fd18a', shirt2: '#0f8a5a', pattern: 'gradient', shorts: '#0f3a2a', socks: '#1fd18a', number: '#0f3a2a' },
    formation: '4-3-3', rating: 82, seed: 11,
  },
  {
    id: 'brasa', name: 'Brasa United', short: 'BRS', city: 'Ciudad Brasa',
    crest: { shape: 'shield', primary: '#c8102e', secondary: '#c9a24a', symbol: 'ball' },
    home: { shirt: '#111111', shirt2: '#d61f26', pattern: 'gradient', shorts: '#d61f26', socks: '#111111', number: '#c9a24a' },
    away: { shirt: '#f2efe6', shirt2: '#c9a24a', pattern: 'sash', shorts: '#1a1a1a', socks: '#f2efe6', number: '#1a1a1a' },
    gkKit: { shirt: '#f7d417', shirt2: '#c8a40f', pattern: 'solid', shorts: '#222222', socks: '#f7d417', number: '#222222' },
    formation: '4-2-3-1', rating: 84, seed: 22,
  },
  {
    id: 'marea', name: 'Deportivo Marea', short: 'MAR', city: 'Bahía Marea',
    crest: { shape: 'circle', primary: '#0b4f8a', secondary: '#7fd3ff', symbol: 'wave' },
    home: { shirt: '#1c7fd6', shirt2: '#ffffff', pattern: 'stripes', shorts: '#ffffff', socks: '#1c7fd6', number: '#0b2f55' },
    away: { shirt: '#0b2f55', shirt2: '#1c7fd6', pattern: 'solid', shorts: '#0b2f55', socks: '#0b2f55', number: '#7fd3ff' },
    gkKit: { shirt: '#ff7a1a', shirt2: '#c45200', pattern: 'solid', shorts: '#3a1a00', socks: '#ff7a1a', number: '#3a1a00' },
    formation: '4-4-2', rating: 79, seed: 33,
  },
  {
    id: 'leones', name: 'Atlético Leones', short: 'LEO', city: 'Villa Leones',
    crest: { shape: 'shield', primary: '#e8b400', secondary: '#1a1a1a', symbol: 'lion' },
    home: { shirt: '#f5c400', shirt2: '#1a1a1a', pattern: 'hoops', shorts: '#1a1a1a', socks: '#f5c400', number: '#1a1a1a' },
    away: { shirt: '#262626', shirt2: '#f5c400', pattern: 'solid', shorts: '#262626', socks: '#262626', number: '#f5c400' },
    gkKit: { shirt: '#7d3cff', shirt2: '#4a1fb0', pattern: 'solid', shorts: '#1b0b40', socks: '#7d3cff', number: '#ffffff' },
    formation: '4-3-3', rating: 80, seed: 44,
  },
  {
    id: 'rayo', name: 'Rayo Norte', short: 'RAY', city: 'Norteña',
    crest: { shape: 'diamond', primary: '#00a86b', secondary: '#ffffff', symbol: 'bolt' },
    home: { shirt: '#00a86b', shirt2: '#006b44', pattern: 'gradient', shorts: '#ffffff', socks: '#00a86b', number: '#ffffff' },
    away: { shirt: '#ffffff', shirt2: '#00a86b', pattern: 'sash', shorts: '#00a86b', socks: '#ffffff', number: '#006b44' },
    gkKit: { shirt: '#e8317a', shirt2: '#a3174f', pattern: 'solid', shorts: '#2a0614', socks: '#e8317a', number: '#ffffff' },
    formation: '4-4-2', rating: 76, seed: 55,
  },
  {
    id: 'reales', name: 'Real Corona', short: 'COR', city: 'San Corona',
    crest: { shape: 'shield', primary: '#ffffff', secondary: '#8a1538', symbol: 'crown' },
    home: { shirt: '#f7f7f7', shirt2: '#8a1538', pattern: 'solid', shorts: '#f7f7f7', socks: '#8a1538', number: '#8a1538' },
    away: { shirt: '#8a1538', shirt2: '#5a0c22', pattern: 'gradient', shorts: '#5a0c22', socks: '#8a1538', number: '#ffffff' },
    gkKit: { shirt: '#3a3a3a', shirt2: '#111111', pattern: 'solid', shorts: '#111111', socks: '#3a3a3a', number: '#ffd400' },
    formation: '4-2-3-1', rating: 86, seed: 66,
  },
  {
    id: 'torre', name: 'Club Torreón', short: 'TOR', city: 'Torreón Alto',
    crest: { shape: 'circle', primary: '#ff6a00', secondary: '#0d1b2a', symbol: 'tower' },
    home: { shirt: '#ff6a00', shirt2: '#0d1b2a', pattern: 'solid', shorts: '#0d1b2a', socks: '#ff6a00', number: '#0d1b2a' },
    away: { shirt: '#9fd8ff', shirt2: '#0d1b2a', pattern: 'hoops', shorts: '#ffffff', socks: '#9fd8ff', number: '#0d1b2a' },
    gkKit: { shirt: '#2ee6d6', shirt2: '#119b90', pattern: 'solid', shorts: '#06302d', socks: '#2ee6d6', number: '#06302d' },
    formation: '3-5-2', rating: 77, seed: 77,
  },
  {
    id: 'aguilas', name: 'Águilas del Sur', short: 'AGS', city: 'Puerto Sur',
    crest: { shape: 'diamond', primary: '#0a2a66', secondary: '#e3c16f', symbol: 'eagle' },
    home: { shirt: '#0a2a66', shirt2: '#e3c16f', pattern: 'sash', shorts: '#0a2a66', socks: '#e3c16f', number: '#e3c16f' },
    away: { shirt: '#e8e2cf', shirt2: '#0a2a66', pattern: 'stripes', shorts: '#0a2a66', socks: '#e8e2cf', number: '#0a2a66' },
    gkKit: { shirt: '#b6ff2e', shirt2: '#78b80c', pattern: 'solid', shorts: '#203000', socks: '#b6ff2e', number: '#203000' },
    formation: '4-3-3', rating: 81, seed: 88,
  },
  {
    // Belgrano de Córdoba ("los Piratas"). Camiseta celeste; plantilla del plantel profesional 2026 (Apertura campeón).
    id: 'belgrano', name: 'Belgrano de Córdoba', short: 'CAB', city: 'Córdoba',
    crest: { shape: 'shield', primary: '#5db8e8', secondary: '#ffffff', symbol: 'none', stripes: true },
    home: { shirt: '#5db8e8', shirt2: '#ffffff', pattern: 'solid', shorts: '#ffffff', socks: '#5db8e8', number: '#ffffff' },
    away: { shirt: '#161616', shirt2: '#5db8e8', pattern: 'solid', shorts: '#161616', socks: '#161616', number: '#5db8e8' },
    gkKit: { shirt: '#e8ff3a', shirt2: '#a8c800', pattern: 'solid', shorts: '#1a1a1a', socks: '#e8ff3a', number: '#1a1a1a' },
    formation: '4-4-2', rating: 80, seed: 99,
    roster: [
      { name: 'Matías Daniele', number: 1, bonus: 2 },
      { name: 'Alexis Maldonado', number: 2 },
      { name: 'Agustín Griguol', number: 4 },
      { name: 'Álvaro Ocampo', number: 13 },
      { name: 'Federico Ricca', number: 16, bonus: 3 },
      { name: 'Emiliano Rigoni', number: 24, bonus: 4 },
      { name: 'Santiago Longo', number: 5 },
      { name: 'Adrián Sánchez', number: 21, bonus: 3 },
      { name: 'Lucas Zelarayán', number: 10, bonus: 5 },
      { name: 'Gonzalo Zelarayán', number: 9, bonus: 2 },
      { name: 'Nicolás Fernández', number: 7 },
      // suplentes
      { name: 'Manuel Vicentini', number: 12 },
      { name: 'Adrián Spörle', number: 3 },
      { name: 'Alcides Benítez', number: 26 },
      { name: 'Julián Mavilla', number: 32 },
      { name: 'Francisco González Metilli', number: 11, bonus: 2 },
      { name: 'L. Passerini', number: 20 },
      { name: 'Lautaro Gutiérrez', number: 18 },
    ],
  },
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

export const TEAMS: TeamData[] = SEEDS.map(buildTeam);
/** Equipos del juego (sin los creados en el editor): los únicos que se usan en el modo online. */
export const BUILTIN_TEAM_COUNT = SEEDS.length;

export function getTeam(id: string): TeamData {
  const t = TEAMS.find((t) => t.id === id);
  if (!t) throw new Error(`Equipo desconocido: ${id}`);
  return t;
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
