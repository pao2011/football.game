import { LEAGUE_IDS } from './classics';
import { EXTRA_LEAGUES } from './leagues/index';
import lpfLogo from '../assets/leagues/lpf.webp?url';
import primeraNacionalLogo from '../assets/leagues/primeranacional.webp?url';
import brasilLogo from '../assets/leagues/brasil.webp?url';
import colombiaLogo from '../assets/leagues/colombia.webp?url';

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

const ids = (k: string) => (EXTRA_LEAGUES[k]?.teams ?? []).map((t) => t.id);

export const LEAGUES: LeagueDef[] = [
  { id: 'lpf', name: 'Liga Profesional', country: 'Argentina', logo: lpfLogo, teamIds: () => LEAGUE_IDS,
    format: { zones: 2, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Clausura'], playoffs: 8, neutralFinal: true, annual: true } },
  { id: 'primeranacional', name: 'Primera Nacional', country: 'Argentina', logo: primeraNacionalLogo, teamIds: () => ids('primeranacional'),
    format: { zones: 2, rr: 'single', torneos: ['Primera Nacional'], playoffs: 8, neutralFinal: true, annual: false } },
  { id: 'brasil', name: 'Brasileirão Série A', country: 'Brasil', logo: brasilLogo, teamIds: () => ids('brasil'),
    format: { zones: 1, rr: 'double', torneos: ['Brasileirão'], playoffs: 0, neutralFinal: false, annual: false } },
  { id: 'colombia', name: 'Liga BetPlay Dimayor', country: 'Colombia', logo: colombiaLogo, teamIds: () => ids('colombia'),
    format: { zones: 1, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Finalización'], playoffs: 8, neutralFinal: false, annual: true } },
  { id: 'peru', name: 'Liga 1 de Perú', country: 'Perú', teamIds: () => ids('peru'),
    format: { zones: 1, rr: 'single', torneos: ['Torneo Apertura', 'Torneo Clausura'], playoffs: 0, neutralFinal: false, annual: true } },
];

export function getLeague(id: string | undefined): LeagueDef {
  return LEAGUES.find((l) => l.id === id) ?? LEAGUES[0];
}

/** Liga a la que pertenece un equipo (la primera que lo tiene). */
export function leagueOfTeam(teamId: string): LeagueDef | null {
  return LEAGUES.find((l) => l.teamIds().includes(teamId)) ?? null;
}
