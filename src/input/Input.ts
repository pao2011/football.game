// Sistema de entrada: teclado + mando (Gamepad API), con asignaciones configurables.
// Esquema por defecto idéntico al clásico de FIFA para PC (teclado) y al de mando Xbox/PlayStation.

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'sprint' // E  / RT (R2)
  | 'pass' // S  / A (X)   — pase corto, cabezazo / presionar
  | 'through' // W  / Y (△)   — pase al hueco / salida del arquero
  | 'lob' // A  / X (□)   — pase elevado, centro / barrida
  | 'shoot' // D  / B (○)   — tiro, volea, cabezazo / entrada
  | 'switch' // Q  / LB (L1) — cambiar de jugador
  | 'finesse' // Shift / RB (R1) — tiro colocado (rosca) / presión de compañero
  | 'jockey' // Ctrl / LT (L2) — contener (jockey)
  | 'pause'; // Esc / Start

export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'sprint', 'pass', 'through', 'lob', 'shoot', 'switch', 'finesse', 'jockey', 'pause'];

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Mover arriba',
  down: 'Mover abajo',
  left: 'Mover izquierda',
  right: 'Mover derecha',
  sprint: 'Sprint',
  pass: 'Pase corto / Cabezazo · Presionar (defensa)',
  through: 'Pase al hueco · Salida del arquero (defensa)',
  lob: 'Pase elevado / Centro · Barrida (defensa)',
  shoot: 'Tiro / Volea · Entrada (defensa)',
  switch: 'Cambiar de jugador',
  finesse: 'Modificador: tiro colocado · Presión de compañero',
  jockey: 'Contener (jockey)',
  pause: 'Pausa',
};

export type Bindings = Record<Action, string[]>;

/** Teclado clásico FIFA PC: flechas + Q/W/E/A/S/D. */
export const FIFA_CLASSIC: Bindings = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  sprint: ['KeyE'], pass: ['KeyS'], through: ['KeyW'], lob: ['KeyA'], shoot: ['KeyD'],
  switch: ['KeyQ'], finesse: ['ShiftLeft', 'ShiftRight'], jockey: ['ControlLeft', 'KeyC'], pause: ['Escape', 'KeyP'],
};

/** Alternativo: WASD para moverse y acciones en la mano derecha. */
export const WASD_ALT: Bindings = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  sprint: ['ShiftLeft'], pass: ['KeyK'], through: ['KeyI'], lob: ['KeyJ'], shoot: ['KeyL'],
  switch: ['KeyQ'], finesse: ['KeyO'], jockey: ['KeyU', 'Space'], pause: ['Escape', 'KeyP'],
};

/** Botones del mando estándar (W3C standard mapping). */
export const PAD_BUTTONS: Record<Exclude<Action, 'up' | 'down' | 'left' | 'right'>, number> = {
  pass: 0, // A / X(PS)
  shoot: 1, // B / ○
  lob: 2, // X / □
  through: 3, // Y / △
  switch: 4, // LB / L1
  finesse: 5, // RB / R1
  jockey: 6, // LT / L2
  sprint: 7, // RT / R2
  pause: 9, // Start / Options
};

export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'Shift der.',
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl der.', Escape: 'Esc', Space: 'Espacio', Enter: 'Enter',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export interface InputSettings {
  deadzone: number; // 0.05..0.4
  sensitivity: number; // 0.5..1.5 (curva de respuesta del stick)
}

export class Input {
  bindings: Bindings;
  settings: InputSettings = { deadzone: 0.18, sensitivity: 1 };
  private keys = new Set<string>();
  /** Teclas pulsadas desde el último sondeo (para no perder toques muy breves). */
  private tapped = new Set<string>();
  private prev = new Set<Action>();
  private cur = new Set<Action>();
  private holdStart = new Map<Action, number>();
  private justPressed = new Set<Action>();
  private justReleased = new Map<Action, number>(); // acción -> duración pulsada
  private padAxes = { x: 0, y: 0 };
  private padActive = false;
  /** Callback de captura para reasignar teclas. */
  captureNext: ((code: string) => void) | null = null;
  private time = 0;
  private listeners: [string, EventListener][] = [];

  constructor(bindings: Bindings = FIFA_CLASSIC) {
    this.bindings = structuredClone(bindings);
    if (typeof window !== 'undefined') {
      const down = (e: Event) => {
        const ke = e as KeyboardEvent;
        if (this.captureNext) {
          ke.preventDefault();
          const cb = this.captureNext;
          this.captureNext = null;
          cb(ke.code);
          return;
        }
        this.keys.add(ke.code);
        this.tapped.add(ke.code);
        if (this.isBound(ke.code)) ke.preventDefault();
      };
      const up = (e: Event) => this.keys.delete((e as KeyboardEvent).code);
      const blur = () => this.keys.clear();
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      window.addEventListener('blur', blur);
      this.listeners.push(['keydown', down], ['keyup', up], ['blur', blur]);
    }
  }

  private isBound(code: string) {
    for (const a of ACTIONS) if (this.bindings[a].includes(code)) return true;
    return false;
  }

  dispose() {
    for (const [t, l] of this.listeners) window.removeEventListener(t, l);
  }

  /** Simulación de teclas (pruebas automáticas). */
  setKey(code: string, down: boolean) {
    if (down) { this.keys.add(code); this.tapped.add(code); } else this.keys.delete(code);
  }

  /** Lee el estado actual. Llamar una vez por fotograma de juego. */
  poll(dt: number) {
    this.time += dt;
    this.prev = this.cur;
    this.cur = new Set();
    for (const a of ACTIONS) {
      if (this.bindings[a].some((k) => this.keys.has(k) || this.tapped.has(k))) this.cur.add(a);
    }
    this.tapped.clear();
    // Mando
    this.padActive = false;
    this.padAxes.x = 0;
    this.padAxes.y = 0;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      const mag = Math.hypot(ax, ay);
      if (mag > this.settings.deadzone) {
        const k = Math.min(1, Math.pow((mag - this.settings.deadzone) / (1 - this.settings.deadzone), 1 / this.settings.sensitivity)) / mag;
        this.padAxes.x = ax * k;
        this.padAxes.y = -ay * k;
        this.padActive = true;
      }
      const btn = (i: number) => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4);
      for (const [a, i] of Object.entries(PAD_BUTTONS)) if (btn(i)) this.cur.add(a as Action);
      if (btn(12)) this.cur.add('up');
      if (btn(13)) this.cur.add('down');
      if (btn(14)) this.cur.add('left');
      if (btn(15)) this.cur.add('right');
      break;
    }
    this.justPressed.clear();
    this.justReleased.clear();
    for (const a of this.cur) {
      if (!this.prev.has(a)) {
        this.justPressed.add(a);
        this.holdStart.set(a, this.time);
      }
    }
    for (const a of this.prev) {
      if (!this.cur.has(a)) this.justReleased.set(a, this.time - (this.holdStart.get(a) ?? this.time));
    }
  }

  held(a: Action) {
    return this.cur.has(a);
  }

  pressed(a: Action) {
    return this.justPressed.has(a);
  }

  /** Devuelve la duración de la pulsación si se soltó en este fotograma, o -1. */
  released(a: Action): number {
    return this.justReleased.get(a) ?? -1;
  }

  holdTime(a: Action) {
    return this.cur.has(a) ? this.time - (this.holdStart.get(a) ?? this.time) : 0;
  }

  /** Vector de movimiento en pantalla (x derecha, y arriba), magnitud 0..1. */
  move(): { x: number; y: number } {
    if (this.padActive) return { ...this.padAxes };
    let x = 0;
    let y = 0;
    if (this.cur.has('left')) x -= 1;
    if (this.cur.has('right')) x += 1;
    if (this.cur.has('up')) y += 1;
    if (this.cur.has('down')) y -= 1;
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  get usingGamepad() {
    return this.padActive;
  }

  /** Cualquier tecla/botón de "aceptar" (para menús y pantallas de título). */
  anyConfirm(): boolean {
    return this.justPressed.has('pass') || this.justPressed.has('shoot');
  }
}
