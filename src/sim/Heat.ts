import { Vector3 } from 'three';
import { HALF_LENGTH, HALF_WIDTH } from '../config/constants';
import { clamp, dist2D } from '../util/math';
import type { Match } from './Match';
import type { Player } from './Player';

/**
 * Partidos calientes (clásicos): roces constantes durante el juego (empujones, agarrones, discusiones que a veces
 * terminan en falta y aviso del árbitro) y, tras las faltas fuertes, peleas entre varios jugadores que el árbitro
 * apacigua con tarjetas. `heat` va de 0 (partido normal) a 1.
 */
export class HeatDirector {
  private timer = 0;
  private lastBrawl = -999;
  private brawls = 0;
  /** Pelea en curso (el juego está detenido). */
  brawl: { start: number; until: number; spot: Vector3; parts: Player[]; instigator: Player } | null = null;

  constructor(private m: Match, readonly heat: number) {}

  get brawling() {
    return !!this.brawl;
  }

  /** Durante el juego: de vez en cuando dos rivales cercanos se empujan. */
  update(dt: number) {
    const m = this.m;
    this.timer += dt;
    if (this.timer < 1) return;
    this.timer = 0;
    if (m.rng.next() > this.heat * 0.14) return;
    const pair = this.findPair(1.9);
    if (!pair) return;
    const [a, b] = pair;
    const aggressor = m.rng.next() < 0.5 ? a : b;
    const victim = aggressor === a ? b : a;
    for (const p of pair) {
      p.startAction('scuffle', 'shove', 0.9);
      p.desiredFacing = Math.atan2((p === a ? b : a).pos.x - p.pos.x, (p === a ? b : a).pos.z - p.pos.z);
    }
    m.emit({ type: 'scuffle', kind: 'shove', team: aggressor.team, playerId: aggressor.id, text: aggressor.data.name, x: aggressor.pos.x, z: aggressor.pos.z });
    // a veces el árbitro corta el juego: aviso verbal (la reiteración, amarilla) y tiro libre para el empujado
    if (m.rng.next() < 0.1 + this.heat * 0.12) this.whistleScuffle(aggressor, victim);
  }

  /** Dos jugadores de campo rivales a menos de `d` metros, ninguno en una acción de juego. */
  private findPair(d: number): [Player, Player] | null {
    const m = this.m;
    const cands: [Player, Player][] = [];
    for (const a of m.teams[0].active) {
      if (a.isGK || a.busy) continue;
      for (const b of m.teams[1].active) {
        if (b.isGK || b.busy) continue;
        if (dist2D(a.pos, b.pos) < d && m.owner !== a && m.owner !== b) cands.push([a, b]);
      }
    }
    return cands.length ? cands[Math.floor(m.rng.next() * cands.length)] : null;
  }

  private whistleScuffle(aggressor: Player, victim: Player) {
    const m = this.m;
    const spot = new Vector3(clamp(victim.pos.x, -HALF_LENGTH + 1, HALF_LENGTH - 1), 0.11, clamp(victim.pos.z, -HALF_WIDTH + 1, HALF_WIDTH - 1));
    m.emit({ type: 'whistle', kind: 'short' });
    m.addedSeconds += 20;
    if (aggressor.warnings >= 2) {
      m.referee.signal('card', m.time, aggressor.pos, victim.pos, 3.4, aggressor.yellowCards >= 1 ? 'red' : 'yellow');
      m.holdRestart(3.6);
      m.giveCard(aggressor, 'yellow');
    } else {
      aggressor.warnings++;
      m.emit({ type: 'warning', team: aggressor.team, playerId: aggressor.id, text: aggressor.data.name });
      m.referee.signal('warn', m.time, aggressor.pos, victim.pos, 2.4);
      m.holdRestart(2.2);
    }
    // a veces el roce se convierte en pelea (se arma antes de detener el juego)
    this.afterFoul(aggressor, victim, 0.4, null, 0.25);
    m.stopPlay('freekick', victim.team as 0 | 1, spot);
  }

  /** Tras una falta (justo antes de detener el juego): ¿se arma la pelea? */
  afterFoul(offender: Player, victim: Player, severity: number, card: 'yellow' | 'red' | null, base = 0.12) {
    const m = this.m;
    if (this.brawl || m.time - this.lastBrawl < 90 || this.brawls >= 4) return;
    const p = this.heat * (base + (card ? 0.3 : 0) + (severity >= 0.7 ? 0.2 : 0) + (m.teams[offender.team].stats.fouls > 8 ? 0.1 : 0));
    if (m.rng.next() > p) return;
    this.start(offender, victim);
  }

  private start(offender: Player, victim: Player) {
    const m = this.m;
    const spot = victim.pos.clone();
    spot.y = 0;
    // participan el infractor, la víctima y los jugadores de campo más cercanos de los dos equipos
    const near = [...m.teams[0].active, ...m.teams[1].active]
      .filter((p) => !p.isGK && p !== offender && p !== victim && !p.sentOff)
      .sort((a, b) => dist2D(a.pos, spot) - dist2D(b.pos, spot))
      .filter((p) => dist2D(p.pos, spot) < 22)
      .slice(0, 6);
    const parts = [offender, victim, ...near];
    this.lastBrawl = m.time;
    this.brawls++;
    const dur = 4.5 + m.rng.next() * 2;
    this.brawl = { start: m.time, until: m.time + dur, spot, parts, instigator: offender };
    m.holdRestart(dur + 3.4);
    m.addedSeconds += 60;
    m.emit({ type: 'brawl', kind: 'start', team: offender.team, playerId: offender.id, text: offender.data.name, x: spot.x, z: spot.z });
  }

  /** En la pausa tras la falta: los participantes corren hacia el foco y se empujan; al terminar, el árbitro sanciona. */
  stepBrawl() {
    const b = this.brawl;
    if (!b) return;
    const m = this.m;
    if (m.time >= b.until) {
      this.finish(b);
      return;
    }
    for (const p of b.parts) {
      if (p.sentOff) continue;
      const d = dist2D(p.pos, b.spot);
      if (d > 2.4) {
        const k = 5.2 / Math.max(d, 0.01);
        p.desiredVel.set((b.spot.x - p.pos.x) * k, 0, (b.spot.z - p.pos.z) * k);
        p.sprinting = true;
        if (p.action.kind === 'scuffle') p.clearAction();
        p.desiredFacing = Math.atan2(b.spot.x - p.pos.x, b.spot.z - p.pos.z);
      } else {
        // en el centro de la pelea: empujones, dando vueltas
        p.sprinting = false;
        const a = m.time * 1.7 + p.data.number * 2.1;
        p.desiredVel.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8);
        if (p.action.kind !== 'scuffle') p.startAction('scuffle', 'shove', 1.1, 0, { variant: p.data.number % 3 });
        const foe = b.parts.find((q) => q.team !== p.team && !q.sentOff && q !== p);
        if (foe) p.desiredFacing = Math.atan2(foe.pos.x - p.pos.x, foe.pos.z - p.pos.z);
      }
    }
  }

  private finish(b: NonNullable<HeatDirector['brawl']>) {
    const m = this.m;
    this.brawl = null;
    for (const p of b.parts) if (p.action.kind === 'scuffle') p.clearAction();
    // sanciones: el instigador (si no la vio ya) y uno o dos más; con calor alto, alguna roja
    const pool = b.parts.filter((p) => !p.sentOff);
    const ringleaders = [b.instigator, ...pool.filter((p) => p !== b.instigator).sort(() => m.rng.next() - 0.5).slice(0, 1 + (m.rng.next() < 0.35 ? 1 : 0))];
    const names: string[] = [];
    let first = true;
    for (const p of ringleaders) {
      if (p.sentOff) continue;
      const red = (p.yellowCards >= 1 && m.rng.next() < 0.8) || m.rng.next() < 0.1 * this.heat;
      if (first) {
        m.referee.signal('card', m.time, p.pos, b.spot, 3.2, red ? 'red' : 'yellow');
        first = false;
      }
      m.giveCard(p, red ? 'red' : 'yellow');
      names.push(p.data.name);
    }
    m.emit({ type: 'brawl', kind: 'end', team: b.instigator.team, playerId: b.instigator.id, text: names.join(', '), x: b.spot.x, z: b.spot.z });
    m.holdRestart(3.4);
  }
}
