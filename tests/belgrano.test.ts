import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { MatchAudio } from '../src/audio/MatchAudio';
import { BELGRANO_CHANTS, GENERIC_CHANTS, chantsForStadium } from '../src/audio/chantTracks';
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
    expect(stadiumForHome('aurora', 0).homeTeam).toBeUndefined();
    for (let i = 0; i < 20; i++) expect(GENERIC_STADIUMS).toContain(stadiumForHome('x', i));
    expect(STADIUMS.filter((s) => s.homeTeam).length).toBe(1);
  });

  it('los cánticos de Belgrano solo existen en su cancha', () => {
    const v = chantsForStadium('villagra');
    expect(v.tracks).toEqual(BELGRANO_CHANTS);
    expect(v.special?.minute).toBe(68);
    for (const s of STADIUMS.filter((s) => s.id !== 'villagra')) {
      const c = chantsForStadium(s.id);
      expect(c.tracks).toEqual(GENERIC_CHANTS);
      expect(c.special).toBeUndefined();
      expect(c.tracks.some((x) => BELGRANO_CHANTS.includes(x))).toBe(false);
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
