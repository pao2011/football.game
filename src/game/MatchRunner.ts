import * as THREE from 'three';
import { SIM_DT } from '../config/constants';
import type { GameSettings } from '../config/Settings';
import { HumanController } from '../control/HumanController';
import type { StadiumData } from '../data/types';
import type { Input } from '../input/Input';
import { Match, type MatchConfig } from '../sim/Match';
import { MatchView } from '../render/MatchView';
import type { MatchEvent } from '../sim/types';
import { HUD } from '../ui/HUD';
import type { AudioEngine } from '../audio/AudioEngine';
import { MatchAudio } from '../audio/MatchAudio';
import { TouchControls, isTouchDevice } from '../input/TouchControls';
import { loadJSON, saveJSON } from '../save/Storage';
import { RemoteInput, captureFrame, type InputFrame } from '../net/RemoteInput';
import { GuestSync, HostSync, type Snapshot } from '../net/NetSync';
import type { ControlSettings } from '../control/HumanController';

/** Enlace con el rival en un partido online (los mensajes van por el servidor). */
export interface OnlineLink {
  role: 'host' | 'guest';
  /** Envía un mensaje al rival. */
  send(d: object): void;
}

/** Duración de la presentación del partido (s). */
const INTRO_SECONDS = 5.4;

export interface MatchResultInfo {
  match: Match;
  home: number;
  away: number;
  winner: 0 | 1 | -1;
  penalties: [number, number] | null;
}

function controlSettings(s: GameSettings, touch: boolean): ControlSettings {
  return {
    autoSwitch: s.autoSwitch,
    passAssist: s.passAssist,
    powerBarTime: s.powerBarTime,
    showAimAssist: s.showIndicators,
    assist: s.assist === 'on' || (s.assist === 'auto' && touch),
  };
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
  /** Controles táctiles (solo en móvil o si se activan en la configuración). */
  readonly touch: TouchControls | null;
  private acc = 0;
  private last = 0;
  private raf = 0;
  paused = false;
  private finishedNotified = false;
  private fulltimeAt = -1;
  onPause: () => void = () => {};
  onFinished: (r: MatchResultInfo) => void = () => {};
  private disposed = false;
  private audioEngine: AudioEngine;
  private lastPowerShot = -10;
  private readonly anchorV = new THREE.Vector3();
  /** Presentación inicial en curso (la simulación espera mientras dura). */
  inIntro = false;
  private introFrames = 0;
  private introEndAt = 0;
  private introStadium: StadiumData | null = null;
  private pendingTip: string | null = null;
  /** Velocidad de simulación (para pruebas automáticas). */
  timeScale = 1;
  /** Equipo del jugador local (0 local, 1 visitante, -1 ninguno). */
  readonly localTeam: 0 | 1 | -1;
  /** Partido online: el anfitrión simula; el invitado dibuja lo que recibe. */
  readonly online: OnlineLink | null;
  /** Anfitrión: mandos del rival y su controlador. */
  readonly remoteInput: RemoteInput | null = null;
  readonly remoteController: HumanController | null = null;
  private hostSync: HostSync | null = null;
  /** Invitado: instantáneas recibidas. */
  readonly guestSync: GuestSync | null = null;
  private guestFrames: InputFrame[] = [];
  private readonly guestRight = new THREE.Vector3(1, 0, 0);
  private readonly guestForward = new THREE.Vector3(0, 0, -1);

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    config: MatchConfig,
    stadium: StadiumData,
    readonly settings: GameSettings,
    readonly input: Input,
    audioEngine: AudioEngine,
    uiRoot: HTMLElement,
    online: OnlineLink | null = null,
  ) {
    this.match = new Match(config);
    this.online = online;
    this.localTeam = config.humanTeam;
    if (config.humanTeam >= 0) this.match.autoSubs[config.humanTeam as 0 | 1] = settings.autoSubs;
    this.view = new MatchView(renderer, this.match, stadium, {
      quality: settings.quality,
      shadows: settings.shadows,
      cameraStyle: settings.cameraStyle,
      cameraZoom: settings.cameraZoom,
      showIndicators: settings.showIndicators,
    });
    const basis = { right: new THREE.Vector3(1, 0, 0), forward: new THREE.Vector3(0, 0, -1) };
    const wantTouch = settings.touchControls === 'on' || (settings.touchControls === 'auto' && isTouchDevice());
    const isGuest = online?.role === 'guest';
    this.controller = config.humanTeam >= 0 && !isGuest
      ? new HumanController(input, basis, controlSettings(settings, wantTouch))
      : null;
    if (this.controller) this.match.controllers[config.humanTeam as 0 | 1] = this.controller;
    if (online?.role === 'host') {
      // el rival controla el equipo visitante con sus mandos (recibidos por la red)
      const remote = new RemoteInput();
      const rbasis = { right: new THREE.Vector3(1, 0, 0), forward: new THREE.Vector3(0, 0, -1) };
      const rc = new HumanController(remote, rbasis, controlSettings(settings, false));
      this.remoteInput = remote;
      this.remoteController = rc;
      this.match.teams[1].human = true;
      this.match.controllers[1] = rc;
      this.hostSync = new HostSync(this.match, rc, 1);
    }
    if (isGuest) {
      this.guestSync = new GuestSync(this.match);
      // el HUD muestra la barra de potencia y la mentalidad que calcula el anfitrión
      this.hud = new HUD(uiRoot, this.match, this.guestSync.ctrlView as unknown as HumanController, settings.bindings);
      online!.send({ k: 'cfg', s: controlSettings(settings, wantTouch) });
    } else {
      this.hud = new HUD(uiRoot, this.match, this.controller, settings.bindings);
    }
    this.hud.showRadar = settings.showRadar;
    this.hud.popups = settings.popups;
    this.touch = wantTouch && (this.controller || isGuest) ? new TouchControls(uiRoot, input) : null;
    document.body.classList.toggle('touch', !!this.touch);
    if (this.touch) {
      // consejo de uso las primeras partidas
      const shown = loadJSON<number>('touch-tip', 0);
      if (shown < 3) {
        saveJSON('touch-tip', shown + 1);
        this.pendingTip = '<b>TOCA</b> PASE o TIRO = automático · <b>MANTÉN</b> = potencia · <b>ROSCA / VASELINA / RASO / POTENTE</b> = tipo de tiro (mantén uno y toca otro para combinar)';
      }
    }
    this.audio = new MatchAudio(audioEngine, this.match);
    this.audio.start();
    // hinchada: el sonido de cada cohete sale de su explosión
    this.view.stadium.fans.onBurst = (d) => audioEngine.firework(d);
    this.audioEngine = audioEngine;
    if (this.touch) this.view.director.bottomSafe = -0.4;
    if (!config.training) {
      // la presentación empieza cuando ya se dibujan fotogramas (no mientras carga la escena)
      this.inIntro = true;
      this.introStadium = stadium;
    } else {
      this.showTip();
    }
  }

  private showTip() {
    if (this.pendingTip) this.hud.showToast(this.pendingTip, '#19e68c', 9);
    this.pendingTip = null;
  }

  /** Termina la presentación (al acabar o si el jugador la salta con un toque o una tecla). */
  skipIntro() {
    if (!this.inIntro) return;
    this.inIntro = false;
    this.hud.endIntro();
    this.view.director.endIntro();
    this.showTip();
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
    if (this.inIntro && !this.paused) {
      // presentación: la simulación espera; cualquier botón la salta
      if (this.introFrames < 3 && ++this.introFrames === 3) {
        this.hud.playIntro(this.introStadium!, () => this.skipIntro());
        // recibimiento: fuegos artificiales, bengalas, papelitos y cántico con bombo
        this.view.stadium.fans.welcome();
        this.audioEngine.chant(1);
        this.view.director.startIntro(INTRO_SECONDS);
        this.introEndAt = performance.now() + (INTRO_SECONDS * 1000) / this.timeScale;
      }
      this.input.poll(dt);
      const pausePressed = this.input.pressed('pause');
      if ((this.introFrames >= 3 && performance.now() >= this.introEndAt) || pausePressed || (['pass', 'shoot', 'sprint', 'through', 'lob'] as const).some((a) => this.input.pressed(a))) this.skipIntro();
      this.input.poll(0);
      // Esc / pausa siempre abre el menú de pausa, también durante la presentación
      if (pausePressed) this.pause();
    } else if (this.guestSync) {
      this.guestFrame(dt);
    } else if (!this.paused || this.online) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 8 * Math.max(1, this.timeScale)) {
        this.input.poll(SIM_DT);
        if (this.input.pressed('pause')) {
          this.pause();
          // online el partido no se detiene
          if (!this.online) break;
        }
        const ri = this.remoteInput;
        if (ri && this.remoteController) {
          ri.poll(SIM_DT);
          this.remoteController.view.right.set(ri.right.x, 0, ri.right.z);
          this.remoteController.view.forward.set(ri.forward.x, 0, ri.forward.z);
        }
        // la base de la cámara orienta el stick
        if (this.controller) this.view.director.basis(this.controller.view.right, this.controller.view.forward);
        if (m.phase === 'replay' && (this.input.pressed('pass') || this.input.pressed('shoot') || !this.settings.replays)) m.skipReplay();
        m.step(SIM_DT);
        for (const e of m.events) this.handleEvent(e);
        if (this.hostSync) {
          this.hostSync.collect(m.events);
          const snap = this.hostSync.step(SIM_DT);
          if (snap) this.online!.send(snap);
        }
        m.events.length = 0;
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps >= 8) this.acc = 0; // evitar espiral de la muerte si el equipo es lento
    } else {
      // en pausa se sigue leyendo la entrada para poder reanudar con Esc
      this.input.poll(dt);
    }
    const team = this.localTeam >= 0 ? m.teams[this.localTeam as 0 | 1] : undefined;
    const preview = this.controller && team ? this.controller.previewReceiver(m, team) : null;
    const charging = !!(this.controller && team && this.controller.charge && m.owner === team.controlled);
    const showAim = charging ? this.controller!.aimDir : null;
    const aimTarget = charging && this.controller!.charge?.action === 'shoot' ? this.controller!.aimTarget : null;
    // tiro potente (LB + RB + B): la cámara hace un pequeño zoom
    if (this.controller && this.controller.powerShotAt > this.lastPowerShot) {
      this.lastPowerShot = this.controller.powerShotAt;
      this.view.director.zoomPunch(1);
    }
    // tiro libre directo: trayectoria prevista, mira y cámara del lanzador
    const gfk = this.guestSync?.freeKick ?? null;
    const fk = this.controller?.freeKick ?? (gfk && m.restart?.type !== 'penalty' ? gfk : null);
    this.view.freeKick = fk ?? this.controller?.penaltyAim ?? gfk;
    this.view.director.freeKickAim = fk;
    this.touch?.setFreeKick(!!fk);
    this.view.update(this.paused ? 0 : dt, preview, showAim, aimTarget);
    // barra de potencia encima de la cabeza del jugador controlado
    const cp = team?.controlled;
    if (cp && !cp.sentOff) {
      const v = this.anchorV.set(cp.pos.x, cp.data.height + 1.15, cp.pos.z).project(this.view.camera);
      const el = this.renderer.domElement;
      this.hud.powerAnchor = v.z < 1 ? { x: (v.x * 0.5 + 0.5) * el.clientWidth, y: (-v.y * 0.5 + 0.5) * el.clientHeight } : null;
    } else {
      this.hud.powerAnchor = null;
    }
    this.audio.update(this.view.excitement);
    this.hud.update(dt);
    if (this.touch && team) {
      const pt = m.possessionTeam;
      // con el balón suelto se mantiene el modo anterior (evita parpadeos de botones)
      if (pt !== -1 || m.phase !== 'play') this.touch.setContext(pt === team.index || m.gkHolding?.team === team.index || (m.phase !== 'play' && m.restart?.team === team.index));
      this.touch.setVisible(!this.paused && !this.inIntro && m.phase !== 'replay' && !m.finished);
    }
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

  private handleEvent(e: MatchEvent) {
    const m = this.match;
    this.hud.onEvent(e);
    this.audio.onEvent(e);
    if (e.type === 'net' && e.x !== undefined && e.z !== undefined) this.view.netImpact(e.x, e.z, e.power ?? 0.6);
    if (e.type === 'goal' && e.kind !== 'shootout') {
      this.view.director.addShake(0.25);
      if (e.team === 0 || e.team === 1) this.view.stadium.fans.goal(e.team);
      // tras el grito de gol, la hinchada canta
      setTimeout(() => { if (!this.disposed) this.audioEngine.chant(0.8); }, 3200);
    }
    // vibración en el móvil: golpeos propios y goles
    if (this.touch && navigator.vibrate) {
      if (e.type === 'kick' && e.team !== undefined && e.team === this.localTeam) navigator.vibrate(e.kind === 'shoot' || e.kind === 'finesse' || e.kind === 'chip' ? 28 : 12);
      if (e.type === 'goal') navigator.vibrate([60, 50, 90]);
    }
  }

  /** Invitado online: manda sus mandos y dibuja lo que llega del anfitrión. */
  private guestFrame(dt: number) {
    let steps = 0;
    this.acc += dt;
    while (this.acc >= SIM_DT && steps < 8) {
      this.input.poll(SIM_DT);
      if (this.input.pressed('pause')) this.pause();
      this.view.director.basis(this.guestRight, this.guestForward);
      this.guestFrames.push(captureFrame(this.input, this.guestRight, this.guestForward, this.paused));
      this.acc -= SIM_DT;
      steps++;
    }
    if (steps >= 8) this.acc = 0;
    if (this.guestFrames.length >= 2) this.online!.send({ k: 'i', f: this.guestFrames.splice(0) });
    for (const e of this.guestSync!.update(performance.now())) this.handleEvent(e);
  }

  /** Mensaje del rival (reenviado por el servidor). */
  receive(d: { k?: string; [key: string]: unknown }) {
    if (!d || typeof d !== 'object') return;
    if (this.guestSync) {
      if (d.k === 's') this.guestSync.push(d as unknown as Snapshot, performance.now());
    } else if (this.remoteInput && this.remoteController) {
      if (d.k === 'i' && Array.isArray(d.f)) this.remoteInput.push((d.f as InputFrame[]).slice(0, 30));
      else if (d.k === 'sub') this.match.requestSub(1, String(d.o), String(d.n));
      else if (d.k === 'unsub') this.match.cancelSub(1, String(d.o));
      else if (d.k === 'cfg' && d.s && typeof d.s === 'object') {
        const c = d.s as Partial<ControlSettings>;
        this.remoteController.settings = {
          autoSwitch: c.autoSwitch !== false,
          passAssist: Math.max(0, Math.min(1, Number(c.passAssist ?? 1))),
          powerBarTime: Math.max(0.5, Math.min(2, Number(c.powerBarTime ?? 1))),
          showAimAssist: true,
          assist: !!c.assist,
        };
      }
    }
    if (d.k === 'chat' && typeof d.text === 'string') {
      const other = this.localTeam === 0 ? 1 : 0;
      this.hud.onEvent({ type: 'chat', team: other, text: d.text.slice(0, 60) });
    }
  }

  /** Mensaje rápido al rival (online). */
  sendChat(text: string) {
    if (!this.online) return;
    this.online.send({ k: 'chat', text });
    this.hud.onEvent({ type: 'chat', team: this.localTeam, text });
  }

  /** Pide un cambio para el equipo local (devuelve el motivo si no se puede). */
  requestSub(outId: string, inId: string): string | null {
    if (this.localTeam < 0) return 'No controlas ningún equipo';
    if (this.guestSync) {
      // el cambio lo hace el anfitrión (y llega en la próxima instantánea)
      const err = this.match.subError(this.localTeam as 0 | 1, outId, inId);
      if (err) return err;
      this.match.requestSub(this.localTeam as 0 | 1, outId, inId);
      this.online!.send({ k: 'sub', o: outId, n: inId });
      return null;
    }
    return this.match.requestSub(this.localTeam as 0 | 1, outId, inId);
  }

  cancelSub(outId: string) {
    if (this.localTeam < 0) return;
    this.match.cancelSub(this.localTeam as 0 | 1, outId);
    if (this.guestSync) this.online!.send({ k: 'unsub', o: outId });
  }

  pause() {
    if (this.match.finished) return;
    this.paused = true;
    if (this.online) this.input.suppressed = true;
    this.onPause();
  }

  resume() {
    this.paused = false;
    this.input.suppressed = false;
    // consumir la pulsación de Esc que cerró el menú para que no vuelva a pausar
    this.input.poll(0);
    this.input.poll(0);
    this.last = performance.now();
  }

  resize(w: number, h: number) {
    this.view.resize(w, h);
  }

  /** Ya terminado y liberado (para pruebas automáticas). */
  get disposedFlag() {
    return this.disposed;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.audio.stop();
    this.hud.dispose();
    this.touch?.dispose();
    document.body.classList.remove('touch');
    this.view.dispose();
  }
}
