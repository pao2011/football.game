/**
 * Grabaciones de la tribuna: gritos de gol reales y un loop de silbidos del público.
 *
 *   - gritos de gol: solo la parte del grito (ya recortada), uno al azar en cada gol; pasan por el
 *     bus del público y por la reverb del estadio, igual que los cánticos.
 *   - silbidos: loop sin costura que entra y sale con fundido mientras el visitante tiene el balón.
 *
 * Se decodifican una vez al empezar el partido; mientras no estén listos (o si el navegador no
 * puede) el motor usa los sonidos sintetizados de siempre.
 */

const FLOOR = 0.0001;

export interface CrowdSampleUrls {
  goals: string[];
  whistles: string;
}

export class CrowdSamples {
  private goals: AudioBuffer[] = [];
  private whistle: AudioBuffer | null = null;
  private lastGoal = -1;
  private whistleSrc: AudioBufferSourceNode | null = null;
  private whistleGain: GainNode | null = null;
  private whistling = false;
  private disposed = false;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private ctx: AudioContext,
    private bus: AudioNode,
    private wet: AudioNode,
    private urls: CrowdSampleUrls,
  ) {
    this.urls.goals.forEach((u, i) => this.load(u).then((b) => { if (b) this.goals[i] = b; }));
    this.load(this.urls.whistles).then((b) => {
      this.whistle = b;
      // se pidió silbar antes de que terminara de cargar
      if (this.whistling) this.setWhistling(true);
    });
  }

  static supported(ctx: BaseAudioContext | null): ctx is AudioContext {
    return !!ctx && typeof (ctx as AudioContext).decodeAudioData === 'function' && typeof fetch === 'function' && typeof (ctx as AudioContext).resume === 'function';
  }

  private load(url: string): Promise<AudioBuffer | null> {
    return fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((ab) => this.ctx.decodeAudioData(ab))
      .catch((e) => {
        if (typeof console !== 'undefined') console.warn('[CrowdSamples]', url.slice(0, 40), e);
        return null;
      });
  }

  /** Grito de gol real. false si todavía no hay ninguno cargado (el motor usa el sintetizado). */
  goal(intensity: number): boolean {
    const ready = this.goals.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    if (this.disposed || !ready.length) return false;
    const pool = ready.length > 1 ? ready.filter((i) => i !== this.lastGoal) : ready;
    const i = pool[Math.floor(Math.random() * pool.length)];
    this.lastGoal = i;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.goals[i];
    const g = ctx.createGain();
    g.gain.value = 0.35 + 0.65 * Math.max(0, Math.min(1, intensity));
    const send = ctx.createGain();
    send.gain.value = 0.3;
    src.connect(g);
    g.connect(this.bus);
    g.connect(send).connect(this.wet);
    src.onended = () => {
      g.disconnect();
      send.disconnect();
    };
    src.start(t);
    return true;
  }

  /** La tribuna silba (true) o deja de hacerlo (false) con fundido. */
  setWhistling(on: boolean, level = 1): void {
    this.whistling = on;
    if (this.disposed) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (on) {
      if (!this.whistle) return; // se retoma al terminar de cargar
      if (this.stopTimer) clearTimeout(this.stopTimer);
      this.stopTimer = null;
      if (!this.whistleSrc) {
        const src = ctx.createBufferSource();
        src.buffer = this.whistle;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.setValueAtTime(FLOOR, t);
        const send = ctx.createGain();
        send.gain.value = 0.25;
        src.connect(g);
        g.connect(this.bus);
        g.connect(send).connect(this.wet);
        // entra por un punto cualquiera del loop: no siempre empieza igual
        src.start(t, Math.random() * (this.whistle.duration - 0.1));
        this.whistleSrc = src;
        this.whistleGain = g;
      }
      const g = this.whistleGain!;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(FLOOR, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(1.5 * Math.max(0.3, level), t + 1.2);
    } else if (this.whistleSrc && this.whistleGain) {
      const g = this.whistleGain;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(FLOOR, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(FLOOR, t + 1.0);
      const src = this.whistleSrc;
      this.stopTimer = setTimeout(() => this.killWhistle(src), 1100);
    }
  }

  private killWhistle(src: AudioBufferSourceNode) {
    if (this.whistleSrc !== src) return;
    try {
      src.stop();
    } catch {
      /* ya parado */
    }
    src.disconnect();
    this.whistleGain?.disconnect();
    this.whistleSrc = null;
    this.whistleGain = null;
  }

  stop(): void {
    this.disposed = true;
    this.whistling = false;
    if (this.stopTimer) clearTimeout(this.stopTimer);
    if (this.whistleSrc) this.killWhistle(this.whistleSrc);
  }
}
