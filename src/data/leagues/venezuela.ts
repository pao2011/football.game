import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Liga FUTVE de Venezuela (15 clubes). Plantillas de Transfermarkt (tmRosters.ts).

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  {
    id: 've_metropolitanos', name: 'Metropolitanos FC', short: 'MET', city: 'Caracas', crest: crest('ve_metropolitanos', '#c8102e', K),
    home: kit('#c8102e', K, 'solid', K, '#c8102e', W), away: kit(W, '#c8102e', 'band', W, W, '#c8102e'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 68, seed: 10000,
  },
  {
    id: 've_academia', name: 'Academia Puerto Cabello', short: 'APC', city: 'Puerto Cabello', crest: crest('ve_academia', '#f2c230', W),
    home: kit('#f2c230', '#1b4fa0', 'solid', '#1b4fa0', '#f2c230', '#1b4fa0'), away: kit('#1b4fa0', '#f2c230', 'solid', '#1b4fa0', '#1b4fa0', '#f2c230'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 68, seed: 10001,
  },
  {
    id: 've_tachira', name: 'Deportivo Táchira', short: 'TAC', city: 'San Cristóbal', crest: crest('ve_tachira', '#f2c230', K),
    home: kit('#f2c230', K, 'stripes', K, '#f2c230', K), away: kit(K, '#f2c230', 'band', K, K, '#f2c230'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 72, seed: 10002,
  },
  {
    id: 've_monagas', name: 'Monagas SC', short: 'MON', city: 'Maturín', crest: crest('ve_monagas', '#f2c230', K),
    home: kit('#f2c230', K, 'solid', K, '#f2c230', K), away: kit(K, '#f2c230', 'solid', K, K, '#f2c230'), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 67, seed: 10003,
  },
  {
    id: 've_caracas', name: 'Caracas FC', short: 'CCS', city: 'Caracas', crest: crest('ve_caracas', '#c8102e', K),
    home: kit('#c8102e', K, 'solid', W, '#c8102e', W), away: kit(W, '#c8102e', 'band', W, W, '#c8102e'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 72, seed: 10004,
  },
  {
    id: 've_carabobo', name: 'Carabobo FC', short: 'CAR', city: 'Valencia', crest: crest('ve_carabobo', '#8a1c2b', W),
    home: kit('#8a1c2b', W, 'solid', W, '#8a1c2b', W), away: kit(W, '#8a1c2b', 'solid', W, W, '#8a1c2b'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 66, seed: 10005,
  },
  {
    id: 've_zamora', name: 'Zamora FC', short: 'ZAM', city: 'Barinas', crest: crest('ve_zamora', '#111111', W),
    home: kit(W, K, 'stripes', K, W, K), away: kit(K, W, 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 70, seed: 10006,
  },
  {
    id: 've_laguaira', name: 'Deportivo La Guaira', short: 'DLG', city: 'La Guaira', crest: crest('ve_laguaira', '#4aa3df', W),
    home: kit('#4aa3df', W, 'solid', W, '#4aa3df', W), away: kit(W, '#4aa3df', 'band', W, W, '#4aa3df'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 68, seed: 10007,
  },
  {
    id: 've_estudiantes', name: 'Estudiantes de Mérida', short: 'EDM', city: 'Mérida', crest: crest('ve_estudiantes', '#c8102e', W),
    home: kit('#c8102e', W, 'stripes', W, '#c8102e', '#c8102e'), away: kit(W, '#c8102e', 'solid', W, W, '#c8102e'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 67, seed: 10008,
  },
  {
    id: 've_portuguesa', name: 'Portuguesa FC', short: 'POR', city: 'Acarigua', crest: crest('ve_portuguesa', '#0a7a3a', W),
    home: kit('#0a7a3a', W, 'solid', W, '#0a7a3a', W), away: kit(W, '#0a7a3a', 'band', W, W, '#0a7a3a'), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 65, seed: 10009,
  },
  {
    id: 've_ucv', name: 'Universidad Central de Venezuela', short: 'UCV', city: 'Caracas', crest: crest('ve_ucv', '#c8102e', W),
    home: kit('#c8102e', W, 'solid', '#c8102e', '#c8102e', W), away: kit(W, '#c8102e', 'solid', W, W, '#c8102e'), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 64, seed: 10010,
  },
  {
    id: 've_mineros', name: 'Mineros de Guayana', short: 'MIN', city: 'Puerto Ordaz', crest: crest('ve_mineros', '#c8102e', K),
    home: kit('#c8102e', K, 'stripes', K, '#c8102e', W), away: kit(K, '#c8102e', 'solid', K, K, '#c8102e'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 68, seed: 10011,
  },
  {
    id: 've_rayo', name: 'Rayo Zuliano', short: 'RAY', city: 'Maracaibo', crest: crest('ve_rayo', '#1b4fa0', W),
    home: kit('#1b4fa0', W, 'solid', '#1b4fa0', '#1b4fa0', W), away: kit(W, '#1b4fa0', 'band', W, W, '#1b4fa0'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 64, seed: 10012,
  },
  {
    id: 've_anzoategui', name: 'Anzoátegui FC', short: 'ANZ', city: 'Puerto La Cruz', crest: crest('ve_anzoategui', '#8a1c2b', W),
    home: kit('#8a1c2b', W, 'solid', '#8a1c2b', '#8a1c2b', W), away: kit(W, '#8a1c2b', 'solid', W, W, '#8a1c2b'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 64, seed: 10013,
  },
  {
    id: 've_trujillanos', name: 'Trujillanos FC', short: 'TRU', city: 'Valera', crest: crest('ve_trujillanos', '#8a1c2b', W),
    home: kit(W, '#8a1c2b', 'stripes', '#8a1c2b', W, '#8a1c2b'), away: kit('#8a1c2b', W, 'solid', '#8a1c2b', '#8a1c2b', W), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 63, seed: 10014,
  },
];

const stadiums: StadiumData[] = [
  stadium('ve_olimpico_met', 'Estadio Olímpico de la Ciudad Universitaria', 24900, 've_metropolitanos', { standColor: '#7a1a1a', look: { roof: 'none', upper: 'both', seats: ['#c8102e', K, W] } }),
  stadium('ve_vistamar', 'Complejo Deportivo Vistamar', 8000, 've_academia', { standColor: '#7a6a1a', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#f2c230', '#1b4fa0'] } }),
  stadium('ve_pueblo_nuevo', 'Estadio Polideportivo de Pueblo Nuevo', 38755, 've_tachira', { standColor: '#7a6a1a', look: { roof: 'none', upper: 'both', seats: ['#f2c230', K] } }),
  stadium('ve_monumental_maturin', 'Estadio Monumental de Maturín', 51796, 've_monagas', { standColor: '#7a6a1a', look: { roof: 'ring', upper: 'both', seats: ['#f2c230', K] } }),
  stadium('ve_olimpico_ccs', 'Estadio Olímpico de la Ciudad Universitaria', 23940, 've_caracas', { standColor: '#7a1a1a', look: { roof: 'none', upper: 'both', seats: ['#c8102e', W] } }),
  stadium('ve_misael_delgado', 'Polideportivo Misael Delgado', 10000, 've_carabobo', { standColor: '#5a1a24', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#8a1c2b', W] } }),
  stadium('ve_agustin_tovar', 'Estadio Agustín Tovar', 29800, 've_zamora', { standColor: '#2a2a2a', look: { roof: 'none', upper: 'both', seats: [K, W] } }),
  stadium('ve_olimpico_dlg', 'Estadio Olímpico de la Ciudad Universitaria', 24900, 've_laguaira', { standColor: '#2a5a7a', look: { roof: 'none', upper: 'both', seats: ['#4aa3df', W] } }),
  stadium('ve_metropolitano_merida', 'Estadio Metropolitano de Mérida', 42200, 've_estudiantes', { standColor: '#7a1a1a', look: { roof: 'sides', upper: 'both', seats: ['#c8102e', W] } }),
  stadium('ve_jose_antonio_paez', 'Estadio General José Antonio Páez', 14100, 've_portuguesa', { standColor: '#1d5a34', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#0a7a3a', W] } }),
  stadium('ve_olimpico_ucv', 'Estadio Olímpico de la Ciudad Universitaria', 24900, 've_ucv', { standColor: '#7a1a1a', look: { roof: 'none', upper: 'both', seats: ['#c8102e', W] } }),
  stadium('ve_cachamay', 'CTE Cachamay', 41600, 've_mineros', { standColor: '#7a1a1a', look: { roof: 'none', upper: 'both', seats: ['#c8102e', K] } }),
  stadium('ve_jose_encarnacion', 'Estadio José Encarnación', 40800, 've_rayo', { standColor: '#14245f', look: { roof: 'none', upper: 'both', seats: ['#1b4fa0', W] } }),
  stadium('ve_jose_antonio_anzoategui', 'Estadio José Antonio Anzoátegui', 37485, 've_anzoategui', { standColor: '#5a1a24', look: { roof: 'ring', upper: 'both', seats: ['#8a1c2b', W] } }),
  stadium('ve_jose_alberto_perez', 'Estadio José Alberto Pérez', 25000, 've_trujillanos', { standColor: '#5a1a24', look: { roof: 'none', upper: 'both', seats: ['#8a1c2b', W] } }),
];

const classics: ClassicDef[] = [
  { a: 've_caracas', b: 've_tachira', name: 'Clásico Nacional' },
  { a: 've_caracas', b: 've_ucv', name: 'Clásico Capitalino' },
  { a: 've_caracas', b: 've_laguaira', name: 'Clásico Capitalino' },
  { a: 've_tachira', b: 've_estudiantes', name: 'Clásico Andino' },
  { a: 've_tachira', b: 've_trujillanos', name: 'Clásico Andino' },
  { a: 've_estudiantes', b: 've_trujillanos', name: 'Clásico Andino' },
  { a: 've_portuguesa', b: 've_zamora', name: 'Clásico Llanero' },
  { a: 've_anzoategui', b: 've_monagas', name: 'Clásico Oriental' },
  { a: 've_carabobo', b: 've_academia', name: 'Clásico Carabobeño' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
