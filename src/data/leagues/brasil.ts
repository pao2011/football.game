import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Campeonato Brasileiro Série A 2026 (los 20 equipos). Escudos aportados por el usuario (src/assets/crests/br_*.webp).
// Las plantillas vienen de Transfermarkt (tmRosters.ts).

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  {
    id: 'br_flamengo', name: 'Flamengo', short: 'FLA', city: 'Rio de Janeiro', crest: crest('br_flamengo', '#d71920', K),
    home: kit('#d71920', K, 'hoops', W, '#d71920', W), away: kit(W, '#d71920', 'band', W, W, '#d71920'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 86, seed: 2001,
  },
  {
    id: 'br_palmeiras', name: 'Palmeiras', short: 'PAL', city: 'São Paulo', crest: crest('br_palmeiras', '#006437', W),
    home: kit('#006437', W, 'solid', W, '#006437', W), away: kit(W, '#006437', 'solid', W, W, '#006437'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 86, seed: 2002,
  },
  {
    id: 'br_botafogo', name: 'Botafogo', short: 'BOT', city: 'Rio de Janeiro', crest: crest('br_botafogo', K, W),
    home: kit(K, W, 'stripes', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 80, seed: 2003,
  },
  {
    id: 'br_cruzeiro', name: 'Cruzeiro', short: 'CRU', city: 'Belo Horizonte', crest: crest('br_cruzeiro', '#1b4fa0', W),
    home: kit('#1b4fa0', W, 'solid', W, '#1b4fa0', W), away: kit(W, '#1b4fa0', 'solid', W, W, '#1b4fa0'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 80, seed: 2004,
  },
  {
    id: 'br_atleticomg', name: 'Atlético Mineiro', short: 'CAM', city: 'Belo Horizonte', crest: crest('br_atleticomg', K, W),
    home: kit(W, K, 'stripes', K, K, W), away: kit('#f2c230', K, 'solid', K, '#f2c230', K), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 79, seed: 2005,
  },
  {
    id: 'br_corinthians', name: 'Corinthians', short: 'COR', city: 'São Paulo', crest: crest('br_corinthians', K, W),
    home: kit(W, K, 'solid', K, W, K), away: kit(K, W, 'solid', K, K, W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 79, seed: 2006,
  },
  {
    id: 'br_fluminense', name: 'Fluminense', short: 'FLU', city: 'Rio de Janeiro', crest: crest('br_fluminense', '#7a1f3d', '#00704a'),
    home: kit('#7a1f3d', '#00704a', 'stripes', W, W, W), away: kit(W, '#7a1f3d', 'band', W, W, '#00704a'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 79, seed: 2007,
  },
  {
    id: 'br_saopaulo', name: 'São Paulo', short: 'SAO', city: 'São Paulo', crest: crest('br_saopaulo', '#d71920', K),
    home: kit(W, '#d71920', 'band', W, W, K), away: kit('#d71920', K, 'solid', '#d71920', '#d71920', W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 78, seed: 2008,
  },
  {
    id: 'br_internacional', name: 'Internacional', short: 'INT', city: 'Porto Alegre', crest: crest('br_internacional', '#d71920', W),
    home: kit('#d71920', W, 'solid', W, '#d71920', W), away: kit(W, '#d71920', 'solid', W, W, '#d71920'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 78, seed: 2009,
  },
  {
    id: 'br_bahia', name: 'Bahia', short: 'BAH', city: 'Salvador', crest: crest('br_bahia', '#0a4ea3', '#d71920'),
    home: kit('#0a4ea3', '#d71920', 'stripes', W, '#0a4ea3', W), away: kit(W, '#0a4ea3', 'band', W, W, '#d71920'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 78, seed: 2010,
  },
  {
    id: 'br_gremio', name: 'Grêmio', short: 'GRE', city: 'Porto Alegre', crest: crest('br_gremio', '#00a3e0', K),
    home: kit('#00a3e0', K, 'stripes', K, K, W), away: kit(K, '#00a3e0', 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 77, seed: 2012,
  },
  {
    id: 'br_vasco', name: 'Vasco da Gama', short: 'VAS', city: 'Rio de Janeiro', crest: crest('br_vasco', K, W),
    home: kit(K, W, 'sash', K, K, W), away: kit(W, K, 'sash', W, W, K), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 77, seed: 2013,
  },
  {
    id: 'br_santos', name: 'Santos', short: 'SAN', city: 'Santos', crest: crest('br_santos', W, K),
    home: kit(W, K, 'solid', W, W, K), away: kit(K, W, 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 76, seed: 2014,
  },
  {
    id: 'br_bragantino', name: 'Red Bull Bragantino', short: 'RBB', city: 'Bragança Paulista', crest: crest('br_bragantino', W, '#d71920'),
    home: kit(W, '#d71920', 'solid', W, W, '#d71920'), away: kit('#d71920', W, 'solid', '#d71920', '#d71920', W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 76, seed: 2015,
  },
  {
    id: 'br_vitoria', name: 'Vitória', short: 'VIT', city: 'Salvador', crest: crest('br_vitoria', '#d71920', K),
    home: kit('#d71920', K, 'stripes', K, K, W), away: kit(W, '#d71920', 'band', W, W, K), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 74, seed: 2016,
  },
  {
    id: 'br_mirassol', name: 'Mirassol', short: 'MIR', city: 'Mirassol', crest: crest('br_mirassol', '#f7d417', '#0a7a3a'),
    home: kit('#f7d417', '#0a7a3a', 'solid', '#0a7a3a', '#f7d417', '#0a7a3a'), away: kit('#0a7a3a', '#f7d417', 'solid', '#0a7a3a', '#0a7a3a', '#f7d417'), gkKit: GK_PURPLE,
    formation: '4-2-3-1', rating: 74, seed: 2018,
  },
  {
    id: 'br_athleticopr', name: 'Athletico Paranaense', short: 'CAP', city: 'Curitiba', crest: crest('br_athleticopr', '#d71920', K),
    home: kit('#d71920', K, 'stripes', K, '#d71920', W), away: kit(W, '#d71920', 'band', W, W, '#d71920'), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 77, seed: 2021,
  },
  {
    id: 'br_chapecoense', name: 'Chapecoense', short: 'CHA', city: 'Chapecó', crest: crest('br_chapecoense', '#0a7a3a', W),
    home: kit('#0a7a3a', W, 'solid', '#0a7a3a', '#0a7a3a', W), away: kit(W, '#0a7a3a', 'band', W, W, '#0a7a3a'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 72, seed: 2022,
  },
  {
    id: 'br_coritiba', name: 'Coritiba', short: 'CFC', city: 'Curitiba', crest: crest('br_coritiba', '#0a7a3a', W),
    home: kit(W, '#0a7a3a', 'band', W, W, '#0a7a3a'), away: kit('#0a7a3a', W, 'solid', '#0a7a3a', '#0a7a3a', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 73, seed: 2023,
  },
  {
    id: 'br_remo', name: 'Remo', short: 'REM', city: 'Belém', crest: crest('br_remo', '#0d2b5e', W),
    home: kit('#0d2b5e', W, 'solid', W, '#0d2b5e', W), away: kit(W, '#0d2b5e', 'band', W, W, '#0d2b5e'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 72, seed: 2024,
  },
];

const stadiums: StadiumData[] = [
  stadium('br_maracana', 'Estadio Alejandro Villanueva', 33938, 'br_flamengo', { standColor: '#7a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#d71920', K, W] } }),
  stadium('br_allianz', 'Nubank Parque', 43713, 'br_palmeiras', { standColor: '#14452c', look: { roof: 'ring', upper: 'both', seats: ['#006437', W] } }),
  stadium('br_nilton_santos', 'Estádio Olímpico Nilton Santos', 46931, 'br_botafogo', { standColor: '#1c1c1c', look: { roof: 'ring', upper: 'both', track: '#9a4a3a', seats: [K, W] } }),
  stadium('br_mineirao', 'Estádio Governador Magalhães Pinto', 61927, 'br_cruzeiro', { standColor: '#1a3a7a', look: { roof: 'ring', upper: 'both', seats: ['#1b4fa0', W] } }),
  stadium('br_arena_mrv', 'Arena MRV', 44892, 'br_atleticomg', { standColor: '#222222', look: { roof: 'ring', upper: 'both', seats: [K, W] } }),
  stadium('br_neo_quimica', 'Neo Química Arena', 49205, 'br_corinthians', { standColor: '#222222', look: { roof: 'ring', upper: 'both', seats: [K, W] } }),
  stadium('br_maracana_flu', 'Estádio Jornalista Mário Filho', 82238, 'br_fluminense', { standColor: '#5a1a2e', look: { roof: 'ring', upper: 'both', seats: ['#7a1f3d', '#00704a', W] } }),
  stadium('br_morumbi', 'MorumBIS', 72039, 'br_saopaulo', { standColor: '#4a2a2a', look: { roof: 'sides', upper: 'both', seats: ['#d71920', W, K] } }),
  stadium('br_beira_rio', 'Estádio Beira-Rio', 50848, 'br_internacional', { standColor: '#8a1a24', look: { roof: 'ring', upper: 'both', seats: ['#d71920', W] } }),
  stadium('br_fonte_nova', 'Juan Maldonado Gamarra', 13000, 'br_bahia', { standColor: '#1a3a7a', look: { roof: 'ring', upper: 'both', seats: ['#0a4ea3', '#d71920', W] } }),
  stadium('br_arena_gremio', 'Arena do Grêmio', 60540, 'br_gremio', { standColor: '#1a5a7a', look: { roof: 'ring', upper: 'both', seats: ['#00a3e0', K, W] } }),
  stadium('br_sao_januario', 'Estádio São Januário', 24584, 'br_vasco', { standColor: '#222222', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: [K, W] } }),
  stadium('br_vila_belmiro', 'Estádio Urbano Caldeira', 16068, 'br_santos', { standColor: '#2a2a2a', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: [W, K] } }),
  stadium('br_nabi_abi_chedid', 'Estádio Municipal Cicero De Souza Marques', 12000, 'br_bragantino', { standColor: '#8a1a24', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: [W, '#d71920'] } }),
  stadium('br_barradao', 'Estadio Los Chankas', 14000, 'br_vitoria', { standColor: '#5a1a1a', look: { roof: 'none', upper: 'far', seats: ['#d71920', K] } }),
  stadium('br_maiao', 'Estadio de Fútbol Jaraguay de Montería', 12000, 'br_mirassol', { standColor: '#1d5a34', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#f7d417', '#0a7a3a'] } }),
  stadium('br_ligga', 'Estádio Mário Celso Petraglia', 42372, 'br_athleticopr', { standColor: '#7a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#d71920', '#111111'] } }),
  stadium('br_conda', 'Arena Condá', 22600, 'br_chapecoense', { standColor: '#1d5a34', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#0a7a3a', '#ffffff'] } }),
  stadium('br_couto_pereira', 'Estádio Major Antônio Couto Pereira', 40502, 'br_coritiba', { standColor: '#1d5a34', look: { roof: 'none', upper: 'both', seats: ['#0a7a3a', '#ffffff'] } }),
  stadium('br_mangueirao', 'Estádio Evandro Almeida', 13792, 'br_remo', { standColor: '#14245f', timeOfDay: 'day', look: { roof: 'none', upper: 'both', seats: ['#0d2b5e', '#ffffff'] } }),
];

const classics: ClassicDef[] = [
  { a: 'br_athleticopr', b: 'br_coritiba', name: 'Atletiba' },
  { a: 'br_flamengo', b: 'br_fluminense', name: 'Fla-Flu' },
  { a: 'br_flamengo', b: 'br_vasco', name: 'Clássico dos Milhões' },
  { a: 'br_flamengo', b: 'br_botafogo', name: 'Clássico da Rivalidade' },
  { a: 'br_fluminense', b: 'br_botafogo', name: 'Clássico Vovô' },
  { a: 'br_vasco', b: 'br_botafogo', name: 'Clássico da Amizade' },
  { a: 'br_corinthians', b: 'br_saopaulo', name: 'Majestoso' },
  { a: 'br_palmeiras', b: 'br_corinthians', name: 'Dérbi Paulista' },
  { a: 'br_saopaulo', b: 'br_palmeiras', name: 'Choque-Rei' },
  { a: 'br_santos', b: 'br_corinthians', name: 'Clássico Alvinegro' },
  { a: 'br_santos', b: 'br_palmeiras', name: 'Clássico da Saudade' },
  { a: 'br_gremio', b: 'br_internacional', name: 'Gre-Nal' },
  { a: 'br_atleticomg', b: 'br_cruzeiro', name: 'Clássico Mineiro' },
  { a: 'br_bahia', b: 'br_vitoria', name: 'Ba-Vi' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
