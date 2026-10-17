// Sala de espera del modo online: emparejamiento (amistoso y Division Rivals), salas privadas con
// código, reenvío de mensajes entre los dos jugadores de cada partido y resultados de Rivals.
//
// El partido se simula en el navegador del anfitrión (host): el servidor solo empareja y reenvía.
// Así basta un servidor gratuito pequeño (Render, Railway, Fly… o tu propio PC en la red local).
import { applyRivals, divisionInfo } from './divisions.mjs';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Duración (min reales) de cada parte en Rivals y amistosos rápidos. */
export const ONLINE_HALF_MIN = 4;
/** Tiempo máximo que se espera el informe de resultado del segundo jugador. */
const RESULT_WAIT_MS = 15000;

function clean(name) {
  const s = String(name ?? '').replace(/[<>&"'`\u0000-\u001f]/g, '').trim().slice(0, 16);
  return s || 'Jugador';
}

/** Espectadores como máximo por partido de sala privada. */
const MAX_SPECTATORS = 10;

export class Lobby {
  /**
   * @param {{ get(id: string): any, set(id: string, rec: any): void, top(n: number): any[] }} store
   * @param {{ now?: () => number, random?: () => number }} [opts]
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    /** @type {Set<any>} */
    this.clients = new Set();
    /** colas de emparejamiento */
    this.queues = { friendly: [], rivals: [] };
    /** salas privadas por código */
    this.rooms = new Map();
    /** Partidos de sala privada que se pueden mirar como espectador (código de la sala → partido). */
    this.watchable = new Map();
    /** partidos en curso por id */
    this.matches = new Map();
    this.nextMatch = 1;
  }

  /** Nueva conexión (ws: objeto con send(str), close() y on('message'|'close')). */
  connect(ws) {
    const c = { ws, id: null, name: 'Jugador', team: null, state: 'idle', queuedAt: 0, mode: null, match: null, room: null, watching: null, alive: true };
    this.clients.add(c);
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg && typeof msg.t === 'string') this.handle(c, msg);
    });
    ws.on('close', () => this.disconnect(c));
    ws.on('pong', () => { c.alive = true; c.missed = 0; });
    return c;
  }

  send(c, msg) {
    try {
      c.ws.send(JSON.stringify(msg));
    } catch {
      /* conexión cerrada */
    }
  }

  record(c) {
    let rec = this.store.get(c.id);
    if (!rec) {
      rec = { name: c.name, points: 0, wins: 0, draws: 0, losses: 0, best: 0 };
      this.store.set(c.id, rec);
    }
    return rec;
  }

  profile(c) {
    const rec = this.record(c);
    return { name: c.name, team: c.team, points: rec.points, wins: rec.wins, draws: rec.draws, losses: rec.losses, division: divisionInfo(rec.points) };
  }

  handle(c, msg) {
    if (msg.t === 'hello') {
      // id secreto generado por el cliente (identifica su progreso en Rivals)
      c.id = /^[a-zA-Z0-9-]{12,64}$/.test(msg.id ?? '') ? msg.id : `anon-${Math.floor(this.random() * 1e12)}`;
      c.name = clean(msg.name);
      const rec = this.record(c);
      rec.name = c.name;
      this.store.set(c.id, rec);
      this.send(c, { t: 'welcome', profile: this.profile(c), online: this.clients.size, playing: this.matches.size * 2 });
      return;
    }
    if (!c.id) return; // hay que saludar primero
    switch (msg.t) {
      case 'ping':
        this.send(c, { t: 'pong', at: msg.at });
        break;
      case 'queue':
        this.leaveAll(c);
        c.team = typeof msg.team === 'string' ? msg.team.slice(0, 24) : null;
        c.mode = msg.mode === 'rivals' ? 'rivals' : 'friendly';
        c.state = 'queue';
        c.queuedAt = this.now();
        this.queues[c.mode].push(c);
        this.send(c, { t: 'queued', mode: c.mode });
        this.matchmake();
        break;
      case 'cancel':
        this.leaveAll(c);
        this.send(c, { t: 'cancelled' });
        break;
      case 'create': {
        this.leaveAll(c);
        let code;
        do {
          code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(this.random() * CODE_CHARS.length)]).join('');
        } while (this.rooms.has(code));
        c.team = typeof msg.team === 'string' ? msg.team.slice(0, 24) : null;
        const half = Math.min(10, Math.max(2, Number(msg.half) || ONLINE_HALF_MIN));
        this.rooms.set(code, { code, host: c, half });
        c.room = code;
        c.state = 'room';
        this.send(c, { t: 'room', code, half });
        break;
      }
      case 'join': {
        const code = String(msg.code ?? '').toUpperCase().trim();
        const room = this.rooms.get(code);
        if (!room || room.host === c) {
          this.send(c, { t: 'error', text: 'No existe ninguna sala con ese código' });
          return;
        }
        this.leaveAll(c);
        c.team = typeof msg.team === 'string' ? msg.team.slice(0, 24) : null;
        this.rooms.delete(code);
        room.host.room = null;
        const m = this.startMatch(room.host, c, 'friendly', room.half);
        m.code = code;
        this.watchable.set(code, m);
        break;
      }
      case 'watch': {
        const code = String(msg.code ?? '').toUpperCase().trim();
        const m = this.watchable.get(code);
        if (!m || m.over) {
          this.send(c, { t: 'error', text: 'No hay ningún partido en juego con ese código' });
          return;
        }
        if (m.spectators.size >= MAX_SPECTATORS) {
          this.send(c, { t: 'error', text: 'Ese partido ya tiene el máximo de espectadores' });
          return;
        }
        this.leaveAll(c);
        m.spectators.add(c);
        c.watching = m;
        c.state = 'watch';
        this.send(c, { ...m.start, role: 'spectator' });
        for (const p of [m.host, m.guest]) this.send(p, { t: 'spectators', n: m.spectators.size });
        break;
      }
      case 'relay': {
        const m = c.match;
        if (!m || m.over) return;
        const other = m.host === c ? m.guest : m.host;
        this.send(other, { t: 'relay', d: msg.d });
        // los espectadores reciben las instantáneas del anfitrión
        if (m.host === c && m.spectators.size && msg.d && msg.d.k === 's') for (const s of m.spectators) this.send(s, { t: 'relay', d: msg.d });
        break;
      }
      case 'result':
        this.result(c, msg);
        break;
      case 'leave':
        this.leaveAll(c);
        break;
      case 'leaderboard':
        this.send(c, { t: 'leaderboard', rows: this.store.top(20).map((r) => ({ name: r.name, points: r.points, wins: r.wins, division: divisionInfo(r.points).name })) });
        break;
      case 'profile':
        this.send(c, { t: 'profile', profile: this.profile(c) });
        break;
    }
  }

  /** Empareja a los que esperan. Rivals: por puntos, ampliando el margen cuanto más se espera. */
  matchmake() {
    const now = this.now();
    const fq = this.queues.friendly;
    while (fq.length >= 2) {
      const a = fq.shift();
      const b = fq.shift();
      this.startMatch(a, b, 'friendly', ONLINE_HALF_MIN);
    }
    const rq = this.queues.rivals;
    for (let i = 0; i < rq.length; i++) {
      const a = rq[i];
      const pa = this.record(a).points;
      let best = -1;
      let bestGap = Infinity;
      for (let j = i + 1; j < rq.length; j++) {
        const b = rq[j];
        if (b.id === a.id) continue;
        const gap = Math.abs(this.record(b).points - pa);
        const wait = Math.max(now - a.queuedAt, now - b.queuedAt) / 1000;
        const allowed = 150 + wait * 25;
        if (gap <= allowed && gap < bestGap) {
          best = j;
          bestGap = gap;
        }
      }
      if (best >= 0) {
        const b = rq[best];
        rq.splice(best, 1);
        rq.splice(i, 1);
        i--;
        this.startMatch(a, b, 'rivals', ONLINE_HALF_MIN);
      }
    }
  }

  startMatch(host, guest, mode, half) {
    this.removeFromQueues(host);
    this.removeFromQueues(guest);
    const id = `m${this.nextMatch++}`;
    const seed = Math.floor(this.random() * 1e9);
    const m = { id, mode, host, guest, seed, half, startedAt: this.now(), results: new Map(), over: false, timer: null, spectators: new Set(), code: null, start: null };
    this.matches.set(id, m);
    for (const c of [host, guest]) {
      c.state = 'match';
      c.match = m;
    }
    const base = { t: 'match', id, mode, seed, half, home: this.profile(host), away: this.profile(guest) };
    m.start = base;
    this.send(host, { ...base, role: 'host' });
    this.send(guest, { ...base, role: 'guest' });
    return m;
  }

  /** Resultado de un partido. En Rivals se exige que coincida el de los dos (o el del que queda). */
  result(c, msg) {
    const m = c.match;
    if (!m || m.over) return;
    const home = Math.max(0, Math.min(99, Math.floor(Number(msg.home) || 0)));
    const away = Math.max(0, Math.min(99, Math.floor(Number(msg.away) || 0)));
    m.results.set(c, { home, away, pens: msg.pens === 0 || msg.pens === 1 ? msg.pens : -1 });
    if (m.results.size === 2) this.finishMatch(m);
    else if (!m.timer) m.timer = setTimeout(() => this.finishMatch(m), RESULT_WAIT_MS);
  }

  finishMatch(m, forfeiter = null) {
    if (m.over) return;
    m.over = true;
    if (m.timer) clearTimeout(m.timer);
    this.matches.delete(m.id);
    if (m.code) this.watchable.delete(m.code);
    for (const s of m.spectators) {
      s.watching = null;
      s.state = 'idle';
      this.send(s, { t: 'watchEnd', forfeit: !!forfeiter });
    }
    m.spectators.clear();
    const players = [m.host, m.guest];
    let outcome = null;
    if (forfeiter) {
      outcome = { home: forfeiter === m.host ? 0 : 3, away: forfeiter === m.host ? 3 : 0, pens: -1, forfeit: forfeiter === m.host ? 0 : 1 };
    } else {
      const rs = [...m.results.values()];
      const agree = rs.length === 1 || (rs[0].home === rs[1].home && rs[0].away === rs[1].away && rs[0].pens === rs[1].pens);
      if (rs.length && agree) outcome = { ...rs[0], forfeit: -1 };
    }
    let changes = [null, null];
    if (m.mode === 'rivals' && outcome) {
      const [rh, ra] = [this.record(m.host), this.record(m.guest)];
      const [ph, pa] = [rh.points, ra.points];
      // en los penales, el ganador cuenta como victoria por la mínima
      let gh = outcome.home;
      let ga = outcome.away;
      if (gh === ga && outcome.pens >= 0) {
        if (outcome.pens === 0) gh++;
        else ga++;
      }
      changes = [
        applyRivals(rh, gh, ga, pa, outcome.forfeit === 0),
        applyRivals(ra, ga, gh, ph, outcome.forfeit === 1),
      ];
      this.store.set(m.host.id, rh);
      this.store.set(m.guest.id, ra);
    }
    players.forEach((c, i) => {
      if (c.match === m) {
        c.match = null;
        c.state = 'idle';
      }
      this.send(c, {
        t: 'final', id: m.id, mode: m.mode, outcome, change: changes[i],
        profile: this.profile(c), disputed: !outcome,
      });
    });
  }

  removeFromQueues(c) {
    for (const q of Object.values(this.queues)) {
      const i = q.indexOf(c);
      if (i >= 0) q.splice(i, 1);
    }
  }

  /** Sale de colas, salas y partidos (abandonar un partido en curso = derrota en Rivals). */
  leaveAll(c) {
    this.removeFromQueues(c);
    if (c.watching) {
      const w = c.watching;
      w.spectators.delete(c);
      c.watching = null;
      if (!w.over) for (const p of [w.host, w.guest]) this.send(p, { t: 'spectators', n: w.spectators.size });
    }
    if (c.room) {
      this.rooms.delete(c.room);
      c.room = null;
    }
    const m = c.match;
    if (m && !m.over) {
      const other = m.host === c ? m.guest : m.host;
      this.send(other, { t: 'opponentLeft' });
      // si ya había informado del resultado (fin del partido), no es un abandono
      if (m.results.has(c)) this.finishMatch(m);
      else this.finishMatch(m, c);
    }
    c.match = null;
    c.state = 'idle';
  }

  disconnect(c) {
    this.leaveAll(c);
    this.clients.delete(c);
  }

  /** Comprueba conexiones muertas (llamar cada ~15 s). */
  heartbeat() {
    for (const c of this.clients) {
      // se tolera un latido sin respuesta (p. ej. un móvil que cargó la escena con la página congelada)
      if (!c.alive) c.missed = (c.missed ?? 0) + 1;
      if (!c.alive && c.missed >= 2) {
        try {
          c.ws.terminate?.();
        } catch {
          /* */
        }
        this.disconnect(c);
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping?.();
      } catch {
        /* */
      }
    }
    this.matchmake();
  }
}
