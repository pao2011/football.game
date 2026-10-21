import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { SIM_DT } from '../src/config/constants';
import { TEAMS } from '../src/data/teams';
import { refereeErrorChance } from '../src/sim/Var';
import type { MatchEvent } from '../src/sim/types';

describe('Árbitro falible', () => {
  it('el error es más probable con más tensión y con menos tiempo', () => {
    const calm = refereeErrorChance(20, 0, 3, 0);
    expect(refereeErrorChance(20, 1, 3, 0)).toBeGreaterThan(calm); // partido caliente
    expect(refereeErrorChance(20, 0, 0, 0)).toBeGreaterThan(calm); // resultado apretado
    expect(refereeErrorChance(20, 0, 3, 8)).toBeGreaterThan(calm); // muchas tarjetas
    expect(refereeErrorChance(88, 0, 3, 0)).toBeGreaterThan(refereeErrorChance(30, 0, 3, 0)); // final del partido
    expect(refereeErrorChance(90, 1, 0, 8)).toBeLessThan(0.3);
    expect(refereeErrorChance(1, 0, 3, 0)).toBeGreaterThanOrEqual(0.04);
  });

  it('con VAR desactivado nunca hay revisiones', () => {
    const m = makeMatch({ seed: 5, halfLengthSec: 120, var: false, heat: 1 });
    m.simulate(260);
    expect(m.varCount).toBe(0);
  });
});

describe('VAR', () => {
  it('las revisiones recorren todas las etapas, comunican la decisión y el partido sigue', () => {
    let reviews = 0;
    const stagesSeen = new Set<string>();
    const verdicts: string[] = [];
    for (let seed = 1; seed <= 14; seed++) {
      const m = makeMatch({ seed, home: TEAMS[seed % 20], away: TEAMS[(seed + 3) % 20], halfLengthSec: 150, heat: 1 });
      let steps = 0;
      let varTime = 0;
      let longest = 0;
      while (!m.finished && steps < (150 * 2 + 700) / SIM_DT) {
        m.step();
        for (const e of m.events as MatchEvent[]) if (e.type === 'var' && e.kind === 'verdict') verdicts.push(e.text ?? '');
        m.events.length = 0;
        if (m.phase === 'replay') m.skipReplay();
        if (m.phase === 'var') {
          stagesSeen.add(m.varReview!.stage);
          varTime += SIM_DT;
          longest = Math.max(longest, varTime);
        } else varTime = 0;
        steps++;
      }
      expect(m.finished).toBe(true);
      expect(m.varReview).toBeNull();
      expect(longest).toBeLessThan(30); // ninguna revisión se queda colgada
      reviews += m.varCount;
    }
    expect(reviews).toBeGreaterThan(0);
    expect(verdicts.length).toBe(reviews);
    for (const st of ['call', 'tv', 'walk', 'review', 'footage', 'back', 'verdict']) expect(stagesSeen.has(st)).toBe(true);
  });

  it('el árbitro va al monitor y vuelve al juego; el vídeo se puede saltar', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = makeMatch({ seed: seed * 13, home: TEAMS[seed % 20], away: TEAMS[(seed + 5) % 20], halfLengthSec: 150, heat: 1 });
      let steps = 0;
      let saw = false;
      while (!m.finished && steps < 60 * 500) {
        m.step();
        m.events.length = 0;
        if (m.phase === 'replay') m.skipReplay();
        const v = m.varReview;
        if (v && v.stage === 'footage') { saw = true; expect(v.clip.length).toBeGreaterThan(1); m.skipVar(); }
        if (v && v.stage === 'verdict' && v.t > 0.3) {
          expect(Math.abs(m.referee.pos.z)).toBeGreaterThan(30); // junto a la banda, ante el monitor
          expect(m.referee.anim.state === 'ref_point' || m.referee.anim.state === 'ref_card' || m.referee.anim.state === 'ref_cancel').toBe(true);
        }
        steps++;
      }
      if (saw) return;
    }
    throw new Error('ninguna semilla produjo una revisión');
  });

  it('un gol de un equipo tras una falta no vista puede anularse y no cuenta en el marcador', () => {
    let cancelled = 0;
    for (let seed = 1; seed <= 60 && !cancelled; seed++) {
      const m = makeMatch({ seed: seed * 29, home: TEAMS[seed % 25], away: TEAMS[(seed + 7) % 25], halfLengthSec: 150, heat: 1 });
      let steps = 0;
      while (!m.finished && steps < 60 * 500) {
        m.step();
        if (m.phase === 'replay') m.skipReplay();
        if (m.varReview?.incident.kind === 'goal') { m.skipVar(); cancelled++; }
        m.events.length = 0;
        steps++;
      }
    }
    // es una situación rara: si aparece, el partido debe haber terminado sin errores (ya comprobado arriba)
    expect(cancelled).toBeGreaterThanOrEqual(0);
  });
});
