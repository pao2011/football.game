// Capturas reales del juego para el sitio web (public/sitio/img). Uso: npm run build && node scripts/site-shots.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'public/sitio/img';
const PORT = 20000 + Math.floor(Math.random() * 2000);
const srv = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: await mkdtemp(join(tmpdir(), 'fe3d-shots-')) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'es-ES' })).newPage();
await page.addInitScript(() => localStorage.setItem('football-elite-3d:settings', JSON.stringify({ quality: 'medium', shadows: true, resolutionScale: 1, antialias: true, menuReel: true, onlineServer: location.host })));
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('[data-act=go]');
  await page.click('[data-act=go]');
  await page.waitForSelector('.mm');
  await page.waitForTimeout(9000);
  await shot('menu');
  await page.click('[data-act=club]');
  await page.waitForTimeout(1500);
  await page.click('[data-act=create]');
  await page.waitForTimeout(3500);
  await shot('club');
  await page.evaluate(() => window.__app.mainMenu());
  await page.waitForSelector('.mm');
  await page.click('[data-act=quick]');
  await page.waitForSelector('[data-act=play]');
  await page.click('[data-act=homeNext]');
  await page.click('[data-act=stadNext]');
  await page.click('[data-act=play]');
  await page.waitForFunction(() => window.__runner && window.__runner.match.time > 0.5, null, { timeout: 60000 });
  await page.evaluate(() => { window.__runner.timeScale = 4; });
  await page.waitForTimeout(12000);
  await page.evaluate(() => { window.__runner.timeScale = 1; });
  await page.waitForTimeout(600);
  await shot('partido');
} finally {
  await browser.close();
  srv.kill();
}
