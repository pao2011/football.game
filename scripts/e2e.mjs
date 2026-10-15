// Prueba de extremo a extremo: abre el juego real en Chromium (sin GPU, renderizado por software),
// recorre menús, juega con el teclado, pausa, reinicia, termina partidos y prueba los modos.
// Uso: npm run build && node scripts/e2e.mjs   (sirve dist/ en un puerto local)
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.env.DIST ?? 'dist');
const OUT = resolve(process.env.OUT ?? 'test-results');
await mkdir(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = p.endsWith('/') ? join(p, 'index.html') : p;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end();
  }
}).listen(0);
const port = server.address().port;

const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`✔ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: String(e.message ?? e) });
    console.log(`✘ ${name}: ${e.message ?? e}`);
    await page.screenshot({ path: join(OUT, `fail-${results.length}.png`) }).catch(() => {});
  }
}
const ev = (fn, arg) => page.evaluate(fn, arg);
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const waitFor = async (fn, ms = 30000, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, arg).catch(() => false)) return;
    await page.waitForTimeout(200);
  }
  throw new Error('tiempo de espera agotado: ' + fn.toString().slice(0, 80));
};
const click = (sel) => page.click(sel);

// Calidad baja para que el renderizado por software sea fluido
await page.addInitScript(() => {
  localStorage.setItem('football-elite-3d:settings', JSON.stringify({ quality: 'low', shadows: false, resolutionScale: 0.6, halfMinutes: 2 }));
});
await page.goto(`http://localhost:${port}/`);

await check('La pantalla de título carga sin errores', async () => {
  await page.waitForSelector('.title-screen');
  assert(errors.length === 0, errors.join('; '));
});

await check('Menú principal y navegación con teclado', async () => {
  await page.keyboard.press('Enter');
  await page.waitForSelector('.main-menu');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.screenshot({ path: join(OUT, 'menu.png') });
});

await check('Partido rápido: configurar y empezar (local controlado por el humano)', async () => {
  await click('[data-act=quick]');
  await page.waitForSelector('[data-act=play]');
  await click('[data-act=homeNext]');
  await click('[data-act=stadNext]');
  await click('[data-act=play]');
  await waitFor(() => !!window.__runner && window.__runner.match.time > 0.5, 60000);
  await page.screenshot({ path: join(OUT, 'kickoff.png') });
});

await check('Saque inicial y control con el teclado (S para pasar, flechas para mover)', async () => {
  await ev(() => { window.__runner.timeScale = 3; });
  await waitFor(() => { const m = window.__runner.match; return m.phase === 'play' || (m.restart?.stage === 'ready'); }, 30000);
  const kickoffMine = await ev(() => { const m = window.__runner.match; return m.phase !== 'play' && m.restart?.team === 0; });
  if (kickoffMine) {
    await page.keyboard.press('s');
    await waitFor(() => window.__runner.match.phase === 'play', 20000);
  } else {
    await waitFor(() => window.__runner.match.phase === 'play', 20000);
  }
  const before = await ev(() => { const p = window.__runner.match.teams[0].controlled; return { id: p.id, x: p.pos.x, z: p.pos.z }; });
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('KeyE');
  const after = await ev((id) => { const p = window.__runner.match.playersAll.find((q) => q.id === id); return { x: p.pos.x, z: p.pos.z }; }, before.id);
  assert(Math.hypot(after.x - before.x, after.z - before.z) > 1.5, `el jugador no se movió (${JSON.stringify([before, after])})`);
  await page.screenshot({ path: join(OUT, 'play.png') });
});

await check('Tiro con D (barra de potencia) desde el borde del área', async () => {
  // Colocar al jugador controlado con balón frente al arco
  await ev(() => {
    const m = window.__runner.match;
    m.phase = 'play';
    const t = m.teams[0];
    const p = t.players[9];
    t.controlled = p;
    const g = t.attackDir;
    for (const q of m.teams[1].active) if (!q.isGK) q.pos.set(-g * 20, 0, q.pos.z);
    p.pos.set(g * 34, 0, 0); p.vel.set(0, 0, 0); p.facing = g > 0 ? Math.PI / 2 : -Math.PI / 2;
    m.ball.pos.set(g * 34.5, 0.11, 0); m.ball.vel.set(0, 0, 0); m.owner = p;
    window.__shots0 = t.stats.shots;
  });
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  await waitFor(() => window.__runner.match.teams[0].stats.shots > window.__shots0, 10000);
  const charge = await ev(() => window.__runner.controller.lastCharge?.value ?? 0);
  assert(charge > 0.1, 'la barra de potencia no se cargó: ' + charge);
  await page.screenshot({ path: join(OUT, 'shot.png') });
});

await check('Pausa con Esc, estadísticas y reanudar', async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay [data-act=resume]', { timeout: 15000 });
  await page.screenshot({ path: join(OUT, 'pause.png') });
  await click('[data-act=stats]');
  await page.waitForSelector('.overlay .stat-row');
  await click('[data-act=back]');
  await click('[data-act=resume]');
  await waitFor(() => !window.__runner.paused, 5000);
});

await check('Cambios desde la pausa: elegir quién sale y quién entra', async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay [data-act=subs]', { timeout: 15000 });
  await click('[data-act=subs]');
  await page.waitForSelector('.subs-modal');
  const outId = await ev(() => window.__runner.match.teams[0].players[9].id);
  await click(`.sub-row[data-act=out][data-id="${outId}"]`);
  await click('.sub-row[data-act=in]:not([disabled])');
  await waitFor(() => window.__runner.match.pendingSubs.length === 1, 5000);
  assert((await page.textContent('.subs-modal')).includes('pendiente'), 'cambio pendiente visible');
  await page.screenshot({ path: join(OUT, 'subs.png') });
  // en la próxima interrupción se hace el cambio
  await ev(() => window.__runner.match.applyPendingSubs());
  await waitFor((id) => !window.__runner.match.playersAll.some((p) => p.id === id), 5000, outId);
  await click('[data-act=back]');
  await click('[data-act=resume]');
  await waitFor(() => !window.__runner.paused, 5000);
});

await check('Reiniciar el partido sin reiniciar la aplicación', async () => {
  const oldRunner = await ev(() => { window.__old = window.__runner; return true; });
  void oldRunner;
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay [data-act=restart]', { timeout: 15000 });
  await click('[data-act=restart]');
  await waitFor(() => window.__runner && window.__runner !== window.__old && window.__runner.match.time > 0.2, 60000);
  const clock = await ev(() => window.__runner.match.matchSeconds);
  assert(clock < 60, 'el reloj no se reinició');
});

await check('Final del partido y pantalla de resultado con estadísticas', async () => {
  await ev(() => {
    const m = window.__runner.match;
    // adelantar el reloj al final del segundo tiempo
    m.half = 2;
    m.matchSeconds = 90 * 60 + 10;
    m.announcedAdded = 1;
    m.addedSeconds = 0;
    m.phase = 'play';
    m.ball.vel.set(0, 0, 0);
    window.__runner.timeScale = 4;
  });
  await page.waitForSelector('[data-act=rematch]', { timeout: 90000 });
  const txt = await page.textContent('.screen');
  assert(/RESULTADO FINAL|Resultado final/i.test(txt), 'sin pantalla de resultado');
  await page.screenshot({ path: join(OUT, 'result.png') });
  assert((await page.textContent('.screen')).includes('JUGADOR DEL PARTIDO'), 'jugador del partido');
});

await check('Revancha desde la pantalla de resultado', async () => {
  await click('[data-act=rematch]');
  await waitFor(() => window.__runner && window.__runner.match.time > 0.2, 60000);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay [data-act=quit]', { timeout: 15000 });
  await click('[data-act=quit]');
  await page.waitForSelector('.main-menu', { timeout: 15000 });
});

await check('Copa Élite: elegir equipo, jugar y registrar resultado', async () => {
  await click('[data-act=tournament]');
  await page.waitForSelector('[data-act=ok]');
  await click('[data-act=ok]');
  await page.waitForSelector('[data-act=play]');
  await page.screenshot({ path: join(OUT, 'tournament.png') });
  await click('[data-act=play]');
  await waitFor(() => window.__runner && window.__runner.match.time > 0.2, 60000);
  await ev(() => { const m = window.__runner.match; m.teams[0].stats.goals = 2; m.half = 2; m.matchSeconds = 90 * 60 + 10; m.announcedAdded = 1; m.phase = 'play'; window.__runner.timeScale = 4; });
  await page.waitForSelector('[data-act=cont]', { timeout: 90000 });
  await click('[data-act=cont]');
  await page.waitForSelector('.tbl');
  const played = await ev(() => window.__app.tournament.state.fixtures.filter((f) => f.played).length);
  assert(played >= 2, 'no se registró la jornada');
  await click('[data-act=back]');
});

await check('Carrera: crear, ver plantilla y alineación', async () => {
  await click('[data-act=career]');
  await page.waitForSelector('[data-act=ok]');
  await click('[data-act=ok]');
  await page.waitForSelector('[data-act=squad]');
  await click('[data-act=squad]');
  await page.waitForSelector('.mini-pitch');
  await page.screenshot({ path: join(OUT, 'squad.png') });
  await click('[data-act=save]');
  await page.waitForSelector('[data-act=play]');
  await page.screenshot({ path: join(OUT, 'career.png') });
  await click('[data-act=back]');
});

await check('Entrenamiento de penales: lanzar y marcar/fallar', async () => {
  await click('[data-act=training]');
  await click('[data-act=pens]');
  await waitFor(() => window.__runner && window.__runner.match.restart?.stage === 'ready', 60000);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowUp');
  await waitFor(() => window.__runner.match.debug.kicks > 0, 20000);
  await page.screenshot({ path: join(OUT, 'penalty.png') });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.overlay [data-act=quit]', { timeout: 15000 });
  await click('[data-act=quit]');
  await page.waitForSelector('[data-act=back]');
  await click('[data-act=back]');
});

await check('Configuración y reasignación de teclas', async () => {
  await click('[data-act=settings]');
  await page.waitForSelector('[data-act=qualNext]');
  await click('[data-act=tog][data-key=showRadar]');
  await click('[data-act=back]');
  await click('[data-act=controls]');
  await page.click('[data-act=rebind][data-a=shoot]');
  await page.keyboard.press('KeyF');
  const b = await ev(() => window.__app.settings.bindings.shoot[0]);
  assert(b === 'KeyF', 'no se reasignó la tecla');
  await page.click('[data-act=presetNext]');
  const b2 = await ev(() => window.__app.settings.bindings.shoot[0]);
  assert(b2 === 'KeyD', 'el esquema clásico no se restauró');
  await click('[data-act=back]');
});

await check('Sin errores de JavaScript durante toda la sesión', async () => {
  assert(errors.length === 0, errors.slice(0, 5).join(' | '));
});

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pruebas E2E superadas`);
process.exit(failed.length ? 1 : 0);
