import { loadJSON, saveJSON } from '../save/Storage';
import type { DivisionInfo } from '../../server/divisions.mjs';

// Conexión con el servidor online (WebSocket). Gratis: el servidor de `server/` se puede abrir en tu PC
// (`npm run server`, para jugar en la red local) o publicar con un clic en un plan gratuito (render.yaml).

/** Servidor público predeterminado (el de render.yaml). Se puede cambiar en ONLINE → Servidor. */
export const DEFAULT_SERVER = 'wss://football-elite-3d-19vc.onrender.com/ws';

export interface OnlineProfile {
  name: string;
  team: string | null;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  division: DivisionInfo;
}

export interface MatchStart {
  t: 'match';
  id: string;
  mode: 'friendly' | 'rivals';
  role: 'host' | 'guest' | 'spectator';
  seed: number;
  half: number;
  home: OnlineProfile;
  away: OnlineProfile;
}

export interface FinalMsg {
  t: 'final';
  mode: 'friendly' | 'rivals';
  outcome: { home: number; away: number; pens: number; forfeit: number } | null;
  change: { before: number; after: number; delta: number } | null;
  profile: OnlineProfile;
  disputed: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServerMsg = { t: string; [k: string]: any };

/** Id secreto de este dispositivo (su progreso en Division Rivals). */
export function playerId(): string {
  let id = loadJSON<string>('online-id', '');
  if (!/^[a-zA-Z0-9-]{12,64}$/.test(id)) {
    const rnd = typeof crypto !== 'undefined' && crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('') : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    id = `fe3d-${rnd}`;
    saveJSON('online-id', id);
  }
  return id;
}

/** Convierte lo que escribe el jugador (dominio, IP:puerto, URL) en una dirección ws(s)://…/ws. */
export function normalizeServer(input: string): string {
  let s = String(input || '').trim();
  if (!s) return '';
  if (/^https?:\/\//.test(s)) s = s.replace(/^http/, 'ws');
  if (!/^wss?:\/\//.test(s)) {
    // IP, localhost o dirección con puerto = red local (ws://); un dominio = https (wss://)
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3}|[^/]*:\d+)(\/|$)/.test(s);
    s = (local ? 'ws://' : 'wss://') + s;
  }
  if (!/\/ws\/?$/.test(s)) s = s.replace(/\/$/, '') + '/ws';
  return s;
}

/** Servidores a probar, en orden: el configurado, el que sirve la página (si es un servidor del juego; no en la app de Android, que corre en https://localhost) y el público. */
export function serverCandidates(custom: string): string[] {
  const c = normalizeServer(custom);
  if (c) return [c];
  const list: string[] = [];
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/claude|usercontent|github\.io/.test(location.hostname) && !(location.hostname === 'localhost' && !location.port)) {
    // en desarrollo (Vite, puerto 5173) el servidor está en el 8080
    const host = location.port === '5173' ? `${location.hostname}:8080` : location.host;
    list.push(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`);
  }
  list.push(DEFAULT_SERVER);
  return [...new Set(list)];
}

export class NetClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<(m: ServerMsg) => void>();
  url = '';
  profile: OnlineProfile | null = null;
  online = 0;
  /** Latencia (ms) medida con ping. */
  rtt = 0;
  private pingTimer = 0;
  onClose: (() => void) | null = null;

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && !!this.profile;
  }

  /** Conecta (prueba los candidatos en orden) y saluda. */
  async connect(candidates: string[], name: string, onStatus: (text: string) => void, timeoutMs = 75000): Promise<void> {
    this.close();
    const deadline = Date.now() + timeoutMs;
    let lastErr = 'No se pudo conectar';
    let round = 0;
    while (Date.now() < deadline) {
      for (const url of candidates) {
        const isDefault = url === DEFAULT_SERVER;
        onStatus(round === 0 ? `Conectando con ${url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '')}…` : isDefault
          ? 'Despertando el servidor gratuito (la primera conexión del día puede tardar hasta 1 minuto)…'
          : `Reintentando ${url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '')}…`);
        try {
          await this.open(url, name, Math.min(isDefault ? 20000 : 6000, Math.max(1000, deadline - Date.now())));
          return;
        } catch (err) {
          lastErr = (err as Error).message;
        }
      }
      round++;
      // solo el servidor público (que se duerme en el plan gratuito) merece reintentos
      if (!candidates.includes(DEFAULT_SERVER)) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(lastErr);
  }

  private open(url: string, name: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let done = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(new Error(`Dirección no válida: ${url}`));
        return;
      }
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { ws.close(); } catch { /* */ }
        reject(new Error('El servidor no responde'));
      }, timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', id: playerId(), name, v: 1 }));
      ws.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('No se pudo conectar con el servidor'));
      };
      ws.onclose = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(new Error('Conexión cerrada'));
          return;
        }
        if (this.ws === ws) {
          this.ws = null;
          this.profile = null;
          window.clearInterval(this.pingTimer);
          this.onClose?.();
        }
      };
      ws.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.t === 'welcome' && !done) {
          done = true;
          clearTimeout(timer);
          this.ws = ws;
          this.url = url;
          this.profile = msg.profile;
          this.online = msg.online ?? 0;
          saveJSON('online-profile', msg.profile);
          this.pingTimer = window.setInterval(() => this.send({ t: 'ping', at: performance.now() }), 3000);
          resolve();
          return;
        }
        if (msg.t === 'pong' && typeof msg.at === 'number') {
          const r = performance.now() - msg.at;
          this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r;
          return;
        }
        if (msg.t === 'profile' || msg.t === 'final') {
          if (msg.profile) {
            this.profile = msg.profile;
            saveJSON('online-profile', msg.profile);
          }
        }
        for (const h of [...this.handlers]) h(msg);
      };
    });
  }

  on(h: (m: ServerMsg) => void): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  send(msg: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Mensaje para el rival (reenviado por el servidor). */
  relay(d: object) {
    this.send({ t: 'relay', d });
  }

  close() {
    window.clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    this.profile = null;
    if (ws) {
      ws.onclose = null;
      try { ws.close(); } catch { /* */ }
    }
  }
}

/** Última división conocida (copia local por si el servidor gratuito pierde los datos). */
export function cachedProfile(): OnlineProfile | null {
  return loadJSON<OnlineProfile | null>('online-profile', null);
}
