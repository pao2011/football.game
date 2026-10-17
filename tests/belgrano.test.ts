import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { MatchAudio } from '../src/audio/MatchAudio';
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
    expect(names).toContain('Matías Daniele');
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
    expect(v.special?.minute).toBe(68);
    for (const s of STADIUMS.filter((s) => s.id !== 'villagra')) {
      const c = chantsForStadium(s);
      expect(c.special).toBeUndefined();
      expect(c.tracks.some((x) => CLUB_CHANTS.belgrano.includes(x))).toBe(false);
      // la hinchada de cada club suena en su cancha; las neutrales, los genéricos
      if (s.homeTeam && CLUB_CHANTS[s.homeTeam]) expect(c.tracks).toEqual(CLUB_CHANTS[s.homeTeam]);
      else expect(c.tracks).toEqual(GENERIC_CHANTS);
    }
    // el tema del minuto 68 no está en la rotación normal
    expect(v.tracks.some((x) => x.url === v.special!.track.url)).toBe(false);
  });

  it('el tema del minuto 68 suena una sola vez y justo en ese minuto', () => {
    const m = makeMatch();
    const calls: string[] = [];
    const audio = new Proxy({}, { get: (_t, name) => name === 'specialChantMinute' ? 68 : () => calls.push(String(name)) }) as unknown as AudioEngine;
    const ma = new MatchAudio(audio, m);
    m.phase = 'play';
    m.matchSeconds = 67 * 60 - 5; // minuto 67
    m.time += 1; ma.update(0.3);
    expect(calls).not.toContain('playSpecialChant');
    m.matchSeconds = 67 * 60 + 1; // minuto 68
    expect(m.minute).toBe(68);
    m.time += 1; ma.update(0.3);
    expect(calls.filter((c) => c === 'playSpecialChant').length).toBe(1);
    for (let i = 0; i < 5; i++) { m.matchSeconds += 60; m.time += 1; ma.update(0.3); }
    expect(calls.filter((c) => c === 'playSpecialChant').length).toBe(1);
  });
});
