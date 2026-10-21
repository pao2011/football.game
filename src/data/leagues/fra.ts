import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE, GK_BLACK } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Ligue 1 2026/27 (18 equipos). Escudos en src/assets/crests/fr_*.webp. Plantillas de Transfermarkt (tmRosters.ts).

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  {
    id: 'fr_psg', name: 'Paris Saint-Germain', short: 'PSG', city: 'Paris', crest: crest('fr_psg', '#004170', '#da291c'),
    home: kit('#004170', '#da291c', 'band', '#004170', '#004170', W), away: kit(W, '#004170', 'solid', W, W, '#004170'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 80, seed: 15000,
  },
  {
    id: 'fr_monaco', name: 'AS Monaco', short: 'MON', city: 'Monaco', crest: crest('fr_monaco', '#e2001a', W),
    home: kit(W, '#e2001a', 'sash', '#e2001a', W, '#e2001a'), away: kit('#111827', '#e2001a', 'solid', '#111827', '#111827', W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 74, seed: 15001,
  },
  {
    id: 'fr_strasbourg', name: 'RC Strasbourg', short: 'STR', city: 'Strasbourg', crest: crest('fr_strasbourg', '#0a5cb8', W),
    home: kit('#0a5cb8', W, 'solid', W, '#0a5cb8', W), away: kit(W, '#0a5cb8', 'band', W, W, '#0a5cb8'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 72, seed: 15002,
  },
  {
    id: 'fr_lyon', name: 'Olympique Lyonnais', short: 'LYO', city: 'Lyon', crest: crest('fr_lyon', '#1c3f94', '#da291c'),
    home: kit(W, '#1c3f94', 'band', W, W, '#da291c'), away: kit('#1c3f94', '#da291c', 'solid', '#1c3f94', '#1c3f94', W), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 74, seed: 15003,
  },
  {
    id: 'fr_rennes', name: 'Stade Rennais', short: 'REN', city: 'Rennes', crest: crest('fr_rennes', '#e2001a', K),
    home: kit('#e2001a', K, 'solid', K, K, W), away: kit(W, '#e2001a', 'band', W, W, K), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 72, seed: 15004,
  },
  {
    id: 'fr_lille', name: 'LOSC Lille', short: 'LIL', city: 'Lille', crest: crest('fr_lille', '#e2001a', '#1c2a5a'),
    home: kit('#e2001a', '#1c2a5a', 'solid', W, '#e2001a', W), away: kit('#1c2a5a', W, 'solid', '#1c2a5a', '#1c2a5a', W), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 73, seed: 15005,
  },
  {
    id: 'fr_lens', name: 'RC Lens', short: 'LEN', city: 'Lens', crest: crest('fr_lens', '#f2c200', '#e2001a'),
    home: kit('#f2c200', '#e2001a', 'solid', '#e2001a', '#f2c200', '#e2001a'), away: kit(W, '#e2001a', 'band', W, W, '#e2001a'), gkKit: GK_PURPLE,
    formation: '4-2-3-1', rating: 72, seed: 15006,
  },
  {
    id: 'fr_parisfc', name: 'Paris FC', short: 'PFC', city: 'Paris', crest: crest('fr_parisfc', '#1c3f94', W),
    home: kit('#1c3f94', W, 'solid', '#1c3f94', '#1c3f94', W), away: kit(W, '#1c3f94', 'band', W, W, '#1c3f94'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 66, seed: 15007,
  },
  {
    id: 'fr_marseille', name: 'Olympique de Marseille', short: 'MAR', city: 'Marseille', crest: crest('fr_marseille', '#2faee0', W),
    home: kit(W, '#2faee0', 'band', W, W, '#2faee0'), away: kit('#111827', '#2faee0', 'solid', '#111827', '#111827', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 75, seed: 15008,
  },
  {
    id: 'fr_nice', name: 'OGC Nice', short: 'NIC', city: 'Nice', crest: crest('fr_nice', '#e2001a', K),
    home: kit('#e2001a', K, 'stripes', K, K, W), away: kit(W, '#e2001a', 'solid', W, W, K), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 70, seed: 15009,
  },
  {
    id: 'fr_toulouse', name: 'Toulouse FC', short: 'TOU', city: 'Toulouse', crest: crest('fr_toulouse', '#6a2c91', W),
    home: kit('#6a2c91', W, 'solid', W, '#6a2c91', W), away: kit(W, '#6a2c91', 'band', W, W, '#6a2c91'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 67, seed: 15010,
  },
  {
    id: 'fr_lorient', name: 'FC Lorient', short: 'LOR', city: 'Lorient', crest: crest('fr_lorient', '#f47920', K),
    home: kit('#f47920', K, 'solid', K, '#f47920', K), away: kit(W, '#f47920', 'solid', W, W, '#f47920'), gkKit: GK_PURPLE,
    formation: '4-2-3-1', rating: 64, seed: 15011,
  },
  {
    id: 'fr_auxerre', name: 'AJ Auxerre', short: 'AUX', city: 'Auxerre', crest: crest('fr_auxerre', '#1c4fa0', W),
    home: kit(W, '#1c4fa0', 'stripes', W, W, '#1c4fa0'), away: kit('#1c4fa0', W, 'solid', '#1c4fa0', '#1c4fa0', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 63, seed: 15012,
  },
  {
    id: 'fr_brest', name: 'Stade Brestois 29', short: 'BRE', city: 'Brest', crest: crest('fr_brest', '#e2001a', W),
    home: kit('#e2001a', W, 'solid', W, '#e2001a', W), away: kit(W, '#e2001a', 'band', W, W, '#e2001a'), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 66, seed: 15013,
  },
  {
    id: 'fr_angers', name: 'Angers SCO', short: 'ANG', city: 'Angers', crest: crest('fr_angers', K, W),
    home: kit(K, W, 'stripes', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 62, seed: 15014,
  },
  {
    id: 'fr_lehavre', name: 'Le Havre AC', short: 'HAV', city: 'Le Havre', crest: crest('fr_lehavre', '#5aa8e0', '#1c3f94'),
    home: kit('#5aa8e0', '#1c3f94', 'solid', '#1c3f94', '#5aa8e0', W), away: kit(W, '#5aa8e0', 'band', W, W, '#1c3f94'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 62, seed: 15015,
  },
  {
    id: 'fr_troyes', name: 'ESTAC Troyes', short: 'TRO', city: 'Troyes', crest: crest('fr_troyes', '#1c4fa0', W),
    home: kit('#1c4fa0', W, 'solid', W, '#1c4fa0', W), away: kit(W, '#1c4fa0', 'band', W, W, '#1c4fa0'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 61, seed: 15016,
  },
  {
    id: 'fr_lemans', name: 'Le Mans FC', short: 'LMA', city: 'Le Mans', crest: crest('fr_lemans', '#f2c200', '#e2001a'),
    home: kit('#f2c200', '#e2001a', 'stripes', '#e2001a', '#f2c200', '#e2001a'), away: kit('#e2001a', '#f2c200', 'solid', '#e2001a', '#e2001a', '#f2c200'), gkKit: GK_BLACK,
    formation: '4-2-3-1', rating: 60, seed: 15017,
  },
];

const stadiums: StadiumData[] = [
  stadium('fr_est_parcdesprinces', 'Parc des Princes', 48583, 'fr_psg', { standColor: '#14284a', look: { roof: 'ring', upper: 'both', seats: ['#004170', '#da291c', W] } }),
  stadium('fr_est_louis2', 'Stade Louis-II', 18525, 'fr_monaco', { standColor: '#7a1a24', look: { roof: 'sides', upper: 'none', seats: ['#e2001a', W] } }),
  stadium('fr_est_meinau', 'Stade de la Meinau', 32300, 'fr_strasbourg', { standColor: '#14325a', look: { roof: 'sides', upper: 'both', seats: ['#0a5cb8', W] } }),
  stadium('fr_est_groupama', 'Groupama Stadium', 59186, 'fr_lyon', { standColor: '#1c2a5a', look: { roof: 'ring', upper: 'both', seats: ['#1c3f94', '#da291c', W] } }),
  stadium('fr_est_roazhon', 'Roazhon Park', 29778, 'fr_rennes', { standColor: '#2a2a2a', look: { roof: 'sides', upper: 'both', seats: ['#e2001a', K] } }),
  stadium('fr_est_pierremauroy', 'Decathlon Arena-Stade Pierre-Mauroy', 50186, 'fr_lille', { standColor: '#7a1a24', look: { roof: 'ring', upper: 'both', seats: ['#e2001a', W] } }),
  stadium('fr_est_bollaert', 'Stade Bollaert-Delelis', 38223, 'fr_lens', { standColor: '#8a6a10', look: { roof: 'sides', upper: 'both', seats: ['#f2c200', '#e2001a'] } }),
  stadium('fr_est_jeanbouin', 'Stade Jean Bouin', 19904, 'fr_parisfc', { standColor: '#1c2a5a', look: { roof: 'sides', upper: 'none', seats: ['#1c3f94', W] } }),
  stadium('fr_est_velodrome', 'CEPAC Vélodrome', 67394, 'fr_marseille', { standColor: '#1c5a7a', look: { roof: 'ring', upper: 'both', seats: ['#2faee0', W] } }),
  stadium('fr_est_allianzriviera', 'Allianz Riviera', 36178, 'fr_nice', { standColor: '#2a2a2a', look: { roof: 'ring', upper: 'both', seats: ['#e2001a', K, W] } }),
  stadium('fr_est_municipal', 'Stadium Municipal', 33150, 'fr_toulouse', { standColor: '#3a1c52', look: { roof: 'sides', upper: 'both', seats: ['#6a2c91', W] } }),
  stadium('fr_est_moustoir', 'Stade du Moustoir', 16787, 'fr_lorient', { standColor: '#6a3a10', timeOfDay: 'day', look: { roof: 'sides', upper: 'none', seats: ['#f47920', K] } }),
  stadium('fr_est_abbedeschamps', "Stade de l'Abbé-Deschamps", 18541, 'fr_auxerre', { standColor: '#14284a', timeOfDay: 'day', look: { roof: 'sides', upper: 'none', seats: ['#1c4fa0', W] } }),
  stadium('fr_est_francisleble', 'Stade Francis-Le Blé', 15220, 'fr_brest', { standColor: '#7a1a24', look: { roof: 'none', upper: 'none', seats: ['#e2001a', W] } }),
  stadium('fr_est_raymondkopa', 'Stade Raymond-Kopa', 19350, 'fr_angers', { standColor: '#222222', timeOfDay: 'day', look: { roof: 'sides', upper: 'none', seats: [K, W] } }),
  stadium('fr_est_oceane', 'Stade Océane', 25178, 'fr_lehavre', { standColor: '#1c3f6a', look: { roof: 'sides', upper: 'none', seats: ['#5aa8e0', '#1c3f94'] } }),
  stadium('fr_est_aube', "Stade de l'Aube", 20460, 'fr_troyes', { standColor: '#14284a', timeOfDay: 'day', look: { roof: 'sides', upper: 'none', seats: ['#1c4fa0', W] } }),
  stadium('fr_est_marvingt', 'Stade Marie-Marvingt', 25064, 'fr_lemans', { standColor: '#8a6a10', look: { roof: 'sides', upper: 'none', seats: ['#f2c200', '#e2001a'] } }),
];

const classics: ClassicDef[] = [
  { a: 'fr_psg', b: 'fr_marseille', name: 'Le Classique' },
  { a: 'fr_lyon', b: 'fr_marseille', name: 'Olympico' },
  { a: 'fr_lyon', b: 'fr_psg', name: 'Choc des Olympiques' },
  { a: 'fr_lille', b: 'fr_lens', name: 'Derby du Nord' },
  { a: 'fr_nice', b: 'fr_marseille', name: 'Derby de la Côte d\'Azur' },
  { a: 'fr_nice', b: 'fr_monaco', name: 'Derby de la Côte d\'Azur (Nice-Monaco)' },
  { a: 'fr_psg', b: 'fr_parisfc', name: 'Derby de Paris' },
  { a: 'fr_rennes', b: 'fr_brest', name: 'Derby Breton' },
  { a: 'fr_lorient', b: 'fr_brest', name: 'Derby Breton (Lorient-Brest)' },
  { a: 'fr_rennes', b: 'fr_lorient', name: 'Derby Breton (Rennes-Lorient)' },
  { a: 'fr_lille', b: 'fr_psg', name: 'Choc du Nord' },
  { a: 'fr_auxerre', b: 'fr_troyes', name: 'Derby de Bourgogne-Champagne' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
