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
  | 'jockey' // Ctrl / LT (L2) — contener (jockey) · en ataque: modificador de tiro POTENTE
  | 'skillUp' | 'skillDown' | 'skillLeft' | 'skillRight' // I/K/J/L o numérico — "stick derecho": regates
  | 'skillSpin' // R / R3 — ruleta
  | 'pause'; // Esc / Start

export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'sprint', 'pass', 'through', 'lob', 'shoot', 'switch', 'finesse', 'jockey', 'skillUp', 'skillDown', 'skillLeft', 'skillRight', 'skillSpin', 'pause'];

export const SKILL_ACTIONS: Action[] = ['skillUp', 'skillDown', 'skillLeft', 'skillRight', 'skillSpin'];

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
  switch: 'Cambiar de jugador · Con balón + Tiro: vaselina',
  finesse: 'Con balón + Tiro: rosca · Presión de compañero (defensa)',
  jockey: 'Contener (defensa) · Con balón + Tiro: tiro potente',
  skillUp: 'Regate ↑ (hacia delante: sombrero)',
  skillDown: 'Regate ↓ (hacia atrás: arrastre)',
  skillLeft: 'Regate ← (bicicleta; dos veces: elástico)',
  skillRight: 'Regate → (bicicleta; dos veces: elástico)',
  skillSpin: 'Ruleta',
  pause: 'Pausa',
};

export type Bindings = Record<Action, string[]>;

/** Teclado clásico FIFA PC: flechas + Q/W/E/A/S/D. */
export const FIFA_CLASSIC: Bindings = {
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
  sprint: ['KeyE'], pass: ['KeyS'], through: ['KeyW'], lob: ['KeyA'], shoot: ['KeyD'],
  switch: ['KeyQ'], finesse: ['ShiftLeft', 'ShiftRight'], jockey: ['ControlLeft', 'KeyC'],
  skillUp: ['KeyI', 'Numpad8'], skillDown: ['KeyK', 'Numpad2'], skillLeft: ['KeyJ', 'Numpad4'], skillRight: ['KeyL', 'Numpad6'],
  skillSpin: ['KeyR', 'Numpad5'], pause: ['Escape', 'KeyP'],
};

/** Alternativo: WASD para moverse y acciones en la mano derecha. */
export const WASD_ALT: Bindings = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  sprint: ['ShiftLeft'], pass: ['KeyK'], through: ['KeyI'], lob: ['KeyJ'], shoot: ['KeyL'],
  switch: ['KeyQ'], finesse: ['KeyO'], jockey: ['KeyU', 'Space'],
  skillUp: ['ArrowUp'], skillDown: ['ArrowDown'], skillLeft: ['ArrowLeft'], skillRight: ['ArrowRight'],
  skillSpin: ['KeyR'], pause: ['Escape', 'KeyP'],
};

/** Botones del mando estándar (W3C standard mapping). */
export const PAD_BUTTONS: Partial<Record<Action, number>> = {
  pass: 0, // A / X(PS)
  shoot: 1, // B / ○
  lob: 2, // X / □
  through: 3, // Y / △
  switch: 4, // LB / L1
  finesse: 5, // RB / R1
  jockey: 6, // LT / L2
  sprint: 7, // RT / R2
  pause: 9, // Start / Options
  skillSpin: 11, // R3 (pulsar el stick derecho)
};

export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'Shift der.',
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl der.', Escape: 'Esc', Space: 'Espacio', Enter: 'Enter',
    Numpad8: 'Num 8', Numpad2: 'Num 2', Numpad4: 'Num 4', Numpad6: 'Num 6', Numpad5: 'Num 5',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** Gesto táctil: dirección en pantalla (x derecha, y arriba). */
export interface TouchGesture {
  type: 'skill' | 'shot';
  dir: { x: number; y: number };
  /** Toque doble en la zona de regates (ruleta). */
  tap?: boolean;
  /** Tipo de tiro elegido con los botones táctiles de tiro (ROSCA, VASELINA, RASO, POTENTE). */
  style?: TouchShotStyle;
}

export interface TouchShotStyle {
  chip: boolean;
  finesse: boolean;
  power: boolean;
  low: boolean;
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

  // --- Gestos táctiles (deslizamientos) ---
  private gestures: TouchGesture[] = [];
  /** Botones táctiles de tipo de tiro pulsados ahora mismo (para la ayuda visual mientras se carga). */
  readonly touchShot: TouchShotStyle = { chip: false, finesse: false, power: false, low: false };

  /** Encola un gesto (regate deslizando, tipo de tiro deslizando sobre TIRO). */
  pushGesture(g: TouchGesture) {
    this.gestures.push(g);
    if (this.gestures.length > 8) this.gestures.shift();
  }

  /** Extrae el gesto pendiente más antiguo de un tipo. */
  takeGesture(type: TouchGesture['type']): TouchGesture | null {
    // el más reciente de ese tipo; los anteriores sin usar (p. ej. un ROBAR en defensa) se descartan
    let found: TouchGesture | null = null;
    this.gestures = this.gestures.filter((g) => {
      if (g.type !== type) return true;
      found = g;
      return false;
    });
    return found;
  }

  // --- Controles táctiles (móvil): botones y joystick virtuales ---
  private virtualHeld = new Set<Action>();
  private virtualTapped = new Set<Action>();
  private virtualAxes = { x: 0, y: 0 };

  /** Pulsa o suelta un botón virtual (pantalla táctil). */
  setVirtual(a: Action, down: boolean) {
    if (down) {
      this.virtualHeld.add(a);
      this.virtualTapped.add(a);
    } else {
      this.virtualHeld.delete(a);
    }
  }

  /** Magnitud del joystick virtual (0..1); 0 si no se usa. */
  virtualMagnitude() {
    return Math.hypot(this.virtualAxes.x, this.virtualAxes.y);
  }

  /** Joystick virtual: x derecha, y arriba, magnitud 0..1. */
  setVirtualAxes(x: number, y: number) {
    this.virtualAxes.x = x;
    this.virtualAxes.y = y;
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
    for (const a of this.virtualHeld) this.cur.add(a);
    for (const a of this.virtualTapped) this.cur.add(a);
    this.virtualTapped.clear();
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
      for (const [a, i] of Object.entries(PAD_BUTTONS)) if (i !== undefined && btn(i)) this.cur.add(a as Action);
      // Stick derecho: cada "golpe" de stick en una dirección es un regate
      const rx = gp.axes[2] ?? 0;
      const ry = gp.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.65) {
        if (Math.abs(rx) > Math.abs(ry)) this.cur.add(rx > 0 ? 'skillRight' : 'skillLeft');
        else this.cur.add(ry > 0 ? 'skillDown' : 'skillUp');
      }
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
    if (Math.hypot(this.virtualAxes.x, this.virtualAxes.y) > 0.12) return { ...this.virtualAxes };
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
