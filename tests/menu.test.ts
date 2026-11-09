import { describe, expect, it } from 'vitest';
import { MIX, MenuMusic, STEP } from '../src/audio/MenuMusic';
import { pickReel } from '../src/game/MenuShowcase';
import { seeded } from '../src/modes/club/util';

/** Contexto de audio de mentira: acepta cualquier llamada (sirve para recorrer toda la partitura sin navegador). */
const dummy = (): any => new Proxy(function () {}, { get: (_t, p) => (p === 'value' ? 0 : p === 'currentTime' ? 0 : p === 'sampleRate' ? 44100 : dummy()), apply: () => dummy(), set: () => true });

describe('Música del menú', () => {
  it('recorre intro y dos vueltas del bucle sin errores y sin notas fuera de la partitura', () => {
    const k = { ctx: dummy(), filter: () => dummy(), perc: () => undefined, noise: () => dummy() };
    const music = new MenuMusic(k, dummy());
    const bars = 4 + 24 * 2;
    for (let s = 0; s < bars * 16; s++) music.scheduleStep(s, s * STEP);
    expect(STEP).toBeGreaterThan(0.1);
    // todos los instrumentos tienen su volumen de mezcla
    for (const v of Object.values(MIX)) expect(v).toBeGreaterThan(0);
  });
});

describe('Fondo del menú', () => {
  it('elige dos equipos de la élite distintos y un estadio', () => {
    for (let i = 1; i <= 30; i++) {
      const r = pickReel(seeded(i));
      expect(r.home.id).not.toBe(r.away.id);
      expect(r.home.players.length).toBeGreaterThanOrEqual(11);
      expect(r.stadium.id).toBeTruthy();
      expect(r.home.rating).toBeGreaterThan(70);
    }
  });
});
