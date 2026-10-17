/**
 * Cánticos reales de la hinchada (grabaciones en src/assets/chants) sonando "dentro" del estadio.
 *
 * La grabación no se reproduce tal cual encima del juego: pasa por una cadena que la coloca en
 * las tribunas, lejos del micrófono de la transmisión:
 *
 *   <audio> ─> pasa altos ─> pasa bajos (más brillante cuanto más alentada está la gente) ─> nivel
 *     nivel ─> coro (copia con retardo modulado: más gente cantando) ─┐
 *     nivel ─> izquierda / derecha con efecto Haas (anchura de tribuna) ┼─> bus del público
 *     nivel ─> ecos de la tribuna de enfrente (con realimentación) ────┘
 *     nivel ─> reverb del estadio (el convolver del motor)
 *
 * Las canciones se van turnando con pausas cortas; en los goles y en el recibimiento la hinchada
 * canta más fuerte. Si el navegador no puede (Node, contexto offline) no hace nada.
 */

const FLOOR = 0.0001;

export interface ChantTrack {
  name: string;
  url: string;
}

export class StadiumChants {
  private el: HTMLAudioElement | null = null;
  private level: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private nodes: AudioNode[] = [];
  private lfos: OscillatorNode[] = [];
  private order: number[] = [];
  private current = -1;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private blobs = new Map<string, Promise<string>>();
  private excitement = 0;
  private boostUntil = 0;
  private boostAmt = 0;
  private appliedExcitement = -1;
  private appliedBoost = false;
  private running = false;

  constructor(
    private ctx: AudioContext,
    private tracks: ChantTrack[],
    private crowdBus: AudioNode,
    private crowdWet: AudioNode,
  ) {}

  /** ¿Puede sonar en este entorno? */
  static supported(ctx: BaseAudioContext | null): ctx is AudioContext {
    return !!ctx && typeof (ctx as AudioContext).createMediaElementSource === 'function' && typeof Audio === 'function';
  }

  get playing(): boolean {
    return !!this.el && !this.el.paused;
  }

  start(delay = 1.2): void {
    if (this.running || !this.tracks.length) return;
    this.running = true;
    this.build();
    this.level!.gain.setValueAtTime(FLOOR, this.ctx.currentTime);
    this.queue(delay);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.gapTimer) clearTimeout(this.gapTimer);
    this.gapTimer = null;
    const t = this.ctx.currentTime;
    const el = this.el;
    const lv = this.level;
    if (lv) {
      lv.gain.cancelScheduledValues(t);
      lv.gain.setValueAtTime(Math.max(FLOOR, lv.gain.value), t);
      lv.gain.exponentialRampToValueAtTime(FLOOR, t + 1.2);
    }
    const nodes = this.nodes;
    const lfos = this.lfos;
    this.el = null;
    this.level = null;
    this.tone = null;
    this.nodes = [];
    this.lfos = [];
    setTimeout(() => {
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
      for (const o of lfos) {
        try {
          o.stop();
        } catch {
          /* ya parado */
        }
      }
      for (const n of nodes) n.disconnect();
    }, 1300);
  }

  /** Se llama en cada fotograma: solo retoca el nivel cuando cambia algo audible. */
  setExcitement(x: number): void {
    this.excitement = x;
    const boosted = this.ctx.currentTime < this.boostUntil;
    if (Math.abs(x - this.appliedExcitement) < 0.03 && boosted === this.appliedBoost) return;
    this.applyLevel(1.5);
  }

  /** La hinchada canta más fuerte (gol, recibimiento). Si estaba en pausa, arranca otra canción ya. */
  boost(amount: number): void {
    if (!this.running) return;
    this.boostAmt = Math.max(0, Math.min(1, amount));
    this.boostUntil = this.ctx.currentTime + 25;
    if (!this.playing) {
      if (this.gapTimer) clearTimeout(this.gapTimer);
      this.gapTimer = null;
      this.next();
    } else {
      this.applyLevel(0.8);
    }
  }

  private targetLevel(): number {
    const boosted = this.ctx.currentTime < this.boostUntil ? this.boostAmt : 0;
    return Math.min(1.25, 0.5 + 0.4 * this.excitement + 0.45 * boosted);
  }

  private applyLevel(tc: number): void {
    const lv = this.level;
    if (!lv || !this.playing) return;
    const t = this.ctx.currentTime;
    this.appliedExcitement = this.excitement;
    this.appliedBoost = t < this.boostUntil;
    lv.gain.cancelScheduledValues(t);
    lv.gain.setTargetAtTime(this.targetLevel(), t, tc);
    // con la tribuna encendida se oyen más los agudos de las voces
    this.tone?.frequency.setTargetAtTime(2600 + 3200 * Math.min(1, this.excitement + 0.5 * (t < this.boostUntil ? this.boostAmt : 0)), t, tc);
  }

  private build(): void {
    const ctx = this.ctx;
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.addEventListener('ended', () => this.onEnded());
    el.addEventListener('error', () => this.onEnded());
    this.el = el;
    const n = <T extends AudioNode>(node: T): T => {
      this.nodes.push(node);
      return node;
    };
    const filter = (type: BiquadFilterType, f: number, q: number, gain = 0) => {
      const b = n(ctx.createBiquadFilter());
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      b.gain.value = gain;
      return b;
    };
    const gain = (v: number) => {
      const g = n(ctx.createGain());
      g.gain.value = v;
      return g;
    };
    const pan = (v: number) => {
      const p = n(ctx.createStereoPanner());
      p.pan.value = v;
      return p;
    };
    const delay = (s: number, max = 1) => {
      const d = n(ctx.createDelay(max));
      d.delayTime.value = s;
      return d;
    };
    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = gain(depth);
      o.connect(g).connect(target);
      o.start();
      this.lfos.push(o);
    };

    const src = n(ctx.createMediaElementSource(el));
    // micrófono de ambiente lejano: sin graves de estudio, voces algo apagadas
    const hp = filter('highpass', 140, 0.6);
    const body = filter('peaking', 380, 0.8, 2.5);
    const presence = filter('peaking', 3000, 1, -3);
    const tone = filter('lowpass', 3600, 0.5);
    this.tone = tone;
    const level = gain(FLOOR);
    this.level = level;
    // el viento y la distancia hacen que el canto "respire"
    const sway = gain(1);
    lfo(0.07, 0.07, sway.gain);
    src.connect(hp).connect(body).connect(presence).connect(tone).connect(sway).connect(level);

    // anchura de tribuna: la misma grabación a izquierda y derecha con unos ms de diferencia
    level.connect(gain(0.5)).connect(pan(-0.7)).connect(this.crowdBus);
    level.connect(delay(0.017)).connect(gain(0.5)).connect(pan(0.7)).connect(this.crowdBus);
    // coro: copia con retardo que oscila un poco (más gente, voces que no van del todo a tiempo)
    const ch = delay(0.032);
    lfo(0.23, 0.004, ch.delayTime);
    level.connect(ch).connect(filter('lowpass', 2400, 0.5)).connect(gain(0.28)).connect(pan(0.15)).connect(this.crowdBus);
    // eco que vuelve de la tribuna de enfrente, más oscuro en cada rebote
    const echo = delay(0.34);
    const echoTone = filter('lowpass', 1500, 0.5);
    const fb = gain(0.3);
    level.connect(echo).connect(echoTone).connect(fb).connect(echo);
    echoTone.connect(gain(0.22)).connect(pan(-0.35)).connect(this.crowdBus);
    const slap = delay(0.11);
    level.connect(slap).connect(filter('lowpass', 2200, 0.5)).connect(gain(0.16)).connect(pan(0.45)).connect(this.crowdBus);
    // reverb del estadio (cubierta y gradas)
    level.connect(gain(0.95)).connect(this.crowdWet);
  }

  private queue(delaySec: number): void {
    if (this.gapTimer) clearTimeout(this.gapTimer);
    this.gapTimer = setTimeout(() => {
      this.gapTimer = null;
      this.next();
    }, delaySec * 1000);
  }

  private onEnded(): void {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    this.level?.gain.setTargetAtTime(FLOOR, t, 0.4);
    // breve pausa de murmullo entre canción y canción (más corta con el partido caliente)
    this.queue(3 + Math.random() * 7 * (1 - 0.6 * this.excitement));
  }

  private nextIndex(): number {
    if (!this.order.length) {
      this.order = this.tracks.map((_, i) => i).sort(() => Math.random() - 0.5);
      // no repetir la misma canción seguida al rebarajar
      if (this.order.length > 1 && this.order[0] === this.current) this.order.push(this.order.shift()!);
    }
    return this.order.shift()!;
  }

  private next(): void {
    const el = this.el;
    if (!this.running || !el) return;
    const i = this.nextIndex();
    this.current = i;
    this.blobUrl(this.tracks[i].url)
      .then((url) => {
        if (!this.running || this.el !== el) return;
        el.src = url;
        // empezar en un punto al azar de la canción, como si ya la estuvieran cantando
        const begin = () => {
          if (Number.isFinite(el.duration) && el.duration > 40 && Math.random() < 0.5) el.currentTime = Math.random() * (el.duration * 0.4);
        };
        if (el.readyState >= 1) begin();
        else el.addEventListener('loadedmetadata', begin, { once: true });
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => this.queue(4));
        const t = this.ctx.currentTime;
        const lv = this.level!;
        lv.gain.cancelScheduledValues(t);
        lv.gain.setValueAtTime(Math.max(FLOOR, lv.gain.value), t);
        lv.gain.exponentialRampToValueAtTime(this.targetLevel(), t + 2.5);
        this.tone?.frequency.setTargetAtTime(2600 + 3200 * this.excitement, t, 1);
      })
      .catch(() => this.queue(6));
  }

  /**
   * El audio se carga como blob local: así sirve igual desde un servidor, un data: URI (juego
   * en un solo archivo) o la app de Android, y la Web Audio API puede procesarlo sin restricciones.
   */
  private blobUrl(url: string): Promise<string> {
    let p = this.blobs.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        })
        .then((b) => URL.createObjectURL(b));
      p.catch(() => this.blobs.delete(url));
      this.blobs.set(url, p);
    }
    return p;
  }
}
