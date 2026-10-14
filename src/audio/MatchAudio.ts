import type { AudioEngine } from './AudioEngine';
import type { Match } from '../sim/Match';
import type { MatchEvent } from '../sim/types';

/** Traduce los eventos del partido a sonido: golpeos, silbatos y reacciones del público. */
export class MatchAudio {
  private lastBounce = 0;
  private lastKick = 0;

  constructor(private audio: AudioEngine, private match: Match) {}

  start() {
    this.audio.stopMenuMusic();
    this.audio.startAmbience();
  }

  stop() {
    this.audio.stopAmbience();
  }

  onEvent(e: MatchEvent) {
    const a = this.audio;
    const t = this.match.time;
    switch (e.type) {
      case 'kick':
        if (t - this.lastKick > 0.05) a.kick(e.power ?? 0.4);
        this.lastKick = t;
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
      case 'whistle':
        if (e.kind === 'short' || e.kind === 'long' || e.kind === 'double' || e.kind === 'final') a.whistle(e.kind);
        break;
      case 'goal':
        a.cheer(e.kind === 'shootout' ? 0.6 : 1);
        break;
      case 'save':
        if (e.kind === 'shot' || e.kind === 'shootout') a.applause();
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
  }
}
