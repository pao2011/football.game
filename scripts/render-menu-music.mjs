// Renderiza la música del menú sin conexión (OfflineAudioContext en Chromium) y la guarda como WAV; además imprime
// pico, RMS y recortes por sección para ajustar el volumen sin escucharla.
// Uso (con `npx vite --port 5180` en marcha): OUT=/ruta/musica.wav [SECONDS=100] [MODULE=/src/audio/MenuMusic.ts] node scripts/render-menu-music.mjs
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const OUT = process.env.OUT ?? 'menu-music.wav';
const SECONDS = Number(process.env.SECONDS ?? 100);
const MODULE = process.env.MODULE ?? '/src/audio/MenuMusic.ts';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5180/');
await page.waitForTimeout(1500);
const MIXJSON = process.env.MIXJSON ? JSON.parse(process.env.MIXJSON) : null;
const STEMS = process.env.STEMS === '1';
const res = await page.evaluate(async ({ SECONDS, MODULE, MIXJSON, STEMS }) => {
  const { MenuMusic, STEP, MIX } = await import(/* @vite-ignore */ MODULE);
  const tags = Object.keys(MIX);
  const render = async (mixOverride, wantWav) => {
  for (const k of tags) MIX[k] = mixOverride && k in mixOverride ? mixOverride[k] : MIX[k];
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * SECONDS), sr);
  const noiseBufs = {};
  const noiseBuf = (kind) => {
    if (noiseBufs[kind]) return noiseBufs[kind];
    const len = sr * 3, buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    if (kind === 'white') for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    else if (kind === 'pink') { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } }
    else { let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } }
    return (noiseBufs[kind] = buf);
  };
  const FLOOR = 0.0001;
  const kit = {
    ctx,
    filter: (type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; },
    perc: (p, t, a, peak, d) => { p.setValueAtTime(FLOOR, t); p.linearRampToValueAtTime(Math.max(FLOOR * 2, peak), t + a); p.exponentialRampToValueAtTime(FLOOR, t + a + d); },
    noise: (kind, t, dur) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf(kind); s.loop = true; s.start(t, Math.random() * 2.9); if (dur >= 0) s.stop(t + dur + 0.02); return s; },
  };
  // igual que el motor de audio: la música sale por un volumen de grupo y el volumen general
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  const music = new MenuMusic(kit, master);
  music.nodes.input.gain.setValueAtTime(1, 0);
  const steps = Math.floor(SECONDS / STEP);
  for (let s = 0; s < steps; s++) music.scheduleStep(s, s * STEP + 0.05);
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  // estadísticas por ventana de 4 compases (≈ 4 * 16 * STEP s)
  const win = Math.floor(sr * STEP * 64);
  const stats = [];
  let clip = 0;
  for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) >= 0.999 || Math.abs(R[i]) >= 0.999) clip++;
  for (let o = 0; o + win <= L.length; o += win) {
    let pk = 0, sum = 0;
    for (let i = o; i < o + win; i++) { const v = (L[i] + R[i]) / 2; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); sum += v * v; }
    stats.push({ t: +(o / sr).toFixed(1), peak: +pk.toFixed(3), rmsDb: +(20 * Math.log10(Math.sqrt(sum / win) + 1e-9)).toFixed(1) });
  }
  if (!wantWav) return { stats, clip };
  // WAV 16 bits estéreo
  const n = L.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let bin = ''; const u8 = new Uint8Array(out.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return { stats, clip, wav: btoa(bin), step: STEP };
  };
  if (STEMS) {
    const out = {};
    const base = { ...MIX };
    for (const tag of tags) {
      const solo = Object.fromEntries(tags.map((k) => [k, k === tag ? base[k] : 0]));
      const r = await render(solo, false);
      out[tag] = r.stats.map((x) => x.rmsDb);
    }
    return { stems: out };
  }
  return await render(MIXJSON, true);
}, { SECONDS, MODULE, MIXJSON, STEMS });
if (res.stems) {
  console.log('RMS por instrumento (dB, ventanas de 4 compases; -90 = silencio)');
  console.table(res.stems);
} else {
  writeFileSync(OUT, Buffer.from(res.wav, 'base64'));
  console.log(`WAV: ${OUT} · paso ${res.step.toFixed(4)} s · muestras recortadas: ${res.clip}`);
  console.table(res.stats);
}
await browser.close();
