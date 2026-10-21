import type { TeamData } from '../data/types';
import type { AudioEngine } from '../audio/AudioEngine';
import { crestSVG } from './Crest';
import { esc } from './dom';

const SEEN_KEY = 'football-elite-3d:ceremonies';

/** Ceremonias ya mostradas (para no repetirlas cada vez que se abre el menú de la competición). */
function seen(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; }
}
export function ceremonySeen(key: string): boolean { return seen().includes(key); }
export function markCeremonySeen(key: string) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen().slice(-60), key])); } catch { /* sin almacenamiento */ }
}

const TROPHY = `<svg viewBox="0 0 200 270" class="cc-trophy-svg" aria-hidden="true">
  <defs>
    <linearGradient id="ccg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6a08"/><stop offset=".3" stop-color="#ffe27a"/><stop offset=".55" stop-color="#f6b40e"/><stop offset="1" stop-color="#8a5a05"/></linearGradient>
    <linearGradient id="ccb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a63"/><stop offset="1" stop-color="#0a1030"/></linearGradient>
  </defs>
  <path d="M46 52C8 52 6 112 62 124" fill="none" stroke="url(#ccg)" stroke-width="11" stroke-linecap="round"/>
  <path d="M154 52C192 52 194 112 138 124" fill="none" stroke="url(#ccg)" stroke-width="11" stroke-linecap="round"/>
  <path d="M42 34H158C158 104 138 156 100 168C62 156 42 104 42 34Z" fill="url(#ccg)"/>
  <ellipse cx="100" cy="34" rx="58" ry="9" fill="#ffe9a0"/><ellipse cx="100" cy="34" rx="50" ry="6" fill="#7a4d04"/>
  <path d="M58 50C58 98 70 134 92 150" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="7" stroke-linecap="round"/>
  <path d="M90 166H110L116 214H84Z" fill="url(#ccg)"/>
  <rect x="64" y="212" width="72" height="16" rx="3" fill="url(#ccg)"/>
  <rect x="52" y="226" width="96" height="30" rx="4" fill="url(#ccb)" stroke="#f6b40e" stroke-width="3"/>
  <rect x="60" y="236" width="80" height="4" rx="2" fill="#f6b40e"/><rect x="72" y="244" width="56" height="3" rx="1.5" fill="#f6b40e" opacity=".7"/>
  <path class="cc-shine" d="M70 40L84 40L60 150L46 150Z" fill="#fff" opacity="0"/>
</svg>`;

export interface CeremonyOpts {
  team: TeamData;
  /** Nombre de la copa: "Copa Élite", "Libertadores"… */
  cup: string;
  /** Línea secundaria (temporada, fase…). */
  detail?: string;
  /** El campeón es el equipo del usuario. */
  user: boolean;
  logo?: string;
  audio?: AudioEngine;
  onClose?: () => void;
}

/**
 * Ceremonia de campeón: rayos de luz, trofeo que sube con el escudo del campeón, confeti con los colores del club,
 * nombre de la copa y del equipo. Se cierra con un toque o Enter/Esc (pasado un instante).
 */
export function playCeremony(parent: HTMLElement, o: CeremonyOpts): () => void {
  const el = document.createElement('div');
  el.className = 'cup-cer';
  el.style.setProperty('--c1', o.team.crest.primary);
  el.style.setProperty('--c2', o.team.crest.secondary);
  el.innerHTML = `
    <div class="cc-rays"></div><div class="cc-vignette"></div>
    <canvas class="cc-confetti"></canvas>
    <div class="cc-stage">
      <div class="cc-kicker">${o.user ? '¡LO LOGRASTE!' : 'NUEVO CAMPEÓN'}</div>
      <div class="cc-trophy">${TROPHY}<div class="cc-crest">${crestSVG(o.team, 120)}</div></div>
      <div class="cc-title">CAMPEÓN</div>
      <div class="cc-team">${esc(o.team.name)}</div>
      <div class="cc-cup">${o.logo ? `<img src="${o.logo}" alt="">` : ''}<span>${esc(o.cup)}</span></div>
      ${o.detail ? `<div class="cc-detail">${esc(o.detail)}</div>` : ''}
      <div class="cc-tap">toca para continuar</div>
    </div>`;
  parent.appendChild(el);

  // ----- confeti -----
  const canvas = el.querySelector('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  const colors = [o.team.crest.primary, o.team.crest.secondary, '#74acdf', '#ffffff', '#f6b40e'];
  type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; life: number };
  let parts: P[] = [];
  let W = 0, H = 0, raf = 0, t0 = performance.now(), last = t0, closed = false;
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const burst = (x: number, dir: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (-Math.PI / 2) + dir * (Math.random() * 0.9);
      const sp = 380 + Math.random() * 520;
      parts.push({ x, y: H * 0.85, vx: dir * sp * (0.25 + Math.random() * 0.55), vy: -Math.abs(Math.sin(a)) * sp - 120, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, w: 6 + Math.random() * 7, h: 10 + Math.random() * 8, c: colors[(Math.random() * colors.length) | 0], life: 4.5 + Math.random() * 2 });
    }
  };
  const rain = (n: number) => {
    for (let i = 0; i < n; i++) parts.push({ x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 80, vy: 90 + Math.random() * 160, r: Math.random() * 6, vr: (Math.random() - 0.5) * 8, w: 6 + Math.random() * 6, h: 9 + Math.random() * 8, c: colors[(Math.random() * colors.length) | 0], life: 6 });
  };
  let bursted = false;
  const frame = (now: number) => {
    if (closed || !ctx) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    if (!bursted && t > 0.9) { bursted = true; burst(W * 0.08, 1, 90); burst(W * 0.92, -1, 90); try { o.audio?.cheer(1); } catch { /* sin audio */ } }
    if (t > 1.2 && t < 9) rain(Math.random() < 0.5 ? 2 : 1);
    ctx.clearRect(0, 0, W, H);
    parts = parts.filter((p) => p.life > 0 && p.y < H + 30);
    for (const p of parts) {
      p.vy += 520 * dt; p.vx *= 1 - 0.6 * dt; p.vy *= 1 - 0.25 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.life -= dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.c; ctx.scale(1, Math.cos(p.r * 1.7)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    raf = requestAnimationFrame(frame);
  };
  fit();
  window.addEventListener('resize', fit);
  raf = requestAnimationFrame(frame);
  try { o.audio?.whistle('final'); } catch { /* sin audio */ }

  // ----- cierre -----
  const opened = performance.now();
  const close = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', fit);
    window.removeEventListener('keydown', key, true);
    el.classList.add('out');
    setTimeout(() => { el.remove(); o.onClose?.(); }, 400);
  };
  const tryClose = () => { if (performance.now() - opened > 1400) close(); };
  const key = (e: KeyboardEvent) => { if (['Enter', 'Escape', 'Space', 'NumpadEnter'].includes(e.code)) { e.stopPropagation(); e.preventDefault(); tryClose(); } };
  el.addEventListener('pointerdown', tryClose);
  window.addEventListener('keydown', key, true);
  return close;
}
