import type { AudioEngine } from './AudioEngine';
import type { Match } from '../sim/Match';
import type { MatchEvent } from '../sim/types';
import { BALL_RADIUS } from '../config/constants';

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

  constructor(private audio: AudioEngine, private match: Match) {}

  start() {
    this.audio.stopMenuMusic();
    this.audio.startAmbience();
  }

  stop() {
    this.audio.stopRoll();
    this.audio.stopAmbience();
  }

  onEvent(e: MatchEvent) {
    const a = this.audio;
    const t = this.match.time;
    switch (e.type) {
      case 'kick':
        if (t - this.lastKick > 0.05) {
          if (e.kind === 'header') a.header(e.power ?? 0.5);
          else if (e.kind && HAND_KICKS.has(e.kind)) a.touch(0.35);
          else a.kick(e.power ?? 0.4);
        }
        this.lastKick = t;
        this.lastDribbleTap = t;
        break;
      case 'touch':
        if (t - this.lastTouch > 0.08 && t - this.lastKick > 0.05) a.touch(0.25 + 0.75 * (e.power ?? 0.3));
        this.lastTouch = t;
        this.lastDribbleTap = t;
        break;
      case 'catch':
        a.gloveCatch();
        break;
      case 'bounce':
        if (t - this.lastBounce > 0.08) a.bounce(e.power ?? 0.3);
        this.lastBounce = t;
        break;
      case 'post':
        a.post();
        a.ooh();
        break;
      case 'net':
        a.net();
        break;
      case 'out': {
        // balón fuerte que se va fuera: golpe contra las vallas publicitarias
        const sp = this.match.ball.speed;
        if (sp > 7) setTimeout(() => a.boards(Math.min(1, (sp - 5) / 18)), 120);
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
        else a.glovePunch(); // desvío con las manos o los puños
        break;
      case 'skill':
        // regate que supera al rival, o chilena / tijera: el público se levanta
        if (e.kind === 'beat' || e.kind === 'bicycle' || e.kind === 'scissor') a.ooh();
        break;
      case 'nearMiss':
        a.ooh();
        break;
      case 'foul':
        a.boo();
        break;
      case 'tackle':
        a.tackle();
        break;
      case 'offside':
        a.groan();
        break;
      case 'card':
        a.boo();
        break;
      case 'phase':
        if (e.kind === 'fulltime') a.applause();
        break;
    }
  }

  update(excitement: number) {
    this.audio.setExcitement(excitement);
    const m = this.match;
    const t = m.time;
    const running = t !== this.lastTime && m.phase !== 'replay';
    this.lastTime = t;
    const b = m.ball;
    const onGround = !b.held && b.pos.y < BALL_RADIUS + 0.06;
    const hSpeed = Math.hypot(b.vel.x, b.vel.z);
    // pelota rodando suelta por el césped (el jugador que conduce tapa casi todo el rodar)
    this.audio.setRoll(running ? (m.owner ? hSpeed * 0.35 : hSpeed) : 0, onGround);
    // toques de conducción: más seguidos cuanto más rápido corre el jugador
    const o = m.owner;
    if (running && o && onGround && m.phase === 'play') {
      const sp = Math.hypot(o.vel.x, o.vel.z);
      const gap = Math.max(0.26, 0.62 - sp * 0.045);
      if (sp > 1.5 && t - this.lastDribbleTap > gap) {
        this.lastDribbleTap = t;
        this.audio.touch(0.12 + Math.min(0.25, sp * 0.03));
      }
    } else if (!o) {
      this.lastDribbleTap = t;
    }
  }
}
