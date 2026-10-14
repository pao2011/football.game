import { Match, type MatchConfig } from '../src/sim/Match';
import { TEAMS, chooseAwayKit } from '../src/data/teams';

export function makeMatch(over: Partial<MatchConfig> = {}): Match {
  const home = over.home ?? TEAMS[0];
  const away = over.away ?? TEAMS[1];
  return new Match({
    home, away,
    homeKit: home.home,
    awayKit: chooseAwayKit(home, away),
    humanTeam: -1,
    halfLengthSec: 180,
    difficulty: 'world',
    extraTime: false,
    penalties: false,
    seed: 42,
    ...over,
  });
}
