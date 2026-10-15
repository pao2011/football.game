// Genera el arte de la app con el propio motor del juego y Chromium:
//  · docs/art/key-art.png       imagen principal 1920×1080 (FHD): escena nocturna renderizada en 3D + logo
//  · iconos (1024 maestro, PWA 192/512, Android mipmap y adaptativo) dibujados en SVG
//  · pantallas de inicio (splash) de Android a partir de la imagen principal
// Uso: npm run build && node scripts/make-art.mjs [keyart|icons|all]
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const what = process.argv[2] ?? 'all';
const ROOT = resolve('dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = join(ROOT, p);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await mkdir('docs/art', { recursive: true });

// ---------------------------------------------------------------- logo (HTML/CSS, se usa en la imagen y los splash)
const LOGO_CSS = `
.art-logo { position: absolute; font-family: 'Arial Black', 'Helvetica Neue', Impact, sans-serif; text-align: center; line-height: 0.9; letter-spacing: 0.02em; }
.art-logo .l1 { display: block; font-size: var(--s1); font-weight: 900; font-style: italic; color: transparent;
  background: linear-gradient(180deg, #ffffff 0%, #e9eef8 38%, #a8b4c8 52%, #f4f7fc 64%, #c9d3e3 100%); -webkit-background-clip: text; background-clip: text;
  -webkit-text-stroke: calc(var(--s1) * 0.012) rgba(255,255,255,0.35); filter: drop-shadow(0 calc(var(--s1) * 0.06) calc(var(--s1) * 0.12) rgba(0,0,0,0.85)) drop-shadow(0 0 calc(var(--s1) * 0.25) rgba(25,230,140,0.25)); }
.art-logo .l2 { display: inline-block; margin-top: calc(var(--s1) * 0.08); font-size: calc(var(--s1) * 0.62); font-weight: 900; font-style: italic; color: #071a10;
  background: linear-gradient(180deg, #5dffb4 0%, #19e68c 55%, #0fae68 100%); padding: 0.04em 0.42em 0.06em; border-radius: 0.12em; transform: skewX(-8deg);
  box-shadow: 0 0 calc(var(--s1) * 0.35) rgba(25,230,140,0.75), 0 calc(var(--s1) * 0.05) calc(var(--s1) * 0.1) rgba(0,0,0,0.7); }
.art-logo .tag { display: block; margin-top: calc(var(--s1) * 0.18); font-family: Arial, sans-serif; font-weight: 700; font-size: calc(var(--s1) * 0.2); letter-spacing: 0.45em; color: #e8eefc; text-shadow: 0 2px 8px #000; }
`;

async function keyArt() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(() => {
    localStorage.setItem('football-elite-3d:settings', JSON.stringify({ quality: 'high', shadows: true, resolutionScale: 1, antialias: true, popups: false, showRadar: false, showIndicators: false }));
  });
  await page.goto(url);
  await page.waitForSelector('.title-screen');
  await page.waitForTimeout(3600); // animación de inicio
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-act=quick]');
  await page.evaluate(() => { window.__app.quick.stadium = 0; window.__app.quick.home = 0; window.__app.quick.away = 1; }); // Coliseo Aurora, de noche
  await page.click('[data-act=quick]');
  await page.waitForSelector('[data-act=play]');
  await page.click('[data-act=play]');
  await page.waitForSelector('.match-intro', { timeout: 120000 });
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(1500);
  // Escena: el 9 local remata de volea al borde del área, el arquero estirado, la defensa cerrando; fuegos y bengalas
  await page.evaluate(() => {
    const r = window.__runner;
    const m = r.match;
    r.timeScale = 0.00001; // simulación congelada; el render (público, humo, fuegos, banderas) sigue
    m.phase = 'play';
    m.restart = null;
    const t = m.teams[0];
    const o = m.teams[1];
    const g = t.attackDir;
    const gx = g * 52.5;
    const away = (q, x, z, f) => { q.pos.set(x, 0, z); q.vel.set(0, 0, 0); q.facing = f; q.clearAction(); };
    for (const q of m.active) away(q, -g * 30, 30, 0);
    const p = t.players[9];
    away(p, gx - g * 15, -2.5, g > 0 ? Math.PI / 2 - 0.25 : -Math.PI / 2 - 0.25);
    p.anim.state = 'shoot'; p.anim.time = 0.27; p.anim.duration = 0.55; p.anim.speed = 6; p.anim.foot = 1;
    m.ball.pos.set(gx - g * 14.2, 0.55, -2.3); m.ball.vel.set(g * 30, 4, 0.8); m.owner = null;
    // defensores y arquero
    const gk = o.goalkeeper;
    away(gk, gx - g * 2.2, 1.2, g > 0 ? -Math.PI / 2 : Math.PI / 2);
    gk.anim.state = 'gk_dive_right'; gk.anim.time = 0.35; gk.anim.duration = 1.1;
    const d = o.active.filter((q) => !q.isGK);
    away(d[0], gx - g * 12.8, -0.6, g > 0 ? -Math.PI / 2 : Math.PI / 2); d[0].anim.state = 'slide'; d[0].anim.time = 0.35; d[0].anim.duration = 1.0;
    away(d[1], gx - g * 9.5, 3.5, g > 0 ? -Math.PI / 2 - 0.4 : Math.PI / 2 - 0.4); d[1].anim.state = 'locomotion'; d[1].anim.speed = 7;
    away(d[2], gx - g * 8, -6, g > 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 + 0.3); d[2].anim.state = 'locomotion'; d[2].anim.speed = 6.5;
    // compañeros entrando al área
    away(t.players[8], gx - g * 19, 7, g > 0 ? Math.PI / 2 : -Math.PI / 2); t.players[8].anim.state = 'locomotion'; t.players[8].anim.speed = 8;
    away(t.players[10], gx - g * 22, -10, g > 0 ? Math.PI / 2 : -Math.PI / 2); t.players[10].anim.state = 'locomotion'; t.players[10].anim.speed = 7.5;
    // cámara de cine: baja, delante y al costado del rematador, mirando hacia él y la grada iluminada
    const c = r.view.director;
    c.update = () => {};
    const cam = c.camera;
    cam.fov = 30;
    cam.position.set(gx - g * 8.5, 1.15, 6.2);
    cam.updateProjectionMatrix();
    cam.lookAt(gx - g * 14.8, 1.55, -3.2);
    // hinchada: recibimiento completo (fuegos, bengalas, papelitos, bandera gigante)
    r.view.stadium.fans.welcome();
    for (const el of document.querySelectorAll('.hud, .touch-controls')) el.style.display = 'none';
  });
  // dejar que estallen los fuegos y suba el humo (el render por software es lento)
  await page.waitForTimeout(Number(process.env.ART_WAIT ?? 26000));
  await page.evaluate((css) => {
    const st = document.createElement('style');
    st.textContent = css + `
      .art-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 40;
        background: radial-gradient(ellipse 75% 70% at 45% 55%, transparent 55%, rgba(2,4,10,0.75) 100%),
                    linear-gradient(90deg, rgba(3,6,14,0.82) 0%, rgba(3,6,14,0.35) 30%, transparent 48%); }`;
    document.head.appendChild(st);
    const v = document.createElement('div');
    v.className = 'art-vignette';
    document.body.appendChild(v);
    const l = document.createElement('div');
    l.className = 'art-logo';
    l.style.cssText = '--s1: 118px; left: 90px; top: 50%; transform: translateY(-58%); z-index: 41; text-align: left;';
    l.innerHTML = '<span class="l1">FOOTBALL</span><span class="l1">ELITE</span><span class="l2">3D</span><span class="tag">11 CONTRA 11 · FÍSICA REAL</span>';
    document.body.appendChild(l);
  }, LOGO_CSS);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/art/key-art.png' });
  await page.close();
  console.log('docs/art/key-art.png');
}

// ---------------------------------------------------------------- icono (SVG)
function iconSVG({ background = true, safe = 1 } = {}) {
  // pentágonos del balón (centro y cinco alrededor, recortados por el círculo)
  const R = 250;
  const pent = (cx, cy, r, rot) => {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * 2 * Math.PI) / 5 - Math.PI / 2;
      pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}"/>`;
  };
  let pents = pent(0, 0, 72, 0.12);
  const seams = [];
  for (let i = 0; i < 5; i++) {
    const a = 0.12 + (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    pents += pent(ax * 205, ay * 205, 66, a + Math.PI / 5);
    seams.push(`<line x1="${(ax * 72).toFixed(1)}" y1="${(ay * 72).toFixed(1)}" x2="${(ax * 150).toFixed(1)}" y2="${(ay * 150).toFixed(1)}"/>`);
  }
  const ball = `
    <g transform="translate(512 455) rotate(-14)">
      <circle r="${R}" fill="url(#ballBase)"/>
      <g clip-path="url(#ballClip)">
        <g fill="url(#pentFill)">${pents}</g>
        <g stroke="#1c2433" stroke-width="7" stroke-linecap="round" opacity="0.55">${seams.join('')}</g>
        <circle r="${R}" fill="url(#ballShade)"/>
        <circle r="${R}" fill="url(#rimGreen)"/>
      </g>
      <ellipse cx="-92" cy="-128" rx="96" ry="58" fill="url(#spec)" transform="rotate(-28 -92 -128)"/>
      <circle r="${R}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>
    </g>`;
  const s = safe;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#16405a"/><stop offset="0.45" stop-color="#0a1a2e"/><stop offset="1" stop-color="#03060d"/>
    </radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#9fe8ff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="pitchGlow" cx="50%" cy="100%" r="70%">
      <stop offset="0" stop-color="#19e68c" stop-opacity="0.75"/><stop offset="0.5" stop-color="#0c8a52" stop-opacity="0.35"/><stop offset="1" stop-color="#0c8a52" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ballBase" cx="38%" cy="32%" r="78%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#e7ecf4"/><stop offset="0.85" stop-color="#9aa6ba"/><stop offset="1" stop-color="#5a667c"/>
    </radialGradient>
    <linearGradient id="pentFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2b3550"/><stop offset="1" stop-color="#0b1020"/>
    </linearGradient>
    <radialGradient id="ballShade" cx="36%" cy="30%" r="80%">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <radialGradient id="rimGreen" cx="85%" cy="88%" r="45%">
      <stop offset="0" stop-color="#19e68c" stop-opacity="0.55"/><stop offset="1" stop-color="#19e68c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="spec" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fire" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#ff3b1f" stop-opacity="0"/><stop offset="0.45" stop-color="#ff6a1f" stop-opacity="0.85"/><stop offset="0.8" stop-color="#ffc83d"/><stop offset="1" stop-color="#fff6c8"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff7d6"/><stop offset="0.45" stop-color="#ffd24a"/><stop offset="0.55" stop-color="#e09a12"/><stop offset="1" stop-color="#ffe9a3"/>
    </linearGradient>
    <linearGradient id="neon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7dffc6"/><stop offset="0.6" stop-color="#19e68c"/><stop offset="1" stop-color="#0b9c5c"/>
    </linearGradient>
    <clipPath id="ballClip"><circle r="${R}"/></clipPath>
    <filter id="blur18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.75"/></filter>
    <filter id="glowG" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  ${background ? `
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g opacity="0.9">
    <polygon points="70,0 210,0 520,700 330,700" fill="url(#beam)" opacity="0.35" filter="url(#blur18)"/>
    <polygon points="954,0 814,0 500,700 700,700" fill="url(#beam)" opacity="0.35" filter="url(#blur18)"/>
    <circle cx="140" cy="40" r="46" fill="#fff" filter="url(#blur18)"/>
    <circle cx="884" cy="40" r="46" fill="#fff" filter="url(#blur18)"/>
  </g>
  <ellipse cx="512" cy="1060" rx="720" ry="380" fill="url(#pitchGlow)"/>
  <path d="M0 860 Q512 770 1024 860" stroke="#ffffff" stroke-opacity="0.35" stroke-width="5" fill="none"/>
  ${Array.from({ length: 26 }, (_, i) => { const x = (i * 397) % 1024; const y = 120 + ((i * 211) % 520); const r = 2 + (i % 3); return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.25 + (i % 4) * 0.15}"/>`; }).join('')}` : ''}
  <g transform="translate(512 512) scale(${s}) translate(-512 -512)">
    <!-- estela de fuego del disparo -->
    <g filter="url(#blur6)" opacity="0.95">
      <path d="M150 820 C 300 720, 360 640, 330 520 C 420 600, 470 640, 560 600 C 470 720, 330 800, 150 820 Z" fill="url(#fire)"/>
      <path d="M90 700 C 220 650, 270 590, 270 500 C 330 560, 360 580, 420 560 C 340 650, 230 700, 90 700 Z" fill="url(#fire)" opacity="0.7"/>
    </g>
    <g stroke="#ffe6a0" stroke-width="7" stroke-linecap="round" opacity="0.8">
      <line x1="120" y1="560" x2="250" y2="515"/><line x1="160" y1="640" x2="290" y2="585"/><line x1="230" y1="760" x2="360" y2="680"/>
    </g>
    <g filter="url(#shadow)">${ball}</g>
    <!-- textos -->
    <g filter="url(#shadow)">
      <text x="512" y="842" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-style="italic" font-size="178" fill="url(#gold)" stroke="#3a2200" stroke-width="6" paint-order="stroke" letter-spacing="4">ELITE</text>
    </g>
    <g transform="translate(512 925) skewX(-10)" filter="url(#glowG)">
      <rect x="-118" y="-74" width="236" height="104" rx="18" fill="url(#neon)"/>
      <text x="0" y="12" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="96" fill="#04170d">3D</text>
    </g>
  </g>
</svg>`;
}

async function renderSVG(svg, size, transparent = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${transparent ? 'transparent' : '#000'}">
    <div style="width:${size}px;height:${size}px">${svg.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)}</div></body></html>`);
  const buf = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return buf;
}

/** Redimensiona/recorta una imagen PNG (cover) en el navegador. */
async function resize(png, w, h, { round = false } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const data = 'data:image/png;base64,' + png.toString('base64');
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${w}px;height:${h}px;overflow:hidden;${round ? 'border-radius:50%;' : ''}background:url(${data}) center/cover no-repeat"></div></body></html>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  return buf;
}

async function icons() {
  const master = await renderSVG(iconSVG(), 1024);
  await writeFile('docs/art/icon-1024.png', master);
  await writeFile('public/icons/icon-512.png', await resize(master, 512, 512));
  await writeFile('public/icons/icon-192.png', await resize(master, 192, 192));
  const res = 'android/app/src/main/res';
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  // capa delantera adaptativa: el contenido dentro de la zona segura (66 %) y fondo propio
  const fg = await renderSVG(iconSVG({ background: false, safe: 0.64 }), 1024, true);
  const bgOnly = await renderSVG(iconSVG().replace(/<g transform="translate\(512 512\)[\s\S]*<\/g>\n<\/svg>$/, '</svg>'), 1024);
  for (const [d, k] of Object.entries(dens)) {
    const s = Math.round(48 * k);
    const a = Math.round(108 * k);
    await writeFile(`${res}/mipmap-${d}/ic_launcher.png`, await resize(master, s, s));
    await writeFile(`${res}/mipmap-${d}/ic_launcher_round.png`, await resize(master, s, s, { round: true }));
    await writeFile(`${res}/mipmap-${d}/ic_launcher_foreground.png`, await resize(fg, a, a));
    await writeFile(`${res}/mipmap-${d}/ic_launcher_background.png`, await resize(bgOnly, a, a));
  }
  console.log('iconos generados');
}

async function splashes() {
  const key = await readFile('docs/art/key-art.png');
  const res = 'android/app/src/main/res';
  const land = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] };
  for (const [d, [w, h]] of Object.entries(land)) {
    await writeFile(`${res}/drawable-land-${d}/splash.png`, await resize(key, w, h));
  }
  // vertical: fondo de la imagen principal con el icono y el logo centrados
  const icon = await readFile('docs/art/icon-1024.png');
  const port = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  for (const [d, [w, h]] of Object.entries(port)) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<!doctype html><html><body style="margin:0">
      <div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#03060d url(data:image/png;base64,${key.toString('base64')}) 62% center/cover">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,6,14,0.55),rgba(3,6,14,0.2) 40%,rgba(3,6,14,0.85))"></div>
        <img src="data:image/png;base64,${icon.toString('base64')}" style="position:absolute;left:50%;top:44%;width:${Math.round(w * 0.56)}px;transform:translate(-50%,-50%);border-radius:22%;box-shadow:0 ${w * 0.03}px ${w * 0.08}px rgba(0,0,0,0.8)">
      </div></body></html>`);
    await page.waitForTimeout(100);
    await writeFile(`${res}/drawable-port-${d}/splash.png`, await page.screenshot());
    await page.close();
  }
  await writeFile(`${res}/drawable/splash.png`, await resize(key, 480, 320));
  console.log('splash generados');
}

if (what === 'keyart' || what === 'all') await keyArt();
if (what === 'icons' || what === 'all') await icons();
if (what === 'splash' || what === 'all') await splashes();
await browser.close();
server.close();
