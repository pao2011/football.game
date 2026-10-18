import type { LeagueData } from '../seedUtil';
import { DATA as primeranacional } from './primeranacional';
import { DATA as brasil } from './brasil';
import { DATA as colombia } from './colombia';
import { DATA as peru } from './peru';
import { DATA as chile } from './chile';
import { DATA as paraguay } from './paraguay';
import { DATA as uruguay } from './uruguay';
import { DATA as ecuador } from './ecuador';
import { DATA as bolivia } from './bolivia';
import { DATA as venezuela } from './venezuela';

const RAW: Record<string, LeagueData> = { primeranacional, brasil, colombia, peru, chile, paraguay, uruguay, ecuador, bolivia, venezuela };

/** Una liga necesita al menos esta cantidad de clubes con escudo para seguir funcionando. */
const MIN_TEAMS = 8;

/**
 * Se omiten los clubes de los que no hay imagen del escudo (mientras la liga siga teniendo equipos suficientes):
 * sus estadios y clásicos también salen.
 */
function withCrests(d: LeagueData): LeagueData {
  const teams = d.teams.filter((t) => t.crest.image);
  if (teams.length < MIN_TEAMS) return d;
  const ids = new Set(teams.map((t) => t.id));
  return { teams, stadiums: d.stadiums.filter((s) => !s.homeTeam || ids.has(s.homeTeam)), classics: d.classics.filter((c) => ids.has(c.a) && ids.has(c.b)) };
}

/** Ligas que se suman a la Liga Profesional. */
export const EXTRA_LEAGUES: Record<string, LeagueData> = Object.fromEntries(Object.entries(RAW).map(([k, d]) => [k, withCrests(d)]));
