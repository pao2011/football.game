import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE } from '../seedUtil';
import type { TeamSeed, RosterEntry } from '../teams';
import type { StadiumData } from '../types';

// Campeonato Brasileiro Série A (Brasileirão). Sin escudos en imagen: todos usan escudo dibujado con los colores del club.
// Plantillas: jugadores que se conocen del plantel 2025-26; los huecos ('') los completa el juego con nombres ficticios.

const p = (name: string, number: number, bonus?: number): RosterEntry => (bonus ? { name, number, bonus } : { name, number });
const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  {
    id: 'br_flamengo', name: 'Flamengo', short: 'FLA', city: 'Rio de Janeiro', crest: crest('br_flamengo', '#d71920', K),
    home: kit('#d71920', K, 'hoops', W, '#d71920', W), away: kit(W, '#d71920', 'band', W, W, '#d71920'), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 86, seed: 2001,
    roster: [
      p('Agustín Rossi', 1, 3), p('Ayrton Lucas', 6, 2), p('Léo Pereira', 4, 3), p('Léo Ortiz', 3, 3), p('Guillermo Varela', 2),
      p('Erick Pulgar', 5, 2), p('Jorge Carrascal', 15, 3), p('Giorgian De Arrascaeta', 10, 5),
      p('Bruno Henrique', 27, 3), p('Pedro', 9, 5), p('Luiz Araújo', 7, 3),
      p('', 12), p('Danilo', 13, 2), p('Alex Sandro', 26), p('Saúl Ñíguez', 8, 2), p('', 21), p('Gonzalo Plata', 20, 2), p('Samuel Lino', 16, 2),
    ],
  },
  {
    id: 'br_palmeiras', name: 'Palmeiras', short: 'PAL', city: 'São Paulo', crest: crest('br_palmeiras', '#006437', W),
    home: kit('#006437', W, 'solid', W, '#006437', W), away: kit(W, '#006437', 'solid', W, W, '#006437'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 86, seed: 2002,
    roster: [
      p('Weverton', 21, 3), p('Joaquín Piquerez', 22, 3), p('Gustavo Gómez', 15, 4), p('Murilo', 26, 2), p('Khellven', 12),
      p('Aníbal Moreno', 5, 3), p('Richard Ríos', 27, 3), p('Raphael Veiga', 23, 3),
      p('Felipe Anderson', 7, 3), p('Vitor Roque', 9, 4), p('', 11),
      p('Carlos Miguel', 1), p('Bruno Fuchs', 3), p('Marcos Rocha', 2), p('Andreas Pereira', 8, 2), p('', 14), p('Paulinho', 10, 2), p('Allan', 20),
    ],
  },
  {
    id: 'br_botafogo', name: 'Botafogo', short: 'BOT', city: 'Rio de Janeiro', crest: crest('br_botafogo', K, W),
    home: kit(K, W, 'stripes', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 80, seed: 2003,
    roster: [
      p('John', 1, 2), p('Alex Telles', 13, 2), p('Alexander Barboza', 4, 2), p('Bastos', 14), p('Vitinho', 22),
      p('Danilo Barbosa', 8), p('Allan', 20), p('Matheus Martins', 7), p('Savarino', 10, 3), p('', 11), p('', 9),
      p('', 12), p('', 3), p('', 2), p('', 5), p('', 30), p('', 19), p('', 17),
    ],
  },
  {
    id: 'br_cruzeiro', name: 'Cruzeiro', short: 'CRU', city: 'Belo Horizonte', crest: crest('br_cruzeiro', '#1b4fa0', W),
    home: kit('#1b4fa0', W, 'solid', W, '#1b4fa0', W), away: kit(W, '#1b4fa0', 'solid', W, W, '#1b4fa0'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 80, seed: 2004,
    roster: [
      p('Cássio', 1, 2), p('', 6), p('Fabrício Bruno', 15, 2), p('Villalba', 4), p('William', 2),
      p('Lucas Romero', 29), p('', 8), p('', 11), p('Matheus Pereira', 10, 4), p('', 7), p('Kaio Jorge', 19, 3),
      p('', 12), p('', 3), p('', 5), p('', 20), p('', 17), p('Gabigol', 9, 3), p('', 21),
    ],
  },
  {
    id: 'br_atleticomg', name: 'Atlético Mineiro', short: 'CAM', city: 'Belo Horizonte', crest: crest('br_atleticomg', K, W),
    home: kit(W, K, 'stripes', K, K, W), away: kit('#f2c230', K, 'solid', K, '#f2c230', K), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 79, seed: 2005,
    roster: [
      p('Everson', 22, 2), p('Guilherme Arana', 13, 3), p('Júnior Alonso', 3, 2), p('Lyanco', 4), p('Natanael', 2),
      p('Alan Franco', 28), p('', 8), p('', 11), p('Gustavo Scarpa', 14, 3), p('', 20), p('Hulk', 7, 5),
      p('', 1), p('', 5), p('', 6), p('', 16), p('', 10), p('', 9), p('', 19),
    ],
  },
  {
    id: 'br_corinthians', name: 'Corinthians', short: 'COR', city: 'São Paulo', crest: crest('br_corinthians', K, W),
    home: kit(W, K, 'solid', K, W, K), away: kit(K, W, 'solid', K, K, W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 79, seed: 2006,
    roster: [
      p('Hugo Souza', 1, 2), p('Matheus Bidu', 21), p('Gustavo Henrique', 13), p('André Ramalho', 5), p('Matheuzinho', 2),
      p('Raniele', 8), p('Breno Bidon', 14), p('', 7), p('Rodrigo Garro', 10, 3), p('Memphis Depay', 11, 5), p('Yuri Alberto', 9, 4),
      p('', 12), p('Félix Torres', 3), p('', 4), p('', 20), p('', 17), p('', 19), p('', 16),
    ],
  },
  {
    id: 'br_fluminense', name: 'Fluminense', short: 'FLU', city: 'Rio de Janeiro', crest: crest('br_fluminense', '#7a1f3d', '#00704a'),
    home: kit('#7a1f3d', '#00704a', 'stripes', W, W, W), away: kit(W, '#7a1f3d', 'band', W, W, '#00704a'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 79, seed: 2007,
    roster: [
      p('Fábio', 1, 3), p('Renê', 6), p('Thiago Silva', 3, 4), p('Manoel', 4), p('Samuel Xavier', 2),
      p('Martinelli', 8, 2), p('', 5), p('Jhon Arias', 21, 4), p('', 10), p('', 7), p('Germán Cano', 14, 4),
      p('', 12), p('Freytes', 15), p('', 13), p('', 17), p('', 20), p('', 9), p('', 11),
    ],
  },
  {
    id: 'br_saopaulo', name: 'São Paulo', short: 'SAO', city: 'São Paulo', crest: crest('br_saopaulo', '#d71920', K),
    home: kit(W, '#d71920', 'band', W, W, K), away: kit('#d71920', K, 'solid', '#d71920', '#d71920', W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 78, seed: 2008,
    roster: [
      p('Rafael', 23, 2), p('Wendell', 6), p('Arboleda', 5, 2), p('Sabino', 4), p('Rafinha', 13),
      p('Alisson', 26), p('', 8), p('Lucas Moura', 7, 3), p('Luciano', 10, 3), p('', 11), p('Calleri', 9, 4),
      p('', 1), p('', 3), p('', 2), p('', 29), p('', 20), p('', 19), p('', 17),
    ],
  },
  {
    id: 'br_internacional', name: 'Internacional', short: 'INT', city: 'Porto Alegre', crest: crest('br_internacional', '#d71920', W),
    home: kit('#d71920', W, 'solid', W, '#d71920', W), away: kit(W, '#d71920', 'solid', W, W, '#d71920'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 78, seed: 2009,
    roster: [
      p('Sergio Rochet', 1, 2), p('Bernabei', 21), p('Vitão', 4), p('', 3), p('', 2),
      p('', 5), p('', 8), p('', 11), p('Alan Patrick', 10, 4), p('', 7), p('Rafael Borré', 19, 3),
      p('', 12), p('', 6), p('', 14), p('', 20), p('', 17), p('', 9), p('', 18),
    ],
  },
  {
    id: 'br_bahia', name: 'Bahia', short: 'BAH', city: 'Salvador', crest: crest('br_bahia', '#0a4ea3', '#d71920'),
    home: kit('#0a4ea3', '#d71920', 'stripes', W, '#0a4ea3', W), away: kit(W, '#0a4ea3', 'band', W, W, '#d71920'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 78, seed: 2010,
    roster: [
      p('Ronaldo', 1), p('Luciano Juba', 22, 2), p('', 4), p('', 3), p('Gilberto', 2),
      p('Jean Lucas', 8), p('', 5), p('', 11), p('Éverton Ribeiro', 7, 3), p('', 10), p('', 9),
      p('', 12), p('', 6), p('', 13), p('', 20), p('', 17), p('', 19), p('', 16),
    ],
  },
  {
    id: 'br_fortaleza', name: 'Fortaleza', short: 'FOR', city: 'Fortaleza', crest: crest('br_fortaleza', '#1a4fa0', '#d71920'),
    home: kit('#1a4fa0', '#d71920', 'stripes', W, '#1a4fa0', W), away: kit(W, '#1a4fa0', 'band', W, W, '#d71920'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 77, seed: 2011,
    roster: [
      p('João Ricardo', 1), p('', 6), p('Brítez', 4), p('', 3), p('', 2),
      p('', 5), p('', 8), p('', 11), p('Pochettino', 10, 2), p('', 7), p('Lucero', 9, 2),
      p('', 12), p('', 13), p('', 14), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
  {
    id: 'br_gremio', name: 'Grêmio', short: 'GRE', city: 'Porto Alegre', crest: crest('br_gremio', '#00a3e0', K),
    home: kit('#00a3e0', K, 'stripes', K, K, W), away: kit(K, '#00a3e0', 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 77, seed: 2012,
    roster: [
      p('Tiago Volpi', 1, 2), p('', 6), p('Gustavo Martins', 4), p('Viery', 3), p('', 2),
      p('Villasanti', 25, 2), p('', 8), p('', 11), p('Cristaldo', 10, 2), p('', 7), p('Braithwaite', 9, 3),
      p('', 12), p('', 5), p('', 13), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
  {
    id: 'br_vasco', name: 'Vasco da Gama', short: 'VAS', city: 'Rio de Janeiro', crest: crest('br_vasco', K, W),
    home: kit(K, W, 'sash', K, K, W), away: kit(W, K, 'sash', W, W, K), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 77, seed: 2013,
    roster: [
      p('Léo Jardim', 1, 2), p('Lucas Piton', 6), p('', 4), p('', 3), p('Paulo Henrique', 2),
      p('Hugo Moura', 8), p('', 5), p('', 11), p('Philippe Coutinho', 10, 4), p('Nuno Moreira', 7), p('Vegetti', 99, 3),
      p('', 12), p('', 14), p('', 13), p('', 20), p('', 17), p('', 9), p('', 18),
    ],
  },
  {
    id: 'br_santos', name: 'Santos', short: 'SAN', city: 'Santos', crest: crest('br_santos', W, K),
    home: kit(W, K, 'solid', W, W, K), away: kit(K, W, 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 76, seed: 2014,
    roster: [
      p('Gabriel Brazão', 77, 2), p('', 6), p('Gil', 4), p('Luan Peres', 3), p('', 2),
      p('', 5), p('', 8), p('', 11), p('Neymar', 10, 6), p('Rollheiser', 7), p('', 9),
      p('', 1), p('', 13), p('', 14), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
  {
    id: 'br_bragantino', name: 'Red Bull Bragantino', short: 'RBB', city: 'Bragança Paulista', crest: crest('br_bragantino', W, '#d71920'),
    home: kit(W, '#d71920', 'solid', W, W, '#d71920'), away: kit('#d71920', W, 'solid', '#d71920', '#d71920', W), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 76, seed: 2015,
    roster: [
      p('Cleiton', 1), p('', 6), p('Gustavo Marques', 4), p('', 3), p('', 2),
      p('', 5), p('Lucas Evangelista', 8), p('', 11), p('Jhon Jhon', 10, 2), p('', 7), p('Isidro Pitta', 9, 2),
      p('', 12), p('', 13), p('', 14), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
  {
    id: 'br_vitoria', name: 'Vitória', short: 'VIT', city: 'Salvador', crest: crest('br_vitoria', '#d71920', K),
    home: kit('#d71920', K, 'stripes', K, K, W), away: kit(W, '#d71920', 'band', W, W, K), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 74, seed: 2016,
    roster: [
      p('Lucas Arcanjo', 1, 2), p('', 6), p('', 4), p('', 3), p('', 2),
      p('', 5), p('', 8), p('', 11), p('', 10), p('', 7), p('Renato Kayzer', 9, 2),
      p('', 12), p('', 13), p('', 14), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
  {
    id: 'br_ceara', name: 'Ceará', short: 'CEA', city: 'Fortaleza', crest: crest('br_ceara', K, W),
    home: kit(K, W, 'stripes', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 74, seed: 2017,
    roster: [
      p('', 1), p('', 6), p('', 4), p('', 3), p('', 2),
      p('', 5), p('', 8), p('', 11), p('', 10), p('', 7), p('', 9),
      p('', 12), p('', 13), p('', 14), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
  {
    id: 'br_mirassol', name: 'Mirassol', short: 'MIR', city: 'Mirassol', crest: crest('br_mirassol', '#f7d417', '#0a7a3a'),
    home: kit('#f7d417', '#0a7a3a', 'solid', '#0a7a3a', '#f7d417', '#0a7a3a'), away: kit('#0a7a3a', '#f7d417', 'solid', '#0a7a3a', '#0a7a3a', '#f7d417'), gkKit: GK_PURPLE,
    formation: '4-2-3-1', rating: 74, seed: 2018,
    roster: [
      p('Walter', 1, 2), p('', 6), p('', 4), p('', 3), p('', 2),
      p('', 5), p('Neto Moura', 8), p('', 11), p('', 10), p('Negueba', 7), p('', 9),
      p('', 12), p('', 13), p('', 14), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
  {
    id: 'br_sport', name: 'Sport Recife', short: 'SPO', city: 'Recife', crest: crest('br_sport', '#d71920', K),
    home: kit('#d71920', K, 'hoops', K, K, W), away: kit(W, '#d71920', 'band', W, W, K), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 72, seed: 2019,
    roster: [
      p('', 1), p('', 6), p('', 4), p('', 3), p('', 2),
      p('', 5), p('', 8), p('', 11), p('', 10), p('', 7), p('', 9),
      p('', 12), p('', 13), p('', 14), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
  {
    id: 'br_juventude', name: 'Juventude', short: 'JUV', city: 'Caxias do Sul', crest: crest('br_juventude', '#0a7a3a', W),
    home: kit('#0a7a3a', W, 'stripes', W, '#0a7a3a', W), away: kit(W, '#0a7a3a', 'solid', W, W, '#0a7a3a'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 72, seed: 2020,
    roster: [
      p('', 1), p('', 6), p('', 4), p('', 3), p('', 2),
      p('', 5), p('', 8), p('', 11), p('', 10), p('', 7), p('', 9),
      p('', 12), p('', 13), p('', 14), p('', 20), p('', 17), p('', 19), p('', 18),
    ],
  },
];

const stadiums: StadiumData[] = [
  stadium('br_maracana', 'Maracanã', 78838, 'br_flamengo', { standColor: '#7a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#d71920', K, W] } }),
  stadium('br_allianz', 'Allianz Parque', 43713, 'br_palmeiras', { standColor: '#14452c', look: { roof: 'ring', upper: 'both', seats: ['#006437', W] } }),
  stadium('br_nilton_santos', 'Nilton Santos', 44661, 'br_botafogo', { standColor: '#1c1c1c', look: { roof: 'ring', upper: 'both', track: '#9a4a3a', seats: [K, W] } }),
  stadium('br_mineirao', 'Mineirão', 61846, 'br_cruzeiro', { standColor: '#1a3a7a', look: { roof: 'ring', upper: 'both', seats: ['#1b4fa0', W] } }),
  stadium('br_arena_mrv', 'Arena MRV', 44892, 'br_atleticomg', { standColor: '#222222', look: { roof: 'ring', upper: 'both', seats: [K, W] } }),
  stadium('br_neo_quimica', 'Neo Química Arena', 49205, 'br_corinthians', { standColor: '#222222', look: { roof: 'ring', upper: 'both', seats: [K, W] } }),
  stadium('br_maracana_flu', 'Maracanã', 78838, 'br_fluminense', { standColor: '#5a1a2e', look: { roof: 'ring', upper: 'both', seats: ['#7a1f3d', '#00704a', W] } }),
  stadium('br_morumbi', 'Morumbi', 66795, 'br_saopaulo', { standColor: '#4a2a2a', look: { roof: 'sides', upper: 'both', seats: ['#d71920', W, K] } }),
  stadium('br_beira_rio', 'Beira-Rio', 50128, 'br_internacional', { standColor: '#8a1a24', look: { roof: 'ring', upper: 'both', seats: ['#d71920', W] } }),
  stadium('br_fonte_nova', 'Arena Fonte Nova', 47907, 'br_bahia', { standColor: '#1a3a7a', look: { roof: 'ring', upper: 'both', seats: ['#0a4ea3', '#d71920', W] } }),
  stadium('br_castelao', 'Arena Castelão', 63903, 'br_fortaleza', { standColor: '#1a3a7a', look: { roof: 'ring', upper: 'both', seats: ['#1a4fa0', '#d71920'] } }),
  stadium('br_arena_gremio', 'Arena do Grêmio', 55225, 'br_gremio', { standColor: '#1a5a7a', look: { roof: 'ring', upper: 'both', seats: ['#00a3e0', K, W] } }),
  stadium('br_sao_januario', 'São Januário', 21880, 'br_vasco', { standColor: '#222222', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: [K, W] } }),
  stadium('br_vila_belmiro', 'Vila Belmiro', 16068, 'br_santos', { standColor: '#2a2a2a', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: [W, K] } }),
  stadium('br_nabi_abi_chedid', 'Nabi Abi Chedid', 17128, 'br_bragantino', { standColor: '#8a1a24', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: [W, '#d71920'] } }),
  stadium('br_barradao', 'Manoel Barradas (Barradão)', 35632, 'br_vitoria', { standColor: '#5a1a1a', look: { roof: 'none', upper: 'far', seats: ['#d71920', K] } }),
  stadium('br_presidente_vargas', 'Presidente Vargas (Vovozão)', 20268, 'br_ceara', { standColor: '#222222', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: [K, W] } }),
  stadium('br_maiao', 'José Maria de Campos Maia (Maião)', 15000, 'br_mirassol', { standColor: '#1d5a34', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#f7d417', '#0a7a3a'] } }),
  stadium('br_ilha_retiro', 'Ilha do Retiro', 26418, 'br_sport', { standColor: '#5a1a1a', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#d71920', K] } }),
  stadium('br_alfredo_jaconi', 'Alfredo Jaconi', 19924, 'br_juventude', { standColor: '#1d5a34', timeOfDay: 'day', look: { roof: 'none', upper: 'none', seats: ['#0a7a3a', W] } }),
];

const classics: ClassicDef[] = [
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
  { a: 'br_ceara', b: 'br_fortaleza', name: 'Clássico-Rei' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
