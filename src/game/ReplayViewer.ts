// Visor de repeticiones guardadas: reconstruye el estadio y los equipos de la jugada y la reproduce en bucle
// con la cámara de repetición (también permite congelarla y usar el modo foto).
import * as THREE from 'three';
import { Match, type ReplayFrame } from '../sim/Match';
import { MatchView } from '../render/MatchView';
import { HALF_LENGTH } from '../config/constants';
import type { StadiumData } from '../data/types';
import type { GameSettings } from '../config/Settings';
import { decodeFrames, type SavedReplay } from '../modes/SavedReplays';
import type { Weather } from '../sim/Weather';

export class ReplayViewer {
  readonly match: Match;
  readonly view: MatchView;
  private frames: ReplayFrame[];
  private raf = 0;
  private last = 0;
  private disposed = false;
  paused = false;
  /** Velocidad de reproducción (1 = la cámara lenta normal de las repeticiones). */
  speed = 1;

  constructor(renderer: THREE.WebGLRenderer, saved: SavedReplay, stadium: StadiumData, settings: GameSettings) {
    this.frames = decodeFrames(saved.data);
    const first = this.frames[0];
    // titulares = los jugadores que aparecen en la jugada (para que estén sus modelos)
    const lineup = (team: SavedReplay['home']) => {
      const ids = new Set(first ? first.players.map((p) => p.id) : []);
      for (const fr of this.frames) for (const p of fr.players) ids.add(p.id);
      const inClip = team.players.filter((p) => ids.has(p.id)).map((p) => p.id);
      const rest = team.players.filter((p) => !ids.has(p.id)).map((p) => p.id);
      return inClip.concat(rest).slice(0, 11);
    };
    this.match = new Match({
      home: saved.home, away: saved.away, homeKit: saved.homeKit, awayKit: saved.awayKit,
      humanTeam: -1, halfLengthSec: 180, difficulty: 'pro', extraTime: false, penalties: false,
      homeLineup: lineup(saved.home), awayLineup: lineup(saved.away), weather: (saved.weather as Weather | undefined) ?? 'clear',
    });
    const m = this.match;
    m.replayClip = this.frames;
    const end = this.frames[this.frames.length - 1];
    if (end) m.ball.pos.set(Math.sign(saved.goalSide) * HALF_LENGTH * 0.5, end.ball[1], end.ball[2]);
    this.view = new MatchView(renderer, m, stadium, {
      quality: settings.quality, shadows: settings.shadows, cameraStyle: settings.cameraStyle, cameraZoom: settings.cameraZoom, showIndicators: false,
    });
    this.restart();
  }

  /** Duración de la reproducción (s reales). */
  get length() {
    const f = this.frames;
    return f.length > 1 ? (f[f.length - 1].tm - f[0].tm) / 0.6 : 0;
  }

  /** Vuelve al principio de la jugada. */
  restart() {
    const m = this.match;
    m.phase = 'stoppage';
    this.view.update(0, null, null);
    m.time = 0;
    m.phase = 'replay';
    this.view.update(0, null, null);
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  frame(dt: number) {
    const m = this.match;
    if (!this.paused) {
      m.time += dt * this.speed;
      // en bucle, con una pequeña pausa al final
      if (m.time > this.length + 1.2) this.restart();
    }
    this.view.update(this.paused ? 0 : dt * this.speed, null, null);
    this.view.render();
  }

  resize(w: number, h: number) {
    this.view.resize(w, h);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.view.dispose();
  }
}
