import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';
import { decodeFrames, encodeFrames, lastSeconds, listReplays, saveReplay, deleteReplay, MAX_SAVED_REPLAYS, type SavedReplay } from '../src/modes/SavedReplays';

describe('Repeticiones guardadas', () => {
  it('la codificación compacta conserva los fotogramas (redondeados)', () => {
    const m = makeMatch({ seed: 4 });
    m.simulate(12);
    const frames = lastSeconds(m.replay, 6);
    expect(frames.length).toBeGreaterThan(100);
    const enc = encodeFrames(frames);
    const dec = decodeFrames(JSON.parse(JSON.stringify(enc)));
    expect(dec.length).toBe(frames.length);
    const a = frames[50], b = dec[50];
    expect(b.tm).toBeCloseTo(a.tm, 2);
    expect(b.ball[0]).toBeCloseTo(a.ball[0], 1);
    expect(b.players.length).toBe(a.players.length);
    const pa = a.players[3], pb = b.players.find((p) => p.id === pa.id)!;
    expect(pb.s).toBe(pa.s);
    expect(pb.x).toBeCloseTo(pa.x, 1);
    expect(pb.f).toBeCloseTo(pa.f, 1);
    // bastante más pequeña que el JSON original
    expect(JSON.stringify(enc).length).toBeLessThan(JSON.stringify(frames).length * 0.6);
  });

  it('se guardan, se listan (la más nueva primero) y se borran, con un máximo', () => {
    const m = makeMatch({ seed: 5 });
    m.simulate(3);
    const base = (i: number): SavedReplay => ({
      id: 'r' + i, date: i, title: 'Jugada ' + i, clock: '10:00', score: '0-0', stadiumId: 'x', goalSide: 1,
      home: m.config.home, away: m.config.away, homeKit: m.config.homeKit, awayKit: m.config.awayKit, data: encodeFrames(lastSeconds(m.replay, 1)),
    });
    for (let i = 0; i < MAX_SAVED_REPLAYS + 2; i++) expect(saveReplay(base(i))).toBe(true);
    const list = listReplays();
    expect(list.length).toBe(MAX_SAVED_REPLAYS);
    expect(list[0].id).toBe('r' + (MAX_SAVED_REPLAYS + 1));
    deleteReplay(list[0].id);
    expect(listReplays().some((r) => r.id === list[0].id)).toBe(false);
  });
});
