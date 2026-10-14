import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { DIFFICULTY_LABELS } from '../ai/Difficulty';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type GameSettings } from '../config/Settings';
import { FORMATION_IDS, FORMATIONS } from '../data/formations';
import { STADIUMS, getStadium } from '../data/stadiums';
import { TEAMS, chooseAwayKit, getTeam, playerOverall } from '../data/teams';
import type { Difficulty, FormationId, PlayerData, TeamData } from '../data/types';
import { MatchRunner, type MatchResultInfo } from '../game/MatchRunner';
import { ACTIONS, ACTION_LABELS, FIFA_CLASSIC, Input, WASD_ALT, keyLabel, type Action } from '../input/Input';
import type { MatchConfig } from '../sim/Match';
import { Career } from '../modes/Career';
import { Tournament } from '../modes/Tournament';
import type { Fixture, StandingRow } from '../modes/Competition';
import { crestSVG, kitSVG } from './Crest';
import { Screen, el, esc, type Handlers } from './dom';
import { isTouchDevice } from '../input/TouchControls';

const DIFFS: Difficulty[] = ['amateur', 'pro', 'world', 'legend'];
const HALF_OPTIONS = [2, 3, 4, 5, 6, 8, 10];
const VERSION = '1.0.0';

const TIPS = [
  'Mantén pulsado el botón de tiro para cargar la barra: demasiada potencia manda el balón por encima del travesaño.',
  'Con Shift (RB) pulsado, el tiro sale colocado y con rosca hacia el palo.',
  'En defensa, mantén S (A) para presionar al portador sin perder la posición.',
  'Q (LB) cambia al compañero más cercano al balón; con una dirección, al que esté en esa dirección.',
  'W (Y) en ataque es un pase al hueco: el compañero sale corriendo al espacio.',
  'Desde la banda, A (X) envía un centro al área.',
  'Ojo con el fuera de juego: el árbitro lo juzga en el momento exacto del pase.',
  'Las barridas por detrás se castigan con tarjeta. Si el último defensor derriba a un rival que se iba solo, es roja.',
  'Ctrl (LT) permite contener (jockey) frente al atacante y esperar el momento de la entrada.',
  'En móvil, un toque rápido en PASE o TIRO golpea con potencia automática y elige al mejor compañero o la mejor esquina del arco.',
];

interface QuickSetup {
  home: number;
  away: number;
  stadium: number;
  half: number;
  difficulty: number;
  side: 0 | 1 | -1;
  formation: FormationId | null;
}

type MatchContext =
  | { mode: 'quick' }
  | { mode: 'tournament'; fixture: Fixture }
  | { mode: 'career'; fixture: Fixture }
  | { mode: 'training' };

export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly audio = new AudioEngine();
  readonly input: Input;
  settings: GameSettings;
  private ui: HTMLElement;
  private bg: HTMLElement;
  private screen: Screen | null = null;
  private runner: MatchRunner | null = null;
  private overlay: Screen | null = null;
  private quick: QuickSetup;
  private lastMatch: { config: MatchConfig; ctx: MatchContext } | null = null;
  tournament: Tournament | null = null;
  career: Career | null = null;

  private splashShown = false;

  constructor(private canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.ui = ui;
    this.settings = loadSettings();
    this.input = new Input(this.settings.bindings);
    this.input.settings = { deadzone: this.settings.deadzone, sensitivity: this.settings.sensitivity };
    this.renderer = this.createRenderer();
    this.bg = el('div', 'menu-bg', '<div class="pitch-lines"></div>');
    document.body.insertBefore(this.bg, ui);
    this.applyAudio();
    this.quick = { home: 0, away: 1, stadium: 0, half: HALF_OPTIONS.indexOf(this.settings.halfMinutes), difficulty: DIFFS.indexOf(this.settings.difficulty), side: 0, formation: null };
    if (this.quick.half < 0) this.quick.half = 2;
    if (this.quick.difficulty < 0) this.quick.difficulty = 1;
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
  }

  private createRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.settings.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.settings.resolutionScale);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    return r;
  }

  private applyAudio() {
    const s = this.settings;
    this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, crowd: s.crowdVolume });
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.settings.resolutionScale);
    this.renderer.setSize(w, h, false);
    this.runner?.resize(w, h);
  }

  private show(html: string, handlers: Handlers, back: (() => void) | null, cls = '') {
    this.screen?.dispose();
    this.screen = new Screen(this.ui, html, handlers, this.audio, cls);
    this.screen.onBack = back;
    return this.screen;
  }

  private setMenuMode(on: boolean) {
    this.bg.classList.toggle('hidden', !on);
    this.canvas.classList.toggle('hidden', on);
    if (on) this.audio.startMenuMusic();
  }

  // ==================================================================
  // Título y menú principal
  // ==================================================================

  start() {
    this.setMenuMode(true);
    const s = this.show(`
      <div class="logo"><div class="l1">FOOTBALL ELITE</div><div class="l2">3D</div></div>
      <button class="press btn" data-act="go" style="background:none;border:none">${isTouchDevice() ? 'TOCA PARA EMPEZAR' : 'PULSA ENTER PARA EMPEZAR'}</button>
      <div class="version-tag">v${VERSION}</div>`, { go: () => { this.enterMobileFullscreen(); this.mainMenu(); } }, null, 'title-screen');
    void s;
    this.playSplash();
  }

  /**
   * Animación al abrir el juego: el balón entra rodando, se dispara a la red (que se mueve con el
   * impacto) y aparece el logo. Dura unos 3 s y se salta con cualquier toque o tecla.
   */
  private playSplash() {
    if (this.splashShown) return;
    this.splashShown = true;
    const el = document.createElement('div');
    el.className = 'splash';
    const net = Array.from({ length: 9 }, (_, i) => `<line x1="${20 + i * 20}" y1="10" x2="${26 + i * 18.5}" y2="88"/>`).join('')
      + Array.from({ length: 5 }, (_, i) => `<line x1="${20 + i * 1.2}" y1="${10 + i * 19}" x2="${180 - i * 0.6}" y2="${10 + i * 19}"/>`).join('');
    el.innerHTML = `
      <div class="sp-glow"></div>
      <svg class="sp-goal" viewBox="0 0 200 100" preserveAspectRatio="none"><g class="sp-net">${net}</g><path class="sp-frame" d="M20 98V8h160v90"/></svg>
      <div class="sp-ball"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#fff" stroke="#111" stroke-width="1"/><path d="M12 6.5l4.2 3-1.6 5h-5.2l-1.6-5z" fill="#111"/><path d="M12 6.5V1.5M16.2 9.5l4.6-1.6M14.6 14.5l3 4M9.4 14.5l-3 4M7.8 9.5L3.2 7.9" stroke="#111" stroke-width="1"/></svg></div>
      <div class="sp-flash"></div>
      <div class="sp-logo"><span class="s1">FOOTBALL ELITE</span><span class="s2">3D</span></div>
      <div class="sp-sub">11 contra 11 · IA táctica · física real</div>`;
    document.body.appendChild(el);
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      window.removeEventListener('keydown', end, true);
      setTimeout(() => el.remove(), 450);
    };
    el.addEventListener('pointerdown', end);
    window.addEventListener('keydown', end, true);
    setTimeout(end, 3300);
  }

  /** En móvil: pantalla completa y orientación horizontal (si el navegador lo permite). */
  private enterMobileFullscreen() {
    if (!isTouchDevice()) return;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : (el.webkitRequestFullscreen?.(), null);
      Promise.resolve(p).then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => {});
    } catch { /* no soportado */ }
  }

  mainMenu() {
    this.setMenuMode(true);
    const crests = TEAMS.map((t) => crestSVG(t, 56)).join('');
    const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
    this.show(`
      <div class="main-menu">
        <div class="menu-list">
          <button class="menu-item" data-act="quick">Partido rápido<small>Elige equipos, estadio y dificultad</small></button>
          <button class="menu-item" data-act="tournament">Copa Élite<small>Torneo: fase de grupos y eliminatorias</small></button>
          <button class="menu-item" data-act="career">Carrera<small>Temporadas de liga con tu club</small></button>
          <button class="menu-item" data-act="training">Entrenamiento<small>Tiros, pases, penales y tiros libres</small></button>
          <button class="menu-item" data-act="settings">Configuración<small>Gráficos, sonido y jugabilidad</small></button>
          <button class="menu-item" data-act="controls">Controles<small>Teclado y mando · reasignar teclas</small></button>
          ${isElectron ? '<button class="menu-item" data-act="quit">Salir</button>' : ''}
        </div>
        <div class="menu-hero">
          <div class="logo"><div class="l1">FOOTBALL ELITE</div><div class="l2">3D</div></div>
          <div class="crest-row">${crests}</div>
        </div>
      </div>
      <div class="version-tag">v${VERSION} · ${isTouchDevice() ? 'Toca una opción para elegir' : '↑↓ para navegar · Enter/S para elegir · Esc para volver'}</div>`, {
      quick: () => this.quickMatchScreen(),
      tournament: () => this.tournamentHub(),
      career: () => this.careerHub(),
      training: () => this.trainingScreen(),
      settings: () => this.settingsScreen(() => this.mainMenu()),
      controls: () => this.controlsScreen(() => this.mainMenu()),
      quit: () => window.close(),
    }, () => this.start());
  }

  // ==================================================================
  // Partido rápido
  // ==================================================================

  private teamCard(t: TeamData, side: string, prefix: string, extra = '') {
    const stars = '★'.repeat(Math.max(1, Math.round((t.rating - 70) / 3.5))).padEnd(5, '☆');
    return `<div class="panel team-picker">
      <div class="side">${side}</div>
      <div class="nav"><button data-act="${prefix}Prev">‹</button><div class="crest">${crestSVG(t, 140)}</div><button data-act="${prefix}Next">›</button></div>
      <div class="tname">${esc(t.name)}</div>
      <div class="stars">${stars} <span class="muted">${t.rating}</span></div>
      <div class="muted">${esc(t.city)} · ${t.formation}</div>
      ${extra}
    </div>`;
  }

  quickMatchScreen() {
    const q = this.quick;
    const render = () => {
      const home = TEAMS[q.home];
      const away = TEAMS[q.away];
      const awayKit = chooseAwayKit(home, away);
      const sideLabel = q.side === 0 ? `Local (${home.short})` : q.side === 1 ? `Visitante (${away.short})` : 'Espectador (IA vs IA)';
      return `
      <div class="screen-header"><div><div class="crumb">PARTIDO RÁPIDO</div><h2>Configuración del encuentro</h2></div></div>
      <div class="screen-body">
        <div class="versus">
          ${this.teamCard(home, 'LOCAL', 'home', `<div class="kits">${kitSVG(home.home)}</div>`)}
          <div class="vs">VS</div>
          ${this.teamCard(away, 'VISITANTE', 'away', `<div class="kits">${kitSVG(awayKit)}</div>`)}
        </div>
        <div class="panel" style="margin-top:16px">
          ${this.stepper('Estadio', STADIUMS[q.stadium].name + ` · ${({ day: 'Día', sunset: 'Atardecer', night: 'Noche' } as const)[STADIUMS[q.stadium].timeOfDay]}`, 'stad')}
          ${this.stepper('Duración de cada parte', `${HALF_OPTIONS[q.half]} min`, 'half')}
          ${this.stepper('Dificultad', DIFFICULTY_LABELS[DIFFS[q.difficulty]], 'diff')}
          ${this.stepper('Controlas a', sideLabel, 'side')}
          ${this.stepper('Tu formación', q.formation ?? 'Por defecto del equipo', 'form')}
        </div>
      </div>
      <div class="screen-footer">
        <button class="btn" data-act="back">Volver</button>
        <button class="btn primary" data-act="play">¡Jugar!</button>
      </div>`;
    };
    const cycle = (key: keyof QuickSetup, n: number, d: number) => { (q as any)[key] = ((q[key] as number) + d + n) % n; s.refresh(render()); };
    const handlers: Handlers = {
      homePrev: () => { cycle('home', TEAMS.length, -1); if (q.home === q.away) cycle('home', TEAMS.length, -1); },
      homeNext: () => { cycle('home', TEAMS.length, 1); if (q.home === q.away) cycle('home', TEAMS.length, 1); },
      awayPrev: () => { cycle('away', TEAMS.length, -1); if (q.home === q.away) cycle('away', TEAMS.length, -1); },
      awayNext: () => { cycle('away', TEAMS.length, 1); if (q.home === q.away) cycle('away', TEAMS.length, 1); },
      stadPrev: () => cycle('stadium', STADIUMS.length, -1),
      stadNext: () => cycle('stadium', STADIUMS.length, 1),
      halfPrev: () => cycle('half', HALF_OPTIONS.length, -1),
      halfNext: () => cycle('half', HALF_OPTIONS.length, 1),
      diffPrev: () => cycle('difficulty', DIFFS.length, -1),
      diffNext: () => cycle('difficulty', DIFFS.length, 1),
      sidePrev: () => { q.side = (q.side === 0 ? -1 : q.side === 1 ? 0 : 1); s.refresh(render()); },
      sideNext: () => { q.side = (q.side === 0 ? 1 : q.side === 1 ? -1 : 0); s.refresh(render()); },
      formPrev: () => { const i = q.formation ? FORMATION_IDS.indexOf(q.formation) : 0; q.formation = i <= 0 ? null : FORMATION_IDS[i - 1]; s.refresh(render()); },
      formNext: () => { const i = q.formation ? FORMATION_IDS.indexOf(q.formation) : -1; q.formation = FORMATION_IDS[(i + 1) % FORMATION_IDS.length]; s.refresh(render()); },
      back: () => this.mainMenu(),
      play: () => {
        const home = TEAMS[q.home];
        const away = TEAMS[q.away];
        this.settings.halfMinutes = HALF_OPTIONS[q.half];
        this.settings.difficulty = DIFFS[q.difficulty];
        saveSettings(this.settings);
        const cfg: MatchConfig = {
          home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away), humanTeam: q.side,
          halfLengthSec: HALF_OPTIONS[q.half] * 60, difficulty: DIFFS[q.difficulty], extraTime: false, penalties: false,
          homeFormation: q.side === 0 && q.formation ? q.formation : undefined,
          awayFormation: q.side === 1 && q.formation ? q.formation : undefined,
        };
        this.playMatch(cfg, STADIUMS[q.stadium].id, { mode: 'quick' });
      },
    };
    const s = this.show(render(), handlers, () => this.mainMenu());
  }

  private stepper(label: string, value: string, key: string) {
    return `<div class="row"><label>${label}</label><div class="stepper">
      <button data-act="${key}Prev" data-nofocus="1">‹</button><span class="val" data-act="${key}Next" data-left="${key}Prev" data-right="${key}Next">${esc(value)}</span><button data-act="${key}Next" data-nofocus="1">›</button></div></div>`;
  }

  // ==================================================================
  // Partido
  // ==================================================================

  playMatch(config: MatchConfig, stadiumId: string, ctx: MatchContext) {
    this.lastMatch = { config, ctx };
    const home = config.home;
    const away = config.away;
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const s = this.show(`
      <div class="matchup">${crestSVG(home, 110)}<span>${esc(home.name)}</span><span class="muted">vs</span><span>${esc(away.name)}</span>${crestSVG(away, 110)}</div>
      <div class="muted">${esc(getStadium(stadiumId).name)}</div>
      <div class="bar"><div></div></div>
      <div class="tip">💡 ${esc(tip)}</div>`, {}, null, 'loading');
    const bar = s.root.querySelector('.bar > div') as HTMLElement;
    bar.style.width = '15%';
    // Dar tiempo a pintar la pantalla de carga antes de generar la escena
    setTimeout(() => {
      bar.style.width = '55%';
      requestAnimationFrame(() => {
        try {
          this.runner?.dispose();
          const runner = new MatchRunner(this.renderer, config, getStadium(stadiumId), this.settings, this.input, this.audio, this.ui);
          this.runner = runner;
          runner.resize(window.innerWidth, window.innerHeight);
          // precompilar shaders
          this.renderer.compile(runner.view.scene, runner.view.camera);
          bar.style.width = '100%';
          setTimeout(() => {
            this.screen?.dispose();
            this.screen = null;
            this.setMenuMode(false);
            this.audio.stopMenuMusic();
            runner.onPause = () => this.pauseMenu();
            runner.onFinished = (r) => this.matchFinished(r, ctx);
            runner.start();
            (window as any).__runner = runner; // acceso para pruebas automáticas
          }, 250);
        } catch (err) {
          console.error(err);
          this.errorScreen(err);
        }
      });
    }, 60);
  }

  private errorScreen(err: unknown) {
    this.setMenuMode(true);
    this.show(`<div class="panel modal" style="margin:auto"><h2>Error</h2><p>No se pudo iniciar el partido.</p><pre style="white-space:pre-wrap;font-size:12px">${esc(String((err as Error)?.stack ?? err))}</pre>
      <button class="btn" data-act="menu">Menú principal</button></div>`, { menu: () => this.mainMenu() }, () => this.mainMenu());
  }

  private pauseMenu() {
    const r = this.runner;
    if (!r) return;
    const m = r.match;
    const close = () => { this.overlay?.dispose(); this.overlay = null; };
    const resume = () => { close(); r.resume(); };
    const html = `<div class="overlay"><div class="panel modal">
      <h2>Pausa</h2>
      <div class="muted" style="margin-bottom:14px">${esc(m.teams[0].data.name)} ${m.teams[0].stats.goals} - ${m.teams[1].stats.goals} ${esc(m.teams[1].data.name)} · ${m.clockText}</div>
      <div class="menu-list">
        <button class="menu-item" data-act="resume">Reanudar</button>
        <button class="menu-item" data-act="restart">Reiniciar partido</button>
        <button class="menu-item" data-act="stats">Estadísticas</button>
        <button class="menu-item" data-act="settings">Configuración</button>
        <button class="menu-item" data-act="controls">Controles</button>
        <button class="menu-item" data-act="quit">Abandonar partido</button>
      </div></div></div>`;
    this.overlay?.dispose();
    this.overlay = new Screen(this.ui, html, {
      resume,
      restart: () => { close(); this.restartMatch(); },
      stats: () => {
        close();
        this.overlay = new Screen(this.ui, `<div class="overlay"><div class="panel modal"><h2>Estadísticas</h2>${this.statsHTML(m)}<div class="screen-footer"><button class="btn" data-act="back">Volver</button></div></div></div>`, { back: () => { close(); this.pauseMenu(); } }, this.audio);
        this.overlay.onBack = () => { close(); this.pauseMenu(); };
      },
      settings: () => { close(); this.settingsScreen(() => { this.screen?.dispose(); this.screen = null; this.applyLiveSettings(); this.pauseMenu(); }, true); },
      controls: () => { close(); this.controlsScreen(() => { this.screen?.dispose(); this.screen = null; this.pauseMenu(); }, true); },
      quit: () => { close(); this.leaveMatch(); },
    }, this.audio);
    this.overlay.onBack = resume;
  }

  private applyLiveSettings() {
    const r = this.runner;
    if (!r) return;
    r.hud.showRadar = this.settings.showRadar;
    r.view.director.style = this.settings.cameraStyle;
    r.view.director.zoom = this.settings.cameraZoom;
    r.view.opts.showIndicators = this.settings.showIndicators;
    if (r.controller) {
      r.controller.settings = {
        autoSwitch: this.settings.autoSwitch, passAssist: this.settings.passAssist, powerBarTime: this.settings.powerBarTime, showAimAssist: this.settings.showIndicators,
        assist: this.settings.assist === 'on' || (this.settings.assist === 'auto' && !!r.touch),
      };
    }
    this.applyAudio();
  }

  private restartMatch() {
    if (!this.lastMatch) return;
    const { config, ctx } = this.lastMatch;
    this.runner?.dispose();
    this.runner = null;
    const stadiumId = this.stadiumForCtx(ctx);
    this.playMatch({ ...config, seed: undefined }, stadiumId, ctx);
  }

  private stadiumForCtx(ctx: MatchContext): string {
    if (ctx.mode === 'quick') return STADIUMS[this.quick.stadium].id;
    if (ctx.mode === 'training') return STADIUMS[2].id;
    const home = ctx.fixture.home;
    return STADIUMS[TEAMS.findIndex((t) => t.id === home) % STADIUMS.length].id;
  }

  private leaveMatch() {
    const ctx = this.lastMatch?.ctx;
    this.runner?.dispose();
    this.runner = null;
    if (ctx?.mode === 'tournament') this.tournamentHub();
    else if (ctx?.mode === 'career') this.careerHub();
    else if (ctx?.mode === 'training') this.trainingScreen();
    else this.mainMenu();
  }

  private statsHTML(m: MatchRunner['match']) {
    const [h, a] = m.teams;
    const totalPos = h.stats.possessionTime + a.stats.possessionTime || 1;
    const rows: [string, number, number][] = [
      ['Posesión %', Math.round((h.stats.possessionTime / totalPos) * 100), Math.round((a.stats.possessionTime / totalPos) * 100)],
      ['Tiros', h.stats.shots, a.stats.shots],
      ['Tiros a puerta', h.stats.shotsOnTarget, a.stats.shotsOnTarget],
      ['Pases', h.stats.passes, a.stats.passes],
      ['Pases completados', h.stats.passesCompleted, a.stats.passesCompleted],
      ['Entradas ganadas', h.stats.tackles, a.stats.tackles],
      ['Atajadas', h.stats.saves, a.stats.saves],
      ['Faltas', h.stats.fouls, a.stats.fouls],
      ['Córners', h.stats.corners, a.stats.corners],
      ['Fueras de juego', h.stats.offsides, a.stats.offsides],
      ['Amarillas', h.stats.yellow, a.stats.yellow],
      ['Rojas', h.stats.red, a.stats.red],
    ];
    return rows.map(([label, x, y]) => {
      const tot = x + y || 1;
      return `<div class="stat-row"><div class="v">${x}</div><div><div class="mid">${label}</div><div class="stat-bar"><div style="width:${(x / tot) * 100}%;background:${h.kit.shirt}"></div><div style="width:${(y / tot) * 100}%;background:${a.kit.shirt}"></div></div></div><div class="v">${y}</div></div>`;
    }).join('');
  }

  private matchFinished(r: MatchResultInfo, ctx: MatchContext) {
    const m = r.match;
    const [h, a] = m.teams;
    // Registrar en el modo correspondiente
    if (ctx.mode === 'tournament' && this.tournament) {
      this.tournament.recordUserResult(ctx.fixture, r.home, r.away, r.penalties ?? undefined);
    } else if (ctx.mode === 'career' && this.career) {
      const userIdx = ctx.fixture.home === this.career.state.userTeam ? 0 : 1;
      const scorers = m.teams[userIdx].players.filter((p) => p.goals > 0).flatMap((p) => Array(p.goals).fill(p.id));
      this.career.recordUserResult(ctx.fixture, r.home, r.away, scorers);
    }
    this.runner?.dispose();
    this.runner = null;
    this.setMenuMode(true);
    const scorers = (t: typeof h) => t.scorers.map((s) => `⚽ ${esc(s.name)} ${s.minute}'`).join('<br>') || '<span class="muted">—</span>';
    const pens = r.penalties ? `<div class="muted" style="text-align:center">Penales: ${r.penalties[0]} - ${r.penalties[1]}</div>` : '';
    const cont = ctx.mode === 'tournament' ? 'Volver al torneo' : ctx.mode === 'career' ? 'Volver a la carrera' : ctx.mode === 'training' ? 'Entrenamiento' : 'Menú principal';
    this.show(`
      <div class="screen-header"><div><div class="crumb">RESULTADO FINAL</div><h2>${r.winner === -1 ? 'Empate' : `Gana ${esc(m.teams[r.winner].data.name)}`}</h2></div></div>
      <div class="screen-body"><div class="grid2">
        <div class="panel">
          <div class="result-score"><div class="t">${crestSVG(h.data, 96)}${esc(h.data.name)}</div><div class="big">${r.home} - ${r.away}</div><div class="t">${crestSVG(a.data, 96)}${esc(a.data.name)}</div></div>
          ${pens}
          <div class="scorers"><div style="text-align:right">${scorers(h)}</div><div>${scorers(a)}</div></div>
        </div>
        <div class="panel">${this.statsHTML(m)}</div>
      </div></div>
      <div class="screen-footer">
        ${ctx.mode === 'quick' ? '<button class="btn" data-act="rematch">Revancha</button>' : ''}
        <button class="btn primary" data-act="cont">${cont}</button>
      </div>`, {
      rematch: () => this.restartMatch(),
      cont: () => this.leaveMatch(),
    }, () => this.leaveMatch());
  }

  // ==================================================================
  // Torneo
  // ==================================================================

  private pickTeamScreen(title: string, crumb: string, onPick: (id: string) => void, back: () => void) {
    let idx = 0;
    const render = () => `
      <div class="screen-header"><div><div class="crumb">${crumb}</div><h2>${title}</h2></div></div>
      <div class="screen-body" style="display:flex;justify-content:center;align-items:center">
        ${this.teamCard(TEAMS[idx], 'TU EQUIPO', 'team', `<div class="kits">${kitSVG(TEAMS[idx].home)}${kitSVG(TEAMS[idx].away)}</div>`)}
      </div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button><button class="btn primary" data-act="ok">Confirmar</button></div>`;
    const s = this.show(render(), {
      teamPrev: () => { idx = (idx + TEAMS.length - 1) % TEAMS.length; s.refresh(render()); },
      teamNext: () => { idx = (idx + 1) % TEAMS.length; s.refresh(render()); },
      ok: () => onPick(TEAMS[idx].id),
      back,
    }, back);
  }

  private tableHTML(rows: StandingRow[], me: string, teamLookup: (id: string) => TeamData) {
    return `<table class="tbl"><tr><th>#</th><th>Equipo</th><th class="num">PJ</th><th class="num">G</th><th class="num">E</th><th class="num">P</th><th class="num">GF</th><th class="num">GC</th><th class="num">DG</th><th class="num">Pts</th></tr>
      ${rows.map((r, i) => {
        const t = teamLookup(r.team);
        return `<tr class="${r.team === me ? 'me' : ''}"><td>${i + 1}</td><td><div class="tcell">${crestSVG(t, 22)}${esc(t.name)}</div></td><td class="num">${r.played}</td><td class="num">${r.won}</td><td class="num">${r.drawn}</td><td class="num">${r.lost}</td><td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.gf - r.ga}</td><td class="num"><b>${r.points}</b></td></tr>`;
      }).join('')}</table>`;
  }

  private fixtureHTML(f: Fixture, me: string, lookup: (id: string) => TeamData) {
    const h = lookup(f.home);
    const a = lookup(f.away);
    const sc = f.played ? `${f.homeGoals} - ${f.awayGoals}${f.pens ? ` <small>(${f.pens[0]}-${f.pens[1]} p)</small>` : ''}` : 'vs';
    return `<div class="fixture ${f.home === me || f.away === me ? 'me' : ''}"><div class="h">${esc(h.name)} ${crestSVG(h, 20)}</div><div class="sc">${sc}</div><div class="a">${crestSVG(a, 20)} ${esc(a.name)}</div></div>`;
  }

  tournamentHub() {
    this.setMenuMode(true);
    this.tournament = this.tournament ?? Tournament.load();
    const t = this.tournament;
    if (!t) {
      this.pickTeamScreen('Elige tu equipo para la Copa Élite', 'COPA ÉLITE', (id) => { this.tournament = Tournament.create(id); this.tournamentHub(); }, () => this.mainMenu());
      return;
    }
    const st = t.state;
    const next = t.nextUserFixture();
    const knock = st.fixtures.filter((f) => f.knockout);
    const champion = st.champion ? getTeam(st.champion) : null;
    const status = champion
      ? `<div class="panel" style="text-align:center"><div class="crumb" style="color:var(--warn)">CAMPEÓN</div><div style="display:flex;justify-content:center;margin:10px">${crestSVG(champion, 110)}</div><h2>${esc(champion.name)}</h2>${champion.id === st.userTeam ? '<p>¡Has ganado la Copa Élite! 🏆</p>' : '<p class="muted">Mejor suerte la próxima vez.</p>'}</div>`
      : st.eliminated ? '<div class="panel"><b>Tu equipo quedó eliminado.</b> <span class="muted">El torneo se completó automáticamente.</span></div>' : '';
    const groupFixtures = (g: 'A' | 'B') => st.fixtures.filter((f) => !f.knockout && st.groups[g].includes(f.home)).map((f) => this.fixtureHTML(f, st.userTeam, getTeam)).join('');
    this.show(`
      <div class="screen-header"><div><div class="crumb">COPA ÉLITE · ${esc(getTeam(st.userTeam).name)}</div><h2>Torneo</h2></div></div>
      <div class="screen-body">
        ${status}
        ${next ? `<div class="panel" style="margin-bottom:16px"><div class="crumb">PRÓXIMO PARTIDO · ${esc(next.stage)}</div>${this.fixtureHTML(next, st.userTeam, getTeam)}</div>` : ''}
        <div class="grid2">
          <div class="panel"><h3>Grupo A</h3>${this.tableHTML(t.standings('A'), st.userTeam, getTeam)}<div style="margin-top:10px">${groupFixtures('A')}</div></div>
          <div class="panel"><h3>Grupo B</h3>${this.tableHTML(t.standings('B'), st.userTeam, getTeam)}<div style="margin-top:10px">${groupFixtures('B')}</div></div>
        </div>
        <div class="panel" style="margin-top:16px"><h3>Eliminatorias</h3>${knock.length ? knock.map((f) => `<div class="muted" style="margin-top:6px">${esc(f.stage)}</div>${this.fixtureHTML(f, st.userTeam, getTeam)}`).join('') : '<span class="muted">Semifinales: 1.º A vs 2.º B y 1.º B vs 2.º A. Final a partido único con prórroga y penales.</span>'}</div>
      </div>
      <div class="screen-footer">
        <button class="btn" data-act="back">Menú</button>
        <button class="btn danger" data-act="abandon">${st.champion ? 'Nuevo torneo' : 'Abandonar torneo'}</button>
        ${next ? '<button class="btn primary" data-act="play">Jugar partido</button>' : ''}
      </div>`, {
      back: () => this.mainMenu(),
      abandon: () => { Tournament.clear(); this.tournament = null; this.tournamentHub(); },
      play: () => {
        if (!next) return;
        const home = getTeam(next.home);
        const away = getTeam(next.away);
        const side = next.home === st.userTeam ? 0 : 1;
        this.playMatch({
          home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away), humanTeam: side,
          halfLengthSec: this.settings.halfMinutes * 60, difficulty: this.settings.difficulty,
          extraTime: next.knockout, penalties: next.knockout,
        }, this.stadiumForCtx({ mode: 'tournament', fixture: next }), { mode: 'tournament', fixture: next });
      },
    }, () => this.mainMenu());
  }

  // ==================================================================
  // Carrera
  // ==================================================================

  careerHub() {
    this.setMenuMode(true);
    this.career = this.career ?? Career.load();
    const c = this.career;
    if (!c) {
      this.pickTeamScreen('Elige el club que dirigirás', 'MODO CARRERA', (id) => { this.career = Career.create(id); this.careerHub(); }, () => this.mainMenu());
      return;
    }
    const st = c.state;
    const lookup = (id: string) => c.team(id);
    const next = c.nextUserFixture();
    const table = c.standings();
    const myPos = table.findIndex((r) => r.team === st.userTeam) + 1;
    const recent = st.fixtures.filter((f) => f.played).slice(-8).reverse();
    const roundFx = next ? st.fixtures.filter((f) => f.round === next.round) : [];
    const history = st.history.map((h) => `<div class="row"><span>Temporada ${h.season}</span><span>Campeón: ${esc(lookup(h.champion).name)} · Tu posición: ${h.userPosition}.º</span></div>`).join('');
    this.show(`
      <div class="screen-header"><div><div class="crumb">CARRERA · TEMPORADA ${st.season} · ${esc(c.user.name)}</div><h2>Liga Élite</h2></div></div>
      <div class="screen-body">
        ${st.seasonOver ? `<div class="panel" style="margin-bottom:16px"><b>¡Temporada terminada!</b> Campeón: ${esc(lookup(table[0].team).name)}. Tu equipo terminó ${myPos}.º.</div>` : ''}
        <div class="grid2">
          <div class="panel"><h3>Clasificación</h3>${this.tableHTML(table, st.userTeam, lookup)}</div>
          <div>
            ${next ? `<div class="panel" style="margin-bottom:16px"><div class="crumb">${esc(next.stage)} DE ${c.totalRounds}</div>${this.fixtureHTML(next, st.userTeam, lookup)}<div class="muted" style="margin-top:8px">Resto de la jornada:</div>${roundFx.filter((f) => f !== next).map((f) => this.fixtureHTML(f, st.userTeam, lookup)).join('')}</div>` : ''}
            <div class="panel"><h3>Últimos resultados</h3>${recent.map((f) => `<div class="muted" style="font-size:11px">${esc(f.stage)}</div>${this.fixtureHTML(f, st.userTeam, lookup)}`).join('') || '<span class="muted">Aún no se jugó ningún partido.</span>'}</div>
            ${history ? `<div class="panel" style="margin-top:16px"><h3>Historial</h3>${history}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="screen-footer">
        <button class="btn" data-act="back">Menú</button>
        <button class="btn danger" data-act="abandon">Abandonar carrera</button>
        <button class="btn" data-act="squad">Plantilla y alineación</button>
        ${st.seasonOver ? '<button class="btn primary" data-act="nextSeason">Nueva temporada</button>' : next ? '<button class="btn primary" data-act="play">Jugar partido</button>' : ''}
      </div>`, {
      back: () => this.mainMenu(),
      abandon: () => { Career.clear(); this.career = null; this.careerHub(); },
      squad: () => this.squadScreen(),
      nextSeason: () => {
        const res = c.startNextSeason();
        const ch = res.changes.slice(0, 12).map((x) => `<div class="row"><span>${esc(x.name)}</span><span style="color:${x.delta > 0 ? 'var(--accent)' : 'var(--danger)'}">${x.delta > 0 ? '+' : ''}${x.delta}</span></div>`).join('');
        this.show(`<div class="screen-header"><div><div class="crumb">FIN DE TEMPORADA</div><h2>Temporada ${st.season}</h2></div></div>
          <div class="screen-body"><div class="grid2"><div class="panel"><p>Campeón: <b>${esc(lookup(res.champion).name)}</b></p><p>Tu posición final: <b>${res.position}.º</b></p></div>
          <div class="panel"><h3>Evolución de tu plantilla</h3>${ch || '<span class="muted">Sin cambios</span>'}</div></div></div>
          <div class="screen-footer"><button class="btn primary" data-act="ok">Continuar</button></div>`, { ok: () => this.careerHub() }, () => this.careerHub());
      },
      play: () => {
        if (!next) return;
        const home = lookup(next.home);
        const away = lookup(next.away);
        const side = next.home === st.userTeam ? 0 : 1;
        this.playMatch({
          home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away), humanTeam: side,
          halfLengthSec: this.settings.halfMinutes * 60, difficulty: this.settings.difficulty, extraTime: false, penalties: false,
          homeFormation: side === 0 ? st.formation : undefined, awayFormation: side === 1 ? st.formation : undefined,
          homeLineup: side === 0 ? st.lineup : undefined, awayLineup: side === 1 ? st.lineup : undefined,
        }, this.stadiumForCtx({ mode: 'career', fixture: next }), { mode: 'career', fixture: next });
      },
    }, () => this.mainMenu());
  }

  private squadScreen() {
    const c = this.career!;
    let formation = c.state.formation;
    const lineup = c.state.lineup.slice();
    let selSlot = -1;
    const team = c.user;
    const byId = (id: string) => team.players.find((p) => p.id === id)!;
    const render = () => {
      const fs = FORMATIONS[formation];
      const pitch = lineup.map((id, i) => {
        const s = fs[i];
        const p = byId(id);
        const x = 50 + s.lateral * 42;
        const y = 94 - s.depth * 100 * 0.95;
        return `<div class="slot ${selSlot === i ? 'sel' : ''}" style="left:${x}%;top:${y}%" data-act="slot" data-i="${i}"><div class="dot">${p.number}</div>${esc(p.name.split(' ').slice(-1)[0])}<br><span class="muted">${s.role}</span></div>`;
      }).join('');
      const list = team.players.map((p) => {
        const starter = lineup.indexOf(p.id);
        return `<div class="row ${starter >= 0 ? 'starter' : ''}" data-act="pick" data-id="${p.id}"><span><span class="pos ${p.position}">${p.position === 'GK' ? 'POR' : p.position === 'DEF' ? 'DEF' : p.position === 'MID' ? 'MED' : 'DEL'}</span> ${p.number}. ${esc(p.name)} <span class="muted">${c.state.ages[p.id] ?? ''} años</span></span><span class="ovr">${playerOverall(p)}</span></div>`;
      }).join('');
      return `
      <div class="screen-header"><div><div class="crumb">PLANTILLA · ${esc(team.name)}</div><h2>Alineación</h2></div></div>
      <div class="screen-body"><div class="lineup">
        <div class="panel">${this.stepper('Formación', formation, 'form')}<div class="mini-pitch" style="margin-top:10px">${pitch}</div>
          <p class="muted">Haz clic en un puesto y luego en un jugador de la lista para cambiarlo.</p></div>
        <div class="panel squad-list">${list}</div>
      </div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Cancelar</button><button class="btn primary" data-act="save">Guardar</button></div>`;
    };
    const s = this.show(render(), {
      formPrev: () => { formation = FORMATION_IDS[(FORMATION_IDS.indexOf(formation) + FORMATION_IDS.length - 1) % FORMATION_IDS.length]; s.refresh(render()); },
      formNext: () => { formation = FORMATION_IDS[(FORMATION_IDS.indexOf(formation) + 1) % FORMATION_IDS.length]; s.refresh(render()); },
      slot: (t) => { selSlot = Number(t.dataset.i); s.refresh(render()); },
      pick: (t) => {
        const id = t.dataset.id!;
        if (selSlot < 0) return;
        const existing = lineup.indexOf(id);
        if (existing >= 0) [lineup[existing], lineup[selSlot]] = [lineup[selSlot], lineup[existing]];
        else lineup[selSlot] = id;
        selSlot = -1;
        s.refresh(render());
      },
      save: () => {
        const gkIdx = lineup.findIndex((id) => byId(id).position === 'GK');
        if (gkIdx > 0) [lineup[0], lineup[gkIdx]] = [lineup[gkIdx], lineup[0]];
        c.setLineup(formation, lineup);
        this.careerHub();
      },
      back: () => this.careerHub(),
    }, () => this.careerHub());
  }

  // ==================================================================
  // Entrenamiento
  // ==================================================================

  trainingScreen() {
    this.setMenuMode(true);
    let idx = 0;
    const start = (mode: 'free' | 'penalties' | 'freekicks') => {
      const home = TEAMS[idx];
      const away = TEAMS[(idx + 1) % TEAMS.length];
      this.playMatch({
        home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away), humanTeam: 0, halfLengthSec: 600,
        difficulty: this.settings.difficulty, extraTime: false, penalties: false, training: mode,
      }, STADIUMS[2].id, { mode: 'training' });
    };
    const render = () => `
      <div class="screen-header"><div><div class="crumb">ENTRENAMIENTO</div><h2>Campo de práctica</h2></div></div>
      <div class="screen-body"><div class="grid2">
        ${this.teamCard(TEAMS[idx], 'EQUIPO', 'team')}
        <div class="menu-list">
          <button class="menu-item" data-act="free">Práctica libre<small>Pases, conducción y tiros contra el arquero rival</small></button>
          <button class="menu-item" data-act="pens">Penales<small>Apunta, carga la potencia y engaña al arquero</small></button>
          <button class="menu-item" data-act="fk">Tiros libres<small>Con barrera, desde posiciones aleatorias</small></button>
          <button class="menu-item" data-act="back">Volver</button>
        </div>
      </div>
      <p class="muted">Pulsa Esc durante el entrenamiento para salir. Tras cada gol o balón fuera, la jugada se reinicia.</p></div>`;
    const s = this.show(render(), {
      teamPrev: () => { idx = (idx + TEAMS.length - 1) % TEAMS.length; s.refresh(render()); },
      teamNext: () => { idx = (idx + 1) % TEAMS.length; s.refresh(render()); },
      free: () => start('free'),
      pens: () => start('penalties'),
      fk: () => start('freekicks'),
      back: () => this.mainMenu(),
    }, () => this.mainMenu());
  }

  // ==================================================================
  // Configuración y controles
  // ==================================================================

  settingsScreen(back: () => void, inMatch = false) {
    const st = this.settings;
    const Q = ['low', 'medium', 'high'] as const;
    const QL = { low: 'Baja', medium: 'Media', high: 'Alta' };
    const CAMS = ['broadcast', 'tele', 'wide'] as const;
    const CL = { broadcast: 'Transmisión', tele: 'Tele', wide: 'Panorámica' };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const toggle = (label: string, key: keyof GameSettings) => `<div class="row"><label>${label}</label><button class="toggle ${st[key] ? 'on' : ''}" data-act="tog" data-key="${key}"></button></div>`;
    const render = () => `
      <div class="screen-header"><div><div class="crumb">CONFIGURACIÓN</div><h2>Opciones</h2></div></div>
      <div class="screen-body"><div class="grid3">
        <div class="panel"><h3>Gráficos</h3>
          ${this.stepper('Calidad', QL[st.quality] + (inMatch ? ' (próximo partido)' : ''), 'qual')}
          ${toggle('Sombras', 'shadows')}
          ${this.stepper('Escala de resolución', pct(st.resolutionScale), 'res')}
          ${toggle('Antialiasing (reiniciar)', 'antialias')}
          ${this.stepper('Cámara', CL[st.cameraStyle], 'cam')}
          ${this.stepper('Zoom de cámara', st.cameraZoom.toFixed(1) + 'x', 'zoom')}
          ${toggle('Radar', 'showRadar')}
          ${toggle('Indicadores y ayudas visuales', 'showIndicators')}
          ${toggle('Repeticiones de goles', 'replays')}
          ${this.stepper('Controles táctiles', ({ auto: 'Automático', on: 'Siempre', off: 'Desactivados' } as const)[st.touchControls], 'touch')}
        </div>
        <div class="panel"><h3>Sonido</h3>
          ${this.stepper('Volumen general', pct(st.masterVolume), 'vmaster')}
          ${this.stepper('Música', pct(st.musicVolume), 'vmusic')}
          ${this.stepper('Efectos', pct(st.sfxVolume), 'vsfx')}
          ${this.stepper('Público', pct(st.crowdVolume), 'vcrowd')}
        </div>
        <div class="panel"><h3>Jugabilidad</h3>
          ${this.stepper('Dificultad por defecto', DIFFICULTY_LABELS[st.difficulty], 'diff')}
          ${this.stepper('Duración de parte (torneo/carrera)', `${st.halfMinutes} min`, 'half')}
          ${toggle('Cambio automático de jugador', 'autoSwitch')}
          ${this.stepper('Asistencia de pase', st.passAssist >= 0.5 ? 'Asistida' : 'Manual', 'assist')}
          ${this.stepper('Asistencia total (toque rápido, puntería, defensa)', ({ auto: 'Automática (móvil)', on: 'Siempre', off: 'No' } as const)[st.assist], 'assistAll')}
          ${this.stepper('Velocidad barra de potencia', `${st.powerBarTime.toFixed(1)} s`, 'pbar')}
          ${this.stepper('Zona muerta del stick', pct(st.deadzone), 'dz')}
          ${this.stepper('Sensibilidad del stick', st.sensitivity.toFixed(1), 'sens')}
        </div>
      </div></div>
      <div class="screen-footer"><button class="btn" data-act="reset">Restablecer</button><button class="btn primary" data-act="back">Guardar y volver</button></div>`;
    const step = (key: keyof GameSettings, d: number, min: number, max: number, inc: number) => {
      (st as any)[key] = Math.round(Math.min(max, Math.max(min, (st[key] as number) + d * inc)) * 100) / 100;
      apply();
    };
    const cycleArr = <T,>(arr: readonly T[], cur: T, d: number) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
    const apply = () => {
      saveSettings(st);
      this.applyAudio();
      this.input.settings = { deadzone: st.deadzone, sensitivity: st.sensitivity };
      this.onResize();
      s.refresh(render());
    };
    const h: Handlers = {
      tog: (t) => { const k = t.dataset.key as keyof GameSettings; (st as any)[k] = !st[k]; apply(); },
      qualPrev: () => { st.quality = cycleArr(Q, st.quality, -1); apply(); },
      qualNext: () => { st.quality = cycleArr(Q, st.quality, 1); apply(); },
      resPrev: () => step('resolutionScale', -1, 0.5, 1, 0.1), resNext: () => step('resolutionScale', 1, 0.5, 1, 0.1),
      touchPrev: () => { st.touchControls = cycleArr(['auto', 'on', 'off'] as const, st.touchControls, -1); apply(); },
      touchNext: () => { st.touchControls = cycleArr(['auto', 'on', 'off'] as const, st.touchControls, 1); apply(); },
      camPrev: () => { st.cameraStyle = cycleArr(CAMS, st.cameraStyle, -1); apply(); },
      camNext: () => { st.cameraStyle = cycleArr(CAMS, st.cameraStyle, 1); apply(); },
      zoomPrev: () => step('cameraZoom', -1, 0.7, 1.5, 0.1), zoomNext: () => step('cameraZoom', 1, 0.7, 1.5, 0.1),
      vmasterPrev: () => step('masterVolume', -1, 0, 1, 0.1), vmasterNext: () => step('masterVolume', 1, 0, 1, 0.1),
      vmusicPrev: () => step('musicVolume', -1, 0, 1, 0.1), vmusicNext: () => step('musicVolume', 1, 0, 1, 0.1),
      vsfxPrev: () => step('sfxVolume', -1, 0, 1, 0.1), vsfxNext: () => step('sfxVolume', 1, 0, 1, 0.1),
      vcrowdPrev: () => step('crowdVolume', -1, 0, 1, 0.1), vcrowdNext: () => step('crowdVolume', 1, 0, 1, 0.1),
      diffPrev: () => { st.difficulty = cycleArr(DIFFS, st.difficulty, -1); apply(); },
      diffNext: () => { st.difficulty = cycleArr(DIFFS, st.difficulty, 1); apply(); },
      halfPrev: () => { st.halfMinutes = cycleArr(HALF_OPTIONS, st.halfMinutes, -1); apply(); },
      halfNext: () => { st.halfMinutes = cycleArr(HALF_OPTIONS, st.halfMinutes, 1); apply(); },
      assistAllPrev: () => { st.assist = cycleArr(['auto', 'on', 'off'] as const, st.assist, -1); apply(); },
      assistAllNext: () => { st.assist = cycleArr(['auto', 'on', 'off'] as const, st.assist, 1); apply(); },
      assistPrev: () => { st.passAssist = st.passAssist >= 0.5 ? 0 : 1; apply(); },
      assistNext: () => { st.passAssist = st.passAssist >= 0.5 ? 0 : 1; apply(); },
      pbarPrev: () => step('powerBarTime', -1, 0.6, 1.6, 0.1), pbarNext: () => step('powerBarTime', 1, 0.6, 1.6, 0.1),
      dzPrev: () => step('deadzone', -1, 0.05, 0.4, 0.05), dzNext: () => step('deadzone', 1, 0.05, 0.4, 0.05),
      sensPrev: () => step('sensitivity', -1, 0.5, 1.5, 0.1), sensNext: () => step('sensitivity', 1, 0.5, 1.5, 0.1),
      reset: () => { const b = st.bindings; Object.assign(st, structuredClone(DEFAULT_SETTINGS)); st.bindings = b; apply(); },
      back: () => { saveSettings(st); back(); },
    };
    const s = this.show(render(), h, () => { saveSettings(st); back(); });
    if (inMatch) s.root.style.background = 'rgba(4,7,14,0.92)';
  }

  controlsScreen(back: () => void, inMatch = false) {
    const st = this.settings;
    let listening: Action | null = null;
    const render = () => `
      <div class="screen-header"><div><div class="crumb">CONTROLES</div><h2>Teclado y mando</h2></div></div>
      <div class="screen-body"><div class="grid2">
        <div class="panel"><h3>Teclado</h3>
          ${this.stepper('Esquema', st.preset === 'fifa' ? 'Clásico (flechas + QWEASD)' : st.preset === 'wasd' ? 'Alternativo (WASD + IJKL)' : 'Personalizado', 'preset')}
          ${ACTIONS.map((a) => `<div class="row"><label>${ACTION_LABELS[a]}</label><span>${st.bindings[a].map((k, i) => `<span class="keycap ${listening === a && i === 0 ? 'listening' : ''}">${listening === a && i === 0 ? '…' : keyLabel(k)}</span>`).join('')}<button class="btn" style="padding:4px 10px;font-size:12px;margin-left:6px" data-act="rebind" data-a="${a}">Cambiar</button></span></div>`).join('')}
        </div>
        <div class="panel"><h3>Mando (Xbox / PlayStation)</h3>
          <div class="row"><label>Mover</label><span>Stick izquierdo / Cruceta</span></div>
          <div class="row"><label>Pase corto / Cabezazo · Presionar</label><span class="keycap">A / ✕</span></div>
          <div class="row"><label>Tiro / Volea · Entrada</label><span class="keycap">B / ○</span></div>
          <div class="row"><label>Pase elevado / Centro · Barrida</label><span class="keycap">X / □</span></div>
          <div class="row"><label>Pase al hueco · Salida del arquero</label><span class="keycap">Y / △</span></div>
          <div class="row"><label>Sprint</label><span class="keycap">RT / R2</span></div>
          <div class="row"><label>Cambiar jugador (sin balón)</label><span class="keycap">LB / L1</span></div>
          <div class="row"><label>Presión de compañero (defensa)</label><span class="keycap">RB / R1</span></div>
          <div class="row"><label>Contener (defensa)</label><span class="keycap">LT / L2</span></div>
          <div class="row"><label>Regates</label><span>Stick derecho · R3 ruleta</span></div>
          <div class="row"><label>Pausa</label><span class="keycap">Start / Options</span></div>
          <p class="muted">Mantén pulsado el botón de pase o tiro para cargar la barra de potencia y suéltalo para golpear. Pulsar antes de recibir el balón realiza un golpeo de primera.</p>
        </div>
        <div class="panel"><h3>Tipos de tiro (combinables)</h3>
          <div class="row"><label>Tiro normal</label><span><span class="keycap">D</span> · B / ○</span></div>
          <div class="row"><label>Tiro raso</label><span><span class="keycap">D</span> + <span class="keycap">D</span> (doble toque)</span></div>
          <div class="row"><label>Con efecto (rosca)</label><span><span class="keycap">Shift</span>+<span class="keycap">D</span> · RB + B</span></div>
          <div class="row"><label>Vaselina</label><span><span class="keycap">Q</span>+<span class="keycap">D</span> · LB + B</span></div>
          <div class="row"><label>Potente</label><span><span class="keycap">Q</span>+<span class="keycap">Shift</span>+<span class="keycap">D</span> o <span class="keycap">Ctrl</span>+<span class="keycap">D</span> · LT + B</span></div>
          <div class="row"><label>Rosca rasa · Potente raso</label><span>añade el doble toque</span></div>
          <div class="row"><label>Rosca potente · Vaselina potente</label><span>añade <span class="keycap">Ctrl</span> / LT</span></div>
          <div class="row"><label>Amago de tiro</label><span>mientras cargas <span class="keycap">D</span>, pulsa <span class="keycap">S</span></span></div>
          <p class="muted">En móvil: botones ROSCA, VASELINA, RASO y POTENTE (disparan directamente); mantén uno y toca otro para combinarlos. No hay botón de sprint: con el joystick pasado de la mitad se corre solo.</p>
        </div>
        <div class="panel"><h3>Modo asistido (móvil)</h3>
          <div class="row"><label>Pase / Tiro con un toque</label><span>potencia automática</span></div>
          <div class="row"><label>Pase</label><span>elige al compañero libre, sin rivales en medio y sin fuera de juego</span></div>
          <div class="row"><label>Con el joystick</label><span>el pase va hacia esa dirección</span></div>
          <div class="row"><label>Tiro</label><span>entre los palos y lejos del arquero</span></div>
          <div class="row"><label>Joystick al máximo</label><span>esprinta solo</span></div>
          <div class="row"><label>Defensa</label><span>la entrada se orienta sola al balón; el cambio de jugador es más rápido</span></div>
          <p class="muted">Mantén pulsado el botón para cargar la barra y controlar tú la potencia. Se puede activar o desactivar en Configuración → Asistencia total.</p>
        </div>
        <div class="panel"><h3>Regates (como FIFA)</h3>
          <div class="row"><label>Bicicleta (hacia ese lado)</label><span><span class="keycap">J</span>/<span class="keycap">L</span> · stick der. ← →</span></div>
          <div class="row"><label>Elástico</label><span><span class="keycap">Shift</span>+<span class="keycap">J</span>/<span class="keycap">L</span> · RB + stick der. ← →</span></div>
          <div class="row"><label>Sombrero</label><span><span class="keycap">I</span> · stick der. ↑</span></div>
          <div class="row"><label>Arrastre (freno y giro)</label><span><span class="keycap">K</span> · stick der. ↓</span></div>
          <div class="row"><label>Ruleta</label><span><span class="keycap">R</span> · R3</span></div>
          <p class="muted">Las direcciones son relativas al jugador (↑ = hacia donde corre). En móvil: desliza el dedo en la zona libre de la derecha (en diagonal = elástico) y doble toque = ruleta. Un regate bien hecho deja atrás al defensor; con poco control puedes perder el balón.</p>
        </div>
      </div></div>
      <div class="screen-footer"><button class="btn primary" data-act="back">Volver</button></div>`;
    const apply = () => { this.input.bindings = structuredClone(st.bindings); saveSettings(st); s.refresh(render()); };
    const presets = ['fifa', 'wasd'] as const;
    const s = this.show(render(), {
      presetPrev: () => { st.preset = st.preset === 'fifa' ? 'wasd' : 'fifa'; st.bindings = structuredClone(st.preset === 'fifa' ? FIFA_CLASSIC : WASD_ALT); apply(); },
      presetNext: () => { st.preset = st.preset === 'fifa' ? 'wasd' : 'fifa'; st.bindings = structuredClone(st.preset === 'fifa' ? FIFA_CLASSIC : WASD_ALT); apply(); },
      rebind: (t) => {
        listening = t.dataset.a as Action;
        s.refresh(render());
        (window as any).__captureKey = true;
        this.input.captureNext = (code) => {
          (window as any).__captureKey = false;
          if (code !== 'Escape' && listening) {
            // quitar la tecla de otras acciones para evitar conflictos
            for (const a of ACTIONS) st.bindings[a] = st.bindings[a].filter((k) => k !== code);
            st.bindings[listening] = [code, ...st.bindings[listening].filter((k) => k !== code)].slice(0, 2);
            st.preset = 'custom';
          }
          listening = null;
          apply();
        };
      },
      back: () => back(),
    }, () => back());
    void presets;
    if (inMatch) s.root.style.background = 'rgba(4,7,14,0.92)';
  }
}

export type { PlayerData };
