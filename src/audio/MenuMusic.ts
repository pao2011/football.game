// Música del menú (composición original, re mayor-menor "himno de estadio"): cuerdas, metales, coro, timbales y
// percusión épica sintetizados con osciladores y ruido, con reverb de sala. El motor de audio (AudioEngine) lleva el
// reloj y llama a scheduleStep con antelación; aquí está la partitura de cada paso de semicorchea.
//
// Forma: introducción de 4 compases (solo la primera vez) y un bucle de 24 compases:
//   A (8) tema en metales · B (4) crescendo con redoble · C (8) himno completo con coro · D (4) respiro con piano.

type NoiseKind = 'white' | 'pink' | 'brown';

/** Utilidades de síntesis que presta el motor de audio. */
export interface SynthKit {
  ctx: BaseAudioContext;
  filter(type: BiquadFilterType, freq: number, q: number): BiquadFilterNode;
  perc(p: AudioParam, t: number, attack: number, peak: number, decay: number): void;
  noise(kind: NoiseKind, t: number, dur: number): AudioBufferSourceNode;
}

export interface MusicNodes {
  /** Salida con fundido (el motor de audio le sube y baja la ganancia). */
  input: GainNode;
  /** Mezcla directa y envío a la reverb (ambas pasan por el compresor antes de `input`). */
  dry: GainNode;
  verb: GainNode;
  /** Eco del tema (corchea con puntillo). */
  delayIn: GainNode;
}

const FLOOR = 0.0001;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- partitura ----------
const BPM = 104;
export const STEP = 60 / BPM / 4; // semicorchea
const BAR = STEP * 16;

interface Chord { name: string; bass: number; pad: number[] }
const Dm: Chord = { name: 'Dm', bass: 38, pad: [50, 57, 62, 65] };
const Bb: Chord = { name: 'Bb', bass: 34, pad: [46, 58, 62, 65] };
const F: Chord = { name: 'F', bass: 41, pad: [53, 57, 60, 65] };
const C: Chord = { name: 'C', bass: 36, pad: [48, 55, 60, 64] };
const Gm: Chord = { name: 'Gm', bass: 31, pad: [43, 55, 58, 62] };
const A: Chord = { name: 'A', bass: 33, pad: [45, 57, 61, 64] };

/** Volumen relativo de cada instrumento (ajustado midiendo cada uno por separado con scripts/render-menu-music.mjs). */
export const MIX: Record<string, number> = { strings: 1.1, spicc: 3, brass: 1, choir: 4, timp: 0.5, tom: 1, kick: 0.63, snare: 2.2, hat: 2.8, crash: 1.4, riser: 2, impact: 0.8, bass: 0.28, piano: 2 };

const INTRO_BARS = 4;
const LOOP_BARS = 24;
/** Acordes de cada compás del bucle. */
const HARMONY: Chord[] = [
  Dm, Bb, F, C, Dm, Bb, Gm, A, // A: tema
  Bb, C, Dm, A, //                B: crescendo
  Dm, Bb, F, C, Dm, Bb, Gm, A, // C: himno
  Gm, Dm, Bb, A, //               D: respiro
];

/** Tema: [paso, nota MIDI, duración en pasos] por compás (8 compases, se repite en el himno una octava arriba). */
const THEME: Array<Array<[number, number, number]>> = [
  [[0, 69, 4], [4, 74, 4], [8, 77, 3], [11, 76, 1], [12, 74, 4]],
  [[0, 70, 4], [4, 74, 4], [8, 77, 4], [12, 79, 4]],
  [[0, 72, 4], [4, 77, 4], [8, 81, 3], [11, 79, 1], [12, 77, 4]],
  [[0, 76, 4], [4, 79, 4], [8, 76, 2], [10, 74, 2], [12, 72, 4]],
  [[0, 74, 4], [4, 81, 6], [10, 79, 2], [12, 77, 4]],
  [[0, 77, 4], [4, 82, 6], [10, 81, 2], [12, 79, 4]],
  [[0, 79, 4], [4, 82, 4], [8, 86, 4], [12, 84, 4]],
  [[0, 81, 8], [8, 85, 4], [12, 81, 4]],
];
const BASS_PATTERN = [0, 0, 12, 0, 0, 12, 7, 12];
/** Arpegio de las cuerdas (índice del acorde por corchea). */
const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
/** Carrera ascendente del crescendo (re menor natural). */
const RUN = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81, 82, 84, 86, 88];

export class MenuMusic {
  readonly nodes: MusicNodes;

  constructor(private readonly k: SynthKit, out: AudioNode) {
    this.nodes = this.build(k.ctx, out);
  }

  private build(ctx: BaseAudioContext, out: AudioNode): MusicNodes {
    const input = ctx.createGain();
    input.gain.value = FLOOR;
    input.connect(out);
    // compresor de bus: junta la orquesta y evita los picos de los golpes de percusión
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -13;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.22;
    const makeup = ctx.createGain();
    makeup.gain.value = 0.8;
    // saturación suave solo en los picos (no hay recortes duros aunque se sumen golpes)
    const soft = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(1.6 * ((i / (curve.length - 1)) * 2 - 1)) / Math.tanh(1.6);
    soft.curve = curve;
    comp.connect(makeup).connect(soft).connect(input);
    const dry = ctx.createGain();
    dry.connect(comp);
    // reverb de sala: respuesta de ruido con caída exponencial y algo de filtrado de agudos
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.6);
    const ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * x);
        d[i] = lp * Math.pow(1 - x, 2.6) * (i < sr * 0.02 ? i / (sr * 0.02) : 1);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    const verb = ctx.createGain();
    verb.connect(conv).connect(wet).connect(comp);
    // eco del tema (corchea con puntillo)
    const delayIn = ctx.createGain();
    delayIn.gain.value = 0.22;
    const dl = ctx.createDelay(1.5);
    dl.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const dlp = this.k.filter('lowpass', 2600, 0.5);
    delayIn.connect(dl).connect(dlp).connect(fb).connect(dl);
    dlp.connect(dry);
    dlp.connect(verb);
    return { input, dry, verb, delayIn };
  }

  // ---------------------------------------------------------------- secuenciador
  scheduleStep(step: number, t: number): void {
    const m = this.nodes;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    if (bar < INTRO_BARS) {
      this.intro(bar, s, t, m);
      return;
    }
    const lb = (bar - INTRO_BARS) % LOOP_BARS;
    const chord = HARMONY[lb];
    if (lb < 8) this.sectionTheme(lb, s, t, chord, m);
    else if (lb < 12) this.sectionBuild(lb - 8, s, t, chord, m);
    else if (lb < 20) this.sectionAnthem(lb - 12, s, t, chord, m);
    else this.sectionBreak(lb - 20, s, t, chord, m);
    // el bucle vuelve con un golpe de platillo
    if (lb === 0 && s === 0) this.crash(t, 0.8, m);
  }

  /** Introducción: bordón grave, cuerdas que crecen, timbales y un coro lejano. */
  private intro(bar: number, s: number, t: number, m: MusicNodes) {
    if (bar === 0 && s === 0) {
      this.strings(t, Dm.pad, BAR * 2, 0.4, m, 1.1, 1000);
      this.bass(t, 26, BAR * 2, 0.6, m);
    }
    if (bar === 2 && s === 0) {
      this.strings(t, Dm.pad, BAR * 2, 0.6, m, 0.9, 1500);
      this.choir(t, Dm.pad.slice(1), BAR * 2, 0.5, m);
      this.bass(t, 26, BAR * 2, 0.7, m);
      this.riser(t, BAR * 2, 0.6, m);
    }
    if (bar === 1 && (s === 0 || s === 8)) this.timp(t, 38, 0.4 + 0.1 * (s / 8), m);
    if (bar === 2 && s % 4 === 0) this.timp(t, 38, 0.45 + 0.08 * (s / 4), m);
    if (bar === 3 && s < 15) this.timp(t, 38, 0.3 + 0.045 * s, m);
    if (bar === 3 && s >= 12 && s % 2 === 0) this.snare(t, 0.4 + (s - 12) * 0.1, m);
  }

  /** Tema en metales con cuerdas en ostinato y marcha de timbal. */
  private sectionTheme(lb: number, s: number, t: number, chord: Chord, m: MusicNodes) {
    if (s === 0) {
      this.strings(t, chord.pad, BAR, 0.4, m, 0.35, 1200);
      if (lb % 2 === 0) this.choir(t, chord.pad.slice(1), BAR * 2, 0.3, m);
    }
    if (s % 2 === 0) this.spicc(t, chord.pad[ARP[s / 2]] + 12, 0.3 + (s % 4 === 0 ? 0.15 : 0), m);
    if (s === 0) this.bass(t, chord.bass, STEP * 7, 0.9, m);
    if (s === 8) this.bass(t, chord.bass + (lb % 2 ? 7 : 12), STEP * 6, 0.75, m);
    if (s === 0 || s === 8) this.timp(t, chord.bass, s === 0 ? 0.85 : 0.55, m);
    if (s === 4 || s === 12) this.snare(t, 0.55, m);
    for (const [st, note, len] of THEME[lb]) if (st === s) this.brass(t, note, len * STEP, 0.62, m, true);
    if (lb === 7 && s >= 12) this.tom(t, [130, 110, 95, 80][s - 12], 0.7, m);
  }

  /** Crescendo: carrera ascendente, redoble de caja que se acelera, timbales y un barrido de ruido. */
  private sectionBuild(i: number, s: number, t: number, chord: Chord, m: MusicNodes) {
    if (i === 0 && s === 0) this.riser(t, BAR * 4 - STEP * 2, 0.9, m);
    if (s === 0) {
      this.strings(t, chord.pad, BAR, 0.6 + 0.15 * i, m, 0.2, 1400 + 500 * i);
      this.choir(t, chord.pad.slice(1).map((n) => n + 12), BAR, 0.6 + 0.2 * i, m);
    }
    const silent = i === 3 && s >= 14; // el silencio justo antes del himno
    if (silent) return;
    if (s === 0) this.bass(t, chord.bass, STEP * 6, 1, m);
    // carrera de cuerdas en semicorcheas
    if (i >= 1) {
      const idx = (i - 1) * 16 + s;
      this.spicc(t, RUN[Math.min(RUN.length - 1, Math.floor(idx / 3))] - (s % 2 ? 12 : 0), 0.45 + 0.12 * i, m);
    }
    // redoble de caja: negras → corcheas → semicorcheas
    const every = i === 0 ? 4 : i === 1 ? 2 : 1;
    if (s % every === 0) this.snare(t, Math.min(1, 0.3 + (i * 16 + s) * 0.011), m);
    if (i === 3 && s < 14) this.timp(t, chord.bass, 0.5 + s * 0.04, m);
    else if (s === 0 || s === 8) this.timp(t, chord.bass, 0.8, m);
  }

  /** Himno: tema doblado una octava, cuerdas, coro, bajo en corcheas, batería y platillos. */
  private sectionAnthem(i: number, s: number, t: number, chord: Chord, m: MusicNodes) {
    if (i === 0 && s === 0) this.impact(t, m);
    if (s === 0) {
      this.strings(t, chord.pad, BAR, 0.5, m, 0.25, 2200);
      this.choir(t, chord.pad.slice(1).map((n) => n + 12), BAR, 0.8, m);
      if (i % 2 === 0) this.crash(t, i === 0 ? 1 : 0.7, m);
    }
    // ostinato de cuerdas en semicorcheas
    const arpNote = chord.pad[[0, 1, 2, 3, 2, 1, 2, 3][s % 8]] + 12;
    this.spicc(t, arpNote, 0.3 + (s % 4 === 0 ? 0.18 : 0), m);
    // bajo en corcheas
    if (s % 2 === 0) this.bass(t, chord.bass + BASS_PATTERN[s / 2], STEP * 1.8, 0.95, m);
    // percusión: bombo y timbal a negras, caja en el contratiempo, hi-hat en semicorcheas
    if (s % 4 === 0) { this.kick(t, 0.9, m); if (s % 8 === 0) this.timp(t, chord.bass, 0.8, m); }
    if (s === 4 || s === 12) this.snare(t, 1, m);
    this.hat(t, s % 4 === 2, s % 4 === 0 ? 0.55 : s % 2 ? 0.28 : 0.4, m);
    // tema: metales (+12) con cuerdas largas dobladas
    for (const [st, note, len] of THEME[i]) {
      if (st !== s) continue;
      this.brass(t, note + 12, len * STEP, 1, m, false);
      this.brass(t, note, len * STEP, 0.55, m, false);
      this.strings(t, [note + 12, note + 7], len * STEP, 0.4, m, 0.05, 3000);
    }
    // relleno de toms al final de cada frase de 4 compases
    if (i % 4 === 3 && s >= 12) this.tom(t, [150, 125, 105, 90][s - 12], 0.9, m);
  }

  /** Respiro: acordes suaves, arpegio de piano y coro; vuelve al tema con un redoble. */
  private sectionBreak(i: number, s: number, t: number, chord: Chord, m: MusicNodes) {
    if (s === 0) {
      this.strings(t, chord.pad, BAR, 0.35, m, 0.5, 1000);
      this.choir(t, chord.pad.slice(1).map((n) => n + 12), BAR, 0.35, m);
      this.bass(t, chord.bass, BAR, 0.6, m);
      this.timp(t, chord.bass, 0.4, m);
    }
    // arpegio de piano en semicorcheas
    const seq = [0, 1, 2, 3, 2, 1, 3, 2];
    this.piano(t, chord.pad[seq[s % 8]] + 24, 0.35 + (s % 4 === 0 ? 0.15 : 0), m);
    if (i === 3 && s >= 8) {
      // redoble final: lleva al tema
      if (s % 2 === 0 || s >= 12) this.snare(t, 0.3 + (s - 8) * 0.08, m);
      this.timp(t, chord.bass, 0.5 + (s - 8) * 0.07, m);
    }
  }

  // ---------------------------------------------------------------- instrumentos
  private send(ctx: BaseAudioContext, from: AudioNode, m: MusicNodes, tag: string, verb: number, dry = 1) {
    const mix = MIX[tag] ?? 1;
    if (mix <= 0) return;
    if (dry > 0) {
      const d = ctx.createGain();
      d.gain.value = dry * mix;
      from.connect(d).connect(m.dry);
    }
    if (verb > 0) {
      const v = ctx.createGain();
      v.gain.value = verb * mix;
      from.connect(v).connect(m.verb);
    }
  }

  /** Cuerdas sostenidas: tres sierras desafinadas por nota, filtro que se abre y vibrato lento. */
  private strings(t: number, notes: number[], dur: number, vel: number, m: MusicNodes, attack: number, cutoff: number) {
    const ctx = this.k.ctx;
    const lp = this.k.filter('lowpass', cutoff * 0.6, 0.7);
    lp.frequency.setValueAtTime(cutoff * 0.6, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + Math.min(dur, 0.9));
    const g = ctx.createGain();
    const a = Math.max(0.03, attack * dur * 0.5);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.045 * vel, t + a);
    g.gain.setValueAtTime(0.045 * vel, t + Math.max(a, dur - 0.18));
    g.gain.linearRampToValueAtTime(FLOOR, t + dur + 0.06);
    lp.connect(g);
    this.send(ctx, g, m, 'strings', 0.55);
    const vib = ctx.createOscillator();
    vib.frequency.value = rand(4.6, 5.6);
    const vg = ctx.createGain();
    vg.gain.value = 7;
    vib.connect(vg);
    vib.start(t);
    vib.stop(t + dur + 0.1);
    for (const n of notes) {
      for (const det of [-9, 0, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        vg.connect(o.detune);
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  /** Cuerdas en spiccato (notas cortas del ostinato). */
  private spicc(t: number, midi: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.004, 0.05 * vel, 0.11);
    const lp = this.k.filter('lowpass', 2600, 0.8);
    lp.connect(g);
    this.send(ctx, g, m, 'spicc', 0.35);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(midi);
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  /** Metales: sierras con filtro que se abre al atacar, un ligero deslizamiento de afinación y eco opcional. */
  private brass(t: number, midi: number, dur: number, vel: number, m: MusicNodes, echo: boolean) {
    const ctx = this.k.ctx;
    const f = mtof(midi);
    const lp = this.k.filter('lowpass', 900, 1.6);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(3400, t + 0.09);
    lp.frequency.exponentialRampToValueAtTime(1800, t + Math.max(0.2, dur));
    const g = ctx.createGain();
    const rel = 0.09;
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.05);
    g.gain.setValueAtTime(0.075 * vel, t + Math.max(0.06, dur - rel));
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur + rel);
    lp.connect(g);
    this.send(ctx, g, m, 'brass', 0.4);
    if (echo) g.connect(m.delayIn);
    for (const det of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.972, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + rel + 0.02);
    }
    // vibrato tardío en las notas largas
    if (dur > STEP * 3) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f * 0.5, t);
      const og = ctx.createGain();
      og.gain.setValueAtTime(FLOOR, t);
      og.gain.linearRampToValueAtTime(0.35, t + 0.12);
      og.gain.exponentialRampToValueAtTime(FLOOR, t + dur + rel);
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur + rel + 0.02);
    }
  }

  /** Coro "aah": sierras por bancos de formantes (vocal abierta), ataque lento y mucha reverb. */
  private choir(t: number, notes: number[], dur: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const g = ctx.createGain();
    const a = Math.min(dur * 0.4, 0.9);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.05 * vel, t + a);
    g.gain.setValueAtTime(0.05 * vel, t + Math.max(a, dur - 0.35));
    g.gain.linearRampToValueAtTime(FLOOR, t + dur + 0.1);
    this.send(ctx, g, m, 'choir', 0.85, 0.5);
    const sum = ctx.createGain();
    sum.gain.value = 1;
    for (const [freq, q, gain] of [[740, 7, 1], [1150, 9, 0.5], [2500, 12, 0.18]] as const) {
      const bp = this.k.filter('bandpass', freq, q);
      const bg = ctx.createGain();
      bg.gain.value = gain;
      sum.connect(bp).connect(bg).connect(g);
    }
    for (const n of notes) {
      for (const det of [-14, -4, 6, 15]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = 0.5;
        o.connect(og).connect(sum);
        o.start(t);
        o.stop(t + dur + 0.15);
      }
    }
  }

  private timp(t: number, midi: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const f = mtof(midi + 12);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.003, 0.5 * vel, 1.0);
    o.connect(g);
    this.send(ctx, g, m, 'timp', 0.5);
    o.start(t);
    o.stop(t + 1.1);
    // golpe de la baqueta
    const n = this.k.noise('brown', t, 0.08);
    const lp = this.k.filter('lowpass', 500, 0.7);
    const ng = ctx.createGain();
    this.k.perc(ng.gain, t, 0.002, 0.22 * vel, 0.07);
    n.connect(lp).connect(ng);
    this.send(ctx, ng, m, 'timp', 0.3);
  }

  private tom(t: number, f: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.002, 0.5 * vel, 0.5);
    o.connect(g);
    this.send(ctx, g, m, 'tom', 0.45);
    o.start(t);
    o.stop(t + 0.6);
  }

  private kick(t: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.08);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.002, 0.7 * vel, 0.32);
    o.connect(g);
    this.send(ctx, g, m, 'kick', 0.12);
    o.start(t);
    o.stop(t + 0.38);
    const n = this.k.noise('white', t, 0.02);
    const hp = this.k.filter('highpass', 3000, 0.7);
    const ng = ctx.createGain();
    this.k.perc(ng.gain, t, 0.0005, 0.1 * vel, 0.006);
    n.connect(hp).connect(ng);
    this.send(ctx, ng, m, 'kick', 0);
  }

  private snare(t: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const n = this.k.noise('white', t, 0.24);
    const hp = this.k.filter('highpass', 1100, 0.7);
    const ng = ctx.createGain();
    this.k.perc(ng.gain, t, 0.001, 0.3 * vel, 0.17);
    n.connect(hp).connect(ng);
    this.send(ctx, ng, m, 'snare', 0.4);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(165, t + 0.06);
    const og = ctx.createGain();
    this.k.perc(og.gain, t, 0.001, 0.24 * vel, 0.08);
    o.connect(og);
    this.send(ctx, og, m, 'snare', 0.2);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, open: boolean, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const d = open ? 0.18 : 0.035;
    const n = this.k.noise('white', t, d + 0.02);
    const hp = this.k.filter('highpass', 7500, 0.8);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.0008, 0.1 * vel, d);
    n.connect(hp).connect(g);
    this.send(ctx, g, m, 'hat', 0.1);
  }

  private crash(t: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const n = this.k.noise('white', t, 2.4);
    const hp = this.k.filter('highpass', 4200, 0.6);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.002, 0.16 * vel, 2.2);
    n.connect(hp).connect(g);
    this.send(ctx, g, m, 'crash', 0.5);
  }

  /** Barrido ascendente de ruido (preludio de un golpe). */
  private riser(t: number, dur: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const n = this.k.noise('white', t, dur);
    const bp = this.k.filter('bandpass', 300, 1.1);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.exponentialRampToValueAtTime(0.14 * vel, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(FLOOR, t + dur);
    n.connect(bp).connect(g);
    this.send(ctx, g, m, 'riser', 0.35);
  }

  /** Golpe de impacto con subgrave (entrada del himno). */
  private impact(t: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.6);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.005, 0.7, 1.7);
    o.connect(g);
    this.send(ctx, g, m, 'impact', 0.3);
    o.start(t);
    o.stop(t + 1.8);
    this.crash(t, 1.1, m);
    this.timp(t, 38, 1, m);
  }

  private bass(t: number, midi: number, dur: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const f = mtof(midi);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = f;
    const lp = this.k.filter('lowpass', 300, 3);
    lp.frequency.setValueAtTime(240, t);
    lp.frequency.exponentialRampToValueAtTime(1100, t + 0.015);
    lp.frequency.exponentialRampToValueAtTime(300, t + Math.max(0.1, dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.01);
    g.gain.setValueAtTime(0.17 * vel, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    const sg = ctx.createGain();
    sg.gain.value = 0.9;
    saw.connect(lp).connect(g);
    sub.connect(sg).connect(g);
    this.send(ctx, g, m, 'bass', 0.08);
    saw.start(t);
    sub.start(t);
    saw.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  private piano(t: number, midi: number, vel: number, m: MusicNodes) {
    const ctx = this.k.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    this.k.perc(g.gain, t, 0.002, 0.07 * vel, 0.55);
    this.send(ctx, g, m, 'piano', 0.5);
    for (const [mult, type, gain] of [[1, 'sine', 1], [2, 'triangle', 0.4], [3, 'sine', 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = gain;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 0.62);
    }
  }
}
