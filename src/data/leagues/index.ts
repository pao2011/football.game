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

/** Ligas que se suman a la Liga Profesional. */
export const EXTRA_LEAGUES: Record<string, LeagueData> = { primeranacional, brasil, colombia, peru, chile, paraguay, uruguay, ecuador, bolivia, venezuela };
