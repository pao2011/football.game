import { HALF_LENGTH, HALF_WIDTH } from '../config/constants';
import type { HumanController } from '../control/HumanController';
import type { Match } from '../sim/Match';
import type { MatchEvent } from '../sim/types';
import { RESTART_LABELS } from '../sim/SetPieces';
import type { Bindings } from '../input/Input';
import { keyLabel } from '../input/Input';
import type { StadiumData } from '../data/types';
import { crestSVG } from './Crest';

const ACTION_NAMES: Record<string, string> = { pass: 'PASE', through: 'PASE AL HUECO', lob: 'PASE ELEVADO', shoot: 'TIRO' };

/** HUD del partido en DOM: marcador, reloj, radar, jugador controlado, potencia y avisos. */
export class HUD {
  readonly root: HTMLDivElement;
  private sbHome: HTMLElement;
  private sbAway: HTMLElement;
  private sbScore: HTMLElement;
  private sbClock: HTMLElement;
  private sbAdded: HTMLElement;
  private banner: HTMLElement;
  private mentality: HTMLElement;
  private toast: HTMLElement;
  private ptag: HTMLElement;
  private power: HTMLElement;
  private powerFill: HTMLElement;
  private powerLbl: HTMLElement;
  private radar: HTMLCanvasElement;
  private hint: HTMLElement;
  private replayTag: HTMLElement;
  private shootout: HTMLElement;
  private fps: HTMLElement;
  private bannerUntil = 0;
  private toastUntil = 0;
  private lastText = new Map<HTMLElement, string>();
  private frames = 0;
  private fpsAcc = 0;
  showRadar = true;
  /** Avisos emergentes y ayuda de controles (desactivados por defecto). */
  popups = false;
  showFps = false;
  private intro: HTMLElement | null = null;
  private lastHalf = 1;

  constructor(parent: HTMLElement, private match: Match, private ctrl: HumanController | null, private bindings: Bindings) {
    const r = document.createElement('div');
    r.className = 'hud';
    const [h, a] = match.teams;
    r.innerHTML = `
      <div class="scoreboard">
        <div class="sb-team"><span class="chip" style="background:${h.kit.shirt}"></span><span class="h">${h.data.short}</span></div>
        <div class="sb-score">0 - 0</div>
        <div class="sb-team"><span class="a">${a.data.short}</span><span class="chip" style="background:${a.kit.shirt}"></span></div>
        <div class="sb-clock">00:00</div>
        <div class="sb-added hidden">+1</div>
      </div>
      <div class="mentality hidden"></div>
      <div class="banner hidden"></div>
      <div class="toast hidden"></div>
      <div class="player-tag hidden"><div class="nm"></div><div class="meta"></div><div class="stamina"><div></div></div></div>
      <div class="powerbar hidden"><div class="lbl"></div><div class="track"><div class="fill"></div></div></div>
      <canvas class="radar" width="210" height="136"></canvas>
      <div class="hint hidden"></div>
      <div class="replay-tag hidden">REPETICIÓN</div>
      <div class="shootout hidden"></div>
      <div class="fps hidden"></div>`;
    parent.appendChild(r);
    this.root = r;
    const q = (s: string) => r.querySelector(s) as HTMLElement;
    this.sbHome = q('.sb-team .h');
    this.sbAway = q('.sb-team .a');
    this.sbScore = q('.sb-score');
    this.sbClock = q('.sb-clock');
    this.sbAdded = q('.sb-added');
    this.banner = q('.banner');
    this.mentality = q('.mentality');
    this.toast = q('.toast');
    this.ptag = q('.player-tag');
    this.power = q('.powerbar');
    this.powerFill = q('.powerbar .fill');
    this.powerLbl = q('.powerbar .lbl');
    this.radar = r.querySelector('.radar') as HTMLCanvasElement;
    this.hint = q('.hint');
    this.replayTag = q('.replay-tag');
    this.shootout = q('.shootout');
    this.fps = q('.fps');
    void this.sbHome;
    void this.sbAway;
  }

  private setText(el: HTMLElement, text: string, html = false) {
    if (this.lastText.get(el) === text) return;
    this.lastText.set(el, text);
    if (html) el.innerHTML = text; else el.textContent = text;
  }

  private show(el: HTMLElement, v: boolean) {
    el.classList.toggle('hidden', !v);
  }

  showBanner(text: string, sub = '', color = '#fff', duration = 2.5) {
    this.banner.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.banner.style.color = color;
    this.show(this.banner, true);
    // reiniciar animación
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';
    this.bannerUntil = this.match.time + duration;
  }

  /** Presentación del partido: estadio, escudos y nombres de los equipos y el aviso de inicio. */
  playIntro(stadium: StadiumData, onSkip: () => void) {
    const [h, a] = this.match.teams;
    const el = document.createElement('div');
    el.className = 'match-intro';
    el.style.setProperty('--home', h.kit.shirt);
    el.style.setProperty('--away', a.kit.shirt);
    const team = (t: typeof h, cls: string) => `<div class="mi-team ${cls}">
        <div class="mi-crest">${crestSVG(t.data, 96)}</div>
        <b>${t.data.name}</b><small>${t.data.city} · ${t.formation}</small></div>`;
    el.innerHTML = `
      <div class="mi-bar mi-bar-h"></div><div class="mi-bar mi-bar-a"></div>
      <div class="mi-top">${stadium.name.toUpperCase()}<small>${stadium.capacity.toLocaleString('es-ES')} espectadores</small></div>
      <div class="mi-row">${team(h, 'mi-home')}<div class="mi-vs">VS</div>${team(a, 'mi-away')}</div>
      <div class="mi-go">¡COMIENZA EL PARTIDO!</div>
      <div class="mi-skip">toca para saltar</div>`;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); onSkip(); });
    this.root.appendChild(el);
    this.intro = el;
  }

  endIntro() {
    const el = this.intro;
    if (!el) return;
    this.intro = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 380);
  }

  showToast(html: string, color = '#ffcf3f', duration = 2.2) {
    if (!this.popups) return;
    this.toast.innerHTML = html;
    this.toast.style.borderLeftColor = color;
    this.show(this.toast, true);
    this.toastUntil = this.match.time + duration;
  }

  onEvent(e: MatchEvent) {
    const m = this.match;
    const teamName = (i?: number) => (i === undefined ? '' : m.teams[i].data.name);
    switch (e.type) {
      case 'goal':
        if (e.kind === 'shootout') this.showToast(`⚽ ${e.text ?? ''} marca`, '#19e68c', 1.8);
        else this.showBanner('¡GOOOL!', `${e.text ?? ''}${e.kind === 'own' ? ' (en propia puerta)' : ''} · ${teamName(e.team)}`, '#ffffff', 3.4);
        break;
      case 'save':
        if (e.kind === 'shootout') this.showToast(`✋ ¡Atajado! (${e.text ?? ''})`, '#2fb4ff', 1.8);
        else if (e.kind === 'shot') this.showToast('¡Atajada!', '#2fb4ff', 1.4);
        break;
      case 'foul':
        this.showToast(`Falta de ${teamName(e.team)}`, '#ffcf3f');
        break;
      case 'card': {
        const col = e.kind === 'yellow' ? '#ffd400' : '#ff2b3b';
        const label = e.kind === 'yellow' ? 'Tarjeta amarilla' : e.kind === 'second' ? 'Segunda amarilla · Expulsado' : 'Tarjeta roja · Expulsado';
        this.showToast(`<span class="card-icon" style="background:${col}"></span>${label}: ${e.text ?? ''}`, col, 3);
        break;
      }
      case 'offside':
        this.showToast(`Fuera de juego · ${teamName(e.team)}`, '#ff4d5e');
        break;
      case 'skill':
        // regates: nombre del regate del jugador humano, y aviso cuando supera al rival
        if (e.kind === 'beat') this.showToast(`¡${e.text}! Rival superado`, '#19e68c', 1.2);
        else if (m.teams[e.team ?? 0]?.human) this.showToast(e.text ?? '', '#2fb4ff', 0.9);
        break;
      case 'nearMiss':
        this.showToast('¡Cerca!', '#ffffff', 1.2);
        break;
      case 'phase':
        if (e.kind === 'added') this.showToast(`Tiempo añadido: ${e.text} min`, '#ff4d5e', 3);
        if (e.kind === 'halftime') this.showBanner(m.half === 2 ? 'FINAL DEL TIEMPO REGLAMENTARIO' : m.half >= 3 ? 'DESCANSO PRÓRROGA' : 'DESCANSO', `${m.teams[0].stats.goals} - ${m.teams[1].stats.goals}`, '#fff', 3);
        if (e.kind === 'fulltime') this.showBanner('FINAL DEL PARTIDO', `${m.teams[0].data.short} ${m.teams[0].stats.goals} - ${m.teams[1].stats.goals} ${m.teams[1].data.short}`, '#fff', 6);
        if (e.kind === 'shootout') this.showBanner('TANDA DE PENALES', '', '#ffcf3f', 3);
        if (e.kind === 'stoppage' || e.kind === 'kickoff') {
          const label = RESTART_LABELS[e.text as keyof typeof RESTART_LABELS];
          if (label && e.text !== 'kickoff') this.showToast(label, '#2fb4ff', 1.6);
        }
        break;
    }
  }

  update(dt: number) {
    const m = this.match;
    // mentalidad (cruceta ← → del mando)
    const ht = m.teams.find((t) => t.human);
    if (ht) {
      const names = ['ULTRADEFENSIVA', 'DEFENSIVA', 'EQUILIBRADA', 'OFENSIVA', 'ULTRAOFENSIVA'];
      const recent = !!this.ctrl && m.time - this.ctrl.mentalityShownAt < 2;
      const show = ht.mentality !== 0 || recent;
      this.show(this.mentality, show);
      if (show) this.setText(this.mentality, `<span class="bars">${'▮'.repeat(ht.mentality + 3)}${'▯'.repeat(2 - ht.mentality)}</span> ${names[ht.mentality + 2]}`, true);
    }
    if (m.half !== this.lastHalf) {
      this.lastHalf = m.half;
      if (m.phase === 'kickoff') this.showBanner(m.half === 2 ? 'SEGUNDO TIEMPO' : m.half === 3 ? 'PRÓRROGA' : 'SEGUNDO TIEMPO DE LA PRÓRROGA', '', '#fff', 2.5);
    }
    const [h, a] = m.teams;
    this.setText(this.sbScore, `${h.stats.goals} - ${a.stats.goals}`);
    this.setText(this.sbClock, m.config.training ? 'ENTRENO' : m.clockText.split(' ')[0]);
    const added = m.announcedAdded > 0 && m.matchSeconds >= m.halfEndSeconds;
    this.show(this.sbAdded, added);
    if (added) this.setText(this.sbAdded, `+${m.announcedAdded}`);
    if (m.time > this.bannerUntil || m.phase === 'replay') this.show(this.banner, false);
    if (m.time > this.toastUntil) this.show(this.toast, false);
    this.show(this.replayTag, m.phase === 'replay');

    // Jugador controlado
    const human = m.teams.find((t) => t.human);
    const c = human?.controlled;
    this.show(this.ptag, !!c && m.phase !== 'replay');
    if (c) {
      this.setText(this.ptag.querySelector('.nm') as HTMLElement, `${c.data.number} · ${c.data.name}`);
      this.setText(this.ptag.querySelector('.meta') as HTMLElement, `${c.slot.role} · VEL ${c.data.attrs.speed} · PAS ${c.data.attrs.passing} · TIR ${c.data.attrs.shooting}`);
      (this.ptag.querySelector('.stamina > div') as HTMLElement).style.width = `${Math.round(c.stamina * 100)}%`;
    }
    // Barra de potencia
    const ch = this.ctrl?.charge ?? (this.ctrl?.lastCharge && m.time - this.ctrl.lastCharge.at < 0.6 ? this.ctrl.lastCharge : null);
    this.show(this.power, !!ch && m.phase !== 'replay');
    if (ch) {
      this.powerFill.style.width = `${Math.round(ch.value * 100)}%`;
      this.setText(this.powerLbl, ch.label ?? ACTION_NAMES[ch.action] ?? '');
    }
    // Ayuda contextual en balón parado
    this.updateHint();
    // Penales
    this.updateShootout();
    // Radar
    this.show(this.radar, this.showRadar && m.phase !== 'replay');
    if (this.showRadar) this.drawRadar();
    // FPS
    this.frames++;
    this.fpsAcc += dt;
    if (this.fpsAcc > 0.5) {
      this.setText(this.fps, `${Math.round(this.frames / this.fpsAcc)} FPS`);
      this.frames = 0;
      this.fpsAcc = 0;
    }
    this.show(this.fps, this.showFps);
  }

  private k(action: keyof Bindings) {
    if (document.body.classList.contains('touch')) {
      const t: Partial<Record<keyof Bindings, string>> = { pass: 'PASE', shoot: 'TIRO', lob: 'ELEVADO', through: 'AL HUECO', finesse: 'ROSCA', sprint: 'SPRINT', switch: 'CAMBIAR' };
      return `<span class="keycap">${t[action] ?? keyLabel(this.bindings[action][0])}</span>`;
    }
    return `<span class="keycap">${keyLabel(this.bindings[action][0])}</span>`;
  }

  private updateHint() {
    const m = this.match;
    const human = m.teams.find((t) => t.human);
    let html = '';
    const r = m.restart;
    if (human && r && (m.phase === 'stoppage' || m.phase === 'kickoff' || m.phase === 'shootout') && r.stage === 'ready') {
      const mine = r.team === human.index;
      const label = RESTART_LABELS[r.type];
      if (mine && human.controlled === r.taker) {
        const map: Record<string, string> = {
          kickoff: `${this.k('pass')} Pase`,
          throwin: `${this.k('pass')} Saque corto · ${this.k('lob')} Saque largo`,
          corner: `${this.k('lob')} Centro · ${this.k('pass')} Pase corto`,
          goalkick: `${this.k('pass')} Pase corto · ${this.k('lob')} Despeje largo`,
          freekick: `${this.k('shoot')} Tiro (+${this.k('finesse')} con rosca) · ${this.k('pass')} Pase · ${this.k('lob')} Centro`,
          indirect: `${this.k('pass')} Pase · ${this.k('lob')} Pase elevado`,
          penalty: `Apunta con ${document.body.classList.contains('touch') ? 'el joystick' : 'las flechas'} y mantén ${this.k('shoot')} para la potencia`,
          dropball: `${this.k('pass')} Pase`,
        };
        if (r.type === 'freekick' && this.ctrl?.freeKick) {
          const touch = document.body.classList.contains('touch');
          map.freekick = touch
            ? 'Joystick: mira · EFECTO ↶ ↷: curva · mantén TIRO: potencia · PASE / ELEVADO: jugada'
            : `Flechas: mira · ${this.k('skillLeft')} / ${this.k('skillRight')}: efecto · mantén ${this.k('shoot')}: potencia · ${this.k('pass')} Pase · ${this.k('lob')} Centro`;
        }
        html = `<b>${label.toUpperCase()}</b><br>${map[r.type] ?? ''}`;
      } else if (!mine && r.type === 'penalty') {
        html = `<b>PENAL EN CONTRA</b><br>Mantén ${document.body.classList.contains('touch') ? 'el joystick' : '← / → (o ↑ ↓)'} hacia un lado para elegir la estirada del arquero`;
      }
    }
    if (!this.popups) html = '';
    this.show(this.hint, !!html);
    if (html) this.setText(this.hint, html, true);
  }

  private updateShootout() {
    const s = this.match.shootout;
    this.show(this.shootout, !!s);
    if (!s) return;
    const row = (i: 0 | 1) => {
      const t = this.match.teams[i];
      const dots = s.kicks[i].map((k) => `<span class="dot ${k ? 'g' : 'm'}"></span>`).join('');
      const empty = Array.from({ length: Math.max(0, 5 - s.kicks[i].length) }, () => '<span class="dot"></span>').join('');
      return `<div class="sr"><span style="width:46px">${t.data.short}</span>${dots}${empty}<span style="margin-left:8px">${s.kicks[i].filter(Boolean).length}</span></div>`;
    };
    this.setText(this.shootout, row(0) + row(1), true);
  }

  private drawRadar() {
    const m = this.match;
    const cv = this.radar;
    const g = cv.getContext('2d')!;
    const W = cv.width;
    const H = cv.height;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 1;
    g.strokeRect(4, 4, W - 8, H - 8);
    g.beginPath();
    g.moveTo(W / 2, 4);
    g.lineTo(W / 2, H - 4);
    g.stroke();
    g.beginPath();
    g.arc(W / 2, H / 2, 16, 0, Math.PI * 2);
    g.stroke();
    const sx = (x: number) => 4 + ((x + HALF_LENGTH) / (HALF_LENGTH * 2)) * (W - 8);
    // la cámara mira desde +z: arriba en pantalla = -z
    const sz = (z: number) => 4 + ((z + HALF_WIDTH) / (HALF_WIDTH * 2)) * (H - 8);
    g.strokeRect(4, sz(-20.16), (16.5 / 105) * (W - 8), sz(20.16) - sz(-20.16));
    g.strokeRect(W - 4 - (16.5 / 105) * (W - 8), sz(-20.16), (16.5 / 105) * (W - 8), sz(20.16) - sz(-20.16));
    for (const t of m.teams) {
      for (const p of t.active) {
        g.fillStyle = t.kit.shirt;
        g.beginPath();
        g.arc(sx(p.pos.x), sz(p.pos.z), p === t.controlled ? 4.5 : 3.2, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = p === t.controlled ? '#ffd23f' : 'rgba(0,0,0,0.7)';
        g.lineWidth = p === t.controlled ? 2 : 1;
        g.stroke();
      }
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(sx(m.ball.pos.x), sz(m.ball.pos.z), 2.6, 0, Math.PI * 2);
    g.fill();
  }

  dispose() {
    this.root.remove();
  }
}
