// Prueba de extremo a extremo de cuentas: dos dispositivos (contextos separados) comparten el progreso.
// Uso: npm run build && node scripts/e2e-account.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OUT = resolve(process.env.OUT ?? 'test-results');
await mkdir(OUT, { recursive: true });
const PORT = 18000 + Math.floor(Math.random() * 2000);
const dataDir = await mkdtemp(join(tmpdir(), 'fe3d-acc-'));
const srv = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stdout.on('data', (d) => { log += d; });
srv.stderr.on('data', (d) => { log += d; });
for (let i = 0; i < 50 && !log.includes('Servidor online'); i++) await new Promise((r) => setTimeout(r, 100));
if (!log.includes('Servidor online')) throw new Error(`El servidor no arrancó\n${log}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? '✔' : '✘'} ${msg}`); if (!ok) fail++; };
const K = (k) => `football-elite-3d:${k}`;

async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 500 }, locale: 'es-ES' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.addInitScript(() => {
    if (!localStorage.getItem('football-elite-3d:settings')) localStorage.setItem('football-elite-3d:settings', JSON.stringify({ quality: 'low', shadows: false, resolutionScale: 0.5, antialias: false, menuReel: false, onlineServer: location.host }));
  });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('[data-act="go"]');
  return page;
}
async function toAccount(page) {
  await page.click('[data-act="go"]');
  await page.click('[data-act="more"]');
  await page.click('[data-act="account"]');
}

try {
  // --- Dispositivo A: crea la cuenta con progreso local ---
  const a = await device('A');
  await a.evaluate((k) => localStorage.setItem(k, JSON.stringify({ marker: 'desde-A', coins: 1234 })), K('career'));
  await toAccount(a);
  await a.click('[data-act="tabRegister"]');
  await a.fill('#ui .screen:last-child #ac-name', 'Tester');
  await a.fill('#ui .screen:last-child #ac-mail', 'tester@gmail.com');
  await a.fill('#ui .screen:last-child #ac-pw', 'contra-1234');
  await a.click('#ui .screen:last-child [data-act="submit"]');
  await a.waitForSelector('text=Tu progreso ya está en la nube', { timeout: 10000 }).catch(async () => { await a.screenshot({ path: join(OUT, 'account-dbg.png') }); console.log(await a.evaluate(() => document.getElementById('ui').innerText.slice(0, 400))); throw new Error('registro'); });
  check(true, 'A: cuenta creada y progreso subido');
  await a.screenshot({ path: join(OUT, 'account-a.png') });

  // --- Dispositivo B: otro navegador, entra con el correo y recibe el progreso ---
  const b = await device('B');
  await toAccount(b);
  await b.fill('#ui .screen:last-child #ac-who', 'tester@gmail.com');
  await b.fill('#ui .screen:last-child #ac-pw', 'mala-clave-1');
  await b.click('#ui .screen:last-child [data-act="submit"]');
  await b.waitForSelector('[role="alert"]', { timeout: 10000 });
  check(/incorrectos/.test(await b.textContent('[role="alert"]')), 'B: contraseña incorrecta rechazada');
  await b.fill('#ui .screen:last-child #ac-pw', 'contra-1234');
  await Promise.all([b.waitForNavigation({ timeout: 15000 }), b.click('#ui .screen:last-child [data-act="submit"]')]);
  await b.waitForSelector('[data-act="go"]');
  const got = await b.evaluate((k) => localStorage.getItem(k), K('career'));
  check(got && JSON.parse(got).marker === 'desde-A', 'B: recibió el progreso de A al entrar (recarga automática)');

  // --- B avanza y A lo recibe al reabrir ---
  await b.evaluate((k) => { localStorage.setItem(k, JSON.stringify({ marker: 'desde-B', coins: 9999 })); }, K('career'));
  // stamp manual (el juego lo hace al guardar con saveJSON): usamos la API real
  await b.evaluate(async () => { const m = JSON.parse(localStorage.getItem('football-elite-3d:sync-meta') || '{}'); m.career = Date.now() + 1000; localStorage.setItem('football-elite-3d:sync-meta', JSON.stringify(m)); });
  await toAccount(b);
  await b.click('[data-act="sync"]');
  await b.waitForSelector('text=Todo está al día', { timeout: 10000 });
  await a.reload();
  await a.waitForFunction((k) => (localStorage.getItem(k) || '').includes('desde-B'), K('career'), { timeout: 15000 });
  check(true, 'A: al reabrir recibió el progreso de B');

  await toAccount(a);
  await a.click('[data-act="logout"]');
  await a.waitForSelector('text=Sesión cerrada');
  check((await a.evaluate((k) => localStorage.getItem(k), K('account'))) === null, 'A: cerrar sesión borra la sesión local');
  await a.screenshot({ path: join(OUT, 'account-out.png') });
  check(errors.length === 0, `sin errores de página ${errors.join(' | ')}`);
} finally {
  await browser.close();
  srv.kill();
}
process.exit(fail ? 1 : 0);
