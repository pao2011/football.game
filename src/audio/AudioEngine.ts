/**
 * AudioEngine — fully procedural Web Audio engine (no sample files).
 *
 * Every sound (SFX, crowd, music) is synthesized at runtime from oscillators,
 * cached noise buffers and filters, so all output is original / royalty-free.
 *
 * Graph:
 *   musicBus ─┐
 *   sfxBus ───┼─> master ─> trim ─> glue compressor ─> limiter ─> soft-clip shaper ─> destination
 *   crowdBus ─┘      ^
 *   sfxWet / crowdWet ─> convolver (generated stadium impulse) ─> lowpass ─┘
 *
 * All public methods are safe no-ops before unlock(), in Node, or when the
 * Web Audio API is unavailable. An optional BaseAudioContext (for example an
 * OfflineAudioContext) can be injected for offline rendering / tests.
 */

import { StadiumChants, type ChantTrack } from './StadiumChants';

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  crowd: number;
}

type NoiseKind = 'white' | 'pink' | 'brown';
type BusKind = 'sfx' | 'crowd';
type Vowel = 'a' | 'o' | 'u' | 'e' | 'aw';

interface Voice {
  end: number;
  gain: GainNode;
}

interface Graph {
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  crowd: GainNode;
  sfxWet: GainNode;
  crowdWet: GainNode;
  output: AudioNode;
}

interface Ambience {
  out: GainNode;
  tone: BiquadFilterNode;
  murmur: GainNode;
  babble: GainNode;
  swell: GainNode;
  sources: AudioScheduledSourceNode[];
  timer: ReturnType<typeof setInterval> | null;
  nextChant: number;
  /** Bombos de la barra brava: inicio del próximo compás y número de compás. */
  nextBar: number;
  bar: number;
}

interface MusicNodes {
  input: GainNode; // fade gain
  delayIn: GainNode;
  guitarIn: GainNode;
  drums: GainNode;
}

interface ClusterOpts {
  t: number;
  dur: number;
  count: number;
  /** [timeOffset, Hz] pitch automation points */
  pitch: Array<[number, number]>;
  /** random per-voice spread in semitones */
  spread: number;
  /** [timeOffset, vowel] formant automation points */
  vowels: Array<[number, Vowel]>;
  /** [timeOffset, gain] amplitude automation points */
  env: Array<[number, number]>;
  noise: number;
  out: AudioNode;
  wet?: AudioNode;
  wetAmount?: number;
  lowpass?: number;
}

const FORMANTS: Record<Vowel, [number, number, number]> = {
  a: [800, 1200, 2500],
  o: [500, 850, 2400],
  u: [330, 800, 2300],
  e: [450, 1800, 2550],
  aw: [620, 960, 2450],
};
const FORMANT_GAIN = [1, 0.55, 0.22];
const FORMANT_Q = [5, 7, 9];

const MAX_VOICES: Record<BusKind, number> = { sfx: 20, crowd: 8 };
const FLOOR = 0.0001;

// ---------- music data (original composition) ----------
const BPM = 124;
const STEP = 60 / BPM / 4; // 16th note
/** chord progression: bass root (MIDI) + pad voicing (MIDI) */
const PROG: Array<{ bass: number; pad: number[] }> = [
  { bass: 33, pad: [57, 60, 64] }, // Am
  { bass: 29, pad: [57, 60, 65] }, // F
  { bass: 36, pad: [55, 60, 64] }, // C
  { bass: 31, pad: [55, 59, 62] }, // G
];
/** lead melody: per bar, [step, midi, lengthInSteps] */
const MELODY: Array<Array<[number, number, number]>> = [
  [[0, 76, 2], [3, 76, 1], [4, 74, 1], [6, 72, 2], [8, 74, 2], [10, 76, 2], [12, 69, 4]],
  [[0, 72, 2], [2, 72, 1], [4, 74, 2], [6, 76, 2], [8, 77, 3], [12, 76, 2], [14, 74, 2]],
  [[0, 72, 3], [3, 67, 1], [4, 72, 2], [6, 74, 2], [8, 76, 4], [12, 79, 4]],
  [[0, 79, 2], [2, 77, 2], [4, 76, 2], [6, 74, 2], [8, 71, 4], [12, 74, 4]],
  [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 74, 1], [7, 76, 3], [10, 72, 2], [12, 69, 4]],
  [[0, 77, 2], [2, 76, 2], [4, 77, 2], [6, 79, 2], [8, 81, 4], [12, 77, 4]],
  [[0, 79, 3], [3, 76, 1], [4, 79, 2], [6, 84, 2], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
  [[0, 74, 2], [2, 76, 2], [4, 79, 2], [6, 83, 2], [8, 81, 8]],
];
const BASS_PATTERN = [0, 0, 12, 0, 0, 12, 7, 12];
const INTRO_BARS = 4;

/** crowd chants: [beatOffset, semitones, beats, vowel] */
const CHANTS: Array<Array<[number, number, number, Vowel]>> = [
  [[0, 0, 1, 'o'], [1, 3, 1, 'e'], [2, 5, 2, 'o'], [4, 3, 1, 'e'], [5, 0, 2, 'o']],
  [[0, 5, 0.5, 'a'], [0.5, 5, 0.5, 'a'], [1, 7, 1, 'e'], [2, 5, 1, 'o'], [3, 3, 1, 'e'], [4, 0, 2, 'o']],
  [[0, 0, 1.5, 'o'], [1.5, 0, 0.5, 'e'], [2, 3, 1, 'a'], [3, 0, 1, 'o'], [4, 0, 1.5, 'o'], [5.5, -2, 0.5, 'e'], [6, 0, 2, 'a']],
  // "o-lé, o-lé, o-lé, o-lé"
  [[0, 0, 0.5, 'o'], [0.5, 4, 1.5, 'e'], [2, 0, 0.5, 'o'], [2.5, 4, 1.5, 'e'], [4, 0, 0.5, 'o'], [4.5, 4, 1, 'e'], [5.5, 2, 0.5, 'o'], [6, 0, 2, 'e']],
  // "da-le, da-le, da-le…" (estilo tribuna sudamericana)
  [[0, 7, 0.5, 'a'], [0.5, 5, 0.5, 'e'], [1, 7, 0.5, 'a'], [1.5, 5, 0.5, 'e'], [2, 4, 1, 'o'], [3, 2, 1, 'o'], [4, 0, 2, 'o'], [6, 2, 0.5, 'a'], [6.5, 4, 1.5, 'e']],
  // "oh oh oh oh, oh oh oh" ascendente
  [[0, 0, 1, 'o'], [1, 0, 1, 'o'], [2, 3, 1, 'o'], [3, 5, 1, 'o'], [4, 7, 1.5, 'o'], [5.5, 5, 0.5, 'o'], [6, 3, 2, 'o']],
];

/** Pulso de la batería de la barra (s por tiempo, ~143 ppm): coincide con el salto de la barra en la grada. */
const BARRA_BEAT = 0.42;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

function getAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
  return w.AudioContext || w.webkitAudioContext || null;
}

export class AudioEngine {
  /**
   * How far ahead (seconds) the music sequencer schedules notes. Increase for
   * offline rendering (an OfflineAudioContext doesn't advance until rendered).
   */
  musicLookahead = 0.15;

  private ctx: BaseAudioContext | null = null;
  private readonly injected: boolean;
  private unlocked = false;
  private disposed = false;
  private g: Graph | null = null;
  private vols: AudioVolumes = { master: 0.8, music: 0.6, sfx: 0.9, crowd: 0.8 };
  private noiseBufs: Partial<Record<NoiseKind, AudioBuffer>> = {};
  private applauseBuf: AudioBuffer | null = null;
  private voices: Record<BusKind, Voice[]> = { sfx: [], crowd: [] };

  private amb: Ambience | null = null;
  /** Cánticos grabados: si hay, sustituyen a los cánticos y bombos sintetizados. */
  private chantTracks: ChantTrack[] = [];
  private real: StadiumChants | null = null;
  private roll: { src: AudioBufferSourceNode; bp: BiquadFilterNode; gain: GainNode } | null = null;
  private excitement = 0;

  private mus: MusicNodes | null = null;
  private musicOn = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private musicNext = 0;

  constructor(ctx?: BaseAudioContext) {
    this.injected = !!ctx;
    if (ctx) {
      this.ctx = ctx;
      this.safe(() => this.buildGraph());
    }
  }

  /** The underlying context (null until unlocked / unavailable). */
  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  /** Final output node (before destination) — useful for taps/analysers. */
  get outputNode(): AudioNode | null {
    return this.g ? this.g.output : null;
  }

  get isUnlocked(): boolean {
    return this.unlocked && !!this.g;
  }

  // ======================================================================
  // lifecycle
  // ======================================================================

  /** Must be called from a user gesture; safe to call multiple times. */
  unlock(): void {
    if (this.disposed) return;
    this.safe(() => {
      if (!this.ctx) {
        const Ctor = getAudioContextCtor();
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.buildGraph();
      }
      const ctx = this.ctx;
      const rt = ctx as AudioContext;
      if (!this.isOffline(ctx) && typeof rt.resume === 'function' && rt.state !== 'running') {
        const p = rt.resume();
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      }
      if (!this.unlocked && !this.isOffline(ctx)) {
        // iOS-style unlock: play a 1-sample silent buffer inside the gesture.
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      }
      this.unlocked = true;
    });
  }

  /** Grabaciones de cánticos de cancha que suenan en las tribunas durante los partidos. */
  setChantTracks(tracks: ChantTrack[]): void {
    this.chantTracks = tracks.slice();
  }

  setVolumes(v: AudioVolumes): void {
    if (!v) return;
    this.vols = {
      master: clamp01(v.master),
      music: clamp01(v.music),
      sfx: clamp01(v.sfx),
      crowd: clamp01(v.crowd),
    };
    this.safe(() => this.applyVolumes());
  }

  dispose(): void {
    if (this.disposed) return;
    this.safe(() => {
      this.stopTimers();
      this.real?.stop();
      this.real = null;
      if (this.amb) for (const s of this.amb.sources) this.tryStop(s);
      if (this.roll) this.tryStop(this.roll.src);
      this.roll = null;
      this.amb = null;
      this.musicOn = false;
      if (this.g) {
        try {
          this.g.output.disconnect();
        } catch {
          /* ignore */
        }
      }
      const ctx = this.ctx as AudioContext | null;
      if (ctx && !this.injected && !this.isOffline(ctx) && typeof ctx.close === 'function') {
        const p = ctx.close();
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      }
    });
    this.disposed = true;
    this.unlocked = false;
    this.g = null;
    this.ctx = null;
    this.mus = null;
    this.noiseBufs = {};
    this.applauseBuf = null;
    this.voices = { sfx: [], crowd: [] };
  }

  // ======================================================================
  // SFX
  // ======================================================================

  /** Ball strike. power 0..1 (soft pass thud .. powerful shot). */
  kick(power: number): void {
    this.run((ctx, g) => {
      const p = clamp01(power) * rand(0.92, 1.08);
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.4);
      // low body thump with pitch drop
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = (105 + 70 * p) * rand(0.93, 1.07);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.05 + 0.05 * p);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.002, 0.25 + 0.45 * p, 0.09 + 0.13 * p);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.3);
      // leather "pock" (mid body)
      const k = ctx.createOscillator();
      k.type = 'triangle';
      k.frequency.setValueAtTime(rand(380, 460) + 80 * p, t);
      k.frequency.exponentialRampToValueAtTime(190, t + 0.035);
      const kg = ctx.createGain();
      this.perc(kg.gain, t, 0.001, 0.1 + 0.12 * p, 0.045);
      k.connect(kg).connect(v);
      k.start(t);
      k.stop(t + 0.1);
      // leather slap transient
      const n = this.noise('white', t, 0.08);
      const bp = this.filter('bandpass', (1600 + 2200 * p) * rand(0.9, 1.1), 0.9);
      const hp = this.filter('highpass', 500, 0.7);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.0008, 0.12 + 0.4 * p, 0.012 + 0.022 * p);
      n.connect(bp).connect(hp).connect(ng).connect(v);
      if (p > 0.65) {
        // air whoosh trailing a hard shot
        const w = this.noise('pink', t + 0.02, 0.35);
        const wb = this.filter('bandpass', 900, 0.8);
        wb.frequency.setValueAtTime(700, t + 0.02);
        wb.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
        const wg = ctx.createGain();
        wg.gain.setValueAtTime(FLOOR, t + 0.02);
        wg.gain.linearRampToValueAtTime(0.05 * (p - 0.5), t + 0.08);
        wg.gain.exponentialRampToValueAtTime(FLOOR, t + 0.35);
        w.connect(wb).connect(wg).connect(v);
      }
      void g;
    });
  }

  /** Ball bounce on grass. strength 0..1. */
  bounce(strength: number): void {
    this.run((ctx) => {
      const s = clamp01(strength) * rand(0.9, 1.1);
      if (s < 0.02) return;
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.25);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(80 + 30 * s, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.07);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.002, 0.15 + 0.5 * s, 0.07 + 0.05 * s);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.2);
      const n = this.noise('pink', t, 0.12);
      const lp = this.filter('lowpass', 700 + 900 * s, 0.7);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.001, 0.08 + 0.25 * s, 0.04);
      n.connect(lp).connect(ng).connect(v);
      if (s > 0.4) {
        const sl = this.noise('white', t, 0.04);
        const bp = this.filter('bandpass', 2200, 1);
        const sg = ctx.createGain();
        this.perc(sg.gain, t, 0.0008, 0.12 * s, 0.01);
        sl.connect(bp).connect(sg).connect(v);
      }
    });
  }

  /** Ball hitting the metal post / crossbar. */
  post(): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 1.8);
      const wet = this.wetSend(g.sfxWet, 0.35);
      v.connect(wet);
      // ball impact
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.06);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.001, 0.5, 0.12);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.2);
      // inharmonic metallic partials (hollow tube)
      const f0 = rand(390, 460);
      const ratios = [1, 2.32, 4.25, 6.63, 9.38, 12.1];
      const amps = [0.22, 0.17, 0.12, 0.08, 0.05, 0.03];
      const decs = [1.5, 1.1, 0.7, 0.45, 0.3, 0.2];
      const bus = ctx.createGain();
      bus.gain.value = 1;
      bus.connect(v);
      for (let i = 0; i < ratios.length; i++) {
        for (const det of [0, 1.5]) {
          const p = ctx.createOscillator();
          p.type = 'sine';
          p.frequency.value = f0 * ratios[i] + det * (i + 1);
          const pg = ctx.createGain();
          this.perc(pg.gain, t, 0.001, amps[i] * (det ? 0.5 : 1), decs[i]);
          p.connect(pg).connect(bus);
          p.start(t);
          p.stop(t + decs[i] + 0.05);
        }
      }
      // bright clank transient
      const n = this.noise('white', t, 0.06);
      const bp = this.filter('bandpass', 4800, 1.5);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.0005, 0.35, 0.025);
      n.connect(bp).connect(ng).connect(v);
    });
  }

  /** Ball hitting the net (swish/rustle). */
  net(): void {
    this.run((ctx) => {
      const t = ctx.currentTime;
      const dur = 0.75;
      const v = this.claim('sfx', t, dur);
      const n = this.noise('white', t, dur);
      const bp = this.filter('bandpass', 1400, 1.1);
      bp.frequency.setValueAtTime(1300, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.12);
      bp.frequency.exponentialRampToValueAtTime(1800, t + dur);
      const ng = ctx.createGain();
      const curve = new Float32Array(64);
      for (let i = 0; i < curve.length; i++) {
        const x = i / (curve.length - 1);
        const envv = x < 0.08 ? x / 0.08 : Math.exp(-(x - 0.08) * 4.5);
        curve[i] = 0.5 * envv * (0.55 + 0.45 * Math.random());
      }
      curve[curve.length - 1] = 0;
      ng.gain.setValueCurveAtTime(curve, t, dur);
      n.connect(bp).connect(ng).connect(v);
      // high swish layer
      const h = this.noise('white', t, 0.4);
      const hp = this.filter('highpass', 5000, 0.7);
      const hg = ctx.createGain();
      this.perc(hg.gain, t, 0.02, 0.05, 0.25);
      h.connect(hp).connect(hg).connect(v);
      // soft ball-in-net thud
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.004, 0.25, 0.14);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.25);
    });
  }

  /** Referee pea whistle. final = three blasts. */
  whistle(kind: 'short' | 'long' | 'double' | 'final'): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime + 0.005;
      let blasts: Array<[number, number]>;
      switch (kind) {
        case 'long':
          blasts = [[0, 1.0]];
          break;
        case 'double':
          blasts = [[0, 0.17], [0.3, 0.24]];
          break;
        case 'final':
          blasts = [[0, 0.45], [0.7, 0.45], [1.4, 1.35]];
          break;
        case 'short':
        default:
          blasts = [[0, 0.28]];
      }
      const last = blasts[blasts.length - 1];
      const v = this.claim('sfx', t, last[0] + last[1] + 0.2);
      v.connect(this.wetSend(g.sfxWet, 0.4));
      const f = rand(2750, 3050);
      for (const [off, d] of blasts) this.whistleBlast(t + off, d, f * rand(0.99, 1.01), v);
    });
  }

  /** Body contact / slide tackle thud. */
  tackle(): void {
    this.run((ctx) => {
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.5);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(rand(70, 85), t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.003, 0.6, 0.16);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.3);
      // cloth/body impact
      const b = this.noise('brown', t, 0.2);
      const lp = this.filter('lowpass', 420, 0.8);
      const bg = ctx.createGain();
      this.perc(bg.gain, t, 0.002, 0.7, 0.1);
      b.connect(lp).connect(bg).connect(v);
      // grass scrape (slide)
      const s = this.noise('pink', t + 0.01, 0.45);
      const bp = this.filter('bandpass', rand(1500, 2100), 0.6);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(FLOOR, t + 0.01);
      sg.gain.linearRampToValueAtTime(0.1, t + 0.05);
      sg.gain.exponentialRampToValueAtTime(FLOOR, t + 0.45);
      s.connect(bp).connect(sg).connect(v);
    });
  }

  /** Cabezazo: golpe sordo y corto (frente contra cuero), sin el chasquido del empeine. */
  header(power: number): void {
    this.run((ctx) => {
      const p = clamp01(power) * rand(0.9, 1.1);
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.3);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime((150 + 60 * p) * rand(0.95, 1.05), t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.06);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.002, 0.3 + 0.3 * p, 0.08);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.2);
      const n = this.noise('pink', t, 0.06);
      const bp = this.filter('bandpass', 900 + 500 * p, 1.2);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.001, 0.12 + 0.18 * p, 0.03);
      n.connect(bp).connect(ng).connect(v);
    });
  }

  /** Toque suave: control, primer toque o conducción. power 0..1. */
  touch(power: number): void {
    this.run((ctx) => {
      const p = clamp01(power) * rand(0.85, 1.15);
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.12);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(rand(230, 290) + 90 * p, t);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.04);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.001, 0.05 + 0.13 * p, 0.04);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.1);
      const n = this.noise('white', t, 0.03);
      const bp = this.filter('bandpass', rand(1200, 1700), 1);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.0008, 0.03 + 0.08 * p, 0.012);
      n.connect(bp).connect(ng).connect(v);
    });
  }

  /** Arquero que bloca el balón: palmada de guantes + balón que se aprieta contra el pecho. */
  gloveCatch(): void {
    this.run((ctx) => {
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.35);
      const n = this.noise('white', t, 0.08);
      const bp = this.filter('bandpass', 2400, 0.8);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.0006, 0.32, 0.03);
      n.connect(bp).connect(ng).connect(v);
      // segundo contacto (la otra mano) un instante después
      const n2 = this.noise('white', t + 0.018, 0.06);
      const bp2 = this.filter('bandpass', 1900, 0.8);
      const ng2 = ctx.createGain();
      this.perc(ng2.gain, t + 0.018, 0.0006, 0.2, 0.025);
      n2.connect(bp2).connect(ng2).connect(v);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.1);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.003, 0.4, 0.13);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.25);
    });
  }

  /** Despeje con los puños / desvío del arquero: golpe seco y brillante. */
  glovePunch(): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.4);
      v.connect(this.wetSend(g.sfxWet, 0.2));
      const n = this.noise('white', t, 0.06);
      const bp = this.filter('bandpass', 3000, 0.9);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.0005, 0.42, 0.028);
      n.connect(bp).connect(ng).connect(v);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.07);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.002, 0.45, 0.1);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.2);
    });
  }

  /** Balonazo contra las vallas publicitarias (panel hueco de plástico). strength 0..1. */
  boards(strength: number): void {
    this.run((ctx, g) => {
      const s = clamp01(strength);
      if (s < 0.05) return;
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.7);
      v.connect(this.wetSend(g.sfxWet, 0.3));
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.15);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.002, 0.35 + 0.35 * s, 0.22);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.4);
      // resonancia del panel
      for (const [f, a, d] of [[210, 0.12, 0.35], [455, 0.07, 0.22], [780, 0.04, 0.14]] as const) {
        const r = ctx.createOscillator();
        r.type = 'triangle';
        r.frequency.value = f * rand(0.96, 1.04);
        const rg = ctx.createGain();
        this.perc(rg.gain, t, 0.002, a * (0.5 + s), d);
        r.connect(rg).connect(v);
        r.start(t);
        r.stop(t + d + 0.05);
      }
      const n = this.noise('pink', t, 0.1);
      const lp = this.filter('lowpass', 1800, 0.7);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.001, 0.25 * s, 0.05);
      n.connect(lp).connect(ng).connect(v);
    });
  }

  /** Bocina del estadio tras un gol (dos acordes). */
  goalHorn(): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime + 0.35;
      const dur = 2.6;
      const v = this.claim('sfx', t, dur + 0.3);
      v.connect(this.wetSend(g.sfxWet, 0.7));
      const lp = this.filter('lowpass', 1600, 0.8);
      lp.connect(v);
      const blasts: Array<[number, number]> = [[0, 0.9], [1.1, 1.4]];
      for (const [off, d] of blasts) {
        for (const f of [146.8, 185, 220]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f * rand(0.995, 1.005);
          const og = ctx.createGain();
          og.gain.setValueAtTime(FLOOR, t + off);
          og.gain.linearRampToValueAtTime(0.05, t + off + 0.06);
          og.gain.setValueAtTime(0.05, t + off + d - 0.15);
          og.gain.exponentialRampToValueAtTime(FLOOR, t + off + d);
          o.connect(og).connect(lp);
          o.start(t + off);
          o.stop(t + off + d + 0.05);
        }
      }
    });
  }

  /**
   * Rodar del balón sobre el césped (sonido continuo). speed en m/s; onGround = el balón toca la hierba.
   * Llamar cada fotograma durante el partido; stopRoll() lo apaga.
   */
  setRoll(speed: number, onGround: boolean): void {
    this.run((ctx, g) => {
      if (!this.roll) {
        const src = this.noise('pink', ctx.currentTime, -1);
        const bp = this.filter('bandpass', 500, 0.9);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(bp).connect(gain).connect(g.sfx);
        this.roll = { src, bp, gain };
      }
      const t = ctx.currentTime;
      const s = Math.min(1, Math.max(0, speed) / 18);
      const target = onGround && speed > 1.2 ? 0.035 + 0.11 * s : 0;
      this.roll.gain.gain.setTargetAtTime(target, t, 0.06);
      this.roll.bp.frequency.setTargetAtTime(350 + 900 * s, t, 0.08);
    });
  }

  stopRoll(): void {
    const r = this.roll;
    if (!r) return;
    this.roll = null;
    this.safe(() => {
      const t = this.ctx ? this.ctx.currentTime : 0;
      r.gain.gain.setTargetAtTime(0, t, 0.05);
      this.tryStop(r.src, t + 0.3);
    });
  }

  uiHover(): void {
    this.run((ctx) => {
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.08);
      this.blip(t, 1500, 1500, 0.12, 0.05, 'sine', v);
    });
  }

  uiClick(): void {
    this.run((ctx) => {
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.15);
      this.blip(t, 720, 720, 0.13, 0.04, 'triangle', v);
      this.blip(t + 0.045, 1080, 1080, 0.11, 0.06, 'triangle', v);
    });
  }

  uiBack(): void {
    this.run((ctx) => {
      const t = ctx.currentTime;
      const v = this.claim('sfx', t, 0.15);
      this.blip(t, 900, 520, 0.13, 0.11, 'triangle', v);
    });
  }

  // ======================================================================
  // Crowd
  // ======================================================================

  /** Continuous stadium crowd murmur bed. */
  startAmbience(): void {
    this.run((ctx, g) => {
      if (this.amb) return;
      const t = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(FLOOR, t);
      out.gain.linearRampToValueAtTime(1, t + 2);
      const tone = this.filter('lowpass', 1500, 0.5);
      out.connect(tone);
      tone.connect(g.crowd);
      const wet = this.wetSend(g.crowdWet, 0.3);
      tone.connect(wet);
      const sources: AudioScheduledSourceNode[] = [];
      const loopNoise = (kind: NoiseKind, pan: number) => {
        const src = this.noise(kind, t, -1);
        sources.push(src);
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        src.connect(p);
        return p;
      };
      const lfo = (rate: number, depth: number, target: AudioParam) => {
        const o = ctx.createOscillator();
        o.frequency.value = rate;
        const gg = ctx.createGain();
        gg.gain.value = depth;
        o.connect(gg).connect(target);
        o.start(t);
        sources.push(o);
      };
      // rumble
      const rumble = ctx.createGain();
      rumble.gain.value = 0.35;
      loopNoise('brown', 0).connect(this.filter('lowpass', 320, 0.7)).connect(rumble).connect(out);
      // murmur (stereo, two decorrelated sources)
      const murmur = ctx.createGain();
      murmur.gain.value = 0.32;
      const mf = this.filter('bandpass', 650, 0.7);
      loopNoise('pink', -0.6).connect(mf);
      loopNoise('pink', 0.6).connect(mf);
      mf.connect(murmur).connect(out);
      lfo(0.09, 0.08, murmur.gain);
      // babble / chatter brightness layer
      const babble = ctx.createGain();
      babble.gain.value = 0.06;
      const bf = this.filter('bandpass', 1700, 1.3);
      loopNoise('pink', 0.3).connect(bf).connect(babble).connect(out);
      lfo(0.23, 0.03, babble.gain);
      lfo(0.05, 350, bf.frequency);
      // slow distant formant swells ("oh"/"ah" vowel colour)
      const swell = ctx.createGain();
      swell.gain.value = 0.12;
      const sIn = ctx.createGain();
      loopNoise('pink', -0.2).connect(sIn);
      const f1 = this.filter('bandpass', 520, 6);
      const f2 = this.filter('bandpass', 1050, 7);
      const f2g = ctx.createGain();
      f2g.gain.value = 0.6;
      sIn.connect(f1).connect(swell);
      sIn.connect(f2).connect(f2g).connect(swell);
      swell.connect(out);
      lfo(0.045, 0.1, swell.gain);
      lfo(0.031, 120, f1.frequency);
      lfo(0.027, 180, f2.frequency);

      this.amb = { out, tone, murmur, babble, swell, sources, timer: null, nextChant: t + 1.5, nextBar: t + 0.6, bar: 0 };
      this.applyExcitement(0.05);
      if (this.chantTracks.length && StadiumChants.supported(ctx)) {
        this.real = new StadiumChants(ctx, this.chantTracks, g.crowd, g.crowdWet);
        this.real.setExcitement(this.excitement);
        this.real.start(1.5);
      } else {
        // first chant soon, then periodic via timer
        this.scheduleChant(t + 1.5);
      }
      this.amb.nextChant = t + rand(10, 18);
      if (!this.isOffline(ctx)) {
        this.amb.timer = setInterval(() => this.ambienceTick(), 500);
      }
    });
  }

  stopAmbience(): void {
    this.run((ctx) => {
      const a = this.amb;
      if (!a) return;
      this.amb = null;
      this.real?.stop();
      this.real = null;
      if (a.timer) clearInterval(a.timer);
      const t = ctx.currentTime;
      a.out.gain.cancelScheduledValues(t);
      a.out.gain.setValueAtTime(Math.max(FLOOR, a.out.gain.value), t);
      a.out.gain.exponentialRampToValueAtTime(FLOOR, t + 1.2);
      for (const s of a.sources) this.tryStop(s, t + 1.3);
    });
  }

  /** 0..1 — smoothly drives ambience loudness/brightness. */
  setExcitement(x: number): void {
    this.excitement = clamp01(x);
    this.run(() => this.applyExcitement(0.6));
    this.real?.setExcitement(this.excitement);
  }

  /** Goal roar, intensity 0..1. */
  cheer(intensity: number): void {
    this.run((ctx, g) => {
      const i = clamp01(intensity);
      const t = ctx.currentTime;
      const peakT = 0.45 + 0.25 * i;
      const hold = 1.0 + 1.6 * i;
      const dur = peakT + hold + 2.5 + 1.5 * i;
      const v = this.claim('crowd', t, dur);
      const wet = this.wetSend(g.crowdWet, 0.45);
      v.connect(wet);
      const peak = 0.5 + 0.5 * i;
      // broadband roar
      const n1 = this.noise('pink', t, dur);
      const n2 = this.noise('pink', t, dur);
      const pl = ctx.createStereoPanner();
      pl.pan.value = -0.5;
      const pr = ctx.createStereoPanner();
      pr.pan.value = 0.5;
      const bp = this.filter('bandpass', 900, 0.45);
      bp.frequency.setValueAtTime(600, t);
      bp.frequency.linearRampToValueAtTime(1300 + 500 * i, t + peakT);
      bp.frequency.linearRampToValueAtTime(800, t + dur);
      n1.connect(pl).connect(bp);
      n2.connect(pr).connect(bp);
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(FLOOR, t);
      rg.gain.linearRampToValueAtTime(0.75 * peak, t + peakT);
      rg.gain.linearRampToValueAtTime(0.62 * peak, t + peakT + hold * 0.5);
      rg.gain.linearRampToValueAtTime(0.68 * peak, t + peakT + hold);
      rg.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
      bp.connect(rg).connect(v);
      // vocal "aaah"/"eeh" roar cluster
      const env: Array<[number, number]> = [
        [0, 0],
        [peakT, 0.9 * peak],
        [peakT + hold, 0.75 * peak],
        [dur, 0],
      ];
      this.vocalCluster({
        t,
        dur,
        count: 12,
        pitch: [[0, 230], [peakT, 330 + 60 * i], [peakT + hold, 300], [dur, 220]],
        spread: 4,
        vowels: [[0, 'o'], [peakT, 'a'], [peakT + hold * 0.6, 'e'], [dur, 'a']],
        env,
        noise: 0.9,
        out: v,
        lowpass: 4000,
      });
      // applause + fan whistles in the tail
      this.applauseLayer(t + peakT + 0.3, hold + 2.5, 0.35 + 0.3 * i, v);
      if (i > 0.4) {
        const nw = 2 + Math.round(3 * i);
        for (let k = 0; k < nw; k++) this.fanWhistle(t + rand(0.3, hold + peakT), 0.035 * i, v);
      }
    });
  }

  /** Near-miss "oooh". */
  ooh(): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime;
      const dur = 2.0;
      const v = this.claim('crowd', t, dur);
      v.connect(this.wetSend(g.crowdWet, 0.45));
      this.vocalCluster({
        t,
        dur,
        count: 12,
        pitch: [[0, 190], [0.55, 265], [1.2, 230], [dur, 165]],
        spread: 3,
        vowels: [[0, 'u'], [0.6, 'o'], [dur, 'u']],
        env: [[0, 0], [0.5, 0.9], [0.9, 0.8], [dur, 0]],
        noise: 0.6,
        out: v,
        lowpass: 2600,
      });
    });
  }

  /** Disappointment groan ("aww"). */
  groan(): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime;
      const dur = 2.2;
      const v = this.claim('crowd', t, dur);
      v.connect(this.wetSend(g.crowdWet, 0.45));
      this.vocalCluster({
        t,
        dur,
        count: 12,
        pitch: [[0, 240], [0.3, 250], [dur, 140]],
        spread: 3,
        vowels: [[0, 'a'], [0.5, 'aw'], [dur, 'o']],
        env: [[0, 0], [0.3, 0.8], [1.0, 0.6], [dur, 0]],
        noise: 0.6,
        out: v,
        lowpass: 2200,
      });
    });
  }

  /** Clapping texture. */
  applause(): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime;
      const dur = 4.5;
      const v = this.claim('crowd', t, dur);
      v.connect(this.wetSend(g.crowdWet, 0.5));
      this.applauseLayer(t, dur, 0.8, v);
    });
  }

  /** Boos and whistles after a foul. */
  boo(): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime;
      const dur = 3.2;
      const v = this.claim('crowd', t, dur);
      v.connect(this.wetSend(g.crowdWet, 0.45));
      this.vocalCluster({
        t,
        dur,
        count: 12,
        pitch: [[0, 150], [0.4, 140], [1.6, 145], [dur, 115]],
        spread: 3.5,
        vowels: [[0, 'u'], [dur, 'u']],
        env: [[0, 0], [0.4, 0.9], [2.2, 0.75], [dur, 0]],
        noise: 0.5,
        out: v,
        lowpass: 1600,
      });
      for (let k = 0; k < 5; k++) this.fanWhistle(t + rand(0.1, 2.2), 0.04, v);
    });
  }

  // ======================================================================
  // Music
  // ======================================================================

  startMenuMusic(): void {
    this.run((ctx, g) => {
      if (!this.mus) this.mus = this.buildMusicNodes(ctx, g);
      const t = ctx.currentTime;
      const fade = this.mus.input.gain;
      fade.cancelScheduledValues(t);
      fade.setValueAtTime(Math.max(FLOOR, fade.value), t);
      fade.linearRampToValueAtTime(1, t + 1.5);
      if (this.musicOn) return;
      this.musicOn = true;
      this.musicStep = 0;
      this.musicNext = t + 0.06;
      this.musicTick();
      if (this.musicTimer) clearInterval(this.musicTimer);
      this.musicTimer = setInterval(() => this.musicTick(), 25);
    });
  }

  stopMenuMusic(): void {
    this.run((ctx) => {
      if (!this.mus) return;
      this.musicOn = false;
      if (this.musicTimer) clearInterval(this.musicTimer);
      this.musicTimer = null;
      const t = ctx.currentTime;
      const fade = this.mus.input.gain;
      fade.cancelScheduledValues(t);
      fade.setValueAtTime(Math.max(FLOOR, fade.value), t);
      fade.linearRampToValueAtTime(0, t + 1.0);
    });
  }

  // ======================================================================
  // internals: plumbing
  // ======================================================================

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[AudioEngine]', e);
    }
  }

  private run(fn: (ctx: BaseAudioContext, g: Graph) => void): void {
    if (this.disposed || !this.unlocked || !this.ctx || !this.g) return;
    const ctx = this.ctx;
    const g = this.g;
    this.safe(() => fn(ctx, g));
  }

  private isOffline(ctx: BaseAudioContext): boolean {
    return typeof (ctx as OfflineAudioContext).startRendering === 'function';
  }

  private tryStop(s: AudioScheduledSourceNode, when?: number): void {
    try {
      s.stop(when);
    } catch {
      /* already stopped */
    }
  }

  private stopTimers(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.amb && this.amb.timer) clearInterval(this.amb.timer);
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    const master = ctx.createGain();
    // Note: browsers' DynamicsCompressor applies automatic makeup gain, so the
    // settings are deliberately gentle and followed by a compensating trim.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -10;
    glue.knee.value = 12;
    glue.ratio.value = 2;
    glue.attack.value = 0.006;
    glue.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    const trim = ctx.createGain();
    trim.gain.value = 0.82;
    // final soft clipper guarantees |out| < 1 even for limiter overshoot
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const shaper = ctx.createWaveShaper();
    const N = 2048;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = ((i / (N - 1)) * 2 - 1) * 2; // represents [-2, 2]
      const a = Math.abs(x);
      const y = a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28);
      curve[i] = Math.sign(x) * y;
    }
    shaper.curve = curve;
    master.connect(trim).connect(glue).connect(limiter).connect(pre).connect(shaper).connect(ctx.destination);

    const music = ctx.createGain();
    const sfx = ctx.createGain();
    const crowd = ctx.createGain();
    music.connect(master);
    sfx.connect(master);
    crowd.connect(master);

    // reverb
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(2.4);
    const revLp = this.filter('lowpass', 5000, 0.5);
    const revRet = ctx.createGain();
    revRet.gain.value = 0.7;
    conv.connect(revLp).connect(revRet).connect(master);
    const sfxWet = ctx.createGain();
    const crowdWet = ctx.createGain();
    sfxWet.connect(conv);
    crowdWet.connect(conv);

    this.g = { master, music, sfx, crowd, sfxWet, crowdWet, output: shaper };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const g = this.g;
    const ctx = this.ctx;
    if (!g || !ctx) return;
    const t = ctx.currentTime;
    const set = (p: AudioParam, v: number) => {
      p.cancelScheduledValues(t);
      if (t === 0) p.setValueAtTime(v, 0);
      else p.setTargetAtTime(v, t, 0.03);
    };
    set(g.master.gain, this.vols.master);
    set(g.music.gain, this.vols.music * 0.8);
    set(g.sfx.gain, this.vols.sfx);
    set(g.sfxWet.gain, this.vols.sfx);
    set(g.crowd.gain, this.vols.crowd);
    set(g.crowdWet.gain, this.vols.crowd);
  }

  /** Allocates a voice gain on a bus, stealing the oldest one past the limit. */
  private claim(kind: BusKind, t: number, dur: number): GainNode {
    const ctx = this.ctx!;
    const g = this.g!;
    const now = ctx.currentTime;
    const list = this.voices[kind];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end < now) list.splice(i, 1);
    while (list.length >= MAX_VOICES[kind]) {
      const old = list.shift()!;
      try {
        old.gain.gain.cancelScheduledValues(now);
        old.gain.gain.setTargetAtTime(0, now, 0.02);
      } catch {
        /* ignore */
      }
    }
    const v = ctx.createGain();
    v.connect(kind === 'sfx' ? g.sfx : g.crowd);
    list.push({ end: t + dur, gain: v });
    return v;
  }

  private wetSend(bus: GainNode, amount: number): GainNode {
    const s = this.ctx!.createGain();
    s.gain.value = amount;
    s.connect(bus);
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Percussive envelope: attack to peak, exponential decay. */
  private perc(p: AudioParam, t: number, attack: number, peak: number, decay: number): void {
    p.setValueAtTime(FLOOR, t);
    p.linearRampToValueAtTime(Math.max(FLOOR * 2, peak), t + attack);
    p.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
  }

  /** Looping cached noise source starting at random offset. dur < 0 = endless. */
  private noise(kind: NoiseKind, t: number, dur: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buf = this.noiseBuffer(kind);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(t, Math.random() * (buf.duration - 0.05));
    if (dur >= 0) s.stop(t + dur + 0.02);
    return s;
  }

  private noiseBuffer(kind: NoiseKind): AudioBuffer {
    const cached = this.noiseBufs[kind];
    if (cached) return cached;
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // short crossfade so the loop seam is inaudible
    const xf = Math.floor(ctx.sampleRate * 0.02);
    for (let i = 0; i < xf; i++) {
      const a = i / xf;
      d[i] = d[i] * a + d[len - xf + i] * (1 - a);
    }
    this.noiseBufs[kind] = buf;
    return buf;
  }

  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    const pre = Math.floor(sr * 0.018);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / sr;
        const w = Math.random() * 2 - 1;
        lp += (w - lp) * (0.6 - 0.45 * (x / seconds)); // darker tail
        d[i] = lp * Math.exp(-x * 2.6) * 0.35;
      }
      // a few early reflections from the stands
      for (let k = 0; k < 7; k++) {
        const idx = pre + Math.floor(sr * rand(0.01, 0.12));
        if (idx < len) d[idx] += rand(-0.4, 0.4);
      }
    }
    return buf;
  }

  // ======================================================================
  // internals: synthesis building blocks
  // ======================================================================

  private blip(t: number, f0: number, f1: number, peak: number, dur: number, type: OscillatorType, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.perc(g.gain, t, 0.003, peak, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** One pea-whistle blast: ~3 kHz tone with fast FM/AM trill + breath noise. */
  private whistleBlast(t: number, dur: number, f: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const end = t + dur;
    const vca = ctx.createGain(); // trill AM
    vca.gain.value = 0.62;
    const env = ctx.createGain();
    env.gain.setValueAtTime(FLOOR, t);
    env.gain.linearRampToValueAtTime(0.55, t + 0.018);
    env.gain.linearRampToValueAtTime(0.42, t + Math.min(0.12, dur * 0.5));
    env.gain.setValueAtTime(0.42, end - 0.04);
    env.gain.exponentialRampToValueAtTime(FLOOR, end + 0.05);
    vca.connect(env).connect(out);

    // pea rattle LFO, with its own slight wobble
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    const rate = rand(26, 34);
    lfo.frequency.setValueAtTime(rate * 0.85, t);
    lfo.frequency.linearRampToValueAtTime(rate, t + 0.08);
    const wob = ctx.createOscillator();
    wob.frequency.value = rand(3, 6);
    const wobG = ctx.createGain();
    wobG.gain.value = 3;
    wob.connect(wobG).connect(lfo.frequency);

    const fm = ctx.createGain();
    fm.gain.value = f * 0.06;
    const am = ctx.createGain();
    am.gain.value = 0.36;
    lfo.connect(fm);
    lfo.connect(am).connect(vca.gain);

    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(f * 0.93, t);
    tone.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    tone.frequency.setValueAtTime(f, end - 0.03);
    tone.frequency.exponentialRampToValueAtTime(f * 0.95, end + 0.05);
    fm.connect(tone.frequency);
    tone.connect(vca);

    const h2 = ctx.createOscillator();
    h2.type = 'sine';
    h2.frequency.setValueAtTime(f * 2, t);
    const fm2 = ctx.createGain();
    fm2.gain.value = f * 0.12;
    lfo.connect(fm2).connect(h2.frequency);
    const h2g = ctx.createGain();
    h2g.gain.value = 0.06;
    h2.connect(h2g).connect(vca);

    // breath noise
    const n = this.noise('white', t, dur + 0.06);
    const bp = this.filter('bandpass', f, 3);
    const ng = ctx.createGain();
    ng.gain.value = 0.22;
    n.connect(bp).connect(ng).connect(vca);

    for (const o of [lfo, wob, tone, h2]) {
      o.start(t);
      o.stop(end + 0.08);
    }
  }

  /**
   * Crowd vocal cluster: many detuned sawtooth "voices" plus breath noise
   * through a parallel 3-formant vowel filter bank.
   */
  private vocalCluster(o: ClusterOpts): void {
    const ctx = this.ctx!;
    const { t, dur } = o;
    const end = t + dur;
    const bankIn = ctx.createGain();
    const sum = ctx.createGain();
    sum.gain.value = 2.2;
    for (let k = 0; k < 3; k++) {
      const f = this.filter('bandpass', FORMANTS[o.vowels[0][1]][k], FORMANT_Q[k]);
      for (const [off, vw] of o.vowels) {
        const tt = t + Math.min(off, dur);
        if (off === 0) f.frequency.setValueAtTime(FORMANTS[vw][k], tt);
        else f.frequency.linearRampToValueAtTime(FORMANTS[vw][k], tt);
      }
      const fg = ctx.createGain();
      fg.gain.value = FORMANT_GAIN[k];
      bankIn.connect(f).connect(fg).connect(sum);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    for (const [off, val] of o.env) env.gain.linearRampToValueAtTime(Math.max(0, val), t + Math.min(off, dur));
    let tail: AudioNode = sum;
    if (o.lowpass) {
      const lp = this.filter('lowpass', o.lowpass, 0.5);
      sum.connect(lp);
      tail = lp;
    }
    tail.connect(env).connect(o.out);
    if (o.wet && o.wetAmount) env.connect(this.wetSend(o.wet as GainNode, o.wetAmount));

    // shared slow vibrato sources
    const vib: OscillatorNode[] = [];
    for (let k = 0; k < 2; k++) {
      const l = ctx.createOscillator();
      l.frequency.value = rand(3.5, 6.5);
      l.start(t);
      l.stop(end + 0.05);
      vib.push(l);
    }
    const vg = 1 / Math.sqrt(Math.max(1, o.count));
    for (let i = 0; i < o.count; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = rand(-o.spread * 100, o.spread * 100);
      const ratio = rand(0.97, 1.03);
      const lag = rand(0, 0.07); // voices never move in perfect sync
      for (const [off, hz] of o.pitch) {
        const tt = t + Math.min(off + lag, dur);
        if (off === 0) osc.frequency.setValueAtTime(hz * ratio, t);
        else osc.frequency.linearRampToValueAtTime(hz * ratio, Math.max(t + 0.001, tt));
      }
      const dg = ctx.createGain();
      dg.gain.value = rand(8, 20);
      vib[i % 2].connect(dg).connect(osc.detune);
      const og = ctx.createGain();
      og.gain.value = vg * 0.32 * rand(0.6, 1);
      osc.connect(og).connect(bankIn);
      const st = t + rand(0, 0.12);
      osc.start(st);
      osc.stop(end + 0.05);
    }
    if (o.noise > 0) {
      const n = this.noise('pink', t, dur);
      const ng = ctx.createGain();
      ng.gain.value = o.noise * 1.6;
      n.connect(ng).connect(bankIn);
    }
  }

  private fanWhistle(t: number, peak: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = rand(1800, 2800);
    const wolf = Math.random() < 0.5;
    const d = wolf ? rand(0.6, 0.9) : rand(0.5, 1.1);
    o.frequency.setValueAtTime(f * 0.8, t);
    if (wolf) {
      o.frequency.exponentialRampToValueAtTime(f * 1.15, t + d * 0.3);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + d);
    } else {
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      o.frequency.setValueAtTime(f, t + d - 0.1);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + d);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.05);
    g.gain.setValueAtTime(peak, t + d - 0.12);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + d);
    const p = ctx.createStereoPanner();
    p.pan.value = rand(-0.8, 0.8);
    o.connect(g).connect(p).connect(out);
    o.start(t);
    o.stop(t + d + 0.02);
  }

  private applauseLayer(t: number, dur: number, peak: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const buf = this.getApplauseBuffer();
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rand(0.94, 1.06);
    const hp = this.filter('highpass', 350, 0.7);
    const g = ctx.createGain();
    const att = Math.min(0.4, dur * 0.2);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.setValueAtTime(peak, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    s.connect(hp).connect(g).connect(out);
    s.start(t, Math.random() * buf.duration * 0.9);
    s.stop(t + dur + 0.05);
  }

  /** Pre-rendered stereo bed of many randomized hand claps (cached). */
  private getApplauseBuffer(): AudioBuffer {
    if (this.applauseBuf) return this.applauseBuf;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const seconds = 4;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    const claps = Math.floor(seconds * 70);
    const clapLen = Math.floor(sr * 0.03);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let c = 0; c < claps; c++) {
        const start = Math.floor(Math.random() * len);
        const tau = sr * rand(0.002, 0.007);
        const amp = rand(0.15, 1) * (Math.random() < 0.15 ? 1.6 : 1);
        // random 2-pole resonant colour per clapper
        const fc = rand(700, 2600) / sr;
        const r = 0.93;
        const a1 = 2 * r * Math.cos(2 * Math.PI * fc);
        const a2 = -r * r;
        let y1 = 0, y2 = 0;
        for (let i = 0; i < clapLen; i++) {
          const idx = (start + i) % len;
          const x = (Math.random() * 2 - 1) * Math.exp(-i / tau);
          const y = x + a1 * y1 + a2 * y2;
          y2 = y1;
          y1 = y;
          d[idx] += (y * 0.25 + x * 0.6) * amp;
        }
      }
      let pk = 0;
      for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
      const norm = pk > 0 ? 0.9 / pk : 1;
      for (let i = 0; i < len; i++) d[i] *= norm;
    }
    this.applauseBuf = buf;
    return buf;
  }

  // ======================================================================
  // internals: ambience
  // ======================================================================

  private applyExcitement(tc: number): void {
    const a = this.amb;
    const ctx = this.ctx;
    if (!a || !ctx) return;
    const x = this.excitement;
    const t = ctx.currentTime;
    const tgt = (p: AudioParam, v: number) => {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(v, t, tc);
    };
    tgt(a.murmur.gain, 0.3 + 0.45 * x);
    tgt(a.babble.gain, 0.05 + 0.3 * x);
    tgt(a.swell.gain, 0.12 + 0.25 * x);
    tgt(a.tone.frequency, 1100 + 3800 * x);
  }

  private ambienceTick(): void {
    const a = this.amb;
    const ctx = this.ctx;
    if (!a || !ctx || !this.unlocked) return;
    this.safe(() => {
      // con cánticos grabados la hinchada real se encarga del canto y de los bombos
      if (this.real) return;
      const now = ctx.currentTime;
      if (now >= a.nextChant - 0.6) {
        this.scheduleChant(Math.max(now + 0.05, a.nextChant));
        a.nextChant = Math.max(now, a.nextChant) + rand(7, 16) * (1 - 0.45 * this.excitement);
      }
      // la barra no para: bombos todo el partido (se programan ~1,2 s por delante)
      if (a.nextBar < now) a.nextBar = now + 0.05;
      while (a.nextBar < now + 1.2) {
        this.barraBar(a.nextBar, a.bar++, a.out);
        a.nextBar += 4 * BARRA_BEAT;
      }
    });
  }

  /**
   * Cántico de la hinchada ahora mismo (con bombo). boost 0..1 lo hace más fuerte y largo:
   * se usa en el recibimiento y después de los goles.
   */
  chant(boost = 1): void {
    this.run((ctx) => {
      if (!this.amb) return;
      if (this.real) {
        this.real.boost(clamp01(boost));
        return;
      }
      this.scheduleChant(ctx.currentTime + 0.05, clamp01(boost));
      this.amb.nextChant = Math.max(this.amb.nextChant, ctx.currentTime + 12);
    });
  }

  /** Estallido de fuegos artificiales (trueno grave + chisporroteo), más suave cuanto más lejos. */
  firework(distance = 60): void {
    this.run((ctx, g) => {
      const t = ctx.currentTime;
      const vol = Math.min(1, 55 / Math.max(20, distance));
      const dur = 2.2;
      const v = this.claim('sfx', t, dur);
      v.connect(this.wetSend(g.sfxWet, 0.6));
      // trueno: ruido grave + seno que cae
      const n = this.noise('brown', t, 0.9);
      const lp = this.filter('lowpass', 420, 0.7);
      const ng = ctx.createGain();
      this.perc(ng.gain, t, 0.005, 0.55 * vol, 0.7);
      n.connect(lp).connect(ng).connect(v);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      const og = ctx.createGain();
      this.perc(og.gain, t, 0.004, 0.45 * vol, 0.55);
      o.connect(og).connect(v);
      o.start(t);
      o.stop(t + 0.7);
      // chisporroteo
      const k = 18 + Math.floor(Math.random() * 14);
      for (let i = 0; i < k; i++) {
        const tt = t + 0.25 + Math.random() * 1.3;
        const c = this.noise('white', tt, 0.03);
        const hp = this.filter('highpass', 2500 + Math.random() * 3000, 0.7);
        const cg = ctx.createGain();
        this.perc(cg.gain, tt, 0.001, (0.05 + Math.random() * 0.08) * vol, 0.025);
        c.connect(hp).connect(cg).connect(v);
      }
    });
  }

  /**
   * Un compás de la batería de la barra brava: varios bombos (graves, algo desfasados entre sí),
   * redoblante en los contratiempos y platillo cada dos compases.
   */
  private barraBar(t: number, n: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const level = 0.16 + 0.3 * this.excitement;
    const b = BARRA_BEAT / 2; // corcheas
    const bombo = (tt: number, f0: number, lv: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0 * 1.8, tt);
      o.frequency.exponentialRampToValueAtTime(f0, tt + 0.12);
      const g = ctx.createGain();
      this.perc(g.gain, tt, 0.003, lv, 0.26);
      o.connect(g).connect(out);
      o.start(tt);
      o.stop(tt + 0.32);
      const nz = this.noise('pink', tt, 0.05);
      const bp = this.filter('bandpass', 160, 1.1);
      const ng = ctx.createGain();
      this.perc(ng.gain, tt, 0.002, lv * 0.45, 0.04);
      nz.connect(bp).connect(ng).connect(out);
    };
    // patrón de cancha (8 corcheas): golpes principales y respuesta de los otros bombos
    const main = [0, 3, 4, 6];
    const answer = n % 2 ? [2, 5, 7] : [2, 7];
    // la mayoría de la batería son bombos: tres grupos con afinación y desfase distintos
    const drums: Array<[number, number]> = [[52, 0], [58, 0.012], [64, -0.008]];
    for (const e of main) for (const [f, off] of drums) bombo(t + e * b + off, f, level * (e === 0 ? 0.62 : 0.45));
    for (const e of answer) bombo(t + e * b + 0.006, 70, level * 0.3);
    // redoblante
    for (const e of [2, 6]) {
      const tt = t + e * b;
      const nz = this.noise('white', tt, 0.12);
      const bp = this.filter('bandpass', 1900, 0.9);
      const g = ctx.createGain();
      this.perc(g.gain, tt, 0.002, level * 0.22, 0.09);
      nz.connect(bp).connect(g).connect(out);
    }
    // platillo
    if (n % 2 === 0) {
      const nz = this.noise('white', t, 1.2);
      const hp = this.filter('highpass', 6500, 0.7);
      const g = ctx.createGain();
      this.perc(g.gain, t, 0.004, level * 0.14, 0.9);
      nz.connect(hp).connect(g).connect(out);
    }
  }

  /** Bombo de la hinchada en los tiempos del cántico. */
  private terraceDrum(t: number, beats: number, beat: number, level: number, out: AudioNode): void {
    const ctx = this.ctx!;
    for (let k = 0; k < beats; k++) {
      // golpe en cada tiempo y doble golpe al final de cada compás
      const hits = k % 4 === 3 ? [0, 0.5] : [0];
      for (const h of hits) {
        const tt = t + (k + h) * beat;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(95, tt);
        o.frequency.exponentialRampToValueAtTime(48, tt + 0.14);
        const g = ctx.createGain();
        this.perc(g.gain, tt, 0.003, 0.55 * level, 0.22);
        o.connect(g).connect(out);
        o.start(tt);
        o.stop(tt + 0.3);
        const n = this.noise('pink', tt, 0.06);
        const bp = this.filter('bandpass', 180, 1.2);
        const ng = ctx.createGain();
        this.perc(ng.gain, tt, 0.002, 0.25 * level, 0.05);
        n.connect(bp).connect(ng).connect(out);
      }
    }
  }

  /** Distant terrace chant: one vocal cluster stepping through a short melody. */
  private scheduleChant(t: number, boost = 0): void {
    const a = this.amb;
    if (!a) return;
    const pat = CHANTS[Math.floor(Math.random() * CHANTS.length)];
    const beat = rand(0.38, 0.46);
    const base = rand(190, 240);
    const reps = boost > 0 ? 3 : Math.random() < 0.5 ? 2 : 1;
    const pitch: Array<[number, number]> = [];
    const vowels: Array<[number, Vowel]> = [];
    const env: Array<[number, number]> = [];
    const level = Math.min(1, 0.35 + 0.4 * this.excitement + 0.35 * boost);
    let phraseLen = 0;
    for (const s of pat) phraseLen = Math.max(phraseLen, s[0] + s[2]);
    for (let r = 0; r < reps; r++) {
      for (const [b, semi, len, vw] of pat) {
        const st = (r * (phraseLen + 1) + b) * beat;
        const d = len * beat;
        const hz = base * Math.pow(2, semi / 12);
        pitch.push([st, hz], [st + 0.04, hz]);
        vowels.push([st + 0.02, vw]);
        env.push([st, level * 0.25], [st + 0.05, level], [st + d * 0.75, level * 0.75], [st + d, level * 0.25]);
      }
    }
    const dur = env[env.length - 1][0] + 0.3;
    env.push([dur, 0]);
    pitch.push([dur, base * 0.95]);
    this.vocalCluster({
      t,
      dur,
      count: boost > 0 ? 14 : 10,
      pitch,
      spread: 1.2,
      vowels,
      env,
      noise: 0.5,
      out: a.out,
      lowpass: 1800,
    });
    // bombo de la tribuna (casi siempre en los cánticos fuertes)
    if (boost > 0 || Math.random() < 0.55) this.terraceDrum(t, Math.floor(dur / beat), beat, level, a.out);
    // rhythmic clapping on beats for some chants
    if (boost > 0 || Math.random() < 0.5) {
      const ctx = this.ctx!;
      for (let k = 0; k < Math.floor(dur / beat); k += 2) {
        const tt = t + k * beat;
        const n = this.noise('white', tt, 0.08);
        const bp = this.filter('bandpass', 1300, 0.8);
        const g = ctx.createGain();
        this.perc(g.gain, tt, 0.004, 0.12 * level, 0.06);
        n.connect(bp).connect(g).connect(a.out);
      }
    }
  }

  // ======================================================================
  // internals: music
  // ======================================================================

  private buildMusicNodes(ctx: BaseAudioContext, g: Graph): MusicNodes {
    const input = ctx.createGain();
    input.gain.value = FLOOR;
    input.connect(g.music);
    // lead echo (dotted 8th)
    const delayIn = ctx.createGain();
    delayIn.gain.value = 0.28;
    const dl = ctx.createDelay(1.5);
    dl.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = this.filter('lowpass', 2800, 0.5);
    delayIn.connect(dl).connect(dlp).connect(fb).connect(dl);
    dlp.connect(input);
    // distorted "guitar" chain (shared)
    const guitarIn = ctx.createGain();
    const drive = ctx.createWaveShaper();
    const N = 1024;
    const c = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 6) * 0.8;
    }
    drive.curve = c;
    drive.oversample = '2x';
    const gl = this.filter('lowpass', 2600, 0.8);
    const gh = this.filter('highpass', 120, 0.7);
    const gOut = ctx.createGain();
    gOut.gain.value = 0.07;
    guitarIn.connect(drive).connect(gh).connect(gl).connect(gOut).connect(input);
    const drums = ctx.createGain();
    drums.gain.value = 0.85;
    drums.connect(input);
    return { input, delayIn, guitarIn, drums };
  }

  private musicTick(): void {
    if (!this.musicOn || !this.ctx || !this.mus) return;
    const ctx = this.ctx;
    this.safe(() => {
      const horizon = ctx.currentTime + this.musicLookahead;
      // if the tab was suspended, skip ahead instead of bursting
      if (this.musicNext < ctx.currentTime - 0.2) this.musicNext = ctx.currentTime + 0.05;
      let guard = 0;
      while (this.musicNext < horizon && guard++ < 4096) {
        this.scheduleStep(this.musicStep, this.musicNext);
        this.musicNext += STEP;
        this.musicStep++;
      }
    });
  }

  private scheduleStep(step: number, t: number): void {
    const m = this.mus!;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const intro = bar < INTRO_BARS;
    const loopBar = intro ? bar : (bar - INTRO_BARS) % 8;
    const loopIdx = intro ? -1 : Math.floor((bar - INTRO_BARS) / 8);
    const chord = PROG[loopBar % 4];
    const barDur = STEP * 16;

    // pads
    if (s === 0) this.pad(t, chord.pad, barDur, m.input);
    // bass (8ths)
    if (s % 2 === 0) {
      const n = chord.bass + BASS_PATTERN[s / 2];
      this.bass(t, n, STEP * 1.7, intro ? 0.6 : 1, m.input);
    }
    // hats
    if (s % 2 === 0) this.hat(t, s % 4 === 2 && !intro, s % 4 === 0 ? 0.9 : 0.7, m.drums);
    else if (!intro) this.hat(t, false, 0.35, m.drums);
    if (!intro) {
      // kick: four on the floor + pickup
      if (s % 4 === 0 || (s === 14 && bar % 2 === 1)) this.drumKick(t, m.drums);
      // snare backbeat + fill at end of loop
      if (s === 4 || s === 12) this.snare(t, 1, m.drums);
      if (loopBar === 7 && (s === 13 || s === 14 || s === 15)) this.snare(t, 0.55 + 0.15 * (s - 13), m.drums);
      if (loopBar === 0 && s === 0) this.crash(t, m.drums);
      // lead
      for (const [st, note, len] of MELODY[loopBar]) {
        if (st === s) this.lead(t, note, len * STEP, m);
      }
      // second-half variation: arpeggio + guitar chugs
      if (loopIdx % 2 === 1) {
        const tones = [...chord.pad, chord.pad[0] + 12];
        this.pluck(t, tones[s % 4] + 12, m.input);
        if (s % 2 === 0 && s !== 10) this.guitar(t, chord.bass + 12, m.guitarIn);
      }
    } else if (bar === INTRO_BARS - 1 && s >= 8 && s % 2 === 0) {
      // intro riser: snare build
      this.snare(t, 0.3 + (s - 8) * 0.08, m.drums);
    }
  }

  private drumKick(t: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.08);
    const g = ctx.createGain();
    this.perc(g.gain, t, 0.002, 0.85, 0.3);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.36);
    const n = this.noise('white', t, 0.02);
    const hp = this.filter('highpass', 3000, 0.7);
    const ng = ctx.createGain();
    this.perc(ng.gain, t, 0.0005, 0.12, 0.006);
    n.connect(hp).connect(ng).connect(out);
  }

  private snare(t: number, vel: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const n = this.noise('white', t, 0.22);
    const hp = this.filter('highpass', 1000, 0.7);
    const ng = ctx.createGain();
    this.perc(ng.gain, t, 0.001, 0.38 * vel, 0.16);
    n.connect(hp).connect(ng).connect(out);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
    const og = ctx.createGain();
    this.perc(og.gain, t, 0.001, 0.3 * vel, 0.08);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, open: boolean, vel: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const d = open ? 0.2 : 0.035;
    const n = this.noise('white', t, d + 0.02);
    const hp = this.filter('highpass', 7500, 0.8);
    const g = ctx.createGain();
    this.perc(g.gain, t, 0.0008, 0.13 * vel, d);
    n.connect(hp).connect(g).connect(out);
  }

  private crash(t: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const n = this.noise('white', t, 1.8);
    const hp = this.filter('highpass', 4500, 0.6);
    const g = ctx.createGain();
    this.perc(g.gain, t, 0.002, 0.16, 1.6);
    n.connect(hp).connect(g).connect(out);
  }

  private bass(t: number, midi: number, dur: number, vel: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f;
    const lp = this.filter('lowpass', 300, 5);
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.exponentialRampToValueAtTime(1300, t + 0.012);
    lp.frequency.exponentialRampToValueAtTime(320, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.005);
    g.gain.setValueAtTime(0.18 * vel, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    const sg = ctx.createGain();
    sg.gain.value = 0.9;
    saw.connect(lp).connect(g);
    sub.connect(sg).connect(g);
    g.connect(out);
    saw.start(t);
    sub.start(t);
    saw.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  private pad(t: number, notes: number[], dur: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const lp = this.filter('lowpass', 900, 0.8);
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1600, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.12);
    g.gain.setValueAtTime(0.05, t + dur - 0.12);
    g.gain.linearRampToValueAtTime(FLOOR, t + dur + 0.05);
    lp.connect(g).connect(out);
    for (const n of notes) {
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.08);
      }
    }
  }

  private lead(t: number, midi: number, dur: number, m: MusicNodes): void {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const a = ctx.createOscillator();
    a.type = 'square';
    a.frequency.value = f;
    const b = ctx.createOscillator();
    b.type = 'sawtooth';
    b.frequency.value = f;
    b.detune.value = 6;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(dur > 0.3 ? 14 : 0, t + Math.min(dur, 0.3));
    vib.connect(vg);
    vg.connect(a.detune);
    vg.connect(b.detune);
    const lp = this.filter('lowpass', 3200, 1);
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(2200, t + dur);
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    const g = ctx.createGain();
    const rel = 0.06;
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.01);
    g.gain.setValueAtTime(0.085, t + Math.max(0.011, dur - rel));
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur + rel);
    a.connect(mix);
    b.connect(mix);
    mix.connect(lp).connect(g);
    g.connect(m.input);
    g.connect(m.delayIn);
    for (const o of [a, b, vib]) {
      o.start(t);
      o.stop(t + dur + rel + 0.02);
    }
  }

  private pluck(t: number, midi: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    this.perc(g.gain, t, 0.002, 0.05, 0.14);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.18);
  }

  private guitar(t: number, midi: number, input: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    this.perc(g.gain, t, 0.002, 0.5, 0.11);
    g.connect(input);
    for (const iv of [0, 7, 12]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(midi + iv);
      o.detune.value = rand(-6, 6);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.16);
    }
  }
}
