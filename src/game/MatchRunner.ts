import * as THREE from 'three';
import { AutoQuality, type QualityStep } from './AutoQuality';
import { SIM_DT } from '../config/constants';
import type { GameSettings } from '../config/Settings';
import { HumanController } from '../control/HumanController';
import type { StadiumData } from '../data/types';
import { Input, P1_SPLIT, P2_SPLIT, versusDevices, type Bindings } from '../input/Input';
import { Match, type MatchConfig } from '../sim/Match';
import { MatchView } from '../render/MatchView';
import type { MatchEvent } from '../sim/types';
import { HUD } from '../ui/HUD';
import { Commentary } from '../ui/Commentary';
import { getLang } from '../i18n';
import { AchievementTracker } from '../modes/Achievements';
import type { AudioEngine } from '../audio/AudioEngine';
import { MatchAudio } from '../audio/MatchAudio';
import { Narrator } from '../audio/Narrator';
import { chantsForStadium } from '../audio/chantTracks';
import { SHOW, showLevels } from '../audio/ShowTimeline';
import { getSpeech } from '../audio/Speech';
import { activePad } from '../input/pads';
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
  /** Nombre del rival (para los avisos). */
  opponentName?: string;
  /** Hay enlace directo con el rival (permite más instantáneas por segundo). */
  direct?(): boolean;
  /** Latencia (ms) hasta el rival, si se conoce. */
  latency?(): number;
  /** Espectador: recibe el partido del anfitrión pero no manda nada ni controla a nadie. */
  spectator?: boolean;
}

/** Pausas por jugador en un partido online y duración máxima de cada una. */
export const ONLINE_PAUSES = 3;
export const ONLINE_PAUSE_MAX_S = 60;

/** Duración de la presentación del partido (s). */
const INTRO_SECONDS = 5.4;

export interface MatchResultInfo {
  match: Match;
  home: number;
  away: number;
  winner: 0 | 1 | -1;
  penalties: [number, number] | null;
}

function escapeHtml(t: string) {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
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
  /** Jugador 2 en el mismo PC (partido local de dos jugadores). */
  private input2: Input | null = null;
  private controller2: HumanController | null = null;
  private savedInput: { bindings: Bindings; pad: Input['padSource']; keyboard: boolean } | null = null;
  /** Logros del usuario en este partido. */
  readonly achievements: AchievementTracker | null = null;
  /** Comentarista (rótulos y voz opcional). */
  private commentary: Commentary | null = null;
  readonly controller: HumanController | null;
  readonly audio: MatchAudio;
  /** Relator con voz. */
  readonly narrator: Narrator;
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
  /** La cancha tiene el espectáculo del minuto 68 y ya estalló en este partido. */
  private stadiumShow = false;
  private showBurst = false;
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
  /** Calidad automática según los FPS (la pone App si está activada). */
  autoQuality: AutoQuality | null = null;
  /** Duración real del último fotograma (sin el recorte que usa la simulación). */
  private realDt = 0;
  onQualityStep: (s: QualityStep) => void = () => {};
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
  /** Online: mi pausa detiene el partido para los dos (hasta ONLINE_PAUSE_MAX_S). */
  private localHalt = false;
  /** Online: el rival tiene el partido en pausa. */
  remotePaused = false;
  /** Pausas que me quedan en este partido online. */
  pausesLeft = ONLINE_PAUSES;
  private haltStarted = 0;
  private remoteHaltStarted = 0;
  private kaAcc = 0;
  private haltEl: HTMLElement | null = null;
  /** La pausa propia llegó al límite: hay que cerrar el menú y reanudar. */
  onForceResume: () => void = () => {};
  private readonly guestRight = new THREE.Vector3(1, 0, 0);
  private readonly guestForward = new THREE.Vector3(0, 0, -1);

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    config: MatchConfig,
    stadium: StadiumData,
    readonly settings: GameSettings,
    readonly input: Input,
    audioEngine: AudioEngine,
    private readonly uiRoot: HTMLElement,
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
    // Dos jugadores en el mismo PC: el 2 controla al visitante (versus) o juega en el mismo equipo (cooperativo),
    // con su mando o con la mitad derecha del teclado
    if ((config.versus || config.coop) && !online && this.controller) {
      const dev = versusDevices();
      this.savedInput = { bindings: input.bindings, pad: input.padSource, keyboard: input.keyboard };
      input.padSource = dev.p1Pad;
      if (dev.mode === 'keys') input.bindings = structuredClone(P1_SPLIT);
      const i2 = new Input(P2_SPLIT);
      i2.settings = { ...input.settings };
      i2.padSource = dev.p2Pad;
      i2.keyboard = dev.mode === 'keys';
      this.input2 = i2;
      // misma base de cámara que el jugador 1 (se actualiza a la vez)
      this.controller2 = new HumanController(i2, basis, controlSettings(settings, false));
      if (config.coop) {
        this.match.controllers2[config.humanTeam as 0 | 1] = this.controller2;
      } else {
        this.match.controllers[1] = this.controller2;
        this.match.autoSubs[1] = settings.autoSubs;
      }
    }
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
    if (online && !online.spectator) {
      this.hud.netInfo = () => {
        const ms = Math.round(online.latency?.() ?? 0);
        return { text: `${ms ? `${ms} ms` : '— ms'} · ${online.direct?.() ? 'directo' : 'servidor'}`, level: !ms || ms > 150 ? 2 : ms > 80 ? 1 : 0 };
      };
    }
    if (config.humanTeam >= 0 && !config.training && !config.versus) {
      this.achievements = new AchievementTracker(this.match, config.humanTeam as 0 | 1);
      this.achievements.onUnlock = (a) => this.hud.showBanner(`🏆 ${a.icon} ${escapeHtml(a.name)}`, `Logro desbloqueado · ${escapeHtml(a.desc)}`, '#ffd23f', 3.2);
    }
    this.commentary = settings.commentary !== false && !config.training ? new Commentary(uiRoot, this.match, getLang() !== 'es' && settings.commentaryVolume > 0) : null;
    this.touch = wantTouch && (this.controller || (isGuest && !online?.spectator)) ? new TouchControls(uiRoot, input) : null;
    document.body.classList.toggle('touch', !!this.touch);
    if (this.touch) {
      // consejo de uso las primeras partidas
      const shown = loadJSON<number>('touch-tip', 0);
      if (shown < 3) {
        saveJSON('touch-tip', shown + 1);
        this.pendingTip = '<b>TOCA</b> PASE o TIRO = automático · <b>MANTÉN</b> = potencia · <b>ROSCA / VASELINA / RASO / POTENTE</b> = tipo de tiro (mantén uno y toca otro para combinar)';
      }
    }
    // cada cancha tiene los cánticos de su hinchada (solo suenan ahí)
    // (en una sede neutral no suenan los de ningún club)
    const neutral = !!this.match.config.neutral;
    const chants = chantsForStadium(neutral ? { id: stadium.id } : stadium);
    audioEngine.setChantTracks(chants.tracks, chants.special);
    this.stadiumShow = !!stadium.show && !neutral;
    this.audio = new MatchAudio(audioEngine, this.match);
    this.audio.start();
    this.narrator = new Narrator(getSpeech(), this.match, stadium.name);
    // el relator con voz habla castellano; en otros idiomas habla el comentarista de texto
    this.narrator.volume = () => (getLang() !== 'es' ? 0 : (settings.commentaryVolume ?? 0.9) * settings.masterVolume);
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
      this.realDt = (now - this.last) / 1000;
      const dt = Math.min(0.1, this.realDt);
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
        this.narrator.welcome();
        this.view.director.startIntro(INTRO_SECONDS);
        this.introEndAt = performance.now() + (INTRO_SECONDS * 1000) / this.timeScale;
      }
      this.input.poll(dt);
      const pausePressed = this.input.pressed('pause');
      if ((this.introFrames >= 3 && performance.now() >= this.introEndAt) || pausePressed || (['pass', 'shoot', 'sprint', 'through', 'lob'] as const).some((a) => this.input.pressed(a))) this.skipIntro();
      this.input.poll(0);
      // Esc / pausa siempre abre el menú de pausa, también durante la presentación
      if (pausePressed) this.pause();
    } else if (this.online && this.halted) {
      this.haltFrame(dt);
    } else if (this.guestSync) {
      this.guestFrame(dt);
    } else if (!this.paused || this.online) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 8 * Math.max(1, this.timeScale)) {
        this.input.poll(SIM_DT);
        this.input2?.poll(SIM_DT);
        if (this.input.pressed('pause') || this.input2?.pressed('pause')) {
          this.pause();
          // online sin pausas restantes el partido sigue
          if (!this.online || this.halted) break;
        }
        const ri = this.remoteInput;
        if (ri && this.remoteController) {
          ri.poll(SIM_DT);
          this.remoteController.view.right.set(ri.right.x, 0, ri.right.z);
          this.remoteController.view.forward.set(ri.forward.x, 0, ri.forward.z);
        }
        // la base de la cámara orienta el stick
        if (this.controller) this.view.director.basis(this.controller.view.right, this.controller.view.forward);
        // tras marcar el jugador del usuario: el stick derecho (o I/J/K/L, R) elige la celebración
        if (m.phase === 'goal') this.chooseCelebration();
        if (m.phase === 'replay' && (this.input.pressed('pass') || this.input.pressed('shoot') || !this.settings.replays)) m.skipReplay();
        m.step(SIM_DT);
        for (const e of m.events) this.handleEvent(e);
        if (this.hostSync) {
          this.hostSync.hz = this.online?.direct?.() ? 45 : 30;
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
    // el minuto 68 de Belgrano: espectáculo en las tribunas siguiendo el reloj del partido
    let show = 0;
    if (this.stadiumShow && !m.config.training) {
      const t = m.matchSeconds / 60;
      show = showLevels(t).visual;
      this.view.stadium.fans.setSpectacle(show);
      if (!this.showBurst && t >= SHOW.visPeak && t < SHOW.visEnd) {
        this.showBurst = true;
        this.view.stadium.fans.spectacleBurst();
        this.view.director.addShake(0.35);
        this.audioEngine.cheer(1);
      }
    }
    this.audio.update(Math.max(this.view.excitement, show), this.view.camera);
    if (!this.paused) this.narrator.update(dt);
    this.hud.update(dt);
    this.commentary?.update();
    if (this.touch && team) {
      const pt = m.possessionTeam;
      // con el balón suelto se mantiene el modo anterior (evita parpadeos de botones)
      if (pt !== -1 || m.phase !== 'play') this.touch.setContext(pt === team.index || m.gkHolding?.team === team.index || (m.phase !== 'play' && m.restart?.team === team.index));
      this.touch.setVisible(!this.paused && !this.inIntro && m.phase !== 'replay' && !m.finished);
    }
    if (this.autoQuality && !this.paused) {
      const step = this.autoQuality.sample(this.realDt);
      if (step) this.onQualityStep(step);
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
    this.commentary?.onEvent(e);
    this.narrator.onEvent(e);
    this.achievements?.onEvent(e);
    this.audio.onEvent(e);
    if (e.type === 'net' && e.x !== undefined && e.z !== undefined) this.view.netImpact(e.x, e.z, e.power ?? 0.6);
    if (e.type === 'goal' && e.kind !== 'shootout') {
      this.view.director.addShake(0.25);
      if (e.team === 0 || e.team === 1) this.view.stadium.fans.goal(e.team);
      // tras el grito de gol, la hinchada canta
      setTimeout(() => { if (!this.disposed) this.audioEngine.chant(0.8); }, 3200);
    }
    if (this.settings.vibration !== false) this.vibrate(e);
  }

  /** Celebración elegida por el usuario: ↑ brazos arriba, ↓ de rodillas, → saltos, ← avión, R silencio, RB+↑ al cielo. */
  private chooseCelebration() {
    const sc = this.match.lastGoal?.scorer;
    if (!sc || sc.action.kind !== 'celebrate' || sc.action.time > 2) return;
    const i = this.match.teams[sc.team].human ? (sc.team === this.localTeam ? this.input : this.input2) : null;
    if (!i) return;
    let v = -1;
    if (i.pressed('skillUp')) v = i.held('finesse') ? 5 : 0;
    else if (i.pressed('skillDown')) v = 1;
    else if (i.pressed('skillRight')) v = 2;
    else if (i.pressed('skillLeft')) v = 3;
    else if (i.pressed('skillSpin')) v = 4;
    if (v >= 0) sc.action.variant = v;
  }

  /** Vibración en golpeos propios, entradas, postes y goles: en el móvil y en el mando (si lo admite). */
  private vibrate(e: MatchEvent) {
    const own = e.team !== undefined && e.team === this.localTeam;
    const ownPlayer = e.playerId !== undefined && this.localTeam >= 0 && this.match.teams[this.localTeam as 0 | 1].players.some((p) => p.id === e.playerId);
    const shot = e.kind === 'shoot' || e.kind === 'finesse' || e.kind === 'chip' || e.kind === 'penalty';
    // [duración ms, motor fuerte 0..1, motor suave 0..1]
    let fx: [number, number, number] | null = null;
    if (e.type === 'kick' && own) fx = shot ? [110, 0.75, 0.5] : [45, 0.2, 0.45];
    else if (e.type === 'tackle' && ownPlayer) fx = [90, 0.6, 0.3];
    else if (e.type === 'post') fx = [140, 0.5, 0.8];
    else if (e.type === 'goal' && e.kind !== 'shootout') fx = e.team === this.localTeam ? [450, 1, 1] : [200, 0.4, 0.2];
    if (!fx) return;
    if (this.touch && navigator.vibrate) {
      navigator.vibrate(e.type === 'goal' && e.team === this.localTeam ? [60, 50, 90] : Math.round(fx[0] / 4));
      return;
    }
    const pad = activePad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null;
    const act = pad?.vibrationActuator;
    if (act?.playEffect) {
      act.playEffect('dual-rumble', { startDelay: 0, duration: fx[0], strongMagnitude: fx[1], weakMagnitude: fx[2] }).catch(() => undefined);
    }
  }

  /** Invitado online: manda sus mandos y dibuja lo que llega del anfitrión. */
  private guestFrame(dt: number) {
    let steps = 0;
    this.acc += dt;
    while (this.acc >= SIM_DT && steps < 8) {
      this.input.poll(SIM_DT);
      if (this.input.pressed('pause')) this.pause();
      if (this.halted) break;
      this.view.director.basis(this.guestRight, this.guestForward);
      this.guestFrames.push(captureFrame(this.input, this.guestRight, this.guestForward, this.paused));
      this.acc -= SIM_DT;
      steps++;
    }
    if (steps >= 8) this.acc = 0;
    if (this.guestFrames.length >= 2) this.online!.send({ k: 'i', f: this.guestFrames.splice(0) });
    for (const e of this.guestSync!.update(performance.now())) this.handleEvent(e);
    // predicción local de mi jugador (menos sensación de retraso)
    if (this.localTeam >= 0 && !this.paused) {
      const mv = this.input.move();
      const dir = { x: this.guestRight.x * mv.x + this.guestForward.x * mv.y, z: this.guestRight.z * mv.x + this.guestForward.z * mv.y };
      this.guestSync!.predict(this.localTeam as 0 | 1, dir, dt);
    }
  }

  /** Partido online detenido por una pausa (mía o del rival). */
  get halted() {
    return this.localHalt || this.remotePaused;
  }

  /** Online en pausa: nadie juega; se mantiene viva la conexión y se cuenta el tiempo. */
  private haltFrame(dt: number) {
    this.input.poll(dt);
    if (!this.paused && this.input.pressed('pause')) this.pause();
    this.acc = 0;
    // el anfitrión avisa de que sigue ahí (el invitado no recibe instantáneas en la pausa)
    if (this.remoteInput) {
      this.kaAcc += dt;
      if (this.kaAcc >= 1) {
        this.kaAcc = 0;
        this.online!.send({ k: 'ka' });
      }
    }
    if (this.guestSync) this.guestSync.lastRecv = performance.now();
    const now = performance.now();
    if (this.localHalt && now - this.haltStarted > ONLINE_PAUSE_MAX_S * 1000) this.onForceResume();
    // por si el aviso de reanudar del rival se pierde
    if (this.remotePaused && now - this.remoteHaltStarted > (ONLINE_PAUSE_MAX_S + 5) * 1000) this.setRemotePause(false);
    if (this.remotePaused && this.haltEl) {
      const left = Math.max(0, Math.ceil(ONLINE_PAUSE_MAX_S - (now - this.remoteHaltStarted) / 1000));
      const sec = this.haltEl.querySelector('.rp-sec');
      if (sec) sec.textContent = String(left);
    }
  }

  private setRemotePause(on: boolean) {
    if (on === this.remotePaused) return;
    const wasHalted = this.halted;
    this.remotePaused = on;
    this.remoteHaltStarted = performance.now();
    if (on) {
      if (!this.haltEl) {
        const el = document.createElement('div');
        el.className = 'remote-pause';
        el.innerHTML = `<b>⏸ PAUSA</b><span>${escapeHtml(this.online?.opponentName ?? 'Tu rival')} pausó el partido · se reanuda en <span class="rp-sec">${ONLINE_PAUSE_MAX_S}</span> s</span>`;
        this.uiRoot.appendChild(el);
        this.haltEl = el;
      }
    } else {
      this.haltEl?.remove();
      this.haltEl = null;
    }
    if (wasHalted && !this.halted) this.afterHalt();
  }

  /** Al reanudar: se descartan los mandos acumulados y el invitado vuelve a sincronizar el reloj. */
  private afterHalt() {
    this.remoteInput?.clear();
    this.guestFrames.length = 0;
    this.last = performance.now();
    this.acc = 0;
  }

  /** Mensaje del rival (reenviado por el servidor). */
  receive(d: { k?: string; [key: string]: unknown }) {
    if (!d || typeof d !== 'object') return;
    if (d.k === 'pause') {
      this.setRemotePause(true);
      return;
    }
    if (d.k === 'resume') {
      this.setRemotePause(false);
      return;
    }
    if (d.k === 'ka') {
      if (this.guestSync) this.guestSync.lastRecv = performance.now();
      return;
    }
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
          powerBarTime: Math.max(0.3, Math.min(2, Number(c.powerBarTime ?? 0.6))),
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
    this.narrator.stop();
    if (this.online) {
      this.input.suppressed = true;
      // la pausa detiene el partido para los dos (un número limitado de veces); el espectador solo abre el menú
      if (!this.online.spectator && !this.inIntro && !this.localHalt && this.pausesLeft > 0) {
        this.pausesLeft--;
        this.localHalt = true;
        this.haltStarted = performance.now();
        this.online.send({ k: 'pause' });
      }
    }
    this.onPause();
  }

  /** Segundos que quedan de mi pausa online (o −1 si no estoy deteniendo el partido). */
  get pauseSecondsLeft() {
    return this.localHalt ? Math.max(0, Math.ceil(ONLINE_PAUSE_MAX_S - (performance.now() - this.haltStarted) / 1000)) : -1;
  }

  resume() {
    this.paused = false;
    this.input.suppressed = false;
    if (this.localHalt) {
      this.localHalt = false;
      this.online?.send({ k: 'resume' });
      if (!this.halted) this.afterHalt();
    }
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
    this.haltEl?.remove();
    cancelAnimationFrame(this.raf);
    this.audio.stop();
    this.narrator.stop();
    this.hud.dispose();
    this.commentary?.dispose();
    this.input2?.dispose();
    if (this.savedInput) {
      this.input.bindings = this.savedInput.bindings;
      this.input.padSource = this.savedInput.pad;
      this.input.keyboard = this.savedInput.keyboard;
      this.savedInput = null;
    }
    this.touch?.dispose();
    document.body.classList.remove('touch');
    this.view.dispose();
  }
}
