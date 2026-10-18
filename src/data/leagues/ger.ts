import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Bundesliga 2026/27 (18 equipos). Escudos en src/assets/crests/de_*.webp. Plantillas de Transfermarkt (tmRosters.ts).

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  {
    id: 'de_bayern', name: 'Bayern München', short: 'BAY', city: 'München', crest: crest('de_bayern', '#dc052d', '#0066b2'),
    home: kit('#dc052d', '#a00020', 'gradient', W, '#dc052d', W), away: kit('#1a2a4a', '#0066b2', 'solid', '#1a2a4a', '#1a2a4a', W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 80, seed: 14001,
  },
  {
    id: 'de_dortmund', name: 'Borussia Dortmund', short: 'BVB', city: 'Dortmund', crest: crest('de_dortmund', '#fde100', K),
    home: kit('#fde100', K, 'solid', K, '#fde100', K), away: kit(K, '#fde100', 'solid', K, K, '#fde100'), gkKit: GK_PURPLE,
    formation: '4-2-3-1', rating: 78, seed: 14002,
  },
  {
    id: 'de_leverkusen', name: 'Bayer 04 Leverkusen', short: 'B04', city: 'Leverkusen', crest: crest('de_leverkusen', '#e32221', K),
    home: kit('#e32221', K, 'solid', K, '#e32221', W), away: kit(K, '#e32221', 'solid', K, K, '#e32221'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 78, seed: 14003,
  },
  {
    id: 'de_leipzig', name: 'RB Leipzig', short: 'RBL', city: 'Leipzig', crest: crest('de_leipzig', W, '#dd0741'),
    home: kit(W, '#dd0741', 'solid', W, W, '#dd0741'), away: kit('#0d1b3e', '#dd0741', 'solid', '#0d1b3e', '#0d1b3e', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 76, seed: 14004,
  },
  {
    id: 'de_stuttgart', name: 'VfB Stuttgart', short: 'VFB', city: 'Stuttgart', crest: crest('de_stuttgart', W, '#e32219'),
    home: kit(W, '#e32219', 'band', W, W, '#e32219'), away: kit('#e32219', W, 'solid', '#e32219', '#e32219', W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 75, seed: 14005,
  },
  {
    id: 'de_frankfurt', name: 'Eintracht Frankfurt', short: 'SGE', city: 'Frankfurt am Main', crest: crest('de_frankfurt', K, '#e1000f'),
    home: kit(K, '#e1000f', 'hoops', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 74, seed: 14006,
  },
  {
    id: 'de_hoffenheim', name: 'TSG Hoffenheim', short: 'TSG', city: 'Sinsheim', crest: crest('de_hoffenheim', '#1961b5', W),
    home: kit('#1961b5', W, 'solid', '#1961b5', '#1961b5', W), away: kit(W, '#1961b5', 'solid', W, W, '#1961b5'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 72, seed: 14007,
  },
  {
    id: 'de_freiburg', name: 'SC Freiburg', short: 'SCF', city: 'Freiburg', crest: crest('de_freiburg', K, '#e2001a'),
    home: kit(K, '#e2001a', 'solid', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 72, seed: 14008,
  },
  {
    id: 'de_augsburg', name: 'FC Augsburg', short: 'FCA', city: 'Augsburg', crest: crest('de_augsburg', '#ba3733', '#006633'),
    home: kit('#ba3733', '#006633', 'stripes', W, '#ba3733', W), away: kit(W, '#006633', 'solid', W, W, '#ba3733'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 68, seed: 14009,
  },
  {
    id: 'de_mainz', name: '1. FSV Mainz 05', short: 'M05', city: 'Mainz', crest: crest('de_mainz', '#c3141e', W),
    home: kit('#c3141e', W, 'solid', W, '#c3141e', W), away: kit(W, '#c3141e', 'solid', W, W, '#c3141e'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 68, seed: 14010,
  },
  {
    id: 'de_koln', name: '1. FC Köln', short: 'KOE', city: 'Köln', crest: crest('de_koln', W, '#ed1c24'),
    home: kit(W, '#ed1c24', 'solid', W, W, '#ed1c24'), away: kit('#ed1c24', W, 'solid', '#ed1c24', '#ed1c24', W), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 67, seed: 14011,
  },
  {
    id: 'de_hsv', name: 'Hamburger SV', short: 'HSV', city: 'Hamburg', crest: crest('de_hsv', '#0a5ba8', W),
    home: kit(W, '#0a5ba8', 'solid', '#0a5ba8', W, '#0a5ba8'), away: kit('#0a5ba8', K, 'solid', '#0a5ba8', '#0a5ba8', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 67, seed: 14012,
  },
  {
    id: 'de_gladbach', name: 'Borussia Mönchengladbach', short: 'BMG', city: 'Mönchengladbach', crest: crest('de_gladbach', W, '#00a651'),
    home: kit(W, '#00a651', 'solid', W, W, '#00a651'), away: kit('#1f1f1f', '#00a651', 'solid', '#1f1f1f', '#1f1f1f', '#00a651'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 68, seed: 14013,
  },
  {
    id: 'de_werder', name: 'SV Werder Bremen', short: 'SVW', city: 'Bremen', crest: crest('de_werder', '#1d9053', W),
    home: kit('#1d9053', W, 'solid', W, '#1d9053', W), away: kit(W, '#1d9053', 'solid', W, W, '#1d9053'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 68, seed: 14014,
  },
  {
    id: 'de_union', name: '1. FC Union Berlin', short: 'FCU', city: 'Berlin', crest: crest('de_union', '#eb1923', '#ffd200'),
    home: kit('#eb1923', W, 'solid', '#eb1923', '#eb1923', W), away: kit(W, '#eb1923', 'solid', W, W, '#eb1923'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 68, seed: 14015,
  },
  {
    id: 'de_schalke', name: 'FC Schalke 04', short: 'S04', city: 'Gelsenkirchen', crest: crest('de_schalke', '#004d9d', W),
    home: kit('#004d9d', W, 'solid', W, '#004d9d', W), away: kit(W, '#004d9d', 'solid', W, W, '#004d9d'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 66, seed: 14016,
  },
  {
    id: 'de_elversberg', name: 'SV Elversberg', short: 'ELV', city: 'Spiesen-Elversberg', crest: crest('de_elversberg', K, W),
    home: kit(W, K, 'solid', K, W, K), away: kit(K, W, 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 62, seed: 14017,
  },
  {
    id: 'de_paderborn', name: 'SC Paderborn 07', short: 'SCP', city: 'Paderborn', crest: crest('de_paderborn', '#0057a8', K),
    home: kit('#0057a8', K, 'solid', '#0057a8', '#0057a8', W), away: kit(W, '#0057a8', 'solid', W, W, '#0057a8'), gkKit: GK_ORANGE,
    formation: '4-4-2', rating: 62, seed: 14018,
  },
];

const stadiums: StadiumData[] = [
  stadium('de_est_allianz', 'Allianz Arena', 75024, 'de_bayern', { standColor: '#7a1a24', look: { roof: 'ring', upper: 'both', seats: ['#dc052d', W, '#0066b2'] } }),
  stadium('de_est_signal', 'SIGNAL IDUNA PARK', 81365, 'de_dortmund', { standColor: '#3a3a1a', look: { roof: 'ring', upper: 'both', seats: ['#fde100', K] } }),
  stadium('de_est_bayarena', 'BayArena', 30210, 'de_leverkusen', { standColor: '#5a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#e32221', K, W] } }),
  stadium('de_est_redbull', 'Red Bull Arena', 47800, 'de_leipzig', { standColor: '#2a2f3a', look: { roof: 'ring', upper: 'both', seats: [W, '#dd0741', '#0d1b3e'] } }),
  stadium('de_est_mhp', 'MHPArena Stuttgart', 60058, 'de_stuttgart', { standColor: '#3a2a2a', look: { roof: 'ring', upper: 'both', seats: [W, '#e32219'] } }),
  stadium('de_est_dbpark', 'Deutsche Bank Park', 60100, 'de_frankfurt', { standColor: '#2a2a2a', look: { roof: 'ring', upper: 'both', seats: [K, '#e1000f', W] } }),
  stadium('de_est_snp', 'SNP Arena', 30150, 'de_hoffenheim', { standColor: '#1a3a6a', look: { roof: 'ring', upper: 'both', seats: ['#1961b5', W] } }),
  stadium('de_est_europapark', 'Europa-Park Stadion', 34700, 'de_freiburg', { standColor: '#2a2a2a', look: { roof: 'ring', upper: 'both', seats: [K, '#e2001a', W] } }),
  stadium('de_est_wwk', 'WWK ARENA', 30660, 'de_augsburg', { standColor: '#4a2a2a', look: { roof: 'ring', upper: 'both', seats: ['#ba3733', '#006633', W] } }),
  stadium('de_est_mewa', 'Mewa Arena', 33305, 'de_mainz', { standColor: '#6a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#c3141e', W] } }),
  stadium('de_est_rheinenergie', 'RheinEnergieSTADION', 50000, 'de_koln', { standColor: '#6a2a2a', look: { roof: 'ring', upper: 'both', seats: ['#ed1c24', W] } }),
  stadium('de_est_volkspark', 'Volksparkstadion', 57000, 'de_hsv', { standColor: '#1a3a6a', look: { roof: 'ring', upper: 'both', seats: ['#0a5ba8', W, K] } }),
  stadium('de_est_borussiapark', 'ista-Borussia-Park', 54022, 'de_gladbach', { standColor: '#1d4a34', look: { roof: 'ring', upper: 'both', seats: ['#00a651', W, K] } }),
  stadium('de_est_weser', 'Weserstadion', 42100, 'de_werder', { standColor: '#1d5a34', look: { roof: 'ring', upper: 'both', seats: ['#1d9053', W] } }),
  stadium('de_est_forsterei', 'Stadion An der Alten Försterei', 22012, 'de_union', { standColor: '#5a1a1a', look: { roof: 'sides', upper: 'none', seats: ['#eb1923', W] } }),
  stadium('de_est_veltins', 'Veltins-Arena', 62271, 'de_schalke', { standColor: '#1a3a7a', look: { roof: 'ring', upper: 'both', seats: ['#004d9d', W] } }),
  stadium('de_est_kaiserlinde', 'Ursapharm-Arena an der Kaiserlinde', 9307, 'de_elversberg', { standColor: '#2a2a2a', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: [K, W] } }),
  stadium('de_est_homedeluxe', 'Home Deluxe Arena', 15000, 'de_paderborn', { standColor: '#1a3a6a', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#0057a8', K] } }),
];

const classics: ClassicDef[] = [
  { a: 'de_bayern', b: 'de_dortmund', name: 'Der Klassiker' },
  { a: 'de_dortmund', b: 'de_schalke', name: 'Revierderby' },
  { a: 'de_koln', b: 'de_gladbach', name: 'Rheinderby' },
  { a: 'de_koln', b: 'de_leverkusen', name: 'Rheinderby' },
  { a: 'de_werder', b: 'de_hsv', name: 'Nordderby' },
  { a: 'de_stuttgart', b: 'de_hoffenheim', name: 'Baden-Württemberg-Derby' },
  { a: 'de_stuttgart', b: 'de_freiburg', name: 'Baden-Württemberg-Derby' },
  { a: 'de_frankfurt', b: 'de_mainz', name: 'Rhein-Main-Derby' },
  { a: 'de_leipzig', b: 'de_union', name: 'Ost-Duell' },
  { a: 'de_bayern', b: 'de_augsburg', name: 'Bayern-Derby' },
  { a: 'de_gladbach', b: 'de_leverkusen', name: 'Rheinderby' },
  { a: 'de_dortmund', b: 'de_leverkusen', name: 'Duell an Rhein und Ruhr' },
  { a: 'de_bayern', b: 'de_leverkusen', name: 'Topspiel' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
