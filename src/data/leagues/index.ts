import type { LeagueData } from '../seedUtil';
import { DATA as primeranacional } from './primeranacional';
import { DATA as brasil } from './brasil';
import { DATA as colombia } from './colombia';
import { DATA as peru } from './peru';

/** Ligas que se suman a la Liga Profesional. */
export const EXTRA_LEAGUES: Record<string, LeagueData> = { primeranacional, brasil, colombia, peru };
