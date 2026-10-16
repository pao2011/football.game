// Pruebas de audio por análisis de señal: en un navegador real, renderiza cada sonido del juego con un
// OfflineAudioContext y comprueba que produce señal audible, sin saturar (sin clipping), y que el paneo 3D
// manda el balón al canal correcto. Uso: node scripts/e2e-audio.mjs [archivo.html]  (por defecto jugar.html)
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const file = resolve(process.argv[2] ?? 'jugar.html');
const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const exe = process.env.CHROME ?? (existsSync(local) ? local : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(file).href);
await page.waitForFunction(() => window.__app && window.__app.audio, null, { timeout: 30000 });

// [nombre, llamada, segundos a renderizar]
const SOUNDS = [
  ['kick', 'a.kick(0.9)', 1],
  ['kick suave', 'a.kick(0.15)', 1],
  ['header', 'a.header(0.7)', 1],
  ['touch', 'a.touch(0.4)', 1],
  ['bounce', 'a.bounce(0.6)', 1],
  ['post', 'a.post()', 1.5],
  ['net', 'a.net()', 1.5],
  ['tackle', 'a.tackle()', 1],
  ['gloveCatch', 'a.gloveCatch()', 1],
  ['glovePunch', 'a.glovePunch()', 1],
  ['boards', 'a.boards(0.8)', 1.2],
  ['whistle short', "a.whistle('short')", 1.2],
  ['whistle final', "a.whistle('final')", 3],
  ['goalHorn', 'a.goalHorn()', 3],
  ['cheer', 'a.cheer(1)', 3],
  ['ooh', 'a.ooh()', 2],
  ['groan', 'a.groan()', 2],
  ['applause', 'a.applause()', 3],
  ['boo', 'a.boo()', 2.5],
  ['uiClick', 'a.uiClick()', 0.5],
  ['uiBack', 'a.uiBack()', 0.5],
  ['ambience', 'a.startAmbience()', 2],
  ['rain', "a.startWeather('rain')", 2],
  ['roll', 'a.setRoll(8, true)', 1],
  ['chant', 'a.startAmbience(); a.chant(1)', 3],
  ['firework', 'a.firework(40)', 2.5],
];

const results = [];
for (const [name, call, secs] of SOUNDS) {
  const r = await page.evaluate(async ({ call, secs }) => {
    const Engine = window.__app.audio.constructor;
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * (secs + 0.15)), sr);
    const a = new Engine(ctx);
    a.unlock();
    a.setVolumes({ master: 1, music: 1, sfx: 1, crowd: 1, ball: 1, referee: 1 });
    // se dispara a los 0,15 s (como en el juego, con los volúmenes ya asentados)
    ctx.suspend(0.15).then(() => { new Function('a', call)(a); ctx.resume(); });
    const buf = await ctx.startRendering();
    let peak = 0, sum = 0, clipped = 0, nan = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const v = d[i];
        if (!Number.isFinite(v)) { nan++; continue; }
        const av = Math.abs(v);
        if (av > peak) peak = av;
        if (av >= 0.999) clipped++;
        sum += v * v;
      }
    }
    return { peak, rms: Math.sqrt(sum / (buf.length * buf.numberOfChannels)), clipped, nan };
  }, { call, secs });
  const ok = r.nan === 0 && r.peak > 0.01 && r.rms > 0.0005 && r.clipped < 20;
  results.push(ok);
  console.log(`${ok ? '✔' : '✘'} ${name.padEnd(14)} pico ${r.peak.toFixed(3)} · rms ${r.rms.toFixed(4)}${r.clipped ? ` · ${r.clipped} muestras saturadas` : ''}${r.nan ? ` · ${r.nan} NaN` : ''}`);
}

// Volumen del balón a 0: el golpeo debe quedar mudo (comprueba el bus "ball")
{
  const peak = await page.evaluate(async () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const a = new window.__app.audio.constructor(ctx);
    a.unlock();
    a.setVolumes({ master: 1, music: 1, sfx: 1, crowd: 1, ball: 0, referee: 1 });
    ctx.suspend(0.15).then(() => { a.kick(0.9); ctx.resume(); });
    const b = await ctx.startRendering();
    let p = 0; for (const v of b.getChannelData(0)) p = Math.max(p, Math.abs(v));
    return p;
  });
  const ok = peak < 0.002;
  results.push(ok);
  console.log(`${ok ? '✔' : '✘'} volumen del balón a 0 silencia el golpeo (pico ${peak.toFixed(4)})`);
}

// Sonido 3D: un golpeo a la derecha de la cámara suena más fuerte en el canal derecho
{
  const [l, r] = await page.evaluate(async () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const a = new window.__app.audio.constructor(ctx);
    a.unlock();
    a.setVolumes({ master: 1, music: 1, sfx: 1, crowd: 1, ball: 1, referee: 1 });
    a.setListener(0, 30, 1, 0); // cámara en la banda, "derecha" = +x
    ctx.suspend(0.15).then(() => { a.kick(0.9, { x: 30, z: 0 }); ctx.resume(); });
    const b = await ctx.startRendering();
    const e = (d) => { let s = 0; for (const v of d) s += v * v; return s; };
    return [e(b.getChannelData(0)), e(b.getChannelData(1))];
  });
  const ok = r > l * 1.5;
  results.push(ok);
  console.log(`${ok ? '✔' : '✘'} paneo 3D: golpeo a la derecha → canal derecho (I ${l.toFixed(2)} · D ${r.toFixed(2)})`);
}

if (errors.length) console.log('Errores de JavaScript:\n' + errors.join('\n'));
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} pruebas de audio superadas`);
await browser.close();
process.exit(passed === results.length && !errors.length ? 0 : 1);
