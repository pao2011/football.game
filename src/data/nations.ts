// Selecciones nacionales: escudo (src/assets/crests/nt_<archivo>.webp), colores, nivel y confederación.
// Las plantillas se generan (nombres inventados) con el nivel de cada selección.
import type { FormationId, KitData } from './types';
import type { TeamSeed } from './teams';
import { crest, kit, GK_BLACK, GK_GREEN, GK_ORANGE, GK_PURPLE, GK_YELLOW } from './seedUtil';

export type Confed = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

type Row = [file: string, name: string, short: string, confed: Confed, rating: number,
  shirt: string, shirt2: string, pattern: KitData['pattern'], shorts: string, socks: string, number: string,
  awayShirt: string, awayShorts: string];

const W = '#ffffff';
const K = '#111111';
const ROWS: Row[] = [
  // ---- CONMEBOL
  ['argentina', 'Argentina', 'ARG', 'CONMEBOL', 90, W, '#75aadb', 'stripes', K, W, K, '#1b2a6b', '#1b2a6b'],
  ['brasil', 'Brasil', 'BRA', 'CONMEBOL', 88, '#f7d117', '#009b3a', 'solid', '#1b3fa0', W, '#009b3a', '#1b3fa0', W],
  ['uruguay', 'Uruguay', 'URU', 'CONMEBOL', 84, '#6cb4ee', W, 'solid', K, K, W, W, '#6cb4ee'],
  ['colombia', 'Colombia', 'COL', 'CONMEBOL', 84, '#fcd116', '#003893', 'solid', '#003893', '#ce1126', '#003893', '#0b1f4d', '#0b1f4d'],
  ['ecuador', 'Ecuador', 'ECU', 'CONMEBOL', 81, '#ffd100', '#0033a0', 'solid', '#0033a0', '#c8102e', '#0033a0', '#0033a0', W],
  ['chile', 'Chile', 'CHI', 'CONMEBOL', 78, '#d52b1e', '#0039a6', 'solid', '#0039a6', W, W, W, '#d52b1e'],
  ['paraguay', 'Paraguay', 'PAR', 'CONMEBOL', 79, '#d52b1e', W, 'stripes', '#0038a8', '#0038a8', '#0038a8', W, '#0038a8'],
  ['peru', 'Perú', 'PER', 'CONMEBOL', 77, W, '#d91023', 'sash', W, W, '#d91023', '#d91023', '#d91023'],
  ['venezuela', 'Venezuela', 'VEN', 'CONMEBOL', 77, '#7b1532', '#f7d117', 'solid', '#7b1532', '#7b1532', '#f7d117', W, W],
  ['bolivia', 'Bolivia', 'BOL', 'CONMEBOL', 73, '#007934', '#f4e400', 'solid', W, '#007934', W, W, '#007934'],
  // ---- UEFA
  ['francia', 'Francia', 'FRA', 'UEFA', 90, '#1f2a63', '#ed2939', 'solid', W, '#ed2939', W, W, '#1f2a63'],
  ['espana', 'España', 'ESP', 'UEFA', 90, '#c60b1e', '#ffc400', 'solid', '#1b2a6b', '#1b2a6b', '#ffc400', '#f4e9c1', '#f4e9c1'],
  ['inglaterra', 'Inglaterra', 'ENG', 'UEFA', 89, W, '#1b2a6b', 'solid', '#1b2a6b', W, '#1b2a6b', '#1b2a6b', '#1b2a6b'],
  ['portugal', 'Portugal', 'POR', 'UEFA', 88, '#c8102e', '#046a38', 'solid', '#046a38', '#c8102e', '#ffd100', W, W],
  ['alemania', 'Alemania', 'GER', 'UEFA', 87, W, K, 'solid', K, W, K, '#e6397f', '#e6397f'],
  ['paisesbajos', 'Países Bajos', 'NED', 'UEFA', 87, '#f36c21', K, 'solid', '#f36c21', '#f36c21', K, '#1b2a6b', '#1b2a6b'],
  ['italia', 'Italia', 'ITA', 'UEFA', 86, '#0f52ba', W, 'solid', W, '#0f52ba', W, W, '#0f52ba'],
  ['belgica', 'Bélgica', 'BEL', 'UEFA', 86, '#c8102e', K, 'solid', '#c8102e', '#c8102e', '#ffd100', '#9ad1f0', '#9ad1f0'],
  ['croacia', 'Croacia', 'CRO', 'UEFA', 85, W, '#e4002b', 'hoops', W, '#0c2c84', '#0c2c84', '#0c2c84', '#0c2c84'],
  ['suiza', 'Suiza', 'SUI', 'UEFA', 82, '#d52b1e', W, 'solid', W, '#d52b1e', W, W, '#d52b1e'],
  ['dinamarca', 'Dinamarca', 'DEN', 'UEFA', 82, '#c8102e', W, 'solid', W, '#c8102e', W, W, '#c8102e'],
  ['austria', 'Austria', 'AUT', 'UEFA', 81, '#c8102e', W, 'solid', W, '#c8102e', W, K, K],
  ['turquia', 'Turquía', 'TUR', 'UEFA', 81, W, '#e30a17', 'band', W, W, '#e30a17', '#e30a17', '#e30a17'],
  ['noruega', 'Noruega', 'NOR', 'UEFA', 81, '#ba0c2f', '#00205b', 'solid', W, '#00205b', W, W, '#00205b'],
  ['ucrania', 'Ucrania', 'UKR', 'UEFA', 80, '#ffd500', '#005bbb', 'solid', '#ffd500', '#ffd500', '#005bbb', '#005bbb', '#005bbb'],
  ['serbia', 'Serbia', 'SRB', 'UEFA', 80, '#c6363c', '#0c4076', 'solid', '#0c4076', W, W, W, W],
  ['suecia', 'Suecia', 'SWE', 'UEFA', 80, '#ffcd00', '#004b87', 'solid', '#004b87', '#ffcd00', '#004b87', '#004b87', '#ffcd00'],
  ['polonia', 'Polonia', 'POL', 'UEFA', 79, W, '#dc143c', 'solid', '#dc143c', W, '#dc143c', '#dc143c', W],
  ['escocia', 'Escocia', 'SCO', 'UEFA', 79, '#0b1f4d', W, 'solid', W, '#7a1632', W, '#f2c9d4', '#0b1f4d'],
  ['hungria', 'Hungría', 'HUN', 'UEFA', 79, '#ce2939', '#477050', 'solid', W, '#477050', W, W, '#ce2939'],
  ['republicacheca', 'República Checa', 'CZE', 'UEFA', 79, '#d7141a', '#11457e', 'solid', W, '#11457e', W, W, '#11457e'],
  ['gales', 'Gales', 'WAL', 'UEFA', 78, '#c8102e', '#00ab39', 'solid', '#c8102e', '#c8102e', W, '#f7d117', '#00ab39'],
  ['rusia', 'Rusia', 'RUS', 'UEFA', 78, '#b5121b', W, 'solid', W, '#b5121b', W, W, '#0039a6'],
  ['grecia', 'Grecia', 'GRE', 'UEFA', 78, W, '#0d5eaf', 'solid', W, W, '#0d5eaf', '#0d5eaf', '#0d5eaf'],
  ['rumania', 'Rumania', 'ROU', 'UEFA', 77, '#fcd116', '#002b7f', 'solid', '#fcd116', '#fcd116', '#002b7f', '#ce1126', '#ce1126'],
  ['eslovaquia', 'Eslovaquia', 'SVK', 'UEFA', 77, '#0b4ea2', W, 'solid', '#0b4ea2', '#0b4ea2', W, W, W],
  ['eslovenia', 'Eslovenia', 'SVN', 'UEFA', 77, W, '#0057b8', 'solid', W, W, '#0057b8', '#0057b8', '#0057b8'],
  ['irlanda', 'Irlanda', 'IRL', 'UEFA', 76, '#169b62', '#ff883e', 'solid', W, '#169b62', W, W, '#169b62'],
  ['bosnia', 'Bosnia y Herzegovina', 'BIH', 'UEFA', 76, '#002395', '#fecb00', 'solid', '#002395', '#002395', W, W, '#002395'],
  ['islandia', 'Islandia', 'ISL', 'UEFA', 75, '#02529c', '#dc1e35', 'solid', '#02529c', '#02529c', W, W, W],
  ['finlandia', 'Finlandia', 'FIN', 'UEFA', 75, W, '#003580', 'solid', '#003580', W, '#003580', '#003580', '#003580'],
  ['israel', 'Israel', 'ISR', 'UEFA', 75, '#0038b8', W, 'solid', '#0038b8', '#0038b8', W, W, W],
  ['irlandadelnorte', 'Irlanda del Norte', 'NIR', 'UEFA', 74, '#00824d', W, 'solid', W, '#00824d', W, W, '#00824d'],
  ['kosovo', 'Kosovo', 'KOS', 'UEFA', 74, '#244aa5', '#d0a650', 'solid', '#244aa5', '#244aa5', '#d0a650', W, W],
  ['estonia', 'Estonia', 'EST', 'UEFA', 68, '#0072ce', K, 'solid', K, W, W, W, K],
  ['letonia', 'Letonia', 'LVA', 'UEFA', 67, '#9e3039', W, 'solid', '#9e3039', '#9e3039', W, W, W],
  ['sanmarino', 'San Marino', 'SMR', 'UEFA', 55, '#5eb6e4', W, 'solid', '#5eb6e4', '#5eb6e4', W, W, W],
  // ---- CONCACAF
  ['mexico', 'México', 'MEX', 'CONCACAF', 81, '#006847', '#ce1126', 'solid', W, '#ce1126', W, W, '#006847'],
  ['usa', 'Estados Unidos', 'USA', 'CONCACAF', 81, W, '#b22234', 'solid', '#0a3161', W, '#0a3161', '#0a3161', '#0a3161'],
  ['canada', 'Canadá', 'CAN', 'CONCACAF', 79, '#d80621', W, 'solid', '#d80621', '#d80621', W, W, W],
  ['panama', 'Panamá', 'PAN', 'CONCACAF', 76, '#da121a', '#072357', 'solid', '#da121a', '#da121a', W, W, W],
  ['costarica', 'Costa Rica', 'CRC', 'CONCACAF', 75, '#ce1126', '#002b7f', 'solid', '#002b7f', W, W, W, '#002b7f'],
  ['jamaica', 'Jamaica', 'JAM', 'CONCACAF', 74, '#fed100', '#009b3a', 'solid', K, '#fed100', K, K, K],
  ['honduras', 'Honduras', 'HON', 'CONCACAF', 72, W, '#0073cf', 'solid', W, W, '#0073cf', '#0073cf', '#0073cf'],
  ['elsalvador', 'El Salvador', 'SLV', 'CONCACAF', 69, '#0047ab', W, 'solid', '#0047ab', '#0047ab', W, W, W],
  ['guatemala', 'Guatemala', 'GUA', 'CONCACAF', 70, W, '#4997d0', 'sash', W, W, '#4997d0', '#4997d0', '#4997d0'],
  ['republicadominicana', 'República Dominicana', 'DOM', 'CONCACAF', 67, '#002d62', '#ce1126', 'solid', '#002d62', '#002d62', W, W, W],
  // ---- CAF
  ['marruecos', 'Marruecos', 'MAR', 'CAF', 84, '#c1272d', '#006233', 'solid', '#c1272d', '#c1272d', W, W, W],
  ['senegal', 'Senegal', 'SEN', 'CAF', 82, W, '#00853f', 'solid', W, W, '#00853f', '#00853f', '#00853f'],
  ['egipto', 'Egipto', 'EGY', 'CAF', 80, '#ce1126', W, 'solid', W, K, W, W, K],
  ['nigeria', 'Nigeria', 'NGA', 'CAF', 80, '#008751', W, 'solid', '#008751', '#008751', W, W, W],
  ['argelia', 'Argelia', 'ALG', 'CAF', 80, W, '#006233', 'solid', W, W, '#006233', '#006233', '#006233'],
  ['camerun', 'Camerún', 'CMR', 'CAF', 78, '#007a5e', '#ce1126', 'solid', '#ce1126', '#fcd116', '#fcd116', '#fcd116', '#007a5e'],
  ['tunez', 'Túnez', 'TUN', 'CAF', 77, '#e70013', W, 'solid', '#e70013', '#e70013', W, W, W],
  ['ghana', 'Ghana', 'GHA', 'CAF', 77, W, K, 'solid', W, W, K, '#fcd116', '#fcd116'],
  // ---- AFC
  ['japon', 'Japón', 'JPN', 'AFC', 83, '#0b1f6b', W, 'solid', '#0b1f6b', '#0b1f6b', W, W, W],
  ['iran', 'Irán', 'IRN', 'AFC', 80, W, '#da0000', 'solid', W, W, '#da0000', '#da0000', '#da0000'],
  ['coreadelsur', 'Corea del Sur', 'KOR', 'AFC', 81, '#cd2e3a', K, 'solid', K, '#cd2e3a', W, W, W],
  ['australia', 'Australia', 'AUS', 'AFC', 79, '#ffcd00', '#00843d', 'solid', '#00843d', '#ffcd00', '#00843d', '#0b1f4d', '#0b1f4d'],
  ['arabiasaudita', 'Arabia Saudita', 'KSA', 'AFC', 76, '#006c35', W, 'solid', '#006c35', '#006c35', W, W, W],
  ['qatar', 'Qatar', 'QAT', 'AFC', 76, '#8a1538', W, 'solid', '#8a1538', '#8a1538', W, W, W],
  ['china', 'China', 'CHN', 'AFC', 71, '#de2910', '#ffde00', 'solid', '#de2910', '#de2910', '#ffde00', W, W],
  ['bangladesh', 'Bangladés', 'BAN', 'AFC', 58, '#006a4e', '#f42a41', 'solid', '#006a4e', '#006a4e', W, '#f42a41', '#f42a41'],
  // ---- OFC
  ['nuevazelanda', 'Nueva Zelanda', 'NZL', 'OFC', 73, W, K, 'solid', W, W, K, K, K],
  ['tahiti', 'Tahití', 'TAH', 'OFC', 58, W, '#ce1126', 'solid', W, W, '#ce1126', '#ce1126', '#ce1126'],
];

const FORMATIONS: FormationId[] = ['4-3-3', '4-2-3-1', '4-4-2', '4-3-3', '3-5-2'];
const GKS = [GK_YELLOW, GK_GREEN, GK_ORANGE, GK_PURPLE, GK_BLACK];

/** Confederación de cada selección (por id de equipo). */
export const NATION_CONFED: Record<string, Confed> = {};

export const NATION_SEEDS: TeamSeed[] = ROWS.map(([file, name, short, confed, rating, shirt, shirt2, pattern, shorts, socks, number, awayShirt, awayShorts], i) => {
  const id = `nt_${file}`;
  NATION_CONFED[id] = confed;
  // el dorsal de la suplente contrasta con su camiseta
  const awayNumber = awayShirt === W || awayShirt === '#f4e9c1' || awayShirt === '#f7d117' || awayShirt === '#fcd116' || awayShirt === '#f2c9d4' || awayShirt === '#9ad1f0' ? (shirt === W ? shirt2 : shirt) : W;
  return {
    id, name, short, city: confed, crest: crest(id, shirt === W ? shirt2 : shirt, shirt === W ? W : shirt2),
    home: kit(shirt, shirt2, pattern, shorts, socks, number),
    away: kit(awayShirt, awayShirt, 'solid', awayShorts, awayShirt, awayNumber),
    gkKit: GKS[i % GKS.length], formation: FORMATIONS[i % FORMATIONS.length], rating, seed: 9000 + i,
  };
});
