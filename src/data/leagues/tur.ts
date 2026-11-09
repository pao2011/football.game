import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Süper Lig (Turquía) 2026/27. Escudos de Transfermarkt (src/assets/crests/tr_*.webp). Plantillas en tmRosters.ts.

const teams: TeamSeed[] = [
  {
    id: 'tr_galatasaray', name: 'Galatasaray', short: 'GAL', city: 'İstanbul', crest: crest('tr_galatasaray', '#e30613', '#fdb913'),
    home: kit('#e30613', '#fdb913', 'halves', '#e30613', '#e30613', '#fdb913'), away: kit('#ffffff', '#e30613', 'band', '#ffffff', '#ffffff', '#e30613'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 80, seed: 19000,
  },
  {
    id: 'tr_besiktas', name: 'Beşiktaş', short: 'BJK', city: 'İstanbul', crest: crest('tr_besiktas', '#111111', '#ffffff'),
    home: kit('#111111', '#ffffff', 'stripes', '#111111', '#111111', '#ffffff'), away: kit('#ffffff', '#111111', 'band', '#ffffff', '#ffffff', '#111111'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 79, seed: 19001,
  },
  {
    id: 'tr_fenerbahce', name: 'Fenerbahçe', short: 'FEN', city: 'İstanbul', crest: crest('tr_fenerbahce', '#002d72', '#ffed00'),
    home: kit('#ffed00', '#002d72', 'stripes', '#002d72', '#ffed00', '#002d72'), away: kit('#002d72', '#ffed00', 'solid', '#002d72', '#002d72', '#ffed00'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 78, seed: 19002,
  },
  {
    id: 'tr_trabzonspor', name: 'Trabzonspor', short: 'TRA', city: 'Trabzon', crest: crest('tr_trabzonspor', '#7b1e3a', '#00a8e8'),
    home: kit('#7b1e3a', '#00a8e8', 'halves', '#7b1e3a', '#7b1e3a', '#ffffff'), away: kit('#ffffff', '#7b1e3a', 'band', '#ffffff', '#ffffff', '#7b1e3a'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 77, seed: 19003,
  },
  {
    id: 'tr_basaksehir', name: 'İstanbul Başakşehir', short: 'IBF', city: 'İstanbul', crest: crest('tr_basaksehir', '#f26522', '#1c2b5a'),
    home: kit('#f26522', '#1c2b5a', 'solid', '#1c2b5a', '#f26522', '#ffffff'), away: kit('#1c2b5a', '#f26522', 'solid', '#1c2b5a', '#1c2b5a', '#f26522'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 76, seed: 19004,
  },
  {
    id: 'tr_goztepe', name: 'Göztepe', short: 'GOZ', city: 'İzmir', crest: crest('tr_goztepe', '#ffed00', '#d71920'),
    home: kit('#ffed00', '#d71920', 'hoops', '#d71920', '#ffed00', '#d71920'), away: kit('#d71920', '#ffed00', 'hoops', '#d71920', '#d71920', '#ffed00'), gkKit: GK_PURPLE,
    formation: '4-3-3', rating: 75, seed: 19005,
  },
  {
    id: 'tr_corum', name: 'Çorum FK', short: 'COR', city: 'Çorum', crest: crest('tr_corum', '#e30613', '#111111'),
    home: kit('#e30613', '#111111', 'stripes', '#111111', '#e30613', '#ffffff'), away: kit('#ffffff', '#e30613', 'solid', '#ffffff', '#ffffff', '#e30613'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 74, seed: 19006,
  },
  {
    id: 'tr_samsunspor', name: 'Samsunspor', short: 'SAM', city: 'Samsun', crest: crest('tr_samsunspor', '#d71920', '#ffffff'),
    home: kit('#d71920', '#ffffff', 'stripes', '#d71920', '#d71920', '#ffffff'), away: kit('#ffffff', '#d71920', 'band', '#ffffff', '#ffffff', '#d71920'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 73, seed: 19007,
  },
  {
    id: 'tr_rizespor', name: 'Çaykur Rizespor', short: 'RIZ', city: 'Rize', crest: crest('tr_rizespor', '#00873e', '#1c5fb4'),
    home: kit('#00873e', '#1c5fb4', 'stripes', '#ffffff', '#00873e', '#ffffff'), away: kit('#ffffff', '#00873e', 'band', '#ffffff', '#ffffff', '#00873e'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 72, seed: 19008,
  },
  {
    id: 'tr_kasimpasa', name: 'Kasımpaşa', short: 'KAS', city: 'İstanbul', crest: crest('tr_kasimpasa', '#1c3f94', '#ffffff'),
    home: kit('#ffffff', '#1c3f94', 'sash', '#1c3f94', '#ffffff', '#1c3f94'), away: kit('#1c3f94', '#ffffff', 'solid', '#1c3f94', '#1c3f94', '#ffffff'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 71, seed: 19009,
  },
  {
    id: 'tr_alanyaspor', name: 'Alanyaspor', short: 'ALA', city: 'Alanya', crest: crest('tr_alanyaspor', '#f08a00', '#00a651'),
    home: kit('#f08a00', '#00a651', 'stripes', '#00a651', '#f08a00', '#ffffff'), away: kit('#00a651', '#f08a00', 'solid', '#00a651', '#00a651', '#ffffff'), gkKit: GK_PURPLE,
    formation: '4-3-3', rating: 70, seed: 19010,
  },
  {
    id: 'tr_konyaspor', name: 'Konyaspor', short: 'KON', city: 'Konya', crest: crest('tr_konyaspor', '#00873e', '#ffffff'),
    home: kit('#00873e', '#ffffff', 'stripes', '#ffffff', '#00873e', '#ffffff'), away: kit('#ffffff', '#00873e', 'solid', '#ffffff', '#ffffff', '#00873e'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 69, seed: 19011,
  },
  {
    id: 'tr_amed', name: 'Amedspor', short: 'AMD', city: 'Diyarbakır', crest: crest('tr_amed', '#d71920', '#00873e'),
    home: kit('#d71920', '#00873e', 'stripes', '#d71920', '#d71920', '#ffffff'), away: kit('#00873e', '#ffed00', 'solid', '#00873e', '#00873e', '#ffffff'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 68, seed: 19012,
  },
  {
    id: 'tr_gaziantep', name: 'Gaziantep FK', short: 'GAZ', city: 'Gaziantep', crest: crest('tr_gaziantep', '#d71920', '#111111'),
    home: kit('#d71920', '#111111', 'stripes', '#111111', '#d71920', '#ffffff'), away: kit('#111111', '#d71920', 'solid', '#111111', '#111111', '#d71920'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 67, seed: 19013,
  },
  {
    id: 'tr_genclerbirligi', name: 'Gençlerbirliği', short: 'GEN', city: 'Ankara', crest: crest('tr_genclerbirligi', '#d71920', '#111111'),
    home: kit('#d71920', '#111111', 'halves', '#111111', '#d71920', '#ffffff'), away: kit('#ffffff', '#d71920', 'band', '#ffffff', '#ffffff', '#111111'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 66, seed: 19014,
  },
  {
    id: 'tr_kocaelispor', name: 'Kocaelispor', short: 'KOC', city: 'Kocaeli', crest: crest('tr_kocaelispor', '#00873e', '#111111'),
    home: kit('#00873e', '#111111', 'stripes', '#111111', '#00873e', '#ffffff'), away: kit('#ffffff', '#00873e', 'band', '#ffffff', '#ffffff', '#00873e'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 65, seed: 19015,
  },
  {
    id: 'tr_erzurumspor', name: 'Erzurumspor FK', short: 'ERZ', city: 'Erzurum', crest: crest('tr_erzurumspor', '#1c9ad6', '#111111'),
    home: kit('#1c9ad6', '#111111', 'stripes', '#111111', '#1c9ad6', '#ffffff'), away: kit('#ffffff', '#1c9ad6', 'solid', '#ffffff', '#ffffff', '#1c9ad6'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 64, seed: 19016,
  },
  {
    id: 'tr_eyupspor', name: 'Eyüpspor', short: 'EYU', city: 'İstanbul', crest: crest('tr_eyupspor', '#7b1e8a', '#ffed00'),
    home: kit('#7b1e8a', '#ffed00', 'stripes', '#7b1e8a', '#7b1e8a', '#ffed00'), away: kit('#ffed00', '#7b1e8a', 'solid', '#ffed00', '#ffed00', '#7b1e8a'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 63, seed: 19017,
  },
];

const stadiums: StadiumData[] = [
  stadium('tr_est_galatasaray', "Ali Sami Yen Spor Kompleksi RAMS Park", 53978, 'tr_galatasaray', { standColor: '#7a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#e30613', '#fdb913'] } }),
  stadium('tr_est_besiktas', "Beşiktaş Park", 42684, 'tr_besiktas', { standColor: '#1c1c1c', look: { roof: 'ring', upper: 'both', seats: ['#111111', '#ffffff'] } }),
  stadium('tr_est_fenerbahce', "Chobani Stadyumu FB Şükrü Saracoğlu Spor Kompleksi", 47430, 'tr_fenerbahce', { standColor: '#1a2a52', look: { roof: 'ring', upper: 'both', seats: ['#002d72', '#ffed00'] } }),
  stadium('tr_est_trabzonspor', "Papara Park", 41061, 'tr_trabzonspor', { standColor: '#4a1a2a', look: { roof: 'ring', upper: 'both', seats: ['#7b1e3a', '#00a8e8'] } }),
  stadium('tr_est_basaksehir', "Başakşehir Fatih Terim", 17067, 'tr_basaksehir', { standColor: '#2a2f3a', look: { roof: 'sides', upper: 'none', seats: ['#f26522', '#1c2b5a'] } }),
  stadium('tr_est_goztepe', "Gürsel Aksel Stadyumu", 23376, 'tr_goztepe', { standColor: '#4a3a1a', look: { roof: 'sides', upper: 'none', seats: ['#ffed00', '#d71920'] } }),
  stadium('tr_est_corum', "Çorum Şehir Stadyumu", 15000, 'tr_corum', { standColor: '#2a2f3a', look: { roof: 'none', upper: 'none', seats: ['#e30613', '#111111'] } }),
  stadium('tr_est_samsunspor', "Samsun Yeni 19 Mayıs", 34303, 'tr_samsunspor', { standColor: '#5a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#d71920', '#ffffff'] } }),
  stadium('tr_est_rizespor', "Çaykur Didi", 14879, 'tr_rizespor', { standColor: '#14452c', look: { roof: 'sides', upper: 'none', seats: ['#00873e', '#1c5fb4'] } }),
  stadium('tr_est_kasimpasa', "Recep Tayyip Erdoğan Stadyumu", 13797, 'tr_kasimpasa', { standColor: '#2a2f3a', look: { roof: 'none', upper: 'none', seats: ['#1c3f94', '#ffffff'] } }),
  stadium('tr_est_alanyaspor', "Alanya Oba Stadyumu", 9727, 'tr_alanyaspor', { standColor: '#2a2f3a', look: { roof: 'none', upper: 'none', seats: ['#f08a00', '#00a651'] } }),
  stadium('tr_est_konyaspor', "Medaş Konya Büyükşehir Stadyumu", 41600, 'tr_konyaspor', { standColor: '#14452c', look: { roof: 'ring', upper: 'both', seats: ['#00873e', '#ffffff'] } }),
  stadium('tr_est_amed', "Diyarbakır Stadyumu", 33000, 'tr_amed', { standColor: '#5a1a1a', look: { roof: 'sides', upper: 'both', seats: ['#d71920', '#00873e'] } }),
  stadium('tr_est_gaziantep', "Gaziantep Stadyumu", 30320, 'tr_gaziantep', { standColor: '#3a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#d71920', '#111111'] } }),
  stadium('tr_est_genclerbirligi', "Eryaman Stadyumu", 20000, 'tr_genclerbirligi', { standColor: '#2a2f3a', look: { roof: 'sides', upper: 'none', seats: ['#d71920', '#111111'] } }),
  stadium('tr_est_kocaelispor', "Turka Araç Muayene Kocaeli Stadyumu", 34829, 'tr_kocaelispor', { standColor: '#14452c', look: { roof: 'ring', upper: 'both', seats: ['#00873e', '#111111'] } }),
  stadium('tr_est_erzurumspor', "Erzurum Kazım Karabekir Stadyumu", 21374, 'tr_erzurumspor', { standColor: '#1a3a52', look: { roof: 'ring', upper: 'both', seats: ['#1c9ad6', '#111111'] } }),
  stadium('tr_est_eyupspor', "Esenyurt Necmi Kadıoğlu Stadı", 4274, 'tr_eyupspor', { standColor: '#2a2f3a', look: { roof: 'none', upper: 'none', seats: ['#7b1e8a', '#ffed00'] } }),
];

const classics: ClassicDef[] = [
  { a: 'tr_galatasaray', b: 'tr_fenerbahce', name: "Kıtalar Arası Derbi" },
  { a: 'tr_galatasaray', b: 'tr_besiktas', name: "Galatasaray–Beşiktaş" },
  { a: 'tr_fenerbahce', b: 'tr_besiktas', name: "Fenerbahçe–Beşiktaş" },
  { a: 'tr_trabzonspor', b: 'tr_galatasaray', name: "Trabzonspor–Galatasaray" },
  { a: 'tr_trabzonspor', b: 'tr_fenerbahce', name: "Trabzonspor–Fenerbahçe" },
  { a: 'tr_trabzonspor', b: 'tr_besiktas', name: "Trabzonspor–Beşiktaş" },
  { a: 'tr_basaksehir', b: 'tr_galatasaray', name: "Başakşehir–Galatasaray" },
  { a: 'tr_kasimpasa', b: 'tr_eyupspor', name: "Derbi de İstanbul" },
  { a: 'tr_basaksehir', b: 'tr_kasimpasa', name: "Derbi de İstanbul" },
];

export const DATA: LeagueData = { teams, stadiums, classics };
