// Herramienta de pruebas: abre el juego en Chromium headless, ejecuta pasos y guarda capturas.
import { chromium } from 'playwright-core';
const url = process.env.URL ?? 'http://localhost:5180/';
const out = process.env.OUT ?? '/tmp';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const [vw, vh] = (process.env.VIEW ?? '1280x720').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(1500);
const steps = JSON.parse(process.env.STEPS ?? '[]');
let i = 0;
for (const s of steps) {
  if (s.key) await page.keyboard.press(s.key);
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r)); }
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: `${out}/${s.shot}.png` });
  i++;
}
console.log(logs.slice(-40).join('\n'));
await browser.close();
