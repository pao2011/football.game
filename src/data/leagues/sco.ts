import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE, GK_BLACK } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Scottish Premiership 2026/27 (12 equipos). Plantillas de Transfermarkt (tmRosters.ts).

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  {
    id: 'sc_celtic', name: 'Celtic', short: 'CEL', city: 'Glasgow', crest: crest('sc_celtic', '#0a8f3c', W),
    home: kit(W, '#0a8f3c', 'hoops', W, W, '#0a8f3c'), away: kit('#1a1a1a', '#0a8f3c', 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 78, seed: 20001,
  },
  {
    id: 'sc_rangers', name: 'Rangers', short: 'RAN', city: 'Glasgow', crest: crest('sc_rangers', '#1b4fa0', W),
    home: kit('#1b4fa0', '#c8102e', 'solid', W, K, W), away: kit(W, '#1b4fa0', 'solid', W, W, '#1b4fa0'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 76, seed: 20002,
  },
  {
    id: 'sc_hearts', name: 'Heart of Midlothian', short: 'HEA', city: 'Edinburgh', crest: crest('sc_hearts', '#7a1230', W),
    home: kit('#7a1230', W, 'solid', W, '#7a1230', W), away: kit(W, '#7a1230', 'solid', W, W, '#7a1230'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 72, seed: 20003,
  },
  {
    id: 'sc_hibernian', name: 'Hibernian', short: 'HIB', city: 'Edinburgh', crest: crest('sc_hibernian', '#0a8f3c', W),
    home: kit('#0a8f3c', W, 'band', W, '#0a8f3c', W), away: kit('#1b2a4a', '#0a8f3c', 'solid', '#1b2a4a', '#1b2a4a', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 70, seed: 20004,
  },
  {
    id: 'sc_aberdeen', name: 'Aberdeen', short: 'ABE', city: 'Aberdeen', crest: crest('sc_aberdeen', '#d71920', W),
    home: kit('#d71920', W, 'solid', '#d71920', '#d71920', W), away: kit('#f2f2f2', '#d71920', 'solid', W, W, '#d71920'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 69, seed: 20005,
  },
  {
    id: 'sc_motherwell', name: 'Motherwell', short: 'MOT', city: 'Motherwell', crest: crest('sc_motherwell', '#f5b800', '#7a1230'),
    home: kit('#f5b800', '#7a1230', 'band', '#7a1230', '#f5b800', '#7a1230'), away: kit('#7a1230', '#f5b800', 'solid', '#7a1230', '#7a1230', '#f5b800'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 66, seed: 20006,
  },
  {
    id: 'sc_dundeeutd', name: 'Dundee United', short: 'DUN', city: 'Dundee', crest: crest('sc_dundeeutd', '#f58220', K),
    home: kit('#f58220', K, 'solid', '#f58220', '#f58220', K), away: kit(K, '#f58220', 'solid', K, K, '#f58220'), gkKit: GK_PURPLE,
    formation: '4-3-3', rating: 66, seed: 20007,
  },
  {
    id: 'sc_stmirren', name: 'St. Mirren', short: 'STM', city: 'Paisley', crest: crest('sc_stmirren', K, W),
    home: kit(K, W, 'stripes', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 64, seed: 20008,
  },
  {
    id: 'sc_dundee', name: 'Dundee', short: 'DFC', city: 'Dundee', crest: crest('sc_dundee', '#1b2f6b', W),
    home: kit('#1b2f6b', W, 'solid', W, '#1b2f6b', W), away: kit('#e8d800', '#1b2f6b', 'solid', '#1b2f6b', '#e8d800', '#1b2f6b'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 64, seed: 20009,
  },
  {
    id: 'sc_kilmarnock', name: 'Kilmarnock', short: 'KIL', city: 'Kilmarnock', crest: crest('sc_kilmarnock', '#1b4fa0', W),
    home: kit(W, '#1b4fa0', 'stripes', W, W, '#1b4fa0'), away: kit('#1b4fa0', W, 'solid', '#1b4fa0', '#1b4fa0', W), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 63, seed: 20010,
  },
  {
    id: 'sc_stjohnstone', name: 'St. Johnstone', short: 'STJ', city: 'Perth', crest: crest('sc_stjohnstone', '#1b4fa0', W),
    home: kit('#1b4fa0', W, 'solid', W, '#1b4fa0', W), away: kit('#e8d800', '#1b4fa0', 'solid', '#1b4fa0', '#e8d800', '#1b4fa0'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 62, seed: 20011,
  },
  {
    id: 'sc_falkirk', name: 'Falkirk', short: 'FAL', city: 'Falkirk', crest: crest('sc_falkirk', '#1b2f6b', W),
    home: kit('#1b2f6b', W, 'solid', W, '#1b2f6b', W), away: kit(W, '#1b2f6b', 'solid', W, W, '#1b2f6b'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 61, seed: 20012,
  },
];

const stadiums: StadiumData[] = [
  stadium('sc_est_celtic', 'Celtic Park', 60411, 'sc_celtic', { standColor: '#0d4a22', look: { roof: 'ring', upper: 'both', seats: ['#0a8f3c', W] } }),
  stadium('sc_est_ibrox', 'Ibrox Stadium', 51700, 'sc_rangers', { standColor: '#14305f', look: { roof: 'ring', upper: 'both', seats: ['#1b4fa0', W, '#c8102e'] } }),
  stadium('sc_est_tynecastle', 'Tynecastle Park', 19852, 'sc_hearts', { standColor: '#4a0f20', timeOfDay: 'day', look: { roof: 'ring', upper: 'none', seats: ['#7a1230', W] } }),
  stadium('sc_est_easterroad', 'Easter Road Stadium', 20250, 'sc_hibernian', { standColor: '#0d4a22', timeOfDay: 'day', look: { roof: 'ring', upper: 'none', seats: ['#0a8f3c', W] } }),
  stadium('sc_est_pittodrie', 'Pittodrie Stadium', 20866, 'sc_aberdeen', { standColor: '#7a1a1a', look: { roof: 'ring', upper: 'none', seats: ['#d71920', W] } }),
  stadium('sc_est_firpark', 'Fir Park', 13677, 'sc_motherwell', { standColor: '#5a3a10', timeOfDay: 'day', look: { roof: 'sides', upper: 'none', seats: ['#f5b800', '#7a1230'] } }),
  stadium('sc_est_tannadice', 'Tannadice Park', 14223, 'sc_dundeeutd', { standColor: '#7a3a08', look: { roof: 'sides', upper: 'none', seats: ['#f58220', K] } }),
  stadium('sc_est_smisa', 'The SMISA Stadium', 7937, 'sc_stmirren', { standColor: '#2a2a2a', look: { roof: 'ring', upper: 'none', seats: [K, W] } }),
  stadium('sc_est_densparkdundee', 'Kilmac Stadium at Dens Park', 11850, 'sc_dundee', { standColor: '#14224f', look: { roof: 'sides', upper: 'none', seats: ['#1b2f6b', W] } }),
  stadium('sc_est_rugbypark', 'BBSP Stadium, Rugby Park', 18128, 'sc_kilmarnock', { standColor: '#14305f', timeOfDay: 'day', look: { roof: 'ring', upper: 'none', seats: ['#1b4fa0', W] } }),
  stadium('sc_est_mcdiarmid', 'McDiarmid Park', 10696, 'sc_stjohnstone', { standColor: '#14305f', timeOfDay: 'day', look: { roof: 'ring', upper: 'none', seats: ['#1b4fa0', W] } }),
  stadium('sc_est_falkirk', 'The Falkirk Stadium', 7937, 'sc_falkirk', { standColor: '#14224f', look: { roof: 'sides', upper: 'none', seats: ['#1b2f6b', W] } }),
];

const classics: ClassicDef[] = [
  { a: 'sc_celtic', b: 'sc_rangers', name: 'Old Firm' },
  { a: 'sc_hearts', b: 'sc_hibernian', name: 'Edinburgh Derby' },
  { a: 'sc_aberdeen', b: 'sc_celtic', name: 'Atlantic Derby' },
  { a: 'sc_dundee', b: 'sc_dundeeutd', name: 'Dundee Derby' },
  { a: 'sc_aberdeen', b: 'sc_dundeeutd', name: 'New Firm' },
  { a: 'sc_kilmarnock', b: 'sc_stmirren', name: 'Ayrshire-Renfrewshire Derby' },
  { a: 'sc_motherwell', b: 'sc_stmirren', name: 'Lanarkshire-Renfrewshire Derby' },
  { a: 'sc_dundeeutd', b: 'sc_stjohnstone', name: 'Tayside Derby' },
  { a: 'sc_falkirk', b: 'sc_hearts', name: 'Central Belt Derby' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
