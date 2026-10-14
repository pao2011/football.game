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
});

await check('Presentación del partido (escudos, estadio) y se salta con un toque', async () => {
  await page.waitForSelector('.match-intro .mi-team', { state: 'visible', timeout: 60000 });
  const txt = await page.textContent('.match-intro');
  assert(/VS/.test(txt) && /espectadores/.test(txt), 'presentación incompleta');
  assert(await page.evaluate(() => window.__runner.match.time === 0), 'el partido avanzó durante la presentación');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'm-intro.png') });
  if (await page.$('.match-intro')) await page.touchscreen.tap(420, 200);
  await page.waitForSelector('.match-intro', { state: 'detached', timeout: 5000 });
  await waitFor(() => window.__runner && window.__runner.match.time > 0.3);
});

await check('Controles táctiles visibles durante el partido', async () => {
  await page.waitForSelector('.touch-controls .tb-a1', { state: 'visible' });
  assert(await page.evaluate(() => document.body.classList.contains('touch')), 'clase touch ausente');
  await page.screenshot({ path: join(OUT, 'm-match.png') });
});

await check('Botón PASE realiza el saque inicial / el joystick mueve al jugador', async () => {
  await page.evaluate(() => { window.__runner.timeScale = 3; });
  await waitFor(() => { const m = window.__runner.match; return m.phase === 'play' || m.restart?.stage === 'ready'; });
  const mine = await page.evaluate(() => { const m = window.__runner.match; return m.phase !== 'play' && m.restart?.team === 0; });
  if (mine) {
    const c = await center('.tb-a2');
    await page.touchscreen.tap(c.x, c.y);
  }
  await waitFor(() => window.__runner.match.phase === 'play', 30000);
  const before = await page.evaluate(() => { const p = window.__runner.match.teams[0].controlled; return { id: p.id, x: p.pos.x, z: p.pos.z }; });
  // arrastre del joystick hacia la derecha (eventos de puntero)
  await page.mouse.move(150, 260);
  await page.mouse.down();
  await page.mouse.move(215, 260, { steps: 4 });
  // con el joystick a la derecha, el jugador controlado (sea cual sea) corre hacia la derecha de la pantalla (+x)
  await waitFor(() => { const p = window.__runner.match.teams[0].controlled; return p.vel.x > 2; }, 20000);
  await page.screenshot({ path: join(OUT, 'm-joystick.png') });
  await page.mouse.up();
  void before;
});

await check('Botón TIRO carga la potencia y dispara', async () => {
  await page.evaluate(() => {
    const m = window.__runner.match; m.phase = 'play';
    const t = m.teams[0]; const p = t.players[9]; t.controlled = p; const g = t.attackDir;
    for (const q of m.teams[1].active) if (!q.isGK) q.pos.set(-g * 20, 0, q.pos.z);
    p.pos.set(g * 34, 0, 0); p.vel.set(0, 0, 0); p.facing = g > 0 ? Math.PI / 2 : -Math.PI / 2;
    m.ball.pos.set(g * 34.5, 0.11, 0); m.ball.vel.set(0, 0, 0); m.owner = p; window.__s0 = t.stats.shots;
  });
  const c = await center('.tb-a1');
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, bubbles: true, clientX: x, clientY: y, pointerType: 'touch' }));
  }, c);
  await page.waitForTimeout(1200);
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true, clientX: x, clientY: y, pointerType: 'touch' })), c);
  await waitFor(() => window.__runner.match.teams[0].stats.shots > window.__s0, 15000);
});

await check('Deslizar sobre TIRO hacia arriba = vaselina', async () => {
  await page.evaluate(() => {
    const m = window.__runner.match; m.phase = 'play';
    const t = m.teams[0]; const p = t.players[9]; t.controlled = p; const g = t.attackDir;
    for (const q of m.teams[1].active) if (!q.isGK) q.pos.set(-g * 20, 0, q.pos.z);
    p.pos.set(g * 34, 0, 0); p.vel.set(0, 0, 0); p.facing = g > 0 ? Math.PI / 2 : -Math.PI / 2; p.clearAction();
    m.ball.pos.set(g * 34.5, 0.11, 0); m.ball.vel.set(0, 0, 0); m.owner = p; window.__chip = null;
    const orig = m.requestKick.bind(m);
    m.requestKick = (pl, req) => { if (req.kind === 'chip') window.__chip = true; return orig(pl, req); };
  });
  const c = await center('.tb-a1');
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true, clientX: x, clientY: y, pointerType: 'touch' }));
  }, c);
  await page.waitForTimeout(700);
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, bubbles: true, clientX: x, clientY: y - 60, pointerType: 'touch' }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true, clientX: x, clientY: y - 60, pointerType: 'touch' }));
  }, c);
  await waitFor(() => window.__chip === true, 15000);
});

await check('Deslizar en la zona de regates = regate (con su nombre en pantalla)', async () => {
  await page.evaluate(() => {
    const m = window.__runner.match; m.phase = 'play';
    const t = m.teams[0]; const p = t.players[9]; t.controlled = p; const g = t.attackDir;
    p.pos.set(0, 0, 5); p.vel.set(0, 0, 0); p.facing = g > 0 ? Math.PI / 2 : -Math.PI / 2; p.clearAction();
    m.ball.pos.set(0.5 * g, 0.11, 5); m.ball.vel.set(0, 0, 0); m.owner = p;
  });
  // deslizamiento horizontal en la zona libre de la derecha (encima de los botones)
  await page.evaluate(() => {
    const el = document.querySelector('.tc-skill-zone');
    const r = el.getBoundingClientRect();
    const x = r.left + 60, y = r.top + 40;
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, bubbles: true, clientX: x, clientY: y, pointerType: 'touch' }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, bubbles: true, clientX: x + 80, clientY: y, pointerType: 'touch' }));
  });
  await waitFor(() => { const p = window.__runner.match.teams[0].players[9]; return p.action.kind === 'skill' || p.anim.state === 'skill'; }, 15000);
  await page.screenshot({ path: join(OUT, 'm-skill.png') });
});

await check('En defensa aparecen botones propios (ROBAR, PRESIONAR, CAMBIAR…) e indicador DEFENSA', async () => {
  await page.evaluate(() => {
    const m = window.__runner.match; m.phase = 'play';
    const opp = m.teams[1].players[9];
    opp.pos.set(0, 0, 0); m.ball.pos.set(0.5, 0.11, 0); m.ball.vel.set(0, 0, 0); m.owner = opp;
  });
  await page.waitForSelector('.touch-controls.mode-defense', { timeout: 15000 });
  const txt = await page.textContent('.tc-defense');
  assert(/ROBAR/.test(txt) && /PRESIONAR/.test(txt) && /CAMBIAR/.test(txt) && /BARRIDA/.test(txt), 'faltan botones de defensa: ' + txt);
  assert(await page.isVisible('.tc-mode .d'), 'sin indicador DEFENSA');
  await page.screenshot({ path: join(OUT, 'm-defense.png') });
  // pulsar CAMBIAR cambia el jugador controlado
  const before = await page.evaluate(() => (window.__before = window.__runner.match.teams[0].controlled.id));
  const c = await center('.tb-d4');
  await page.touchscreen.tap(c.x, c.y);
  await waitFor(() => window.__runner.match.teams[0].controlled.id !== window.__before, 8000).catch(() => {});
  const after = await page.evaluate(() => window.__runner.match.teams[0].controlled.id);
  assert(before !== after, 'CAMBIAR no cambió de jugador');
});

await check('Modo asistido: un toque rápido en PASE elige al compañero libre y un toque en TIRO dispara con potencia', async () => {
  const assist = await page.evaluate(() => window.__runner.controller.settings.assist);
  assert(assist === true, 'el modo asistido no está activo en móvil');
  await page.evaluate(() => {
    window.__runner.timeScale = 1; // velocidad real: un toque de 60 ms dura 60 ms de partido
    const m = window.__runner.match;
    if (m.phase === 'replay') m.skipReplay();
    m.restart = null; m.phase = 'play';
    const t = m.teams[0]; const g = t.attackDir; const p = t.players[9]; t.controlled = p;
    for (const q of m.active) q.pos.set(-g * 40, 0, 38);
    const gk = m.teams[1].goalkeeper; gk.pos.set(g * 52, 0, 0);
    m.teams[1].players[3].pos.set(g * 48, 0, -20); // penúltimo defensor: el compañero (a 45 m) queda en línea
    p.pos.set(g * 30, 0, 0); p.vel.set(0, 0, 0); p.facing = g > 0 ? Math.PI / 2 : -Math.PI / 2; p.clearAction();
    t.players[8].pos.set(g * 45, 0, 8); // compañero libre y adelantado
    m.ball.reset(g * 30.5, 0); m.owner = p;
    window.__rcv = t.players[8].id; window.__kick = null;
    const orig = m.requestKick.bind(m);
    m.requestKick = (pl, req) => { window.__kick = { kind: req.kind, target: req.targetId, speed: req.velocity.length() }; return orig(pl, req); };
  });
  const tapBtn = async (sel) => {
    const c = await center(sel);
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 21, bubbles: true, clientX: x, clientY: y, pointerType: 'touch' }));
      setTimeout(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 21, bubbles: true, clientX: x, clientY: y, pointerType: 'touch' })), 60);
    }, c);
  };
  await tapBtn('.tb-a2');
  await waitFor(() => window.__kick !== null, 15000);
  const pass = await page.evaluate(() => window.__kick);
  assert(pass.kind === 'pass', 'no hubo pase');
  assert(pass.target === await page.evaluate(() => window.__rcv), 'el pase asistido no fue al compañero libre');
  await waitFor(() => window.__runner.match.teams[0].controlled?.id === window.__rcv, 3000);
  // tiro: devolver el balón y tocar TIRO una vez
  await page.evaluate(() => {
    const m = window.__runner.match; const t = m.teams[0]; const g = t.attackDir; const p = t.players[9]; t.controlled = p;
    m.phase = 'play'; p.pos.set(g * 34, 0, 0); p.vel.set(0, 0, 0); p.clearAction(); m.ball.reset(g * 34.5, 0); m.owner = p; window.__kick = null;
  });
  await page.waitForTimeout(400);
  await tapBtn('.tb-a1');
  await waitFor(() => window.__kick !== null, 15000);
  const shot = await page.evaluate(() => window.__kick);
  assert(shot.kind === 'shoot' && shot.speed > 22, 'el toque rápido no dio potencia automática: ' + JSON.stringify(shot));
});

await check('Cámara: el balón y el jugador junto a la banda inferior no quedan fuera de la pantalla ni bajo los botones', async () => {
  await page.evaluate(() => {
    const m = window.__runner.match;
    if (m.phase === 'replay') m.skipReplay(); // el tiro de la prueba anterior puede haber sido gol
    m.restart = null; m.lastGoal = null; m.phase = 'play';
    const t = m.teams[0]; const p = t.players[7]; t.controlled = p;
    for (const q of m.active) if (q !== p && !q.isGK) q.pos.set(-30, 0, -20);
    p.pos.set(10, 0, 33); p.vel.set(0, 0, 0); p.clearAction();
    m.ball.reset(10.5, 33); m.owner = p; window.__runner.timeScale = 1;
  });
  // el renderizado por software es lento: esperar 4 s de partido para que la cámara (suavizada) se asiente
  const t0 = await page.evaluate(() => window.__runner.match.time);
  await waitFor(`window.__runner.match.time > ${t0 + 4}`, 90000);
  const ys = await page.evaluate(() => {
    const r = window.__runner; const cam = r.view.director.camera; const m = r.match;
    const v = m.ball.pos.clone(); v.y = 0; v.project(cam);
    const c = m.teams[0].controlled.pos.clone(); c.y = 0; c.project(cam);
    return [v.y, c.y];
  });
  await page.screenshot({ path: join(OUT, 'm-camera-banda.png') });
  const dbg = await page.evaluate(() => { const m = window.__runner.match; return [m.phase, m.ball.pos.x.toFixed(1), m.ball.pos.z.toFixed(1), m.teams[0].controlled?.pos.z.toFixed(1)]; });
  assert(ys.every((y) => y > -0.45 && y < 0.95), 'fuera del encuadre útil: ' + JSON.stringify(ys) + ' ' + dbg.join(' '));
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
  // el aviso no bloquea: se puede jugar igualmente
  await page.tap('.rotate-skip');
  assert(!(await page.isVisible('.rotate-hint')), 'el aviso no se pudo cerrar');
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
