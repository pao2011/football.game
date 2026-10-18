import type { LeagueData } from '../seedUtil';
import { DATA as primeranacional } from './primeranacional';
import { DATA as brasil } from './brasil';
import { DATA as chile } from './chile';
import { DATA as colombia } from './colombia';
import { DATA as peru } from './peru';
import { DATA as paraguay } from './paraguay';

/** Ligas que se suman a la Liga Profesional. */
export const EXTRA_LEAGUES: Record<string, LeagueData> = { primeranacional, brasil, chile, colombia, peru, paraguay };
