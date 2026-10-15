// Almacén de progreso de Division Rivals en un archivo JSON (DATA_DIR/rivals.json).
// Nota: en planes gratuitos con disco efímero (p. ej. Render free) el archivo se pierde al reiniciar
// el servidor; cada jugador guarda además una copia de su división en su propio dispositivo.
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export class JsonStore {
  constructor(dir) {
    this.file = dir ? join(dir, 'rivals.json') : null;
    this.data = new Map();
    this.dirty = false;
    if (this.file) {
      try {
        mkdirSync(dir, { recursive: true });
        const raw = JSON.parse(readFileSync(this.file, 'utf8'));
        for (const [k, v] of Object.entries(raw)) this.data.set(k, v);
      } catch {
        /* primer arranque */
      }
      this.timer = setInterval(() => this.flush(), 10000);
      this.timer.unref?.();
    }
  }

  get(id) {
    return this.data.get(id);
  }

  set(id, rec) {
    this.data.set(id, rec);
    this.dirty = true;
  }

  top(n) {
    return [...this.data.values()].filter((r) => r.wins + r.draws + r.losses > 0).sort((a, b) => b.points - a.points || b.wins - a.wins).slice(0, n);
  }

  flush() {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.data)));
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('No se pudo guardar rivals.json:', err.message);
    }
  }
}
