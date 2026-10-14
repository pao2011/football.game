// Prueba E2E de la versión móvil: emulación de teléfono táctil (horizontal y vertical),
// controles táctiles, pantalla de partido y modo sin conexión (PWA).
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve('dist');
const OUT = resolve(process.env.OUT ?? 'test-results');
await mkdir(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const results = [];
const assert = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) {
  try { await fn(); results.push(true); console.log(`✔ ${name}`); }
  catch (e) { results.push(false); console.log(`✘ ${name}: ${e.message}`); await page.screenshot({ path: join(OUT, `mfail-${results.length}.png`) }).catch(() => {}); }
}
const waitFor = async (fn, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn).catch(() => false)) return; await page.waitForTimeout(200); } throw new Error('tiempo agotado'); };
const center = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

await page.goto(url);

await check('Título táctil y valores por defecto para móvil (calidad baja, sin sombras)', async () => {
  await page.waitForSelector('.title-screen');
  const txt = await page.textContent('.title-screen');
  assert(/TOCA PARA EMPEZAR/.test(txt), 'texto táctil ausente');
  const s = await page.evaluate(() => window.__app.settings);
  assert(s.quality === 'low' && s.shadows === false, 'sin valores móviles: ' + JSON.stringify([s.quality, s.shadows]));
  await page.screenshot({ path: join(OUT, 'm-title.png') });
});

await check('Menús navegables con toques', async () => {
  await page.tap('[data-act=go]');
  await page.waitForSelector('.main-menu');
  await page.screenshot({ path: join(OUT, 'm-menu.png') });
  await page.tap('[data-act=quick]');
  await page.waitForSelector('[data-act=play]');
  await page.screenshot({ path: join(OUT, 'm-quick.png') });
  await page.tap('[data-act=play]');
  await waitFor(() => window.__runner && window.__runner.match.time > 0.3);
});

await check('Controles táctiles visibles durante el partido', async () => {
  await page.waitForSelector('.touch-controls .tb-shoot', { state: 'visible' });
  assert(await page.evaluate(() => document.body.classList.contains('touch')), 'clase touch ausente');
  await page.screenshot({ path: join(OUT, 'm-match.png') });
});

await check('Botón PASE realiza el saque inicial / el joystick mueve al jugador', async () => {
  await page.evaluate(() => { window.__runner.timeScale = 3; });
  await waitFor(() => { const m = window.__runner.match; return m.phase === 'play' || m.restart?.stage === 'ready'; });
  const mine = await page.evaluate(() => { const m = window.__runner.match; return m.phase !== 'play' && m.restart?.team === 0; });
  if (mine) {
    const c = await center('.tb-pass');
    await page.touchscreen.tap(c.x, c.y);
  }
  await waitFor(() => window.__runner.match.phase === 'play', 30000);
  const before = await page.evaluate(() => { const p = window.__runner.match.teams[0].controlled; return { id: p.id, x: p.pos.x, z: p.pos.z }; });
  // arrastre del joystick hacia la derecha (eventos de puntero)
  await page.mouse.move(150, 260);
  await page.mouse.down();
  await page.mouse.move(215, 260, { steps: 4 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, 'm-joystick.png') });
  await page.mouse.up();
  const after = await page.evaluate((id) => { const p = window.__runner.match.playersAll.find((q) => q.id === id); return { x: p.pos.x, z: p.pos.z }; }, before.id);
  assert(Math.hypot(after.x - before.x, after.z - before.z) > 1.5, 'el jugador no se movió con el joystick');
});

await check('Botón TIRO carga la potencia y dispara', async () => {
  await page.evaluate(() => {
    const m = window.__runner.match; m.phase = 'play';
    const t = m.teams[0]; const p = t.players[9]; t.controlled = p; const g = t.attackDir;
    for (const q of m.teams[1].active) if (!q.isGK) q.pos.set(-g * 20, 0, q.pos.z);
    p.pos.set(g * 34, 0, 0); p.vel.set(0, 0, 0); p.facing = g > 0 ? Math.PI / 2 : -Math.PI / 2;
    m.ball.pos.set(g * 34.5, 0.11, 0); m.ball.vel.set(0, 0, 0); m.owner = p; window.__s0 = t.stats.shots;
  });
  const c = await center('.tb-shoot');
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, clientX: x, clientY: y, pointerType: 'touch' }));
  }, c);
  await page.waitForTimeout(1200);
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true, clientX: x, clientY: y, pointerType: 'touch' })), c);
  await waitFor(() => window.__runner.match.teams[0].stats.shots > window.__s0, 15000);
});

await check('Botón de pausa táctil y salir al menú', async () => {
  const c = await center('.tc-pause');
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForSelector('.overlay [data-act=quit]', { timeout: 20000 });
  await page.screenshot({ path: join(OUT, 'm-pause.png') });
  await page.tap('[data-act=quit]');
  await page.waitForSelector('.main-menu');
  assert(!(await page.evaluate(() => document.querySelector('.touch-controls'))), 'controles táctiles no eliminados');
});

await check('Aviso para girar el dispositivo en vertical', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert(await page.isVisible('.rotate-hint'), 'aviso no visible');
  await page.screenshot({ path: join(OUT, 'm-portrait.png') });
  await page.setViewportSize({ width: 844, height: 390 });
});

await check('PWA: manifiesto y service worker registrados; carga sin conexión', async () => {
  const man = await page.evaluate(() => fetch('./manifest.webmanifest').then((r) => r.json()));
  assert(man.display === 'fullscreen' && man.icons.length === 2, 'manifiesto incorrecto');
  await waitFor(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true), 20000);
  await page.reload();
  await page.waitForSelector('.title-screen');
  await waitFor(() => !!navigator.serviceWorker.controller, 20000);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.title-screen', { timeout: 20000 });
  await ctx.setOffline(false);
});

await check('Sin errores de JavaScript', async () => { assert(errors.length === 0, errors.slice(0, 4).join(' | ')); });

await browser.close();
server.close();
const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} pruebas móviles superadas`);
process.exit(ok === results.length ? 0 : 1);
