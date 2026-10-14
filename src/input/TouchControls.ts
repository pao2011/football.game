import type { Action, Input, TouchShotStyle } from './Input';

/**
 * Controles táctiles para móvil al estilo de los juegos de fútbol para móvil.
 *
 * - Joystick flotante en la mitad izquierda.
 * - ATAQUE y DEFENSA tienen botones, colores e iconos propios (no se reutilizan las mismas
 *   posiciones con otro texto, que resultaba confuso). Un indicador muestra el modo actual.
 * - Tiros con botones propios: TIRO (normal), ROSCA, VASELINA, RASO y POTENTE disparan directamente;
 *   mantener uno y tocar otro los combina (p. ej. POTENTE + RASO). Deslizar sobre TIRO sigue funcionando.
 * - Sin botón de sprint: con el joystick pasado de la mitad el jugador corre solo.
 * - Regates: deslizar el dedo en la zona libre de la derecha (↑ sombrero, ↓ arrastre,
 *   ← / → bicicleta, diagonal elástico) y doble toque = ruleta. Con el tiro cargado, tocar PASE = amago.
 */

interface ButtonDef {
  action: Action;
  /** Botón de tipo de tiro (dispara con ese efecto). */
  shot?: keyof TouchShotStyle;
  label: string;
  sub?: string;
  icon: string;
  cls: string;
}

// Iconos SVG sencillos (trazos blancos)
const I = {
  ball: '<circle cx="12" cy="12" r="8"/><path d="M12 7l3.5 2.5-1.3 4h-4.4l-1.3-4z"/>',
  shoot: '<path d="M4 18l9-9"/><path d="M13 4h7v7"/><path d="M20 4L10 14"/>',
  pass: '<path d="M4 12h13"/><path d="M13 7l5 5-5 5"/>',
  lob: '<path d="M4 18c3-11 13-11 16 0"/><path d="M17 15l3 3 1-4"/>',
  through: '<path d="M4 18L18 6"/><path d="M11 6h7v7"/><path d="M4 12l3 3"/>',
  power: '<path d="M12 2v6"/><path d="M6.3 5.3a8 8 0 1 0 11.4 0"/>',
  press: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  tackle: '<path d="M5 19l6-6"/><path d="M11 13l3-6 5 2-3 6z"/>',
  slide: '<path d="M3 17h12l4-4"/><path d="M7 13l4-6"/><circle cx="19" cy="9" r="2"/>',
  switch: '<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>',
  team: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 20c1-4 9-4 10 0M11 20c1-4 9-4 10 0"/>',
  keeper: '<path d="M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>',
  contain: '<path d="M12 3l8 4v5c0 5-4 8-8 9-4-1-8-4-8-9V7z"/>',
  finesse: '<path d="M4 19c2-9 9-14 16-14"/><path d="M15 3l5 2-2 5"/>',
  chip: '<path d="M3 19c4-16 14-16 18 0"/><path d="M3 21h18"/>',
  low: '<path d="M3 16h15"/><path d="M14 12l4 4-4 4"/><path d="M3 21h18"/>',
};

const ATTACK: ButtonDef[] = [
  { action: 'shoot', label: 'TIRO', icon: I.shoot, cls: 'tb-a1' },
  { action: 'pass', label: 'PASE', icon: I.pass, cls: 'tb-a2' },
  { action: 'lob', label: 'ELEVADO', sub: 'centro', icon: I.lob, cls: 'tb-a3' },
  { action: 'through', label: 'AL HUECO', icon: I.through, cls: 'tb-a4' },
  { action: 'shoot', shot: 'finesse', label: 'ROSCA', icon: I.finesse, cls: 'tb-s1' },
  { action: 'shoot', shot: 'chip', label: 'VASELINA', icon: I.chip, cls: 'tb-s2' },
  { action: 'shoot', shot: 'low', label: 'RASO', icon: I.low, cls: 'tb-s3' },
  { action: 'shoot', shot: 'power', label: 'POTENTE', icon: I.power, cls: 'tb-s4' },
];

const DEFENSE: ButtonDef[] = [
  { action: 'shoot', label: 'ROBAR', sub: 'entrada', icon: I.tackle, cls: 'tb-d1' },
  { action: 'pass', label: 'PRESIONAR', sub: 'mantener', icon: I.press, cls: 'tb-d2' },
  { action: 'lob', label: 'BARRIDA', icon: I.slide, cls: 'tb-d3' },
  { action: 'switch', label: 'CAMBIAR', sub: 'jugador', icon: I.switch, cls: 'tb-d4' },
  { action: 'finesse', label: 'AYUDA', sub: 'compañero', icon: I.team, cls: 'tb-d6' },
  { action: 'through', label: 'ARQUERO', sub: 'sale', icon: I.keeper, cls: 'tb-d7' },
];

const svg = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

interface Tracked {
  action: Action | null; // botón pulsado (null = zona de regates)
  x0: number;
  y0: number;
  t0: number;
  el?: HTMLElement;
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private tracked = new Map<number, Tracked>();
  private attacking = true;
  private lastTap = 0;
  private readonly radius = 64;
  private modeEl: HTMLElement;
  private skillHint: HTMLElement;
  /** Dedos sobre TIRO o sobre un botón de tipo de tiro. */
  private shootRefs = 0;
  /** Dirección del deslizamiento sobre TIRO en este disparo. */
  private shotSwipe = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private input: Input) {
    const r = document.createElement('div');
    r.className = 'touch-controls mode-attack';
    const btn = (b: ButtonDef) => `<div class="tc-btn ${b.cls}${b.shot ? ' tc-shot' : ''}" data-action="${b.action}"${b.shot ? ` data-shot="${b.shot}"` : ''}>${svg(b.icon)}<b>${b.label}</b>${b.sub ? `<small>${b.sub}</small>` : ''}</div>`;
    r.innerHTML = `
      <div class="tc-stick-zone"></div>
      <div class="tc-skill-zone"><span class="tc-skill-hint">desliza aquí: regate · doble toque: ruleta</span></div>
      <div class="tc-stick hidden"><div class="tc-knob"></div></div>
      <div class="tc-mode"><span class="a">● ATAQUE</span><span class="d">● DEFENSA</span></div>
      <div class="tc-buttons tc-attack">${ATTACK.map(btn).join('')}</div>
      <div class="tc-buttons tc-defense">${DEFENSE.map(btn).join('')}</div>
      <div class="tc-btn tc-pause" data-action="pause"><b>II</b></div>`;
    parent.appendChild(r);
    this.root = r;
    this.stickBase = r.querySelector('.tc-stick') as HTMLDivElement;
    this.stickKnob = r.querySelector('.tc-knob') as HTMLDivElement;
    this.modeEl = r.querySelector('.tc-mode') as HTMLElement;
    this.skillHint = r.querySelector('.tc-skill-hint') as HTMLElement;

    (r.querySelector('.tc-stick-zone') as HTMLElement).addEventListener('pointerdown', (e) => this.stickStart(e));
    (r.querySelector('.tc-skill-zone') as HTMLElement).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.tracked.set(e.pointerId, { action: null, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    });
    r.querySelectorAll<HTMLElement>('.tc-btn').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const a = el.dataset.action as Action;
        this.tracked.set(e.pointerId, { action: a, x0: e.clientX, y0: e.clientY, t0: performance.now(), el });
        el.classList.add('down');
        if (a === 'shoot') {
          // TIRO y los botones de tipo de tiro comparten la misma carga; sus efectos se suman
          const shot = el.dataset.shot as keyof TouchShotStyle | undefined;
          if (shot) this.input.touchShot[shot] = true;
          if (this.shootRefs++ === 0) this.input.setVirtual('shoot', true);
        } else {
          this.input.setVirtual(a, true);
        }
        if (navigator.vibrate) navigator.vibrate(10);
      });
    });
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
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
    const tr = this.tracked.get(e.pointerId);
    if (tr && tr.action === 'shoot' && tr.el && !tr.el.dataset.shot) {
      // vista previa del tipo de tiro mientras se desliza sobre TIRO
      const dx = e.clientX - tr.x0;
      const dy = e.clientY - tr.y0;
      tr.el.classList.toggle('swipe-up', dy < -28);
      tr.el.classList.toggle('swipe-down', dy > 28);
      tr.el.classList.toggle('swipe-side', Math.abs(dx) > 28);
    }
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx *= this.radius / d;
      dy *= this.radius / d;
    }
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
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
    const tr = this.tracked.get(e.pointerId);
    if (!tr) return;
    this.tracked.delete(e.pointerId);
    const dx = e.clientX - tr.x0;
    const dy = e.clientY - tr.y0;
    const len = Math.hypot(dx, dy);
    if (tr.action === null) {
      // zona de regates: deslizar = regate en esa dirección; doble toque = ruleta
      const now = performance.now();
      if (len > 30 && now - tr.t0 < 600) {
        this.input.pushGesture({ type: 'skill', dir: { x: dx / len, y: -dy / len } });
      } else if (len < 14) {
        if (now - this.lastTap < 350) {
          this.input.pushGesture({ type: 'skill', dir: { x: 0, y: 0 }, tap: true });
          this.lastTap = 0;
        } else {
          this.lastTap = now;
        }
      }
      return;
    }
    tr.el?.classList.remove('down', 'swipe-up', 'swipe-down', 'swipe-side');
    if (tr.action === 'shoot') {
      // deslizar sobre TIRO también elige el tipo de disparo
      if (len > 28 && !tr.el?.dataset.shot) this.shotSwipe = { x: dx / len, y: -dy / len };
      if (--this.shootRefs <= 0) {
        this.shootRefs = 0;
        const t = this.input.touchShot;
        // el tipo de tiro viaja con el gesto y se lee al soltar (junto con la potencia)
        this.input.pushGesture({ type: 'shot', dir: this.shotSwipe, style: { ...t } });
        t.chip = t.finesse = t.power = t.low = false;
        this.shotSwipe = { x: 0, y: 0 };
        this.input.setVirtual('shoot', false);
      }
      return;
    }
    this.input.setVirtual(tr.action, false);
  };

  /** Ataque o defensa: cambia de juego de botones (posiciones, colores e iconos propios). */
  setContext(attacking: boolean) {
    if (attacking === this.attacking) return;
    // no cambiar mientras se mantiene pulsado un botón (evita soltar acciones a medias)
    for (const t of this.tracked.values()) if (t.action) return;
    this.attacking = attacking;
    this.root.classList.toggle('mode-attack', attacking);
    this.root.classList.toggle('mode-defense', !attacking);
    this.modeEl.classList.remove('flash');
    void this.modeEl.offsetWidth;
    this.modeEl.classList.add('flash');
    this.skillHint.style.opacity = attacking ? '' : '0';
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  dispose() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    for (const t of this.tracked.values()) if (t.action) this.input.setVirtual(t.action, false);
    const t = this.input.touchShot;
    t.chip = t.finesse = t.power = t.low = false;
    this.input.setVirtualAxes(0, 0);
    this.root.remove();
  }
}
