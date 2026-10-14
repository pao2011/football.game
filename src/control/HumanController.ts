import { Vector3 } from 'three';
import { GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_DEPTH } from '../config/constants';
import type { Input, Action } from '../input/Input';
import type { Match, TeamController } from '../sim/Match';
import type { Player } from '../sim/Player';
import type { Team } from '../sim/Team';
import { buildGroundPass, buildLob, buildShot, NORMAL_SHOT, shotStyleName, type ShotStyle } from '../ai/Actions';
import type { SkillKind } from '../sim/types';
import { requestDive } from '../ai/GoalkeeperAI';
import { getBallPrediction } from '../ai/Predict';
import { interceptCache } from '../ai/TeamAI';
import { clamp, dist2D } from '../util/math';

/** Orientación de la cámara para convertir el stick (pantalla) en direcciones del mundo. */
export interface ViewBasis {
  right: Vector3;
  forward: Vector3;
}

export interface ControlSettings {
  autoSwitch: boolean;
  /** 0 = manual, 1 = asistido (selección de receptor y potencia automáticas). */
  passAssist: number;
  /** Duración (s) para llenar la barra de potencia. */
  powerBarTime: number;
  /** Mostrar la trayectoria de pase/tiro (ayuda visual). */
  showAimAssist: boolean;
}

type KickAction = 'pass' | 'through' | 'lob' | 'shoot';

interface Buffered {
  action: KickAction;
  power: number;
  finesse: boolean;
  until: number;
  dir: Vector3;
  noStick?: boolean;
  style?: ShotStyle;
}
const KICK_ACTIONS: KickAction[] = ['pass', 'through', 'lob', 'shoot'];

/**
 * Control del jugador humano con el esquema de los juegos de fútbol modernos:
 * mantener para cargar la barra de potencia y soltar para golpear; en defensa los mismos
 * botones sirven para presionar, entrar, barrer y hacer salir al arquero.
 */
export class HumanController implements TeamController {
  /** Carga actual (para el HUD). */
  charge: { action: KickAction; value: number; label?: string } | null = null;
  /** Último golpeo cargado (para mostrar la barra unos instantes tras soltar). */
  lastCharge: { action: KickAction; value: number; at: number; label?: string } | null = null;
  private buffered: Buffered | null = null;
  /** Ignorar la próxima suelta de tiro/pase (doble toque para raso, amago). */
  private cancelShootRelease = false;
  private cancelPassRelease = false;
  /** Último disparo ordenado (para convertirlo en raso con el doble toque). */
  private lastShot: { power: number; dir: Vector3; style: ShotStyle } | null = null;
  private switchCooldown = 0;
  private lastKickHandled = -1;
  private gkDiveIntent = 0;
  pauseRequested = false;
  /** Dirección de apuntado actual (mundo) para la ayuda visual. */
  readonly aimDir = new Vector3(1, 0, 0);

  constructor(
    readonly input: Input,
    readonly view: ViewBasis,
    public settings: ControlSettings,
  ) {}

  /** Dirección de movimiento en el mundo a partir del stick. */
  private stickWorld(out = new Vector3()): Vector3 {
    const mv = this.input.move();
    out.set(0, 0, 0).addScaledVector(this.view.right, mv.x).addScaledVector(this.view.forward, mv.y);
    out.y = 0;
    const l = out.length();
    if (l > 1) out.divideScalar(l);
    return out;
  }

  update(m: Match, team: Team, dt: number) {
    const input = this.input;
    if (input.pressed('pause')) this.pauseRequested = true;
    this.switchCooldown -= dt;
    const stick = this.stickWorld();
    const hasStick = stick.lengthSq() > 0.01;
    if (hasStick) this.aimDir.copy(stick).normalize();

    // ----- Selección del jugador controlado -----
    let p = team.controlled;
    if (!p || p.sentOff || (p.isGK && m.gkHolding !== p && !(m.restart?.taker === p && m.phase !== 'play') && !(m.phase === 'shootout'))) {
      p = this.nearestToBall(m, team, null);
      team.controlled = p;
    }
    if (!p) return;

    // Auto-cambio al receptor del pase de nuestro equipo
    const lt = m.lastTouch;
    if (lt && lt.time !== this.lastKickHandled && lt.team === team.index && lt.deliberate) {
      this.lastKickHandled = lt.time;
      const rec = m.intendedReceiver;
      if (rec && rec.team === team.index && !rec.isGK && rec !== p) {
        team.controlled = rec;
        p = rec;
      }
    }

    const inPlay = m.phase === 'play';
    const isTaker = !inPlay && m.restart?.taker === p && (m.restart.stage === 'ready' || m.phase === 'shootout');

    // Cambio manual (Q / LB)
    if (inPlay && input.pressed('switch') && m.gkHolding !== p && m.owner !== p) {
      const next = hasStick ? this.inDirection(m, team, p, stick) : this.nearestToBall(m, team, p);
      // el cambio manual tiene prioridad: el cambio automático espera un rato
      if (next) { team.controlled = next; p = next; this.switchCooldown = 2.5; }
    }
    // Cambio automático en defensa
    if (inPlay && this.settings.autoSwitch && this.switchCooldown <= 0 && m.owner !== p && m.gkHolding !== p) {
      const nearest = this.nearestToBall(m, team, null);
      if (nearest && nearest !== p) {
        const dn = dist2D(nearest.pos, m.ball.pos);
        const dp = dist2D(p.pos, m.ball.pos);
        const theirs = m.possessionTeam !== team.index;
        if (theirs && dp > 12 && dn < dp * 0.5) {
          team.controlled = nearest;
          p = nearest;
          this.switchCooldown = 1.2;
        }
      }
    }

    // Arquero humano en un penal rival: elige el lado de la estirada
    if (p.isGK && m.restart?.type === 'penalty' && m.restart.team !== team.index && (m.phase !== 'play' || m.phase === 'play')) {
      this.handlePenaltyKeeper(m, team, p, stick);
      if (m.phase !== 'play') return;
    }

    p.jockeying = false;
    p.desiredFacing = NaN;
    if (inPlay) this.handleSkills(m, p, stick);
    else input.takeGesture('skill');

    if (isTaker) {
      this.handleTaker(m, team, p, stick, hasStick);
      return;
    }
    if (!inPlay) {
      p.desiredVel.set(0, 0, 0);
      return;
    }

    if (!p.mobile) {
      p.desiredVel.set(0, 0, 0);
      this.trackCharges(m, team, p, stick, hasStick);
      return;
    }

    // ----- Movimiento -----
    p.sprinting = input.held('sprint');
    const owner = m.owner === p || m.gkHolding === p;
    const defending = !owner && m.possessionTeam !== team.index && m.possessionTeam !== -1;
    if (hasStick) {
      p.desiredVel.copy(stick).multiplyScalar(9.5);
    } else if (!owner && this.autoReceive(m, p)) {
      // recepción asistida: va al punto de intercepción sin tocar el stick
    } else {
      p.desiredVel.set(0, 0, 0);
    }

    if (m.gkHolding === p) {
      this.handleGKHolding(m, team, p, stick, hasStick);
      return;
    }

    if (defending || (!owner && m.owner && m.owner.team !== team.index)) {
      this.handleDefense(m, team, p, stick, hasStick);
      return;
    }
    this.trackCharges(m, team, p, stick, hasStick);
  }

  /** Recepción asistida: el jugador controlado va a buscar un pase dirigido a él. */
  private autoReceive(m: Match, p: Player): boolean {
    if (m.owner || m.ball.held) return false;
    if (m.intendedReceiver !== p && dist2D(p.pos, m.ball.pos) > 6) return false;
    const ic = interceptCache.get(p);
    if (!ic) return false;
    const dx = ic.point.x - p.pos.x;
    const dz = ic.point.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) {
      p.desiredVel.set(0, 0, 0);
      p.desiredFacing = Math.atan2(m.ball.pos.x - p.pos.x, m.ball.pos.z - p.pos.z);
      return true;
    }
    const sp = Math.min(9, d * 3);
    p.desiredVel.set((dx / d) * sp, 0, (dz / d) * sp);
    p.sprinting = d > 4;
    return true;
  }

  // ------------------------------------------------------------------
  // Ataque: barras de potencia y golpeos
  // ------------------------------------------------------------------

  /** Tipo de disparo según los modificadores pulsados (estilo FIFA) y el gesto táctil sobre TIRO. */
  private currentStyle(gesture: { x: number; y: number } | null = null): ShotStyle {
    const input = this.input;
    const q = input.held('switch');
    const sh = input.held('finesse');
    const st: ShotStyle = {
      chip: q && !sh, // Q (LB) + tiro = vaselina
      finesse: sh && !q, // Shift (RB) + tiro = rosca
      power: (q && sh) || input.held('jockey'), // Q + Shift (LB + RB) o Ctrl/LT/POTENTE = potente
      low: false,
    };
    if (gesture && Math.hypot(gesture.x, gesture.y) > 0.5) {
      const up = gesture.y > 0.38;
      const down = gesture.y < -0.38;
      const side = Math.abs(gesture.x) > 0.38;
      if (up) st.chip = true; // ↑ vaselina
      if (down) st.low = true; // ↓ raso
      if (side) st.finesse = true; // ← → rosca; en diagonal se combina
    }
    return st;
  }

  /** Etiqueta del golpeo que se está cargando (para la barra de potencia). */
  private chargeLabel(a: KickAction): string | undefined {
    return a === 'shoot' ? shotStyleName(this.currentStyle()) : undefined;
  }

  /** Regates: I/J/K/L o teclado numérico, stick derecho, o deslizar el dedo en la pantalla. */
  private handleSkills(m: Match, p: Player, stick: Vector3) {
    const input = this.input;
    const g = input.takeGesture('skill');
    if (m.owner !== p || !(p.mobile || p.action.kind === 'trap')) return;
    let flick: { x: number; y: number } | null = null;
    let spin = input.pressed('skillSpin');
    if (g) {
      if (g.tap) spin = true;
      else flick = g.dir;
    }
    if (input.pressed('skillUp')) flick = { x: 0, y: 1 };
    else if (input.pressed('skillDown')) flick = { x: 0, y: -1 };
    else if (input.pressed('skillLeft')) flick = { x: -1, y: 0 };
    else if (input.pressed('skillRight')) flick = { x: 1, y: 0 };
    if (!flick && !spin) return;
    const fwd = p.forward();
    const left = new Vector3(fwd.z, 0, -fwd.x);
    if (spin) {
      const side = stick.lengthSq() > 0.01 && stick.dot(left) < 0 ? -1 : 1;
      m.requestSkill(p, 'roulette', side);
      return;
    }
    // Como en FIFA, la dirección del regate se interpreta respecto al jugador
    // (arriba = hacia donde mira, izquierda = su izquierda), sea cual sea la cámara.
    const fl = Math.hypot(flick!.x, flick!.y) || 1;
    const along = flick!.y / fl;
    const lat = -flick!.x / fl;
    const side: 1 | -1 = lat >= 0 ? 1 : -1;
    let kind: SkillKind;
    const diagonal = !!g && Math.abs(flick!.x) > 0.38 && Math.abs(flick!.y) > 0.38;
    if (diagonal || (input.held('finesse') && Math.abs(along) < 0.6)) kind = 'elastico';
    else if (along > 0.6) kind = 'rainbow';
    else if (along < -0.6) kind = 'dragback';
    else kind = 'stepover';
    m.requestSkill(p, kind, side);
  }

  private trackCharges(m: Match, team: Team, p: Player, stick: Vector3, hasStick: boolean) {
    const input = this.input;
    this.charge = null;
    const owner = m.owner === p;
    // Amago de tiro: con el tiro cargando, pulsar pase (como en FIFA: tiro + pase)
    if (owner && input.held('shoot') && input.pressed('pass') && (p.mobile || p.action.kind === 'trap')) {
      const left = new Vector3(Math.cos(p.facing), 0, -Math.sin(p.facing));
      const side: 1 | -1 = hasStick ? (stick.dot(left) >= 0 ? 1 : -1) : (m.rng.next() < 0.5 ? 1 : -1);
      if (m.requestSkill(p, 'fakeshot', side)) {
        this.cancelShootRelease = true;
        this.cancelPassRelease = true;
        return;
      }
    }
    // Tiro raso: doble toque del botón de tiro mientras el jugador arma el disparo
    const k = p.action.kick;
    if (input.pressed('shoot') && p.action.kind === 'kick' && !p.action.done && k && this.lastShot
      && (k.kind === 'shoot' || k.kind === 'finesse') && !k.style?.low && !k.style?.chip) {
      const st: ShotStyle = { ...this.lastShot.style, low: true };
      const { z, y } = this.shotAim(m, team, p, this.lastShot.dir, this.lastShot.power, st.finesse);
      p.action.kick = buildShot(m, p, z, y, this.lastShot.power, st, 1);
      this.lastCharge = { action: 'shoot', value: this.lastShot.power, at: m.time, label: shotStyleName(st) };
      this.cancelShootRelease = true;
    }
    for (const a of KICK_ACTIONS) {
      if (input.held(a)) {
        this.charge = { action: a, value: clamp(input.holdTime(a) / this.settings.powerBarTime, 0, 1), label: this.chargeLabel(a) };
      }
      const rel = input.released(a);
      if (rel >= 0) {
        if (a === 'shoot' && this.cancelShootRelease) { this.cancelShootRelease = false; input.takeGesture('shot'); continue; }
        if (a === 'pass' && this.cancelPassRelease) { this.cancelPassRelease = false; continue; }
        const power = clamp(rel / this.settings.powerBarTime, 0.08, 1);
        const dir = hasStick ? stick.clone().normalize() : p.forward();
        const style = a === 'shoot' ? this.currentStyle(input.takeGesture('shot')?.dir ?? null) : undefined;
        this.lastCharge = { action: a, value: power, at: m.time, label: style ? shotStyleName(style) : undefined };
        this.buffered = { action: a, power, finesse: input.held('finesse'), until: m.time + 0.7, dir, noStick: !hasStick, style };
      }
    }
    if (this.buffered) {
      if (m.time > this.buffered.until) {
        this.buffered = null;
      } else if (this.tryExecute(m, team, p, this.buffered)) {
        this.buffered = null;
      }
    }
  }

  private tryExecute(m: Match, team: Team, p: Player, b: Buffered): boolean {
    const ball = m.ball.pos;
    const dH = dist2D(p.pos, ball);
    const isOwner = m.owner === p;
    // Cabezazo
    if (!isOwner && ball.y > 1.2 && ball.y < 2.8 && dH < 1.6 && !p.busy) {
      const req = this.makeKick(m, team, p, b, true);
      req.kind = 'header';
      req.velocity.multiplyScalar(0.7);
      if (b.action === 'shoot') req.targetId = undefined;
      return m.requestKick(p, req);
    }
    if (!isOwner && (dH > 1.25 || ball.y > 1.2)) return false;
    if (m.owner && m.owner !== p) return false;
    const req = this.makeKick(m, team, p, b, false);
    return m.requestKick(p, req);
  }

  private makeKick(m: Match, team: Team, p: Player, b: Omit<Buffered, 'until'>, header: boolean) {
    const err = 1;
    const dir = b.dir;
    switch (b.action) {
      case 'shoot': {
        const st: ShotStyle = header ? { ...NORMAL_SHOT } : b.style ?? { ...NORMAL_SHOT, finesse: b.finesse };
        const { z, y } = this.shotAim(m, team, p, dir, b.power, st.finesse);
        this.lastShot = { power: b.power, dir: dir.clone(), style: st };
        return buildShot(m, p, z, y, b.power, st, err);
      }
      case 'pass': {
        let q = this.pickReceiver(m, team, p, dir);
        // sin dirección y sin nadie delante: al compañero mejor situado en cualquier dirección
        if (!q && b.noStick) q = this.pickFrom(p, team.active.filter((x) => x !== p && !x.isGK), dir);
        if (!q) {
          const target = p.pos.clone().addScaledVector(dir, 8 + b.power * 25);
          return buildGroundPass(m, p, target, b.power - 0.3, err);
        }
        const target = q.pos.clone().addScaledVector(q.vel, 0.4);
        const manual = this.settings.passAssist < 0.5;
        if (manual) {
          const d = 6 + b.power * 34;
          return buildGroundPass(m, p, p.pos.clone().addScaledVector(dir, d), 0.2, err, q);
        }
        return buildGroundPass(m, p, target, b.power - 0.35, err, q);
      }
      case 'through': {
        const q = this.pickReceiver(m, team, p, dir, true);
        const run = new Vector3(team.attackDir, 0, 0).lerp(dir, 0.4).normalize();
        const lead = 5 + b.power * 13;
        const base = q ? q.pos : p.pos;
        const target = base.clone().addScaledVector(run, lead);
        target.x = clamp(target.x, -HALF_LENGTH + 3, HALF_LENGTH - 3);
        target.z = clamp(target.z, -HALF_WIDTH + 2, HALF_WIDTH - 2);
        const req = buildGroundPass(m, p, target, 0.25, err, q ?? undefined, 'through');
        if (q) {
          q.duty = 'receive';
          q.tacticalTarget.copy(target);
        }
        return req;
      }
      case 'lob':
      default: {
        // Centro si estamos en zona de centro; si no, pase elevado
        const pu = team.u(p.pos);
        const crossing = pu > HALF_LENGTH - 30 && Math.abs(p.pos.z) > 12;
        if (crossing) {
          const inBox = team.active.filter((q) => q !== p && team.u(q.pos) > HALF_LENGTH - PENALTY_AREA_DEPTH - 3 && Math.abs(q.pos.z) < 14);
          const q = this.pickFrom(p, inBox, dir) ?? null;
          const target = q ? q.pos.clone() : team.toWorld(HALF_LENGTH - 9, 0);
          target.addScaledVector(new Vector3(team.attackDir, 0, 0), (b.power - 0.5) * 6);
          return buildLob(m, p, target, 20 + b.power * 6, err, q ?? undefined, 'cross');
        }
        const q = this.pickReceiver(m, team, p, dir);
        const target = q ? q.pos.clone().addScaledVector(q.vel, 0.9) : p.pos.clone().addScaledVector(dir, 15 + b.power * 35);
        if (q && this.settings.passAssist < 0.5) target.copy(p.pos).addScaledVector(dir, 12 + b.power * 40);
        return buildLob(m, p, target, 28 + b.power * 10, err, q ?? undefined, 'lob');
      }
    }
  }

  /** Punto de apuntado en el arco a partir del stick y la potencia (como los juegos modernos). */
  private shotAim(m: Match, team: Team, p: Player, dir: Vector3, power: number, finesse: boolean) {
    const gx = HALF_LENGTH * team.attackDir;
    let z: number;
    const toGoalX = gx - p.pos.x;
    const stickAligned = Math.sign(dir.x) === Math.sign(toGoalX) && Math.abs(dir.x) > 0.15;
    if (this.input.move().x !== 0 || this.input.move().y !== 0) {
      if (stickAligned) {
        z = p.pos.z + (dir.z / dir.x) * toGoalX;
      } else {
        z = Math.sign(dir.z) * GOAL_HALF_WIDTH;
      }
      z = clamp(z, -(GOAL_HALF_WIDTH - 0.35), GOAL_HALF_WIDTH - 0.35);
    } else {
      // sin dirección: al palo más alejado del arquero (asistencia)
      const gk = m.otherTeam(team.index).goalkeeper;
      const side = gk && gk.pos.z > 0 ? -1 : 1;
      z = side * (GOAL_HALF_WIDTH - 1.1);
    }
    const y = finesse ? 0.9 + power * 0.8 : 0.25 + power * power * 1.9;
    return { z, y };
  }

  // ------------------------------------------------------------------
  // Defensa
  // ------------------------------------------------------------------

  private handleDefense(m: Match, team: Team, p: Player, stick: Vector3, hasStick: boolean) {
    const input = this.input;
    this.charge = null;
    const carrier = m.owner;
    const ball = m.ball.pos;
    // Presionar (mantener pase): ir automáticamente a por el portador cerrando hacia el arco
    if (input.held('pass') && carrier) {
      const goal = team.ownGoal;
      const gx = goal.x - carrier.pos.x;
      const gz = goal.z - carrier.pos.z;
      const gl = Math.hypot(gx, gz) || 1;
      const tx = carrier.pos.x + (gx / gl) * 1.0 + carrier.vel.x * 0.2;
      const tz = carrier.pos.z + (gz / gl) * 1.0 + carrier.vel.z * 0.2;
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.min(9.5, d * 3);
      if (d > 0.1) p.desiredVel.set((dx / d) * sp, 0, (dz / d) * sp);
      p.sprinting = input.held('sprint') || d > 4;
      if (d < 2.5) p.desiredFacing = Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z);
    } else if (input.held('pass') && !carrier) {
      const ic = interceptCache.get(p);
      if (ic) {
        const dx = ic.point.x - p.pos.x;
        const dz = ic.point.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.2) p.desiredVel.set((dx / d) * 9.5, 0, (dz / d) * 9.5);
        p.sprinting = true;
      }
    }
    // Contener (jockey)
    if (input.held('jockey')) {
      p.jockeying = true;
      p.desiredFacing = Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z);
    }
    // Entrada de pie / barrida
    if (input.pressed('shoot')) {
      if (!hasStick && carrier) p.facing = Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z);
      m.requestTackle(p, false);
    } else if (input.pressed('lob')) {
      if (!hasStick) p.facing = Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z);
      else p.facing = Math.atan2(stick.x, stick.z);
      m.requestTackle(p, true);
    }
    // Salida del arquero (Y / W)
    if (input.held('through')) team.gkRushUntil = m.time + 0.3;
    // Presión de un compañero (RB / Shift)
    if (input.held('finesse')) team.teammatePressUntil = m.time + 0.3;
    // Balón suelto: permitir golpeos de primera
    if (!carrier) this.trackCharges(m, team, p, stick, hasStick);
  }

  // ------------------------------------------------------------------
  // Arquero con el balón en las manos
  // ------------------------------------------------------------------

  private handleGKHolding(m: Match, team: Team, p: Player, stick: Vector3, hasStick: boolean) {
    const input = this.input;
    // el arquero puede moverse dentro del área
    const side = -team.attackDir;
    const minAbs = HALF_LENGTH - PENALTY_AREA_DEPTH + 1;
    if (Math.abs(p.pos.x + p.desiredVel.x * 0.1) < minAbs && Math.sign(p.pos.x) === side) p.desiredVel.x = 0;
    if (p.busy) return;
    const dir = hasStick ? stick.clone().normalize() : new Vector3(team.attackDir, 0, 0);
    this.charge = null;
    for (const a of KICK_ACTIONS) {
      if (input.held(a)) this.charge = { action: a, value: clamp(input.holdTime(a) / this.settings.powerBarTime, 0, 1) };
      const rel = input.released(a);
      if (rel < 0) continue;
      const power = clamp(rel / this.settings.powerBarTime, 0.1, 1);
      if (a === 'pass' || a === 'through') {
        const q = this.pickReceiver(m, team, p, dir);
        const target = q ? q.pos.clone() : p.pos.clone().addScaledVector(dir, 15 + power * 15);
        const req = buildGroundPass(m, p, target, power - 0.3, 1, q ?? undefined);
        req.kind = 'gkthrow';
        req.velocity.y = a === 'through' ? 4 : 1.2;
        m.requestKick(p, req);
      } else {
        const q = this.pickReceiver(m, team, p, dir);
        const target = q && power < 0.85 ? q.pos.clone() : p.pos.clone().addScaledVector(dir, 35 + power * 30);
        const req = buildLob(m, p, target, a === 'shoot' ? 22 : 36, 1, q ?? undefined);
        req.kind = 'punt';
        m.requestKick(p, req);
      }
      return;
    }
  }

  // ------------------------------------------------------------------
  // Balón parado (el humano ejecuta)
  // ------------------------------------------------------------------

  private handleTaker(m: Match, team: Team, p: Player, stick: Vector3, hasStick: boolean) {
    const input = this.input;
    const r = m.restart!;
    p.desiredVel.set(0, 0, 0);
    if (p.busy) return;
    // Apuntar con el stick (gira al jugador)
    const goal = team.attackGoal;
    if (hasStick) {
      p.facing = Math.atan2(stick.x, stick.z);
    }
    const dir = hasStick ? stick.clone().normalize() : p.forward();
    this.charge = null;
    for (const a of KICK_ACTIONS) {
      if (input.held(a)) this.charge = { action: a, value: clamp(input.holdTime(a) / this.settings.powerBarTime, 0, 1), label: this.chargeLabel(a) };
      const rel = input.released(a);
      if (rel < 0) continue;
      const power = clamp(rel / this.settings.powerBarTime, 0.1, 1);
      this.lastCharge = { action: a, value: power, at: m.time, label: this.chargeLabel(a) };
      const finesse = input.held('finesse');
      if (r.type === 'penalty') {
        if (a !== 'shoot' && a !== 'pass') continue;
        const mv = input.move();
        // stick lateral relativo al arco: izquierda/derecha en pantalla
        const lat = new Vector3().addScaledVector(this.view.right, mv.x).addScaledVector(this.view.forward, mv.y);
        const z = clamp(lat.z * 3.4 + (mv.x === 0 && mv.y === 0 ? 0 : 0), -(GOAL_HALF_WIDTH - 0.3), GOAL_HALF_WIDTH - 0.3);
        const y = 0.2 + power * power * 2.1;
        // Q (LB) + tiro en el penal: vaselina a lo Panenka
        const st = this.currentStyle(input.takeGesture('shot')?.dir ?? null);
        m.requestKick(p, buildShot(m, p, z, y, power, st.chip ? { ...NORMAL_SHOT, chip: true } : false, 1, 'penalty'));
        return;
      }
      if (r.type === 'throwin') {
        const q = this.pickReceiver(m, team, p, dir);
        const target = q ? q.pos.clone() : p.pos.clone().addScaledVector(dir, 8 + power * 12);
        const d = dist2D(m.ball.pos, target);
        const v = new Vector3(target.x - m.ball.pos.x, 0, target.z - m.ball.pos.z).normalize().multiplyScalar(clamp(d * 0.75 + 4, 6, a === 'lob' ? 19 : 15));
        v.y = clamp(d * 0.25 + 2, 3, 6.5);
        m.requestKick(p, { kind: 'throwin', velocity: v, spin: new Vector3(), targetId: q?.id, power: 0.4, errorScale: 1 });
        return;
      }
      if (a === 'shoot') {
        const st = this.currentStyle(input.takeGesture('shot')?.dir ?? null);
        const { z, y } = this.shotAim(m, team, p, dir, power, st.finesse);
        const near = dist2D(p.pos, goal) < 35;
        if (near) {
          m.requestKick(p, buildShot(m, p, z, st.finesse ? y + 0.5 : y, power, st, 1));
        } else {
          // lejos del arco: golpeo largo hacia delante
          m.requestKick(p, buildLob(m, p, p.pos.clone().addScaledVector(dir, 30 + power * 30), 30, 1));
        }
        return;
      }
      const req = this.makeKick(m, team, p, { action: a, power, finesse, dir, noStick: !hasStick }, false);
      m.requestKick(p, req);
      return;
    }
  }

  private handlePenaltyKeeper(m: Match, team: Team, gk: Player, stick: Vector3) {
    const mv = this.input.move();
    if (mv.x !== 0 || mv.y !== 0) {
      const lat = new Vector3().addScaledVector(this.view.right, mv.x).addScaledVector(this.view.forward, mv.y);
      this.gkDiveIntent = Math.sign(lat.z);
    }
    const lt = m.lastTouch;
    if (lt && lt.team !== team.index && m.time - lt.time < 0.05 && !gk.busy && this.gkDiveIntent !== 0) {
      requestDive(m, gk, this.gkDiveIntent * 2.6, 0.6 + (mv.y > 0.5 ? 0.8 : 0), 0.45);
      this.gkDiveIntent = 0;
    }
    void stick;
  }

  // ------------------------------------------------------------------
  // Selección de compañeros
  // ------------------------------------------------------------------

  private nearestToBall(m: Match, team: Team, exclude: Player | null): Player | null {
    let best: Player | null = null;
    let bestD = Infinity;
    const pred = getBallPrediction(m);
    const target = m.ball.speed > 4 ? pred[5] : m.ball.pos;
    for (const q of team.active) {
      if (q === exclude || q.isGK) continue;
      const d = dist2D(q.pos, target);
      if (d < bestD) { bestD = d; best = q; }
    }
    return best;
  }

  private inDirection(m: Match, team: Team, from: Player, dir: Vector3): Player | null {
    return this.pickFrom(from, team.active.filter((q) => q !== from && !q.isGK), dir);
  }

  private pickFrom(p: Player, cands: Player[], dir: Vector3): Player | null {
    let best: Player | null = null;
    let bestS = Infinity;
    for (const q of cands) {
      const vx = q.pos.x - p.pos.x;
      const vz = q.pos.z - p.pos.z;
      const d = Math.hypot(vx, vz);
      if (d < 1) continue;
      const cos = (vx * dir.x + vz * dir.z) / d;
      const ang = Math.acos(clamp(cos, -1, 1));
      const s = ang * 1.4 + d / 45;
      if (s < bestS) { bestS = s; best = q; }
    }
    return best;
  }

  /** Receptor asistido en la dirección del stick (cono de ~60°). */
  private pickReceiver(m: Match, team: Team, p: Player, dir: Vector3, forwardOnly = false): Player | null {
    const cands = team.active.filter((q) => q !== p && (!q.isGK || team.u(p.pos) < -HALF_LENGTH + 30) && (!forwardOnly || !q.isGK));
    const best = this.pickFrom(p, cands, dir);
    if (!best) return null;
    const vx = best.pos.x - p.pos.x;
    const vz = best.pos.z - p.pos.z;
    const cos = (vx * dir.x + vz * dir.z) / Math.hypot(vx, vz);
    return cos > 0.45 ? best : null;
  }

  /** Para la ayuda visual: ¿a quién iría un pase ahora? */
  previewReceiver(m: Match, team: Team): Player | null {
    const p = team.controlled;
    if (!p || m.owner !== p) return null;
    return this.pickReceiver(m, team, p, this.aimDir);
  }
}

export type { Action };
