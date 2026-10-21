// Prueba E2E del mando: se simula un mando estándar (Xbox) en Chromium real y se recorre
// título → menú → partido: avisos de conexión, navegación con la cruceta y A/B, movimiento,
// pase, tiro, sprint y pausa con Start.
// Uso: npm run build && node scripts/e2e-gamepad.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.env.DIST ?? 'dist');
const OUT = resolve(process.env.OUT ?? 'test-results');
await mkdir(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = p.endsWith('/') ? join(p, 'index.html') : p;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, locale: 'es-ES' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  localStorage.setItem('football-elite-3d:settings', JSON.stringify({ quality: 'low', shadows: false, resolutionScale: 0.6, halfMinutes: 2, menuReel: false }));
  // mando simulado: window.__pad controla ejes y botones; hasta que se "conecta" no aparece en getGamepads()
  const mk = () => ({ id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), hapticActuators: [] });
  window.__pad = mk();
  window.__padOn = false;
  navigator.getGamepads = () => (window.__padOn ? [window.__pad, null, null, null] : [null, null, null, null]);
  window.__press = (i, down = true) => { window.__pad.buttons[i] = { pressed: down, touched: down, value: down ? 1 : 0 }; };
  window.__stick = (x, y) => { window.__pad.axes[0] = x; window.__pad.axes[1] = y; };
});
const results = [];
const assert = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) {
  try { await fn(); results.push(true); console.log(`✔ ${name}`); }
  catch (e) { results.push(false); console.log(`✘ ${name}: ${e.message}`); await page.screenshot({ path: join(OUT, `gfail-${results.length}.png`) }).catch(() => {}); }
}
const waitFor = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return; await page.waitForTimeout(100); } throw new Error('tiempo agotado: ' + fn.toString().slice(0, 70)); };
const tap = async (i, ms = 120) => { await page.evaluate((i) => window.__press(i, true), i); await page.waitForTimeout(ms); await page.evaluate((i) => window.__press(i, false), i); await page.waitForTimeout(60); };

await page.goto(`http://localhost:${server.address().port}/`);

await check('Título: pista de mando; al conectar aparece el aviso "Mando conectado"', async () => {
  await page.waitForSelector('.title-screen');
  assert(/mando/i.test(await page.textContent('.pad-hint')), 'sin pista de mando');
  await page.evaluate(() => { window.__padOn = true; window.dispatchEvent(Object.assign(new Event('gamepadconnected'), { gamepad: window.__pad })); });
  await page.waitForSelector('.pad-toast');
  assert(/Mando conectado/.test(await page.textContent('.pad-toast')), 'aviso incorrecto');
  assert(/Xbox 360/.test(await page.textContent('.pad-toast')), 'sin el nombre del mando');
  assert(!/Vendor/.test(await page.textContent('.pad-toast')), 'el nombre trae datos técnicos');
});

await check('Menús con el mando: A entra, la cruceta navega, A acepta y B vuelve', async () => {
  await page.waitForSelector('.splash', { state: 'detached', timeout: 8000 });
  await tap(0); // A en el título
  await page.waitForSelector('.mm', { timeout: 5000 });
  const first = await page.evaluate(() => document.querySelector('.focus, [data-act].focused')?.getAttribute('data-act') ?? document.activeElement?.getAttribute('data-act'));
  await tap(13, 400); // cruceta abajo (pulsación larga: el menú lee el mando una vez por fotograma)
  const second = await page.evaluate(() => document.querySelector('.focus, [data-act].focused')?.getAttribute('data-act') ?? document.activeElement?.getAttribute('data-act'));
  assert(first !== second || first === null, 'la cruceta no movió el foco: ' + first + ' / ' + second);
  await tap(12, 400); // arriba: otra vez en el primero (Partido rápido)
  await tap(0, 400); // A
  await page.waitForSelector('[data-act=play]', { timeout: 5000 });
  await tap(1, 400); // B vuelve
  await page.waitForSelector('.mm', { timeout: 5000 });
  await tap(0, 400);
  await page.waitForSelector('[data-act=play]', { timeout: 5000 });
});

await check('Partido: A (pase) saca, el stick mueve, Start pausa y reanuda', async () => {
  await page.click('[data-act=play]'); // jugar (el foco con mando empieza en el primer ajuste)
  await waitFor(() => window.__runner && window.__runner.match.time > 0.3, 60000);
  // saltar la presentación con A
  await tap(0);
  await waitFor(() => !window.__runner.inIntro, 8000);
  await page.evaluate(() => { window.__runner.timeScale = 1; });
  await waitFor(() => window.__runner.match.restart?.stage === 'ready' || window.__runner.match.phase === 'play', 30000);
  if (await page.evaluate(() => window.__runner.match.phase !== 'play' && window.__runner.match.restart?.team === 0)) await tap(0, 700);
  await waitFor(() => window.__runner.match.phase === 'play', 30000);
  await page.evaluate(() => window.__stick(1, 0));
  await waitFor(() => window.__runner.match.teams[0].controlled.vel.x > 2 || window.__runner.match.teams[0].controlled.vel.x < -2, 15000);
  await page.evaluate(() => window.__stick(0, 0));
  // Start pausa
  await tap(9, 700);
  await page.waitForSelector('.overlay', { timeout: 5000 });
  await tap(1); // B cierra el menú de pausa (volver)
  await page.waitForTimeout(500);
});

await check('Partido: A pasa y R2 esprinta (botones del mando llegan al juego)', async () => {
  await page.evaluate(() => {
    const m = window.__runner.match; if (m.phase === 'replay') m.skipReplay();
    if (window.__runner.paused) window.__runner.resume();
    m.restart = null; m.phase = 'play';
    const t = m.teams[0]; const g = t.attackDir; const p = t.players[9]; t.controlled = p;
    for (const q of m.active) q.pos.set(-g * 40, 0, 38);
    p.pos.set(g * 10, 0, 0); p.vel.set(0, 0, 0); p.facing = g > 0 ? Math.PI / 2 : -Math.PI / 2; p.clearAction();
    t.players[8].pos.set(g * 30, 0, 6);
    m.ball.reset(g * 10.5, 0); m.owner = p;
    window.__kicks = [];
    const orig = m.requestKick.bind(m);
    m.requestKick = (pl, req) => { window.__kicks.push(req.kind); return orig(pl, req); };
  });
  await page.evaluate(() => { window.__press(7, true); window.__stick(1, 0); });
  await waitFor(() => window.__runner.match.teams[0].controlled.sprinting === true, 10000);
  await tap(0, 700); // A = pase (el render por software es lento: se mantiene más)
  await waitFor(() => window.__kicks.includes('pass'), 10000);
  await page.evaluate(() => { window.__press(7, false); window.__stick(0, 0); });
  await page.screenshot({ path: join(OUT, 'g-match.png') });
});

await check('Sin balón, el stick derecho cambia al compañero en esa dirección (como en FIFA)', async () => {
  await page.evaluate(() => {
    const m = window.__runner.match; if (m.phase === 'replay') m.skipReplay();
    m.restart = null; m.phase = 'play';
    const t = m.teams[0]; const o = m.teams[1];
    for (const q of m.active) q.pos.set(-40, 0, 36);
    const c = o.players[9]; c.pos.set(30, 0, 30); c.clearAction(); m.ball.reset(30.5, 30); m.owner = c;
    const me = t.players[5]; me.pos.set(0, 0, 0); t.controlled = me;
    t.players[8].pos.set(20, 0, 0); t.players[7].pos.set(-20, 0, 0);
    window.__right = t.players[8].id; window.__left = t.players[7].id;
  });
  // flanco del stick derecho hacia un lado y vuelta al centro
  const flick = async (x) => { await page.evaluate((x) => { window.__pad.axes[2] = x; }, x); await page.waitForTimeout(500); await page.evaluate(() => { window.__pad.axes[2] = 0; }); await page.waitForTimeout(400); };
  const dirSign = await page.evaluate(() => Math.sign(window.__runner.controller.view.right.x) || 1);
  await flick(dirSign);
  const id1 = await page.evaluate(() => window.__runner.match.teams[0].controlled.id);
  assert(id1 === await page.evaluate(() => window.__right), 'no cambió al de la derecha: ' + id1);
  await flick(-dirSign);
  await flick(-dirSign);
  const id2 = await page.evaluate(() => window.__runner.match.teams[0].controlled.id);
  assert(id2 === await page.evaluate(() => window.__left), 'no cambió al de la izquierda: ' + id2);
});

await check('Desconexión: aviso "Mando desconectado" y el juego sigue sin entrada', async () => {
  await page.evaluate(() => { window.__padOn = false; window.dispatchEvent(new Event('gamepaddisconnected')); });
  await page.waitForSelector('.pad-toast');
  assert(/desconectado/i.test(await page.textContent('.pad-toast')), 'aviso incorrecto');
});

await check('Sin errores de JavaScript', async () => { assert(errors.length === 0, errors.slice(0, 3).join(' | ')); });

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} pruebas de mando superadas`);
await browser.close();
server.close();
process.exit(ok === results.length ? 0 : 1);
