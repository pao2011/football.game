import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// LaLiga 2026/27 (20 equipos). Escudos de Transfermarkt (src/assets/crests/es_*.webp).

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  {
    id: 'es_realmadrid', name: 'Real Madrid', short: 'RMA', city: 'Madrid', crest: crest('es_realmadrid', W, '#febe10'),
    home: kit(W, '#febe10', 'solid', W, W, '#1a1a2e'), away: kit('#1a1f3a', '#00c3b0', 'solid', '#1a1f3a', '#1a1f3a', W), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 84, seed: 12000,
  },
  {
    id: 'es_barcelona', name: 'FC Barcelona', short: 'BAR', city: 'Barcelona', crest: crest('es_barcelona', '#a50044', '#004d98'),
    home: kit('#a50044', '#004d98', 'stripes', '#004d98', '#a50044', '#edbb00'), away: kit('#f2c230', '#a50044', 'solid', '#f2c230', '#f2c230', '#a50044'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 84, seed: 12001,
  },
  {
    id: 'es_atletico', name: 'Atlético de Madrid', short: 'ATM', city: 'Madrid', crest: crest('es_atletico', '#cb3524', W),
    home: kit('#cb3524', W, 'stripes', '#1b3c8c', '#1b3c8c', W), away: kit('#1b2a4a', '#cb3524', 'solid', '#1b2a4a', '#1b2a4a', W), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 82, seed: 12002,
  },
  {
    id: 'es_villarreal', name: 'Villarreal', short: 'VIL', city: 'Villarreal', crest: crest('es_villarreal', '#f7d117', '#005187'),
    home: kit('#f7d117', '#005187', 'solid', '#005187', '#f7d117', '#005187'), away: kit('#1b1b1b', '#f7d117', 'solid', '#1b1b1b', '#1b1b1b', '#f7d117'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 76, seed: 12003,
  },
  {
    id: 'es_realsociedad', name: 'Real Sociedad', short: 'RSO', city: 'San Sebastián', crest: crest('es_realsociedad', '#0067b1', W),
    home: kit(W, '#0067b1', 'stripes', '#0b2a5a', W, '#0067b1'), away: kit('#0b2a5a', '#f7d117', 'solid', '#0b2a5a', '#0b2a5a', W), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 76, seed: 12004,
  },
  {
    id: 'es_betis', name: 'Real Betis', short: 'BET', city: 'Sevilla', crest: crest('es_betis', '#0bb363', W),
    home: kit(W, '#0bb363', 'stripes', W, W, '#0bb363'), away: kit('#1b1b1b', '#0bb363', 'solid', '#1b1b1b', '#1b1b1b', '#0bb363'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 77, seed: 12005,
  },
  {
    id: 'es_athletic', name: 'Athletic Club', short: 'ATH', city: 'Bilbao', crest: crest('es_athletic', '#e30613', W),
    home: kit('#e30613', W, 'stripes', '#111111', '#e30613', W), away: kit('#1b2a4a', '#e30613', 'solid', '#1b2a4a', '#1b2a4a', W), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 77, seed: 12006,
  },
  {
    id: 'es_celta', name: 'Celta de Vigo', short: 'CEL', city: 'Vigo', crest: crest('es_celta', '#8ac3ee', W),
    home: kit('#8ac3ee', W, 'solid', W, '#8ac3ee', '#e30613'), away: kit('#1b1b3a', '#8ac3ee', 'solid', '#1b1b3a', '#1b1b3a', W), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 72, seed: 12007,
  },
  {
    id: 'es_sevilla', name: 'Sevilla FC', short: 'SEV', city: 'Sevilla', crest: crest('es_sevilla', W, '#d71920'),
    home: kit(W, '#d71920', 'solid', W, W, '#d71920'), away: kit('#1b1b1b', '#d71920', 'solid', '#1b1b1b', '#1b1b1b', W), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 75, seed: 12008,
  },
  {
    id: 'es_valencia', name: 'Valencia CF', short: 'VAL', city: 'Valencia', crest: crest('es_valencia', W, '#111111'),
    home: kit(W, '#111111', 'solid', '#111111', W, '#ee7203'), away: kit('#111111', '#ee7203', 'solid', '#111111', '#111111', '#ee7203'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 74, seed: 12009,
  },
  {
    id: 'es_espanyol', name: 'RCD Espanyol', short: 'ESP', city: 'Cornellà de Llobregat', crest: crest('es_espanyol', '#0b5ba8', W),
    home: kit('#0b5ba8', W, 'stripes', W, '#0b5ba8', W), away: kit('#1b1b1b', '#0b5ba8', 'solid', '#1b1b1b', '#1b1b1b', W), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 70, seed: 12010,
  },
  {
    id: 'es_deportivo', name: 'Deportivo de La Coruña', short: 'DEP', city: 'A Coruña', crest: crest('es_deportivo', '#0b5ba8', W),
    home: kit(W, '#0b5ba8', 'stripes', W, W, '#0b5ba8'), away: kit('#1b2a5a', '#f7d117', 'solid', '#1b2a5a', '#1b2a5a', W), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 69, seed: 12011,
  },
  {
    id: 'es_racing', name: 'Racing de Santander', short: 'RAC', city: 'Santander', crest: crest('es_racing', '#1a8a3c', W),
    home: kit('#1a8a3c', W, 'solid', W, '#1a8a3c', W), away: kit(W, '#1a8a3c', 'band', W, W, '#1a8a3c'), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 66, seed: 12012,
  },
  {
    id: 'es_rayo', name: 'Rayo Vallecano', short: 'RAY', city: 'Madrid', crest: crest('es_rayo', W, '#e30613'),
    home: kit(W, '#e30613', 'sash', W, W, '#e30613'), away: kit('#e30613', W, 'solid', '#e30613', '#e30613', W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 70, seed: 12013,
  },
  {
    id: 'es_getafe', name: 'Getafe CF', short: 'GET', city: 'Getafe', crest: crest('es_getafe', '#0a3a8f', W),
    home: kit('#0a3a8f', W, 'solid', '#0a3a8f', '#0a3a8f', W), away: kit(W, '#0a3a8f', 'solid', W, W, '#0a3a8f'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 69, seed: 12014,
  },
  {
    id: 'es_levante', name: 'Levante UD', short: 'LEV', city: 'Valencia', crest: crest('es_levante', '#a50044', '#004d98'),
    home: kit('#a50044', '#004d98', 'stripes', '#004d98', '#a50044', W), away: kit('#1b1b1b', '#a50044', 'solid', '#1b1b1b', '#1b1b1b', W), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 66, seed: 12015,
  },
  {
    id: 'es_osasuna', name: 'CA Osasuna', short: 'OSA', city: 'Pamplona', crest: crest('es_osasuna', '#d71920', '#0a1a4a'),
    home: kit('#d71920', '#0a1a4a', 'solid', '#0a1a4a', '#d71920', W), away: kit('#0a1a4a', '#d71920', 'solid', '#0a1a4a', '#0a1a4a', W), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 69, seed: 12016,
  },
  {
    id: 'es_elche', name: 'Elche CF', short: 'ELC', city: 'Elche', crest: crest('es_elche', W, '#0a8f3c'),
    home: kit(W, '#0a8f3c', 'sash', W, W, '#0a8f3c'), away: kit('#0a8f3c', W, 'solid', '#0a8f3c', '#0a8f3c', W), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 65, seed: 12017,
  },
  {
    id: 'es_alaves', name: 'Deportivo Alavés', short: 'ALA', city: 'Vitoria-Gasteiz', crest: crest('es_alaves', '#0b4fa0', W),
    home: kit('#0b4fa0', W, 'stripes', '#0b4fa0', '#0b4fa0', W), away: kit('#1b1b1b', '#0b4fa0', 'solid', '#1b1b1b', '#1b1b1b', W), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 67, seed: 12018,
  },
  {
    id: 'es_malaga', name: 'Málaga CF', short: 'MAL', city: 'Málaga', crest: crest('es_malaga', '#4aa3df', W),
    home: kit('#4aa3df', W, 'solid', W, '#4aa3df', W), away: kit('#1b2a5a', '#4aa3df', 'solid', '#1b2a5a', '#1b2a5a', W), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 65, seed: 12019,
  },
];

const stadiums: StadiumData[] = [
  stadium('es_est_realmadrid', "Santiago Bernabéu", 83186, 'es_realmadrid', { standColor: '#2a2f55', look: { roof: 'ring', upper: 'both', seats: [W, '#febe10'] } }),
  stadium('es_est_barcelona', "Spotify Camp Nou", 62657, 'es_barcelona', { standColor: '#2a3050', look: { roof: 'ring', upper: 'both', seats: ['#a50044', '#004d98'] } }),
  stadium('es_est_atletico', "Riyadh Air Metropolitano", 70813, 'es_atletico', { standColor: '#4a2a2a', look: { roof: 'ring', upper: 'both', seats: ['#cb3524', W] } }),
  stadium('es_est_villarreal', "La Cerámica", 23500, 'es_villarreal', { standColor: '#3a3a22', look: { roof: 'ring', upper: 'near', seats: ['#f7d117', '#005187'] } }),
  stadium('es_est_realsociedad', "Anoeta", 40000, 'es_realsociedad', { standColor: '#26334a', look: { roof: 'ring', upper: 'both', seats: ['#0067b1', W] } }),
  stadium('es_est_betis', "La Cartuja", 71374, 'es_betis', { standColor: '#2a3a32', look: { roof: 'ring', upper: 'both', seats: ['#0bb363', W] } }),
  stadium('es_est_athletic', "San Mamés", 53289, 'es_athletic', { standColor: '#4a2a2e', look: { roof: 'ring', upper: 'both', seats: ['#e30613', W] } }),
  stadium('es_est_celta', "Abanca Balaídos", 23432, 'es_celta', { standColor: '#2a3a4a', look: { roof: 'ring', upper: 'near', seats: ['#8ac3ee', W] } }),
  stadium('es_est_sevilla', "Ramón Sánchez-Pizjuán", 43751, 'es_sevilla', { standColor: '#3a2a2a', look: { roof: 'ring', upper: 'both', seats: ['#d71920', W] } }),
  stadium('es_est_valencia', "Mestalla", 49430, 'es_valencia', { standColor: '#33333a', look: { roof: 'ring', upper: 'both', seats: ['#ee7203', '#111111'] } }),
  stadium('es_est_espanyol', "RCDE Stadium", 37776, 'es_espanyol', { standColor: '#26334a', look: { roof: 'ring', upper: 'near', seats: ['#0b5ba8', W] } }),
  stadium('es_est_deportivo', "Abanca Riazor", 32912, 'es_deportivo', { standColor: '#26334a', look: { roof: 'ring', upper: 'near', seats: ['#0b5ba8', W] } }),
  stadium('es_est_racing', "El Sardinero", 22514, 'es_racing', { standColor: '#22402a', look: { roof: 'ring', upper: 'near', seats: ['#1a8a3c', W] } }),
  stadium('es_est_rayo', "Estadio de Vallecas", 14708, 'es_rayo', { standColor: '#3a2a2a', look: { roof: 'none', upper: 'none', seats: ['#e30613', W] } }),
  stadium('es_est_getafe', "Coliseum", 16800, 'es_getafe', { standColor: '#26334a', look: { roof: 'none', upper: 'none', seats: ['#0a3a8f', W] } }),
  stadium('es_est_levante', "Ciutat de València", 26354, 'es_levante', { standColor: '#3a2a3a', look: { roof: 'ring', upper: 'near', seats: ['#a50044', '#004d98'] } }),
  stadium('es_est_osasuna', "El Sadar", 23576, 'es_osasuna', { standColor: '#3a2a2e', look: { roof: 'ring', upper: 'near', seats: ['#d71920', '#0a1a4a'] } }),
  stadium('es_est_elche', "Manuel Martínez Valero", 31388, 'es_elche', { standColor: '#2a3a30', look: { roof: 'ring', upper: 'both', seats: ['#0a8f3c', W] } }),
  stadium('es_est_alaves', "Mendizorroza", 19840, 'es_alaves', { standColor: '#26334a', look: { roof: 'ring', upper: 'near', seats: ['#0b4fa0', W] } }),
  stadium('es_est_malaga', "La Rosaleda", 30044, 'es_malaga', { standColor: '#2a3a4a', look: { roof: 'ring', upper: 'both', seats: ['#4aa3df', W] } }),
];

const classics: ClassicDef[] = [
  { a: 'es_realmadrid', b: 'es_barcelona', name: 'El Clásico' },
  { a: 'es_realmadrid', b: 'es_atletico', name: 'Derbi madrileño' },
  { a: 'es_atletico', b: 'es_barcelona', name: 'Atlético - Barça' },
  { a: 'es_sevilla', b: 'es_betis', name: 'Derbi sevillano' },
  { a: 'es_athletic', b: 'es_realsociedad', name: 'Derbi vasco' },
  { a: 'es_athletic', b: 'es_alaves', name: 'Derbi vasco' },
  { a: 'es_realsociedad', b: 'es_osasuna', name: 'Derbi del norte' },
  { a: 'es_barcelona', b: 'es_espanyol', name: 'Derbi barcelonés' },
  { a: 'es_valencia', b: 'es_levante', name: 'Derbi valenciano' },
  { a: 'es_valencia', b: 'es_villarreal', name: 'Derbi de la Comunitat' },
  { a: 'es_celta', b: 'es_deportivo', name: 'Derbi gallego' },
  { a: 'es_rayo', b: 'es_getafe', name: 'Derbi del sur de Madrid' },
  { a: 'es_realmadrid', b: 'es_rayo', name: 'Derbi madrileño' },
  { a: 'es_atletico', b: 'es_rayo', name: 'Derbi madrileño' },
  { a: 'es_betis', b: 'es_malaga', name: 'Derbi andaluz' },
  { a: 'es_sevilla', b: 'es_malaga', name: 'Derbi andaluz' },
  { a: 'es_elche', b: 'es_levante', name: 'Derbi valenciano' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
