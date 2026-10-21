// Equipos creados por el usuario (editor de equipos): se guardan en el navegador, se añaden a la lista de equipos
// y se pueden exportar e importar como archivo JSON.
import { loadJSON, saveJSON } from '../save/Storage';
import { buildTeam, playerOverall, TEAMS, type TeamSeed } from './teams';
import type { FormationId, KitData, PlayerData, TeamData } from './types';

const KEY = 'customTeams';
export const CUSTOM_PREFIX = 'custom-';

export function isCustom(t: { id: string }) {
  return t.id.startsWith(CUSTOM_PREFIX);
}

export function loadCustomTeams(): TeamData[] {
  const list = loadJSON<TeamData[]>(KEY, []);
  return Array.isArray(list) ? list.filter(validTeam) : [];
}

function saveCustomTeams(list: TeamData[]) {
  saveJSON(KEY, list);
}

/** Añade (o actualiza) los equipos propios en la lista global de equipos. */
export function registerCustomTeams() {
  for (let i = TEAMS.length - 1; i >= 0; i--) if (isCustom(TEAMS[i])) TEAMS.splice(i, 1);
  TEAMS.push(...loadCustomTeams());
}

/** Equipo nuevo con plantilla generada a partir de un nivel (los nombres se pueden cambiar después). */
export function newCustomTeam(name = 'Mi Equipo', rating = 78, formation: FormationId = '4-3-3'): TeamData {
  const id = `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const seed: TeamSeed = {
    id, name, short: shortOf(name), city: 'Mi ciudad',
    crest: { shape: 'shield', primary: '#1c7fd6', secondary: '#ffffff', symbol: 'star' },
    home: { shirt: '#1c7fd6', shirt2: '#ffffff', pattern: 'solid', shorts: '#ffffff', socks: '#1c7fd6', number: '#ffffff' },
    away: { shirt: '#ffffff', shirt2: '#1c7fd6', pattern: 'solid', shorts: '#1c7fd6', socks: '#ffffff', number: '#1c7fd6' },
    gkKit: { shirt: '#ffd400', shirt2: '#c8a40f', pattern: 'solid', shorts: '#222222', socks: '#ffd400', number: '#222222' },
    formation, rating, seed: Math.floor(Math.random() * 1e6),
  };
  return buildTeam(seed);
}

export function shortOf(name: string) {
  const letters = name.normalize('NFD').replace(/[^A-Za-z ]/g, '').trim();
  const words = letters.split(/\s+/).filter((w) => w.length > 2);
  const s = (words.length >= 3 ? words.map((w) => w[0]).join('') : (words[0] ?? letters)).slice(0, 3);
  return (s || 'EQU').toUpperCase().padEnd(3, 'X');
}

/** Cambia el nivel del equipo: escala los atributos de todos los jugadores manteniendo sus diferencias. */
export function setTeamLevel(t: TeamData, level: number) {
  const cur = teamLevel(t);
  const d = level - cur;
  for (const p of t.players) {
    const a = p.attrs;
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] = Math.max(25, Math.min(99, Math.round(a[k] + d)));
  }
  t.rating = Math.round(level);
}

export function teamLevel(t: TeamData) {
  const ovr = t.players.slice(0, 11).map(playerOverall);
  return Math.round(ovr.reduce((s, v) => s + v, 0) / Math.max(1, ovr.length));
}

export function saveCustomTeam(t: TeamData) {
  const list = loadCustomTeams().filter((x) => x.id !== t.id);
  t.rating = teamLevel(t);
  list.push(t);
  saveCustomTeams(list);
  registerCustomTeams();
}

export function deleteCustomTeam(id: string) {
  saveCustomTeams(loadCustomTeams().filter((x) => x.id !== id));
  registerCustomTeams();
}

export function exportTeam(t: TeamData): string {
  return JSON.stringify({ format: 'football-elite-3d-team', version: 1, team: t }, null, 1);
}

/** Importa un equipo desde el JSON exportado; le da un id nuevo para no pisar otro. Lanza un error si no es válido. */
export function importTeam(json: string): TeamData {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }
  const t = (data as { team?: TeamData })?.team ?? (data as TeamData);
  if (!validTeam(t)) throw new Error('El archivo no contiene un equipo de Soffti\'s Football Game');
  const copy: TeamData = structuredClone(t);
  copy.id = `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  copy.players = copy.players.map((p, i) => ({ ...p, id: `${copy.id}-${i}` }));
  saveCustomTeam(copy);
  return copy;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function validKit(k: KitData | undefined) {
  return !!k && HEX.test(k.shirt) && HEX.test(k.shirt2) && HEX.test(k.shorts) && HEX.test(k.socks) && HEX.test(k.number) && ['solid', 'gradient', 'stripes', 'hoops', 'sash', 'band', 'halves', 'vee'].includes(k.pattern);
}
function validPlayer(p: PlayerData) {
  return !!p && typeof p.name === 'string' && ['GK', 'DEF', 'MID', 'FWD'].includes(p.position) && !!p.attrs && typeof p.attrs.speed === 'number';
}
function validTeam(t: TeamData | undefined): t is TeamData {
  return !!t && typeof t.name === 'string' && typeof t.id === 'string' && validKit(t.home) && validKit(t.away) && validKit(t.gkKit)
    && ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '4-1-2-1-2'].includes(t.formation) && Array.isArray(t.players) && t.players.length >= 11 && t.players.every(validPlayer)
    && t.players.slice(0, 11).filter((p) => p.position === 'GK').length >= 1;
}
