import type { AudioEngine, XZ } from './AudioEngine';
import type { Match } from '../sim/Match';
import type { MatchEvent } from '../sim/types';
import { BALL_RADIUS } from '../config/constants';
import { showLevels } from './ShowTimeline';

/** Golpeos con las manos: no suenan como una patada. */
const HAND_KICKS = new Set(['throwin', 'gkthrow']);

/** Traduce los eventos del partido a sonido: golpeos, silbatos y reacciones del público. */
export class MatchAudio {
  private lastBounce = 0;
  private lastKick = 0;
  private lastTouch = 0;
  /** Conducción: momento del último toque del jugador que lleva el balón. */
  private lastDribbleTap = 0;
  private lastTime = -1;
  /** Silbidos de la tribuna cuando el visitante tiene el balón (con histéresis para que no parpadeen). */
  private whistling = false;
  /** Tema especial del estadio (Belgrano, minuto 68): ya empezó / ya terminó en este partido. */
  private specialStarted = false;
  private specialEnded = false;
  private lastShout = -100;
  private whistleSince = 0;

  constructor(private audio: AudioEngine, private match: Match) {}

  start() {
    this.audio.stopMenuMusic();
    this.audio.startAmbience();
    if (this.match.weather !== 'clear') this.audio.startWeather(this.match.weather);
  }

  stop() {
    this.audio.setWhistling(false);
    this.audio.stopRoll();
    this.audio.stopWeather();
    this.audio.clearListener();
    this.audio.stopAmbience();
  }

  onEvent(e: MatchEvent) {
    const a = this.audio;
    const t = this.match.time;
    // dónde suena: el punto del evento o, si no lo trae, donde está el balón
    const b = this.match.ball.pos;
    const at: XZ = e.x !== undefined && e.z !== undefined ? { x: e.x, z: e.z } : { x: b.x, z: b.z };
    switch (e.type) {
      case 'kick':
        if (t - this.lastKick > 0.05) {
          if (e.kind === 'header') a.header(e.power ?? 0.5, at);
          else if (e.kind && HAND_KICKS.has(e.kind)) a.touch(0.35, at);
          else a.kick(e.power ?? 0.4, at);
        }
        this.lastKick = t;
        this.lastDribbleTap = t;
        break;
      case 'touch':
        if (t - this.lastTouch > 0.08 && t - this.lastKick > 0.05) a.touch(0.25 + 0.75 * (e.power ?? 0.3), at);
        this.lastTouch = t;
        this.lastDribbleTap = t;
        break;
      case 'catch':
        a.gloveCatch(at);
        break;
      case 'bounce':
        if (t - this.lastBounce > 0.08) a.bounce(e.power ?? 0.3, at);
        this.lastBounce = t;
        break;
      case 'post':
        a.post(at);
        a.ooh();
        break;
      case 'net':
        a.net(at);
        break;
      case 'out': {
        // balón fuerte que se va fuera: golpe contra las vallas publicitarias
        const sp = this.match.ball.speed;
        if (sp > 7) setTimeout(() => a.boards(Math.min(1, (sp - 5) / 18), at), 120);
        break;
      }
      case 'whistle':
        if (e.kind === 'short' || e.kind === 'long' || e.kind === 'double' || e.kind === 'final') a.whistle(e.kind);
        break;
      case 'goal':
        a.cheer(e.kind === 'shootout' ? 0.6 : 1);
        if (e.kind !== 'shootout') a.goalHorn();
        break;
      case 'save':
        if (e.kind === 'shot' || e.kind === 'shootout') a.applause();
        else a.glovePunch(at); // desvío con las manos o los puños
        break;
      case 'skill':
        // regate que supera al rival, o chilena / tijera: el público se levanta
        if (e.kind === 'beat' || e.kind === 'bicycle' || e.kind === 'scissor' || e.kind === 'scorpion') a.ooh();
        break;
      case 'nearMiss':
        a.ooh();
        break;
      case 'foul':
      case 'handball':
        a.boo();
        break;
      case 'tackle':
        a.tackle(at);
        break;
      case 'offside':
        a.groan();
        break;
      case 'card':
        a.boo();
        break;
      case 'phase':
        if (e.kind !== 'play' && this.whistling) {
          this.whistling = false;
          this.whistleSince = 0;
          a.setWhistling(false);
        }
        if (e.kind === 'fulltime') a.applause();
        break;
    }
  }

  /** cam: cámara del partido (para el sonido 3D: paneo y distancia de los sonidos del balón). */
  update(excitement: number, cam?: { position: { x: number; z: number }; matrixWorld: { elements: ArrayLike<number> } }) {
    this.audio.setExcitement(excitement);
    if (cam) {
      const e = cam.matrixWorld.elements; // columna 0 = vector "derecha" de la cámara
      this.audio.setListener(cam.position.x, cam.position.z, e[0], e[2]);
    }
    const m = this.match;
    const t = m.time;
    const running = t !== this.lastTime && m.phase !== 'replay';
    this.lastTime = t;
    const b = m.ball;
    const onGround = !b.held && b.pos.y < BALL_RADIUS + 0.06;
    const hSpeed = Math.hypot(b.vel.x, b.vel.z);
    // el minuto 68 de Belgrano: el tema entra en el 66, a todo volumen en el 68 y se apaga hacia el 72
    if (this.audio.hasSpecialChant && !m.config.training) {
      const lv = showLevels(m.matchSeconds / 60);
      if (lv.audioOn && !this.specialStarted) {
        this.specialStarted = true;
        this.audio.playSpecialChant();
      }
      if (this.specialStarted && !this.specialEnded) {
        this.audio.setSpecialChantLevel(lv.audio);
        if (!lv.audioOn) {
          this.specialEnded = true;
          this.audio.endSpecialChant();
        }
        // gritos de la hinchada mientras dura lo más fuerte
        if (lv.visual > 0.8 && t - this.lastShout > 6) {
          this.lastShout = t;
          this.audio.cheer(0.6 + 0.4 * lv.visual);
        }
      }
    }
    // la hinchada local silba cuando el visitante lleva la pelota: tras 1,2 s seguidos y hasta 1 s sin ella
    const against = running && m.phase === 'play' && !m.config.training && m.possessionTeam === 1;
    if (against !== this.whistling) {
      if (this.whistleSince === 0) this.whistleSince = t;
      if (t - this.whistleSince >= (against ? 1.2 : 1)) {
        this.whistling = against;
        this.whistleSince = 0;
        this.audio.setWhistling(against);
      }
    } else {
      this.whistleSince = 0;
    }
    // pelota rodando suelta por el césped (el jugador que conduce tapa casi todo el rodar)
    this.audio.setRoll(running ? (m.owner ? hSpeed * 0.35 : hSpeed) : 0, onGround, { x: b.pos.x, z: b.pos.z });
    // toques de conducción: más seguidos cuanto más rápido corre el jugador
    const o = m.owner;
    if (running && o && onGround && m.phase === 'play') {
      const sp = Math.hypot(o.vel.x, o.vel.z);
      const gap = Math.max(0.26, 0.62 - sp * 0.045);
      if (sp > 1.5 && t - this.lastDribbleTap > gap) {
        this.lastDribbleTap = t;
        this.audio.touch(0.12 + Math.min(0.25, sp * 0.03), { x: b.pos.x, z: b.pos.z });
      }
    } else if (!o) {
      this.lastDribbleTap = t;
    }
  }
}
