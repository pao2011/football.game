import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

/**
 * Voz del narrador: usa el sintetizador de voz del sistema, que en la práctica son voces humanas
 * grabadas/neuronales (Edge: "Microsoft Tomás Online (Natural)", Chrome: "Google español",
 * Windows: Pablo/Raúl/Sabina, Android: voces de Google TTS, macOS/iOS: Diego/Jorge/Mónica…).
 *
 *   - Navegador, Electron y jugar.html: Web Speech API (speechSynthesis).
 *   - App de Android: el WebView no trae speechSynthesis, así que se usa el TTS nativo
 *     (plugin @capacitor-community/text-to-speech).
 */
export interface SpeakOpts {
  rate: number;
  pitch: number;
  volume: number;
}

export interface SpeechOut {
  readonly available: boolean;
  readonly speaking: boolean;
  speak(text: string, o: SpeakOpts): void;
  cancel(): void;
  /** Nombre de la voz elegida (para la configuración). */
  readonly voiceName: string;
}

/** Puntuación de una voz para narrar en castellano: rioplatense y "natural" primero. */
export function voiceScore(v: { name: string; lang: string; localService?: boolean }): number {
  const lang = v.lang.replace('_', '-').toLowerCase();
  if (!lang.startsWith('es')) return -1;
  let s = 10;
  if (lang === 'es-ar') s += 40;
  else if (lang === 'es-uy' || lang === 'es-419' || lang === 'es-us' || lang === 'es-mx' || lang === 'es-cl' || lang === 'es-co') s += 28;
  else if (lang === 'es-es') s += 18;
  // voces neuronales / en línea: suenan a persona de verdad
  if (/natural|neural|online|premium|enhanced|mejorada/i.test(v.name)) s += 30;
  else if (/google/i.test(v.name)) s += 20;
  // voz masculina de relator si la hay
  if (/tom[aá]s|jorge|pablo|ra[uú]l|[aá]lvaro|diego|juan|carlos|enrique|andr[eé]s|gonzalo|lorenzo|mateo|alonso|dario|elias|gerardo|male|hombre/i.test(v.name)) s += 6;
  if (/compact|espeak|robot/i.test(v.name)) s -= 25;
  return s;
}

class WebSpeech implements SpeechOut {
  private voice: SpeechSynthesisVoice | null = null;
  private busy = false;
  /** Límite de seguridad: algunos navegadores nunca avisan del final de la frase. */
  private busyUntil = 0;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private readonly synth = window.speechSynthesis;

  constructor() {
    this.pickVoice();
    this.synth.addEventListener?.('voiceschanged', () => this.pickVoice());
  }

  get available() {
    return true;
  }

  get speaking() {
    return this.busy && performance.now() < this.busyUntil;
  }

  get voiceName() {
    return this.voice?.name ?? '';
  }

  private pickVoice() {
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -1;
    for (const v of this.synth.getVoices()) {
      const s = voiceScore(v);
      if (s > bestScore) {
        best = v;
        bestScore = s;
      }
    }
    this.voice = best;
  }

  speak(text: string, o: SpeakOpts) {
    if (!this.voice) this.pickVoice();
    this.busy = true;
    this.busyUntil = performance.now() + 1500 + (text.length * 75) / o.rate;
    const go = () => {
      this.pending = null;
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice?.lang ?? 'es-AR';
      u.rate = o.rate;
      u.pitch = o.pitch;
      u.volume = o.volume;
      const done = () => {
        if (u === this.utterance) this.busy = false;
      };
      this.utterance = u;
      u.onend = done;
      u.onerror = done;
      this.synth.speak(u);
      // Chrome a veces se queda "en pausa" tras cambiar de pestaña
      if (this.synth.paused) this.synth.resume();
    };
    if (this.synth.speaking || this.synth.pending) {
      this.synth.cancel();
      // Chrome descarta la frase si se habla justo después de cancelar
      if (this.pending) clearTimeout(this.pending);
      this.pending = setTimeout(go, 60);
    } else {
      go();
    }
  }

  cancel() {
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    this.busy = false;
    this.utterance = null;
    this.synth.cancel();
  }
}

class NativeSpeech implements SpeechOut {
  private busy = false;
  private busyUntil = 0;
  private lang = 'es-AR';
  private seq = 0;

  constructor() {
    // el motor de Android puede no tener rioplatense: se busca la mejor variante de español
    (async () => {
      for (const l of ['es-AR', 'es-US', 'es-MX', 'es-ES', 'es']) {
        try {
          if ((await TextToSpeech.isLanguageSupported({ lang: l })).supported) {
            this.lang = l;
            return;
          }
        } catch {
          return;
        }
      }
    })();
  }

  get available() {
    return true;
  }

  get speaking() {
    return this.busy && performance.now() < this.busyUntil;
  }

  get voiceName() {
    return `Android TTS (${this.lang})`;
  }

  speak(text: string, o: SpeakOpts) {
    const id = ++this.seq;
    this.busy = true;
    this.busyUntil = performance.now() + 1500 + (text.length * 75) / o.rate;
    const done = () => {
      if (id === this.seq) this.busy = false;
    };
    // speak() reemplaza lo que estuviera diciendo (QUEUE_FLUSH en Android)
    TextToSpeech.speak({ text, lang: this.lang, rate: o.rate, pitch: o.pitch, volume: o.volume, category: 'ambient' }).then(done, done);
  }

  cancel() {
    this.seq++;
    this.busy = false;
    TextToSpeech.stop().catch(() => undefined);
  }
}

class NoSpeech implements SpeechOut {
  readonly available = false;
  readonly speaking = false;
  readonly voiceName = '';
  speak() {}
  cancel() {}
}

let shared: SpeechOut | null = null;

/** Salida de voz del dispositivo (una sola para toda la app). */
export function getSpeech(): SpeechOut {
  if (shared) return shared;
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TextToSpeech')) shared = new NativeSpeech();
    else if (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function') shared = new WebSpeech();
    else shared = new NoSpeech();
  } catch {
    shared = new NoSpeech();
  }
  return shared;
}
