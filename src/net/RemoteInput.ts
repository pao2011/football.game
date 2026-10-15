import { ACTIONS, Input, type Action, type TouchGesture, type TouchShotStyle } from '../input/Input';

/** Estado de los mandos de un jugador remoto en un paso de simulación (60 por segundo). */
export interface InputFrame {
  /** Acciones mantenidas (bits según el orden de ACTIONS). */
  h: number;
  /** Stick / dirección de movimiento en pantalla. */
  mx: number;
  my: number;
  /** Stick derecho. */
  rx: number;
  ry: number;
  /** Golpe de stick derecho (dirección) o null. */
  rf: [number, number] | null;
  /** Cruceta: mentalidad (−1, 0, +1). */
  pt: -1 | 0 | 1;
  /** Gestos táctiles. */
  g?: TouchGesture[];
  /** Botones de tipo de tiro táctiles (bits chip, finesse, power, low). */
  ts: number;
  /** Magnitud del joystick virtual (0 si no es táctil). */
  vm: number;
  /** Usa mando. */
  gp: boolean;
  /** Base de la cámara del jugador remoto: derecha de su pantalla (x, z). */
  bx: number;
  bz: number;
  /** Fondo de su pantalla (x, z). */
  fx: number;
  fz: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Captura el estado de una entrada local ya sondeada para enviarlo por la red. */
export function captureFrame(input: Input, right: { x: number; z: number }, forward: { x: number; z: number }, neutral = false): InputFrame {
  let h = 0;
  const held = input.heldSet();
  if (!neutral) ACTIONS.forEach((a, i) => { if (held.has(a) && a !== 'pause') h |= 1 << i; });
  const mv = neutral ? { x: 0, y: 0 } : input.move();
  const t = input.touchShot;
  const g = input.drainGestures();
  return {
    h, mx: r2(mv.x), my: r2(mv.y), rx: neutral ? 0 : r2(input.rs.x), ry: neutral ? 0 : r2(input.rs.y),
    rf: !neutral && input.rsFlick ? [r2(input.rsFlick.x), r2(input.rsFlick.y)] : null,
    pt: neutral ? 0 : input.padTactic,
    g: g.length && !neutral ? g : undefined,
    ts: (t.chip ? 1 : 0) | (t.finesse ? 2 : 0) | (t.power ? 4 : 0) | (t.low ? 8 : 0),
    vm: neutral ? 0 : r2(input.virtualMagnitude()), gp: input.usingGamepad, bx: r2(right.x), bz: r2(right.z), fx: r2(forward.x), fz: r2(forward.z),
  };
}

/** Une varios fotogramas en uno sin perder pulsaciones breves (para ponerse al día). */
export function mergeFrames(a: InputFrame, b: InputFrame): InputFrame {
  return {
    ...b,
    h: a.h | b.h,
    rf: b.rf ?? a.rf,
    pt: b.pt || a.pt,
    g: a.g || b.g ? [...(a.g ?? []), ...(b.g ?? [])] : undefined,
  };
}

/**
 * Entrada de un jugador remoto: se alimenta con los fotogramas recibidos y se comporta como un Input
 * normal para el HumanController del anfitrión (pulsado, mantenido, soltado, stick…).
 */
export class RemoteInput extends Input {
  private queue: InputFrame[] = [];
  private last: InputFrame | null = null;
  private mv = { x: 0, y: 0 };
  private vmag = 0;
  private gamepad = false;
  /** Derecha de la pantalla del jugador remoto (para orientar su stick). */
  readonly right = { x: 1, z: 0 };
  readonly forward = { x: 0, z: -1 };
  /** Fotogramas recibidos en total (diagnóstico / pruebas). */
  received = 0;

  constructor() {
    super(undefined, false);
  }

  push(frames: InputFrame[]) {
    this.received += frames.length;
    this.queue.push(...frames);
    // si se acumulan (lag), se funden los más antiguos para ponerse al día sin perder toques
    while (this.queue.length > 6) {
      const a = this.queue.shift()!;
      this.queue[0] = mergeFrames(a, this.queue[0]);
    }
  }

  /** Descarta lo pendiente (tras una pausa: nada de teclas "colgadas"). */
  clear() {
    this.queue.length = 0;
    this.last = null;
  }

  override poll(dt: number) {
    this.time += dt;
    this.prev = this.cur;
    this.cur = new Set<Action>();
    let f = this.queue.shift();
    if (!f) {
      // sin datos nuevos: se mantiene lo último (sin repetir golpes de stick ni gestos)
      f = this.last ? { ...this.last, rf: null, pt: 0, g: undefined } : undefined;
    }
    this.rsFlick = null;
    this.padTactic = 0;
    if (f) {
      this.last = f;
      ACTIONS.forEach((a, i) => { if (f!.h & (1 << i)) this.cur.add(a); });
      this.mv = { x: f.mx, y: f.my };
      this.rs.x = f.rx;
      this.rs.y = f.ry;
      this.rsFlick = f.rf ? { x: f.rf[0], y: f.rf[1] } : null;
      this.padTactic = f.pt;
      if (f.g) for (const g of f.g) this.pushGesture(g);
      const ts: TouchShotStyle = this.touchShot;
      ts.chip = !!(f.ts & 1);
      ts.finesse = !!(f.ts & 2);
      ts.power = !!(f.ts & 4);
      ts.low = !!(f.ts & 8);
      this.vmag = f.vm;
      this.gamepad = f.gp;
      const l = Math.hypot(f.bx, f.bz);
      if (l > 0.5) {
        this.right.x = f.bx / l;
        this.right.z = f.bz / l;
      }
      const lf = Math.hypot(f.fx, f.fz);
      if (lf > 0.5) {
        this.forward.x = f.fx / lf;
        this.forward.z = f.fz / lf;
      }
    }
    this.computeEdges();
  }

  override move() {
    return { ...this.mv };
  }

  override virtualMagnitude() {
    return this.vmag;
  }

  override get usingGamepad() {
    return this.gamepad;
  }
}
