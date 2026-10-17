import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { AchievementTracker, unlockedSet } from '../src/modes/Achievements';

describe('Logros', () => {
  it('se desbloquean con goles especiales y con el resultado', () => {
    const m = makeMatch({ seed: 1, humanTeam: 0 });
    const t = new AchievementTracker(m, 0);
    const scorer = m.teams[0].players[9];
    m.time = 10;
    t.onEvent({ type: 'kick', playerId: scorer.id, team: 0, kind: 'shoot', power: 0.8 });
    t.onEvent({ type: 'skill', playerId: scorer.id, team: 0, kind: 'bicycle' });
    m.teams[0].stats.goals = 1;
    scorer.goals = 1;
    t.onEvent({ type: 'goal', team: 0, playerId: scorer.id, kind: 'normal' });
    const ids = t.unlockedNow.map((a) => a.id);
    expect(ids).toContain('first_goal');
    expect(ids).toContain('bicycle');
    t.finish(0, false);
    const ids2 = t.unlockedNow.map((a) => a.id);
    expect(ids2).toContain('first_win');
    expect(ids2).toContain('cleansheet');
    expect(ids2).toContain('fairplay');
  });

  it('remontada: ganar un partido que se iba perdiendo', () => {
    const m = makeMatch({ seed: 2, humanTeam: 0 });
    const t = new AchievementTracker(m, 0);
    m.teams[1].stats.goals = 1;
    t.onEvent({ type: 'goal', team: 1, playerId: m.teams[1].players[9].id, kind: 'normal' });
    m.teams[0].stats.goals = 2;
    t.finish(0, false);
    // en Node no hay almacenamiento: cada logro puede volver a darse, así que se comprueba en esta instancia
    expect(t.unlockedNow.map((a) => a.id)).toContain('comeback');
    expect(typeof unlockedSet()).toBe('object');
  });
});
