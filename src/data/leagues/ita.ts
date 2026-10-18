import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE, GK_BLACK } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Serie A (Italia) 2026/27. Escudos de Transfermarkt (src/assets/crests/it_*.webp). Plantillas en tmRosters.ts.

const W = '#ffffff';
const K = '#111111';
const BLUE = '#0b4ea2';
const RED = '#d71920';

const teams: TeamSeed[] = [
  {
    id: 'it_inter', name: 'Inter', short: 'INT', city: 'Milano', crest: crest('it_inter', BLUE, K),
    home: kit(BLUE, K, 'stripes', K, K, W), away: kit(W, BLUE, 'band', W, W, BLUE), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 78, seed: 13000,
  },
  {
    id: 'it_juventus', name: 'Juventus', short: 'JUV', city: 'Torino', crest: crest('it_juventus', K, W),
    home: kit(W, K, 'stripes', W, W, K), away: kit('#1a1a1a', '#c9a24a', 'solid', K, K, '#c9a24a'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 77, seed: 13001,
  },
  {
    id: 'it_como', name: 'Como', short: 'COM', city: 'Como', crest: crest('it_como', '#0a4fa0', W),
    home: kit('#0a4fa0', W, 'solid', '#0a4fa0', '#0a4fa0', W), away: kit(W, '#0a4fa0', 'solid', W, W, '#0a4fa0'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 70, seed: 13002,
  },
  {
    id: 'it_milan', name: 'AC Milan', short: 'MIL', city: 'Milano', crest: crest('it_milan', RED, K),
    home: kit(RED, K, 'stripes', W, K, W), away: kit(W, RED, 'band', W, W, RED), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 77, seed: 13003,
  },
  {
    id: 'it_roma', name: 'AS Roma', short: 'ROM', city: 'Roma', crest: crest('it_roma', '#8e1f2f', '#f0a30a'),
    home: kit('#8e1f2f', '#f0a30a', 'solid', W, '#8e1f2f', '#f0a30a'), away: kit(W, '#8e1f2f', 'band', W, W, '#8e1f2f'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 74, seed: 13004,
  },
  {
    id: 'it_atalanta', name: 'Atalanta', short: 'ATA', city: 'Bergamo', crest: crest('it_atalanta', K, BLUE),
    home: kit(K, BLUE, 'stripes', K, K, W), away: kit(W, BLUE, 'band', W, W, BLUE), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 75, seed: 13005,
  },
  {
    id: 'it_napoli', name: 'Napoli', short: 'NAP', city: 'Napoli', crest: crest('it_napoli', '#12a0d7', W),
    home: kit('#12a0d7', '#0b6fa0', 'solid', W, '#12a0d7', W), away: kit(W, '#12a0d7', 'band', W, W, '#12a0d7'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 76, seed: 13006,
  },
  {
    id: 'it_fiorentina', name: 'Fiorentina', short: 'FIO', city: 'Firenze', crest: crest('it_fiorentina', '#5b2a86', W),
    home: kit('#5b2a86', W, 'solid', W, '#5b2a86', W), away: kit(W, '#5b2a86', 'solid', W, W, '#5b2a86'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 70, seed: 13007,
  },
  {
    id: 'it_lazio', name: 'Lazio', short: 'LAZ', city: 'Roma', crest: crest('it_lazio', '#87ceeb', W),
    home: kit('#87ceeb', W, 'solid', W, '#87ceeb', W), away: kit(W, '#87ceeb', 'band', W, W, '#87ceeb'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 72, seed: 13008,
  },
  {
    id: 'it_bologna', name: 'Bologna', short: 'BOL', city: 'Bologna', crest: crest('it_bologna', RED, BLUE),
    home: kit(RED, BLUE, 'stripes', W, BLUE, W), away: kit(W, RED, 'band', W, W, RED), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 71, seed: 13009,
  },
  {
    id: 'it_sassuolo', name: 'Sassuolo', short: 'SAS', city: 'Sassuolo', crest: crest('it_sassuolo', '#00a550', K),
    home: kit('#00a550', K, 'stripes', K, K, W), away: kit(W, '#00a550', 'band', W, W, '#00a550'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 66, seed: 13010,
  },
  {
    id: 'it_torino', name: 'Torino', short: 'TOR', city: 'Torino', crest: crest('it_torino', '#7a1f2b', W),
    home: kit('#7a1f2b', W, 'solid', W, '#7a1f2b', W), away: kit(W, '#7a1f2b', 'band', W, W, '#7a1f2b'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 67, seed: 13011,
  },
  {
    id: 'it_genoa', name: 'Genoa', short: 'GEN', city: 'Genova', crest: crest('it_genoa', RED, BLUE),
    home: kit(RED, BLUE, 'halves', BLUE, BLUE, W), away: kit(W, RED, 'band', W, W, BLUE), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 67, seed: 13012,
  },
  {
    id: 'it_udinese', name: 'Udinese', short: 'UDI', city: 'Udine', crest: crest('it_udinese', K, W),
    home: kit(W, K, 'stripes', K, W, K), away: kit(K, W, 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 66, seed: 13013,
  },
  {
    id: 'it_parma', name: 'Parma', short: 'PAR', city: 'Parma', crest: crest('it_parma', W, '#f2c230'),
    home: kit(W, '#f2c230', 'band', W, W, '#0b4ea2'), away: kit('#0b4ea2', '#f2c230', 'solid', '#0b4ea2', '#0b4ea2', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 66, seed: 13014,
  },
  {
    id: 'it_cagliari', name: 'Cagliari', short: 'CAG', city: 'Cagliari', crest: crest('it_cagliari', '#a01c2b', BLUE),
    home: kit('#a01c2b', BLUE, 'halves', BLUE, BLUE, W), away: kit(W, '#a01c2b', 'band', W, W, BLUE), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 64, seed: 13015,
  },
  {
    id: 'it_venezia', name: 'Venezia', short: 'VEN', city: 'Venezia', crest: crest('it_venezia', '#f08a00', '#00704a'),
    home: kit(K, '#f08a00', 'halves', K, K, '#00a550'), away: kit(W, '#f08a00', 'band', W, W, '#00704a'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 63, seed: 13016,
  },
  {
    id: 'it_frosinone', name: 'Frosinone', short: 'FRO', city: 'Frosinone', crest: crest('it_frosinone', '#f2d200', BLUE),
    home: kit('#f2d200', BLUE, 'solid', BLUE, BLUE, BLUE), away: kit(BLUE, '#f2d200', 'solid', BLUE, BLUE, '#f2d200'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 62, seed: 13017,
  },
  {
    id: 'it_monza', name: 'Monza', short: 'MON', city: 'Monza', crest: crest('it_monza', RED, W),
    home: kit(RED, W, 'stripes', W, RED, W), away: kit(W, RED, 'solid', W, W, RED), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 63, seed: 13018,
  },
  {
    id: 'it_lecce', name: 'Lecce', short: 'LEC', city: 'Lecce', crest: crest('it_lecce', '#f2c230', RED),
    home: kit('#f2c230', RED, 'stripes', RED, RED, K), away: kit(W, RED, 'band', W, W, '#f2c230'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 62, seed: 13019,
  },
];

const stadiums: StadiumData[] = [
  stadium('it_est_meazza_inter', 'Giuseppe Meazza', 75923, 'it_inter', { standColor: '#14214a', look: { roof: 'ring', upper: 'both', seats: [BLUE, K] } }),
  stadium('it_est_allianz_juve', 'Allianz Stadium', 41507, 'it_juventus', { standColor: '#242424', look: { roof: 'ring', upper: 'both', seats: [K, W] } }),
  stadium('it_est_sinigaglia', 'Giuseppe Sinigaglia', 12064, 'it_como', { standColor: '#1c3a66', look: { roof: 'none', upper: 'none', seats: ['#0a4fa0', W] } }),
  stadium('it_est_meazza_milan', 'Giuseppe Meazza', 75923, 'it_milan', { standColor: '#4a1418', look: { roof: 'ring', upper: 'both', seats: [RED, K] } }),
  stadium('it_est_olimpico_roma', 'Olimpico di Roma', 70634, 'it_roma', { standColor: '#4a1a22', look: { roof: 'sides', upper: 'both', track: '#9a4a3a', seats: ['#8e1f2f', '#f0a30a'] } }),
  stadium('it_est_bergamo', 'New Balance Arena - Bergamo', 23439, 'it_atalanta', { standColor: '#1c2230', look: { roof: 'ring', upper: 'none', seats: [K, BLUE] } }),
  stadium('it_est_maradona', 'Diego Armando Maradona', 54726, 'it_napoli', { standColor: '#1c4a66', look: { roof: 'sides', upper: 'both', track: '#3a6fa0', seats: ['#12a0d7', W] } }),
  stadium('it_est_franchi', 'Artemio Franchi', 43147, 'it_fiorentina', { standColor: '#3a2352', look: { roof: 'sides', upper: 'both', seats: ['#5b2a86', W] } }),
  stadium('it_est_olimpico_lazio', 'Olimpico di Roma', 70634, 'it_lazio', { standColor: '#2a4a66', look: { roof: 'sides', upper: 'both', track: '#9a4a3a', seats: ['#87ceeb', W] } }),
  stadium('it_est_dallara', 'Stadio Renato Dall’Ara', 36462, 'it_bologna', { standColor: '#3a1a2a', look: { roof: 'sides', upper: 'both', track: '#9a4a3a', seats: [RED, BLUE] } }),
  stadium('it_est_mapei', 'Mapei Stadium - Città del Tricolore', 21584, 'it_sassuolo', { standColor: '#1a3a2a', look: { roof: 'sides', upper: 'none', seats: ['#00a550', K] } }),
  stadium('it_est_grande_torino', 'Olimpico Grande Torino', 28177, 'it_torino', { standColor: '#3a1a1f', look: { roof: 'sides', upper: 'both', seats: ['#7a1f2b', W] } }),
  stadium('it_est_ferraris', 'Luigi Ferraris', 34901, 'it_genoa', { standColor: '#2a2236', look: { roof: 'sides', upper: 'both', seats: [RED, BLUE] } }),
  stadium('it_est_bluenergy', 'Bluenergy Stadium', 25144, 'it_udinese', { standColor: '#2a2a2a', look: { roof: 'ring', upper: 'none', seats: [K, W] } }),
  stadium('it_est_tardini', 'Ennio Tardini', 22352, 'it_parma', { standColor: '#26324a', look: { roof: 'sides', upper: 'none', seats: ['#f2c230', '#0b4ea2'] } }),
  stadium('it_est_unipol', 'Unipol Domus', 16412, 'it_cagliari', { standColor: '#2a2a3a', look: { roof: 'ring', upper: 'none', seats: ['#a01c2b', BLUE] } }),
  stadium('it_est_penzo', 'Pier Luigi Penzo', 12048, 'it_venezia', { standColor: '#24302a', look: { roof: 'none', upper: 'none', seats: ['#f08a00', '#00704a', K] } }),
  stadium('it_est_stirpe', 'Benito Stirpe', 16227, 'it_frosinone', { standColor: '#26304a', look: { roof: 'sides', upper: 'none', seats: ['#f2d200', BLUE] } }),
  stadium('it_est_brianteo', 'Brianteo', 17102, 'it_monza', { standColor: '#3a1a1f', look: { roof: 'sides', upper: 'none', seats: [RED, W] } }),
  stadium('it_est_via_del_mare', 'Via del Mare - Ettore Giardiniero', 31559, 'it_lecce', { standColor: '#3a3220', look: { roof: 'none', upper: 'both', seats: ['#f2c230', RED] } }),
];

const classics: ClassicDef[] = [
  { a: 'it_inter', b: 'it_milan', name: 'Derby della Madonnina' },
  { a: 'it_inter', b: 'it_juventus', name: "Derby d'Italia" },
  { a: 'it_milan', b: 'it_juventus', name: 'Juventus - Milan' },
  { a: 'it_roma', b: 'it_lazio', name: 'Derby della Capitale' },
  { a: 'it_juventus', b: 'it_torino', name: 'Derby della Mole' },
  { a: 'it_genoa', b: 'it_inter', name: 'Genoa - Inter' },
  { a: 'it_napoli', b: 'it_juventus', name: 'Juventus - Napoli' },
  { a: 'it_roma', b: 'it_napoli', name: 'Derby del Sole' },
  { a: 'it_fiorentina', b: 'it_juventus', name: 'Fiorentina - Juventus' },
  { a: 'it_roma', b: 'it_juventus', name: 'Juventus - Roma' },
  { a: 'it_atalanta', b: 'it_milan', name: 'Atalanta - Milan' },
  { a: 'it_bologna', b: 'it_fiorentina', name: 'Derby dell’Appennino' },
  { a: 'it_lecce', b: 'it_cagliari', name: 'Lecce - Cagliari' },
  { a: 'it_venezia', b: 'it_udinese', name: 'Derby del Nordest' },
  { a: 'it_parma', b: 'it_bologna', name: 'Derby dell’Emilia' },
  { a: 'it_sassuolo', b: 'it_bologna', name: 'Sassuolo - Bologna' },
  { a: 'it_milan', b: 'it_monza', name: 'Derby della Brianza' },
  { a: 'it_como', b: 'it_monza', name: 'Derby Lombardo' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
