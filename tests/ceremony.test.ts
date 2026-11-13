import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeMatch } from './helpers';
import { Ceremony, CEREMONY } from '../src/game/Ceremony';
import type { MatchView } from '../src/render/MatchView';

function setup(final?: string) {
  const m = makeMatch({ seed: 11, final });
  const view = { scene: new THREE.Scene(), director: { ceremonyShot: null }, ceremony: false } as unknown as MatchView;
  const kickoff = m.active.map((p) => ({ p, pos: p.pos.clone(), facing: p.facing }));
  return { m, view, kickoff, c: new Ceremony(m, view) };
}

function minGap(ps: { pos: THREE.Vector3 }[]) {
  let g = Infinity;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) g = Math.min(g, Math.hypot(ps[i].pos.x - ps[j].pos.x, ps[i].pos.z - ps[j].pos.z));
  return g;
}

describe('Ceremonia previa', () => {
  it('salen en fila sin chocarse, forman en línea y el visitante pasa saludando por delante', () => {
    const { m, c } = setup();
    for (let t = 0; t < CEREMONY.shake; t += 0.25) {
      c.update(t);
      // fuera del túnel nadie se pisa
      const out = m.active.filter((p) => p.pos.z > -36);
      if (out.length > 1) expect(minGap(out)).toBeGreaterThan(0.5);
    }
    c.update(CEREMONY.shake - 0.2);
    for (const p of m.active) expect(Math.abs(p.pos.z + 16)).toBeLessThan(0.01);
    expect(minGap(m.active)).toBeGreaterThan(0.9);
    c.update((CEREMONY.shake + CEREMONY.toss) / 2);
    const away = m.teams[1].active;
    for (const p of away) expect(p.anim.state).toBe('handshake');
    expect(m.teams[0].active.every((p) => p.anim.state === 'handshake' && p.anim.speed === 0)).toBe(true);
  });

  it('el sorteo lo gana el equipo que no saca y al terminar todo vuelve a la posición de saque', () => {
    const { m, view, kickoff, c } = setup();
    expect(c.tossWinner).not.toBe(m.firstHalfKickoff);
    expect(c.caption(CEREMONY.coin + 1.2)).toContain(m.teams[c.tossWinner].data.name);
    // durante el sorteo, en el círculo central solo están los capitanes (nadie cruza por delante)
    for (let t = CEREMONY.toss + 3.5; t < CEREMONY.disperse; t += 0.2) {
      c.update(t);
      expect(m.active.filter((p) => Math.hypot(p.pos.x, p.pos.z) < 4.5).length).toBe(2);
    }
    c.update(CEREMONY.coin + 0.8);
    expect(m.referee.anim.state).toBe('coin_toss');
    expect(view.scene.getObjectByName('coin')!.visible).toBe(true);
    c.update(CEREMONY.end);
    for (const k of kickoff) expect(k.p.pos.distanceTo(k.pos)).toBeLessThan(0.05);
    c.finish();
    for (const k of kickoff) {
      expect(k.p.pos.equals(k.pos)).toBe(true);
      expect(k.p.facing).toBe(k.facing);
    }
    expect(m.ball.pos.x).toBe(0);
    expect(view.scene.children.length).toBe(0);
    expect(view.ceremony).toBe(false);
  });

  it('la copa solo sale en las finales', () => {
    expect(setup().view.scene.getObjectByName('trophy')).toBeUndefined();
    const f = setup('Copa Élite');
    expect(f.view.scene.getObjectByName('trophy')).toBeDefined();
    expect(f.c.caption(1)).toContain('Copa Élite');
  });
});
