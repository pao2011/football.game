// Cuentas (nombre, correo, contraseña) y copia del progreso para jugar en varios dispositivos.
// Se guardan en DATA_DIR/accounts.json. Contraseñas con scrypt; los tokens de sesión solo se guardan hasheados.
// shortcut: sin verificación de correo ni recuperación de contraseña (no hay servidor de correo); añadirlo si se abre al público.
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, scrypt, createHash, timingSafeEqual } from 'node:crypto';

/** Claves del juego que se sincronizan (progreso). Lo demás (ajustes, id del dispositivo) es del dispositivo. */
export const SYNC_KEYS = ['club', 'career', 'tournament', 'continental', 'achievements', 'customTeams', 'online-profile'];
const MAX_VALUE = 1_500_000;
const MAX_TOKENS = 10;

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hashPw = (pw, salt) => new Promise((res, rej) => scrypt(pw, salt, 32, (e, k) => (e ? rej(e) : res(k))));

export function validate({ name, email, password }) {
  if (typeof name !== 'string' || !/^[\p{L}\p{N}_. -]{3,20}$/u.test(name.trim())) return 'El nombre debe tener entre 3 y 20 letras, números o _ . -';
  if (typeof email !== 'string' || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Correo no válido.';
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return 'La contraseña debe tener entre 8 y 128 caracteres.';
  return null;
}

export class Accounts {
  constructor(dir) {
    this.file = dir ? join(dir, 'accounts.json') : null;
    this.users = new Map(); // id → usuario
    this.dirty = false;
    if (this.file) {
      try {
        mkdirSync(dir, { recursive: true });
        for (const u of Object.values(JSON.parse(readFileSync(this.file, 'utf8')))) this.users.set(u.id, u);
      } catch { /* primer arranque */ }
      this.timer = setInterval(() => this.flush(), 10000);
      this.timer.unref?.();
    }
  }

  find(by, v) {
    v = String(v).trim().toLowerCase();
    for (const u of this.users.values()) if (u[by].toLowerCase() === v) return u;
    return null;
  }

  issue(u) {
    const token = randomBytes(32).toString('hex');
    u.tokens = [...u.tokens, sha(token)].slice(-MAX_TOKENS);
    this.dirty = true;
    return token;
  }

  async register(body) {
    const err = validate(body);
    if (err) return { error: err };
    const name = body.name.trim();
    const email = body.email.trim();
    if (this.find('name', name)) return { error: 'Ese nombre ya está en uso.' };
    if (this.find('email', email)) return { error: 'Ese correo ya tiene una cuenta.' };
    const salt = randomBytes(16);
    const u = { id: randomBytes(8).toString('hex'), name, email, salt: salt.toString('hex'), hash: (await hashPw(body.password, salt)).toString('hex'), tokens: [], created: Date.now(), data: {} };
    this.users.set(u.id, u);
    return { token: this.issue(u), user: this.pub(u) };
  }

  /** `who` = correo o nombre. Mismo mensaje si falla cualquier parte, para no revelar qué cuentas existen. */
  async login({ who, password }) {
    const u = typeof who === 'string' && typeof password === 'string' && password.length <= 128 ? (this.find('email', who) ?? this.find('name', who)) : null;
    const salt = Buffer.from(u ? u.salt : '00'.repeat(16), 'hex');
    const h = await hashPw(typeof password === 'string' ? password.slice(0, 128) : '', salt);
    if (!u || !timingSafeEqual(h, Buffer.from(u.hash, 'hex'))) return { error: 'Datos incorrectos.' };
    return { token: this.issue(u), user: this.pub(u) };
  }

  auth(token) {
    if (typeof token !== 'string' || token.length !== 64) return null;
    const h = sha(token);
    for (const u of this.users.values()) if (u.tokens.includes(h)) return u;
    return null;
  }

  logout(u, token) {
    u.tokens = u.tokens.filter((t) => t !== sha(token));
    this.dirty = true;
  }

  pub(u) { return { name: u.name, email: u.email }; }

  /** Mezcla por clave: gana la escritura más reciente (t en ms). Devuelve el estado completo. */
  sync(u, incoming) {
    for (const [k, e] of Object.entries(incoming && typeof incoming === 'object' ? incoming : {})) {
      if (!SYNC_KEYS.includes(k) || !e || typeof e.v !== 'string' || e.v.length > MAX_VALUE || !Number.isFinite(e.t)) continue;
      if (!u.data[k] || e.t > u.data[k].t) { u.data[k] = { v: e.v, t: Math.min(e.t, Date.now() + 60_000) }; this.dirty = true; }
    }
    return u.data;
  }

  flush() {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.users)));
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('No se pudo guardar accounts.json:', err.message);
    }
  }
}
