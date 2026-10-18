import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { MatchAudio } from '../src/audio/MatchAudio';
import { showLevels, type ShowLevels } from '../src/audio/ShowTimeline';
import { BELGRANO_CHANTS, CLUB_CHANTS, GENERIC_CHANTS, chantsForStadium } from '../src/audio/chantTracks';
import { TEAMS } from '../src/data/teams';
import { getTeam } from '../src/data/teams';
import { STADIUMS, stadiumForHome, GENERIC_STADIUMS } from '../src/data/stadiums';
import type { AudioEngine } from '../src/audio/AudioEngine';

describe('Belgrano de Córdoba', () => {
  it('tiene camiseta celeste, plantilla real de 18 y dorsales únicos', () => {
    const t = getTeam('belgrano');
    expect(t.name).toBe('Belgrano de Córdoba');
    expect(t.home.shirt.toLowerCase()).toBe('#5db8e8');
    expect(t.players.length).toBe(18);
    expect(new Set(t.players.map((p) => p.number)).size).toBe(18);
    expect(t.players[0].position).toBe('GK');
    const names = t.players.map((p) => p.name);
    expect(names).toContain('Lucas Zelarayán');
    expect(names).toContain('Lucas Passerini');
    expect(t.players.find((p) => p.name === 'Lucas Zelarayán')!.number).toBe(10);
  });

  it('juega de local en el Villagra; el resto de equipos sigue con los estadios genéricos', () => {
    expect(stadiumForHome('belgrano', 8).id).toBe('villagra');
    expect(stadiumForHome('boca', 0).id).toBe('bombonera');
    for (let i = 0; i < 20; i++) expect(GENERIC_STADIUMS).toContain(stadiumForHome('x', i));
    // cada club tiene su cancha
    for (const t of TEAMS) expect(STADIUMS.filter((s) => s.homeTeam === t.id).length).toBe(1);
  });

  it('los cánticos de Belgrano solo existen en su cancha', () => {
    const v = chantsForStadium(STADIUMS.find((s) => s.id === 'villagra')!);
    expect(v.tracks.slice(0, BELGRANO_CHANTS.length)).toEqual(BELGRANO_CHANTS);
    expect(v.tracks.length).toBe(BELGRANO_CHANTS.length + 4);
    expect(v.special).toBeDefined();
    for (const s of STADIUMS.filter((s) => s.id !== 'villagra')) {
      const c = chantsForStadium(s);
      expect(c.special).toBeUndefined();
      expect(c.tracks.some((x) => CLUB_CHANTS.belgrano.includes(x))).toBe(false);
      // la hinchada de cada club suena en su cancha; las neutrales, los genéricos
      if (s.homeTeam && CLUB_CHANTS[s.homeTeam]) expect(c.tracks).toEqual(CLUB_CHANTS[s.homeTeam]);
      else expect(c.tracks).toEqual(GENERIC_CHANTS);
      // Boca: sus temas más los genéricos; los clubes sin audio válido, solo los genéricos
      if (s.homeTeam === 'boca') {
        expect(c.tracks.filter((t) => t.name.startsWith('boca')).length).toBe(2);
        expect(c.tracks.slice(2)).toEqual(GENERIC_CHANTS);
      }
      if (s.homeTeam && ['centralcordoba', 'instituto', 'estudiantesrc', 'sarmiento'].includes(s.homeTeam)) expect(c.tracks).toEqual(GENERIC_CHANTS);
    }
    // el tema del minuto 68 no está en la rotación normal
    expect(v.tracks.some((x) => x.url === v.special!.track.url)).toBe(false);
  });

  it('la línea de tiempo del minuto 68: audio desde el 66, a todo volumen del 68 al 70 y se apaga; espectáculo del 67 al 71', () => {
    const at = (min: number) => showLevels(min);
    // antes del 66:00 no suena nada ni hay espectáculo
    expect(at(64.9)).toMatchObject({ audio: 0, visual: 0, audioOn: false });
    // entra de a poco desde el 66 (minuto 65 transcurrido)
    expect(at(65.01).audioOn).toBe(true);
    expect(at(66)).toSatisfy((l: ShowLevels) => l.audio > 0.3 && l.audio < 0.7);
    // a todo volumen en el 68 y se mantiene hasta el 70
    for (const t of [67, 67.5, 68, 68.99]) expect(at(t).audio).toBeCloseTo(1, 1);
    // después baja de a poco hasta apagarse
    expect(at(70)).toSatisfy((l: ShowLevels) => l.audio < 1 && l.audio > 0.6);
    expect(at(71)).toSatisfy((l: ShowLevels) => l.audio > 0 && l.audio < 0.4);
    expect(at(72.01)).toMatchObject({ audio: 0, audioOn: false });
    // el espectáculo se gesta desde el 67, estalla en el 68 y se apaga hacia el 71
    expect(at(65.9).visual).toBe(0);
    expect(at(66.5).visual).toSatisfy((v: number) => v > 0.2 && v < 0.8);
    expect(at(67)).toMatchObject({ visual: 1 });
    expect(at(68)).toMatchObject({ visual: 1 });
    expect(at(70).visual).toSatisfy((v: number) => v > 0 && v < 0.7);
    expect(at(71.01).visual).toBe(0);
    // sube y baja sin saltos
    let prev = 0;
    for (let t = 64; t < 73; t += 0.05) {
      const l = showLevels(t);
      expect(Math.abs(l.audio - prev)).toBeLessThan(0.08);
      prev = l.audio;
    }
  });

  it('MatchAudio arranca el tema una sola vez en el 66, le sigue el volumen y lo apaga en el 72', () => {
    const m = makeMatch();
    const calls: [string, ...unknown[]][] = [];
    const audio = new Proxy({}, {
      get: (_t, name) => name === 'hasSpecialChant' ? true : (...args: unknown[]) => calls.push([String(name), ...args]),
    }) as unknown as AudioEngine;
    const ma = new MatchAudio(audio, m);
    m.phase = 'play';
    const step = (sec: number) => { m.matchSeconds = sec; m.time += 1; ma.update(0.3); };
    step(64 * 60); // minuto 65: nada
    expect(calls.some((c) => c[0] === 'playSpecialChant')).toBe(false);
    step(65 * 60 + 1); // minuto 66
    expect(calls.filter((c) => c[0] === 'playSpecialChant').length).toBe(1);
    step(66 * 60);
    step(67 * 60 + 30); // minuto 68: a todo volumen
    const levels = calls.filter((c) => c[0] === 'setSpecialChantLevel').map((c) => c[1] as number);
    expect(levels[0]).toBeLessThan(0.1);
    expect(levels[levels.length - 1]).toBeCloseTo(1, 1);
    expect(calls.filter((c) => c[0] === 'playSpecialChant').length).toBe(1);
    expect(calls.some((c) => c[0] === 'endSpecialChant')).toBe(false);
    step(72 * 60 + 5); // fin del momento
    expect(calls.filter((c) => c[0] === 'endSpecialChant').length).toBe(1);
    step(80 * 60);
    expect(calls.filter((c) => c[0] === 'endSpecialChant').length).toBe(1);
    expect(calls.filter((c) => c[0] === 'playSpecialChant').length).toBe(1);
  });
});
