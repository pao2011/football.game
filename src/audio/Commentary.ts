import type { Match } from '../sim/Match';
import type { MatchEvent } from '../sim/types';
import type { SpeakOpts, SpeechOut } from './Speech';

/** Importancia de una frase: una más importante corta a la que se está diciendo. */
const enum Pri {
  Chatter = 1,
  Play = 2,
  Big = 3,
  Goal = 4,
}

interface Line {
  text: string;
  pri: Pri;
  /** Tono de la voz: 0 normal … 1 grito de gol. */
  heat: number;
}

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/**
 * Relator del partido (estilo rioplatense): convierte los eventos en frases y las dice con la voz
 * del dispositivo. Habla poco en las jugadas normales y se desgañita en los goles.
 */
export class Commentary {
  /** Volumen de la voz 0..1 (se consulta en cada frase: sigue a la configuración). */
  volume: () => number = () => 0.9;
  private current: Pri = 0 as Pri;
  private lastSpoke = -100;
  private lastTopic = new Map<string, number>();
  private followUp: { at: number; line: Line } | null = null;
  private welcomed = false;
  private shotBy: string | null = null;
  private announcedHalf = 0;
  /** Reloj propio (segundos reales), para no depender del reloj del partido durante las pausas. */
  private now = 0;

  constructor(private speech: SpeechOut, private match: Match, private stadiumName = '') {}

  private teamName(i: number | undefined) {
    return i === 0 || i === 1 ? this.match.teams[i].data.name : '';
  }

  private playerName(id: string | undefined) {
    if (!id) return '';
    for (const t of this.match.teams) for (const p of t.players) if (p.id === id) return p.data.name;
    return '';
  }

  private score() {
    const [h, a] = this.match.teams;
    return `${h.data.name} ${h.stats.goals}, ${a.data.name} ${a.stats.goals}`;
  }

  /** Presentación del partido (al empezar la transmisión). */
  welcome() {
    if (this.welcomed) return;
    this.welcomed = true;
    const [h, a] = this.match.teams;
    const where = this.stadiumName ? ` desde el ${this.stadiumName}` : '';
    this.say(pick([
      `¡Muy buenas tardes${where}! Hoy se enfrentan ${h.data.name} y ${a.data.name}. ¡Qué clima, señores!`,
      `¡Bienvenidos${where}! ${h.data.name} contra ${a.data.name}. La hinchada ya está cantando.`,
      `¡Hola a todos${where}! Está todo listo para ${h.data.name} contra ${a.data.name}.`,
    ]), Pri.Big, 0.25);
  }

  onEvent(e: MatchEvent) {
    const m = this.match;
    if (m.config.training) return;
    const team = this.teamName(e.team);
    const name = e.text || this.playerName(e.playerId);
    switch (e.type) {
      case 'goal': {
        this.followUp = null;
        if (e.kind === 'shootout') {
          this.say(pick(['¡Adentro!', '¡Gol! No falló.', '¡La metió!', '¡Al fondo de la red!']), Pri.Big, 0.6);
          break;
        }
        const scorer = name ? ` ¡${name}!` : '';
        if (e.kind === 'own') {
          this.say(`¡Gol en contra!${name ? ` Desafortunado ${name}.` : ''} ¡Gol de ${team}!`, Pri.Goal, 0.9);
        } else {
          this.say(pick([
            `¡Gooooooooool! ¡Gooooool de ${team}!${scorer}`,
            `¡Goooooool!${scorer} ¡Golazo de ${team}!`,
            `¡Gol, gol, gooooool! ¡${team}!${scorer}`,
          ]), Pri.Goal, 1);
        }
        this.followUp = { at: this.now + 6.5, line: { text: pick([`${this.score()}.`, `Así está el marcador: ${this.score()}.`, `¡Explota el estadio! ${this.score()}.`]), pri: Pri.Big, heat: 0.4 } };
        break;
      }
      case 'kick':
        if (e.kind === 'shoot' || e.kind === 'finesse' || e.kind === 'chip') {
          this.shotBy = name;
          if (name && this.fresh('shot', 6)) this.say(pick([`Remata ${name}…`, `¡Le pega ${name}!`, `¡Prueba ${name}!`, `${name}, de afuera…`]), Pri.Play, 0.55);
        } else if (e.kind === 'penalty') {
          this.say(pick([`Patea ${name}…`, `${name} frente a la pelota… ¡patea!`]), Pri.Big, 0.6);
        } else if (e.kind === 'cross' && name && this.fresh('cross', 10)) {
          this.say(pick([`Centro de ${name}…`, `Tira el centro ${name}`]), Pri.Chatter, 0.3);
        }
        break;
      case 'save':
        if (e.kind === 'shootout') {
          this.say(pick(['¡Lo atajó! ¡Qué arquero!', '¡Atajada! ¡No entró!', '¡La sacó el arquero!']), Pri.Big, 0.8);
        } else if (e.kind === 'shot') {
          this.say(pick([
            `¡Qué atajada de ${name}!`,
            '¡La sacó el arquero! ¡Impresionante!',
            `¡Apareció ${name}! ¡Salvó a su equipo!`,
            '¡Uh, qué manos!',
          ]), Pri.Big, 0.75);
        } else if (this.fresh('punch', 8)) {
          this.say(pick(['La despeja el arquero.', `Rechaza ${name}.`]), Pri.Play, 0.35);
        }
        break;
      case 'post':
        this.say(pick(['¡Palo! ¡Increíble!', '¡En el palo! ¡No lo puedo creer!', '¡Uhhh, la pelota dio en el poste!']), Pri.Big, 0.85);
        break;
      case 'nearMiss':
        this.say(pick(['¡Uy, cerca!', '¡Por poquito!', '¡Afuera por muy poco!', `¡Casi${this.shotBy ? `, ${this.shotBy}` : ''}! Se fue apenas desviada.`]), Pri.Big, 0.7);
        break;
      case 'foul':
        if (this.fresh('foul', 7)) this.say(pick([`Falta de ${name}.`, 'Cobra infracción el árbitro.', `Foul de ${name}.`, 'Falta. Juego peligroso.']), Pri.Play, 0.35);
        break;
      case 'card':
        if (e.kind === 'yellow') this.say(pick([`Amarilla para ${name}.`, `Tarjeta amarilla para ${name}, de ${team}.`]), Pri.Big, 0.45);
        else this.say(pick([`¡Roja! ¡Expulsado ${name}!`, `¡Tarjeta roja para ${name}! ${team} se queda con uno menos.`]), Pri.Big, 0.7);
        break;
      case 'offside':
        if (this.fresh('offside', 8)) this.say(pick(['Posición adelantada.', 'Offside, levanta la bandera el línea.', `Fuera de juego de ${name}.`]), Pri.Play, 0.3);
        break;
      case 'skill':
        if (e.kind === 'beat' && name && this.fresh('skill', 9)) this.say(pick([`¡Qué jugada de ${name}!`, `¡Lo dejó en el camino ${name}!`, `¡Uhh, ${name}, qué lujo!`]), Pri.Play, 0.6);
        break;
      case 'sub':
        if (e.text) {
          const [out, inn] = e.text.split('⇄').map((s) => s.trim());
          this.say(`Cambio en ${team}: sale ${out}, entra ${inn}.`, Pri.Play, 0.2);
        }
        break;
      case 'phase':
        this.onPhase(e);
        break;
    }
  }

  private onPhase(e: MatchEvent) {
    const m = this.match;
    if (e.kind === 'play' && m.half !== this.announcedHalf && m.phase !== 'shootout') {
      // primer saque de cada tiempo
      this.announcedHalf = m.half;
      const lines: Record<number, string[]> = {
        1: ['¡Rueda la pelota! ¡Arrancó el partido!', '¡Comienza el partido! ¡Vamos!', '¡Pita el árbitro y arranca el partido!'],
        2: ['¡Arranca el segundo tiempo!', '¡Se pone en marcha el segundo tiempo!'],
        3: ['¡Comienza la prórroga!'],
        4: ['¡Arranca el segundo tiempo de la prórroga!'],
      };
      this.say(pick(lines[m.half] ?? lines[1]), Pri.Big, 0.5);
      return;
    }
    if (e.kind === 'stoppage') {
      const team = this.teamName(m.restart?.team);
      switch (e.text) {
        case 'penalty':
          this.say(pick([`¡Penal! ¡Penal para ${team}!`, `¡Cobró penal el árbitro! ¡Penal para ${team}!`]), Pri.Big, 0.85);
          break;
        case 'corner':
          if (this.fresh('corner', 8)) this.say(pick([`Córner para ${team}.`, `Tiro de esquina para ${team}.`]), Pri.Play, 0.35);
          break;
        case 'freekick':
          if (this.fresh('freekick', 8)) this.say(pick([`Tiro libre para ${team}.`, `Pelota parada para ${team}, ojo con este tiro libre.`]), Pri.Play, 0.4);
          break;
      }
      return;
    }
    if (e.kind === 'added' && e.text) {
      const n = parseInt(e.text.replace('+', ''), 10);
      if (n > 0) this.say(`Se juegan ${n} ${n === 1 ? 'minuto' : 'minutos'} de descuento.`, Pri.Play, 0.3);
      return;
    }
    if (e.kind === 'halftime') {
      this.say(`Final del primer tiempo. ${this.score()}.`, Pri.Big, 0.35);
    } else if (e.kind === 'fulltime') {
      const [h, a] = m.teams;
      const d = h.stats.goals - a.stats.goals;
      const end = d === 0 ? '¡Empate!' : `¡Ganó ${d > 0 ? h.data.name : a.data.name}!`;
      this.say(`¡Terminó el partido! ${end} ${this.score()}.`, Pri.Big, 0.6);
    } else if (e.kind === 'shootout') {
      this.say('¡Se define todo en los penales! ¡Qué nervios!', Pri.Big, 0.6);
    }
  }

  /** Cada fotograma: dice las frases pendientes y comenta el juego cuando hay silencio. */
  update(dt: number) {
    this.now += dt;
    if (!this.speech.speaking && this.current) this.current = 0 as Pri;
    const f = this.followUp;
    if (f && this.now >= f.at) {
      if (!this.speech.speaking || this.now > f.at + 6) {
        this.followUp = null;
        this.say(f.line.text, f.line.pri, f.line.heat);
      }
      return;
    }
    // relleno: quién lleva la pelota, cuando lleva un rato sin hablar
    const m = this.match;
    if (m.config.training || m.phase !== 'play' || this.speech.speaking || this.now - this.lastSpoke < 11) return;
    const o = m.owner;
    if (!o || Math.random() > dt * 0.25) return;
    const team = this.teamName(o.team);
    const n = o.data.name;
    this.say(pick([
      `La tiene ${n}.`,
      `${team} toca y toca, buscando el espacio.`,
      `Avanza ${n}…`,
      `Juega ${n}, de ${team}.`,
      `${n} levanta la cabeza…`,
      `${team} maneja la pelota.`,
      `Va ${n} por la banda…`,
      `Minuto ${m.minute}. ${this.score()}.`,
    ]), Pri.Chatter, 0.25);
  }

  /** Silencio inmediato (pausa, fin del partido). */
  stop() {
    this.followUp = null;
    this.current = 0 as Pri;
    this.speech.cancel();
  }

  /** ¿Pasó suficiente tiempo desde la última vez que se comentó esto? */
  private fresh(topic: string, gap: number) {
    const last = this.lastTopic.get(topic) ?? -100;
    if (this.now - last < gap) return false;
    this.lastTopic.set(topic, this.now);
    return true;
  }

  private say(text: string, pri: Pri, heat: number) {
    const vol = Math.max(0, Math.min(1, this.volume()));
    if (vol <= 0 || !this.speech.available) return;
    const busy = this.speech.speaking;
    // no pisar una frase igual o más importante; el relleno espera un respiro entre frases
    if (busy && pri <= this.current) {
      // lo importante (inicio del tiempo, tarjeta…) se dice en cuanto termine la frase actual
      if (pri >= Pri.Big && !this.followUp) this.followUp = { at: this.now, line: { text, pri, heat } };
      return;
    }
    if (pri === Pri.Chatter && this.now - this.lastSpoke < 4) return;
    const o: SpeakOpts = {
      rate: 1.02 + 0.2 * heat,
      pitch: 0.95 + 0.25 * heat,
      volume: vol,
    };
    this.current = pri;
    this.lastSpoke = this.now;
    this.speech.speak(text.replace(/\s+/g, ' ').trim(), o);
  }
}
