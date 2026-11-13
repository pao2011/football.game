import * as THREE from 'three';
import { BALL_RADIUS } from '../config/constants';
import type { Match } from '../sim/Match';
import type { Player } from '../sim/Player';
import type { AnimInfo, AnimState } from '../sim/types';
import { BENCH_SIDE, STAND_B } from '../render/stadium/layout';
import type { MatchView } from '../render/MatchView';
import { buildCoin, buildTrophy, disposeProp } from '../render/CeremonyProps';

// Ceremonia previa al partido, guionada sobre el estado del partido (la simulación espera mientras dura):
//  1. salida del túnel: el árbitro con el balón y los dos equipos en fila, capitán al frente
//  2. formación en línea frente a la tribuna principal (en las finales, con la copa delante) y aplauso
//  3. saludo protocolar: el visitante pasa por delante del local estrechando manos
//  4. sorteo: los capitanes con el árbitro en el círculo central, moneda al aire (arco y saque)
//  5. todos a sus posiciones de saque inicial
// Al terminar (o al saltarla) se restaura exactamente la posición de saque inicial.

const S = BENCH_SIDE; // lado del túnel (z < 0 con la cámara de transmisión en +z)
const Z_TUNNEL = S * (STAND_B - 3.5); // dentro del túnel (oculto bajo el techo)
const Z_LINE = S * 16; // línea de formación
const Z_SHAKE = Z_LINE - S * 0.95; // por donde pasa el visitante al saludar
const FACE_CAMERA = S < 0 ? 0 : Math.PI;
const WALK = 3.4; // trote suave de salida
const SLOT = 1.05; // separación en la formación

/** Tiempos del guion (s). */
export const CEREMONY = {
  lineup: 12.2,
  shake: 15.2,
  toss: 20.4,
  coin: 23.4,
  disperse: 25.6,
  end: 29.5,
} as const;

interface Saved {
  pos: THREE.Vector3;
  facing: number;
  anim: AnimInfo;
}

const _v = new THREE.Vector3();

/** Punto a distancia `d` sobre una poligonal; devuelve si llegó al final y la dirección del tramo. */
function along(path: THREE.Vector3[], d: number, out: THREE.Vector3): { done: boolean; dx: number; dz: number } {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= l || i === path.length - 2) {
      const k = l > 0 ? Math.min(1, Math.max(0, d / l)) : 1;
      out.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
      return { done: d >= l && i === path.length - 2, dx: (b.x - a.x) / (l || 1), dz: (b.z - a.z) / (l || 1) };
    }
    d -= l;
  }
  out.copy(path[path.length - 1]);
  return { done: true, dx: 0, dz: 1 };
}

function setAnim(a: AnimInfo, state: AnimState, time: number, speed: number, duration = 0) {
  a.state = state;
  a.time = time;
  a.duration = duration;
  a.speed = speed;
  a.variant = 0;
  a.foot = 1;
}

/** Recorrido a velocidad constante que empieza en `t0`: mueve al actor y pone la animación de marcha. */
function walk(t: number, t0: number, path: THREE.Vector3[], speed: number, pos: THREE.Vector3, anim: AnimInfo, faceEnd: number, state: AnimState = 'idle'): { facing: number; done: boolean } {
  const r = along(path, Math.max(0, t - t0) * speed, pos);
  if (t < t0 || r.done) {
    setAnim(anim, state, t, 0);
    return { facing: t < t0 ? Math.atan2(path[1].x - path[0].x, path[1].z - path[0].z) : faceEnd, done: r.done };
  }
  setAnim(anim, state === 'handshake' ? 'handshake' : 'locomotion', t, speed);
  return { facing: Math.atan2(r.dx, r.dz), done: false };
}

/** Velocidad para recorrer `path` y llegar medio segundo antes del final (trote, o carrera si está lejos). */
function pace(path: THREE.Vector3[], t0: number) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return Math.min(8, Math.max(4.5, d / (CEREMONY.end - 0.5 - t0)));
}

/** Camino a su puesto que rodea el círculo central (donde se hace el sorteo) si la recta lo cruza. */
function aroundCenter(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const k = Math.min(1, Math.max(0, -(from.x * dx + from.z * dz) / (dx * dx + dz * dz || 1)));
  if (Math.hypot(from.x + dx * k, from.z + dz * k) > 6) return [from, to];
  // por detrás del sorteo hasta su lado del campo y luego por fuera del círculo
  const sx = Math.sign(to.x || 1) * 7.5;
  return [from, new THREE.Vector3(sx, 0, from.z), new THREE.Vector3(sx, 0, 0), to];
}

function captainOf(players: Player[]): Player {
  const field = players.filter((p) => !p.isGK);
  const score = (p: Player) => Object.values(p.data.attrs).reduce((a, b) => a + b, 0);
  return field.sort((a, b) => score(b) - score(a))[0] ?? players[0];
}

export class Ceremony {
  readonly duration = CEREMONY.end;
  /** Nombre de la copa en juego (solo en las finales). */
  readonly cup: string | undefined;
  /** Equipo que gana el sorteo (elige arco); el otro hace el saque inicial. */
  readonly tossWinner: 0 | 1;
  private readonly saved = new Map<object, Saved>();
  private readonly ballSaved: THREE.Vector3;
  private readonly lines: Player[][];
  private readonly captains: [Player, Player];
  private readonly trophy: THREE.Group | null = null;
  private readonly coin: THREE.Mesh;
  private readonly shot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, cut: true };
  private lastShot = -1;
  private finished = false;

  constructor(private readonly m: Match, private readonly view: MatchView) {
    this.cup = m.config.final;
    this.tossWinner = m.firstHalfKickoff === 0 ? 1 : 0;
    for (const p of m.active) this.saved.set(p, { pos: p.pos.clone(), facing: p.facing, anim: { ...p.anim } });
    const r = m.referee;
    this.saved.set(r, { pos: r.pos.clone(), facing: r.facing, anim: { ...r.anim } });
    this.ballSaved = m.ball.pos.clone();
    // orden de salida: capitán, arquero y el resto según su posición en la formación
    this.lines = m.teams.map((t) => {
      const cap = captainOf(t.active);
      const gk = t.active.find((p) => p.isGK && p !== cap);
      return [cap, ...(gk ? [gk] : []), ...t.active.filter((p) => p !== cap && p !== gk)];
    });
    this.captains = [this.lines[0][0], this.lines[1][0]];
    if (this.cup) {
      this.trophy = buildTrophy();
      this.trophy.position.set(0, 0, Z_LINE - S * 2.4);
      view.scene.add(this.trophy);
    }
    this.coin = buildCoin();
    this.coin.visible = false;
    view.scene.add(this.coin);
    view.ceremony = true;
  }

  /** Texto del rótulo para el instante `t`. */
  caption(t: number): string {
    const [h, a] = this.m.teams;
    if (t < CEREMONY.lineup) return this.cup ? `Final · ${this.cup} · salen los equipos` : 'Salen los equipos';
    if (t < CEREMONY.shake) return this.cup ? `${this.cup} · en juego` : `${h.data.name} y ${a.data.name}, formados`;
    if (t < CEREMONY.toss) return 'Saludo protocolar';
    if (t < CEREMONY.coin + 0.9) return 'Sorteo: capitanes con el árbitro';
    const w = this.m.teams[this.tossWinner];
    const ko = this.m.teams[this.m.firstHalfKickoff];
    return `Gana el sorteo ${w.data.name}: elige arco · saca ${ko.data.name}`;
  }

  /** Coloca jugadores, árbitro, balón, moneda y cámara en el instante `t` del guion. */
  update(t: number) {
    if (this.finished) return;
    const m = this.m;
    const ref = m.referee;
    const capSet = new Set<Player>(this.captains);
    // ---- árbitro
    const refHome = this.saved.get(ref)!;
    let refHasBall = true;
    if (t < CEREMONY.toss) {
      const path = [new THREE.Vector3(0, 0, Z_TUNNEL), new THREE.Vector3(0, 0, Z_LINE)];
      ref.facing = walk(t, 0, path, WALK, ref.pos, ref.anim, FACE_CAMERA).facing;
    } else if (t < CEREMONY.disperse) {
      const path = [new THREE.Vector3(0, 0, Z_LINE), new THREE.Vector3(0, 0, S * 0.9)];
      const w = walk(t, CEREMONY.toss, path, 5, ref.pos, ref.anim, FACE_CAMERA);
      ref.facing = w.facing;
      refHasBall = !w.done;
      if (t >= CEREMONY.coin && t < CEREMONY.coin + 1.8) setAnim(ref.anim, 'coin_toss', t - CEREMONY.coin, 0, 1.8);
    } else {
      const path = [new THREE.Vector3(0, 0, S * 0.9), refHome.pos];
      ref.facing = walk(t, CEREMONY.disperse, path, 6, ref.pos, ref.anim, refHome.facing).facing;
      refHasBall = false;
    }
    // ---- balón: bajo el brazo del árbitro hasta que lo deja en el punto central
    if (refHasBall) {
      const f = ref.facing;
      m.ball.pos.set(ref.pos.x - Math.cos(f) * 0.27 + Math.sin(f) * 0.05, 1.0, ref.pos.z + Math.sin(f) * 0.27 + Math.cos(f) * 0.05);
    } else {
      m.ball.pos.set(0, BALL_RADIUS, 0);
    }
    m.ball.vel.set(0, 0, 0);
    // ---- jugadores
    for (let ti = 0; ti < 2; ti++) {
      const side = ti === 0 ? -1 : 1; // local a la izquierda de la cámara (−x), visitante a la derecha
      this.lines[ti].forEach((p, j) => {
        const home = this.saved.get(p)!;
        const slotX = side * (1.6 + j * SLOT);
        const t0 = 0.6; // salen en fila: cada uno empieza más adentro del túnel (oculto bajo la tribuna)
        const shakeEnd = new THREE.Vector3(slotX - 14.5, 0, Z_SHAKE);
        let facing: number;
        if (t < CEREMONY.shake) {
          const path = [new THREE.Vector3(side * 0.75, 0, Z_TUNNEL + S * (1.2 + j * 1.15)), new THREE.Vector3(side * 0.75, 0, Z_LINE + S * 4), new THREE.Vector3(slotX, 0, Z_LINE + S * 1), new THREE.Vector3(slotX, 0, Z_LINE)];
          const clapping = t > CEREMONY.shake - 1.4;
          facing = walk(t, t0, path, WALK, p.pos, p.anim, FACE_CAMERA, clapping ? 'applaud' : 'idle').facing;
        } else if (t < CEREMONY.toss) {
          if (ti === 1) {
            // el visitante da un paso al frente y recorre la fila del local saludando
            const path = [new THREE.Vector3(slotX, 0, Z_LINE), new THREE.Vector3(slotX, 0, Z_SHAKE), shakeEnd];
            facing = walk(t, CEREMONY.shake, path, 2.8, p.pos, p.anim, FACE_CAMERA, 'handshake').facing;
          } else {
            p.pos.set(slotX, 0, Z_LINE);
            facing = FACE_CAMERA;
            setAnim(p.anim, 'handshake', t, 0);
          }
        } else {
          const from = ti === 1 ? shakeEnd : new THREE.Vector3(slotX, 0, Z_LINE);
          if (capSet.has(p)) {
            // capitanes: al círculo central con el árbitro y, tras el sorteo, a su puesto
            const spot = new THREE.Vector3(side * 0.95, 0, S * 0.05);
            if (t < CEREMONY.disperse) {
              const w = walk(t, CEREMONY.toss, [from, spot], 5, p.pos, p.anim, Math.atan2(-side, S));
              facing = w.facing;
            } else {
              const path = [spot, home.pos];
              facing = walk(t, CEREMONY.disperse, path, pace(path, CEREMONY.disperse), p.pos, p.anim, home.facing).facing;
            }
          } else {
            // los que sacan desde el círculo central esperan a que termine el sorteo para no taparlo
            const nearCenter = Math.hypot(home.pos.x, home.pos.z) < 9;
            const t0 = nearCenter ? CEREMONY.disperse : CEREMONY.toss;
            const path = nearCenter ? [from, home.pos] : aroundCenter(from, home.pos);
            facing = walk(t, t0, path, pace(path, t0), p.pos, p.anim, nearCenter && t < CEREMONY.disperse ? FACE_CAMERA : home.facing).facing;
          }
        }
        p.facing = facing;
      });
    }
    // ---- moneda: sube girando desde la mano del árbitro y vuelve a la palma
    const ct = t - CEREMONY.coin - 0.3;
    this.coin.visible = ct > 0 && ct < 1.1;
    if (this.coin.visible) {
      const f = ref.facing;
      this.coin.position.set(ref.pos.x - Math.cos(f) * 0.2 + Math.sin(f) * 0.3, 1.35 + 5.2 * ct - 4.9 * ct * ct, ref.pos.z + Math.sin(f) * 0.2 + Math.cos(f) * 0.3);
      this.coin.rotation.set(ct * 38, f, 0);
    }
    if (this.trophy) this.trophy.rotation.y = t * 0.15;
    this.camera(t);
  }

  /** Planos de cámara del guion. */
  private camera(t: number) {
    const sh = this.shot;
    const idx = t < 3.2 ? 0 : t < CEREMONY.lineup ? 1 : t < CEREMONY.shake ? 2 : t < CEREMONY.toss ? 3 : t < CEREMONY.disperse ? 4 : 5;
    sh.cut = idx !== this.lastShot;
    this.lastShot = idx;
    const zE = S * (STAND_B - 5); // boca del túnel
    if (idx === 0) {
      sh.pos.set(6.5, 2.2, zE - S * 9);
      sh.look.set(0, 1.4, zE);
      sh.fov = 42;
    } else if (idx === 1) {
      // sigue a la cabeza de la fila
      _v.set(0, 0, 0);
      let n = 0;
      for (const line of this.lines) for (const p of line) if (p.anim.speed > 0.5) { _v.add(p.pos); n++; }
      if (n === 0) _v.set(0, 0, Z_LINE); else _v.multiplyScalar(1 / n);
      sh.pos.set(_v.x + 9, 3.2, _v.z - S * 11);
      sh.look.set(_v.x, 1.2, _v.z);
      sh.fov = 40;
    } else if (idx === 2) {
      // paneo a lo largo de la formación (en la final termina en la copa)
      const u = (t - CEREMONY.lineup) / (CEREMONY.shake - CEREMONY.lineup);
      if (this.trophy) {
        // final: la copa en primer plano girando despacio, con los dos equipos formados detrás
        const tp = this.trophy.position;
        const a = 0.45 - u * 0.9;
        sh.pos.set(tp.x + Math.sin(a) * 2.7, 1.62, tp.z - S * Math.cos(a) * 2.7);
        sh.look.set(tp.x, 1.5, tp.z + S * 0.6);
        sh.fov = 38;
      } else {
        const x = -13 + 26 * u;
        sh.pos.set(x * 0.85, 2, Z_LINE - S * 8);
        sh.look.set(x, 1.3, Z_LINE);
        sh.fov = 36;
      }
    } else if (idx === 3) {
      const c = this.lines[1][0].pos;
      sh.pos.set(c.x + 1.5, 2.1, Z_LINE - S * 6.5);
      sh.look.set(c.x - 1.2, 1.35, Z_LINE);
      sh.fov = 36;
    } else if (idx === 4) {
      // de frente al árbitro, con un capitán a cada lado y el balón en el punto central
      sh.pos.set(0, 1.85, -S * 4.4);
      const up = this.coin.visible ? Math.max(0, this.coin.position.y - 1.3) * 0.5 : 0;
      sh.look.set(0, 1.2 + up, S * 0.5);
      sh.fov = 38;
    } else {
      sh.pos.set(0, 24, -S * 46);
      sh.look.set(0, 0, 0);
      sh.fov = 40;
    }
    this.view.director.ceremonyShot = sh;
  }

  /** Termina la ceremonia: todos en su posición de saque, sin utilería ni plano propio. */
  finish() {
    if (this.finished) return;
    this.finished = true;
    for (const [o, s] of this.saved) {
      const a = o as { pos: THREE.Vector3; facing: number; anim: AnimInfo };
      a.pos.copy(s.pos);
      a.facing = s.facing;
      Object.assign(a.anim, s.anim);
    }
    this.m.ball.pos.copy(this.ballSaved);
    this.m.ball.vel.set(0, 0, 0);
    if (this.trophy) disposeProp(this.trophy);
    disposeProp(this.coin);
    this.view.director.ceremonyShot = null;
    this.view.ceremony = false;
  }
}
