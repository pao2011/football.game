// Música del menú (composición original): instrumentos sintetizados y la partitura de cada paso de semicorchea.
// El motor de audio (AudioEngine) lleva el reloj y llama a scheduleStep con antelación.

type NoiseKind = 'white' | 'pink' | 'brown';

/** Utilidades de síntesis que presta el motor de audio. */
export interface SynthKit {
  ctx: BaseAudioContext;
  filter(type: BiquadFilterType, freq: number, q: number): BiquadFilterNode;
  perc(p: AudioParam, t: number, attack: number, peak: number, decay: number): void;
  noise(kind: NoiseKind, t: number, dur: number): AudioBufferSourceNode;
}

export interface MusicNodes {
  input: GainNode; // fade gain
  delayIn: GainNode;
  guitarIn: GainNode;
  drums: GainNode;
}

const FLOOR = 0.0001;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- music data (original composition) ----------
const BPM = 124;
export const STEP = 60 / BPM / 4; // 16th note
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

export class MenuMusic {
  readonly nodes: MusicNodes;

  constructor(private readonly k: SynthKit, out: AudioNode) {
    this.nodes = this.build(k.ctx, out);
  }

  private build(ctx: BaseAudioContext, out: AudioNode): MusicNodes {
    const input = ctx.createGain();
    input.gain.value = FLOOR;
    input.connect(out);
    // lead echo (dotted 8th)
    const delayIn = ctx.createGain();
    delayIn.gain.value = 0.28;
    const dl = ctx.createDelay(1.5);
    dl.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = this.k.filter('lowpass', 2800, 0.5);
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
    const gl = this.k.filter('lowpass', 2600, 0.8);
    const gh = this.k.filter('highpass', 120, 0.7);
    const gOut = ctx.createGain();
    gOut.gain.value = 0.07;
    guitarIn.connect(drive).connect(gh).connect(gl).connect(gOut).connect(input);
    const drums = ctx.createGain();
    drums.gain.value = 0.85;
    drums.connect(input);
    return { input, delayIn, guitarIn, drums };
  }

  scheduleStep(step: number, t: number): void {
    const m = this.nodes;
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
    const ctx = this.k.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.08);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.002, 0.85, 0.3);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.36);
    const n = this.k.noise('white', t, 0.02);
    const hp = this.k.filter('highpass', 3000, 0.7);
    const ng = ctx.createGain();
    this.k.perc(ng.gain, t, 0.0005, 0.12, 0.006);
    n.connect(hp).connect(ng).connect(out);
  }

  private snare(t: number, vel: number, out: AudioNode): void {
    const ctx = this.k.ctx;
    const n = this.k.noise('white', t, 0.22);
    const hp = this.k.filter('highpass', 1000, 0.7);
    const ng = ctx.createGain();
    this.k.perc(ng.gain, t, 0.001, 0.38 * vel, 0.16);
    n.connect(hp).connect(ng).connect(out);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
    const og = ctx.createGain();
    this.k.perc(og.gain, t, 0.001, 0.3 * vel, 0.08);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, open: boolean, vel: number, out: AudioNode): void {
    const ctx = this.k.ctx;
    const d = open ? 0.2 : 0.035;
    const n = this.k.noise('white', t, d + 0.02);
    const hp = this.k.filter('highpass', 7500, 0.8);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.0008, 0.13 * vel, d);
    n.connect(hp).connect(g).connect(out);
  }

  private crash(t: number, out: AudioNode): void {
    const ctx = this.k.ctx;
    const n = this.k.noise('white', t, 1.8);
    const hp = this.k.filter('highpass', 4500, 0.6);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.002, 0.16, 1.6);
    n.connect(hp).connect(g).connect(out);
  }

  private bass(t: number, midi: number, dur: number, vel: number, out: AudioNode): void {
    const ctx = this.k.ctx;
    const f = mtof(midi);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f;
    const lp = this.k.filter('lowpass', 300, 5);
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
    const ctx = this.k.ctx;
    const lp = this.k.filter('lowpass', 900, 0.8);
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
    const ctx = this.k.ctx;
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
    const lp = this.k.filter('lowpass', 3200, 1);
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
    const ctx = this.k.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.002, 0.05, 0.14);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.18);
  }

  private guitar(t: number, midi: number, input: AudioNode): void {
    const ctx = this.k.ctx;
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.002, 0.5, 0.11);
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
