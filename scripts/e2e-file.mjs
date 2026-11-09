// Prueba "doble clic": abre el juego desde file:// (como al descomprimir el ZIP en un PC) y
// comprueba que aparece la pantalla de inicio. Uso: node scripts/e2e-file.mjs [archivo.html]   (por defecto index.html)
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const file = resolve(process.argv[2] ?? 'index.html');
// Chromium local si existe; si no (p. ej. en GitHub Actions), el que instala `npx playwright-core install chromium`
const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const exe = process.env.CHROME ?? (existsSync(local) ? local : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, locale: 'es-ES' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
// index.html redirige a jugar.html: solo cuentan los errores de la página final
page.on('framenavigated', (f) => { if (f === page.mainFrame()) errors.length = 0; });
await page.goto(pathToFileURL(file).href);
let ok = false;
for (let i = 0; i < 100 && !ok; i++) {
  ok = await page.evaluate(() => !!document.querySelector('#ui .title-screen, #ui .mm-item')).catch(() => false);
  if (!ok) await page.waitForTimeout(200);
}
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
console.log(`${ok ? '✔' : '✘'} pantalla de inicio visible desde ${page.url()}`);
if (errors.length) console.log('Errores:\n' + errors.join('\n'));
await browser.close();
process.exit(ok ? 0 : 1);
