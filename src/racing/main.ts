// Apex Grand Prix — menús, HUD, controles (táctil y teclado), flujo del fin de semana y campeonato.
import { DRIVERS, TEAMS, TRACKS, TYRES, DIFFICULTY, POINTS_RACE, POINTS_SPRINT, isSlick, type Compound } from './data';
import { getTrack, type Track } from './track';
import { Sim, fmtTime, isRaceType, SESSION_NAME, type SessionType, type Result, type Car } from './sim';
import { View } from './view';
import { saveJSON, loadJSON } from '../save/Storage';

const ui = document.getElementById('ui')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const LAPS = ['3', '5', '8', '25%', '50%', '100%'];
const FORMATS = ['Solo carrera', 'Clasificación + carrera', 'Fin de semana completo'];
const WEATHER = ['Dinámico', 'Seco', 'Lluvia'];
const DAMAGE = ['Sin daños', 'Reducidos', 'Realistas'];
const QUALITY = ['Baja', 'Media', 'Alta'];
const set = loadJSON('apexgp-settings', {
  driver: 0, track: 0, difficulty: 1, laps: 1, format: 1, weather: 0, damage: 1, gridPos: 10, formation: true,
  brake: touch, steer: false, tc: true, pitLimiter: true, line: true, autoThr: touch, buttons: false, quality: touch ? 1 : 2, sound: true,
});
let champ = loadJSON<{ round: number; pts: number[]; driver: number } | null>('apexgp-champ', null);
const save = () => { saveJSON('apexgp-settings', set); saveJSON('apexgp-champ', champ); };

const view = new View(canvas, set.quality);
let sim: Sim | null = null;
let paused = false;
let hudOn = false;
/** fin de semana en curso */
let wk: { track: number; sessions: SessionType[]; i: number; grid: number[]; sprintGrid: number[]; q: number[][]; champ: boolean; tyre: Compound; raceLaps: number } | null = null;

// ------------------------------------------------------------------ sonido (motor sintetizado)
const audio = {
  ctx: null as AudioContext | null, osc: [] as OscillatorNode[], gain: null as GainNode | null, skid: null as GainNode | null,
  start() {
    if (this.ctx || !set.sound) return;
    const C = (this.ctx = new AudioContext());
    const g = (this.gain = C.createGain()); g.gain.value = 0;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    for (const type of ['sawtooth', 'square'] as OscillatorType[]) { const o = C.createOscillator(); o.type = type; o.connect(lp); o.start(); this.osc.push(o); }
    lp.connect(g).connect(C.destination);
    const buf = C.createBuffer(1, C.sampleRate, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = C.createBufferSource(); n.buffer = buf; n.loop = true;
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900;
    const sg = (this.skid = C.createGain()); sg.gain.value = 0;
    n.connect(bp).connect(sg).connect(C.destination); n.start();
  },
  update(rpm: number, thr: number, slide: number, on: boolean) {
    if (!this.ctx || !this.gain || !this.skid) return;
    const t = this.ctx.currentTime, f = rpm / 42;
    this.osc[0].frequency.setTargetAtTime(f, t, 0.03); this.osc[1].frequency.setTargetAtTime(f / 2, t, 0.03);
    this.gain.gain.setTargetAtTime(on && set.sound ? 0.035 + 0.05 * thr : 0, t, 0.05);
    this.skid.gain.setTargetAtTime(on && set.sound ? Math.min(0.12, slide * 0.02) : 0, t, 0.05);
  },
  bang(p: number) {
    if (!this.ctx || !set.sound) return;
    const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    o.type = 'triangle'; o.frequency.value = 90; o.frequency.exponentialRampToValueAtTime(30, C.currentTime + 0.25);
    g.gain.value = Math.min(0.5, 0.08 + p * 0.03); g.gain.exponentialRampToValueAtTime(0.001, C.currentTime + 0.3);
    o.connect(g).connect(C.destination); o.start(); o.stop(C.currentTime + 0.3);
  },
};

// ------------------------------------------------------------------ menús
function trackSvg(t: Track) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, d = '';
  for (let i = 0; i < t.n; i += 4) { x0 = Math.min(x0, t.px[i]); x1 = Math.max(x1, t.px[i]); z0 = Math.min(z0, t.pz[i]); z1 = Math.max(z1, t.pz[i]); }
  for (let i = 0; i < t.n; i += 4) d += `${i ? 'L' : 'M'}${(t.px[i] - x0).toFixed(0)},${(t.pz[i] - z0).toFixed(0)}`;
  return `<svg viewBox="-30 -30 ${x1 - x0 + 60} ${z1 - z0 + 60}"><path d="${d}Z" fill="none" stroke="#fff" stroke-width="${(x1 - x0) / 28}" stroke-linejoin="round"/></svg>`;
}
const screen = (html: string, cls = '') => { hudOn = false; show3d = cls === 'glass'; ui.innerHTML = `<div class="screen ${cls}">${html}</div>`; };
const tyChip = (c: string) => `<em class="ty ${c}">${c}</em>`;
const who = (di: number) => `<i class="bar" style="background:${hex(TEAMS[DRIVERS[di].team].c[0])}"></i>${esc(DRIVERS[di].name)}`;

function menu() {
  sim = null; wk = null;
  screen(`<h1>APEX <b>GRAND PRIX</b></h1><p class="sub">Campeonato de monoplazas · 11 equipos · 22 pilotos · 18 circuitos</p>
  <div class="col">
    <button class="btn pri" data-a="setup" data-v="quick">Carrera rápida</button>
    <button class="btn" data-a="setup" data-v="champ">${champ ? `Continuar campeonato (ronda ${Math.min(champ.round + 1, TRACKS.length)}/${TRACKS.length})` : 'Nuevo campeonato'}</button>
    ${champ ? '<button class="btn" data-a="standings">Clasificación del campeonato</button><button class="btn" data-a="newchamp">Reiniciar campeonato</button>' : ''}
    <button class="btn" data-a="options">Opciones</button>
  </div><p class="sub">Móvil: desliza a la izquierda de la pantalla para girar · pedales a la derecha<br>Teclado: flechas / WASD · Espacio ERS · P boxes · C cámara · R volver a pista</p>`);
}

function setup(mode: string) {
  const isChamp = mode === 'champ';
  if (isChamp && champ && champ.round >= TRACKS.length) return standings();
  const ti = isChamp && champ ? champ.round : set.track, lock = isChamp && !!champ;
  const drivers = DRIVERS.map((d, i) => `<button class="chip ${i === (lock ? champ!.driver : set.driver) ? 'on' : ''}" ${lock ? '' : `data-a="pick" data-k="driver" data-v="${i}"`} data-m="${mode}"><i style="background:${hex(TEAMS[d.team].c[0])}"></i><span>${d.num} ${esc(d.name)}<small>${TEAMS[d.team].name}</small></span></button>`).join('');
  const tracks = TRACKS.map((t, i) => `<button class="chip ${i === ti ? 'on' : ''}" ${isChamp ? '' : `data-a="pick" data-k="track" data-v="${i}"`} data-m="${mode}">${trackSvg(getTrack(i, TRACKS))}<span>${i + 1}. ${esc(t.name.replace(/^(Circuito|Autódromo) /, ''))}<small>${(getTrack(i, TRACKS).length / 1000).toFixed(2)} km${t.sprint ? ' · sprint' : ''}</small></span></button>`).join('');
  const opt = (label: string, key: string, text: string) => `<div class="opt"><span>${label}</span><button data-a="cycle" data-k="${key}" data-m="${mode}">${text}</button></div>`;
  screen(`<h1>${isChamp ? 'CAMPEONATO' : 'CARRERA RÁPIDA'}</h1>
  ${isChamp ? `<p class="sub">Ronda ${ti + 1} de ${TRACKS.length}: ${esc(TRACKS[ti].name)}</p>` : ''}
  <div class="row2"><button class="btn" data-a="menu">Volver</button><button class="btn pri" data-a="go" data-v="${mode}">Empezar</button></div>
  <h2>Opciones</h2><div class="opts">
    ${opt('Vueltas de carrera', 'laps', LAPS[set.laps])}${opt('Formato', 'format', FORMATS[set.format])}${opt('Dificultad', 'difficulty', DIFFICULTY[set.difficulty].name)}
    ${opt('Clima', 'weather', WEATHER[set.weather])}${opt('Daños', 'damage', DAMAGE[set.damage])}${set.format === 0 ? opt('Posición de salida', 'gridPos', 'P' + set.gridPos) : ''}${opt('Vuelta de formación', 'formation', set.formation ? 'Sí' : 'No')}
  </div>
  ${lock ? '' : `<h2>Piloto</h2><div class="grid">${drivers}</div>`}
  ${isChamp ? '' : `<h2>Circuito</h2><div class="grid">${tracks}</div>`}`);
}

function options(back = 'menu') {
  const o = (label: string, key: string, text: string) => `<div class="opt"><span>${label}</span><button data-a="cycle" data-k="${key}" data-m="options:${back}">${text}</button></div>`;
  const yn = (v: boolean) => (v ? 'Sí' : 'No');
  screen(`<h1>OPCIONES</h1><div class="opts">
    ${o('Frenada asistida', 'brake', yn(set.brake))}${o('Dirección asistida', 'steer', yn(set.steer))}${o('Control de tracción', 'tc', yn(set.tc))}
    ${o('Acelerador automático', 'autoThr', yn(set.autoThr))}${o('Limitador de boxes automático', 'pitLimiter', yn(set.pitLimiter))}${o('Trazada ideal', 'line', yn(set.line))}
    ${o('Dirección táctil', 'buttons', set.buttons ? 'Botones' : 'Deslizar')}${o('Calidad gráfica', 'quality', QUALITY[set.quality])}${o('Sonido', 'sound', yn(set.sound))}
  </div><div class="col"><button class="btn pri" data-a="${back}">Volver</button></div>`, sim ? 'glass' : '');
}

/** con el formato «Clasificación + carrera» hay una única sesión de clasificación */
const sesName = (t: SessionType) => (t === 'Q3' && set.format === 1 ? 'Clasificación' : SESSION_NAME[t]);
const pts = (type: SessionType, pos: number) => (type === 'RACE' ? POINTS_RACE : type === 'SPRINT' ? POINTS_SPRINT : [])[pos - 1] ?? 0;

function resultsScreen(type: SessionType, res: Result[]) {
  const me = sim?.o.player ?? -1, race = isRaceType(type), lead = res[0];
  const rows = res.map((r) => {
    const t = r.status || (race ? (r.pos === 1 ? fmtTime(r.time) : r.laps < lead.laps ? `+${lead.laps - r.laps} v` : `+${(r.time - lead.time).toFixed(3)}`) : fmtTime(r.best));
    return `<tr class="${r.di === me ? 'me' : ''}"><td>${r.pos}</td><td>${who(r.di)}</td><td>${TEAMS[DRIVERS[r.di].team].short}</td><td>${t}</td>${race ? `<td>${fmtTime(r.best)}</td><td>${[...r.tyres].map(tyChip).join('')}</td><td>${r.pen ? `+${r.pen}s` : ''}</td><td>${pts(type, r.pos) && !r.status ? pts(type, r.pos) : ''}</td>` : ''}</tr>`;
  }).join('');
  const fl = sim?.fastest;
  screen(`<h1>${sesName(type).toUpperCase()}</h1><p class="sub">${esc(TRACKS[wk!.track].name)}${fl ? ` · Vuelta rápida: ${DRIVERS[fl.di].tla} ${fmtTime(fl.time)}` : ''}</p>
  <div class="row2"><button class="btn pri" data-a="next">Continuar</button></div>
  <div class="tables"><div><table><tr><th>Pos</th><th>Piloto</th><th>Equipo</th><th>${race ? 'Tiempo' : 'Mejor vuelta'}</th>${race ? '<th>Mejor</th><th>Neum.</th><th>Sanc.</th><th>Pts</th>' : ''}</tr>${rows}</table></div></div>`);
}

function standings() {
  if (!champ) return menu();
  const d = DRIVERS.map((_, i) => i).sort((a, b) => champ!.pts[b] - champ!.pts[a]);
  const teams = TEAMS.map((_, t) => ({ t, p: DRIVERS.reduce((s, dr, i) => s + (dr.team === t ? champ!.pts[i] : 0), 0) })).sort((a, b) => b.p - a.p);
  const over = champ.round >= TRACKS.length;
  screen(`<h1>CAMPEONATO</h1><p class="sub">${over ? `Campeón: ${esc(DRIVERS[d[0]].name)} · Constructores: ${TEAMS[teams[0].t].name}` : `Tras ${champ.round} de ${TRACKS.length} rondas`}</p>
  <div class="row2"><button class="btn" data-a="menu">Menú</button>${over ? '' : '<button class="btn pri" data-a="setup" data-v="champ">Siguiente ronda</button>'}</div>
  <div class="tables"><div><table><tr><th>Pos</th><th>Piloto</th><th>Pts</th></tr>${d.map((i, k) => `<tr class="${i === champ!.driver ? 'me' : ''}"><td>${k + 1}</td><td>${who(i)}</td><td>${champ!.pts[i]}</td></tr>`).join('')}</table></div>
  <div><table><tr><th>Pos</th><th>Equipo</th><th>Pts</th></tr>${teams.map((x, k) => `<tr class="${x.t === DRIVERS[champ!.driver].team ? 'me' : ''}"><td>${k + 1}</td><td><i class="bar" style="background:${hex(TEAMS[x.t].c[0])}"></i>${TEAMS[x.t].name}</td><td>${x.p}</td></tr>`).join('')}</table></div></div>`);
}

// ------------------------------------------------------------------ fin de semana
function startWeekend(isChamp: boolean) {
  if (isChamp && !champ) champ = { round: 0, pts: DRIVERS.map(() => 0), driver: set.driver };
  const track = isChamp ? champ!.round : set.track, def = TRACKS[track];
  const lp = LAPS[set.laps], raceLaps = lp.endsWith('%') ? Math.max(3, Math.round((def.laps * parseInt(lp)) / 100)) : +lp;
  const sprint = !!def.sprint && set.format === 2;
  const sessions: SessionType[] = set.format === 0 ? ['RACE'] : set.format === 1 ? ['Q3', 'RACE'] : sprint ? ['P', 'SQ', 'SPRINT', 'Q1', 'Q2', 'Q3', 'RACE'] : ['P', 'Q1', 'Q2', 'Q3', 'RACE'];
  // parrilla por defecto: ritmo de coche y piloto con algo de azar; el jugador en la posición elegida
  const me = isChamp ? champ!.driver : set.driver;
  const grid = DRIVERS.map((_, i) => i).filter((i) => i !== me).sort((a, b) => score(b) - score(a));
  grid.splice(Math.min(21, set.gridPos - 1), 0, me);
  wk = { track, sessions, i: -1, grid, sprintGrid: grid, q: [], champ: isChamp, tyre: 'M', raceLaps };
  save();
  nextSession();
}
const score = (i: number) => TEAMS[DRIVERS[i].team].perf * 4 + DRIVERS[i].skill * 0.2 + Math.random() * 0.03;
const meIdx = () => (wk!.champ ? champ!.driver : set.driver);

function weatherFor(def: (typeof TRACKS)[number]): number[] {
  if (set.weather === 1) return [0];
  if (set.weather === 2) return [0.7, 0.85, 0.6];
  const r = Math.random();
  if (r < def.rain * 0.4) return [0.6, 0.8, 0.7];
  if (r < def.rain) return Math.random() < 0.5 ? [0, 0, 0.7, 0.8] : [0.7, 0.4, 0, 0];
  return [0];
}

function entriesFor(type: SessionType): number[] {
  const all = DRIVERS.map((_, i) => i), w = wk!;
  if (type === 'RACE') return w.grid;
  if (type === 'SPRINT') return w.sprintGrid;
  if (type === 'Q2') return w.q[0].slice(0, 16);
  if (type === 'Q3' && w.q[1]) return w.q[1].slice(0, 10);
  return all;
}

function nextSession() {
  const w = wk!;
  w.i++;
  if (w.i >= w.sessions.length) {
    if (w.champ && champ) { champ.round++; save(); return standings(); }
    return menu();
  }
  const type = w.sessions[w.i], def = TRACKS[w.track], track = getTrack(w.track, TRACKS), entries = entriesFor(type), me = meIdx();
  const weather = weatherFor(def), inIt = entries.includes(me), race = isRaceType(type);
  const laps = type === 'SPRINT' ? Math.max(2, Math.round(w.raceLaps / 3)) : w.raceLaps;
  const make = (tyre: Compound) => new Sim({
    track, type, laps, entries, player: inIt ? me : -1, playerTyre: tyre, pace: DIFFICULTY[set.difficulty].pace, weather, damage: set.damage / 2,
    formation: race && set.formation, seed: (Math.random() * 1e9) | 0, assists: { brake: set.brake, steer: set.steer, tc: set.tc, pitLimiter: set.pitLimiter },
  });
  if (!inIt) { sim = make('S'); return simulate(); } // eliminado en la clasificación: la sesión se simula
  const wet = weather[0] > 0.2, rainLater = weather.some((x) => x > 0.2);
  w.tyre = wet ? (weather[0] > 0.7 ? 'W' : 'I') : race ? 'M' : 'S';
  const pre = () => screen(`<h1>${sesName(type).toUpperCase()}</h1><p class="sub">${esc(def.name)} · ${esc(def.place)} · ${(track.length / 1000).toFixed(2)} km${race ? ` · ${laps} vueltas` : ` · ${Math.round(track.lapTime * (type === 'P' ? 4 : 3.2) / 60)} min`}</p>
    <p class="sub">${wet ? '🌧 Pista mojada' : rainLater ? '⛅ Seco, con riesgo de lluvia' : '☀ Seco'}${race ? ` · Sales P${entries.indexOf(me) + 1}` : ''}</p>
    <h2>Neumáticos de salida</h2><div class="tychoice">${(['S', 'M', 'H', 'I', 'W'] as Compound[]).map((c) => `<button class="${c === w.tyre ? 'on' : ''}" data-a="tyre" data-v="${c}">${tyChip(c)}${TYRES[c].name}</button>`).join('')}</div>
    ${type === 'RACE' && laps >= 5 ? '<p class="sub">En seco es obligatorio usar al menos dos compuestos distintos (una parada en boxes).</p>' : ''}
    <div class="col"><button class="btn pri" data-a="drive">Salir a pista</button><button class="btn" data-a="simulate">Simular sesión</button><button class="btn" data-a="menu">Abandonar</button></div>`, 'glass');
  preScreen = pre;
  sim = make(w.tyre);
  sim.player!.tyre = w.tyre; sim.player!.used = w.tyre;
  view.load(sim);
  viewSim = sim;
  pre();
}
let preScreen = () => {};
/** sesión cargada en la escena 3D y si hay que dibujarla (HUD o pantalla translúcida) */
let viewSim: Sim | null = null, show3d = false;

/** simula el resto de la sesión por trozos para no bloquear la pantalla */
function simulate() {
  const s = sim!;
  s.autoAll = true;
  screen('<h1>SIMULANDO…</h1><p class="sub" id="simp"></p>', 'glass');
  const tick = () => {
    if (sim !== s) return;
    const done = s.fastForward(40, () => s.phase === 'done');
    const el = document.getElementById('simp');
    if (el) el.textContent = `${sesName(s.type)} · ${Math.min(99, Math.round((s.time / (s.duration * 1.05)) * 100))}%`;
    if (done || s.time > s.duration * 3 + 600) finishSession(); else setTimeout(tick, 0);
  };
  setTimeout(tick, 30);
}

function finishSession() {
  const s = sim!, w = wk!, res = s.results(), order = res.map((r) => r.di);
  audio.update(0, 0, 0, false);
  if (s.type === 'Q1') w.q[0] = order;
  else if (s.type === 'Q2') w.q[1] = order;
  else if (s.type === 'Q3') w.grid = w.q[1] ? [...order, ...w.q[1].slice(10), ...w.q[0].slice(16)] : order;
  else if (s.type === 'SQ') w.sprintGrid = order;
  if (w.champ && champ) for (const r of res) if (!r.status) champ.pts[r.di] += pts(s.type, r.pos);
  save();
  resultsScreen(s.type, res);
}

// ------------------------------------------------------------------ HUD
const $ = (id: string) => document.getElementById(id)!;
function hud() {
  const s = sim!;
  hudOn = true; paused = false; show3d = true;
  ui.innerHTML = `<div class="hud ${touch ? '' : 'nokeys'}">
    <div class="tower box"><div class="th"><span id="h-ses"></span><span id="h-lap"></span></div><div id="h-rows"></div></div>
    <div class="info box"><div class="pos">P <b id="h-pos">-</b>/${s.cars.length}</div><div class="t" id="h-time"></div><div class="sm">Mejor <span id="h-best"></span></div><div class="sm">Última <span id="h-last"></span></div><div class="pen" id="h-pen"></div></div>
    <div class="tyre box" id="h-tyre"></div>
    <div class="hbtns"><button data-a="skipform" id="h-skip" style="display:none">SALTAR ▶▶</button><button data-a="pause">II</button><button data-a="cam">CAM</button><button data-a="reset">↺</button></div>
    <div class="banner" id="h-flag"></div><div class="feed" id="h-feed"></div>
    <div class="lights" id="h-lights" style="display:none">${'<i></i>'.repeat(5)}</div>
    <canvas class="map" id="h-map" width="216" height="168"></canvas>
    <div class="note box" id="h-note"></div>
    <div class="dash box"><div class="bar"><i id="h-rpm"></i></div><div class="spd"><b id="h-spd">0</b><small>km/h</small></div><div class="gear" id="h-gear">N</div><div class="ers"><small>ERS</small><div class="bar"><i id="h-ers"></i></div></div></div>
    <div class="steer" id="t-steer"><span>◀</span><span>▶</span><div class="knob" id="t-knob"></div></div>
    <div class="side"><button class="tbtn" id="t-pit" data-a="pit">BOX</button><button class="tbtn" id="t-ers">ERS</button></div>
    <div class="pitpanel box" id="h-pit">${(['S', 'M', 'H', 'I', 'W'] as Compound[]).map((c) => `<button data-a="pittyre" data-v="${c}">${tyChip(c)}</button>`).join('')}</div>
    <div class="pedals"><button class="pedal brake" id="t-brake">FRENO</button><button class="pedal" id="t-gas">GAS</button></div>
  </div>`;
  bindTouch();
  mapPath = null;
}

let mapPath: { pts: number[]; sc: number; ox: number; oz: number } | null = null;
function drawMap(s: Sim) {
  const cv = $('h-map') as HTMLCanvasElement, g = cv.getContext('2d')!, t = s.track;
  if (!mapPath) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < t.n; i++) { x0 = Math.min(x0, t.px[i]); x1 = Math.max(x1, t.px[i]); z0 = Math.min(z0, t.pz[i]); z1 = Math.max(z1, t.pz[i]); }
    const sc = Math.min((cv.width - 16) / (x1 - x0), (cv.height - 16) / (z1 - z0));
    mapPath = { pts: [], sc, ox: 8 - x0 * sc + (cv.width - 16 - (x1 - x0) * sc) / 2, oz: 8 - z0 * sc + (cv.height - 16 - (z1 - z0) * sc) / 2 };
    for (let i = 0; i < t.n; i += 3) mapPath.pts.push(t.px[i] * sc + mapPath.ox, t.pz[i] * sc + mapPath.oz);
  }
  const m = mapPath, np = m.pts.length / 2;
  g.clearRect(0, 0, cv.width, cv.height);
  g.lineJoin = 'round';
  for (let sec = 0; sec < 3; sec++) {
    g.beginPath();
    for (let k = Math.floor((np * sec) / 3); k <= Math.floor((np * (sec + 1)) / 3); k++) g.lineTo(m.pts[(k % np) * 2], m.pts[(k % np) * 2 + 1]);
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.7)'; g.stroke();
    g.lineWidth = 3.5; g.strokeStyle = s.yellow[sec] || s.flag !== 'green' ? '#ffd500' : '#e8ecf2'; g.stroke();
  }
  for (const c of [...s.cars.filter((c) => !c.isPlayer), ...s.cars.filter((c) => c.isPlayer)]) {
    if (!c.active) continue;
    g.beginPath(); g.arc(c.x * m.sc + m.ox, c.z * m.sc + m.oz, c.isPlayer ? 6 : 4, 0, 7);
    g.fillStyle = c.isSC ? '#ffa000' : hex(TEAMS[c.team].c[0]); g.fill();
    g.lineWidth = c.isPlayer ? 2.5 : 1; g.strokeStyle = c.isPlayer ? '#fff' : '#000'; g.stroke();
  }
}

const GEARS = [0, 24, 36, 47, 57, 66, 75, 84, 110];
let hudT = 0, flagT = 0, msgI = 0, lastFlagKind = '';
function showFlag(text: string, kind: string, secs = 4) {
  const el = $('h-flag');
  el.textContent = text; el.className = `banner show ${kind}`; flagT = secs; lastFlagKind = kind;
}
function updateHud(s: Sim, dt: number) {
  const p = s.player!, t = s.track;
  let gear = 1; while (gear < 8 && p.speed > GEARS[gear]) gear++;
  const rpmF = Math.min(1, (p.speed - GEARS[gear - 1]) / (GEARS[gear] - GEARS[gear - 1]));
  audio.update(4500 + 7500 * rpmF, p.thr, p.slide, !paused && p.active);
  $('h-spd').textContent = String(Math.round(p.speed * 3.6));
  $('h-gear').textContent = p.speed < 0.5 ? 'N' : p.rev ? 'R' : String(gear);
  $('h-rpm').style.width = `${(30 + 70 * rpmF).toFixed(0)}%`;
  $('h-ers').style.width = `${(p.ers * 100).toFixed(0)}%`;
  // mensajes de dirección de carrera
  for (; msgI < s.msgs.length; msgI++) {
    const m = s.msgs[msgI], k = m.kind;
    if (k.startsWith('flag-') || ['sc', 'vsc', 'chequered', 'black', 'bw'].includes(k) || (m.player && k === 'pen')) showFlag(m.text.toUpperCase(), k.replace('flag-', '').replace('vsc', 'sc'), 5);
    if (!k.startsWith('flag-') || k === 'flag-yellow') {
      const d = document.createElement('div'); d.textContent = m.text; d.className = `${k === 'pen' ? 'pen' : ''} ${m.player ? 'mine' : ''}`;
      const f = $('h-feed'); f.appendChild(d); while (f.children.length > 3) f.firstChild!.remove();
      setTimeout(() => d.remove(), 6000);
    }
  }
  for (const f of s.fx) if (f.player) audio.bang(f.power);
  s.fx.length = 0;
  // banderas persistentes
  flagT -= dt;
  if (flagT <= 0) {
    const sec = Math.floor((3 * p.si) / t.n);
    if (s.flag === 'sc') showFlag(s.scIn ? 'SAFETY CAR — ENTRA ESTA VUELTA' : 'SAFETY CAR — PROHIBIDO ADELANTAR', 'sc', 0.5);
    else if (s.flag === 'vsc') showFlag(s.vscOver ? 'VSC — ¡REDUCE LA VELOCIDAD!' : 'VIRTUAL SAFETY CAR', s.vscOver ? 'pen' : 'sc', 0.5);
    else if (s.yellow[sec] && s.phase === 'race') showFlag('BANDERA AMARILLA — NO ADELANTES', 'yellow', 0.5);
    else if (s.playerBlue && !p.finished) showFlag('BANDERA AZUL — DEJA PASAR', 'blue', 0.5);
    else if (lastFlagKind) { $('h-flag').className = 'banner'; lastFlagKind = ''; }
  }
  $('h-skip').style.display = s.phase === 'formation' ? '' : 'none';
  const lights = $('h-lights');
  lights.style.display = s.phase === 'lights' ? 'flex' : 'none';
  if (s.phase === 'lights') [...lights.children].forEach((l, k) => l.classList.toggle('on', k < s.lights));
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.2;
  const race = s.race;
  $('h-ses').textContent = sesName(s.type).replace('Clasificación ', '').replace('Clasificación', 'Clasif.').toUpperCase();
  $('h-lap').textContent = race ? (s.phase === 'formation' ? 'FORMACIÓN' : `VUELTA ${Math.min(s.laps, Math.max(1, p.lap + 1))}/${s.laps}`) : fmtTime(Math.max(0, s.duration - s.time)).slice(0, -4);
  $('h-pos').textContent = String(p.pos);
  $('h-time').textContent = p.lapStart >= 0 && s.phase !== 'lights' && s.phase !== 'formation' ? fmtTime(s.time - p.lapStart).slice(0, -2) : '-:--.-';
  $('h-time').style.color = p.lapValid ? '' : '#ff5a4d';
  $('h-best').textContent = fmtTime(p.bestLap);
  $('h-last').textContent = fmtTime(p.lastLap);
  $('h-pen').textContent = [p.penSec ? `+${p.penSec} s` : '', p.penDT === 1 ? `DRIVE-THROUGH (${p.penLaps + 1} v)` : p.penDT === 2 ? `STOP-GO (${p.penLaps + 1} v)` : ''].filter(Boolean).join(' · ');
  const wearPct = Math.max(0, Math.round((1 - p.wear) * 100));
  $('h-tyre').innerHTML = `${tyChip(p.tyre)}<span class="${wearPct < 30 ? 'bad' : ''}">Neum. ${wearPct}%</span><span class="${p.damage > 0.3 ? 'bad' : ''}">Daños ${Math.round(p.damage * 100)}%</span>`;
  // torre de posiciones: cinco coches alrededor del jugador
  const ord = s.order, me = ord.indexOf(p), from = Math.max(0, Math.min(ord.length - 5, me - 2));
  $('h-rows').innerHTML = ord.slice(from, from + 5).map((c, k) => {
    const i = from + k, prev = ord[i - 1];
    let gap = '';
    if (c.out) gap = c.dsq ? 'DSQ' : 'OUT';
    else if (c.inPit) gap = 'BOX';
    else if (!race) gap = Number.isFinite(c.bestLap) ? (i === 0 ? fmtTime(c.bestLap) : `+${(c.bestLap - ord[0].bestLap).toFixed(3)}`) : '--';
    else if (i === 0) gap = 'Líder';
    else { const g = s.gap(c, prev); gap = g > t.lapTime * 0.95 ? `+${Math.floor(g / t.lapTime + 0.05)} v` : `+${Math.max(0, g).toFixed(1)}`; }
    return `<div class="r ${c === p ? 'me' : ''} ${c.out ? 'out' : ''}"><span>${i + 1}</span><i style="background:${hex(TEAMS[c.team].c[0])}"></i><b>${c.driver.tla}</b><span class="g">${gap}</span>${tyChip(c.tyre)}</div>`;
  }).join('');
  drawMap(s);
  // avisos
  const note = $('h-note');
  const txt = p.inPit ? (p.pit === 3 ? 'EN BOXES' : `CALLE DE BOXES · ${set.pitLimiter ? 'limitador' : 'máx. 80 km/h'}`) : p.auto ? 'ENTRANDO A BOXES' : s.phase === 'formation' ? 'VUELTA DE FORMACIÓN (automática)'
    : p.out ? `FUERA DE CARRERA — ${p.out}` : p.finished ? 'SESIÓN TERMINADA' : isSlick(p.tyre) && s.wet > 0.3 ? 'PISTA MOJADA: monta intermedios' : p.wear > 0.8 ? 'NEUMÁTICOS AGOTADOS' : '';
  note.textContent = txt; note.classList.toggle('show', !!txt);
  $('t-pit').classList.toggle('on', p.pit >= 1);
  $('h-pit').classList.toggle('show', p.pit === 1 || p.pit === 2);
  [...$('h-pit').children].forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.v === p.nextTyre));
}

// ------------------------------------------------------------------ controles
const inp = { steer: 0, target: 0, analog: false, gas: false, brake: false, ers: false, brakeT: 0, keys: new Set<string>() };
function bindTouch() {
  const hold = (id: string, f: (on: boolean) => void) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); f(true); audio.start(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { el.classList.remove('on'); f(false); });
  };
  hold('t-gas', (on) => (inp.gas = on)); hold('t-brake', (on) => (inp.brake = on)); hold('t-ers', (on) => (inp.ers = on));
  const st = $('t-steer');
  let x0 = 0, id = -1;
  const upd = (e: PointerEvent) => {
    const r = st.getBoundingClientRect();
    if (set.buttons) { inp.analog = false; inp.target = e.clientX < r.left + r.width / 2 ? -1 : 1; }
    else { inp.analog = true; inp.target = Math.max(-1, Math.min(1, (e.clientX - x0) / Math.min(110, r.width * 0.3))); }
    st.children[0].classList.toggle('on', inp.target < -0.15); st.children[1].classList.toggle('on', inp.target > 0.15);
  };
  st.addEventListener('pointerdown', (e) => { e.preventDefault(); st.setPointerCapture(e.pointerId); id = e.pointerId; x0 = e.clientX; upd(e); audio.start(); });
  st.addEventListener('pointermove', (e) => { if (e.pointerId === id) upd(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) st.addEventListener(ev, (e) => { if ((e as PointerEvent).pointerId !== id) return; id = -1; inp.target = 0; st.children[0].classList.remove('on'); st.children[1].classList.remove('on'); });
}
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  inp.keys.add(e.code); audio.start();
  if (!hudOn) return;
  if (e.code === 'KeyP') act('pit'); else if (e.code === 'KeyC') act('cam'); else if (e.code === 'KeyR') act('reset'); else if (e.code === 'Escape') act('pause');
});
addEventListener('keyup', (e) => inp.keys.delete(e.code));
addEventListener('blur', () => inp.keys.clear());

function applyInput(s: Sim, dt: number) {
  const p = s.player!, k = inp.keys, has = (...c: string[]) => c.some((x) => k.has(x));
  const kl = has('ArrowLeft', 'KeyA'), kr = has('ArrowRight', 'KeyD');
  let target = inp.target, analog = inp.analog;
  if (kl || kr) { target = (kr ? 1 : 0) - (kl ? 1 : 0); analog = false; }
  // con botones o teclado el volante gira progresivamente y más despacio a alta velocidad
  const rate = analog ? 9 : target === 0 ? 6 : 2.6 + 3 / (1 + p.speed / 25);
  inp.steer += Math.max(-rate * dt, Math.min(rate * dt, target - inp.steer));
  const knob = document.getElementById('t-knob'); if (knob) knob.style.transform = `translateX(${inp.steer * 180}%)`;
  const brake = inp.brake || has('ArrowDown', 'KeyS'), gas = inp.gas || has('ArrowUp', 'KeyW');
  inp.brakeT = brake && p.speed < 1.5 ? inp.brakeT + dt : 0;
  p.steer = inp.steer;
  p.brk = brake ? 1 : 0;
  p.rev = inp.brakeT > 0.5 && !gas;
  p.thr = gas || (set.autoThr && !brake && s.phase !== 'lights') ? 1 : 0;
  p.ersOn = inp.ers || has('Space');
}

// ------------------------------------------------------------------ acciones de la interfaz
const cycles: Record<string, number> = { laps: LAPS.length, format: FORMATS.length, difficulty: DIFFICULTY.length, weather: 3, damage: 3, quality: 3, gridPos: 22 };
function act(a: string, el?: HTMLElement) {
  const v = el?.dataset.v ?? '', k = el?.dataset.k ?? '', m = el?.dataset.m ?? '', S = set as unknown as Record<string, number | boolean>;
  audio.start();
  if (a === 'menu') { paused = false; menu(); }
  else if (a === 'setup') setup(v);
  else if (a === 'options') options(v || 'menu');
  else if (a === 'standings') standings();
  else if (a === 'newchamp') { champ = null; save(); menu(); }
  else if (a === 'pick') { S[k] = +v; save(); setup(m); }
  else if (a === 'cycle') {
    if (k === 'gridPos') set.gridPos = (set.gridPos % 22) + 1;
    else if (typeof S[k] === 'boolean') S[k] = !S[k];
    else S[k] = ((S[k] as number) + 1) % cycles[k];
    if (k === 'quality') view.setQuality(set.quality);
    view.showLine = set.line;
    save();
    if (m.startsWith('options')) options(m.split(':')[1]); else setup(m);
  }
  else if (a === 'go') startWeekend(v === 'champ');
  else if (a === 'tyre' && sim?.player) { wk!.tyre = sim.player.tyre = v as Compound; sim.player.used = v; preScreen(); }
  else if (a === 'drive') { hud(); msgI = 0; }
  else if (a === 'simulate') simulate();
  else if (a === 'next') nextSession();
  else if (a === 'pause' && sim && hudOn) {
    paused = true; hudOn = false;
    screen(`<h1>PAUSA</h1><div class="col"><button class="btn pri" data-a="resume">Reanudar</button><button class="btn" data-a="options" data-v="resume">Opciones</button><button class="btn" data-a="simulate">Simular el resto de la sesión</button><button class="btn" data-a="menu">Abandonar</button></div>`, 'glass');
  }
  else if (a === 'resume' && sim) { hud(); const s = sim; s.o.assists = { brake: set.brake, steer: set.steer, tc: set.tc, pitLimiter: set.pitLimiter }; }
  else if (a === 'skipform' && sim?.phase === 'formation') sim.fastForward(900, () => sim!.phase !== 'formation');
  else if (a === 'cam') view.camMode = (view.camMode + 1) % 3;
  else if (a === 'reset' && sim?.player && !sim.player.inPit && sim.phase !== 'lights' && sim.phase !== 'formation') sim.respawn(sim.player);
  else if (a === 'pit' && sim?.player) sim.requestPit(sim.player, sim.player.pit !== 1);
  else if (a === 'pittyre' && sim?.player) sim.player.nextTyre = v as Compound;
}
ui.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null; if (el) act(el.dataset.a!, el); });
addEventListener('resize', () => view.resize());
addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ bucle principal
let last = performance.now(), endT = 0, fps = 60, slowT = 0;
function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const s = sim;
  if (!s) return;
  if (hudOn && !paused && s.player) {
    applyInput(s, dt);
    s.update(dt);
    updateHud(s, dt);
    // fin de la sesión para el jugador: se simula lo que quede y se muestran los resultados
    endT = s.playerDone ? endT + dt : 0;
    if (endT > 3.5) { endT = 0; return simulate(); }
    // resolución dinámica: si el móvil no llega a 40 fps, baja la resolución de render
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;
    slowT = fps < 40 ? slowT + dt : 0;
    if (slowT > 3 && view.scale > 0.55) { view.scale -= 0.12; view.resize(); slowT = 0; }
  }
  const target: Car = s.player ?? s.order[0] ?? s.cars[0];
  if (show3d && viewSim === s) view.frame(s, paused || !hudOn ? 0 : dt, target);
}
view.showLine = set.line;
menu();
requestAnimationFrame(loop);
// acceso para pruebas automáticas
(window as unknown as Record<string, unknown>).__apex = { get sim() { return sim; }, view, set, act };
