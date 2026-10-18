import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE, GK_BLACK } from '../seedUtil';
import type { TeamSeed } from '../teams';

type F = TeamSeed['formation'];
const START_NUMBERS: Record<F, number[]> = {
  '4-3-3': [1, 3, 4, 5, 2, 6, 8, 10, 11, 9, 7],
  '4-4-2': [1, 3, 4, 5, 2, 11, 8, 6, 7, 9, 10],
  '4-2-3-1': [1, 3, 4, 5, 2, 6, 8, 11, 10, 7, 9],
  '3-5-2': [1, 4, 5, 6, 3, 8, 10, 14, 2, 9, 11],
};

/**
 * Arma la plantilla: 18 nombres (11 titulares en el orden de la formación + 7 suplentes).
 * '' = hueco honesto (el juego inventa un nombre). `bonus` por nombre; `nums` fuerza dorsales por nombre.
 */
const squad = (f: F, names: string[], bonus: Record<string, number> = {}, nums: Record<string, number> = {}) => {
  const used = new Set<number>(Object.values(nums));
  const base = START_NUMBERS[f];
  let n = 12;
  return names.map((name, i) => {
    let number = nums[name] ?? 0;
    if (!number) {
      if (i < 11 && !used.has(base[i])) number = base[i];
      else { while (used.has(n)) n++; number = n; }
      used.add(number);
    }
    return { name, number, ...(name && bonus[name] ? { bonus: bonus[name] } : {}) };
  });
};
const E = '';

const teams: TeamSeed[] = [
  { id: 'co_nacional', name: 'Atlético Nacional', short: 'ATN', city: 'Medellín', crest: crest('co_nacional', '#00a14b', '#ffffff'),
    home: kit('#ffffff', '#00a14b', 'band', '#ffffff', '#ffffff', '#00a14b'), away: kit('#00a14b', '#ffffff', 'solid', '#00a14b', '#00a14b', '#ffffff'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 80, seed: 4000,
    roster: squad('4-3-3', ['Kevin Mier', E, 'William Tesillo', E, E, 'Jorman Campuzano', 'Eduard Atuesta', E, E, 'Alfredo Morelos', 'Dorlan Pabón', E, E, E, E, E, 'Marino Hinestroza', E], { 'Alfredo Morelos': 5, 'Kevin Mier': 4, 'William Tesillo': 3, 'Dorlan Pabón': 3, 'Eduard Atuesta': 3, 'Jorman Campuzano': 3, 'Marino Hinestroza': 3 }, { 'Alfredo Morelos': 9, 'Kevin Mier': 1 }) },
  { id: 'co_medellin', name: 'Independiente Medellín', short: 'DIM', city: 'Medellín', crest: crest('co_medellin', '#c8102e', '#1a2a6c'),
    home: kit('#c8102e', '#1a2a6c', 'solid', '#1a2a6c', '#c8102e', '#ffffff'), away: kit('#1a2a6c', '#c8102e', 'solid', '#1a2a6c', '#1a2a6c', '#ffffff'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 77, seed: 4001,
    roster: squad('4-3-3', [E, E, E, E, E, E, E, E, 'Dylan Borrero', 'Francisco Fydriszewski', E, E, E, E, E, E, E, E], { 'Francisco Fydriszewski': 4, 'Dylan Borrero': 3 }) },
  { id: 'co_millonarios', name: 'Millonarios', short: 'MIL', city: 'Bogotá', crest: crest('co_millonarios', '#0a3a9c', '#ffffff'),
    home: kit('#0a3a9c', '#ffffff', 'solid', '#0a3a9c', '#0a3a9c', '#ffffff'), away: kit('#ffffff', '#0a3a9c', 'solid', '#ffffff', '#ffffff', '#0a3a9c'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 79, seed: 4002,
    roster: squad('4-3-3', ['Álvaro Montero', E, 'Juan Pablo Vargas', E, E, E, E, 'Daniel Ruiz', E, 'Radamel Falcao', E, E, E, E, E, E, 'Leonardo Castro', E], { 'Radamel Falcao': 6, 'Álvaro Montero': 4, 'Juan Pablo Vargas': 3, 'Daniel Ruiz': 3, 'Leonardo Castro': 2 }, { 'Radamel Falcao': 9, 'Álvaro Montero': 1 }) },
  { id: 'co_santafe', name: 'Independiente Santa Fe', short: 'ISF', city: 'Bogotá', crest: crest('co_santafe', '#d71920', '#ffffff'),
    home: kit('#d71920', '#ffffff', 'band', '#ffffff', '#d71920', '#ffffff'), away: kit('#ffffff', '#d71920', 'solid', '#ffffff', '#ffffff', '#d71920'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 76, seed: 4003,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, 'Hugo Rodallega', E, E, E, E, E, E, E, E], { 'Hugo Rodallega': 4 }) },
  { id: 'co_america', name: 'América de Cali', short: 'AME', city: 'Cali', crest: crest('co_america', '#e2001a', '#ffffff'),
    home: kit('#e2001a', '#ffffff', 'solid', '#ffffff', '#e2001a', '#ffffff'), away: kit('#ffffff', '#e2001a', 'solid', '#ffffff', '#ffffff', '#e2001a'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 78, seed: 4004,
    roster: squad('4-4-2', ['Aldair Quintana', E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E], { 'Aldair Quintana': 3 }) },
  { id: 'co_cali', name: 'Deportivo Cali', short: 'CAL', city: 'Cali', crest: crest('co_cali', '#00a650', '#ffffff'),
    home: kit('#00a650', '#ffffff', 'stripes', '#ffffff', '#00a650', '#ffffff'), away: kit('#ffffff', '#00a650', 'solid', '#ffffff', '#ffffff', '#00a650'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 74, seed: 4005,
    roster: squad('4-3-3', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_junior', name: 'Junior de Barranquilla', short: 'JUN', city: 'Barranquilla', crest: crest('co_junior', '#e30613', '#ffffff'),
    home: kit('#e30613', '#ffffff', 'stripes', '#1b3c8c', '#e30613', '#1b3c8c'), away: kit('#1b3c8c', '#ffffff', 'solid', '#1b3c8c', '#1b3c8c', '#ffffff'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 78, seed: 4006,
    roster: squad('4-3-3', ['Santiago Mele', E, E, 'Jermein Peña', E, 'Didier Moreno', E, E, 'Yimmi Chará', 'Carlos Bacca', E, E, E, E, E, E, E, E], { 'Carlos Bacca': 5, 'Yimmi Chará': 4, 'Santiago Mele': 4, 'Didier Moreno': 3, 'Jermein Peña': 2 }, { 'Carlos Bacca': 9, 'Santiago Mele': 1 }) },
  { id: 'co_oncecaldas', name: 'Once Caldas', short: 'ONC', city: 'Manizales', crest: crest('co_oncecaldas', '#ffffff', '#111111'),
    home: kit('#ffffff', '#111111', 'stripes', '#111111', '#ffffff', '#111111'), away: kit('#111111', '#ffffff', 'solid', '#111111', '#111111', '#ffffff'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 72, seed: 4007,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, 'Dayro Moreno', E, E, E, E, E, E, E, E], { 'Dayro Moreno': 4 }, { 'Dayro Moreno': 9 }) },
  { id: 'co_tolima', name: 'Deportes Tolima', short: 'TOL', city: 'Ibagué', crest: crest('co_tolima', '#7a1230', '#f4c20d'),
    home: kit('#7a1230', '#f4c20d', 'solid', '#7a1230', '#7a1230', '#f4c20d'), away: kit('#f4c20d', '#7a1230', 'solid', '#f4c20d', '#f4c20d', '#7a1230'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 75, seed: 4008,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_bucaramanga', name: 'Atlético Bucaramanga', short: 'BUC', city: 'Bucaramanga', crest: crest('co_bucaramanga', '#f5d000', '#0a7a3d'),
    home: kit('#f5d000', '#0a7a3d', 'solid', '#0a7a3d', '#f5d000', '#0a7a3d'), away: kit('#0a7a3d', '#f5d000', 'solid', '#0a7a3d', '#0a7a3d', '#f5d000'), gkKit: GK_PURPLE,
    formation: '4-2-3-1', rating: 73, seed: 4009,
    roster: squad('4-2-3-1', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_pereira', name: 'Deportivo Pereira', short: 'PER', city: 'Pereira', crest: crest('co_pereira', '#f5c400', '#d71920'),
    home: kit('#f5c400', '#d71920', 'stripes', '#d71920', '#f5c400', '#111111'), away: kit('#111111', '#f5c400', 'solid', '#111111', '#111111', '#f5c400'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 70, seed: 4010,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_aguilas', name: 'Águilas Doradas', short: 'AGU', city: 'Rionegro', crest: crest('co_aguilas', '#f6c500', '#111111'),
    home: kit('#f6c500', '#111111', 'solid', '#111111', '#f6c500', '#111111'), away: kit('#111111', '#f6c500', 'solid', '#111111', '#111111', '#f6c500'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 69, seed: 4011,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_alianza', name: 'Alianza FC', short: 'ALI', city: 'Valledupar', crest: crest('co_alianza', '#f7d117', '#111111'),
    home: kit('#f7d117', '#111111', 'solid', '#111111', '#f7d117', '#111111'), away: kit('#111111', '#f7d117', 'solid', '#111111', '#111111', '#f7d117'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 68, seed: 4012,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_fortaleza', name: 'Fortaleza CEIF', short: 'FOR', city: 'Bogotá', crest: crest('co_fortaleza', '#1e4fa3', '#ffffff'),
    home: kit('#1e4fa3', '#ffffff', 'solid', '#1e4fa3', '#1e4fa3', '#ffffff'), away: kit('#ffffff', '#1e4fa3', 'solid', '#ffffff', '#ffffff', '#1e4fa3'), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 67, seed: 4013,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_llaneros', name: 'Llaneros FC', short: 'LLA', city: 'Villavicencio', crest: crest('co_llaneros', '#f26b1d', '#111111'),
    home: kit('#f26b1d', '#111111', 'solid', '#111111', '#f26b1d', '#111111'), away: kit('#ffffff', '#f26b1d', 'solid', '#ffffff', '#ffffff', '#f26b1d'), gkKit: GK_PURPLE,
    formation: '4-4-2', rating: 66, seed: 4014,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_chico', name: 'Boyacá Chicó', short: 'CHI', city: 'Tunja', crest: crest('co_chico', '#1b4fa8', '#ffffff'),
    home: kit('#ffffff', '#1b4fa8', 'stripes', '#1b4fa8', '#ffffff', '#1b4fa8'), away: kit('#1b4fa8', '#ffffff', 'solid', '#1b4fa8', '#1b4fa8', '#ffffff'), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 67, seed: 4015,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_jaguares', name: 'Jaguares de Córdoba', short: 'JAG', city: 'Montería', crest: crest('co_jaguares', '#f28c1b', '#111111'),
    home: kit('#f28c1b', '#111111', 'solid', '#111111', '#f28c1b', '#111111'), away: kit('#111111', '#f28c1b', 'solid', '#111111', '#111111', '#f28c1b'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 66, seed: 4016,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_pasto', name: 'Deportivo Pasto', short: 'PAS', city: 'Pasto', crest: crest('co_pasto', '#f5c400', '#0a7a3d'),
    home: kit('#f5c400', '#0a7a3d', 'solid', '#0a7a3d', '#f5c400', '#0a7a3d'), away: kit('#0a7a3d', '#f5c400', 'solid', '#0a7a3d', '#0a7a3d', '#f5c400'), gkKit: GK_PURPLE,
    formation: '4-4-2', rating: 68, seed: 4017,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_equidad', name: 'La Equidad', short: 'EQU', city: 'Bogotá', crest: crest('co_equidad', '#00843d', '#ffffff'),
    home: kit('#00843d', '#ffffff', 'solid', '#00843d', '#00843d', '#ffffff'), away: kit('#ffffff', '#00843d', 'solid', '#ffffff', '#ffffff', '#00843d'), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 67, seed: 4018,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
  { id: 'co_cucuta', name: 'Cúcuta Deportivo', short: 'CUC', city: 'Cúcuta', crest: crest('co_cucuta', '#d71920', '#111111'),
    home: kit('#d71920', '#111111', 'stripes', '#111111', '#d71920', '#ffffff'), away: kit('#ffffff', '#d71920', 'solid', '#ffffff', '#ffffff', '#d71920'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 68, seed: 4019,
    roster: squad('4-4-2', [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]) },
];

const stadiums = [
  stadium('co_atanasio_nal', 'Atanasio Girardot', 45000, 'co_nacional', { standColor: '#14452a', look: { roof: 'sides', upper: 'both', track: '#b4573f', seats: ['#00a14b', '#ffffff'] } }),
  stadium('co_atanasio_dim', 'Atanasio Girardot', 45000, 'co_medellin', { standColor: '#7a1220', look: { roof: 'sides', upper: 'both', track: '#b4573f', seats: ['#c8102e', '#1a2a6c'] } }),
  stadium('co_campin_mil', 'El Campín', 36000, 'co_millonarios', { standColor: '#0d2a66', look: { roof: 'sides', upper: 'both', seats: ['#0a3a9c', '#ffffff'] } }),
  stadium('co_campin_sf', 'El Campín', 36000, 'co_santafe', { standColor: '#6e1217', look: { roof: 'sides', upper: 'both', seats: ['#d71920', '#ffffff'] } }),
  stadium('co_pascual', 'Pascual Guerrero', 33000, 'co_america', { standColor: '#7a1220', look: { roof: 'none', upper: 'both', track: '#b4573f', seats: ['#e2001a', '#ffffff'] } }),
  stadium('co_palmaseca', 'Deportivo Cali', 42000, 'co_cali', { standColor: '#14452a', look: { roof: 'sides', upper: 'both', seats: ['#00a650', '#ffffff'] } }),
  stadium('co_metropolitano', 'Metropolitano Roberto Meléndez', 46000, 'co_junior', { standColor: '#7a1220', look: { roof: 'sides', upper: 'both', seats: ['#e30613', '#ffffff'] } }),
  stadium('co_palogrande', 'Palogrande', 28000, 'co_oncecaldas', { timeOfDay: 'day', standColor: '#2a2a2a', look: { roof: 'sides', upper: 'none', seats: ['#ffffff', '#111111'] } }),
  stadium('co_murillo', 'Manuel Murillo Toro', 28100, 'co_tolima', { standColor: '#4a1020', look: { roof: 'none', upper: 'none', seats: ['#7a1230', '#f4c20d'] } }),
  stadium('co_alfonso_lopez', 'Alfonso López', 28000, 'co_bucaramanga', { standColor: '#6b5a00', look: { roof: 'none', upper: 'none', seats: ['#f5d000', '#0a7a3d'] } }),
  stadium('co_hernan_ramirez', 'Hernán Ramírez Villegas', 30000, 'co_pereira', { standColor: '#6b3a00', look: { roof: 'none', upper: 'none', seats: ['#f5c400', '#d71920'] } }),
  stadium('co_alberto_grisales', 'Alberto Grisales', 14000, 'co_aguilas', { standColor: '#4a4000', look: { roof: 'sides', upper: 'none', seats: ['#f6c500', '#111111'] } }),
  stadium('co_armando_maestre', 'Armando Maestre Pavajeau', 12000, 'co_alianza', { timeOfDay: 'sunset', standColor: '#3a3300', look: { roof: 'none', upper: 'none', seats: ['#f7d117', '#111111'] } }),
  stadium('co_techo_for', 'Metropolitano de Techo', 8000, 'co_fortaleza', { standColor: '#14305f', look: { roof: 'none', upper: 'none', seats: ['#1e4fa3', '#ffffff'] } }),
  stadium('co_bello_horizonte', 'Bello Horizonte Rafael Calle Rojas', 15000, 'co_llaneros', { standColor: '#5a2a0a', look: { roof: 'none', upper: 'none', seats: ['#f26b1d', '#111111'] } }),
  stadium('co_independencia', 'La Independencia', 20630, 'co_chico', { timeOfDay: 'day', standColor: '#14305f', look: { roof: 'none', upper: 'none', seats: ['#1b4fa8', '#ffffff'] } }),
  stadium('co_jaraguay', 'Jaraguay', 12000, 'co_jaguares', { timeOfDay: 'sunset', standColor: '#5a3000', look: { roof: 'none', upper: 'none', seats: ['#f28c1b', '#111111'] } }),
  stadium('co_libertad', 'Libertad', 20000, 'co_pasto', { standColor: '#14452a', look: { roof: 'none', upper: 'none', seats: ['#f5c400', '#0a7a3d'] } }),
  stadium('co_techo_equ', 'Estadio de Techo', 8000, 'co_equidad', { standColor: '#14452a', look: { roof: 'none', upper: 'none', seats: ['#00843d', '#ffffff'] } }),
  stadium('co_general_santander', 'General Santander', 42000, 'co_cucuta', { standColor: '#7a1220', look: { roof: 'none', upper: 'both', track: '#b4573f', seats: ['#d71920', '#111111'] } }),
];

const classics: ClassicDef[] = [
  { a: 'co_nacional', b: 'co_medellin', name: 'Clásico paisa' },
  { a: 'co_millonarios', b: 'co_santafe', name: 'Clásico capitalino' },
  { a: 'co_america', b: 'co_cali', name: 'Clásico vallecaucano' },
  { a: 'co_nacional', b: 'co_millonarios', name: 'Clásico colombiano' },
  { a: 'co_oncecaldas', b: 'co_pereira', name: 'Clásico cafetero' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
