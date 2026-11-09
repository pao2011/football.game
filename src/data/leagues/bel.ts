import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE, GK_BLACK } from '../seedUtil';
import type { TeamSeed } from '../teams';

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  { id: 'be_brugge', name: 'Club Brugge', short: 'BRU', city: 'Brujas', crest: crest('be_brugge', '#0a5cb8', K),
    home: kit('#0a5cb8', K, 'hoops', K, K, W), away: kit('#f2f2f2', '#0a5cb8', 'solid', W, W, '#0a5cb8'), gkKit: GK_ORANGE, formation: '4-2-3-1', rating: 78, seed: 18001 },
  { id: 'be_genk', name: 'KRC Genk', short: 'GNK', city: 'Genk', crest: crest('be_genk', '#0a4ea2', W),
    home: kit('#0a4ea2', '#0a4ea2', 'solid', W, '#0a4ea2', W), away: kit('#f2f2f2', '#0a4ea2', 'band', '#0a4ea2', W, '#0a4ea2'), gkKit: GK_YELLOW, formation: '4-3-3', rating: 74, seed: 18002 },
  { id: 'be_union', name: 'Union Saint-Gilloise', short: 'USG', city: 'Bruselas', crest: crest('be_union', '#f5d000', '#0a2a7a'),
    home: kit('#f5d000', '#0a2a7a', 'stripes', '#0a2a7a', '#f5d000', '#0a2a7a'), away: kit('#0a2a7a', '#f5d000', 'solid', '#0a2a7a', '#0a2a7a', '#f5d000'), gkKit: GK_GREEN, formation: '4-3-3', rating: 76, seed: 18003 },
  { id: 'be_anderlecht', name: 'RSC Anderlecht', short: 'AND', city: 'Bruselas', crest: crest('be_anderlecht', '#5a2d82', W),
    home: kit('#5a2d82', '#5a2d82', 'solid', W, '#5a2d82', W), away: kit('#f2f2f2', '#5a2d82', 'band', W, W, '#5a2d82'), gkKit: GK_YELLOW, formation: '4-2-3-1', rating: 76, seed: 18004 },
  { id: 'be_gent', name: 'KAA Gent', short: 'GNT', city: 'Gante', crest: crest('be_gent', '#0a5cb8', W),
    home: kit('#0a5cb8', '#0a5cb8', 'solid', '#0a5cb8', W, W), away: kit('#f2f2f2', '#0a5cb8', 'gradient', W, W, '#0a5cb8'), gkKit: GK_ORANGE, formation: '4-3-3', rating: 72, seed: 18005 },
  { id: 'be_standard', name: 'Standard Lieja', short: 'STA', city: 'Lieja', crest: crest('be_standard', '#d4141c', W),
    home: kit('#d4141c', '#d4141c', 'solid', '#d4141c', '#d4141c', W), away: kit('#f2f2f2', '#d4141c', 'band', W, W, '#d4141c'), gkKit: GK_YELLOW, formation: '4-4-2', rating: 72, seed: 18006 },
  { id: 'be_antwerp', name: 'Royal Antwerp', short: 'ANT', city: 'Amberes', crest: crest('be_antwerp', '#d4141c', W),
    home: kit('#d4141c', W, 'stripes', W, '#d4141c', W), away: kit('#1a1a1a', '#d4141c', 'solid', K, K, W), gkKit: GK_YELLOW, formation: '4-3-3', rating: 72, seed: 18007 },
  { id: 'be_westerlo', name: 'KVC Westerlo', short: 'WES', city: 'Westerlo', crest: crest('be_westerlo', '#f5d000', '#0a2a7a'),
    home: kit('#f5d000', '#0a2a7a', 'solid', '#0a2a7a', '#f5d000', '#0a2a7a'), away: kit('#0a2a7a', '#f5d000', 'solid', '#0a2a7a', '#0a2a7a', '#f5d000'), gkKit: GK_GREEN, formation: '4-4-2', rating: 68, seed: 18008 },
  { id: 'be_stvv', name: 'Sint-Truiden', short: 'STV', city: 'Sint-Truiden', crest: crest('be_stvv', '#f5d000', '#0a2a7a'),
    home: kit('#f5d000', '#f5d000', 'solid', '#0a2a7a', '#f5d000', '#0a2a7a'), away: kit('#0a2a7a', '#f5d000', 'solid', '#0a2a7a', '#0a2a7a', W), gkKit: GK_GREEN, formation: '4-3-3', rating: 66, seed: 18009 },
  { id: 'be_mechelen', name: 'KV Mechelen', short: 'MEC', city: 'Malinas', crest: crest('be_mechelen', '#d4141c', '#f5d000'),
    home: kit('#d4141c', '#f5d000', 'hoops', '#d4141c', '#f5d000', W), away: kit('#f5d000', '#d4141c', 'solid', '#d4141c', '#f5d000', '#d4141c'), gkKit: GK_BLACK, formation: '4-4-2', rating: 68, seed: 18010 },
  { id: 'be_cercle', name: 'Cercle Brugge', short: 'CER', city: 'Brujas', crest: crest('be_cercle', '#1a8a3a', K),
    home: kit('#1a8a3a', K, 'solid', K, '#1a8a3a', W), away: kit('#1a1a1a', '#1a8a3a', 'solid', K, K, '#1a8a3a'), gkKit: GK_ORANGE, formation: '4-3-3', rating: 66, seed: 18011 },
  { id: 'be_charleroi', name: 'Sporting Charleroi', short: 'CHA', city: 'Charleroi', crest: crest('be_charleroi', K, W),
    home: kit(K, W, 'stripes', K, K, W), away: kit('#f2f2f2', K, 'solid', W, W, K), gkKit: GK_YELLOW, formation: '4-2-3-1', rating: 68, seed: 18012 },
  { id: 'be_ohl', name: 'OH Leuven', short: 'OHL', city: 'Lovaina', crest: crest('be_ohl', W, '#1a8a3a'),
    home: kit('#f2f2f2', '#1a8a3a', 'solid', '#1a8a3a', W, '#1a8a3a'), away: kit('#1a8a3a', W, 'solid', '#1a8a3a', '#1a8a3a', W), gkKit: GK_ORANGE, formation: '4-4-2', rating: 64, seed: 18013 },
  { id: 'be_zulte', name: 'Zulte Waregem', short: 'ZUL', city: 'Waregem', crest: crest('be_zulte', '#d4141c', '#1a8a3a'),
    home: kit('#d4141c', '#1a8a3a', 'solid', '#1a8a3a', '#d4141c', W), away: kit('#1a8a3a', W, 'solid', W, '#1a8a3a', W), gkKit: GK_YELLOW, formation: '4-3-3', rating: 64, seed: 18014 },
  { id: 'be_lommel', name: 'Lommel SK', short: 'LOM', city: 'Lommel', crest: crest('be_lommel', '#0a5cb8', W),
    home: kit('#0a5cb8', '#0a5cb8', 'solid', '#0a5cb8', '#0a5cb8', W), away: kit('#f2f2f2', '#0a5cb8', 'solid', W, W, '#0a5cb8'), gkKit: GK_ORANGE, formation: '4-4-2', rating: 62, seed: 18015 },
  { id: 'be_raal', name: 'RAAL La Louvière', short: 'RAA', city: 'La Louvière', crest: crest('be_raal', '#1a8a3a', '#d4141c'),
    home: kit('#1a8a3a', '#d4141c', 'halves', '#d4141c', '#1a8a3a', W), away: kit('#f2f2f2', '#1a8a3a', 'solid', W, W, '#1a8a3a'), gkKit: GK_YELLOW, formation: '4-4-2', rating: 62, seed: 18016 },
  { id: 'be_kortrijk', name: 'KV Kortrijk', short: 'KOR', city: 'Kortrijk', crest: crest('be_kortrijk', '#d4141c', W),
    home: kit('#d4141c', W, 'solid', W, '#d4141c', W), away: kit('#f2f2f2', '#d4141c', 'solid', W, W, '#d4141c'), gkKit: GK_YELLOW, formation: '4-4-2', rating: 62, seed: 18017 },
  { id: 'be_beveren', name: 'SK Beveren', short: 'BEV', city: 'Beveren', crest: crest('be_beveren', '#f5d000', '#0a2a7a'),
    home: kit('#f5d000', '#0a2a7a', 'solid', '#0a2a7a', '#f5d000', '#0a2a7a'), away: kit('#0a2a7a', '#f5d000', 'solid', '#0a2a7a', '#0a2a7a', '#f5d000'), gkKit: GK_GREEN, formation: '4-3-3', rating: 62, seed: 18018 },
];

const stadiums = [
  stadium('be_est_breydel', 'Jan Breydelstadion', 29062, 'be_brugge', { standColor: '#1a2a4a', look: { roof: 'ring', upper: 'both', seats: ['#0a5cb8', K] } }),
  stadium('be_est_cegeka', 'Cegeka Arena', 23718, 'be_genk', { standColor: '#1a2a4a', look: { roof: 'ring', upper: 'both', seats: ['#0a4ea2', W] } }),
  stadium('be_est_marien', 'Stade Joseph Mariën', 9512, 'be_union', { standColor: '#2a2f3a', timeOfDay: 'day', look: { roof: 'sides', upper: 'none', seats: ['#f5d000', '#0a2a7a'] } }),
  stadium('be_est_lotto', 'Lotto Park', 21900, 'be_anderlecht', { standColor: '#2d1a45', look: { roof: 'ring', upper: 'both', seats: ['#5a2d82', W] } }),
  stadium('be_est_planet', 'Planet Group arena', 20185, 'be_gent', { standColor: '#1a2a4a', look: { roof: 'ring', upper: 'both', seats: ['#0a5cb8', W] } }),
  stadium('be_est_dufrasne', 'Maurice Dufrasne Stadion', 27221, 'be_standard', { standColor: '#4a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#d4141c', W] } }),
  stadium('be_est_bosuil', 'Bosuilstadion', 21000, 'be_antwerp', { standColor: '#4a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#d4141c', W] } }),
  stadium('be_est_kuipje', "'t Kuipje", 8035, 'be_westerlo', { standColor: '#2a2f3a', look: { roof: 'sides', upper: 'none', seats: ['#f5d000', '#0a2a7a'] } }),
  stadium('be_est_stayen', 'Daio Wasabi Stayen Stadium', 11337, 'be_stvv', { standColor: '#2a2f3a', look: { roof: 'sides', upper: 'none', seats: ['#f5d000', '#0a2a7a'] } }),
  stadium('be_est_kazerne', 'Achter de Kazerne', 16672, 'be_mechelen', { standColor: '#4a1a1a', look: { roof: 'ring', upper: 'none', seats: ['#d4141c', '#f5d000'] } }),
  stadium('be_est_breydel_cercle', 'Jan Breydelstadion', 29062, 'be_cercle', { standColor: '#14452c', look: { roof: 'ring', upper: 'both', seats: ['#1a8a3a', K] } }),
  stadium('be_est_charleroi', 'Stade du Pays de Charleroi', 14968, 'be_charleroi', { standColor: '#1c1c1c', look: { roof: 'ring', upper: 'none', seats: [K, W] } }),
  stadium('be_est_dendreef', 'King Power at Den Dreef Stadion', 9809, 'be_ohl', { standColor: '#2a2f3a', look: { roof: 'sides', upper: 'none', seats: ['#1a8a3a', W] } }),
  stadium('be_est_elindus', 'Elindus Arena', 12698, 'be_zulte', { standColor: '#2a2f3a', look: { roof: 'ring', upper: 'none', seats: ['#d4141c', '#1a8a3a'] } }),
  stadium('be_est_soeverein', 'Soeverein stadion', 8231, 'be_lommel', { standColor: '#2a2f3a', look: { roof: 'sides', upper: 'none', seats: ['#0a5cb8', W] } }),
  stadium('be_est_easi', 'Easi Arena', 8050, 'be_raal', { standColor: '#2a2f3a', look: { roof: 'sides', upper: 'none', seats: ['#1a8a3a', '#d4141c'] } }),
  stadium('be_est_guldensporen', 'Guldensporenstadion', 9399, 'be_kortrijk', { standColor: '#4a1a1a', look: { roof: 'ring', upper: 'none', seats: ['#d4141c', W] } }),
  stadium('be_est_freethiel', 'Freethielstadion', 8156, 'be_beveren', { standColor: '#2a2f3a', look: { roof: 'sides', upper: 'none', seats: ['#f5d000', '#0a2a7a'] } }),
];

const classics: ClassicDef[] = [
  { a: 'be_anderlecht', b: 'be_standard', name: 'Le Clasico belga' },
  { a: 'be_brugge', b: 'be_cercle', name: 'Derbi de Brujas' },
  { a: 'be_brugge', b: 'be_anderlecht', name: 'Topper' },
  { a: 'be_anderlecht', b: 'be_union', name: 'Derbi de Bruselas' },
  { a: 'be_genk', b: 'be_stvv', name: 'Derbi de Limburgo' },
  { a: 'be_genk', b: 'be_lommel', name: 'Derbi de Limburgo' },
  { a: 'be_standard', b: 'be_charleroi', name: 'Derbi valón' },
  { a: 'be_antwerp', b: 'be_mechelen', name: 'Derbi de Amberes y Malinas' },
  { a: 'be_antwerp', b: 'be_beveren', name: 'Derbi de Amberes y Waasland' },
  { a: 'be_kortrijk', b: 'be_zulte', name: 'Derbi de Flandes Occidental' },
  { a: 'be_gent', b: 'be_brugge', name: 'Derbi de Flandes' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
