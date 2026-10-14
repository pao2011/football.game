import type { AudioEngine } from '../audio/AudioEngine';
import { activePad, dpad, padButton } from '../input/pads';

/** Utilidades DOM para las pantallas de menú (navegación por teclado, ratón y mando). */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export type Handlers = Record<string, (target: HTMLElement) => void>;

/**
 * Pantalla con elementos navegables. Los elementos con [data-act] ejecutan el manejador asociado.
 */
export class Screen {
  readonly root: HTMLDivElement;
  private focusIdx = 0;
  private keyHandler: (e: KeyboardEvent) => void;
  private padTimer = 0;
  private padPrev: boolean[] = [];
  onBack: (() => void) | null = null;

  constructor(parent: HTMLElement, html: string, private handlers: Handlers, private audio?: AudioEngine, cls = '') {
    this.root = el('div', `screen ${cls}`, html);
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t || (t as HTMLButtonElement).disabled) return;
      this.audio?.uiClick();
      const h = this.handlers[t.dataset.act!];
      if (h) h(t);
    });
    this.root.addEventListener('mouseover', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      const items = this.items();
      const i = items.indexOf(t);
      if (i >= 0 && i !== this.focusIdx) {
        this.focusIdx = i;
        this.applyFocus();
        this.audio?.uiHover();
      }
    });
    this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
    this.applyFocus();
    this.pollPad();
  }

  /** Elementos navegables visibles. */
  items(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>('[data-act]')).filter((e) => e.offsetParent !== null && !(e as HTMLButtonElement).disabled && !e.dataset.nofocus);
  }

  applyFocus() {
    const items = this.items();
    items.forEach((e, i) => e.classList.toggle('focus', i === this.focusIdx));
    const f = items[this.focusIdx];
    if (f) f.scrollIntoView({ block: 'nearest' });
  }

  refresh(html: string) {
    this.root.innerHTML = html;
    const n = this.items().length;
    if (this.focusIdx >= n) this.focusIdx = Math.max(0, n - 1);
    this.applyFocus();
  }

  private move(delta: number) {
    const n = this.items().length;
    if (!n) return;
    this.focusIdx = (this.focusIdx + delta + n) % n;
    this.applyFocus();
    this.audio?.uiHover();
  }

  private activate(alt = '') {
    const f = this.items()[this.focusIdx];
    if (!f) return;
    // flechas laterales sobre un selector: data-left / data-right
    const act = alt ? f.dataset[alt] : f.dataset.act;
    if (!act) return;
    this.audio?.uiClick();
    this.handlers[act]?.(f);
  }

  private onKey(e: KeyboardEvent) {
    if ((window as any).__captureKey) return;
    switch (e.code) {
      case 'ArrowDown': case 'KeyS': if (e.code === 'KeyS') { this.activate(); break; } this.move(1); break;
      case 'ArrowUp': this.move(-1); break;
      case 'ArrowLeft': this.activate('left'); break;
      case 'ArrowRight': this.activate('right'); break;
      case 'Enter': case 'Space': this.activate(); break;
      case 'Escape': case 'Backspace':
        if (this.onBack) { this.audio?.uiBack(); this.onBack(); }
        break;
      default: return;
    }
    e.preventDefault();
  }

  private pollPad() {
    const read = (gp: Gamepad) => {
      const d = dpad(gp);
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      return [d.up || ay < -0.6, d.down || ay > 0.6, d.left || ax < -0.6, d.right || ax > 0.6, padButton(gp, 0), padButton(gp, 1)];
    };
    // lo que ya estaba pulsado al abrir esta pantalla no cuenta (evita saltarse pantallas al mantener A)
    const first = activePad();
    if (first) this.padPrev = read(first);
    const tick = () => {
      if (!this.root.isConnected) return;
      const gp = activePad();
      if (gp) {
        const now = read(gp);
        const edge = (i: number) => now[i] && !this.padPrev[i];
        if (edge(0)) this.move(-1);
        if (edge(1)) this.move(1);
        if (edge(2)) this.activate('left');
        if (edge(3)) this.activate('right');
        if (edge(4)) this.activate();
        if (edge(5) && this.onBack) this.onBack();
        this.padPrev = now;
      }
      this.padTimer = requestAnimationFrame(tick);
    };
    this.padTimer = requestAnimationFrame(tick);
  }

  dispose() {
    window.removeEventListener('keydown', this.keyHandler);
    cancelAnimationFrame(this.padTimer);
    this.root.remove();
  }
}
