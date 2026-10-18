import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// LigaPro Serie A de Ecuador 2026 (16 clubes). Plantillas de Transfermarkt (tmRosters.ts).
const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  { id: 'ec_idv', name: 'Independiente del Valle', short: 'IDV', city: 'Sangolquí', crest: crest('ec_idv', '#111827', '#1d5fd1'),
    home: kit(K,'#1d5fd1','band',K,K,W), away: kit(W,'#1d5fd1','solid',W,W,K), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 60, seed: 8000 },
  { id: 'ec_ldu', name: 'LDU Quito', short: 'LDU', city: 'Quito', crest: crest('ec_ldu', '#ffffff', '#1b2a6b'),
    home: kit(W,'#1b2a6b','solid',W,W,'#1b2a6b'), away: kit('#1b2a6b','#d71920','solid','#1b2a6b','#1b2a6b',W), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 61, seed: 8001 },
  { id: 'ec_ucatolica', name: 'Universidad Católica', short: 'UCA', city: 'Quito', crest: crest('ec_ucatolica', '#1d4fb0', '#ffffff'),
    home: kit('#1d4fb0',W,'solid',W,'#1d4fb0',W), away: kit(W,'#1d4fb0','solid',W,W,'#1d4fb0'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 62, seed: 8002 },
  { id: 'ec_emelec', name: 'Emelec', short: 'EME', city: 'Guayaquil', crest: crest('ec_emelec', '#1c3f9e', '#ffffff'),
    home: kit('#1c3f9e',W,'solid','#1c3f9e','#1c3f9e',W), away: kit(W,'#1c3f9e','solid',W,W,'#1c3f9e'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 63, seed: 8003 },
  { id: 'ec_barcelona', name: 'Barcelona SC', short: 'BSC', city: 'Guayaquil', crest: crest('ec_barcelona', '#f6c700', '#d71920'),
    home: kit('#f6c700','#d71920','solid',K,'#f6c700',K), away: kit(K,'#f6c700','solid',K,K,'#f6c700'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 64, seed: 8004 },
  { id: 'ec_aucas', name: 'Aucas', short: 'AUC', city: 'Quito', crest: crest('ec_aucas', '#f6c700', '#d71920'),
    home: kit('#f6c700','#d71920','solid','#d71920','#f6c700','#d71920'), away: kit('#d71920','#f6c700','solid','#d71920','#d71920',W), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 65, seed: 8005 },
  { id: 'ec_macara', name: 'Macará', short: 'MAC', city: 'Ambato', crest: crest('ec_macara', '#1d4fb0', '#f6c700'),
    home: kit('#1d4fb0','#f6c700','solid','#1d4fb0','#1d4fb0','#f6c700'), away: kit('#f6c700','#1d4fb0','solid','#f6c700','#f6c700','#1d4fb0'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 66, seed: 8006 },
  { id: 'ec_orense', name: 'Orense', short: 'ORE', city: 'Machala', crest: crest('ec_orense', '#f6c700', '#1b2a6b'),
    home: kit('#f6c700','#1b2a6b','solid','#1b2a6b','#f6c700','#1b2a6b'), away: kit('#1b2a6b','#f6c700','solid','#1b2a6b','#1b2a6b',W), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 67, seed: 8007 },
  { id: 'ec_cuenca', name: 'Deportivo Cuenca', short: 'CUE', city: 'Cuenca', crest: crest('ec_cuenca', '#d71920', '#111111'),
    home: kit('#d71920',K,'solid',K,'#d71920',W), away: kit(W,'#d71920','solid',W,W,'#d71920'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 68, seed: 8008 },
  { id: 'ec_guayaquilcity', name: 'Guayaquil City', short: 'GYC', city: 'Guayaquil', crest: crest('ec_guayaquilcity', '#1b2a6b', '#d71920'),
    home: kit('#1b2a6b','#d71920','solid','#1b2a6b','#1b2a6b',W), away: kit(W,'#1b2a6b','solid',W,W,'#d71920'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 69, seed: 8009 },
  { id: 'ec_leones', name: 'Leones del Norte', short: 'LEO', city: 'Ibarra', crest: crest('ec_leones', '#d71920', '#111111'),
    home: kit('#d71920',K,'solid',K,'#d71920',W), away: kit(W,'#d71920','solid',W,W,'#d71920'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 70, seed: 8010 },
  { id: 'ec_libertad', name: 'Libertad', short: 'LIB', city: 'Loja', crest: crest('ec_libertad', '#1d4fb0', '#d71920'),
    home: kit('#1d4fb0',W,'solid','#1d4fb0','#1d4fb0',W), away: kit(W,'#1d4fb0','solid',W,W,'#1d4fb0'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 71, seed: 8011 },
  { id: 'ec_mushuc', name: 'Mushuc Runa', short: 'MUS', city: 'Ambato', crest: crest('ec_mushuc', '#4aa8e0', '#ffffff'),
    home: kit('#4aa8e0',W,'solid',W,'#4aa8e0',W), away: kit(W,'#4aa8e0','solid',W,W,'#4aa8e0'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 72, seed: 8012 },
  { id: 'ec_delfin', name: 'Delfín', short: 'DEL', city: 'Manta', crest: crest('ec_delfin', '#1b4fa0', '#f6c700'),
    home: kit('#1b4fa0','#f6c700','solid','#1b4fa0','#1b4fa0','#f6c700'), away: kit('#f6c700','#1b4fa0','solid','#f6c700','#f6c700','#1b4fa0'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 73, seed: 8013 },
  { id: 'ec_tecnico', name: 'Técnico Universitario', short: 'TEC', city: 'Ambato', crest: crest('ec_tecnico', '#d71920', '#1b2a6b'),
    home: kit('#d71920',W,'solid','#d71920','#d71920',W), away: kit(W,'#d71920','solid',W,W,'#d71920'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 74, seed: 8014 },
  { id: 'ec_manta', name: 'Manta FC', short: 'MFC', city: 'Manta', crest: crest('ec_manta', '#f6c700', '#111111'),
    home: kit('#f6c700',K,'solid',K,'#f6c700',K), away: kit(K,'#f6c700','solid',K,K,'#f6c700'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 60, seed: 8015 },
];

const stadiums: StadiumData[] = [
  stadium('ecs_idv', "Estadio Banco Guayaquil", 12000, 'ec_idv', { look: { roof: 'ring', upper: 'none', seats: ['#1d5fd1','#111827'] }, standColor: '#1f2937' }),
  stadium('ecs_ldu', "Rodrigo Paz Delgado", 45575, 'ec_ldu', { look: { roof: 'ring', upper: 'both', seats: ['#ffffff','#1b2a6b'] } }),
  stadium('ecs_ucatolica', "Olímpico Atahualpa", 39861, 'ec_ucatolica', { look: { roof: 'sides', upper: 'both', seats: ['#1d4fb0','#ffffff'] } }),
  stadium('ecs_emelec', "Estadio George Capwell", 40000, 'ec_emelec', { look: { roof: 'sides', upper: 'both', seats: ['#1c3f9e','#ffffff'] } }),
  stadium('ecs_barcelona', "Monumental Banco Pichincha", 57267, 'ec_barcelona', { look: { roof: 'ring', upper: 'both', seats: ['#f6c700','#111111'] } }),
  stadium('ecs_aucas', "Estadio Gonzalo Pozo Ripalda", 18799, 'ec_aucas', { look: { roof: 'sides', upper: 'none', seats: ['#f6c700','#d71920'] } }),
  stadium('ecs_macara', "Estadio Bellavista", 18000, 'ec_macara', { look: { roof: 'none', upper: 'none', seats: ['#1d4fb0','#f6c700'] } }),
  stadium('ecs_orense', "Estadio 9 de Mayo", 16456, 'ec_orense', { look: { roof: 'sides', upper: 'none', seats: ['#f6c700','#1b2a6b'] } }),
  stadium('ecs_cuenca', "Estadio Alejandro Serrano Aguilar", 22000, 'ec_cuenca', { look: { roof: 'sides', upper: 'none', seats: ['#d71920','#111111'] } }),
  stadium('ecs_guayaquilcity', "Estadio Christian Benítez Betancourt", 10152, 'ec_guayaquilcity', { look: { roof: 'none', upper: 'none', seats: ['#1b2a6b','#d71920'] } }),
  stadium('ecs_leones', "Estadio Olímpico de Ibarra", 18600, 'ec_leones', { look: { roof: 'none', upper: 'none', seats: ['#d71920','#8a8f99'] } }),
  stadium('ecs_libertad', "Estadio Federativo Reina del Cisne", 14935, 'ec_libertad', { look: { roof: 'sides', upper: 'none', seats: ['#1d4fb0','#d71920'] } }),
  stadium('ecs_mushuc', "Estadio Olímpico de Riobamba", 14400, 'ec_mushuc', { look: { roof: 'none', upper: 'none', seats: ['#4aa8e0','#ffffff'] } }),
  stadium('ecs_delfin', "Estadio Jocay", 21000, 'ec_delfin', { look: { roof: 'sides', upper: 'none', seats: ['#1b4fa0','#f6c700'] } }),
  stadium('ecs_tecnico', "Estadio Bellavista", 18000, 'ec_tecnico', { look: { roof: 'none', upper: 'none', seats: ['#d71920','#8a8f99'] } }),
  stadium('ecs_manta', "Estadio Jocay", 17834, 'ec_manta', { look: { roof: 'sides', upper: 'none', seats: ['#f6c700','#111111'] } }),
];

const classics: ClassicDef[] = [
  { a: 'ec_barcelona', b: 'ec_emelec', name: 'Clásico del Astillero' },
  { a: 'ec_ldu', b: 'ec_ucatolica', name: 'Clásico Universitario' },
  { a: 'ec_ldu', b: 'ec_aucas', name: 'Clásico Capitalino' },
  { a: 'ec_aucas', b: 'ec_ucatolica', name: 'Clásico Quiteño' },
  { a: 'ec_macara', b: 'ec_tecnico', name: 'Clásico Ambateño' },
  { a: 'ec_macara', b: 'ec_mushuc', name: 'Clásico Ambateño' },
  { a: 'ec_delfin', b: 'ec_manta', name: 'Clásico Manabita' },
  { a: 'ec_barcelona', b: 'ec_guayaquilcity', name: 'Clásico Guayaquileño' },
  { a: 'ec_ldu', b: 'ec_barcelona', name: 'Clásico del Ecuador' },
  { a: 'ec_ldu', b: 'ec_emelec', name: 'Clásico Nacional' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
