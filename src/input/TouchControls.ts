import type { Action, Input } from './Input';

/**
 * Controles táctiles para móvil al estilo de los juegos de fútbol para móvil:
 * joystick flotante a la izquierda y botones de acción a la derecha.
 * Los botones envían las mismas acciones lógicas que el teclado/mando (S, D, A, W, E, Q, Shift),
 * por lo que la jugabilidad (barra de potencia, defensa, balón parado) es idéntica.
 */

interface ButtonDef {
  action: Action;
  attack: string;
  defense: string;
  cls: string;
}

const BUTTONS: ButtonDef[] = [
  { action: 'shoot', attack: 'TIRO', defense: 'ENTRADA', cls: 'tb-shoot' },
  { action: 'pass', attack: 'PASE', defense: 'PRESIÓN', cls: 'tb-pass' },
  { action: 'lob', attack: 'ELEVADO', defense: 'BARRIDA', cls: 'tb-lob' },
  { action: 'through', attack: 'AL HUECO', defense: 'ARQUERO', cls: 'tb-through' },
  { action: 'sprint', attack: 'SPRINT', defense: 'SPRINT', cls: 'tb-sprint' },
  { action: 'finesse', attack: 'ROSCA', defense: 'AYUDA', cls: 'tb-finesse' },
  { action: 'switch', attack: 'CAMBIAR', defense: 'CAMBIAR', cls: 'tb-switch' },
];

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private buttonEls: { def: ButtonDef; el: HTMLElement }[] = [];
  private pointerToAction = new Map<number, Action>();
  private attacking = true;
  private readonly radius = 64;

  constructor(parent: HTMLElement, private input: Input) {
    const r = document.createElement('div');
    r.className = 'touch-controls';
    r.innerHTML = `
      <div class="tc-stick-zone"></div>
      <div class="tc-stick hidden"><div class="tc-knob"></div></div>
      <div class="tc-buttons">${BUTTONS.map((b) => `<div class="tc-btn ${b.cls}" data-action="${b.action}"><span>${b.attack}</span></div>`).join('')}</div>
      <div class="tc-btn tc-pause" data-action="pause"><span>II</span></div>`;
    parent.appendChild(r);
    this.root = r;
    this.stickBase = r.querySelector('.tc-stick') as HTMLDivElement;
    this.stickKnob = r.querySelector('.tc-knob') as HTMLDivElement;
    for (const def of BUTTONS) {
      const el = r.querySelector(`[data-action="${def.action}"]`) as HTMLElement;
      this.buttonEls.push({ def, el });
    }

    const zone = r.querySelector('.tc-stick-zone') as HTMLElement;
    zone.addEventListener('pointerdown', (e) => this.stickStart(e));
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);

    r.querySelectorAll<HTMLElement>('.tc-btn').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const a = el.dataset.action as Action;
        this.pointerToAction.set(e.pointerId, a);
        el.classList.add('down');
        this.input.setVirtual(a, true);
        if (navigator.vibrate) navigator.vibrate(12);
      });
    });
    r.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private stickStart(e: PointerEvent) {
    e.preventDefault();
    if (this.stickId !== null) return;
    this.stickId = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.stickBase.style.left = `${e.clientX}px`;
    this.stickBase.style.top = `${e.clientY}px`;
    this.stickBase.classList.remove('hidden');
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx *= this.radius / d;
      dy *= this.radius / d;
    }
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // magnitud con zona muerta pequeña; y hacia arriba positiva
    const mag = Math.min(1, d / this.radius);
    const k = mag < 0.15 ? 0 : ((mag - 0.15) / 0.85) / Math.max(mag, 1e-6);
    this.input.setVirtualAxes((dx / this.radius) * k, (-dy / this.radius) * k);
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stickBase.classList.add('hidden');
      this.input.setVirtualAxes(0, 0);
    }
    const a = this.pointerToAction.get(e.pointerId);
    if (a) {
      this.pointerToAction.delete(e.pointerId);
      this.input.setVirtual(a, false);
      this.root.querySelector(`[data-action="${a}"]`)?.classList.remove('down');
    }
  };

  /** Cambia las etiquetas según el equipo del jugador tenga o no el balón. */
  setContext(attacking: boolean) {
    if (attacking === this.attacking) return;
    this.attacking = attacking;
    for (const { def, el } of this.buttonEls) {
      (el.firstElementChild as HTMLElement).textContent = attacking ? def.attack : def.defense;
      el.classList.toggle('def', !attacking);
    }
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  dispose() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    for (const a of this.pointerToAction.values()) this.input.setVirtual(a, false);
    this.input.setVirtualAxes(0, 0);
    this.root.remove();
  }
}
