import { LEAGUE_IDS } from './classics';
import { EXTRA_LEAGUES } from './leagues/index';

/** Cómo se juega una liga en el modo carrera. */
export interface LeagueFormat {
  /** Una tabla única o dos zonas (en dos zonas los equipos de igual posición juegan el interzonal en la fecha libre). */
  zones: 1 | 2;
  /** Una rueda o ida y vuelta dentro de la zona. */
  rr: 'single' | 'double';
  /** Torneos de la temporada, en orden (Apertura y Clausura, o uno solo). */
  torneos: string[];
  /** Clasificados a los playoffs por zona (0 = el campeón es el primero de la tabla). */
  playoffs: number;
  /** La final de los playoffs se juega en cancha neutral. */
  neutralFinal: boolean;
  /** Tabla anual: suma las fases regulares de todos los torneos de la temporada. */
  annual: boolean;
}

export interface LeagueDef {
  id: string;
  name: string;
  country: string;
  /** Logo de la competencia (opcional). */
  logo?: string;
  format: LeagueFormat;
  /** Ids de sus equipos. */
  teamIds(): string[];
}

const LOGO_FILES = import.meta.glob('../assets/leagues/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
/** Logo de una liga o copa (id de LEAGUES o de CUPS) si hay imagen en src/assets/leagues/<id>.webp. */
export function leagueLogo(id: string): string | undefined {
  return LOGO_FILES[`../assets/leagues/${id}.webp`];
}

const ids = (k: string) => (EXTRA_LEAGUES[k]?.teams ?? []).map((t) => t.id);

export const LEAGUES: LeagueDef[] = [
  { id: 'lpf', name: 'Liga Profesional', country: 'Argentina', teamIds: () => LEAGUE_IDS,
    format: { zones: 2, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Clausura'], playoffs: 8, neutralFinal: true, annual: true } },
  { id: 'primeranacional', name: 'Primera Nacional', country: 'Argentina', teamIds: () => ids('primeranacional'),
    format: { zones: 2, rr: 'single', torneos: ['Primera Nacional'], playoffs: 8, neutralFinal: true, annual: false } },
  { id: 'brasil', name: 'Brasileirão Série A', country: 'Brasil', teamIds: () => ids('brasil'),
    format: { zones: 1, rr: 'double', torneos: ['Brasileirão'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'colombia', name: 'Liga BetPlay Dimayor', country: 'Colombia', teamIds: () => ids('colombia'),
    format: { zones: 1, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Finalización'], playoffs: 8, neutralFinal: false, annual: true } },
  { id: 'peru', name: 'Liga 1 de Perú', country: 'Perú', teamIds: () => ids('peru'),
    format: { zones: 1, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Clausura'], playoffs: 0, neutralFinal: false, annual: true } },
  { id: 'chile', name: 'Primera División de Chile', country: 'Chile', teamIds: () => ids('chile'),
    format: { zones: 1, rr: 'double', torneos: ['Campeonato Nacional'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'paraguay', name: 'Primera División de Paraguay', country: 'Paraguay', teamIds: () => ids('paraguay'),
    format: { zones: 1, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Clausura'], playoffs: 0, neutralFinal: false, annual: true } },
  { id: 'uruguay', name: 'Liga AUF Uruguaya', country: 'Uruguay', teamIds: () => ids('uruguay'),
    format: { zones: 1, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Clausura'], playoffs: 0, neutralFinal: false, annual: true } },
  { id: 'ecuador', name: 'LigaPro Ecuador', country: 'Ecuador', teamIds: () => ids('ecuador'),
    format: { zones: 1, rr: 'single', torneos: ['Primera Etapa', 'Segunda Etapa'], playoffs: 0, neutralFinal: false, annual: true } },
  { id: 'bolivia', name: 'División Profesional de Bolivia', country: 'Bolivia', teamIds: () => ids('bolivia'),
    format: { zones: 1, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Clausura'], playoffs: 0, neutralFinal: false, annual: true } },
  { id: 'venezuela', name: 'Liga FUTVE de Venezuela', country: 'Venezuela', teamIds: () => ids('venezuela'),
    format: { zones: 1, rr: 'double', torneos: ['Liga FUTVE'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'eng', name: 'Premier League', country: 'Inglaterra', teamIds: () => ids('eng'),
    format: { zones: 1, rr: 'double', torneos: ['Premier League'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'esp', name: 'LaLiga', country: 'España', teamIds: () => ids('esp'),
    format: { zones: 1, rr: 'double', torneos: ['LaLiga'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'ita', name: 'Serie A', country: 'Italia', teamIds: () => ids('ita'),
    format: { zones: 1, rr: 'double', torneos: ['Serie A'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'ger', name: 'Bundesliga', country: 'Alemania', teamIds: () => ids('ger'),
    format: { zones: 1, rr: 'double', torneos: ['Bundesliga'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'fra', name: 'Ligue 1', country: 'Francia', teamIds: () => ids('fra'),
    format: { zones: 1, rr: 'double', torneos: ['Ligue 1'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'por', name: 'Liga Portugal', country: 'Portugal', teamIds: () => ids('por'),
    format: { zones: 1, rr: 'double', torneos: ['Liga Portugal'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'ned', name: 'Eredivisie', country: 'Países Bajos', teamIds: () => ids('ned'),
    format: { zones: 1, rr: 'double', torneos: ['Eredivisie'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'bel', name: 'Jupiler Pro League', country: 'Bélgica', teamIds: () => ids('bel'),
    format: { zones: 1, rr: 'double', torneos: ['Jupiler Pro League'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'tur', name: 'Süper Lig', country: 'Turquía', teamIds: () => ids('tur'),
    format: { zones: 1, rr: 'double', torneos: ['Süper Lig'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'sco', name: 'Scottish Premiership', country: 'Escocia', teamIds: () => ids('sco'),
    format: { zones: 1, rr: 'double', torneos: ['Scottish Premiership'], playoffs: 0, neutralFinal: false, annual: false } },
];

for (const l of LEAGUES) l.logo ??= leagueLogo(l.id);

export function getLeague(id: string | undefined): LeagueDef {
  return LEAGUES.find((l) => l.id === id) ?? LEAGUES[0];
}

/** Liga a la que pertenece un equipo (la primera que lo tiene). */
export function leagueOfTeam(teamId: string): LeagueDef | null {
  return LEAGUES.find((l) => l.teamIds().includes(teamId)) ?? null;
}
