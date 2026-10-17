// Ajuste automático de calidad: mide los FPS reales durante el partido y, si el equipo no llega, baja la
// calidad gráfica un escalón (primero la resolución, luego las sombras). Lógica pura, probada en tests/.

export type QualityStep = 'resolution' | 'shadows';

export interface AutoQualityState {
  resolutionScale: number;
  shadows: boolean;
}

export const AUTO_MIN_SCALE = 0.5;

export class AutoQuality {
  private t = 0;
  private frames = 0;
  private time = 0;
  /** Escalones aplicados en este partido. */
  readonly applied: QualityStep[] = [];

  constructor(
    private state: AutoQualityState,
    private opts = { warmup: 2.5, window: 3, minFps: 40, maxSteps: 4 },
  ) {}

  /** Siguiente escalón posible (o null si ya no queda nada que bajar). */
  nextStep(): QualityStep | null {
    if (this.state.resolutionScale > AUTO_MIN_SCALE + 0.01) return 'resolution';
    if (this.state.shadows) return 'shadows';
    return null;
  }

  /**
   * Un fotograma de `dt` segundos (tiempo real). Devuelve el escalón a aplicar cuando la media de FPS de la
   * última ventana no llega al mínimo; el estado interno ya queda actualizado.
   */
  sample(dt: number): QualityStep | null {
    if (dt <= 0 || dt > 2 || this.applied.length >= this.opts.maxSteps) return null; // pestaña en segundo plano
    this.t += dt;
    if (this.t < this.opts.warmup) return null;
    this.frames++;
    this.time += dt;
    if (this.time < this.opts.window) return null;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (fps >= this.opts.minFps) return null;
    const step = this.nextStep();
    if (!step) return null;
    if (step === 'resolution') {
      const next = Math.round((this.state.resolutionScale - 0.15) * 100) / 100;
      this.state.resolutionScale = next < AUTO_MIN_SCALE + 0.1 ? AUTO_MIN_SCALE : next;
    } else this.state.shadows = false;
    this.applied.push(step);
    // tras un cambio, otro calentamiento corto antes de volver a medir
    this.t = this.opts.warmup - 1;
    return step;
  }

  get resolutionScale() {
    return this.state.resolutionScale;
  }

  get shadows() {
    return this.state.shadows;
  }
}
