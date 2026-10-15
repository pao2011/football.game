// Prueba de extremo a extremo del modo ONLINE: arranca el servidor real (server/index.mjs, que también
// sirve el juego) y dos navegadores independientes que juegan entre sí: sala privada con código,
// sincronización anfitrión → invitado, mandos del invitado, cambios, mensajes rápidos, Division Rivals
// (resultado y puntos) y abandono.
// Uso: npm run build && node scripts/e2e-online.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OUT = resolve(process.env.OUT ?? 'test-results');
await mkdir(OUT, { recursive: true });
const PORT = 18000 + Math.floor(Math.random() * 2000);
const dataDir = await mkdtemp(join(tmpdir(), 'fe3d-online-'));
const srv = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });
for (let i = 0; i < 50 && !srvLog.includes('Servidor online'); i++) await new Promise((r) => setTimeout(r, 100));
if (!srvLog.includes('Servidor online')) {
  console.log(srvLog);
  throw new Error('El servidor no arrancó');
}

const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function newPlayer(name) {
  // contextos separados = almacenamiento separado = jugadores distintos
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.addInitScript((n) => {
    if (!localStorage.getItem('football-elite-3d:settings')) {
      localStorage.setItem('football-elite-3d:settings', JSON.stringify({ quality: 'low', shadows: false, resolutionScale: 0.5, antialias: false, halfMinutes: 2, onlineName: n, replays: false }));
    }
  }, name);
  await page.goto(`http://localhost:${PORT}/`);
  return page;
}

const results = [];
let A;
let B;
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✔ ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`✘ ${name}: ${e.message ?? e}`);
    await A?.screenshot({ path: join(OUT, `online-fail-${results.length}-A.png`) }).catch(() => {});
    await B?.screenshot({ path: join(OUT, `online-fail-${results.length}-B.png`) }).catch(() => {});
  }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const waitFor = async (page, fn, ms = 30000, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, arg).catch(() => false)) return;
    await page.waitForTimeout(200);
  }
  throw new Error('tiempo de espera agotado: ' + fn.toString().slice(0, 90));
};

async function toOnlineHub(page) {
  await page.waitForSelector('.title-screen');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.main-menu');
  await page.click('[data-act=online]');
  await page.waitForSelector('#on-name');
  await page.click('.screen-footer [data-act=connect]');
  await page.waitForSelector('[data-act=rivals]', { timeout: 20000 });
}

A = await newPlayer('Ana');
B = await newPlayer('Beto');

await check('Los dos jugadores se conectan al servidor online', async () => {
  await toOnlineHub(A);
  await toOnlineHub(B);
  const h = await A.textContent('.screen-header h2');
  assert(h.includes('Ana'), `saludo: ${h}`);
  assert((await B.textContent('.div-card')).includes('División 10'), 'división inicial');
});

await check('Sala privada: Ana crea, Beto se une con el código y empieza el partido (los dos con el mismo club)', async () => {
  await A.click('[data-act=create]');
  await waitFor(A, () => /^[A-Z0-9]{5}$/.test(document.querySelector('.room-code')?.textContent ?? ''));
  const code = await A.textContent('.room-code');
  await B.click('[data-act=join]');
  await B.waitForSelector('#on-code');
  await B.fill('#on-code', code);
  await B.keyboard.press('Enter');
  await waitFor(A, () => !!window.__runner && window.__runner.online?.role === 'host', 40000);
  await waitFor(B, () => !!window.__runner && window.__runner.online?.role === 'guest', 40000);
  const teams = await A.evaluate(() => window.__runner.match.teams.map((t) => t.data.id));
  const teamsB = await B.evaluate(() => window.__runner.match.teams.map((t) => t.data.id));
  assert(teams.join() === teamsB.join(), `mismos equipos: ${teams} / ${teamsB}`);
});

await check('El invitado recibe y dibuja el partido del anfitrión', async () => {
  // saltar presentaciones
  for (const p of [A, B]) await p.evaluate(() => window.__runner.skipIntro());
  await waitFor(B, () => window.__runner.guestSync.received > 40, 40000);
  const sync = await B.evaluate(() => {
    const m = window.__runner.match;
    return { ids: m.playersAll.length, phase: m.phase, t: m.time };
  });
  assert(sync.ids === 22 && sync.t > 0, JSON.stringify(sync));
  // los 22 jugadores y el árbitro se ven en los dos lados (antes, con el mismo club, solo 11)
  for (const [n, pg] of [['anfitrión', A], ['invitado', B]]) {
    const vis = await pg.evaluate(() => [...window.__runner.view.models.values()].filter((x) => x.root.visible).length);
    assert(vis === 23, `${n}: ${vis} jugadores visibles de 23`);
  }
  await B.screenshot({ path: join(OUT, 'online-guest.png') });
  await A.screenshot({ path: join(OUT, 'online-host.png') });
});

await check('Los mandos del invitado llegan al anfitrión (controla al equipo visitante)', async () => {
  await B.keyboard.down('ArrowLeft');
  await waitFor(A, () => window.__runner.remoteInput.heldSet().has('left'), 15000);
  await B.keyboard.up('ArrowLeft');
  await waitFor(A, () => !window.__runner.remoteInput.heldSet().has('left'), 15000);
  const human = await A.evaluate(() => window.__runner.match.teams.map((t) => t.human));
  assert(human[0] && human[1], 'los dos equipos son humanos en el anfitrión');
});

await check('Cambio pedido por el invitado: lo hace el anfitrión y se ve en los dos', async () => {
  const sub = await B.evaluate(() => {
    const r = window.__runner;
    const t = r.match.teams[1];
    const out = t.players[8].id;
    const inn = t.bench[0].id;
    return { err: r.requestSub(out, inn), out, inn };
  });
  assert(sub.err === null, sub.err);
  await waitFor(A, (s) => window.__runner.match.pendingSubs.some((p) => p.team === 1 && p.inId === s.inn), 10000, sub);
  // forzar la interrupción del juego (en un partido real, el siguiente saque/falta)
  await A.evaluate(() => window.__runner.match.applyPendingSubs());
  await waitFor(A, (s) => window.__runner.match.teams[1].players.some((p) => p.id === s.inn), 5000, sub);
  await waitFor(B, (s) => window.__runner.match.playersAll.some((p) => p.id === s.inn) && !window.__runner.match.playersAll.some((p) => p.id === s.out), 10000, sub);
});

await check('Mensajes rápidos: el anfitrión recibe el del invitado', async () => {
  await B.evaluate(() => window.__runner.sendChat('¡Buen partido!'));
  await waitFor(A, () => (document.querySelector('.lower-third')?.textContent ?? '').includes('Buen partido'), 10000);
});

await check('Pausa compartida: si uno pausa, el partido se detiene para los dos', async () => {
  const t0 = await A.evaluate(() => window.__runner.match.time);
  await B.keyboard.press('Escape');
  await B.waitForSelector('.overlay [data-act=resume]');
  assert((await B.textContent('.online-pause-note')).includes('pausado para los dos'), 'aviso de pausa');
  await A.waitForSelector('.remote-pause', { timeout: 10000 });
  assert((await A.textContent('.remote-pause')).includes('Beto'), 'nombre de quien pausó');
  await A.waitForTimeout(1500);
  const t1 = await A.evaluate(() => window.__runner.match.time);
  await A.waitForTimeout(1500);
  const t2 = await A.evaluate(() => window.__runner.match.time);
  assert(t2 === t1, `el partido sigue en el anfitrión: ${t1} → ${t2}`);
  await B.click('.overlay [data-act=resume]');
  await A.waitForSelector('.remote-pause', { state: 'detached', timeout: 10000 });
  await waitFor(A, (t) => window.__runner.match.time > t + 0.5, 15000, t2);
  await waitFor(B, (t) => window.__runner.match.time > t + 0.3, 15000, await B.evaluate(() => window.__runner.match.time));
  assert(t1 >= t0, 'tiempo');
  // el anfitrión también puede pausar
  await A.keyboard.press('Escape');
  await B.waitForSelector('.remote-pause', { timeout: 10000 });
  await A.click('.overlay [data-act=resume]');
  await B.waitForSelector('.remote-pause', { state: 'detached', timeout: 10000 });
  const left = await B.evaluate(() => window.__runner.pausesLeft);
  assert(left === 2, `pausas restantes: ${left}`);
});

await check('Final del amistoso: los dos ven el resultado', async () => {
  await A.evaluate(() => {
    const m = window.__runner.match;
    m.half = 2;
    m.matchSeconds = 90 * 60 + 30;
    m.announcedAdded = 0;
    m.endHalf(); // (puede estar esperando el saque inicial de un humano)
  });
  await A.waitForSelector('.result-score', { timeout: 60000 });
  await B.waitForSelector('.result-score', { timeout: 60000 });
  const [sa, sb] = [await A.textContent('.result-score .big'), await B.textContent('.result-score .big')];
  assert(sa.trim() === sb.trim(), `mismo marcador: ${sa} / ${sb}`);
  await A.click('[data-act=cont]');
  await B.click('[data-act=cont]');
  await A.waitForSelector('[data-act=rivals]');
  await B.waitForSelector('[data-act=rivals]');
});

await check('Division Rivals: emparejamiento, resultado y puntos para los dos', async () => {
  await A.click('[data-act=rivals]');
  await B.click('[data-act=rivals]');
  await waitFor(A, () => !!window.__runner?.online && !window.__runner.match.finished && !window.__runner.disposedFlag, 40000);
  await waitFor(B, () => !!window.__runner?.online && !window.__runner.match.finished && !window.__runner.disposedFlag, 40000);
  for (const p of [A, B]) await p.evaluate(() => window.__runner.skipIntro());
  await waitFor(B, () => window.__runner.guestSync?.received > 10 || window.__runner.remoteInput, 30000);
  const hostPage = (await A.evaluate(() => window.__runner.online.role)) === 'host' ? A : B;
  await hostPage.evaluate(() => {
    const m = window.__runner.match;
    m.teams[0].stats.goals = 2; // el local gana 2-0
    m.half = 2;
    m.matchSeconds = 90 * 60 + 30;
    m.announcedAdded = 0;
    m.endHalf(); // (puede estar esperando el saque inicial de un humano)
  });
  await A.waitForSelector('.rv-delta', { timeout: 60000 });
  await B.waitForSelector('.rv-delta', { timeout: 60000 });
  const da = await A.textContent('.rv-delta');
  const db = await B.textContent('.rv-delta');
  const homeIsA = hostPage === A;
  const [win, lose] = homeIsA ? [da, db] : [db, da];
  assert(/^\+3[05]/.test(win.trim()), `ganador: ${win}`);
  assert(/^(\+0 |-)/.test(lose.trim()), `perdedor: ${lose}`);
  await A.click('[data-act=cont]');
  await B.click('[data-act=cont]');
  await A.waitForSelector('[data-act=rivals]');
  await B.waitForSelector('[data-act=rivals]');
});

await check('Abandonar un partido de Rivals: el rival gana 3-0', async () => {
  await A.click('[data-act=rivals]');
  await B.click('[data-act=rivals]');
  await waitFor(A, () => !!window.__runner?.online && !window.__runner.match.finished && !window.__runner.disposedFlag, 40000);
  await waitFor(B, () => !!window.__runner?.online && !window.__runner.match.finished && !window.__runner.disposedFlag, 40000);
  for (const p of [A, B]) await p.evaluate(() => window.__runner.skipIntro());
  await B.waitForTimeout(1500);
  // Beto abandona desde el menú de pausa
  await B.keyboard.press('Escape');
  await B.waitForSelector('.overlay [data-act=quit]');
  await B.click('.overlay [data-act=quit]');
  await A.waitForSelector('.rv-delta', { timeout: 30000 });
  const d = await A.textContent('.rv-delta');
  assert(d.trim().startsWith('+'), `puntos del que se queda: ${d}`);
  await B.waitForSelector('[data-act=rivals]');
});

await check('Clasificación de Division Rivals', async () => {
  await A.click('[data-act=ok]');
  await A.waitForSelector('[data-act=board]');
  await A.click('[data-act=board]');
  await A.waitForSelector('.board');
  const t = await A.textContent('.board');
  assert(t.includes('Ana') && t.includes('Beto'), t);
});

await check('Sin errores de JavaScript', async () => {
  assert(errors.length === 0, errors.join(' | '));
});

await browser.close();
srv.kill();
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} pruebas online superadas`);
process.exit(ok === results.length ? 0 : 1);
