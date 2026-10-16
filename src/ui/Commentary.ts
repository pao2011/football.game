// Comentarista: rótulos de transmisión (y voz opcional, con la síntesis del navegador) a partir de los eventos
// del partido. Elige frases variadas, no repite la última y da prioridad a lo importante (un gol no se pisa).
import type { Match } from '../sim/Match';
import type { MatchEvent } from '../sim/types';
import { esc } from './dom';

type Line = { text: string; prio: number };

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class Commentary {
  private el: HTMLElement;
  private until = 0;
  private prio = 0;
  private last = '';
  private lastSpoken = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private lastShotBy: { name: string; team: number; t: number } | null = null;

  constructor(parent: HTMLElement, private match: Match, private speak = false) {
    this.el = document.createElement('div');
    this.el.className = 'commentary hidden';
    parent.appendChild(this.el);
    if (speak && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const choose = () => {
        const vs = window.speechSynthesis.getVoices();
        this.voice = vs.find((v) => v.lang.toLowerCase().startsWith('es')) ?? null;
      };
      choose();
      window.speechSynthesis.onvoiceschanged = choose;
    }
  }

  private name(id?: string) {
    if (!id) return '';
    return this.match.playersAll.find((p) => p.id === id)?.data.name ?? '';
  }

  private team(i?: number) {
    return i === 0 || i === 1 ? this.match.teams[i].data.name : '';
  }

  private score() {
    const [a, b] = this.match.teams;
    return `${a.data.short} ${a.stats.goals} - ${b.stats.goals} ${b.data.short}`;
  }

  /** Frase para un evento (o null si no merece comentario). */
  lineFor(e: MatchEvent): Line | null {
    const m = this.match;
    const n = this.name(e.playerId);
    const t = this.team(e.team);
    switch (e.type) {
      case 'kick':
        if (e.kind === 'shoot' || e.kind === 'finesse' || e.kind === 'chip') {
          this.lastShotBy = { name: n, team: e.team ?? -1, t: m.time };
          if (e.kind === 'chip') return { text: pick([`¡Intenta la vaselina ${n}!`, `${n} pica el balón por encima…`]), prio: 2 };
        }
        return null;
      case 'skill':
        if (e.kind === 'bicycle') return { text: pick([`¡¡CHILENA de ${n}!!`, `¡Increíble! ¡${n} lo intenta de chilena!`]), prio: 4 };
        if (e.kind === 'scissor') return { text: pick([`¡Tijera de ${n}!`, `¡Remate acrobático de ${n}!`]), prio: 3 };
        if (e.kind === 'volley') return { text: pick([`¡Le pega de volea ${n}!`, `¡Volea de ${n}!`]), prio: 3 };
        if (e.kind === 'beat') return { text: pick([`¡Qué jugada de ${n}! Se va de su marcador`, `${n} lo deja sentado con una ${e.text?.toLowerCase() ?? 'finta'}`]), prio: 2 };
        return null;
      case 'goal':
        if (e.kind === 'shootout') return { text: `${n} marca su penal. ${this.score()}`, prio: 4 };
        if (e.kind === 'own') return { text: pick([`¡En contra! Gol en propia puerta de ${n}`, `¡Qué desgracia para ${n}! Autogol`]) + `. ${this.score()}`, prio: 5 };
        return { text: pick([`¡¡GOOOL de ${n}!!`, `¡¡GOLAZO de ${n}!! ¡Qué definición!`, `¡¡Gol!! ${n} no perdona`, `¡¡Adentro!! ¡Gol de ${t}, lo marca ${n}!`]) + ` ${this.score()}`, prio: 5 };
      case 'save':
        if (e.kind === 'shootout') return { text: pick([`¡Lo ataja ${n}!`, `¡Penal atajado por ${n}!`]), prio: 4 };
        if (e.kind === 'shot') {
          const by = this.lastShotBy && m.time - this.lastShotBy.t < 3 ? this.lastShotBy.name : '';
          return { text: pick([`¡Paradón de ${n}!`, `¡Qué atajada de ${n}!${by ? ` Se lo negó a ${by}` : ''}`, `${n} responde con una gran mano`]), prio: 3 };
        }
        return null;
      case 'post':
        return { text: pick(['¡Al palo!', '¡La madera! ¡Por centímetros!', '¡Uyyy, se estrella en el poste!']), prio: 3 };
      case 'nearMiss':
        return { text: pick(['¡Cerca! Se fue rozando el palo', '¡Uy! Por poco', 'Se va desviado… ¡qué cerca estuvo!']), prio: 2 };
      case 'foul':
        return { text: pick([`Falta de ${n}`, `El árbitro pita falta de ${n}`, `Infracción de ${n}, tiro libre`]), prio: 1 };
      case 'advantage':
        return { text: pick(['¡Ley de la ventaja! Sigue el juego', 'El árbitro deja seguir: ventaja']), prio: 2 };
      case 'handball':
        return { text: pick([`¡Mano de ${e.text ?? n}!`, `El balón le dio en el brazo a ${e.text ?? n}: ¡mano!`]), prio: 3 };
      case 'injury':
        return { text: pick([`${e.text} se duele… parece lesionado`, `Mala noticia: ${e.text} se lesiona y tendrá que salir`]), prio: 3 };
      case 'card':
        if (e.kind === 'yellow') return { text: pick([`Amarilla para ${e.text}`, `Tarjeta amarilla a ${e.text}`]), prio: 3 };
        return { text: pick([`¡Roja! ${e.text} se va a la calle`, `¡Expulsado ${e.text}!`]), prio: 4 };
      case 'warning':
        return { text: `El árbitro le llama la atención a ${e.text}`, prio: 1 };
      case 'offside':
        return { text: pick([`Fuera de juego de ${n}`, `Bandera arriba: ${n} estaba adelantado`]), prio: 2 };
      case 'sub':
        return { text: `Cambio en ${t}: ${e.text}`, prio: 2 };
      case 'phase':
        if (e.kind === 'halftime') return { text: `Descanso. ${this.score()}`, prio: 4 };
        if (e.kind === 'fulltime') return { text: `¡Final del partido! ${this.score()}`, prio: 5 };
        if (e.kind === 'added') return { text: `Se jugarán ${e.text} minutos de descuento`, prio: 2 };
        if (e.kind === 'stoppage' && e.text === 'penalty') return { text: '¡PENAL! El árbitro señala el punto penal', prio: 4 };
        if (e.kind === 'stoppage' && e.text === 'corner') return { text: pick(['Saque de esquina', 'Córner']), prio: 1 };
        return null;
      default:
        return null;
    }
  }

  onEvent(e: MatchEvent) {
    const line = this.lineFor(e);
    if (!line) return;
    const now = this.match.time;
    // no se pisa un comentario más importante que sigue en pantalla
    if (now < this.until && line.prio < this.prio) return;
    if (line.text === this.last) return;
    this.last = line.text;
    this.prio = line.prio;
    this.until = now + 2.2 + line.prio * 0.5;
    this.el.innerHTML = esc(line.text);
    this.el.classList.remove('hidden');
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
    this.say(line);
  }

  private say(line: Line) {
    if (!this.speak || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (line.prio < 3 && now - this.lastSpoken < 4000) return; // sin saturar: lo menor, de vez en cuando
    const synth = window.speechSynthesis;
    if (line.prio >= 4) synth.cancel();
    else if (synth.speaking) return;
    const u = new SpeechSynthesisUtterance(line.text.replace(/¡|!/g, ''));
    u.lang = 'es-ES';
    if (this.voice) u.voice = this.voice;
    u.rate = line.prio >= 4 ? 1.15 : 1.05;
    u.pitch = line.prio >= 5 ? 1.25 : 1;
    synth.speak(u);
    this.lastSpoken = now;
  }

  update() {
    if (this.match.time > this.until) this.el.classList.add('hidden');
  }

  dispose() {
    if (this.speak && typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.el.remove();
  }
}
