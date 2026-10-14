import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FanEffects } from '../src/render/stadium/fanfx';
import type { FanSpot } from '../src/render/stadium/crowd';

function spots(): FanSpot[] {
  const out: FanSpot[] = [];
  for (let i = 0; i < 300; i++) {
    const side = i % 2 ? 1 : -1;
    const tier = i % 3;
    const barra = i % 5 === 0 && tier < 2;
    if (barra) out.push({ x: -58 - tier * 6 - (i % 4), y: 2 + tier * 8, z: (i % 30) - 15, nx: -1, nz: 0, away: false, barra, tier });
    else out.push({ x: (i % 50) * 2 - 50, y: 2 + tier * 8, z: side * (40 + tier * 6), nx: 0, nz: side, away: i % 7 === 0, barra, tier });
  }
  return out;
}

describe('Efectos de la hinchada', () => {
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 900);
  cam.position.set(0, 20, 60);
  cam.lookAt(0, 0, 0);

  it('hay banderas en las gradas, trapos en la baranda y bombos en la barra brava', () => {
    const fx = new FanEffects(spots(), { homeColor: '#d02020', awayColor: '#2050d0', seed: 1, quality: 'medium', homeName: 'Aurora', awayName: 'Brasa' });
    expect(fx.flagCount).toBeGreaterThan(40);
    expect(fx.flags.trapoCount).toBeGreaterThan(3);
    expect(fx.flags.drumCount).toBeGreaterThan(5);
    expect(fx.flags.giantVisible).toBe(false);
    fx.dispose();
  });

  it('la bandera gigante de la barra se despliega en el recibimiento y luego se recoge', () => {
    const fx = new FanEffects(spots(), { homeColor: '#d02020', awayColor: '#2050d0', seed: 4, quality: 'low' });
    fx.welcome();
    for (let i = 0; i < 60 * 3; i++) fx.update(1 / 60, cam, 720, 0.5);
    expect(fx.flags.giantVisible).toBe(true);
    for (let i = 0; i < 60 * 25; i++) fx.update(1 / 60, cam, 720, 0);
    expect(fx.flags.giantVisible).toBe(false);
    fx.dispose();
  });

  it('recibimiento: cohetes que estallan (con sonido), humo y papelitos, y luego se apaga todo', () => {
    const fx = new FanEffects(spots(), { homeColor: '#d02020', awayColor: '#2050d0', seed: 2, quality: 'low' });
    let bursts = 0;
    fx.onBurst = (d) => { bursts++; expect(Number.isFinite(d)).toBe(true); };
    fx.welcome();
    for (let i = 0; i < 60 * 8; i++) fx.update(1 / 60, cam, 720, 0.5);
    expect(bursts).toBeGreaterThanOrEqual(14);
    expect(fx.busy).toBe(true);
    // posiciones válidas en las partículas
    fx.group.traverse((o) => {
      const g = (o as THREE.Points).geometry;
      const p = g?.getAttribute?.('position');
      if (p) for (let k = 0; k < p.array.length; k++) expect(Number.isFinite(p.array[k])).toBe(true);
    });
    for (let i = 0; i < 60 * 30; i++) fx.update(1 / 60, cam, 720, 0);
    // sin emisores ni partículas vivas (las bengalas espontáneas tardan más de 40 s en aparecer)
    expect(fx.busy).toBe(false);
    fx.dispose();
  });

  it('gol: bengalas y fuegos artificiales de la hinchada que marca', () => {
    const fx = new FanEffects(spots(), { homeColor: '#d02020', awayColor: '#2050d0', seed: 3, quality: 'high' });
    let bursts = 0;
    fx.onBurst = () => bursts++;
    fx.goal(1);
    for (let i = 0; i < 60 * 6; i++) fx.update(1 / 60, cam, 720, 1);
    expect(bursts).toBe(5);
    expect(fx.busy).toBe(true);
    fx.dispose();
  });
});
