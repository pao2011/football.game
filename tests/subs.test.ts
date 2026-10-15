import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { MAX_SUBS } from '../src/sim/Match';

describe('Cambios (suplentes)', () => {
  it('cada equipo tiene 7 suplentes y el cambio espera a una interrupción', () => {
    const m = makeMatch({ seed: 3 });
    const t = m.teams[0];
    expect(t.bench.length).toBe(7);
    m.simulate(2);
    // forzar juego en curso
    m.phase = 'play';
    const out = t.players[9];
    const inn = t.bench.find((p) => p.data.position === 'FWD') ?? t.bench[0];
    expect(m.requestSub(0, out.id, inn.id)).toBeNull();
    m.step();
    expect(t.players.includes(out)).toBe(true); // aún no: el balón está en juego
    m.phase = 'stoppage';
    m.step();
    expect(t.players.includes(out)).toBe(false);
    expect(t.players[9]).toBe(inn);
    expect(t.subbedOff).toContain(out);
    expect(m.playersAll).toContain(inn);
    expect(m.playersAll).not.toContain(out);
    expect(inn.slotIndex).toBe(9);
    expect(t.subsUsed).toBe(1);
  });

  it('no deja volver a quien salió, ni pasar de 5 cambios, ni cambiar a un expulsado', () => {
    const m = makeMatch({ seed: 4 });
    const t = m.teams[1];
    m.phase = 'halftime';
    const outs = t.players.slice(1, 7);
    for (let i = 0; i < MAX_SUBS; i++) expect(m.requestSub(1, outs[i].id, t.bench[i].id)).toBeNull();
    // el sexto se rechaza
    expect(m.requestSub(1, outs[5].id, t.bench[5].id)).toMatch(/5 cambios/);
    m.step();
    expect(t.subsUsed).toBe(MAX_SUBS);
    expect(m.requestSub(1, t.players[8].id, t.subbedOff[0].id)).not.toBeNull();
    const m2 = makeMatch({ seed: 5 });
    const p = m2.teams[0].players[4];
    m2.giveCard(p, 'red');
    expect(m2.requestSub(0, p.id, m2.teams[0].bench[0].id)).toMatch(/expulsado/);
  });

  it('el suplente que entra hereda el control del jugador humano y del balón', () => {
    const m = makeMatch({ seed: 6 });
    const t = m.teams[0];
    const out = t.players[7];
    t.controlled = out;
    m.owner = out;
    m.substitute(t, out, t.bench[2]);
    expect(t.controlled).toBe(t.players[7]);
    expect(m.owner).toBe(t.players[7]);
    expect(t.players[7].stamina).toBe(1);
  });

  it('la IA cambia a los jugadores cansados en la segunda parte y el partido sigue sano', () => {
    let subs = 0;
    for (const seed of [1, 2]) {
      const m = makeMatch({ seed });
      m.simulate(420);
      expect(m.finished).toBe(true);
      for (const t of m.teams) {
        expect(t.players.length).toBe(11);
        expect(t.subsUsed).toBeLessThanOrEqual(5);
        subs += t.subsUsed;
      }
      expect(new Set(m.playersAll.map((p) => p.id)).size).toBe(22);
    }
    expect(subs).toBeGreaterThan(0);
  });

  it('la IA hace cambios cuando sus jugadores están agotados', () => {
    const m = makeMatch({ seed: 2 });
    m.matchSeconds = 70 * 60;
    m.phase = 'stoppage';
    for (const p of m.teams[1].players) p.stamina = 0.4;
    m.restart = null;
    try { m.step(); } catch { /* sin reanudación preparada */ }
    expect(m.teams[1].subsUsed).toBe(1);
  });
});
