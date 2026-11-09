import type { LeagueData, ClassicDef } from '../seedUtil';
import { kit, crest, stadium, GK_YELLOW, GK_ORANGE, GK_GREEN, GK_PURPLE, GK_BLACK } from '../seedUtil';
import type { TeamSeed } from '../teams';
import type { StadiumData } from '../types';

// Liga Portugal 2026/27 (18 equipos). Escudos en src/assets/crests/pt_*.webp. Las plantillas vienen de Transfermarkt (tmRosters.ts).

const W = '#ffffff';
const K = '#111111';

const teams: TeamSeed[] = [
  {
    id: 'pt_porto', name: 'FC Porto', short: 'POR', city: 'Porto', crest: crest('pt_porto', '#0a3a8c', W),
    home: kit(W, '#0a3a8c', 'stripes', W, W, '#0a3a8c'), away: kit('#0a3a8c', '#7fb2e5', 'solid', '#0a3a8c', '#0a3a8c', W), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 78, seed: 16000,
  },
  {
    id: 'pt_benfica', name: 'SL Benfica', short: 'BEN', city: 'Lisboa', crest: crest('pt_benfica', '#e30613', W),
    home: kit('#e30613', W, 'solid', W, '#e30613', W), away: kit(W, '#e30613', 'solid', W, W, '#e30613'), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 78, seed: 16001,
  },
  {
    id: 'pt_sporting', name: 'Sporting CP', short: 'SCP', city: 'Lisboa', crest: crest('pt_sporting', '#00873e', W),
    home: kit('#00873e', W, 'hoops', K, '#00873e', W), away: kit(W, '#00873e', 'solid', W, W, '#00873e'), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 78, seed: 16002,
  },
  {
    id: 'pt_braga', name: 'SC Braga', short: 'BRA', city: 'Braga', crest: crest('pt_braga', '#d71920', W),
    home: kit('#d71920', W, 'solid', W, '#d71920', W), away: kit(W, '#d71920', 'solid', W, W, '#d71920'), gkKit: GK_YELLOW,
    formation: '4-2-3-1', rating: 74, seed: 16003,
  },
  {
    id: 'pt_famalicao', name: 'FC Famalicão', short: 'FAM', city: 'Vila Nova de Famalicão', crest: crest('pt_famalicao', '#1b4fa0', W),
    home: kit(W, '#1b4fa0', 'stripes', '#1b4fa0', W, '#1b4fa0'), away: kit('#1b4fa0', W, 'solid', '#1b4fa0', '#1b4fa0', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 70, seed: 16004,
  },
  {
    id: 'pt_vitoria', name: 'Vitória SC', short: 'VSC', city: 'Guimarães', crest: crest('pt_vitoria', W, K),
    home: kit(W, K, 'solid', W, W, K), away: kit(K, W, 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 72, seed: 16005,
  },
  {
    id: 'pt_alverca', name: 'FC Alverca', short: 'ALV', city: 'Alverca do Ribatejo', crest: crest('pt_alverca', '#d71920', '#f2c230'),
    home: kit('#d71920', '#f2c230', 'solid', '#d71920', '#d71920', W), away: kit(W, '#d71920', 'solid', W, W, '#d71920'), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 66, seed: 16006,
  },
  {
    id: 'pt_estrela', name: 'CF Estrela da Amadora', short: 'EST', city: 'Amadora', crest: crest('pt_estrela', '#d71920', '#00873e'),
    home: kit('#d71920', '#00873e', 'solid', '#00873e', '#d71920', W), away: kit(W, '#d71920', 'solid', W, W, '#d71920'), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 66, seed: 16007,
  },
  {
    id: 'pt_estoril', name: 'GD Estoril Praia', short: 'ESP', city: 'Estoril', crest: crest('pt_estoril', '#f2c230', '#1b4fa0'),
    home: kit('#f2c230', '#1b4fa0', 'solid', '#1b4fa0', '#f2c230', '#1b4fa0'), away: kit('#1b4fa0', '#f2c230', 'solid', '#1b4fa0', '#1b4fa0', W), gkKit: GK_GREEN,
    formation: '4-3-3', rating: 68, seed: 16008,
  },
  {
    id: 'pt_rioave', name: 'Rio Ave FC', short: 'RIO', city: 'Vila do Conde', crest: crest('pt_rioave', W, '#00873e'),
    home: kit(W, '#00873e', 'solid', W, W, '#00873e'), away: kit('#00873e', W, 'solid', '#00873e', '#00873e', W), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 66, seed: 16009,
  },
  {
    id: 'pt_arouca', name: 'FC Arouca', short: 'ARO', city: 'Arouca', crest: crest('pt_arouca', '#f2c230', '#1b4fa0'),
    home: kit('#f2c230', '#1b4fa0', 'solid', '#1b4fa0', '#f2c230', '#1b4fa0'), away: kit('#1b4fa0', '#f2c230', 'solid', '#1b4fa0', '#1b4fa0', W), gkKit: GK_GREEN,
    formation: '4-4-2', rating: 65, seed: 16010,
  },
  {
    id: 'pt_casapia', name: 'Casa Pia AC', short: 'CPI', city: 'Lisboa', crest: crest('pt_casapia', K, W),
    home: kit(K, W, 'solid', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 66, seed: 16011,
  },
  {
    id: 'pt_moreirense', name: 'Moreirense FC', short: 'MOR', city: 'Moreira de Cónegos', crest: crest('pt_moreirense', '#00873e', W),
    home: kit('#00873e', W, 'solid', W, '#00873e', W), away: kit(W, '#00873e', 'solid', W, W, '#00873e'), gkKit: GK_ORANGE,
    formation: '4-2-3-1', rating: 66, seed: 16012,
  },
  {
    id: 'pt_gilvicente', name: 'Gil Vicente FC', short: 'GIL', city: 'Barcelos', crest: crest('pt_gilvicente', '#d71920', '#1b4fa0'),
    home: kit('#d71920', '#1b4fa0', 'stripes', '#1b4fa0', '#d71920', W), away: kit(W, '#d71920', 'solid', W, W, '#d71920'), gkKit: GK_YELLOW,
    formation: '4-3-3', rating: 69, seed: 16013,
  },
  {
    id: 'pt_santaclara', name: 'CD Santa Clara', short: 'SCL', city: 'Ponta Delgada', crest: crest('pt_santaclara', '#d71920', W),
    home: kit('#d71920', W, 'solid', W, '#d71920', W), away: kit(W, '#d71920', 'solid', W, W, '#d71920'), gkKit: GK_GREEN,
    formation: '4-2-3-1', rating: 66, seed: 16014,
  },
  {
    id: 'pt_nacional', name: 'CD Nacional', short: 'NAC', city: 'Funchal', crest: crest('pt_nacional', K, W),
    home: kit(W, K, 'stripes', K, K, W), away: kit(K, W, 'solid', K, K, W), gkKit: GK_ORANGE,
    formation: '4-3-3', rating: 66, seed: 16015,
  },
  {
    id: 'pt_academico', name: 'Académico de Viseu', short: 'ACV', city: 'Viseu', crest: crest('pt_academico', K, W),
    home: kit(K, W, 'solid', K, K, W), away: kit(W, K, 'solid', W, W, K), gkKit: GK_YELLOW,
    formation: '4-4-2', rating: 62, seed: 16016,
  },
  {
    id: 'pt_maritimo', name: 'CS Marítimo', short: 'MAR', city: 'Funchal', crest: crest('pt_maritimo', '#d71920', '#00873e'),
    home: kit('#d71920', '#00873e', 'solid', '#00873e', '#d71920', W), away: kit(W, '#00873e', 'solid', W, W, '#d71920'), gkKit: GK_PURPLE,
    formation: '4-2-3-1', rating: 64, seed: 16017,
  },
];

const stadiums: StadiumData[] = [
  stadium('pt_est_dragao', 'Estádio do Dragão', 50033, 'pt_porto', { standColor: '#0a2a66', look: { roof: 'ring', upper: 'both', seats: ['#0a3a8c', W] } }),
  stadium('pt_est_luz', 'Estádio da Luz', 68100, 'pt_benfica', { standColor: '#7a1a1a', look: { roof: 'ring', upper: 'both', seats: ['#e30613', W] } }),
  stadium('pt_est_alvalade', 'Estádio José Alvalade', 52095, 'pt_sporting', { standColor: '#14452c', look: { roof: 'ring', upper: 'both', seats: ['#00873e', W] } }),
  stadium('pt_est_braga', 'Estádio Municipal de Braga', 30286, 'pt_braga', { standColor: '#4a4a4a', look: { roof: 'sides', upper: 'both', seats: ['#d71920', W] } }),
  stadium('pt_est_famalicao', 'Estádio Municipal de Famalicão', 5186, 'pt_famalicao', { look: { roof: 'none', upper: 'none', seats: ['#1b4fa0', W] } }),
  stadium('pt_est_guimaraes', 'Estádio D. Afonso Henriques', 30029, 'pt_vitoria', { standColor: '#3a3a3a', look: { roof: 'ring', upper: 'both', seats: [W, K] } }),
  stadium('pt_est_alverca', 'Complexo Desportivo FC Alverca', 6932, 'pt_alverca', { look: { roof: 'none', upper: 'none', seats: ['#d71920', '#f2c230'] } }),
  stadium('pt_est_amadora', 'Estádio José Gomes', 9288, 'pt_estrela', { look: { roof: 'none', upper: 'none', seats: ['#d71920', '#00873e'] } }),
  stadium('pt_est_estoril', 'Estádio António Coimbra da Mota', 5094, 'pt_estoril', { look: { roof: 'none', upper: 'none', seats: ['#f2c230', '#1b4fa0'] } }),
  stadium('pt_est_rioave', 'Estádio do Rio Ave FC', 5300, 'pt_rioave', { look: { roof: 'none', upper: 'none', seats: ['#00873e', W] } }),
  stadium('pt_est_arouca', 'Estádio Municipal de Arouca', 5000, 'pt_arouca', { look: { roof: 'none', upper: 'none', seats: ['#f2c230', '#1b4fa0'] } }),
  stadium('pt_est_riomaior', 'Estádio Municipal de Rio Maior', 7000, 'pt_casapia', { look: { roof: 'none', upper: 'none', seats: [K, W] } }),
  stadium('pt_est_moreirense', 'Estádio C. J. de Almeida Freitas', 6150, 'pt_moreirense', { look: { roof: 'none', upper: 'none', seats: ['#00873e', W] } }),
  stadium('pt_est_barcelos', 'Estádio Cidade de Barcelos', 12046, 'pt_gilvicente', { standColor: '#3a3f4a', look: { roof: 'sides', upper: 'both', seats: ['#d71920', '#1b4fa0'] } }),
  stadium('pt_est_saomiguel', 'Estádio de São Miguel', 12500, 'pt_santaclara', { standColor: '#3a3f4a', look: { roof: 'sides', upper: 'none', seats: ['#d71920', W] } }),
  stadium('pt_est_madeira', 'Estádio da Madeira', 5200, 'pt_nacional', { look: { roof: 'none', upper: 'none', seats: [K, W] } }),
  stadium('pt_est_fontelo', 'Estádio Municipal do Fontelo', 6912, 'pt_academico', { look: { roof: 'none', upper: 'none', seats: [K, W] } }),
  stadium('pt_est_maritimo', 'Estádio do Marítimo', 10600, 'pt_maritimo', { standColor: '#3a3f4a', look: { roof: 'sides', upper: 'none', seats: ['#d71920', '#00873e'] } }),
];

const classics: ClassicDef[] = [
  { a: 'pt_porto', b: 'pt_benfica', name: 'O Clássico' },
  { a: 'pt_sporting', b: 'pt_benfica', name: 'Dérbi de Lisboa' },
  { a: 'pt_porto', b: 'pt_sporting', name: 'Clássico Porto–Sporting' },
  { a: 'pt_braga', b: 'pt_vitoria', name: 'Dérbi de Braga' },
  { a: 'pt_braga', b: 'pt_porto', name: 'Braga–Porto' },
  { a: 'pt_braga', b: 'pt_gilvicente', name: 'Braga–Gil Vicente' },
  { a: 'pt_nacional', b: 'pt_maritimo', name: 'Dérbi da Madeira' },
  { a: 'pt_benfica', b: 'pt_estrela', name: 'Dérbi da Grande Lisboa' },
  { a: 'pt_famalicao', b: 'pt_braga', name: 'Dérbi do Ave–Minho' },
  { a: 'pt_rioave', b: 'pt_famalicao', name: 'Dérbi do Ave' },
];

export const DATA: LeagueData = { teams, stadiums, classics };
