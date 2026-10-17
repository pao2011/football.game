import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { Commentary } from '../src/audio/Commentary';
import { voiceScore, type SpeechOut } from '../src/audio/Speech';

/** Voz falsa: apunta lo que dice y "habla" hasta que se llama a finish(). */
function fakeSpeech() {
  const said: string[] = [];
  let busy = false;
  const speech: SpeechOut = {
    available: true,
    voiceName: 'prueba',
    get speaking() { return busy; },
    speak: (t: string) => { said.push(t); busy = true; },
    cancel: () => { busy = false; },
  };
  return { speech, said, finish: () => { busy = false; } };
}

describe('Relator', () => {
  it('grita los goles con el nombre del goleador y luego dice el resultado', () => {
    const m = makeMatch();
    const { speech, said, finish } = fakeSpeech();
    const c = new Commentary(speech, m);
    const scorer = m.teams[1].players[9];
    m.teams[1].stats.goals = 1;
    c.onEvent({ type: 'goal', team: 1, playerId: scorer.id, text: scorer.data.name, kind: 'normal' });
    expect(said[0]).toMatch(/Go+l/);
    expect(said[0]).toContain(scorer.data.name);
    expect(said[0]).toContain(m.teams[1].data.name);
    finish();
    for (let i = 0; i < 8 * 60; i++) c.update(1 / 60);
    expect(said[1]).toContain(`${m.teams[1].data.name} 1`);
  });

  it('lo importante interrumpe y lo menor no pisa una frase en curso', () => {
    const m = makeMatch();
    const { speech, said } = fakeSpeech();
    const c = new Commentary(speech, m);
    c.onEvent({ type: 'foul', team: 0, playerId: m.teams[0].players[3].id });
    c.onEvent({ type: 'offside', team: 1, playerId: m.teams[1].players[9].id });
    expect(said.length).toBe(1);
    c.onEvent({ type: 'post' });
    expect(said.length).toBe(2);
    expect(said[1]).toMatch(/palo|poste/i);
  });

  it('sin volumen no habla', () => {
    const m = makeMatch();
    const { speech, said } = fakeSpeech();
    const c = new Commentary(speech, m);
    c.volume = () => 0;
    c.onEvent({ type: 'post' });
    expect(said.length).toBe(0);
  });

  it('elige voces en castellano, mejor rioplatenses y naturales', () => {
    expect(voiceScore({ name: 'Google US English', lang: 'en-US' })).toBeLessThan(0);
    expect(voiceScore({ name: 'Microsoft Tomas Online (Natural) - Spanish (Argentina)', lang: 'es-AR' }))
      .toBeGreaterThan(voiceScore({ name: 'Google español', lang: 'es-ES' }));
    expect(voiceScore({ name: 'Google español de Estados Unidos', lang: 'es-US' }))
      .toBeGreaterThan(voiceScore({ name: 'eSpeak Spanish', lang: 'es' }));
  });
});
