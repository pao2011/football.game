import * as THREE from 'three';
import { SIM_DT } from '../config/constants';
import type { GameSettings } from '../config/Settings';
import { HumanController } from '../control/HumanController';
import type { StadiumData } from '../data/types';
import type { Input } from '../input/Input';
import { Match, type MatchConfig } from '../sim/Match';
import { MatchView } from '../render/MatchView';
import { HUD } from '../ui/HUD';
import type { AudioEngine } from '../audio/AudioEngine';
import { MatchAudio } from '../audio/MatchAudio';

export interface MatchResultInfo {
  match: Match;
  home: number;
  away: number;
  winner: 0 | 1 | -1;
  penalties: [number, number] | null;
}

/**
 * Ejecuta un partido: bucle de simulación a paso fijo (60 Hz), render, HUD, audio y pausa.
 */
export class MatchRunner {
  readonly match: Match;
  readonly view: MatchView;
  readonly hud: HUD;
  readonly controller: HumanController | null;
  readonly audio: MatchAudio;
  private acc = 0;
  private last = 0;
  private raf = 0;
  paused = false;
  private finishedNotified = false;
  private fulltimeAt = -1;
  onPause: () => void = () => {};
  onFinished: (r: MatchResultInfo) => void = () => {};
  private disposed = false;
  /** Velocidad de simulación (para pruebas automáticas). */
  timeScale = 1;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    config: MatchConfig,
    stadium: StadiumData,
    readonly settings: GameSettings,
    readonly input: Input,
    audioEngine: AudioEngine,
    uiRoot: HTMLElement,
  ) {
    this.match = new Match(config);
    this.view = new MatchView(renderer, this.match, stadium, {
      quality: settings.quality,
      shadows: settings.shadows,
      cameraStyle: settings.cameraStyle,
      cameraZoom: settings.cameraZoom,
      showIndicators: settings.showIndicators,
    });
    const basis = { right: new THREE.Vector3(1, 0, 0), forward: new THREE.Vector3(0, 0, -1) };
    this.controller = config.humanTeam >= 0
      ? new HumanController(input, basis, {
        autoSwitch: settings.autoSwitch,
        passAssist: settings.passAssist,
        powerBarTime: settings.powerBarTime,
        showAimAssist: settings.showIndicators,
      })
      : null;
    if (this.controller) this.match.controllers[config.humanTeam as 0 | 1] = this.controller;
    this.hud = new HUD(uiRoot, this.match, this.controller, settings.bindings);
    this.hud.showRadar = settings.showRadar;
    this.audio = new MatchAudio(audioEngine, this.match);
    this.audio.start();
    this.view.director.startIntro();
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

  /** Avance de un fotograma (también usable por pruebas). */
  frame(dt: number) {
    const m = this.match;
    if (!this.paused) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 8 * Math.max(1, this.timeScale)) {
        this.input.poll(SIM_DT);
        // la base de la cámara orienta el stick
        if (this.controller) this.view.director.basis(this.controller.view.right, this.controller.view.forward);
        if (m.phase === 'replay' && (this.input.pressed('pass') || this.input.pressed('shoot') || !this.settings.replays)) m.skipReplay();
        m.step(SIM_DT);
        for (const e of m.events) {
          this.hud.onEvent(e);
          this.audio.onEvent(e);
          if (e.type === 'net' && e.x !== undefined && e.z !== undefined) this.view.netImpact(e.x, e.z, e.power ?? 0.6);
          if (e.type === 'goal' && e.kind !== 'shootout') this.view.director.addShake(0.25);
        }
        m.events.length = 0;
        this.acc -= SIM_DT;
        steps++;
        if (this.controller?.pauseRequested) {
          this.controller.pauseRequested = false;
          this.pause();
          break;
        }
      }
      if (steps >= 8) this.acc = 0; // evitar espiral de la muerte si el equipo es lento
    } else {
      // en pausa se sigue leyendo la entrada para poder reanudar con Esc
      this.input.poll(dt);
    }
    const team = m.teams.find((t) => t.human);
    const preview = this.controller && team ? this.controller.previewReceiver(m, team) : null;
    const showAim = this.controller && team && this.controller.charge && m.owner === team.controlled ? this.controller.aimDir : null;
    this.view.update(this.paused ? 0 : dt, preview, showAim);
    this.audio.update(this.view.excitement);
    this.hud.update(dt);
    this.view.render();

    if (m.finished && !this.finishedNotified) {
      if (this.fulltimeAt < 0) this.fulltimeAt = m.time;
      if (m.time - this.fulltimeAt > 4.5) {
        this.finishedNotified = true;
        const r = m.result;
        this.onFinished({ match: m, home: r.home, away: r.away, winner: r.winner, penalties: r.penalties });
      }
    }
  }

  pause() {
    if (this.match.finished) return;
    this.paused = true;
    this.onPause();
  }

  resume() {
    this.paused = false;
    this.last = performance.now();
  }

  resize(w: number, h: number) {
    this.view.resize(w, h);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.audio.stop();
    this.hud.dispose();
    this.view.dispose();
  }
}
