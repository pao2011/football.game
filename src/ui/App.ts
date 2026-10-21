import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { CROWD_SAMPLES } from '../audio/crowdTracks';
import { getSpeech } from '../audio/Speech';
import { DIFFICULTY_LABELS } from '../ai/Difficulty';
import { AutoQuality } from '../game/AutoQuality';
import { LANG_NAMES, setLang } from '../i18n';
import { ReplayViewer } from '../game/ReplayViewer';
import type { MatchView } from '../render/MatchView';
import { deleteReplay, encodeFrames, lastSeconds, listReplays, MAX_SAVED_REPLAYS, saveReplay, type SavedReplay } from '../modes/SavedReplays';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type GameSettings } from '../config/Settings';
import { FORMATION_IDS, FORMATIONS } from '../data/formations';
import { LEAGUE_IDS, classicName, matchHeat } from '../data/classics';
import { LEAGUES, getLeague, leagueLogo, leagueOfTeam } from '../data/leagues';
import { GENERIC_STADIUMS, STADIUMS, getStadium, stadiumForHome } from '../data/stadiums';
import { BUILTIN_TEAM_COUNT, TEAMS, chooseAwayKit, getTeam, playerOverall } from '../data/teams';
import { WEATHER_NAMES, randomWeather, type Weather } from '../sim/Weather';
import { disciplineOf, isAvailable } from '../modes/Availability';
import { ACHIEVEMENTS, unlock, unlockedSet, type AchievementDef } from '../modes/Achievements';
import { deleteCustomTeam, exportTeam, importTeam, isCustom, loadCustomTeams, newCustomTeam, registerCustomTeams, saveCustomTeam, setTeamLevel, shortOf, teamLevel } from '../data/customTeams';
import type { Difficulty, FormationId, PlayerData, TeamData } from '../data/types';
import { MatchRunner, type MatchResultInfo } from '../game/MatchRunner';
import { ACTIONS, ACTION_LABELS, FIFA_CLASSIC, Input, WASD_ALT, keyLabel, versusDevicesLabel, type Action } from '../input/Input';
import { MAX_SUBS, type MatchConfig } from '../sim/Match';
import { manOfTheMatch, playerRatings } from '../sim/Ratings';
import { Continental, CUPS, cupEligibleTeams, type CupId } from '../modes/Continental';
import { Career, SQUAD_MAX, SQUAD_MIN, buyPlayer, marketOffers, playerPrice, sellPlayer } from '../modes/Career';
import { Tournament } from '../modes/Tournament';
import type { Fixture, StandingRow } from '../modes/Competition';
import { crestSVG, kitSVG } from './Crest';
import { ClubUI } from './club/ClubUI';
import type { ClubMatchMeta } from '../modes/club/Club';
import { sanitizeOnlineTeam } from '../modes/club/squads';
import { ceremonySeen, markCeremonySeen, playCeremony } from './Ceremony';
import { TEAM_SORTS, leagueLabel, searchTeams, teamLeagueId, type TeamSort } from './teamSearch';
import { Screen, el, esc, type Handlers } from './dom';
import { isTouchDevice } from '../input/TouchControls';
import { gamepadBlocked } from '../input/pads';
import { NetClient, cachedProfile, serverCandidates, type FinalMsg, type MatchStart, type OnlineProfile, type ServerMsg } from '../net/NetClient';
import { DIVISIONS } from '../../server/divisions.mjs';
import type { OnlineLink } from '../game/MatchRunner';

/** Descarga directa de la APK de Android (la publica GitHub Actions en cada actualización de main). */
export const APK_URL = 'https://github.com/pao2011/football.game/releases/latest/download/FootballElite3D.apk';

/** ¿Se está ejecutando dentro de la app de Android? */
function isNativeApp() {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.() || (location.protocol === 'https:' && location.hostname === 'localhost' && !location.port);
}

const QUICK_CHAT = ['¡Buen partido!', '¡Qué golazo!', '¡Uy, casi!', '¡Vamos!', 'Perdón', '¡Gracias!'];

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

const MENTALITY_NAMES = ['Ultradefensiva', 'Defensiva', 'Equilibrada', 'Ofensiva', 'Ultraofensiva'];
const SIDES: QuickSetup['side'][] = [0, 1, 2, 3, -1];
const WEATHER_CYCLE: (Weather | 'random')[] = ['clear', 'rain', 'snow', 'wind', 'random'];

interface QuickSetup {
  home: number;
  away: number;
  stadium: number;
  half: number;
  difficulty: number;
  /** 0 local, 1 visitante, -1 espectador, 2 = dos jugadores (local contra visitante), 3 = dos jugadores en el local contra la IA. */
  side: 0 | 1 | -1 | 2 | 3;
  formation: FormationId | null;
  /** Equipación del visitante: automática (la que más contrasta), titular o suplente. */
  awayKit?: 'auto' | 'home' | 'away';
  /** Clima del partido rápido. */
  weather?: Weather | 'random';
  /** Liga que filtra los equipos (id de data/leagues.ts; 'all' = todas). */
  league?: string;
}

type MatchContext =
  | { mode: 'quick' }
  | { mode: 'online'; start: MatchStart }
  | { mode: 'tournament'; fixture: Fixture }
  | { mode: 'career'; fixture: Fixture }
  | { mode: 'continental'; fixture: Fixture }
  | { mode: 'club'; meta: ClubMatchMeta }
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
  private lastStadiumId = '';
  private replayViewer: ReplayViewer | null = null;
  tournament: Tournament | null = null;
  career: Career | null = null;
  continental: Continental | null = null;

  private splashShown = false;
  /** Conexión online (se crea al entrar en ONLINE). */
  private net: NetClient | null = null;
  private netOff: (() => void) | null = null;
  /** Equipo elegido para jugar online (índice en TEAMS). */
  private onlineTeam = 0;
  /** Resultado online pendiente de los puntos de Rivals. */
  private onlineFinal: FinalMsg | null = null;
  /** Partido online de Soffti Club en curso: se contabiliza en el club al llegar el resultado del servidor. */
  private clubOnline: { meta: ClubMatchMeta; stats?: { passes: number; passesOk: number; shots: number; tackles: number }; half: number; role: 'host' | 'guest' } | null = null;
  private onlineWatch = 0;

  constructor(private canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.ui = ui;
    this.settings = loadSettings();
    this.input = new Input(this.settings.bindings);
    this.input.settings = { deadzone: this.settings.deadzone, sensitivity: this.settings.sensitivity };
    this.renderer = this.createRenderer();
    this.bg = el('div', 'menu-bg', '<div class="pitch-lines"></div>');
    document.body.insertBefore(this.bg, ui);
    this.audio.setCrowdSamples(CROWD_SAMPLES);
    registerCustomTeams(); // equipos creados en el editor
    setLang(this.settings.language);
    this.applyAudio();
    this.quick = { home: 0, away: 1, stadium: Math.max(0, STADIUMS.findIndex((x) => x.homeTeam === TEAMS[0].id)), half: HALF_OPTIONS.indexOf(this.settings.halfMinutes), difficulty: DIFFS.indexOf(this.settings.difficulty), side: 0, formation: null };
    if (this.quick.half < 0) this.quick.half = 2;
    if (this.quick.difficulty < 0) this.quick.difficulty = 1;
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    // M: silenciar / activar el sonido en cualquier momento (salvo si la tecla está asignada a otra acción)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat || (window as any).__captureKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (Object.values(this.settings.bindings).some((ks) => ks.includes('KeyM'))) return;
      this.toggleMute();
    });
  }

  /** Silencia o reactiva todo el sonido y lo indica brevemente en pantalla. */
  toggleMute() {
    this.settings.muted = !this.settings.muted;
    saveSettings(this.settings);
    this.applyAudio();
    const t = el('div', 'mute-toast', this.settings.muted ? '🔇 Sonido desactivado <small>(M)</small>' : '🔊 Sonido activado <small>(M)</small>');
    this.ui.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  private createRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.settings.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.settings.resolutionScale);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    return r;
  }

  /** Frase de prueba al cambiar el volumen del narrador. */
  private sampleCommentary() {
    const sp = getSpeech();
    const vol = this.settings.commentaryVolume * this.settings.masterVolume;
    if (vol <= 0) {
      sp.cancel();
      return;
    }
    if (!sp.available) {
      document.querySelector('.pad-toast')?.remove();
      const t = el('div', 'pad-toast', '🎙️ <b>Sin voz de narrador</b><small>Este dispositivo no tiene voces del sistema: prueba con Chrome o Edge.</small>');
      document.body.appendChild(t);
      setTimeout(() => t.classList.add('out'), 3200);
      setTimeout(() => t.remove(), 3700);
      return;
    }
    sp.speak('¡Así suena el relator! ¡Gooooool!', { rate: 1.1, pitch: 1.05, volume: Math.min(1, vol) });
  }

  private applyAudio() {
    const s = this.settings;
    this.audio.setVolumes({ master: s.muted ? 0 : s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, crowd: s.crowdVolume, ball: s.ballVolume, referee: s.refereeVolume });
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.settings.resolutionScale);
    this.renderer.setSize(w, h, false);
    this.runner?.resize(w, h);
    this.replayViewer?.resize(w, h);
  }

  private show(html: string, handlers: Handlers, back: (() => void) | null, cls = '') {
    this.screen?.dispose(true);
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
      <div class="logo"><div class="l1">SOFFTI'S FOOTBALL</div><div class="l2">GAME</div></div>
      <button class="press btn" data-act="go" style="background:none;border:none">${isTouchDevice() ? 'TOCA PARA EMPEZAR' : 'PULSA ENTER PARA EMPEZAR'}</button>
      <div class="pad-hint">${gamepadBlocked()
        ? '🎮 El navegador bloquea el mando dentro de esta página incrustada. Abre el juego en su propia pestaña (enlace directo) para usarlo.'
        : '🎮 ¿Usas mando? Pulsa cualquier botón para conectarlo'}</div>
      <div class="version-tag">v${VERSION}</div>`, { go: () => { this.enterMobileFullscreen(); this.mainMenu(); } }, null, 'title-screen');
    void s;
    this.watchPads();
    this.playSplash();
  }

  private padWatching = false;

  /** Avisa cuando se conecta o desconecta un mando (el navegador solo lo detecta tras pulsar un botón). */
  private watchPads() {
    if (this.padWatching) return;
    this.padWatching = true;
    const note = (html: string) => {
      document.querySelector('.pad-toast')?.remove();
      const t = el('div', 'pad-toast', html);
      document.body.appendChild(t);
      setTimeout(() => t.classList.add('out'), 3200);
      setTimeout(() => t.remove(), 3700);
    };
    window.addEventListener('gamepadconnected', (e) => {
      const gp = (e as GamepadEvent).gamepad;
      const id = (gp.id || 'Mando').replace(/\(.*?\)/g, '').trim().slice(0, 40) || 'Mando';
      note(`🎮 <b>Mando conectado</b><small>${esc(id)}${gp.mapping === 'standard' ? '' : ' · mapa no estándar: si algún botón no responde, usa un mando Xbox/PlayStation'}</small>`);
    });
    window.addEventListener('gamepaddisconnected', () => note('🎮 <b>Mando desconectado</b><small>Reconéctalo y pulsa un botón</small>'));
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
      <div class="sp-beams"><i></i><i></i><i></i><i></i></div>
      <div class="sp-floor"></div>
      <div class="sp-sparks">${Array.from({ length: 28 }, (_, i) => `<i style="--a:${(i * 360) / 28 + (i % 2) * 6}deg;--d:${22 + (i % 5) * 7}vmin;--s:${0.6 + (i % 3) * 0.3};--h:${i % 3 === 0 ? '#f6b40e' : i % 3 === 1 ? '#fff' : '#74acdf'}"></i>`).join('')}</div>
      <div class="sp-logo"><span class="s1">${[...`SOFFTI'S FOOTBALL`].map((ch, i) => (ch === ' ' ? '<b class="sp-sp"></b>' : `<b style="--i:${i}">${ch}</b>`)).join('')}</span><span class="sp-stripe"><i></i><i></i><i></i></span><span class="s2">GAME</span><span class="sp-shine"></span></div>
      <div class="sp-sub">11 contra 11 · IA táctica · física real</div>
      <div class="sp-progress"><i></i></div>
      <div class="sp-skip">toca para saltar</div>`;
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
    setTimeout(end, 4700);
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
    const crests = TEAMS.filter((t) => LEAGUE_IDS.includes(t.id)).map((t) => crestSVG(t, 56)).join(''); // el muro de escudos del menú: los 30 de la Liga Profesional
    const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
    this.show(`
      <div class="main-menu">
        <div class="menu-list">
          <button class="menu-item" data-act="quick">Partido rápido<small>Elige equipos, estadio y dificultad</small></button>
          <button class="menu-item" data-act="online">Online<small>Division Rivals, amistosos y salas con amigos</small></button>
          <button class="menu-item" data-act="tournament">Copa Élite<small>Torneo: fase de grupos y eliminatorias</small></button>
          <button class="menu-item" data-act="continental">Copas internacionales<small>Libertadores, Sudamericana, Champions, Europa y Conference League</small></button>
          <button class="menu-item" data-act="career">Carrera<small>21 ligas de Sudamérica y Europa</small></button>
          <button class="menu-item" data-act="club">Soffti Club<small>Cartas, sobres, mercado, plantillas y competiciones</small></button>
          <button class="menu-item" data-act="training">Entrenamiento<small>Tiros, pases, penales y tiros libres</small></button>
          <button class="menu-item" data-act="settings">Configuración<small>Gráficos, sonido y jugabilidad</small></button>
          <button class="menu-item" data-act="editor">✏️ Editor de equipos<small>Crea tu equipo · exportar e importar</small></button>
          <button class="menu-item" data-act="replays">🎬 Repeticiones<small>Tus jugadas guardadas</small></button>
          <button class="menu-item" data-act="achievements">🏆 Logros<small>${Object.keys(unlockedSet()).length}/${ACHIEVEMENTS.length} desbloqueados</small></button>
          <button class="menu-item" data-act="controls">Controles<small>Teclado y mando · reasignar teclas</small></button>
          ${!isElectron && !isNativeApp() ? '<button class="menu-item apk-item" data-act="apk">📲 Descargar APK<small>Instala el juego en tu Android</small></button>' : ''}
          ${isElectron ? '<button class="menu-item" data-act="quit">Salir</button>' : ''}
        </div>
        <div class="menu-hero">
          <div class="logo"><div class="l1">SOFFTI'S FOOTBALL</div><div class="l2">GAME</div></div>
          <div class="crest-row">${crests}</div>
        </div>
      </div>
      <div class="version-tag">v${VERSION} · ${isTouchDevice() ? 'Toca una opción para elegir' : '↑↓ para navegar · Enter/S para elegir · Esc para volver'}</div>`, {
      quick: () => this.quickMatchScreen(),
      replays: () => this.replaysScreen(),
      online: () => this.onlineMenu(),
      tournament: () => this.tournamentHub(),
      career: () => this.careerHub(),
      club: () => this.clubUI.open(),
      continental: () => this.continentalHub(),
      training: () => this.trainingScreen(),
      settings: () => this.settingsScreen(() => this.mainMenu()),
      controls: () => this.controlsScreen(() => this.mainMenu()),
      achievements: () => this.achievementsScreen(),
      editor: () => this.teamEditorList(),
      quit: () => window.close(),
      apk: () => { window.open(APK_URL, '_blank', 'noopener'); },
    }, () => this.start());
  }

  // ==================================================================
  // Partido rápido
  // ==================================================================

  private teamCard(t: TeamData, side: string, prefix: string, extra = '', search = false) {
    const stars = '★'.repeat(Math.max(1, Math.round((t.rating - 70) / 3.5))).padEnd(5, '☆');
    return `<div class="panel team-picker">
      <div class="side">${side}</div>
      <div class="nav"><button data-act="${prefix}Prev">‹</button><div class="crest">${crestSVG(t, 140)}</div><button data-act="${prefix}Next">›</button></div>
      <div class="tname">${esc(t.name)}</div>
      <div class="stars">${stars} <span class="muted">${t.rating}</span></div>
      <div class="muted">${esc(t.city)} · ${t.formation}</div>
      ${extra}
      ${search ? `<button class="btn ts-open" data-act="${prefix}Search">🔍 Buscar equipo</button>` : ''}
    </div>`;
  }

  /**
   * Buscador de equipos: por nombre (texto), por liga y con varios órdenes (A-Z, Z-A, valoración, por liga).
   * `onPick` recibe el id del equipo elegido; `back` vuelve a la pantalla anterior sin cambiar nada.
   */
  private teamSearchScreen(opts: { title: string; crumb: string; teams: TeamData[]; current?: string; league?: string; onPick: (id: string) => void; back: () => void }) {
    const leagueIds = [...new Set(opts.teams.map(teamLeagueId))];
    const leagueOpts = [...LEAGUES.map((l) => l.id).filter((id) => leagueIds.includes(id)), ...(leagueIds.includes('') ? ['custom'] : [])];
    let league = opts.league && leagueOpts.includes(opts.league) ? opts.league : 'all';
    let sort: TeamSort = this.teamSort;
    let query = '';
    let limit = 60;
    const handlers: Handlers = { back: opts.back };
    const listHTML = () => {
      const found = searchTeams(opts.teams, query, league, sort);
      const shown = found.slice(0, limit);
      for (const k of Object.keys(handlers)) if (k.startsWith('pick-')) delete handlers[k];
      let html = '';
      let last = '\0';
      for (const t of shown) {
        const lid = teamLeagueId(t);
        if (sort === 'league' && lid !== last) { last = lid; html += `<div class="ts-head">${esc(leagueLabel(lid))}</div>`; }
        handlers[`pick-${t.id}`] = () => opts.onPick(t.id);
        html += `<button class="ts-item${t.id === opts.current ? ' cur' : ''}" data-act="pick-${esc(t.id)}">${crestSVG(t, 34)}<span class="ts-n">${esc(t.name)}<small>${esc(leagueLabel(lid))}</small></span><span class="ts-r num">${t.rating}</span></button>`;
      }
      if (!shown.length) html = '<p class="muted" style="padding:12px">No hay equipos que coincidan con la búsqueda.</p>';
      if (found.length > shown.length) html += `<button class="btn" data-act="more" style="grid-column:1/-1">Mostrar más (${found.length - shown.length})</button>`;
      return { html, count: found.length };
    };
    const first = listHTML();
    const s = this.show(`
      <div class="screen-header"><div><div class="crumb">${opts.crumb}</div><h2>${opts.title}</h2></div></div>
      <div class="ts-bar">
        <input class="text-in ts-q" type="search" placeholder="Buscar por nombre, sigla o ciudad…" autocomplete="off" autocapitalize="off" spellcheck="false" data-enter="pickFirst" aria-label="Buscar equipo">
        <label class="ts-sel">Liga<select class="ts-league"><option value="all">Todas las ligas</option>${leagueOpts.map((id) => `<option value="${id}"${id === league ? ' selected' : ''}>${esc(id === 'custom' ? 'Equipos propios' : getLeague(id).name)}</option>`).join('')}</select></label>
        <label class="ts-sel">Orden<select class="ts-sort">${TEAM_SORTS.map((o) => `<option value="${o.id}"${o.id === sort ? ' selected' : ''}>${o.label}</option>`).join('')}</select></label>
        <span class="ts-count muted num">${first.count}</span>
      </div>
      <div class="screen-body"><div class="ts-list">${first.html}</div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, handlers, opts.back);
    const list = s.root.querySelector('.ts-list') as HTMLElement;
    const count = s.root.querySelector('.ts-count') as HTMLElement;
    const redraw = () => { const r = listHTML(); list.innerHTML = r.html; count.textContent = String(r.count); s.applyFocus(); };
    handlers.more = () => { limit += 80; redraw(); };
    handlers.pickFirst = () => {
      const f = searchTeams(opts.teams, query, league, sort)[0];
      if (f) opts.onPick(f.id);
    };
    const q = s.root.querySelector('.ts-q') as HTMLInputElement;
    q.addEventListener('input', () => { query = q.value; limit = 60; redraw(); });
    (s.root.querySelector('.ts-league') as HTMLSelectElement).addEventListener('change', (e) => { league = (e.target as HTMLSelectElement).value; limit = 60; redraw(); });
    (s.root.querySelector('.ts-sort') as HTMLSelectElement).addEventListener('change', (e) => { sort = this.teamSort = (e.target as HTMLSelectElement).value as TeamSort; limit = 60; redraw(); });
    if (!isTouchDevice()) q.focus();
    s.root.querySelector('.ts-item.cur')?.scrollIntoView({ block: 'center' });
  }
  private teamSort: TeamSort = 'az';

  /** Modo Soffti Club: coleccionables, plantillas, mercado local y competiciones contra la IA. */
  readonly clubUI: ClubUI = new ClubUI({
    show: (html, handlers, back, cls) => this.show(html, handlers, back, cls),
    audio: this.audio,
    mainMenu: () => this.mainMenu(),
    pickTeam: (title, onPick, back) => this.teamSearchScreen({ title, crumb: 'SOFFTI CLUB', teams: TEAMS, onPick, back }),
    playClubMatch: (home, away, meta, o) => {
      const cfg: MatchConfig = {
        home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away), humanTeam: 0,
        halfLengthSec: this.settings.halfMinutes * 60, difficulty: this.settings.difficulty,
        extraTime: o.knockout, penalties: o.knockout, weather: randomWeather(Math.random()),
      };
      const ctx: MatchContext = { mode: 'club', meta };
      this.playMatch(cfg, this.stadiumForCtx(ctx), ctx);
    },
    clubOnline: () => {
      if (this.net?.connected) { this.clubOnlineQueue(); return; }
      if (!this.settings.onlineName) this.settings.onlineName = this.clubUI.club.s.identity.name.slice(0, 16);
      this.connectOnline(() => this.clubOnlineQueue());
    },
  });

  /** Busca otro club online con la plantilla activa de Soffti Club. */
  private clubOnlineQueue() {
    const net = this.net;
    const club = this.clubUI.club;
    const r = club.onlineTeam(Date.now());
    if (!net?.connected) { this.onlineMenu(); return; }
    if (!r.ok) { this.clubUI.toast(r.error, 'err'); this.clubUI.hub(); return; }
    this.clubOnline = { meta: r.value.meta, half: 4, role: 'host' };
    net.send({ t: 'queue', mode: 'club', team: r.value.team.id, squad: r.value.team });
    const t0 = performance.now();
    const ev = club.evalSquad();
    const html = () => {
      const sec = Math.floor((performance.now() - t0) / 1000);
      return `<div class="panel modal" style="margin:auto;text-align:center">
        <div class="crumb">SOFFTI CLUB · ONLINE</div><h2>Buscando club rival</h2>
        <div style="display:flex;justify-content:center;margin:8px 0">${crestSVG(r.value.team, 72)}</div>
        <div><b>${esc(club.s.identity.name)}</b> · valoración <b class="num">${ev.ovr}</b> · química <b class="num">${ev.chem}</b></div>
        <div class="net-status" style="justify-content:center"><span class="spinner"></span>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</div>
        <div class="muted" style="margin:10px 0">Tu plantilla contra la de otro jugador real. Gana monedas, XP, puntos online y progreso de misiones y evoluciones. Abandonar cuenta como derrota.</div>
        <button class="btn" data-act="cancel">Cancelar</button></div>`;
    };
    const cancel = () => { window.clearInterval(timer); net.send({ t: 'cancel' }); this.clubOnline = null; this.clubUI.hub(); };
    const sc = this.show(html(), { cancel }, cancel);
    const timer = window.setInterval(() => {
      if (this.screen !== sc) { window.clearInterval(timer); return; }
      const st = sc.root.querySelector('.net-status');
      const sec = Math.floor((performance.now() - t0) / 1000);
      if (st) st.innerHTML = `<span class="spinner"></span>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    }, 500);
  }

  /** Contabiliza en el club el resultado online que confirmó el servidor. */
  private creditClubOnline(f: FinalMsg): string {
    const co = this.clubOnline;
    if (!co || f.mode !== 'club') return '';
    this.clubOnline = null;
    if (!f.outcome) return '<div class="muted">Los dos jugadores informaron resultados distintos: el partido no cuenta para tu club.</div>';
    const me = co.role === 'host' ? 0 : 1;
    const o = f.outcome;
    const gf = me === 0 ? o.home : o.away;
    const ga = me === 0 ? o.away : o.home;
    const out = this.clubUI.club.finishMatch(co.meta, { gf, ga, pensWin: gf === ga && o.pens >= 0 ? o.pens === me : undefined, ...(co.stats ?? { passes: 0, passesOk: 0, shots: 0, tackles: 0 }), halfMinutes: co.half, forfeit: o.forfeit === me }, Date.now());
    return out ? this.clubUI.resultHTML(out) : '';
  }

  /** Ceremonia de campeón (una sola vez por copa): se lanza al abrir el menú de la competición ya terminada. */
  private celebrate(key: string, champion: TeamData | null, cup: string, detail: string, user: boolean, logo?: string) {
    if (!champion || ceremonySeen(key)) return;
    markCeremonySeen(key);
    setTimeout(() => playCeremony(document.body, { team: champion, cup, detail, user, logo, audio: this.audio }), 450);
  }
  private trainIdx = 0;

  quickMatchScreen() {
    const q = this.quick;
    const render = () => {
      const home = TEAMS[q.home];
      const away = TEAMS[q.away];
      const awayKit = this.quickAwayKit(home, away);
      const sideLabel = q.side === 0 ? `Local (${home.short})` : q.side === 1 ? `Visitante (${away.short})` : q.side === 2 ? `2 jugadores: J1 ${home.short} · J2 ${away.short}` : q.side === 3 ? `2 jugadores juntos (${home.short}) contra la IA` : 'Espectador (IA vs IA)';
      return `
      <div class="screen-header"><div><div class="crumb">PARTIDO RÁPIDO</div><h2>Configuración del encuentro</h2></div></div>
      <div class="screen-body">
        <div class="versus">
          ${this.teamCard(home, 'LOCAL', 'home', `<div class="kits">${kitSVG(home.home)}</div>`, true)}
          <div class="vs">VS</div>
          ${this.teamCard(away, 'VISITANTE', 'away', `<div class="kits">${kitSVG(awayKit)}</div>`, true)}
        </div>
        <div class="panel" style="margin-top:16px">
          ${this.stepper('Liga', q.league && q.league !== 'all' ? getLeague(q.league).name : 'Todas las ligas', 'lg')}
          ${this.stepper('Estadio', STADIUMS[q.stadium].name + ` · ${({ day: 'Día', sunset: 'Atardecer', night: 'Noche' } as const)[STADIUMS[q.stadium].timeOfDay]}`, 'stad')}
          ${this.stepper('Duración de cada parte', `${HALF_OPTIONS[q.half]} min`, 'half')}
          ${this.stepper('Dificultad', DIFFICULTY_LABELS[DIFFS[q.difficulty]], 'diff')}
          ${this.stepper('Controlas a', sideLabel, 'side')}
          ${q.side === 2 || q.side === 3 ? `<div class="muted" style="margin:-4px 0 8px;font-size:13px">🎮 ${esc(versusDevicesLabel())}</div>` : ''}
          ${this.stepper('Tu formación', q.formation ?? 'Por defecto del equipo', 'form')}
          ${this.stepper('Clima', q.weather === 'random' ? 'Aleatorio' : WEATHER_NAMES[q.weather ?? 'clear'], 'wthr')}
          ${this.stepper('Equipación del visitante', ({ auto: 'Automática (la que más contrasta)', home: 'Titular', away: 'Suplente' } as const)[q.awayKit ?? 'auto'], 'akit')}
        </div>
      </div>
      <div class="screen-footer">
        <button class="btn" data-act="back">Volver</button>
        <button class="btn primary" data-act="play">¡Jugar!</button>
      </div>`;
    };
    const cycle = (key: keyof QuickSetup, n: number, d: number) => { (q as any)[key] = ((q[key] as number) + d + n) % n; s.refresh(render()); };
    // al elegir como local un equipo con estadio propio (Belgrano) se pone su cancha
    const ownGround = () => {
      const i = STADIUMS.findIndex((s) => s.homeTeam === TEAMS[q.home].id);
      if (i >= 0 && q.stadium !== i) { q.stadium = i; s.refresh(render()); }
    };
    // equipos del filtro de liga (índices en TEAMS)
    const pool = (): number[] => {
      const ids = q.league && q.league !== 'all' ? new Set(getLeague(q.league).teamIds()) : null;
      return TEAMS.map((_, i) => i).filter((i) => !ids || ids.has(TEAMS[i].id));
    };
    const step = (key: 'home' | 'away', d: number) => {
      const p = pool();
      let i = p.indexOf(q[key]);
      i = i < 0 ? 0 : (i + d + p.length) % p.length;
      q[key] = p[i];
      if (q.home === q.away && p.length > 1) q[key] = p[(i + d + p.length) % p.length];
      s.refresh(render());
    };
    const search = (key: 'home' | 'away') => this.teamSearchScreen({
      title: key === 'home' ? 'Elige el equipo local' : 'Elige el equipo visitante', crumb: 'PARTIDO RÁPIDO', teams: TEAMS, current: TEAMS[q[key]].id, league: q.league,
      onPick: (id) => { q[key] = TEAMS.findIndex((t) => t.id === id); if (q.home === q.away) q[key === 'home' ? 'away' : 'home'] = pool().find((i) => i !== q[key]) ?? q.away; if (key === 'home') ownGround(); this.quickMatchScreen(); },
      back: () => this.quickMatchScreen(),
    });
    const LG = ['all', ...LEAGUES.filter((l) => l.teamIds().length).map((l) => l.id)];
    const league = (d: number) => {
      q.league = LG[(LG.indexOf(q.league ?? 'all') + d + LG.length) % LG.length];
      const p = pool();
      q.home = p[0];
      q.away = p[1] ?? p[0];
      ownGround();
      s.refresh(render());
    };
    const handlers: Handlers = {
      lgPrev: () => league(-1),
      lgNext: () => league(1),
      homePrev: () => { step('home', -1); ownGround(); },
      homeNext: () => { step('home', 1); ownGround(); },
      homeSearch: () => search('home'),
      awaySearch: () => search('away'),
      awayPrev: () => step('away', -1),
      awayNext: () => step('away', 1),
      stadPrev: () => cycle('stadium', STADIUMS.length, -1),
      stadNext: () => cycle('stadium', STADIUMS.length, 1),
      halfPrev: () => cycle('half', HALF_OPTIONS.length, -1),
      halfNext: () => cycle('half', HALF_OPTIONS.length, 1),
      diffPrev: () => cycle('difficulty', DIFFS.length, -1),
      diffNext: () => cycle('difficulty', DIFFS.length, 1),
      sidePrev: () => { q.side = SIDES[(SIDES.indexOf(q.side) + SIDES.length - 1) % SIDES.length]; s.refresh(render()); },
      sideNext: () => { q.side = SIDES[(SIDES.indexOf(q.side) + 1) % SIDES.length]; s.refresh(render()); },
      formPrev: () => { const i = q.formation ? FORMATION_IDS.indexOf(q.formation) : 0; q.formation = i <= 0 ? null : FORMATION_IDS[i - 1]; s.refresh(render()); },
      wthrPrev: () => { q.weather = WEATHER_CYCLE[(WEATHER_CYCLE.indexOf(q.weather ?? 'clear') + WEATHER_CYCLE.length - 1) % WEATHER_CYCLE.length]; s.refresh(render()); },
      wthrNext: () => { q.weather = WEATHER_CYCLE[(WEATHER_CYCLE.indexOf(q.weather ?? 'clear') + 1) % WEATHER_CYCLE.length]; s.refresh(render()); },
      akitPrev: () => { q.awayKit = ({ auto: 'away', home: 'auto', away: 'home' } as const)[q.awayKit ?? 'auto']; s.refresh(render()); },
      akitNext: () => { q.awayKit = ({ auto: 'home', home: 'away', away: 'auto' } as const)[q.awayKit ?? 'auto']; s.refresh(render()); },
      formNext: () => { const i = q.formation ? FORMATION_IDS.indexOf(q.formation) : -1; q.formation = FORMATION_IDS[(i + 1) % FORMATION_IDS.length]; s.refresh(render()); },
      back: () => this.mainMenu(),
      play: () => {
        const home = TEAMS[q.home];
        const away = TEAMS[q.away];
        this.settings.halfMinutes = HALF_OPTIONS[q.half];
        this.settings.difficulty = DIFFS[q.difficulty];
        saveSettings(this.settings);
        const cfg: MatchConfig = {
          home, away, homeKit: home.home, awayKit: this.quickAwayKit(home, away), humanTeam: q.side === 2 || q.side === 3 ? 0 : q.side, versus: q.side === 2, coop: q.side === 3,
          weather: q.weather === 'random' ? randomWeather(Math.random()) : q.weather ?? 'clear',
          halfLengthSec: HALF_OPTIONS[q.half] * 60, difficulty: DIFFS[q.difficulty], extraTime: false, penalties: false,
          homeFormation: (q.side === 0 || q.side === 2 || q.side === 3) && q.formation ? q.formation : undefined,
          awayFormation: q.side === 1 && q.formation ? q.formation : undefined,
        };
        this.playMatch(cfg, STADIUMS[q.stadium].id, { mode: 'quick' });
      },
    };
    const s = this.show(render(), handlers, () => this.mainMenu());
  }

  /** Equipación del visitante en el partido rápido según lo elegido. */
  private quickAwayKit(home: TeamData, away: TeamData) {
    const k = this.quick.awayKit ?? 'auto';
    return k === 'home' ? away.home : k === 'away' ? away.away : chooseAwayKit(home, away);
  }

  private stepper(label: string, value: string, key: string) {
    return `<div class="row"><label>${label}</label><div class="stepper">
      <button data-act="${key}Prev" data-nofocus="1">‹</button><span class="val" data-act="${key}Next" data-left="${key}Prev" data-right="${key}Next">${esc(value)}</span><button data-act="${key}Next" data-nofocus="1">›</button></div></div>`;
  }

  // ==================================================================
  // Partido
  // ==================================================================

  /** Competición que se muestra en el marcador: la copa en curso, la liga de ambos equipos o amistoso. */
  private competitionFor(config: MatchConfig, ctx: MatchContext): string {
    if (ctx.mode === 'continental') return Continental.load()?.state.cup ?? 'friendly';
    if (ctx.mode === 'tournament') return 'tournament';
    if (ctx.mode === 'club') return 'club';
    const lh = leagueOfTeam(config.home.id);
    return lh && lh.id === leagueOfTeam(config.away.id)?.id ? lh.id : 'friendly';
  }

  playMatch(config: MatchConfig, stadiumId: string, ctx: MatchContext, online: OnlineLink | null = null) {
    // los clásicos son partidos calientes en cualquier modo
    if (config.heat === undefined && !config.training) {
      const cl = classicName(config.home.id, config.away.id);
      if (cl) config = { ...config, heat: matchHeat(config.home.id, config.away.id), classic: cl };
    }
    if (!config.competition) config = { ...config, competition: this.competitionFor(config, ctx) };
    this.lastMatch = { config, ctx };
    this.lastStadiumId = stadiumId;
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
          const runner = new MatchRunner(this.renderer, config, getStadium(stadiumId), this.settings, this.input, this.audio, this.ui, online);
          this.runner = runner;
          runner.resize(window.innerWidth, window.innerHeight);
          if (this.settings.autoQuality) this.attachAutoQuality(runner);
          // precompilar shaders
          this.renderer.compile(runner.view.scene, runner.view.camera);
          bar.style.width = '100%';
          setTimeout(() => {
            this.screen?.dispose();
            this.screen = null;
            this.setMenuMode(false);
            this.audio.stopMenuMusic();
            runner.onPause = () => this.pauseMenu();
            // online: la pausa tiene un límite de tiempo; al agotarse se cierra el menú y se sigue
            runner.onForceResume = () => {
              this.overlay?.dispose();
              this.overlay = null;
              if (this.screen) {
                this.screen.dispose();
                this.screen = null;
                this.applyLiveSettings();
              }
              runner.resume();
            };
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

  /** Modo foto: el partido queda congelado y la cámara se mueve libre (arrastrar, rueda/pellizco, teclas). */
  private photoMode(target?: { view: MatchView; onExit: () => void }) {
    const r = this.runner;
    if (!target && !r) return;
    const view = target?.view ?? r!.view;
    const onExit = target?.onExit ?? (() => this.pauseMenu());
    view.startPhoto();
    const hudRoot = target ? null : r!.hud.root;
    if (hudRoot) hudRoot.style.visibility = 'hidden';
    const savedInd = view.opts.showIndicators;
    view.opts.showIndicators = false;
    const root = el('div', 'photo-mode', `
      <div class="pm-surface"></div>
      <div class="pm-bar">
        <button class="btn primary" data-act="shot">📷 Capturar</button>
        <button class="btn" data-act="exit">Salir</button>
      </div>
      <div class="pm-hint">${isTouchDevice() ? 'Arrastra para girar · dos dedos: acercar y mover' : 'Arrastra para girar · rueda: acercar · WASD / flechas: mover · Q/E: subir y bajar · F: capturar'}</div>`);
    this.ui.appendChild(root);
    const surface = root.querySelector('.pm-surface') as HTMLElement;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let mid = { x: 0, y: 0 };
    surface.addEventListener('pointerdown', (e) => { surface.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    surface.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (pts.size === 1) {
        view.photoMove(-(cur.x - prev.x) * 0.006, (cur.y - prev.y) * 0.005);
      }
      pts.set(e.pointerId, cur);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinch > 0) view.photoMove(0, 0, pinch / d, -(m.x - mid.x) * 0.05, (m.y - mid.y) * 0.05);
        pinch = d;
        mid = m;
      }
    });
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
    surface.addEventListener('wheel', (e) => { e.preventDefault(); view.photoMove(0, 0, Math.exp(e.deltaY * 0.001)); }, { passive: false });
    const held = new Set<string>();
    const key = (e: KeyboardEvent) => {
      if (e.type === 'keydown') held.add(e.code); else held.delete(e.code);
      if (e.type === 'keydown' && e.code === 'KeyF') shot();
      if (e.type === 'keydown' && e.code === 'Escape') exit();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const k = (c: string, c2: string) => (held.has(c) || held.has(c2) ? 1 : 0);
      const s = 0.35;
      const pr = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
      const pf = k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown');
      const pz = k('KeyQ', 'PageUp') - k('KeyE', 'PageDown');
      if (pr || pf || pz) view.photoMove(0, pz * 0.02, 1, pr * s, pf * s);
    };
    raf = requestAnimationFrame(tick);
    const shot = () => {
      const url = view.capture();
      const a = document.createElement('a');
      a.href = url;
      a.download = `soffti-football-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      root.classList.remove('flash');
      void root.offsetWidth;
      root.classList.add('flash');
      this.audio.uiClick();
    };
    const exit = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('keyup', key, true);
      root.remove();
      view.stopPhoto();
      view.opts.showIndicators = savedInd;
      if (hudRoot) hudRoot.style.visibility = '';
      onExit();
    };
    root.querySelector('[data-act=shot]')!.addEventListener('click', shot);
    root.querySelector('[data-act=exit]')!.addEventListener('click', exit);
  }

  /** Guarda los últimos 8 s del partido en curso como repetición. */
  private saveLastPlay(): boolean {
    const r = this.runner;
    if (!r) return false;
    const m = r.match;
    const frames = lastSeconds(m.replay, 8);
    if (frames.length < 2) return false;
    const end = frames[frames.length - 1];
    const [a, b] = m.teams;
    return saveReplay({
      id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
      date: Date.now(),
      title: `${a.data.short} - ${b.data.short}`,
      clock: m.clockText,
      score: `${a.stats.goals} - ${b.stats.goals}`,
      stadiumId: this.lastStadiumId,
      goalSide: end.ball[0] >= 0 ? 1 : -1,
      home: m.config.home, away: m.config.away, homeKit: m.config.homeKit, awayKit: m.config.awayKit,
      weather: m.weather,
      data: encodeFrames(frames),
    });
  }

  /** Lista de repeticiones guardadas. */
  replaysScreen() {
    this.setMenuMode(true);
    const list = listReplays();
    const date = (t: number) => new Date(t).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const s = this.show(`
      <div class="screen-header"><div><div class="crumb">GALERÍA</div><h2>Repeticiones</h2></div></div>
      <div class="screen-body">
        ${list.length ? `<div class="replay-list">${list.map((r) => `<div class="panel replay-item">
          <div class="ri-teams">${crestSVG(r.home, 34)}<div><b>${esc(r.title)}</b> <span class="muted">${esc(r.score)} · ${esc(r.clock)}</span><small class="muted">${esc(getStadium(r.stadiumId).name)} · ${date(r.date)}</small></div>${crestSVG(r.away, 34)}</div>
          <div class="ri-actions"><button class="btn primary" data-act="watch" data-id="${r.id}">▶ Ver</button><button class="btn" data-act="del" data-id="${r.id}">🗑</button></div>
        </div>`).join('')}</div>` : '<div class="panel muted">Todavía no guardaste ninguna jugada. Durante un partido, pausa y elige <b>💾 Guardar jugada</b> para conservar los últimos 8 segundos (hasta ' + MAX_SAVED_REPLAYS + ').</div>'}
      </div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, {
      watch: (b) => { const r = list.find((x) => x.id === b.dataset.id); if (r) this.watchReplay(r); },
      del: (b) => { deleteReplay(b.dataset.id!); this.replaysScreen(); },
      back: () => this.mainMenu(),
    }, () => this.mainMenu());
    void s;
  }

  private watchReplay(saved: SavedReplay) {
    this.screen?.dispose();
    this.screen = null;
    this.audio.stopMenuMusic();
    let viewer: ReplayViewer;
    try {
      viewer = new ReplayViewer(this.renderer, saved, getStadium(saved.stadiumId), this.settings);
    } catch (e) {
      console.error(e);
      this.replaysScreen();
      return;
    }
    this.setMenuMode(false);
    this.canvas.classList.remove('hidden');
    this.bg.classList.add('hidden');
    viewer.resize(window.innerWidth, window.innerHeight);
    this.replayViewer = viewer;
    viewer.start();
    const controls = () => {
      const s = this.show(`
        <div class="replay-bar">
          <div class="rb-title">${crestSVG(saved.home, 26)} <b>${esc(saved.title)}</b> <span class="muted">${esc(saved.score)} · ${esc(saved.clock)}</span></div>
          <div class="rb-btns">
            <button class="btn" data-act="toggle">${viewer.paused ? '▶' : '❚❚'}</button>
            <button class="btn" data-act="restart">⏮</button>
            <button class="btn" data-act="speed">${viewer.speed === 1 ? '1x' : viewer.speed < 1 ? '½x' : '2x'}</button>
            <button class="btn" data-act="photo">📷</button>
            <button class="btn" data-act="back">Salir</button>
          </div>
        </div>`, {
        toggle: () => { viewer.paused = !viewer.paused; controls(); },
        restart: () => { viewer.restart(); viewer.paused = false; controls(); },
        speed: () => { viewer.speed = viewer.speed === 1 ? 0.5 : viewer.speed < 1 ? 2 : 1; controls(); },
        photo: () => {
          viewer.paused = true;
          this.screen?.dispose();
          this.screen = null;
          this.photoMode({ view: viewer.view, onExit: () => controls() });
        },
        back: () => { viewer.dispose(); this.replayViewer = null; this.replaysScreen(); },
      }, () => { viewer.dispose(); this.replayViewer = null; this.replaysScreen(); }, 'replay-screen');
      void s;
    };
    controls();
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
        ${r.online?.spectator ? '<div class="muted" style="margin:-6px 0 10px">👁 Estás mirando como espectador: el partido sigue.</div>' : ''}
        ${r.online && !r.online.spectator ? `<div class="muted online-pause-note" style="margin:-6px 0 10px">${r.pauseSecondsLeft >= 0 ? `Partido pausado para los dos · se reanuda solo en <b class="ps-left">${r.pauseSecondsLeft}</b> s · te quedan ${r.pausesLeft} pausas` : 'Ya no te quedan pausas: el partido sigue en juego'}</div>` : ''}
        <button class="menu-item" data-act="resume">Reanudar</button>
        ${r.online?.spectator ? '' : r.online ? '<button class="menu-item" data-act="chat">Mensajes rápidos<small>Para tu rival</small></button>' : '<button class="menu-item" data-act="restart">Reiniciar partido</button>'}
        ${r.localTeam >= 0 && !m.config.training && !r.online ? `<button class="menu-item" data-act="tactics">Tácticas<small>${esc(m.teams[r.localTeam as 0 | 1].formation)} · ${MENTALITY_NAMES[m.teams[r.localTeam as 0 | 1].mentality + 2]}</small></button>` : ''}
        ${r.localTeam >= 0 && !m.config.training ? `<button class="menu-item" data-act="subs">Cambios<small>${m.teams[r.localTeam as 0 | 1].subsUsed}/${MAX_SUBS} realizados</small></button>` : ''}
        <button class="menu-item" data-act="stats">Estadísticas</button>
        ${!r.online ? '<button class="menu-item" data-act="photo">📷 Modo foto<small>Cámara libre y captura</small></button>' : ''}
        ${m.replay.length > 30 && !m.config.training ? '<button class="menu-item" data-act="savePlay">💾 Guardar jugada<small>Los últimos 8 segundos</small></button>' : ''}
        <button class="menu-item" data-act="mute">${this.settings.muted ? '🔊 Activar sonido' : '🔇 Silenciar'}<small>Tecla M</small></button>
        <button class="menu-item" data-act="settings">Configuración</button>
        <button class="menu-item" data-act="controls">Controles</button>
        <button class="menu-item" data-act="quit">Abandonar partido${r.online && this.lastMatch?.ctx.mode === 'online' && this.lastMatch.ctx.start.mode === 'rivals' ? '<small>Cuenta como derrota en Division Rivals</small>' : ''}</button>
      </div></div></div>`;
    this.overlay?.dispose();
    this.overlay = new Screen(this.ui, html, {
      resume,
      restart: () => { close(); this.restartMatch(); },
      mute: () => { this.toggleMute(); close(); this.pauseMenu(); },
      subs: () => { close(); this.subsMenu(); },
      tactics: () => { close(); this.tacticsMenu(); },
      photo: () => { close(); this.photoMode(); },
      savePlay: (b) => {
        const ok = this.saveLastPlay();
        b.innerHTML = ok ? '✅ Jugada guardada<small>Menú principal → Repeticiones</small>' : '⚠ No hay espacio para guardarla';
      },
      chat: () => {
        close();
        const items = QUICK_CHAT.map((t, i) => `<button class="menu-item" data-act="say" data-i="${i}">${esc(t)}</button>`).join('');
        const back = () => { close(); this.pauseMenu(); };
        this.overlay = new Screen(this.ui, `<div class="overlay"><div class="panel modal"><h2>Mensajes</h2><div class="menu-list">${items}<button class="menu-item" data-act="back">Volver</button></div></div></div>`, {
          say: (el) => { r.sendChat(QUICK_CHAT[Number(el.dataset.i)]); close(); r.resume(); },
          back,
        }, this.audio);
        this.overlay.onBack = back;
      },
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
    if (r.online) {
      const ov = this.overlay;
      const tick = window.setInterval(() => {
        const el = ov.root.querySelector('.ps-left');
        if (!ov.root.isConnected || !el) { window.clearInterval(tick); return; }
        el.textContent = String(r.pauseSecondsLeft);
      }, 500);
    }
  }

  /** Cambios: elige quién sale (en el campo) y quién entra (suplentes). */
  // ==================================================================
  // Editor de equipos
  // ==================================================================

  /** Lista de equipos propios: crear, editar, exportar, importar y borrar. */
  teamEditorList(msg = '') {
    const list = loadCustomTeams();
    const rows = list.length
      ? list.map((t) => `<div class="row editor-row"><span class="crest-mini">${crestSVG(t, 40)}</span><span><b>${esc(t.name)}</b> <span class="muted">${esc(t.short)} · ${t.formation} · nivel ${teamLevel(t)}</span></span>
          <span><button class="btn" data-act="edit" data-id="${t.id}">Editar</button><button class="btn" data-act="export" data-id="${t.id}">Exportar</button><button class="btn danger" data-act="del" data-id="${t.id}">Borrar</button></span></div>`).join('')
      : '<p class="muted">Todavía no has creado ningún equipo. Crea uno o importa un archivo .json exportado desde el juego.</p>';
    const s = this.show(`
      <div class="screen-header"><div><div class="crumb">EDITOR</div><h2>Mis equipos</h2></div></div>
      <div class="screen-body"><div class="panel">${msg ? `<div class="editor-msg">${esc(msg)}</div>` : ''}${rows}
        <p class="muted" style="margin-top:12px;font-size:13px">Tus equipos aparecen en el partido rápido, el torneo y la carrera (no en el online, porque tu rival no los tiene).</p></div></div>
      <div class="screen-footer">
        <button class="btn" data-act="back">Volver</button>
        <button class="btn" data-act="import">Importar…</button>
        <button class="btn primary" data-act="create">Crear equipo</button>
      </div>`, {
      back: () => this.mainMenu(),
      create: () => this.teamEditor(newCustomTeam(), true),
      edit: (el) => { const t = list.find((x) => x.id === el.dataset.id); if (t) this.teamEditor(structuredClone(t), false); },
      del: (el) => {
        const t = list.find((x) => x.id === el.dataset.id);
        if (t && window.confirm(`¿Borrar ${t.name}?`)) { deleteCustomTeam(t.id); this.teamEditorList(`${t.name} borrado`); }
      },
      export: (el) => {
        const t = list.find((x) => x.id === el.dataset.id);
        if (!t) return;
        const blob = new Blob([exportTeam(t)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${t.name.replace(/[^\w\- ]+/g, '').trim() || 'equipo'}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      },
      import: () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,application/json';
        inp.onchange = () => {
          const f = inp.files?.[0];
          if (!f) return;
          f.text().then((txt) => {
            try { const t = importTeam(txt); this.teamEditorList(`Importado: ${t.name}`); } catch (e) { this.teamEditorList(String((e as Error).message)); }
          });
        };
        inp.click();
      },
    }, () => this.mainMenu());
    void s;
  }

  /** Edición de un equipo propio: nombre, escudo, equipaciones, formación, nivel y nombres de los jugadores. */
  private teamEditor(t: import('../data/types').TeamData, isNew: boolean) {
    const SHAPES = ['shield', 'circle', 'diamond'] as const;
    const SYMBOLS = ['star', 'ball', 'lion', 'wave', 'bolt', 'crown', 'tower', 'eagle'] as const;
    const SYMBOL_NAMES: Record<string, string> = { star: 'Estrella', ball: 'Balón', lion: 'León', wave: 'Ola', bolt: 'Rayo', crown: 'Corona', tower: 'Torre', eagle: 'Águila' };
    const PATTERNS = ['solid', 'gradient', 'stripes', 'hoops', 'sash', 'band', 'halves', 'vee'] as const;
    const PATTERN_NAMES: Record<string, string> = { solid: 'Lisa', gradient: 'Degradado', stripes: 'Rayas', hoops: 'Aros', sash: 'Banda' };
    const POS = { GK: 'POR', DEF: 'DEF', MID: 'MED', FWD: 'DEL' } as const;
    const cyc = <T,>(arr: readonly T[], cur: T, d: number) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
    const color = (label: string, field: string, value: string) => `<label class="color-field"><input type="color" data-field="${field}" value="${value}"> ${label}</label>`;
    const kitPanel = (title: string, k: 'home' | 'away') => `<div class="kit-edit"><div class="crumb">${title}</div><div class="kits">${kitSVG(t[k], 64)}</div>
      ${color('Camiseta', `${k}.shirt`, t[k].shirt)}${color('Detalle', `${k}.shirt2`, t[k].shirt2)}${color('Pantalón', `${k}.shorts`, t[k].shorts)}${color('Medias', `${k}.socks`, t[k].socks)}${color('Dorsal', `${k}.number`, t[k].number)}
      ${this.stepper('Diseño', PATTERN_NAMES[t[k].pattern], `${k}Pat`)}</div>`;
    const html = () => `
      <div class="screen-header"><div><div class="crumb">EDITOR</div><h2>${isNew ? 'Nuevo equipo' : esc(t.name)}</h2></div></div>
      <div class="screen-body"><div class="grid3">
        <div class="panel"><h3>Club</h3>
          <div class="crest-preview">${crestSVG(t, 110)}</div>
          <label class="text-field">Nombre <input type="text" maxlength="24" data-field="name" value="${esc(t.name)}"></label>
          <label class="text-field">Abreviatura <input type="text" maxlength="3" data-field="short" value="${esc(t.short)}"></label>
          <label class="text-field">Ciudad <input type="text" maxlength="24" data-field="city" value="${esc(t.city)}"></label>
          ${this.stepper('Escudo', ({ shield: 'Escudo', circle: 'Círculo', diamond: 'Rombo' } as const)[t.crest.shape], 'shape')}
          ${this.stepper('Símbolo', SYMBOL_NAMES[t.crest.symbol], 'sym')}
          ${color('Color principal', 'crest.primary', t.crest.primary)}${color('Color secundario', 'crest.secondary', t.crest.secondary)}
        </div>
        <div class="panel"><h3>Equipaciones</h3>${kitPanel('TITULAR', 'home')}${kitPanel('SUPLENTE', 'away')}</div>
        <div class="panel"><h3>Plantilla</h3>
          ${this.stepper('Formación', t.formation, 'form')}
          ${this.stepper('Nivel del equipo', String(teamLevel(t)), 'lvl')}
          <div class="squad-edit">${t.players.map((p, i) => `<div class="row"><span class="pos ${p.position}">${POS[p.position]}</span><input type="text" maxlength="22" data-field="player.${i}" value="${esc(p.name)}"><span class="ovr">${playerOverall(p)}</span>${i === 10 ? '' : ''}</div>${i === 10 ? '<div class="crumb" style="margin:6px 0">SUPLENTES</div>' : ''}`).join('')}</div>
        </div>
      </div></div>
      <div class="screen-footer"><button class="btn" data-act="cancel">Cancelar</button><button class="btn primary" data-act="save">Guardar</button></div>`;
    // pasa lo escrito en los campos al modelo
    const sync = () => {
      const autoShort = t.short === shortOf(t.name);
      const oldShort = t.short;
      for (const el of Array.from(sc.root.querySelectorAll<HTMLInputElement>('[data-field]'))) {
        const f = el.dataset.field!;
        const v = el.value;
        if (f === 'name') t.name = v.trim() || t.name;
        else if (f === 'short') t.short = (v.trim() || shortOf(t.name)).toUpperCase().slice(0, 3);
        else if (f === 'city') t.city = v.trim();
        else if (f.startsWith('player.')) { const p = t.players[+f.slice(7)]; if (p && v.trim()) p.name = v.trim(); }
        else if (f.startsWith('crest.')) (t.crest as any)[f.slice(6)] = v;
        else if (f.startsWith('home.') || f.startsWith('away.')) (t[f.slice(0, 4) as 'home' | 'away'] as any)[f.slice(5)] = v;
      }
      // la abreviatura sigue al nombre mientras no se cambie a mano
      const shortField = sc.root.querySelector<HTMLInputElement>('[data-field="short"]');
      if (autoShort && shortField && shortField.value.trim().toUpperCase() === oldShort) t.short = shortOf(t.name);
    };
    const refresh = () => { sync(); sc.refresh(html()); };
    const sc = this.show(html(), {
      shapePrev: () => { sync(); t.crest.shape = cyc(SHAPES, t.crest.shape, -1); sc.refresh(html()); },
      shapeNext: () => { sync(); t.crest.shape = cyc(SHAPES, t.crest.shape, 1); sc.refresh(html()); },
      symPrev: () => { sync(); t.crest.symbol = cyc(SYMBOLS, t.crest.symbol, -1); sc.refresh(html()); },
      symNext: () => { sync(); t.crest.symbol = cyc(SYMBOLS, t.crest.symbol, 1); sc.refresh(html()); },
      homePatPrev: () => { sync(); t.home.pattern = cyc(PATTERNS, t.home.pattern, -1); sc.refresh(html()); },
      homePatNext: () => { sync(); t.home.pattern = cyc(PATTERNS, t.home.pattern, 1); sc.refresh(html()); },
      awayPatPrev: () => { sync(); t.away.pattern = cyc(PATTERNS, t.away.pattern, -1); sc.refresh(html()); },
      awayPatNext: () => { sync(); t.away.pattern = cyc(PATTERNS, t.away.pattern, 1); sc.refresh(html()); },
      formPrev: () => { sync(); t.formation = cyc(FORMATION_IDS, t.formation, -1); sc.refresh(html()); },
      formNext: () => { sync(); t.formation = cyc(FORMATION_IDS, t.formation, 1); sc.refresh(html()); },
      lvlPrev: () => { sync(); setTeamLevel(t, Math.max(50, teamLevel(t) - 2)); sc.refresh(html()); },
      lvlNext: () => { sync(); setTeamLevel(t, Math.min(95, teamLevel(t) + 2)); sc.refresh(html()); },
      cancel: () => this.teamEditorList(),
      save: () => { sync(); saveCustomTeam(t); this.teamEditorList(`${t.name} guardado`); },
    }, () => this.teamEditorList());
    // los colores actualizan la vista previa al soltarlos
    sc.root.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).type === 'color') refresh(); });
  }

  /** Pantalla de logros: desbloqueados y pendientes. */
  achievementsScreen() {
    const u = unlockedSet();
    const done = ACHIEVEMENTS.filter((a) => u[a.id]).length;
    const rows = ACHIEVEMENTS.map((a) => `<div class="ach ${u[a.id] ? 'on' : ''}"><span class="ic">${u[a.id] ? a.icon : '🔒'}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}${u[a.id] ? ` · ${new Date(u[a.id]).toLocaleDateString()}` : ''}</small></div></div>`).join('');
    this.show(`
      <div class="screen-header"><div><div class="crumb">DESAFÍOS</div><h2>Logros · ${done}/${ACHIEVEMENTS.length}</h2></div></div>
      <div class="screen-body"><div class="ach-grid">${rows}</div></div>
      <div class="screen-footer"><button class="btn primary" data-act="back">Volver</button></div>`, { back: () => this.mainMenu() }, () => this.mainMenu());
  }

  /** Tácticas en pleno partido: formación y mentalidad del equipo del usuario. */
  private tacticsMenu() {
    const r = this.runner;
    if (!r || r.localTeam < 0) return;
    const t = r.match.teams[r.localTeam as 0 | 1];
    const close = () => { this.overlay?.dispose(); this.overlay = null; };
    const back = () => { close(); this.pauseMenu(); };
    const html = () => `<div class="overlay"><div class="panel modal">
      <h2>Tácticas</h2>
      <div class="muted" style="margin-bottom:10px">Los cambios se aplican al instante.</div>
      ${this.stepper('Formación', t.formation, 'tf')}
      ${this.stepper('Mentalidad', MENTALITY_NAMES[t.mentality + 2], 'tm')}
      <div class="muted" style="margin:8px 0 12px;font-size:13px">Más ofensiva: la línea sube y más jugadores llegan al área. Más defensiva: el bloque se repliega. (En el mando también con la cruceta ← →.)</div>
      <div class="screen-footer"><button class="btn primary" data-act="back">Volver</button></div>
    </div></div>`;
    const refresh = () => this.overlay?.refresh(html());
    const cycleF = (d: number) => { t.setFormation(FORMATION_IDS[(FORMATION_IDS.indexOf(t.formation) + d + FORMATION_IDS.length) % FORMATION_IDS.length]); refresh(); };
    this.overlay?.dispose();
    this.overlay = new Screen(this.ui, html(), {
      tfPrev: () => cycleF(-1), tfNext: () => cycleF(1),
      tmPrev: () => { t.mentality = Math.max(-2, t.mentality - 1); refresh(); },
      tmNext: () => { t.mentality = Math.min(2, t.mentality + 1); refresh(); },
      back,
    }, this.audio);
    this.overlay.onBack = back;
  }

  private subsMenu() {
    const r = this.runner;
    if (!r || r.localTeam < 0) return;
    const m = r.match;
    const ti = r.localTeam as 0 | 1;
    let selOut: string | null = null;
    let msg = '';
    const close = () => { this.overlay?.dispose(); this.overlay = null; };
    const posLabel = (p: PlayerData) => (p.position === 'GK' ? 'POR' : p.position === 'DEF' ? 'DEF' : p.position === 'MID' ? 'MED' : 'DEL');
    const html = () => {
      const t = m.teams[ti];
      const pending = m.pendingSubs.filter((s) => s.team === ti);
      const left = MAX_SUBS - t.subsUsed - pending.length;
      const onPitch = t.players.map((p) => {
        const pend = pending.find((s) => s.outId === p.id);
        const inName = pend ? t.bench.find((b) => b.id === pend.inId)?.data.name : '';
        const st = Math.round(p.stamina * 100);
        const col = st > 70 ? '#19e68c' : st > 45 ? '#ffcf3f' : '#ff4d5e';
        return `<button class="sub-row ${selOut === p.id ? 'sel' : ''} ${p.sentOff ? 'off' : ''}" data-act="${p.sentOff ? 'noop' : pend ? 'cancel' : 'out'}" data-id="${p.id}">
          <span class="pos ${p.data.position}">${posLabel(p.data)}</span><span class="num">${p.data.number}</span><span class="nm">${esc(p.data.name)}${p.yellowCards ? ' <span class="card-icon" style="background:#ffd400"></span>' : ''}${p.sentOff ? ' <span class="card-icon" style="background:#e0201c"></span>' : ''}${p.goals ? ` ⚽${p.goals > 1 ? '×' + p.goals : ''}` : ''}</span>
          ${pend ? `<span class="pend">⇄ ${esc(inName ?? '')} · cancelar</span>` : `<span class="stam" title="Resistencia"><i style="width:${st}%;background:${col}"></i></span>`}<span class="ovr">${playerOverall(p.data)}</span></button>`;
      }).join('');
      const bench = t.bench.map((p) => {
        const used = pending.some((s) => s.inId === p.id);
        return `<button class="sub-row ${used ? 'used' : ''}" data-act="in" data-id="${p.id}" ${!selOut || used || left <= 0 ? 'disabled' : ''}>
          <span class="pos ${p.data.position}">${posLabel(p.data)}</span><span class="num">${p.data.number}</span><span class="nm">${esc(p.data.name)}</span><span class="ovr">${playerOverall(p.data)}</span></button>`;
      }).join('') || '<div class="muted">Sin suplentes disponibles</div>';
      const gone = t.subbedOff.map((p) => esc(p.data.name)).join(', ');
      return `<div class="overlay"><div class="panel modal subs-modal">
        <h2>Cambios <span class="muted" style="font-size:18px">${t.subsUsed}/${MAX_SUBS}${pending.length ? ` · ${pending.length} pendiente${pending.length > 1 ? 's' : ''}` : ''}</span></h2>
        <div class="muted" style="margin-bottom:10px">${selOut ? 'Ahora elige al suplente que entra.' : 'Elige al jugador que sale.'} Los cambios se hacen en la próxima interrupción del juego.</div>
        ${msg ? `<div class="sub-msg">${esc(msg)}</div>` : ''}
        <div class="subs-grid"><div><h4>En el campo</h4>${onPitch}</div><div><h4>Suplentes</h4>${bench}${gone ? `<div class="muted" style="margin-top:8px;font-size:12px">Ya salieron: ${gone}</div>` : ''}</div></div>
        <div class="screen-footer"><button class="btn primary" data-act="back">Volver</button></div></div></div>`;
    };
    const back = () => { close(); this.pauseMenu(); };
    const screen = new Screen(this.ui, html(), {
      out: (el) => { selOut = el.dataset.id!; msg = ''; screen.refresh(html()); },
      cancel: (el) => { r.cancelSub(el.dataset.id!); msg = ''; screen.refresh(html()); },
      in: (el) => {
        if (!selOut) return;
        const err = r.requestSub(selOut, el.dataset.id!);
        msg = err ?? '';
        if (!err) selOut = null;
        screen.refresh(html());
      },
      noop: () => {},
      back,
    }, this.audio);
    screen.onBack = back;
    // al refrescar la lista no se repite la animación de entrada
    setTimeout(() => screen.root.classList.add('no-anim'), 250);
    this.overlay = screen;
  }

  /** Calidad automática: si los FPS no llegan, baja la resolución y luego las sombras (y lo guarda). */
  private attachAutoQuality(runner: MatchRunner) {
    const aq = new AutoQuality({ resolutionScale: this.settings.resolutionScale, shadows: this.settings.shadows });
    runner.autoQuality = aq;
    runner.onQualityStep = (step) => {
      if (step === 'resolution') {
        this.settings.resolutionScale = aq.resolutionScale;
        this.onResize();
      } else {
        this.settings.shadows = false;
        runner.view.setShadows(false);
      }
      saveSettings(this.settings);
      const t = el('div', 'mute-toast', `⚙ Calidad ajustada para ir más fluido <small>(${step === 'resolution' ? `resolución ${Math.round(aq.resolutionScale * 100)}%` : 'sin sombras'})</small>`);
      this.ui.appendChild(t);
      setTimeout(() => t.remove(), 2200);
    };
  }

  private applyLiveSettings() {
    const r = this.runner;
    if (!r) return;
    r.hud.showRadar = this.settings.showRadar;
    r.hud.popups = this.settings.popups;
    r.view.director.style = this.settings.cameraStyle;
    r.view.director.zoom = this.settings.cameraZoom;
    r.view.opts.showIndicators = this.settings.showIndicators;
    if (r.localTeam >= 0) r.match.autoSubs[r.localTeam as 0 | 1] = this.settings.autoSubs;
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
    if (ctx.mode === 'club') return GENERIC_STADIUMS[hashStr(ctx.meta.id) % GENERIC_STADIUMS.length].id;
    if (ctx.mode === 'online') return GENERIC_STADIUMS[ctx.start.seed % GENERIC_STADIUMS.length].id;
    if (ctx.fixture.venue) return ctx.fixture.venue;
    const home = ctx.fixture.home;
    return stadiumForHome(home, TEAMS.findIndex((t) => t.id === home)).id;
  }

  private leaveMatch() {
    const ctx = this.lastMatch?.ctx;
    const wasRunning = !!this.runner && !this.runner.match.finished;
    if (ctx?.mode === 'club' && wasRunning) this.clubUI.club.finishMatch(ctx.meta, { gf: 0, ga: 3, passes: 0, passesOk: 0, shots: 0, tackles: 0, halfMinutes: this.settings.halfMinutes, forfeit: true }, Date.now());
    this.runner?.dispose();
    this.runner = null;
    if (ctx?.mode === 'online') {
      window.clearInterval(this.onlineWatch);
      if (wasRunning) this.net?.send({ t: 'leave' });
      if (ctx.start.mode === 'club') this.clubUI.hub(); else this.onlineHub();
      return;
    }
    if (ctx?.mode === 'tournament') this.tournamentHub();
    else if (ctx?.mode === 'career') this.careerHub();
    else if (ctx?.mode === 'continental') this.continentalHub();
    else if (ctx?.mode === 'club') this.clubUI.hub();
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

  /** Jugador del partido y valoraciones de los dos equipos. */
  private ratingsHTML(m: MatchRunner['match']) {
    const all = playerRatings(m);
    if (!all.length) return '';
    const mvp = manOfTheMatch(m, all);
    const col = (v: number) => (v >= 8 ? '#19e68c' : v >= 7 ? '#9be86a' : v >= 6 ? '#ffcf3f' : '#ff6b76');
    const list = (ti: 0 | 1) => all.filter((x) => x.team === ti).sort((a, b) => b.rating - a.rating).map((x) => `<div class="rt-row ${mvp && mvp.player === x.player ? 'mvp' : ''}"><span class="rt" style="background:${col(x.rating)}">${x.rating.toFixed(1)}</span><span class="nm">${esc(x.player.data.name)}</span><small>${esc(x.line)}</small></div>`).join('');
    const mt = mvp ? m.teams[mvp.team] : null;
    return `${mvp && mt ? `<div class="mvp-card">${crestSVG(mt.data, 40)}<div><div class="crumb">JUGADOR DEL PARTIDO</div><b>${esc(mvp.player.data.name)}</b><small>${esc(mvp.line || mvp.player.slot.role)}</small></div><span class="rt big" style="background:${col(mvp.rating)}">${mvp.rating.toFixed(1)}</span></div>` : ''}
      <details class="ratings"><summary>Valoraciones de los jugadores</summary><div class="grid2">${[0, 1].map((i) => `<div><div class="crumb">${esc(m.teams[i].data.short)}</div>${list(i as 0 | 1)}</div>`).join('')}</div></details>`;
  }

  private matchFinished(r: MatchResultInfo, ctx: MatchContext) {
    const m = r.match;
    const [h, a] = m.teams;
    // Registrar en el modo correspondiente
    // logros: los del resultado y los de los modos (copa, liga, Division Rivals)
    const newAch: AchievementDef[] = [...(this.runner?.achievements?.unlockedNow ?? [])];
    this.runner?.achievements?.finish(r.winner, !!r.penalties);
    if (this.runner?.achievements) for (const a of this.runner.achievements.unlockedNow) if (!newAch.includes(a)) newAch.push(a);
    const addAch = (id: string) => { const a = unlock(id); if (a) newAch.push(a); };
    // bajas (lesiones, rojas y amarillas acumuladas) para el próximo partido del usuario
    let availabilityMsgs: string[] = [];
    if (ctx.mode === 'tournament' && this.tournament) {
      const userIdx = ctx.fixture.home === this.tournament.state.userTeam ? 0 : 1;
      const d = disciplineOf([...m.teams[userIdx].players, ...m.teams[userIdx].subbedOff]);
      availabilityMsgs = this.tournament.recordUserResult(ctx.fixture, r.home, r.away, r.penalties ?? undefined, d);
      if (this.tournament.state.champion === this.tournament.state.userTeam) addAch('cup');
    } else if (ctx.mode === 'career' && this.career) {
      const userIdx = ctx.fixture.home === this.career.state.userTeam ? 0 : 1;
      const scorers = [...m.teams[userIdx].players, ...m.teams[userIdx].subbedOff].filter((p) => p.goals > 0).flatMap((p) => Array(p.goals).fill(p.id));
      const d = disciplineOf([...m.teams[userIdx].players, ...m.teams[userIdx].subbedOff]);
      availabilityMsgs = this.career.recordUserResult(ctx.fixture, r.home, r.away, scorers, d, r.penalties ?? undefined);
      if (this.career.state.phase === 'done' && this.career.torneoChampion === this.career.state.userTeam) addAch('league');
    }
    if (ctx.mode === 'continental' && this.continental) {
      const userIdx = ctx.fixture.home === this.continental.state.userTeam ? 0 : 1;
      const d = disciplineOf([...m.teams[userIdx].players, ...m.teams[userIdx].subbedOff]);
      availabilityMsgs = this.continental.recordUserResult(ctx.fixture, r.home, r.away, r.penalties ?? undefined, d);
      if (this.continental.state.champion === this.continental.state.userTeam) addAch('cup');
    }
    let clubBlock = '';
    if (ctx.mode === 'club') {
      const st = m.teams[0].stats;
      const out = this.clubUI.club.finishMatch(ctx.meta, { gf: r.home, ga: r.away, pensWin: r.penalties ? r.winner === 0 : undefined, passes: st.passes, passesOk: st.passesCompleted, shots: st.shots, tackles: st.tackles, halfMinutes: this.settings.halfMinutes }, Date.now());
      if (out) clubBlock = this.clubUI.resultHTML(out);
    }
    if (ctx.mode === 'online') {
      window.clearInterval(this.onlineWatch);
      this.net?.send({ t: 'result', home: r.home, away: r.away, pens: r.penalties ? r.winner : -1 });
      if (ctx.start.mode === 'club' && this.clubOnline && m.config.humanTeam >= 0) {
        const st = m.teams[m.config.humanTeam as 0 | 1].stats;
        this.clubOnline.stats = { passes: st.passes, passesOk: st.passesCompleted, shots: st.shots, tackles: st.tackles };
      }
      if (ctx.start.mode === 'rivals' && r.winner === m.config.humanTeam) addAch('rivals');
    }
    this.runner?.dispose();
    this.runner = null;
    this.setMenuMode(true);
    const scorers = (t: typeof h) => t.scorers.map((s) => `⚽ ${esc(s.name)} ${s.minute}'`).join('<br>') || '<span class="muted">—</span>';
    const pens = r.penalties ? `<div class="muted" style="text-align:center">Penales: ${r.penalties[0]} - ${r.penalties[1]}</div>` : '';
    const cont = ctx.mode === 'online' ? (ctx.start.mode === 'club' ? 'Volver al club' : 'Menú online') : ctx.mode === 'tournament' ? 'Volver al torneo' : ctx.mode === 'career' ? 'Volver a la carrera' : ctx.mode === 'continental' ? 'Volver a la copa' : ctx.mode === 'club' ? 'Volver al club' : ctx.mode === 'training' ? 'Entrenamiento' : 'Menú principal';
    this.show(`
      <div class="screen-header"><div><div class="crumb">RESULTADO FINAL</div><h2>${r.winner === -1 ? 'Empate' : `Gana ${esc(m.teams[r.winner].data.name)}`}</h2></div></div>
      <div class="screen-body"><div class="grid2">
        <div class="panel">
          <div class="result-score"><div class="t">${crestSVG(h.data, 96)}${esc(h.data.name)}</div><div class="big">${r.home} - ${r.away}</div><div class="t">${crestSVG(a.data, 96)}${esc(a.data.name)}</div></div>
          ${pens}
          <div class="scorers"><div style="text-align:right">${scorers(h)}</div><div>${scorers(a)}</div></div>
          ${ctx.mode === 'training' ? '' : this.ratingsHTML(m)}
          ${newAch.length ? `<div class="ach-msgs"><div class="crumb">LOGROS DESBLOQUEADOS</div>${newAch.map((a) => `<div>${a.icon} <b>${esc(a.name)}</b> <span class="muted">${esc(a.desc)}</span></div>`).join('')}</div>` : ''}
          ${clubBlock}
          ${availabilityMsgs.length ? `<div class="avail-msgs"><div class="crumb">PARTE MÉDICO Y SANCIONES</div>${availabilityMsgs.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
        </div>
        <div class="panel">${ctx.mode === 'online' && ctx.start.mode !== 'friendly' ? `<div class="rivals-change"><div class="net-status"><span class="spinner"></span>${ctx.start.mode === 'club' ? 'Esperando la confirmación del resultado…' : 'Calculando puntos de Division Rivals…'}</div></div>` : ''}${this.statsHTML(m)}</div>
      </div></div>
      <div class="screen-footer">
        ${ctx.mode === 'quick' ? '<button class="btn" data-act="rematch">Revancha</button>' : ''}
        <button class="btn primary" data-act="cont">${cont}</button>
      </div>`, {
      rematch: () => this.restartMatch(),
      cont: () => this.leaveMatch(),
    }, () => this.leaveMatch());
    if (ctx.mode === 'online') this.showOnlineFinal();
  }


  // ==================================================================
  // Online (gratis: servidor propio en la red local o en un plan gratuito)
  // ==================================================================

  private divisionBadge(p: OnlineProfile | null) {
    if (!p) return '';
    const d = p.division;
    const tier = d.index >= 10 ? 'elite' : d.index >= 7 ? 'gold' : d.index >= 4 ? 'silver' : 'bronze';
    return `<div class="div-card ${tier}">
      <div class="div-badge"><span>${d.index >= 10 ? '★' : 10 - d.index}</span></div>
      <div class="div-info"><b>${esc(d.name)}</b><small>${p.points} puntos de Rivals · ${p.wins}V ${p.draws}E ${p.losses}D</small>
      <div class="div-bar"><i style="width:${Math.round(d.progress * 100)}%"></i></div>
      <small>${d.next ? `${d.toNext} puntos para ${esc(d.next)}` : 'Máxima división'}</small></div></div>`;
  }

  /** Conexión: nombre, servidor y conectar. */
  onlineMenu(status = '', error = '') {
    this.setMenuMode(true);
    if (this.net?.connected) {
      this.onlineHub();
      return;
    }
    if (!this.settings.onlineName) this.settings.onlineName = `Jugador${Math.floor(1000 + Math.random() * 9000)}`;
    const cached = cachedProfile();
    const html = () => `
      <div class="screen-header"><div><div class="crumb">ONLINE</div><h2>Jugar contra otras personas</h2></div></div>
      <div class="screen-body"><div class="grid2">
        <div class="panel">
          <div class="row"><label>Tu nombre</label><input class="text-in" id="on-name" maxlength="16" value="${esc(this.settings.onlineName)}" data-enter="connect"></div>
          <div class="row"><label>Servidor</label><input class="text-in" id="on-server" placeholder="predeterminado (gratis)" value="${esc(this.settings.onlineServer)}" data-enter="connect"></div>
          <div class="muted" style="font-size:12px;margin:8px 0">Vacío = servidor público gratuito. Para jugar en tu Wi-Fi sin Internet abre el servidor en un PC (<code>npm run server</code>) y escribe aquí su IP, por ejemplo <code>192.168.1.20:8080</code>.</div>
          ${status ? `<div class="net-status"><span class="spinner"></span>${esc(status)}</div>` : ''}
          ${error ? `<div class="sub-msg">${esc(error)}</div>` : ''}
        </div>
        <div class="panel">
          <h3 style="margin-top:0">Modos online</h3>
          <div class="muted">🏆 <b>Division Rivals</b>: partidos clasificatorios contra rivales de tu nivel. Gana puntos y sube de la División 10 a Élite.<br><br>🤝 <b>Amistoso</b>: rival al azar.<br><br>🔑 <b>Sala privada</b>: comparte un código con un amigo.</div>
          ${cached ? `<div style="margin-top:12px">${this.divisionBadge(cached)}</div>` : ''}
        </div>
      </div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button><button class="btn primary" data-act="connect" ${status ? 'disabled' : ''}>Conectar</button></div>`;
    const sc = this.show(html(), {
      back: () => this.mainMenu(),
      connect: () => {
        const name = ((sc.root.querySelector('#on-name') as HTMLInputElement)?.value ?? '').trim().slice(0, 16) || this.settings.onlineName;
        const server = ((sc.root.querySelector('#on-server') as HTMLInputElement)?.value ?? '').trim();
        this.settings.onlineName = name;
        this.settings.onlineServer = server;
        saveSettings(this.settings);
        this.connectOnline();
      },
    }, () => this.mainMenu());
  }

  private async connectOnline(after?: () => void) {
    const net = this.net ?? new NetClient();
    this.net = net;
    this.onlineMenu('Conectando…');
    try {
      await net.connect(serverCandidates(this.settings.onlineServer), this.settings.onlineName, (t) => {
        const st = this.screen?.root.querySelector('.net-status');
        if (st) st.innerHTML = `<span class="spinner"></span>${esc(t)}`;
      });
    } catch (err) {
      this.onlineMenu('', `${(err as Error).message}. Revisa la dirección del servidor o tu conexión. Si usas el servidor público gratuito, puede estar apagado: cualquiera puede abrir uno gratis (ver README → Online).`);
      return;
    }
    this.netOff?.();
    this.netOff = net.on((m) => this.onNetMessage(m));
    net.onClose = () => {
      if (this.runner && this.lastMatch?.ctx.mode === 'online' && !this.runner.match.finished) {
        this.runner.dispose();
        this.runner = null;
        this.overlay?.dispose();
        this.overlay = null;
        this.onlineNotice('Conexión perdida', 'Se perdió la conexión con el servidor online.');
      } else if (!this.runner) {
        this.onlineMenu('', 'Se perdió la conexión con el servidor.');
      }
    };
    if (after) after(); else this.onlineHub();
  }

  private onlineTeamStepper() {
    const t = TEAMS[this.onlineTeam];
    return `<div class="row"><label>Tu equipo</label><div class="stepper"><button data-act="teamPrev" data-nofocus="1">‹</button><span class="val" data-act="teamNext" data-left="teamPrev" data-right="teamNext">${crestSVG(t, 22)} ${esc(t.name)} · ${t.rating}</span><button data-act="teamNext" data-nofocus="1">›</button></div></div>`;
  }

  /** Menú online (conectado). */
  onlineHub() {
    const net = this.net;
    if (!net?.connected) {
      this.onlineMenu();
      return;
    }
    this.setMenuMode(true);
    net.send({ t: 'profile' });
    const html = () => `
      <div class="screen-header"><div><div class="crumb">ONLINE · ${net.online} conectados · ${Math.round(net.rtt) || '—'} ms</div><h2>Hola, ${esc(net.profile?.name ?? '')}</h2></div></div>
      <div class="screen-body"><div class="grid2">
        <div class="panel">
          <div class="menu-list">
            <button class="menu-item" data-act="rivals">Division Rivals<small>Partido clasificatorio · gana puntos y sube de división</small></button>
            <button class="menu-item" data-act="friendly">Amistoso rápido<small>Rival al azar, sin puntos</small></button>
            <button class="menu-item" data-act="create">Crear sala privada<small>Juega con un amigo: comparte el código</small></button>
            <button class="menu-item" data-act="join">Unirse con código</button>
            <button class="menu-item" data-act="board">Clasificación<small>Los mejores de Division Rivals</small></button>
          </div>
          ${this.onlineTeamStepper()}
        </div>
        <div class="panel">${this.divisionBadge(net.profile)}
          <div class="div-ladder">${DIVISIONS.map((d, i) => `<span class="${net.profile && net.profile.division.index === i ? 'cur' : ''} ${net.profile && net.profile.division.index > i ? 'done' : ''}">${i >= 10 ? 'É' : 10 - i}</span>`).join('')}</div>
          <div class="muted" style="font-size:12px;margin-top:10px">Victoria +30 (+5 por gol de diferencia) · Empate +10 · Derrota −12 · Abandonar −20. Ganar a un rival de división más alta da puntos extra.</div>
        </div>
      </div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button><button class="btn danger" data-act="disconnect">Desconectar</button></div>`;
    const sc = this.show(html(), {
      rivals: () => this.onlineQueue('rivals'),
      friendly: () => this.onlineQueue('friendly'),
      create: () => this.onlineRoom(),
      join: () => this.onlineJoin(),
      board: () => this.onlineBoard(),
      teamPrev: () => { this.onlineTeam = (this.onlineTeam + BUILTIN_TEAM_COUNT - 1) % BUILTIN_TEAM_COUNT; sc.refresh(html()); },
      teamNext: () => { this.onlineTeam = (this.onlineTeam + 1) % BUILTIN_TEAM_COUNT; sc.refresh(html()); },
      back: () => this.mainMenu(),
      disconnect: () => { this.netOff?.(); this.netOff = null; net.close(); this.net = null; this.mainMenu(); },
    }, () => this.mainMenu());
    this.onlineRefresh = () => { if (this.screen === sc) sc.refresh(html()); };
  }

  private onlineRefresh: (() => void) | null = null;

  /** Búsqueda de rival. */
  private onlineQueue(mode: 'rivals' | 'friendly') {
    const net = this.net!;
    const t0 = performance.now();
    net.send({ t: 'queue', mode, team: TEAMS[this.onlineTeam].id });
    const label = mode === 'rivals' ? 'DIVISION RIVALS' : 'AMISTOSO';
    const html = () => {
      const sec = Math.floor((performance.now() - t0) / 1000);
      return `<div class="panel modal" style="margin:auto;text-align:center">
        <div class="crumb">${label}</div><h2>Buscando rival</h2>
        <div class="net-status" style="justify-content:center"><span class="spinner"></span>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</div>
        <div class="muted" style="margin:10px 0">${mode === 'rivals' ? 'Se busca a alguien de tu división; cuanto más esperas, más se amplía la búsqueda.' : 'Se empareja con el primero que esté buscando.'} Invita a un amigo a buscar a la vez, o crea una sala privada.</div>
        ${this.onlineTeamStepper()}
        <button class="btn" data-act="cancel">Cancelar</button></div>`;
    };
    const cancel = () => { window.clearInterval(timer); net.send({ t: 'cancel' }); this.onlineHub(); };
    const sc = this.show(html(), {
      cancel,
      teamPrev: () => { this.onlineTeam = (this.onlineTeam + BUILTIN_TEAM_COUNT - 1) % BUILTIN_TEAM_COUNT; net.send({ t: 'queue', mode, team: TEAMS[this.onlineTeam].id }); sc.refresh(html()); },
      teamNext: () => { this.onlineTeam = (this.onlineTeam + 1) % BUILTIN_TEAM_COUNT; net.send({ t: 'queue', mode, team: TEAMS[this.onlineTeam].id }); sc.refresh(html()); },
    }, cancel);
    const timer = window.setInterval(() => {
      if (this.screen !== sc) { window.clearInterval(timer); return; }
      const st = sc.root.querySelector('.net-status');
      const sec = Math.floor((performance.now() - t0) / 1000);
      if (st) st.innerHTML = `<span class="spinner"></span>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    }, 500);
  }

  private onlineRoom() {
    const net = this.net!;
    net.send({ t: 'create', team: TEAMS[this.onlineTeam].id, half: this.settings.halfMinutes });
    const cancel = () => { net.send({ t: 'cancel' }); this.onlineHub(); };
    this.show(`<div class="panel modal" style="margin:auto;text-align:center">
      <div class="crumb">SALA PRIVADA</div><h2>Comparte este código</h2>
      <div class="room-code">·····</div>
      <div class="net-status" style="justify-content:center"><span class="spinner"></span>Esperando a tu amigo…</div>
      <div class="muted" style="margin:10px 0">Tu amigo entra en ONLINE → Unirse con código. Partes de ${this.settings.halfMinutes} min.</div>
      <button class="btn" data-act="cancel">Cancelar</button></div>`, { cancel }, cancel);
  }

  private onlineJoin(error = '') {
    const net = this.net!;
    const sc = this.show(`<div class="panel modal" style="margin:auto;text-align:center">
      <div class="crumb">SALA PRIVADA</div><h2>Código de la sala</h2>
      <input class="text-in code-in" id="on-code" maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="ABCDE" data-enter="go">
      ${error ? `<div class="sub-msg" style="margin-top:10px">${esc(error)}</div>` : ''}
      <div style="margin-top:12px">${this.onlineTeamStepper()}</div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button><button class="btn" data-act="watch">👁 Mirar</button><button class="btn primary" data-act="go">Unirse</button></div>
      <div class="muted" style="font-size:12px;margin-top:8px">Con <b>Mirar</b> ves como espectador un partido de sala privada que ya empezó.</div></div>`, {
      go: () => {
        const code = ((sc.root.querySelector('#on-code') as HTMLInputElement)?.value ?? '').trim().toUpperCase();
        if (code.length < 4) return;
        net.send({ t: 'join', code, team: TEAMS[this.onlineTeam].id });
      },
      watch: () => {
        const code = ((sc.root.querySelector('#on-code') as HTMLInputElement)?.value ?? '').trim().toUpperCase();
        if (code.length < 4) return;
        net.send({ t: 'watch', code });
      },
      back: () => this.onlineHub(),
      teamPrev: () => { this.onlineTeam = (this.onlineTeam + BUILTIN_TEAM_COUNT - 1) % BUILTIN_TEAM_COUNT; this.onlineJoin(error); },
      teamNext: () => { this.onlineTeam = (this.onlineTeam + 1) % BUILTIN_TEAM_COUNT; this.onlineJoin(error); },
    }, () => this.onlineHub());
    setTimeout(() => (sc.root.querySelector('#on-code') as HTMLInputElement | null)?.focus(), 50);
  }

  private onlineBoard(rows: { name: string; points: number; wins: number; division: string }[] | null = null) {
    if (!rows) this.net?.send({ t: 'leaderboard' });
    const body = rows === null ? '<div class="net-status"><span class="spinner"></span>Cargando…</div>'
      : rows.length ? `<table class="table board"><tr><th>#</th><th>Jugador</th><th>División</th><th>Puntos</th><th>V</th></tr>${rows.map((r, i) => `<tr class="${r.name === this.net?.profile?.name ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.division)}</td><td>${r.points}</td><td>${r.wins}</td></tr>`).join('')}</table>`
        : '<div class="muted">Todavía no hay partidos de Division Rivals en este servidor.</div>';
    this.show(`<div class="screen-header"><div><div class="crumb">DIVISION RIVALS</div><h2>Clasificación</h2></div></div>
      <div class="screen-body"><div class="panel">${body}</div></div>
      <div class="screen-footer"><button class="btn primary" data-act="back">Volver</button></div>`, { back: () => this.onlineHub() }, () => this.onlineHub(), 'online-board');
  }

  private onlineNotice(title: string, text: string, rivalsBox = false) {
    this.setMenuMode(true);
    this.show(`<div class="panel modal" style="margin:auto;text-align:center"><h2>${esc(title)}</h2><p>${esc(text)}</p>
      ${rivalsBox ? '<div class="rivals-change"></div>' : ''}
      <button class="btn primary" data-act="ok">Continuar</button></div>`, { ok: () => this.onlineBack() }, () => this.onlineBack());
    if (rivalsBox) this.showOnlineFinal();
  }

  private onNetMessage(m: ServerMsg) {
    const runner = this.runner;
    switch (m.t) {
      case 'relay':
        if (runner?.online && m.d) runner.receive(m.d);
        break;
      case 'room': {
        const code = this.screen?.root.querySelector('.room-code');
        if (code) code.textContent = m.code;
        break;
      }
      case 'error':
        if (this.screen?.root.querySelector('#on-code')) this.onlineJoin(m.text);
        else this.onlineNotice('Online', m.text);
        break;
      case 'match':
        this.startOnlineMatch(m as unknown as MatchStart);
        break;
      case 'leaderboard':
        if (this.screen?.root.classList.contains('online-board')) this.onlineBoard(m.rows ?? []);
        break;
      case 'profile':
        if (!this.runner) this.onlineRefresh?.();
        break;
      case 'opponentLeft':
        if (runner?.online && !runner.match.finished) {
          runner.dispose();
          this.runner = null;
          this.overlay?.dispose();
          this.overlay = null;
          window.clearInterval(this.onlineWatch);
          this.onlineNotice('Tu rival se fue', 'Tu rival abandonó el partido: ganas 3-0.', true);
        }
        break;
      case 'spectators': {
        const n = Number((m as unknown as { n: number }).n) || 0;
        if (runner?.online) {
          const t = el('div', 'mute-toast', n > 0 ? `👁 ${n} ${n === 1 ? 'espectador' : 'espectadores'} mirando` : '👁 Sin espectadores');
          this.ui.appendChild(t);
          setTimeout(() => t.remove(), 2000);
        }
        break;
      }
      case 'watchEnd':
        if (runner?.online?.spectator && !runner.match.finished) {
          runner.dispose();
          this.runner = null;
          this.overlay?.dispose();
          this.overlay = null;
          window.clearInterval(this.onlineWatch);
          this.onlineNotice('Fin de la transmisión', (m as unknown as { forfeit: boolean }).forfeit ? 'Uno de los jugadores abandonó el partido.' : 'El partido terminó.');
        }
        break;
      case 'final': {
        const f = m as unknown as FinalMsg;
        this.onlineFinal = f;
        if (f.mode === 'club') this.clubFinalHTML = this.creditClubOnline(f);
        this.showOnlineFinal();
        break;
      }
    }
  }

  /** Muestra los puntos de Rivals ganados/perdidos en la pantalla actual (resultado o aviso). */
  private showOnlineFinal() {
    const f = this.onlineFinal;
    const box = this.screen?.root.querySelector('.rivals-change') as HTMLElement | null;
    if (!f || !box) return;
    if (f.mode === 'club') {
      box.innerHTML = this.clubFinalHTML;
      return;
    }
    if (f.mode !== 'rivals') {
      box.innerHTML = '';
      return;
    }
    if (f.disputed || !f.change) {
      box.innerHTML = '<div class="muted">Los dos jugadores informaron resultados distintos: el partido no cuenta.</div>';
      return;
    }
    const d = f.change.delta;
    box.innerHTML = `<div class="rv-delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d} puntos de Rivals</div>${this.divisionBadge(f.profile)}`;
  }

  private clubFinalHTML = '';
  /** Tras un aviso online: al club si era un partido de Soffti Club, si no al menú online. */
  private onlineBack() {
    const ctx = this.lastMatch?.ctx;
    if (ctx?.mode === 'online' && ctx.start.mode === 'club') this.clubUI.hub(); else this.onlineHub();
  }

  private startOnlineMatch(st: MatchStart) {
    const net = this.net;
    if (!net) return;
    this.overlay?.dispose();
    this.overlay = null;
    this.onlineFinal = null;
    this.clubFinalHTML = '';
    if (st.mode === 'club' && this.clubOnline && st.role !== 'spectator') { this.clubOnline.role = st.role; this.clubOnline.half = st.half; }
    const teamOf = (p: OnlineProfile) => (st.mode === 'club' ? sanitizeOnlineTeam(p.squad, p === st.home ? 'h-' : 'a-') : null) ?? TEAMS.find((t) => t.id === p.team) ?? TEAMS[0];
    const home = teamOf(st.home);
    const away = teamOf(st.away);
    const cfg: MatchConfig = {
      home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away),
      humanTeam: st.role === 'host' ? 0 : st.role === 'guest' ? 1 : -1,
      halfLengthSec: Math.max(2, Math.min(10, st.half)) * 60,
      difficulty: 'pro', extraTime: false, penalties: false, seed: st.seed, var: false,
      // el mismo clima para los dos (sale de la semilla del partido)
      weather: randomWeather(((st.seed * 7919) % 1000) / 1000),
    };
    const ctx: MatchContext = { mode: 'online', start: st };
    const opp = st.role === 'host' ? st.away : st.home;
    const link: OnlineLink = st.role === 'spectator'
      ? { role: 'guest', spectator: true, send: () => {}, opponentName: `${st.home.name} - ${st.away.name}` }
      : { role: st.role, send: (d) => net.relay(d as { k?: string }), opponentName: opp.name, direct: () => net.p2pOpen, latency: () => net.latency };
    this.playMatch(cfg, this.stadiumForCtx(ctx), ctx, link);
    // el invitado comprueba que siguen llegando datos del anfitrión
    window.clearInterval(this.onlineWatch);
    let lastTick = performance.now();
    this.onlineWatch = window.setInterval(() => {
      const r = this.runner;
      const now = performance.now();
      // si la propia página estuvo congelada (cargando la escena, en segundo plano…), los datos que llegaron
      // mientras tanto aún no se procesaron: no cuenta como silencio del rival
      const frozen = now - lastTick > 2500;
      lastTick = now;
      if (r?.guestSync && frozen) r.guestSync.lastRecv = Math.max(r.guestSync.lastRecv, now);
      if (!r || !r.guestSync || r.inIntro || r.match.finished || r.halted) return;
      if (r.guestSync.received > 0 && performance.now() - r.guestSync.lastRecv > 12000) {
        window.clearInterval(this.onlineWatch);
        r.dispose();
        this.runner = null;
        this.overlay?.dispose();
        this.overlay = null;
        net.send({ t: 'leave' });
        this.onlineNotice('Conexión perdida', 'No llegan datos de tu rival desde hace más de 12 segundos.');
      }
    }, 1000);
  }

  // ==================================================================
  // Torneo
  // ==================================================================

  /** Elegir un equipo (opcionalmente solo entre los ids dados, p. ej. los de una liga). */
  private pickTeamScreen(title: string, crumb: string, onPick: (id: string) => void, back: () => void, only?: string[], startIdx = 0) {
    const list = only ? TEAMS.filter((t) => only.includes(t.id)) : TEAMS;
    let idx = startIdx;
    const render = () => `
      <div class="screen-header"><div><div class="crumb">${crumb}</div><h2>${title}</h2></div></div>
      <div class="screen-body" style="display:flex;justify-content:center;align-items:center">
        ${this.teamCard(list[idx], 'TU EQUIPO', 'team', `<div class="kits">${kitSVG(list[idx].home)}${kitSVG(list[idx].away)}</div>`, true)}
      </div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button><button class="btn primary" data-act="ok">Confirmar</button></div>`;
    const s = this.show(render(), {
      teamPrev: () => { idx = (idx + list.length - 1) % list.length; s.refresh(render()); },
      teamNext: () => { idx = (idx + 1) % list.length; s.refresh(render()); },
      teamSearch: () => this.teamSearchScreen({
        title, crumb, teams: list, current: list[idx].id,
        onPick: (id) => { idx = Math.max(0, list.findIndex((t) => t.id === id)); this.pickTeamScreen(title, crumb, onPick, back, only, idx); },
        back: () => this.pickTeamScreen(title, crumb, onPick, back, only, idx),
      }),
      ok: () => onPick(list[idx].id),
      back,
    }, back);
  }

  /** Elegir la liga del modo carrera (con el logo de cada competencia). */
  private leaguePickScreen(onPick: (leagueId: string) => void, back: () => void) {
    const ls = LEAGUES.filter((l) => l.teamIds().length);
    const item = (l: (typeof LEAGUES)[number]) => `<button class="menu-item" data-act="lg-${l.id}" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:12px;text-align:left;padding:10px 14px">${l.logo ? `<img src="${l.logo}" alt="" style="height:38px;width:38px;object-fit:contain;background:#fff;border-radius:8px;padding:3px;box-sizing:border-box;flex:none">` : '<span style="width:38px;flex:none"></span>'}<span style="font-size:15px">${esc(l.name)}<small>${esc(l.country)} · ${l.teamIds().length} equipos</small></span></button>`;
    const handlers: Handlers = { back };
    for (const l of ls) handlers[`lg-${l.id}`] = () => onPick(l.id);
    this.show(`
      <div class="screen-header"><div><div class="crumb">MODO CARRERA</div><h2>Elige la liga</h2></div></div>
      <div class="screen-body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:860px;margin:0 auto">${ls.map(item).join('')}</div></div>
      <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, handlers, back);
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
    if (champion) this.celebrate(`tournament:${st.seed}`, champion, 'Copa Élite', '', champion.id === st.userTeam);
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
          extraTime: next.knockout, penalties: next.knockout, weather: randomWeather(Math.random()),
          homeLineup: side === 0 ? st.availability && this.tournament?.matchLineup() : undefined,
          awayLineup: side === 1 ? st.availability && this.tournament?.matchLineup() : undefined,
        }, this.stadiumForCtx({ mode: 'tournament', fixture: next }), { mode: 'tournament', fixture: next });
      },
    }, () => this.mainMenu());
  }

  // ==================================================================
  // Carrera
  // ==================================================================

  private careerView: 'resumen' | 'A' | 'B' | 'anual' | 'playoffs' = 'resumen';

  careerHub() {
    this.setMenuMode(true);
    this.career = this.career ?? Career.load();
    const c = this.career;
    if (!c) {
      this.leaguePickScreen((lg) => {
        const def = getLeague(lg);
        this.pickTeamScreen(`Elige el club que dirigirás en ${def.name}`, 'MODO CARRERA', (id) => { this.career = Career.create(id, undefined, lg); this.careerView = 'resumen'; this.careerHub(); }, () => this.careerHub(), def.teamIds());
      }, () => this.mainMenu());
      return;
    }
    const st = c.state;
    const lookup = (id: string) => c.team(id);
    const next = c.nextUserFixture();
    const fmt = c.fmt;
    const VIEWS = (['resumen', ...(fmt.zones === 2 ? ['A', 'B'] : ['A']), ...(fmt.annual ? ['anual'] : []), ...(fmt.playoffs ? ['playoffs'] : [])] as ('resumen' | 'A' | 'B' | 'anual' | 'playoffs')[]);
    const VIEW_NAMES = { resumen: 'Resumen', A: fmt.zones === 2 ? 'Zona A' : 'Tabla', B: 'Zona B', anual: 'Tabla anual', playoffs: 'Playoffs' } as const;
    const view = VIEWS.includes(this.careerView) ? this.careerView : 'resumen';
    const zonePos = c.standings().findIndex((r) => r.team === st.userTeam) + 1;
    const zoneNote = fmt.playoffs ? `<div class="muted" style="font-size:12px;margin-top:6px">Los ${fmt.playoffs} primeros${fmt.zones === 2 ? ' de cada zona' : ''} pasan a los playoffs.</div>` : '';
    const zoneTitle = (z: string) => (fmt.zones === 2 ? `Zona ${z}` : 'Tabla de posiciones');
    const fxLine = (f: Fixture) => {
      const cl = c.classicOf(f);
      return `${cl ? `<div class="crumb" style="color:var(--danger)">🔥 ${esc(cl.toUpperCase())}</div>` : ''}${this.fixtureHTML(f, st.userTeam, lookup)}`;
    };
    const phaseName = st.phase === 'regular' ? 'Fase regular' : st.phase === 'playoffs' ? 'Playoffs' : 'Torneo terminado';
    let body = '';
    if (view === 'A' || view === 'B') {
      body = `<div class="panel"><h3>${zoneTitle(view)}</h3>${this.tableHTML(c.zoneStandings(view), st.userTeam, lookup)}${zoneNote}</div>`;
    } else if (view === 'anual') {
      body = `<div class="panel"><h3>Tabla anual ${st.season}</h3>${this.tableHTML(c.annualStandings(), st.userTeam, lookup)}<div class="muted" style="font-size:12px;margin-top:6px">Suma los partidos de fase regular de todos los torneos de la temporada (${c.allTeams.length} equipos).</div></div>`;
    } else if (view === 'playoffs') {
      const rounds = [...new Set(c.playoffFx.map((f) => f.round))];
      body = rounds.length
        ? rounds.map((r) => {
          const fx = c.playoffFx.filter((f) => f.round === r);
          return `<div class="panel" style="margin-bottom:12px"><h3>${esc(fx[0].stage)}</h3>${fx.map((f) => fxLine(f)).join('')}${fx[0].venue ? `<div class="muted" style="font-size:12px">Sede neutral: ${esc(getStadium(fx[0].venue).name)}</div>` : ''}</div>`;
        }).join('')
        : `<div class="panel"><p class="muted">Los playoffs empiezan al terminar las ${c.totalRounds} fechas: pasan los ${fmt.playoffs} primeros${fmt.zones === 2 ? ' de cada zona' : ''}${fmt.neutralFinal ? ' y la final se juega en cancha neutral' : ''}.</p></div>`;
    } else {
      const roundFx = next ? st.fixtures.filter((f) => f.round === next.round && f !== next) : [];
      const recent = st.fixtures.filter((f) => f.played).slice(-8).reverse();
      const history = st.history.map((h) => `<div class="row"><span>Temporada ${h.season}</span><span>${h.champions.map((ch, i) => `${esc(fmt.torneos[i] ?? 'Torneo')}: ${esc(lookup(ch).short)}`).join(' · ')}${fmt.annual ? ` · Anual: ${esc(lookup(h.champion).short)}` : ''} · Tu puesto: ${h.userPosition}.º</span></div>`).join('');
      const champ = c.torneoChampion;
      if (champ) this.celebrate(`career:${st.seed}:${st.season}:${st.torneoIdx}`, lookup(champ), `${c.torneoName} · ${c.league.name}`, `Temporada ${st.season}`, champ === st.userTeam, c.league.logo);
      body = `<div class="grid2"><div>
          <div class="panel"><h3>${zoneTitle(c.userZone)}</h3>${this.tableHTML(c.standings(), st.userTeam, lookup)}${zoneNote}</div>
          ${st.news?.length ? `<div class="panel" style="margin-top:16px"><h3>Noticias</h3>${st.news.slice(0, 6).map((n) => `<div class="muted" style="font-size:13px;margin-bottom:4px">${esc(n)}</div>`).join('')}</div>` : ''}
        </div><div>
          ${champ ? `<div class="panel" style="margin-bottom:16px"><b>${c.torneoName}: campeón ${esc(lookup(champ).name)}</b><br><span class="muted">${esc(c.userPlayoffResult())}</span></div>` : ''}
          ${next ? `<div class="panel" style="margin-bottom:16px"><div class="crumb">${esc(next.stage.toUpperCase())}${next.venue ? ' · CANCHA NEUTRAL' : ''}</div>${fxLine(next)}${next.venue ? `<div class="muted" style="font-size:12px">${esc(getStadium(next.venue).name)}</div>` : ''}${roundFx.length ? '<div class="muted" style="margin-top:8px">Resto de la fecha:</div>' + roundFx.map((f) => this.fixtureHTML(f, st.userTeam, lookup)).join('') : ''}</div>`
            : st.phase !== 'done' ? `<div class="panel" style="margin-bottom:16px"><b>${c.userPlayoffResult()}</b><div class="muted">Simula el resto del torneo para seguir adelante.</div></div>` : ''}
          <div class="panel"><h3>Últimos resultados</h3>${recent.map((f) => `<div class="muted" style="font-size:11px">${esc(f.stage)}</div>${this.fixtureHTML(f, st.userTeam, lookup)}`).join('') || '<span class="muted">Aún no se jugó ningún partido.</span>'}</div>
          ${history ? `<div class="panel" style="margin-top:16px"><h3>Historial</h3>${history}</div>` : ''}
        </div></div>`;
    }
    const lastBtn = st.seasonOver ? '<button class="btn primary" data-act="nextSeason">Nueva temporada</button>'
      : st.phase === 'done' ? `<button class="btn primary" data-act="clausura">Empezar el ${esc(fmt.torneos[st.torneoIdx + 1] ?? 'siguiente torneo')}</button>`
      : next ? '<button class="btn primary" data-act="play">Jugar partido</button>' : '<button class="btn primary" data-act="simRest">Simular el resto</button>';
    this.show(`
      <div class="screen-header"><div><div class="crumb">${esc(c.league.name.toUpperCase())} · TEMPORADA ${st.season} · ${esc(c.user.name)} · PRESUPUESTO ${(st.budget ?? 0).toFixed(1)} M${st.phase === 'regular' ? ` · ${zonePos}.º EN LA ZONA ${c.userZone}` : ''}</div><h2 style="display:flex;align-items:center;gap:12px">${c.league.logo ? `<img src="${c.league.logo}" alt="" style="height:46px;width:46px;object-fit:contain;background:#fff;border-radius:8px;padding:3px;box-sizing:border-box">` : ''}<span>${c.torneoName} · ${phaseName}</span></h2></div></div>
      <div class="screen-body">
        ${this.stepper('Ver', VIEW_NAMES[view], 'view')}
        ${body}
      </div>
      <div class="screen-footer">
        <button class="btn" data-act="back">Menú</button>
        <button class="btn danger" data-act="abandon">Abandonar carrera</button>
        <button class="btn" data-act="squad">Plantilla y alineación</button>
        <button class="btn" data-act="market">Mercado</button>
        ${next && !st.seasonOver && st.phase !== 'done' ? '<button class="btn" data-act="simRound">Simular fecha</button>' : ''}
        ${lastBtn}
      </div>`, {
      back: () => this.mainMenu(),
      abandon: () => { Career.clear(); this.career = null; this.careerHub(); },
      squad: () => this.squadScreen(),
      market: () => this.marketScreen(),
      viewPrev: () => { this.careerView = VIEWS[(VIEWS.indexOf(view) + VIEWS.length - 1) % VIEWS.length]; this.careerHub(); },
      viewNext: () => { this.careerView = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]; this.careerHub(); },
      simRound: () => {
        c.simulateUserFixture();
        this.careerHub();
      },
      simRest: () => { c.simulateUntilUserOrEnd(); this.careerHub(); },
      clausura: () => { c.startNextTorneo(); this.careerView = 'resumen'; this.careerHub(); },
      nextSeason: () => {
        const res = c.startNextSeason();
        const ch = res.changes.slice(0, 12).map((x) => `<div class="row"><span>${esc(x.name)}</span><span style="color:${x.delta > 0 ? 'var(--accent)' : 'var(--danger)'}">${x.delta > 0 ? '+' : ''}${x.delta}</span></div>`).join('');
        this.show(`<div class="screen-header"><div><div class="crumb">FIN DE TEMPORADA</div><h2>Temporada ${st.season - 1}</h2></div></div>
          <div class="screen-body"><div class="grid2"><div class="panel">${res.champions.map((ch, i) => `<p>${esc(fmt.torneos[i] ?? 'Torneo')}: <b>${esc(lookup(ch).name)}</b></p>`).join('')}<p>Campeón de la temporada: <b>${esc(lookup(res.champion).name)}</b></p><p>Tu puesto en la tabla: <b>${res.position}.º</b></p><p>Ingresos de la temporada: <b>+${res.income} M</b> (presupuesto: ${(st.budget ?? 0).toFixed(1)} M)</p></div>
          <div class="panel"><h3>Evolución de tu plantilla</h3>${ch || '<span class="muted">Sin cambios</span>'}</div></div></div>
          <div class="screen-footer"><button class="btn primary" data-act="ok">Continuar</button></div>`, { ok: () => { this.careerView = 'resumen'; this.careerHub(); } }, () => this.careerHub());
      },
      play: () => {
        if (!next) return;
        const home = lookup(next.home);
        const away = lookup(next.away);
        const side = next.home === st.userTeam ? 0 : 1;
        this.playMatch({
          home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away), humanTeam: side,
          halfLengthSec: this.settings.halfMinutes * 60, difficulty: this.settings.difficulty, extraTime: next.knockout, penalties: next.knockout,
          neutral: !!next.venue,
          homeFormation: side === 0 ? st.formation : undefined, awayFormation: side === 1 ? st.formation : undefined,
          homeLineup: side === 0 ? this.career?.matchLineup() ?? st.lineup : undefined, awayLineup: side === 1 ? this.career?.matchLineup() ?? st.lineup : undefined,
          weather: randomWeather(Math.random()),
        }, this.stadiumForCtx({ mode: 'career', fixture: next }), { mode: 'career', fixture: next });
      },
    }, () => this.mainMenu());
  }

  private continentalView: 'grupo' | 'grupos' | 'eliminatorias' = 'grupo';

  /** Copas CONMEBOL: elegir la copa y el club, y jugar grupos y eliminatorias. */
  continentalHub() {
    this.setMenuMode(true);
    this.continental = this.continental ?? Continental.load();
    const c = this.continental;
    if (!c) {
      const ls = (Object.keys(CUPS) as CupId[]).map((id) => CUPS[id]);
      const handlers: Handlers = { back: () => this.mainMenu() };
      for (const cup of ls) {
        handlers[`cup-${cup.id}`] = () => this.pickTeamScreen(`Elige tu club para la ${cup.name}`, 'COPAS INTERNACIONALES', (id) => { this.continental = Continental.create(cup.id, id); this.continentalView = 'grupo'; this.continentalHub(); }, () => this.continentalHub(), cupEligibleTeams(cup.id));
      }
      const logo = (id: CupId) => `<img src="${leagueLogo(id) ?? ''}" alt="" style="height:46px;width:46px;object-fit:contain;background:#fff;border-radius:8px;padding:3px;box-sizing:border-box;flex:none">`;
      this.show(`
        <div class="screen-header"><div><div class="crumb">COPAS INTERNACIONALES</div><h2>Elige la copa</h2></div></div>
        <div class="screen-body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:860px;margin:0 auto">${ls.map((cup) => `<button class="menu-item" data-act="cup-${cup.id}" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:12px;text-align:left;padding:12px 14px">${logo(cup.id)}<span>${esc(cup.name)}<small>${cup.size} clubes · ${cup.format === 'league' ? 'fase de liga' : '8 grupos'} · ida y vuelta · final neutral</small></span></button>`).join('')}</div></div>
        <div class="screen-footer"><button class="btn" data-act="back">Volver</button></div>`, handlers, () => this.mainMenu());
      return;
    }
    const st = c.state;
    const next = c.nextUserFixture();
    const lookup = (id: string) => getTeam(id);
    const knock = st.fixtures.filter((f) => f.knockout);
    const isLeague = c.def.format === 'league';
    const VIEWS = (isLeague ? ['grupo', 'eliminatorias'] : ['grupo', 'grupos', 'eliminatorias']) as ('grupo' | 'grupos' | 'eliminatorias')[];
    const NAMES = { grupo: isLeague ? 'Tabla de la fase de liga' : 'Mi grupo', grupos: 'Todos los grupos', eliminatorias: 'Eliminatorias' } as const;
    const view = VIEWS.includes(this.continentalView) ? this.continentalView : 'grupo';
    const champion = st.champion ? getTeam(st.champion) : null;
    if (champion) this.celebrate(`cup:${st.cup}:${st.seed}`, champion, c.def.name, `${c.def.confed ?? ""}`, champion.id === st.userTeam, leagueLogo(st.cup));
    const status = champion
      ? `<div class="panel" style="text-align:center"><div class="crumb" style="color:var(--warn)">CAMPEÓN</div><div style="display:flex;justify-content:center;margin:10px">${crestSVG(champion, 110)}</div><h2>${esc(champion.name)}</h2>${champion.id === st.userTeam ? `<p>¡Has ganado la ${esc(c.def.name)}! 🏆</p>` : '<p class="muted">Mejor suerte la próxima vez.</p>'}</div>`
      : st.eliminated ? '<div class="panel"><b>Tu equipo quedó eliminado.</b> <span class="muted">Simula el resto para ver al campeón.</span></div>' : '';
    const groupFx = (g: number) => st.fixtures.filter((f) => !f.knockout && st.groups[g].includes(f.home));
    const groupPanel = (g: number) => `<div class="panel" style="margin-bottom:12px"><h3>${isLeague ? 'Fase de liga' : `Grupo ${'ABCDEFGH'[g]}`}</h3>${this.tableHTML(c.standings(g), st.userTeam, lookup)}${isLeague ? '<div class="muted" style="font-size:12px;margin-top:6px">Los 8 primeros pasan directo a octavos; del 9.º al 24.º juegan el play-off a ida y vuelta.</div>' : ''}${view === 'grupo' ? `<div style="margin-top:10px">${(isLeague ? groupFx(g).filter((f) => f.home === st.userTeam || f.away === st.userTeam) : groupFx(g)).map((f) => this.fixtureHTML(f, st.userTeam, lookup)).join('')}</div>` : ''}</div>`;
    let body = '';
    if (view === 'grupo') body = groupPanel(c.userGroup);
    else if (view === 'grupos') body = st.groups.map((_, g) => groupPanel(g)).join('');
    else {
      const rounds = [...new Set(knock.map((f) => f.round))];
      body = rounds.length
        ? rounds.map((r) => { const fx = knock.filter((f) => f.round === r); return `<div class="panel" style="margin-bottom:12px"><h3>${esc(fx[0].stage)}</h3>${fx.map((f) => this.fixtureHTML(f, st.userTeam, lookup) + (f.leg === 2 && f.played ? `<div class="muted" style="font-size:12px;text-align:center">Global: ${c.aggregate(f)[0]} - ${c.aggregate(f)[1]}</div>` : '')).join('')}${fx[0].venue ? `<div class="muted" style="font-size:12px">${esc(getStadium(fx[0].venue).name)}</div>` : ''}</div>`; }).join('')
        : `<div class="panel"><p class="muted">${isLeague ? 'Los 8 primeros pasan a octavos y del 9.º al 24.º juegan un play-off a ida y vuelta' : 'Pasan los dos primeros de cada grupo'}: octavos, cuartos y semifinales a ida y vuelta (define el global, con prórroga y penales). La final es a partido único en cancha neutral.</p></div>`;
    }
    this.show(`
      <div class="screen-header"><div><div class="crumb">COPAS INTERNACIONALES · ${esc(getTeam(st.userTeam).name)}</div><h2 style="display:flex;align-items:center;gap:12px"><img src="${leagueLogo(st.cup) ?? ''}" alt="" style="height:46px;width:46px;object-fit:contain;background:#fff;border-radius:8px;padding:3px;box-sizing:border-box"><span>${esc(c.def.name)}</span></h2></div></div>
      <div class="screen-body">
        ${status}
        ${next ? `<div class="panel" style="margin-bottom:16px"><div class="crumb">PRÓXIMO PARTIDO · ${esc(next.stage.toUpperCase())}</div>${this.fixtureHTML(next, st.userTeam, lookup)}${next.venue ? `<div class="muted" style="font-size:12px">${esc(getStadium(next.venue).name)}</div>` : ''}</div>` : ''}
        ${this.stepper('Ver', NAMES[view], 'view')}
        ${body}
      </div>
      <div class="screen-footer">
        <button class="btn" data-act="back">Menú</button>
        <button class="btn danger" data-act="abandon">${st.champion ? 'Nueva copa' : 'Abandonar copa'}</button>
        ${next ? '<button class="btn" data-act="simMatch">Simular partido</button>' : ''}
        ${next ? '<button class="btn primary" data-act="play">Jugar partido</button>' : !st.champion ? '<button class="btn primary" data-act="simRest">Simular el resto</button>' : ''}
      </div>`, {
      back: () => this.mainMenu(),
      abandon: () => { Continental.clear(); this.continental = null; this.continentalHub(); },
      viewPrev: () => { this.continentalView = VIEWS[(VIEWS.indexOf(view) + VIEWS.length - 1) % VIEWS.length]; this.continentalHub(); },
      viewNext: () => { this.continentalView = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]; this.continentalHub(); },
      simMatch: () => { c.simulateUserFixture(); this.continentalHub(); },
      simRest: () => { c.simulateAll(); this.continentalHub(); },
      play: () => {
        if (!next) return;
        const home = getTeam(next.home);
        const away = getTeam(next.away);
        const side = next.home === st.userTeam ? 0 : 1;
        this.playMatch({
          home, away, homeKit: home.home, awayKit: chooseAwayKit(home, away), humanTeam: side,
          halfLengthSec: this.settings.halfMinutes * 60, difficulty: this.settings.difficulty,
          // la ida no tiene prórroga; la vuelta y la final sí (la vuelta se define por el global)
          extraTime: next.knockout && next.leg !== 1, penalties: next.knockout && next.leg !== 1, neutral: !!next.venue,
          aggregate: next.leg === 2 ? c.firstLegGoals(next) : undefined, weather: randomWeather(Math.random()),
          homeLineup: side === 0 ? st.availability && this.continental?.matchLineup() : undefined,
          awayLineup: side === 1 ? st.availability && this.continental?.matchLineup() : undefined,
        }, this.stadiumForCtx({ mode: 'continental', fixture: next }), { mode: 'continental', fixture: next });
      },
    }, () => this.mainMenu());
  }

  /** Mercado de fichajes del modo carrera: comprar a otros clubes y vender jugadores propios. */
  private marketScreen(msg = '', tab: 'buy' | 'sell' = 'buy', pos: 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD' = 'ALL') {
    const c = this.career;
    if (!c) return;
    const st = c.state;
    const POS = ['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const;
    const POSN = { ALL: 'Todos', GK: 'Arqueros', DEF: 'Defensas', MID: 'Medios', FWD: 'Delanteros' } as const;
    const posLabel = (p: PlayerData) => (p.position === 'GK' ? 'POR' : p.position === 'DEF' ? 'DEF' : p.position === 'MID' ? 'MED' : 'DEL');
    const budget = st.budget ?? 0;
    let rows = '';
    if (tab === 'buy') {
      rows = marketOffers(c).filter((o) => pos === 'ALL' || o.player.position === pos).slice(0, 40).map((o) => `<div class="row market-row ${o.price > budget ? 'expensive' : ''}"><span><span class="pos ${o.player.position}">${posLabel(o.player)}</span> ${esc(o.player.name)} <span class="muted">${o.age} años · ${esc(o.team.short)}</span></span><span class="ovr">${playerOverall(o.player)}</span><span class="price">${o.price.toFixed(1)} M</span><button class="btn" data-act="buy" data-id="${o.player.id}">Fichar</button></div>`).join('');
    } else {
      rows = c.user.players.filter((p) => pos === 'ALL' || p.position === pos).map((p) => {
        const age = st.ages[p.id] ?? 25;
        return `<div class="row market-row"><span><span class="pos ${p.position}">${posLabel(p)}</span> ${esc(p.name)} <span class="muted">${age} años${st.lineup.includes(p.id) ? ' · titular' : ''}</span></span><span class="ovr">${playerOverall(p)}</span><span class="price">${(playerPrice(p, age) * 0.9).toFixed(1)} M</span><button class="btn danger" data-act="sell" data-id="${p.id}">Vender</button></div>`;
      }).join('');
    }
    this.show(`
      <div class="screen-header"><div><div class="crumb">MERCADO · ${esc(c.user.name)} · ${c.user.players.length}/${SQUAD_MAX} jugadores</div><h2>Presupuesto: ${budget.toFixed(1)} M</h2></div></div>
      <div class="screen-body"><div class="panel">
        ${msg ? `<div class="editor-msg">${esc(msg)}</div>` : ''}
        ${this.stepper('Ver', tab === 'buy' ? 'Comprar (otros clubes)' : 'Vender (tu plantilla)', 'tab')}
        ${this.stepper('Puesto', POSN[pos], 'pos')}
        <div class="market-list">${rows || '<span class="muted">No hay jugadores.</span>'}</div>
        <p class="muted" style="font-size:12px;margin-top:8px">Los precios dependen de la media y la edad. Al vender recibes el 90 %. La plantilla debe tener entre ${SQUAD_MIN} y ${SQUAD_MAX} jugadores. Cada temporada ingresas dinero según tu posición (más en Primera).</p>
      </div></div>
      <div class="screen-footer"><button class="btn primary" data-act="back">Volver</button></div>`, {
      tabPrev: () => this.marketScreen('', tab === 'buy' ? 'sell' : 'buy', pos), tabNext: () => this.marketScreen('', tab === 'buy' ? 'sell' : 'buy', pos),
      posPrev: () => this.marketScreen('', tab, POS[(POS.indexOf(pos) + POS.length - 1) % POS.length]),
      posNext: () => this.marketScreen('', tab, POS[(POS.indexOf(pos) + 1) % POS.length]),
      buy: (el) => { const err = buyPlayer(c, el.dataset.id!); this.marketScreen(err ?? 'Fichaje cerrado', tab, pos); },
      sell: (el) => { const err = sellPlayer(c, el.dataset.id!); this.marketScreen(err ?? 'Venta cerrada', tab, pos); },
      back: () => this.careerHub(),
    }, () => this.careerHub());
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
        const av = c.state.availability;
        const outInfo = av?.out[p.id];
        const badge = outInfo ? `<span class="out-badge" title="${outInfo.reason === 'injury' ? 'Lesionado' : 'Sancionado'}">${outInfo.reason === 'injury' ? '🚑' : '🟥'} ${outInfo.games}</span>` : (av?.yellows[p.id] ? `<span class="muted" title="Amarillas acumuladas">🟨${av.yellows[p.id]}</span>` : '');
        return `<div class="row ${starter >= 0 ? 'starter' : ''} ${isAvailable(av, p.id) ? '' : 'unavailable'}" data-act="pick" data-id="${p.id}"><span><span class="pos ${p.position}">${p.position === 'GK' ? 'POR' : p.position === 'DEF' ? 'DEF' : p.position === 'MID' ? 'MED' : 'DEL'}</span> ${p.number}. ${esc(p.name)} <span class="muted">${c.state.ages[p.id] ?? ''} años</span> ${badge}</span><span class="ovr">${playerOverall(p)}</span></div>`;
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
    let idx = this.trainIdx;
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
        ${this.teamCard(TEAMS[idx], 'EQUIPO', 'team', '', true)}
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
      teamSearch: () => this.teamSearchScreen({
        title: 'Elige el equipo', crumb: 'ENTRENAMIENTO', teams: TEAMS, current: TEAMS[idx].id,
        onPick: (id) => { this.trainIdx = TEAMS.findIndex((t) => t.id === id); this.trainingScreen(); }, back: () => this.trainingScreen(),
      }),
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
    const LANGS = ['es', 'en', 'pt'] as const;
    const QL = { low: 'Baja', medium: 'Media', high: 'Alta' };
    const CAMS = ['broadcast', 'tele', 'wide'] as const;
    const CL = { broadcast: 'Transmisión', tele: 'Tele', wide: 'Panorámica' };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const toggle = (label: string, key: keyof GameSettings) => `<div class="row"><label>${label}</label><button class="toggle ${st[key] ? 'on' : ''}" data-act="tog" data-key="${key}"></button></div>`;
    const render = () => `
      <div class="screen-header"><div><div class="crumb">CONFIGURACIÓN</div><h2>Opciones</h2></div></div>
      <div class="screen-body"><div class="grid3">
        <div class="panel"><h3>Gráficos</h3>
          ${this.stepper('Idioma / Language', LANG_NAMES[st.language], 'lang')}
          ${this.stepper('Calidad', QL[st.quality] + (inMatch ? ' (próximo partido)' : ''), 'qual')}
          ${toggle('Sombras', 'shadows')}
          ${this.stepper('Escala de resolución', pct(st.resolutionScale), 'res')}
          ${toggle('Antialiasing (reiniciar)', 'antialias')}
          ${toggle('Calidad automática (según FPS)', 'autoQuality')}
          ${this.stepper('Cámara', CL[st.cameraStyle], 'cam')}
          ${this.stepper('Zoom de cámara', st.cameraZoom.toFixed(1) + 'x', 'zoom')}
          ${toggle('Radar', 'showRadar')}
          ${toggle('Indicadores y ayudas visuales', 'showIndicators')}
          ${toggle('Repeticiones de goles', 'replays')}
          ${toggle('Árbitro falible y VAR', 'varEnabled')}
          ${toggle('Avisos en pantalla (atajada, falta, controles…)', 'popups')}
          ${this.stepper('Controles táctiles', ({ auto: 'Automático', on: 'Siempre', off: 'Desactivados' } as const)[st.touchControls], 'touch')}
        </div>
        <div class="panel"><h3>Sonido</h3>
          ${this.stepper('Volumen general', pct(st.masterVolume), 'vmaster')}
          ${this.stepper('Música', pct(st.musicVolume), 'vmusic')}
          ${this.stepper('Efectos', pct(st.sfxVolume), 'vsfx')}
          ${this.stepper('Público y cánticos', pct(st.crowdVolume), 'vcrowd')}
          ${this.stepper('Narrador', st.commentaryVolume > 0 ? pct(st.commentaryVolume) : 'Sin voz', 'vcomm')}
          ${this.stepper('Balón', pct(st.ballVolume), 'vball')}
          ${this.stepper('Árbitro (silbato)', pct(st.refereeVolume), 'vref')}
          ${toggle('Vibración (mando y móvil)', 'vibration')}
          ${toggle('Comentarista (rótulos)', 'commentary')}
        </div>
        <div class="panel"><h3>Jugabilidad</h3>
          ${this.stepper('Dificultad por defecto', DIFFICULTY_LABELS[st.difficulty], 'diff')}
          ${this.stepper('Duración de parte (torneo/carrera)', `${st.halfMinutes} min`, 'half')}
          ${toggle('Cambio automático de jugador', 'autoSwitch')}
          ${toggle('Cambios automáticos (jugadores cansados)', 'autoSubs')}
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
      langPrev: () => { st.language = cycleArr(LANGS, st.language, -1); setLang(st.language); apply(); },
      langNext: () => { st.language = cycleArr(LANGS, st.language, 1); setLang(st.language); apply(); },
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
      vcommPrev: () => { step('commentaryVolume', -1, 0, 1, 0.1); this.sampleCommentary(); },
      vcommNext: () => { step('commentaryVolume', 1, 0, 1, 0.1); this.sampleCommentary(); },
      vballPrev: () => step('ballVolume', -1, 0, 1, 0.1), vballNext: () => step('ballVolume', 1, 0, 1, 0.1),
      vrefPrev: () => step('refereeVolume', -1, 0, 1, 0.1), vrefNext: () => step('refereeVolume', 1, 0, 1, 0.1),
      diffPrev: () => { st.difficulty = cycleArr(DIFFS, st.difficulty, -1); apply(); },
      diffNext: () => { st.difficulty = cycleArr(DIFFS, st.difficulty, 1); apply(); },
      halfPrev: () => { st.halfMinutes = cycleArr(HALF_OPTIONS, st.halfMinutes, -1); apply(); },
      halfNext: () => { st.halfMinutes = cycleArr(HALF_OPTIONS, st.halfMinutes, 1); apply(); },
      assistAllPrev: () => { st.assist = cycleArr(['auto', 'on', 'off'] as const, st.assist, -1); apply(); },
      assistAllNext: () => { st.assist = cycleArr(['auto', 'on', 'off'] as const, st.assist, 1); apply(); },
      assistPrev: () => { st.passAssist = st.passAssist >= 0.5 ? 0 : 1; apply(); },
      assistNext: () => { st.passAssist = st.passAssist >= 0.5 ? 0 : 1; apply(); },
      pbarPrev: () => step('powerBarTime', -1, 0.3, 1.6, 0.1), pbarNext: () => step('powerBarTime', 1, 0.3, 1.6, 0.1),
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
        <div class="panel"><h3>Mando (esquema clásico de FIFA)</h3>
          <div class="row"><label>Mover</label><span>Stick izquierdo</span></div>
          <div class="row"><label>Pase corto / Cabezazo · Presionar</label><span class="keycap">A / ✕</span></div>
          <div class="row"><label>Tiro / Volea · Entrada</label><span class="keycap">B / ○</span></div>
          <div class="row"><label>Pase elevado / Centro · Barrida</label><span class="keycap">X / □</span></div>
          <div class="row"><label>Pase al hueco · Salida del arquero</label><span class="keycap">Y / △</span></div>
          <div class="row"><label>Sprint</label><span class="keycap">RT / R2</span></div>
          <div class="row"><label>Cambiar jugador (sin balón)</label><span class="keycap">LB / L1</span></div>
          <div class="row"><label>Presión de compañero (defensa)</label><span class="keycap">RB / R1</span></div>
          <div class="row"><label>Contener (defensa)</label><span class="keycap">LT / L2</span></div>
          <div class="row"><label>Pase tenso</label><span>RB + A</span></div>
          <div class="row"><label>Pase al hueco bombeado</label><span>LB + Y</span></div>
          <div class="row"><label>Centro tenso · bajo · raso</label><span>RB + X · X X · X X X</span></div>
          <div class="row"><label>Pedir desmarque (con balón)</label><span class="keycap">LB / L1</span></div>
          <div class="row"><label>Mentalidad del equipo</label><span>Cruceta ← / →</span></div>
          <div class="row"><label>Cambiar jugador (sin balón)</label><span>Stick derecho</span></div>
          <div class="row"><label>Pared · pared avanzada</label><span>LB + A · RB + A y stick der.</span></div>
          <div class="row"><label>Pase con rosca · vaselina corta</label><span>LT + A · LT + RB + A</span></div>
          <div class="row"><label>Centro raso potente · alto · 2.º palo · anticipado</label><span>RB + X · LB + X · LB + RB + X · LT + X</span></div>
          <div class="row"><label>Finalización perfecta · amago</label><span>B y B al impactar · LT + B</span></div>
          <div class="row"><label>Proteger · precisión · dejar pasar</label><span>LT · RB · LB (mantener)</span></div>
          <div class="row"><label>Autopase · primer toque orientado</label><span>RT + 2× stick der. · RB + stick der.</span></div>
          <div class="row"><label>Cancelar pase/tiro</label><span>LB + RB</span></div>
          <div class="row"><label>Centro filtrado · pase filtrado · bombeado al pie</label><span>Y + X · A + Y · A + X (a la vez)</span></div>
          <div class="row"><label>Presión de equipo · arquero en la línea</label><span>RB RB (mantener) · Y Y</span></div>
          <div class="row"><label>Colocar al arquero · soltar el balón</label><span>R3 + stick der. · Y (tocar)</span></div>
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

function hashStr(t: string): number { let h = 0; for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) >>> 0; return h; }
