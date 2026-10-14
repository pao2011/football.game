import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIFA_CLASSIC, Input } from '../src/input/Input';
import { activePad, dpad } from '../src/input/pads';

function pad(over: Partial<Gamepad> & { pressed?: number[]; axes?: number[] } = {}): Gamepad {
  const n = over.buttons?.length ?? 17;
  const buttons = Array.from({ length: n }, (_, i) => ({ pressed: (over.pressed ?? []).includes(i), touched: false, value: (over.pressed ?? []).includes(i) ? 1 : 0 }));
  return { id: 'Test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: over.axes ?? [0, 0, 0, 0], buttons, hapticActuators: [], ...over } as unknown as Gamepad;
}
function stub(pads: (Gamepad | null)[]) {
  vi.stubGlobal('navigator', { getGamepads: () => pads });
}
afterEach(() => vi.unstubAllGlobals());

describe('Mando', () => {
  it('stick izquierdo mueve y los botones estándar hacen pase, tiro, elevado y pase al hueco', () => {
    const inp = new Input(structuredClone(FIFA_CLASSIC));
    stub([pad({ axes: [0.9, -0.9, 0, 0], pressed: [0, 1, 2, 3] })]);
    inp.poll(1 / 60);
    const m = inp.move();
    expect(m.x).toBeGreaterThan(0.5);
    expect(m.y).toBeGreaterThan(0.5); // arriba en pantalla
    for (const a of ['pass', 'shoot', 'lob', 'through'] as const) expect(inp.held(a)).toBe(true);
    expect(inp.usingGamepad).toBe(true);
  });

  it('gatillos y bumpers: sprint, potente, cambiar y rosca; Start pausa', () => {
    const inp = new Input(structuredClone(FIFA_CLASSIC));
    stub([pad({ pressed: [4, 5, 6, 7, 9] })]);
    inp.poll(1 / 60);
    for (const a of ['switch', 'finesse', 'jockey', 'sprint', 'pause'] as const) expect(inp.held(a)).toBe(true);
  });

  it('un gatillo analógico a medias cuenta como pulsado', () => {
    const inp = new Input(structuredClone(FIFA_CLASSIC));
    const g = pad();
    (g.buttons as unknown as { pressed: boolean; value: number }[])[7] = { pressed: false, value: 0.6 };
    stub([g]);
    inp.poll(1 / 60);
    expect(inp.held('sprint')).toBe(true);
  });

  it('la cruceta mueve y el stick derecho hace regates', () => {
    const inp = new Input(structuredClone(FIFA_CLASSIC));
    stub([pad({ pressed: [14], axes: [0, 0, 0.9, 0] })]);
    inp.poll(1 / 60);
    expect(inp.move().x).toBeLessThan(-0.5);
    expect(inp.held('skillRight')).toBe(true);
  });

  it('ignora dispositivos falsos y elige el mando de mapa estándar', () => {
    const fake = pad({ buttons: [] as unknown as GamepadButton[], axes: [0, 0] });
    (fake as unknown as { buttons: unknown[] }).buttons = [{ pressed: true, touched: false, value: 1 }];
    const real = pad({ index: 1, pressed: [0] });
    stub([fake, null, real]);
    expect(activePad()).toBe(real);
    const inp = new Input(structuredClone(FIFA_CLASSIC));
    inp.poll(1 / 60);
    expect(inp.held('pass')).toBe(true);
  });

  it('mando sin mapa estándar: cruceta por el eje "hat" y botones por su índice', () => {
    const g = pad({ mapping: '' as GamepadMappingType, axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -1], pressed: [0] });
    expect(dpad(g).up).toBe(true);
    const g2 = pad({ mapping: '' as GamepadMappingType, axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.71] });
    expect(dpad(g2).left).toBe(true);
    stub([g]);
    const inp = new Input(structuredClone(FIFA_CLASSIC));
    inp.poll(1 / 60);
    expect(inp.held('pass')).toBe(true);
  });

  it('sin mando conectado no hay entrada y no falla', () => {
    stub([null, null]);
    const inp = new Input(structuredClone(FIFA_CLASSIC));
    inp.poll(1 / 60);
    expect(inp.usingGamepad).toBe(false);
    expect(inp.move()).toEqual({ x: 0, y: 0 });
  });
});
