import { Vector3 } from 'three';
import { GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_DEPTH } from '../config/constants';
import type { Input, Action, TouchGesture } from '../input/Input';
import type { Match, TeamController } from '../sim/Match';
import type { Player } from '../sim/Player';
import type { Team } from '../sim/Team';
import { buildCross, buildCurvedPass, buildGroundPass, buildLob, buildShot, chooseCrossTarget, crossSpots, NORMAL_SHOT, shotStyleName, type CrossStyle, type ShotStyle } from '../ai/Actions';
import type { SkillKind } from '../sim/types';
import { requestDive } from '../ai/GoalkeeperAI';
import { aerialIntercept, getBallPrediction } from '../ai/Predict';
import { interceptCache } from '../ai/TeamAI';
import { clamp, dist2D } from '../util/math';
import { offsideLineU } from '../sim/Rules';
import { solveCurvedKick } from '../sim/Kicks';
import { AERIAL_NAMES, AERIAL_TIMING, angleTo, ballApproach, chooseAerial } from '../sim/Aerial';
import { receiveApproach } from '../ai/PlayerAI';
import type { Restart } from '../sim/Match';

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
  /**
   * Modo asistido (pensado para pantallas táctiles): receptor elegido de forma inteligente,
   * toque rápido = pase/tiro con potencia automática, puntería hacia la portería, sprint
   * automático con el joystick al máximo y defensa que se orienta sola hacia el portador.
   */
  assist?: boolean;
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
  /** LB (Q) mantenido al soltar: globo al hueco con LB + Y. */
  lb?: boolean;
  /** Toques seguidos de X (A en teclado): 2 = centro bajo, 3 = centro raso. */
  taps?: number;
  /** El centro espera un instante para poder contar más toques de X. */
  notBefore?: number;
  /** LT (L2) mantenido al soltar: pase con rosca, vaselina corta, globo al hueco, centro anticipado. */
  l2?: boolean;
  /** Dos botones a la vez: △+□ centro filtrado, ✕+△ pase filtrado entre centrales, ✕+□ bombeado al pie. */
  combo?: ButtonCombo;
}
type ButtonCombo = 'throughCross' | 'splitPass' | 'loftToFeet';
/** Combinaciones de dos botones pulsados a la vez (orden indiferente). */
const COMBOS: Record<string, ButtonCombo> = {
  'lob+through': 'throughCross',
  'pass+through': 'splitPass',
  'lob+pass': 'loftToFeet',
};
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
  /** Punto del arco al que irá el disparo actual (para la ayuda visual). */
  aimTarget: Vector3 | null = null;
  private lastKickHandled = -1;
  /**
   * Tiro libre directo con trayectoria (estilo FC): punto del arco al que se apunta, efecto (−1..1,
   * positivo = curva hacia la derecha de la pantalla) y recorrido previsto del balón para dibujarlo.
   */
  freeKick: { restart: Restart; aimZ: number; aimY: number; curve: number; path: Vector3[]; target: Vector3; power: number } | null = null;
  private lbDownAt = -1;
  private lbUsed = false;
  private rbUsed = false;
  private teamPressHold = false;
  private pressAt: Partial<Record<KickAction, number>> = {};
  private suppress = new Set<KickAction>();
  private combo: { kind: ButtonCombo; fired: boolean } | null = null;
  private knockFlick: { x: number; y: number; at: number } | null = null;
  private rbTapAt = -10;
  private yTapAt = -10;
  /** Último pase del humano (para la pared avanzada con el stick derecho y la pared clásica). */
  private lastPass: { player: Player; at: number; r1: boolean } | null = null;
  /** Pared clásica (LB + A): el pasador corre y el siguiente pase va para él. */
  private giveAndGo: { runner: Player; until: number } | null = null;
  /** Instante del último tiro potente (la cámara hace un pequeño zoom). */
  powerShotAt = -10;
  /** Finalización perfecta (segundo toque de tiro en el instante justo). */
  timedShotAt = -10;
  /** Último centro ordenado (para convertirlo en bajo o raso con toques seguidos de X). */
  private lastLob: { b: Omit<Buffered, 'until'>; at: number } | null = null;
  /** Instante del último cambio de mentalidad (para mostrarlo en el HUD). */
  mentalityShownAt = -10;

  /**
   * Desmarque pedido (LB, como en FIFA): el compañero adelantado mejor situado corre al espacio,
   * a la espalda de la defensa, durante unos segundos.
   */
  private callRun(m: Match, team: Team, p: Player, dir: Vector3 | null = null) {
    const pu = team.u(p.pos);
    const off = offsideLineU(m, team);
    let best: Player | null = null;
    let bestS = -Infinity;
    // apuntando con el stick: el compañero en esa dirección
    if (dir && dir.lengthSq() > 0.01) best = this.inDirection(m, team, p, dir.clone().normalize());
    if (!best) for (const q of team.active) {
      if (q === p || q.isGK || q.sentOff) continue;
      const qu = team.u(q.pos);
      if (qu < pu - 8) continue;
      const s = (q.slot.position === 'FWD' ? 2 : q.slot.position === 'MID' ? 1 : 0) + qu * 0.04 - dist2D(q.pos, p.pos) * 0.03;
      if (s > bestS) { bestS = s; best = q; }
    }
    if (!best) return;
    const bu = team.u(best.pos);
    const bl = team.l(best.pos);
    // a la espalda de la defensa, cerrando un poco hacia el centro
    const u = clamp(Math.max(bu + 10, off + 7), -HALF_LENGTH + 10, HALF_LENGTH - 8);
    const l = clamp(bl * 0.7, -HALF_WIDTH + 4, HALF_WIDTH - 4);
    best.forcedRunUntil = m.time + 3.5;
    best.forcedRunTarget.copy(team.toWorld(u, l));
    m.emit({ type: 'skill', kind: 'run', team: team.index, text: 'Desmarque' });
  }

  /** RB tocado con el balón: el compañero más cercano viene a ofrecerse en corto. */
  private callShort(m: Match, team: Team, p: Player) {
    const q = team.active.filter((x) => x !== p && !x.isGK && !x.sentOff).sort((a, b) => dist2D(a.pos, p.pos) - dist2D(b.pos, p.pos))[0];
    if (!q) return;
    const d = dist2D(q.pos, p.pos);
    const k = d > 8 ? (d - 7) / d : 0;
    q.forcedRunUntil = m.time + 2;
    q.forcedRunTarget.set(q.pos.x + (p.pos.x - q.pos.x) * k, 0, q.pos.z + (p.pos.z - q.pos.z) * k);
    m.emit({ type: 'skill', kind: 'run', team: team.index, text: 'Pide la pelota' });
  }

  /** Penal del jugador: punto del arco al que irá (solo para la ayuda visual). */
  penaltyAim: { path: Vector3[]; target: Vector3 } | null = null;
  /** Recepción tras el cambio inmediato al receptor de un pase. */
  private receiveLock: { player: Player; dir: Vector3; until: number } | null = null;
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
    if (!p || p.sentOff || (p.isGK && m.gkHolding !== p && m.owner !== p && !(m.restart?.taker === p && m.phase !== 'play') && !(m.phase === 'shootout'))) {
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

    // si el pase no llegó a salir (p. ej. le roban en el armado), se vuelve a controlar a quien tiene el balón
    const own = m.owner;
    if (own && own.team === team.index && own !== p && !own.isGK && own.action.kind !== 'kick') {
      team.controlled = own;
      p = own;
      this.receiveLock = null;
    }

    const inPlay = m.phase === 'play';
    const isTaker = !inPlay && m.restart?.taker === p && (m.restart.stage === 'ready' || m.phase === 'shootout');

    // Cruceta del mando (como en FIFA): ← → mentalidad del equipo
    if (input.padTactic !== 0) {
      team.mentality = clamp(team.mentality + input.padTactic, -2, 2);
      this.mentalityShownAt = m.time;
    }
    // LB (Q) con el balón, pulsado y soltado sin combinarlo con un golpeo: pide un desmarque
    if (m.owner === p && inPlay) {
      if (input.pressed('switch')) { this.lbDownAt = m.time; this.lbUsed = false; }
      if (input.held('switch') && KICK_ACTIONS.some((a) => input.held(a))) this.lbUsed = true;
      const lbRel = input.released('switch');
      if (lbRel >= 0 && lbRel < 0.45 && !this.lbUsed) this.callRun(m, team, p, hasStick ? stick : null);
      // RB (R1) tocado solo, con el balón: un compañero viene a pedirla en corto
      if (input.pressed('finesse')) this.rbUsed = false;
      if (input.held('finesse') && (KICK_ACTIONS.some((a) => input.held(a)) || input.holdTime('finesse') > 0.35)) this.rbUsed = true;
      const rbRel = input.released('finesse');
      if (rbRel >= 0 && rbRel < 0.35 && !this.rbUsed) this.callShort(m, team, p);
    }
    // Cambio manual (Q / LB)
    if (inPlay && input.pressed('switch') && m.gkHolding !== p && m.owner !== p && !(m.intendedReceiver === p && !m.owner)) {
      const next = hasStick ? this.inDirection(m, team, p, stick) : this.nearestToBall(m, team, p);
      // el cambio manual tiene prioridad: el cambio automático espera un rato
      if (next) { team.controlled = next; p = next; this.switchCooldown = 2.5; }
    }
    // Stick derecho (mando), como en FIFA:
    //  · sin balón: cambia al compañero en esa dirección
    //  · R3 mantenido: coloca al arquero (hacia un palo, adelante o atrás)
    //  · justo después de un pase con RB: el pasador corre en esa dirección (pared avanzada)
    //  · RB mantenido con un pase viniendo: primer toque orientado hacia ese lado
    const flick = input.rsFlick;
    if (flick && inPlay) {
      const w = new Vector3().addScaledVector(this.view.right, flick.x).addScaledVector(this.view.forward, flick.y);
      w.y = 0;
      w.normalize();
      const lp = this.lastPass;
      if (input.held('skillSpin')) {
        team.gkManual.set(w.x * 2, 0, w.z * 2.6);
        team.gkManualUntil = m.time + 4;
      } else if (lp && m.time - lp.at < 1.6 && lp.r1 && lp.player !== p && m.owner !== p) {
        lp.player.forcedRunUntil = m.time + 3;
        lp.player.forcedRunTarget.copy(lp.player.pos).addScaledVector(w, 13);
        lp.player.forcedRunTarget.x = clamp(lp.player.forcedRunTarget.x, -HALF_LENGTH + 3, HALF_LENGTH - 3);
        lp.player.forcedRunTarget.z = clamp(lp.player.forcedRunTarget.z, -HALF_WIDTH + 2, HALF_WIDTH - 2);
        this.lastPass = null;
      } else if (input.held('finesse') && ((m.intendedReceiver === p && !m.owner) || (this.receiveLock?.player === p && m.time < this.receiveLock.until))) {
        p.firstTouchDir.copy(w);
        p.firstTouchUntil = m.time + 2.5;
      } else if (m.owner !== p && m.gkHolding !== p) {
        const next = this.inDirection(m, team, p, w);
        if (next) { team.controlled = next; p = next; this.switchCooldown = 2.5; }
      }
    }
    // Cambio automático en defensa
    if (inPlay && this.settings.autoSwitch && this.switchCooldown <= 0 && m.owner !== p && m.gkHolding !== p) {
      const nearest = this.nearestToBall(m, team, null);
      if (nearest && nearest !== p) {
        const dn = dist2D(nearest.pos, m.ball.pos);
        const dp = dist2D(p.pos, m.ball.pos);
        const theirs = m.possessionTeam !== team.index;
        const assist = !!this.settings.assist;
        if (theirs && (assist ? dp > 6 && dn < dp * 0.7 : dp > 12 && dn < dp * 0.5)) {
          team.controlled = nearest;
          p = nearest;
          this.switchCooldown = assist ? 0.8 : 1.2;
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

    if (!isTaker) {
      this.freeKick = null;
      this.penaltyAim = null;
    }
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

    // Punto de apuntado del disparo (ayuda visual en el arco)
    this.aimTarget = null;
    if (m.owner === p && dist2D(p.pos, team.attackGoal) < 42) {
      const aimDir = hasStick ? stick.clone().normalize() : p.forward();
      const st = this.currentStyle();
      const { z, y } = this.shotAim(m, team, p, aimDir, 0.7, st.finesse);
      this.aimTarget = new Vector3(HALF_LENGTH * team.attackDir, st.chip ? 1.9 : st.low ? 0.2 : clamp(y, 0.3, 2.2), z);
    }

    // ----- Movimiento -----
    // en el móvil se corre solo: con el joystick virtual pasado de la mitad se esprinta (no hay botón de sprint)
    p.sprinting = input.held('sprint') || input.virtualMagnitude() > 0.6;
    const owner = m.owner === p || m.gkHolding === p;
    const defending = !owner && m.possessionTeam !== team.index && m.possessionTeam !== -1;
    // Recepción: mientras un pase de nuestro equipo viaja hacia el jugador controlado, este va a
    // buscar el balón (como en FIFA): el stick no lo aleja del pase; se vuelve a usar al recibir.
    const lock = this.receiveLock;
    let receiving = false;
    const pt = m.lastTouch;
    const incoming = !owner && !m.owner && !m.ball.held && m.intendedReceiver === p && !!pt && pt.team === team.index && pt.player !== p && pt.deliberate && m.time - pt.time < 4;
    const windup = !!lock && lock.player === p && m.time < lock.until && !owner && !!m.owner && m.owner.team === team.index;
    if (lock && !windup && !incoming) this.receiveLock = null;
    if (incoming && input.held('switch')) {
      // LB (L1) mantenido antes de recibir: deja pasar el balón (amago) para el compañero de atrás
      receiving = true;
      p.noTouchUntil = m.time + 0.15;
      if (hasStick) p.desiredVel.copy(stick).multiplyScalar(4);
      else p.desiredVel.set(0, 0, 0);
    } else if (incoming || windup) {
      receiving = true;
      if (!this.autoReceive(m, p)) {
        p.desiredVel.set(0, 0, 0);
      }
    }
    // Con el balón: LT (L2) protege con el cuerpo; RB (R1) o LB (L1) mantenidos, conducción de precisión
    const mine = m.owner === p;
    p.shielding = mine && input.held('jockey');
    p.precision = mine && !p.shielding && (input.held('finesse') || (input.held('switch') && input.holdTime('switch') > 0.3));
    if (p.shielding) {
      // de espaldas al rival más cercano, el balón del otro lado
      let near: Player | null = null;
      let nd = Infinity;
      for (const o of m.otherTeam(team.index).active) {
        const d = dist2D(o.pos, p.pos);
        if (d < nd) { nd = d; near = o; }
      }
      if (near && nd < 5) p.desiredFacing = Math.atan2(p.pos.x - near.pos.x, p.pos.z - near.pos.z);
    } else if (p.precision && input.held('switch') && !input.held('finesse')) {
      // regate estático (LB): de cara al arco rival mientras se mueve en cualquier dirección
      p.desiredFacing = Math.atan2(team.attackGoal.x - p.pos.x, team.attackGoal.z - p.pos.z);
    }
    // R2 (RT) + doble toque del stick derecho: autopase largo en carrera
    if (mine && input.held('sprint') && input.rsFlick) {
      const f = input.rsFlick;
      if (this.knockFlick && m.time - this.knockFlick.at < 0.4 && f.x * this.knockFlick.x + f.y * this.knockFlick.y > 0.6) {
        const w = new Vector3().addScaledVector(this.view.right, f.x).addScaledVector(this.view.forward, f.y);
        w.y = 0;
        w.normalize();
        const target = m.ball.pos.clone().addScaledVector(w, 10);
        m.requestKick(p, { ...buildGroundPass(m, p, target, 0.4, 1), kind: 'pass', targetId: p.id });
        this.knockFlick = null;
      } else {
        this.knockFlick = { x: f.x, y: f.y, at: m.time };
      }
    }
    if (receiving) {
      // va a buscar el balón (o lo deja pasar)
    } else if (hasStick) {
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
    // balón aéreo (centro, pase elevado): al punto de remate a la altura de la cabeza
    const air = m.ball.pos.y > 1 || m.ball.vel.y > 2 ? aerialIntercept(m, p) : null;
    const ic = air ?? interceptCache.get(p);
    if (!ic) return false;
    const dx = ic.point.x - p.pos.x;
    const dz = ic.point.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) {
      // en el punto de recepción: sale al encuentro del balón en vez de esperarlo quieto
      const bx = m.ball.pos.x - p.pos.x;
      const bz = m.ball.pos.z - p.pos.z;
      const bl = Math.hypot(bx, bz);
      const sp = air || bl > 15 || bl < 1e-3 ? 0 : receiveApproach(m, p, bl);
      p.desiredVel.set((bx / Math.max(bl, 1e-3)) * sp, 0, (bz / Math.max(bl, 1e-3)) * sp);
      p.desiredFacing = Math.atan2(bx, bz);
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
  private currentStyle(g: TouchGesture | null = null): ShotStyle {
    const input = this.input;
    const gesture = g && Math.hypot(g.dir.x, g.dir.y) > 0.5 ? g.dir : null;
    // botones táctiles de tipo de tiro: los que se mantienen ahora o los que se usaron en este disparo
    const t = g?.style ?? input.touchShot;
    const q = input.held('switch');
    const sh = input.held('finesse');
    const st: ShotStyle = {
      chip: q && !sh, // Q (LB) + tiro = vaselina
      finesse: sh && !q, // Shift (RB) + tiro = rosca
      power: q && sh, // Q + Shift (LB + RB) = potente (LT / Ctrl ahora es proteger el balón y el amago)
      low: false,
    };
    if (t.chip) st.chip = true;
    if (t.finesse) st.finesse = true;
    if (t.power) st.power = true;
    if (t.low) st.low = true;
    if (gesture) {
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
    // con RT (R2) el stick derecho hace el autopase largo, no un regate
    if (!g && input.held('sprint') && Math.hypot(input.rs.x, input.rs.y) > 0.45) return;
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
    if (input.held('finesse') && along > 0.6) kind = 'nutmeg'; // RB + ↑: caño
    else if (input.held('switch') && Math.abs(along) < 0.6) kind = 'croqueta'; // LB + ← →: croqueta
    else if (diagonal || (input.held('finesse') && Math.abs(along) < 0.6)) kind = 'elastico';
    else if (along > 0.6) kind = 'rainbow';
    else if (along < -0.6) kind = 'dragback';
    else kind = 'stepover';
    m.requestSkill(p, kind, side);
  }

  private trackCharges(m: Match, team: Team, p: Player, stick: Vector3, hasStick: boolean) {
    const input = this.input;
    this.charge = null;
    const owner = m.owner === p;
    // Dos botones pulsados casi a la vez (< 0,15 s): combinación (centro filtrado, pase filtrado…)
    for (const a of KICK_ACTIONS) {
      if (!input.pressed(a)) continue;
      for (const b of KICK_ACTIONS) {
        if (b === a || !input.held(b) || m.time - (this.pressAt[b] ?? -9) > 0.15) continue;
        const kind = COMBOS[[a, b].sort().join('+')];
        if (kind) {
          this.combo = { kind, fired: false };
          this.suppress.add(a);
          this.suppress.add(b);
        }
      }
      this.pressAt[a] = m.time;
    }
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
    // LB + RB (L1 + R1): cancela el pase o el tiro que se está armando
    if ((input.pressed('switch') && input.held('finesse')) || (input.pressed('finesse') && input.held('switch'))) {
      if (p.action.kind === 'kick' && !p.action.done) {
        p.clearAction();
        this.buffered = null;
        if (input.held('shoot')) this.cancelShootRelease = true;
        if (input.held('pass')) this.cancelPassRelease = true;
        this.lastCharge = { action: 'pass', value: 0, at: m.time, label: 'CANCELADO' };
        return;
      }
    }
    // LT + B (L2 + círculo) con el balón en el suelo: amago de tiro
    if (owner && input.held('jockey') && input.pressed('shoot') && (p.mobile || p.action.kind === 'trap')) {
      const left = new Vector3(Math.cos(p.facing), 0, -Math.sin(p.facing));
      const side: 1 | -1 = hasStick ? (stick.dot(left) >= 0 ? 1 : -1) : (m.rng.next() < 0.5 ? 1 : -1);
      if (m.requestSkill(p, 'fakeshot', side)) {
        this.cancelShootRelease = true;
        return;
      }
    }
    // Segundo toque de tiro durante el armado:
    //  · justo al impactar (≈0,1 s antes del contacto) = finalización perfecta (mucho más precisa)
    //  · enseguida (bastante antes) = tiro raso
    const k = p.action.kick;
    if (input.pressed('shoot') && p.action.kind === 'kick' && !p.action.done && k && this.lastShot
      && (k.kind === 'shoot' || k.kind === 'finesse' || k.kind === 'chip')) {
      const remaining = p.action.contactAt - p.action.time;
      if (remaining <= 0.11) {
        k.errorScale *= 0.3;
        k.power = Math.min(1, k.power * 1.08);
        this.timedShotAt = m.time;
        this.lastCharge = { action: 'shoot', value: this.lastShot.power, at: m.time, label: 'FINALIZACIÓN PERFECTA' };
        this.cancelShootRelease = true;
      } else if (!k.style?.low && !k.style?.chip) {
        const st: ShotStyle = { ...this.lastShot.style, low: true };
        const { z, y } = this.shotAim(m, team, p, this.lastShot.dir, this.lastShot.power, st.finesse);
        p.action.kick = buildShot(m, p, z, y, this.lastShot.power, st, 1);
        this.lastCharge = { action: 'shoot', value: this.lastShot.power, at: m.time, label: shotStyleName(st) };
        this.cancelShootRelease = true;
      }
    }
    for (const a of KICK_ACTIONS) {
      if (input.held(a)) {
        this.charge = { action: a, value: clamp(input.holdTime(a) / this.settings.powerBarTime, 0, 1), label: this.chargeLabel(a) };
      }
      const rel = input.released(a);
      if (rel >= 0 && this.suppress.has(a)) {
        // combinación: se golpea al soltar el primero de los dos botones
        this.suppress.delete(a);
        const c = this.combo;
        if (c && !c.fired) {
          c.fired = true;
          const power = clamp(rel / this.settings.powerBarTime, 0.3, 1);
          const dir = hasStick ? stick.clone().normalize() : p.forward();
          const main: KickAction = c.kind === 'splitPass' ? 'through' : c.kind === 'loftToFeet' ? 'pass' : 'lob';
          this.buffered = { action: main, power, finesse: input.held('finesse'), until: m.time + 0.7, dir, noStick: !hasStick, combo: c.kind };
          this.lastCharge = { action: main, value: power, at: m.time };
        }
        if (this.suppress.size === 0) this.combo = null;
        continue;
      }
      if (rel >= 0) {
        if (a === 'shoot' && this.cancelShootRelease) { this.cancelShootRelease = false; input.takeGesture('shot'); continue; }
        if (a === 'pass' && this.cancelPassRelease) { this.cancelPassRelease = false; continue; }
        let power = clamp(rel / this.settings.powerBarTime, 0.08, 1);
        const dir = hasStick ? stick.clone().normalize() : p.forward();
        const style = a === 'shoot' ? this.currentStyle(input.takeGesture('shot')) : undefined;
        // modo asistido: un toque rápido (sin cargar la barra) golpea con potencia automática
        if (this.settings.assist && rel < 0.28) power = this.autoPower(m, team, p, a, style);
        // LB + RB + B con una pulsación muy breve: tiro raso potente
        if (style && style.power && !style.chip && rel < 0.2 && input.held('switch') && input.held('finesse')) {
          style.low = true;
          style.chip = false;
          power = Math.max(power, 0.78);
        }
        // X (A en teclado) varias veces seguidas: centro bajo (2) o raso (3), como en FIFA
        if (a === 'lob' && this.lastLob && m.time - this.lastLob.at < 0.4) {
          const taps = Math.min(3, (this.lastLob.b.taps ?? 1) + 1);
          this.lastLob = { b: { ...this.lastLob.b, taps }, at: m.time };
          if (this.buffered && this.buffered.action === 'lob') {
            this.buffered.taps = taps;
            if (this.buffered.notBefore !== undefined) this.buffered.notBefore = m.time + 0.25;
            continue;
          }
          const k = p.action.kick;
          if (p.action.kind === 'kick' && !p.action.done && k && (k.kind === 'cross' || k.kind === 'lob')) {
            p.action.kick = this.makeKick(m, team, p, this.lastLob.b, false);
            this.lastCharge = { action: a, value: this.lastLob.b.power, at: m.time, label: taps === 2 ? 'CENTRO BAJO' : 'CENTRO RASO' };
            continue;
          }
        }
        this.lastCharge = { action: a, value: power, at: m.time, label: style ? shotStyleName(style) : undefined };
        const crossZone = a === 'lob' && team.u(p.pos) > HALF_LENGTH - 30 && Math.abs(p.pos.z) > 12;
        this.buffered = { action: a, power, finesse: input.held('finesse'), lb: input.held('switch'), l2: input.held('jockey'), until: m.time + (crossZone || (!m.owner && m.ball.pos.y > 0.4) ? 1.0 : 0.7), dir, noStick: !hasStick, style, taps: 1, notBefore: crossZone ? m.time + 0.25 : undefined };
        if (a === 'lob') this.lastLob = { b: { ...this.buffered }, at: m.time };
      }
    }
    if (this.buffered) {
      if (m.time > this.buffered.until) {
        this.buffered = null;
      } else if (this.buffered.notBefore !== undefined && m.time < this.buffered.notBefore && (this.buffered.taps ?? 1) < 3) {
        // esperando otro toque de X (centro bajo / raso)
      } else if (this.tryExecute(m, team, p, this.buffered)) {
        this.buffered = null;
      }
    }
  }

  private tryExecute(m: Match, team: Team, p: Player, b: Buffered): boolean {
    const ball = m.ball.pos;
    const dH = dist2D(p.pos, ball);
    const isOwner = m.owner === p;
    // Balón aéreo + TIRO: volea, tijera o chilena según la altura a la que llega y hacia dónde miras
    if ((!isOwner || ball.y > 0.35) && b.action === 'shoot' && !m.ball.held && !m.gkHolding && !p.busy) {
      const r = this.tryAerialShot(m, team, p, b);
      if (r !== null) return r;
    }
    // Balón bajo cruzado cerca del arco + PASE (cabezazo): cabezazo en plancha
    if (!isOwner && b.action === 'pass' && !m.ball.held && !m.gkHolding && !p.busy && dist2D(p.pos, team.attackGoal) < 22) {
      const r = this.tryDivingHeader(m, team, p, b);
      if (r !== null) return r;
    }
    // Cabezazo
    if (!isOwner && ball.y > 1.2 && ball.y < 2.8 && dH < 1.6 && !p.busy) {
      const req = this.makeKick(m, team, p, b, true);
      req.kind = 'header';
      req.velocity.multiplyScalar(0.7);
      if (b.action === 'shoot') {
        req.targetId = undefined;
        // el cabezazo se reapunta en el contacto hacia el mismo punto del arco
        const gx = HALF_LENGTH * team.attackDir;
        if (Math.abs(req.velocity.x) > 0.5) {
          const t = (gx - ball.x) / req.velocity.x;
          if (t > 0) req.aimAt = new Vector3(gx, 0, ball.z + req.velocity.z * t);
        }
      }
      return m.requestKick(p, req);
    }
    if (!isOwner && (dH > 1.25 || ball.y > 1.2)) return false;
    if (m.owner && m.owner !== p) return false;
    const req = this.makeKick(m, team, p, b, false);
    const ok = m.requestKick(p, req);
    if (ok) {
      this.switchToReceiver(m, team, req.targetId);
      if (b.action !== 'shoot') {
        this.lastPass = { player: p, at: m.time, r1: b.finesse };
        // LB + A (L1 + X): pared clásica, el pasador sale corriendo al espacio y la devolución va para él
        if (b.lb && b.action === 'pass') {
          const run = team.toWorld(clamp(team.u(p.pos) + 14, -HALF_LENGTH + 8, HALF_LENGTH - 8), team.l(p.pos) * 0.8);
          p.forcedRunUntil = m.time + 3.2;
          p.forcedRunTarget.copy(run);
          this.giveAndGo = { runner: p, until: m.time + 4.5 };
        }
      } else if (b.style?.power) {
        this.powerShotAt = m.time;
      }
    }
    return ok;
  }

  /**
   * Al pasar, el control pasa al receptor en el mismo momento de pulsar (no al llegar el balón).
   * Mientras el balón va hacia él, el stick que se tenía apuntando al pase no lo aleja: corre a recibir.
   */
  private switchToReceiver(m: Match, team: Team, targetId: string | undefined) {
    if (targetId === undefined || m.phase !== 'play') return;
    const rec = team.active.find((x) => x.id === targetId);
    if (!rec || rec.isGK || rec === team.controlled) return;
    team.controlled = rec;
    this.receiveLock = { player: rec, dir: this.stickWorld().clone(), until: m.time + 3.5 };
    this.switchCooldown = Math.max(this.switchCooldown, 1);
  }

  /**
   * Remate acrobático del jugador controlado. Devuelve true/false si lo intentó (o no pudo), o null si el balón
   * no le llega a una altura de volea, tijera o chilena (entonces se prueba el cabezazo o el golpeo normal).
   * Espera (false) hasta que el balón está a punto de llegar, para que el pie coincida con él.
   */
  private tryAerialShot(m: Match, team: Team, p: Player, b: Buffered): boolean | null {
    const ap = ballApproach(m.ball, p, 1.0, 0.05, 2.4);
    if (!ap || ap.miss > 1.4) return null;
    const gx = HALF_LENGTH * team.attackDir;
    const backToGoal = angleTo(p, gx, 0) > 1.9;
    const kind = chooseAerial(ap.y, backToGoal);
    if (!kind) return null;
    // taco de primera: solo a un balón que llega (no al que ya se tiene en los pies)
    if (kind === 'backheel' && m.owner === p) return null;
    if (ap.t > AERIAL_TIMING[kind].contact + 0.04) return false; // todavía no: se reintenta en el siguiente paso
    const req = this.makeKick(m, team, p, b, false);
    const { z, y } = this.shotAim(m, team, p, b.dir, b.power, false);
    req.kind = 'shoot';
    req.aerial = kind;
    req.style = undefined;
    req.spin.set(0, 0, 0);
    req.targetId = undefined;
    // la volea sale más tensa; la tijera y la chilena, algo más lentas
    const hs = (kind === 'volley' ? 19 : kind === 'scissor' ? 17 : 16) + b.power * 8;
    const h = Math.hypot(req.velocity.x, req.velocity.z) || 1;
    req.velocity.set((req.velocity.x / h) * hs, 0, (req.velocity.z / h) * hs);
    req.aimAt = new Vector3(gx, clamp(y * 0.8 + 0.25, 0.35, 2.1), z);
    req.power = Math.max(0.6, b.power);
    const ok = m.requestKick(p, req);
    if (ok) this.lastCharge = { action: 'shoot', value: b.power, at: m.time, label: AERIAL_NAMES[kind].toUpperCase() };
    return ok;
  }

  /** Cabezazo en plancha a un balón bajo que cruza por delante cerca del arco. */
  private tryDivingHeader(m: Match, team: Team, p: Player, b: Buffered): boolean | null {
    const ap = ballApproach(m.ball, p, 1.0, 0.3, 1.0);
    if (!ap || ap.miss > 1.9 || ap.miss < 0.5) return null; // si le llega a los pies, mejor de volea o con el pie
    if (ap.t > AERIAL_TIMING.diving.contact + 0.08) return false;
    const gx = HALF_LENGTH * team.attackDir;
    const { z } = this.shotAim(m, team, p, b.dir, 0.7, false);
    const req = this.makeKick(m, team, p, b, true);
    req.kind = 'header';
    req.aerial = 'diving';
    req.targetId = undefined;
    req.spin.set(0, 0, 0);
    const h = Math.hypot(req.velocity.x, req.velocity.z) || 1;
    req.velocity.set((req.velocity.x / h) * 16, 0, (req.velocity.z / h) * 16);
    req.aimAt = new Vector3(gx, 0.5, z);
    const ok = m.requestKick(p, req);
    if (ok) this.lastCharge = { action: 'pass', value: 0.6, at: m.time, label: 'EN PLANCHA' };
    return ok;
  }

  private makeKick(m: Match, team: Team, p: Player, b: Omit<Buffered, 'until'>, header: boolean) {
    const err = 1;
    const dir = b.dir;
    if (b.combo && !header) {
      const req = this.comboKick(m, team, p, b, err);
      if (req) return req;
    }
    switch (b.action) {
      case 'shoot': {
        const st: ShotStyle = header ? { ...NORMAL_SHOT } : b.style ?? { ...NORMAL_SHOT, finesse: b.finesse };
        const { z, y } = this.shotAim(m, team, p, dir, b.power, st.finesse);
        this.lastShot = { power: b.power, dir: dir.clone(), style: st };
        return buildShot(m, p, z, y, b.power, st, err);
      }
      case 'pass': {
        let q = this.pickReceiver(m, team, p, dir, false, !b.noStick);
        // pared: la devolución va para el que salió corriendo
        const gg = this.giveAndGo;
        if (gg && gg.runner !== p && m.time < gg.until && !gg.runner.sentOff) {
          q = gg.runner;
          this.giveAndGo = null;
          const lead = q.pos.clone().addScaledVector(q.vel, 0.7);
          return this.driven(buildGroundPass(m, p, lead, b.power - 0.2, err, q), b);
        }
        // sin dirección y sin nadie delante: al compañero mejor situado en cualquier dirección
        if (!q && b.noStick) q = this.pickFrom(p, team.active.filter((x) => x !== p && !x.isGK), dir);
        // LT + RB + A: vaselina corta (saca el balón del suelo); LT + A: pase con rosca
        if (q && b.l2 && b.finesse) return buildLob(m, p, q.pos.clone().addScaledVector(q.vel, 0.6), 44, err, q, 'lob');
        if (q && b.l2) {
          const curved = buildCurvedPass(m, p, q.pos.clone().addScaledVector(q.vel, 0.5), err, q);
          if (curved) return curved;
        }
        if (!q) {
          const target = p.pos.clone().addScaledVector(dir, 8 + b.power * 25);
          return buildGroundPass(m, p, target, b.power - 0.3, err);
        }
        const target = q.pos.clone().addScaledVector(q.vel, 0.25);
        const manual = this.settings.passAssist < 0.5;
        if (manual) {
          const d = 6 + b.power * 34;
          return this.driven(buildGroundPass(m, p, p.pos.clone().addScaledVector(dir, d), 0.2, err, q), b);
        }
        // RB + A: pase tenso (más rápido, como en FIFA)
        return this.driven(buildGroundPass(m, p, target, b.power - 0.35, err, q), b);
      }
      case 'through': {
        const q = this.pickReceiver(m, team, p, dir, true, !b.noStick);
        const run = new Vector3(team.attackDir, 0, 0).lerp(dir, 0.4).normalize();
        // el pase filtrado va al espacio inmediato del receptor (poco adelantado) para que llegue a controlarlo
        const lead = 1.5 + b.power * 5;
        const base = q ? q.pos.clone().addScaledVector(q.vel, 0.35) : p.pos;
        const target = base.clone().addScaledVector(run, lead);
        target.x = clamp(target.x, -HALF_LENGTH + 3, HALF_LENGTH - 3);
        target.z = clamp(target.z, -HALF_WIDTH + 2, HALF_WIDTH - 2);
        // LB + Y o LT + Y: pase al hueco bombeado por encima de la defensa; RB + Y: al hueco potente
        const req = b.lb || b.l2 ? buildLob(m, p, target, 34, err, q ?? undefined, 'lob') : this.driven(buildGroundPass(m, p, target, 0.25, err, q ?? undefined, 'through'), b);
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
        // LT + X: centro anticipado con rosca, ya desde tres cuartos de campo
        const crossing = (pu > HALF_LENGTH - 30 && Math.abs(p.pos.z) > 12) || (!!b.l2 && pu > HALF_LENGTH - 45 && Math.abs(p.pos.z) > 7);
        if (crossing) {
          // Centros como en FIFA: X normal · RB + X raso potente · LB + X bombeado alto · LB + RB + X al segundo palo
          // · LT + X anticipado con rosca · X X bajo · X X X raso
          const taps = b.taps ?? 1;
          const style: CrossStyle = taps >= 3 ? 'ground' : taps === 2 ? 'low' : b.finesse && !b.lb ? 'groundDriven' : b.lb && !b.finesse ? 'high' : b.l2 ? 'early' : 'normal';
          let { receiver, point } = chooseCrossTarget(m, team, p, b.noStick ? undefined : dir);
          if (b.lb && b.finesse) {
            // al segundo palo
            const side = Math.sign(team.l(p.pos)) || 1;
            point = crossSpots(team, side)[2];
            receiver = team.active.filter((x) => x !== p && !x.isGK).sort((x, y) => dist2D(x.pos, point) - dist2D(y.pos, point))[0] ?? null;
          }
          // la potencia corre el punto hacia el segundo palo (más) o el primero (menos)
          point.addScaledVector(new Vector3(team.attackDir, 0, 0), (b.power - 0.5) * 1.2);
          return buildCross(m, p, point, style, err, receiver);
        }
        const q = this.pickReceiver(m, team, p, dir, false, !b.noStick);
        const target = q ? q.pos.clone().addScaledVector(q.vel, 0.5) : p.pos.clone().addScaledVector(dir, 15 + b.power * 35);
        if (q && this.settings.passAssist < 0.5) target.copy(p.pos).addScaledVector(dir, 12 + b.power * 40);
        // RB + X: pase elevado tenso (más bajo y rápido)
        return buildLob(m, p, target, b.finesse ? 17 + b.power * 5 : 28 + b.power * 10, err, q ?? undefined, 'lob');
      }
    }
  }

  /**
   * Golpeos de dos botones a la vez:
   *  · △ + □ (Y + X): centro filtrado, bombeado al espacio a la espalda de la defensa para el que llega
   *  · ✕ + △ (A + Y): pase filtrado raso, entre los dos defensores más cercanos al receptor
   *  · ✕ + □ (A + X): pase bombeado al pie, por encima del rival que tapa la línea
   */
  private comboKick(m: Match, team: Team, p: Player, b: Omit<Buffered, 'until'>, err: number) {
    const dir = b.dir;
    const goal = team.attackGoal;
    if (b.combo === 'throughCross') {
      const q = this.pickReceiver(m, team, p, dir, true, !b.noStick) ?? chooseCrossTarget(m, team, p).receiver;
      if (!q) return null;
      // al espacio entre el receptor y el arco, dentro del área
      const gx = goal.x - q.pos.x;
      const gz = -q.pos.z * 0.6;
      const gl = Math.hypot(gx, gz) || 1;
      const lead = Math.min(5, Math.max(2, gl - 8));
      const point = new Vector3(q.pos.x + (gx / gl) * lead, 0, q.pos.z + (gz / gl) * lead);
      point.x = clamp(point.x, -HALF_LENGTH + 5, HALF_LENGTH - 5);
      q.duty = 'receive';
      q.tacticalTarget.copy(point);
      q.forcedRunUntil = m.time + 2.5;
      q.forcedRunTarget.copy(point);
      return buildCross(m, p, point, 'normal', err, q);
    }
    if (b.combo === 'splitPass') {
      const q = this.pickReceiver(m, team, p, dir, true, !b.noStick);
      if (!q) return null;
      // hueco entre los dos defensores más cercanos al receptor, y un poco por delante
      const defs = m.otherTeam(team.index).active.filter((o) => !o.isGK).sort((x, y) => dist2D(x.pos, q.pos) - dist2D(y.pos, q.pos)).slice(0, 2);
      const gap = defs.length === 2 ? defs[0].pos.clone().add(defs[1].pos).multiplyScalar(0.5) : q.pos.clone();
      const ahead = new Vector3(team.attackDir, 0, 0);
      const target = gap.lerp(q.pos, 0.6).addScaledVector(ahead, 1.5 + b.power * 3.5);
      // siempre al menos 1,5 m detrás de la línea de los dos centrales: pasa entre ellos y no se queda corto
      if ((target.x - gap.x) * team.attackDir < 1.5) target.x = gap.x + team.attackDir * 1.5;
      target.x = clamp(target.x, -HALF_LENGTH + 3, HALF_LENGTH - 3);
      target.z = clamp(target.z, -HALF_WIDTH + 2, HALF_WIDTH - 2);
      q.duty = 'receive';
      q.tacticalTarget.copy(target);
      q.forcedRunUntil = m.time + 2.5;
      q.forcedRunTarget.copy(target);
      const req = buildGroundPass(m, p, target, 0.45, err, q, 'through');
      req.velocity.multiplyScalar(1.12);
      return req;
    }
    if (b.combo === 'loftToFeet') {
      const q = this.pickReceiver(m, team, p, dir, false, !b.noStick);
      if (!q) return null;
      return buildLob(m, p, q.pos.clone().addScaledVector(q.vel, 0.5), 46, err, q, 'lob');
    }
    return null;
  }

  /** RB (Shift) mantenido al pasar: pase tenso, un 25 % más rápido. */
  private driven<T extends { velocity: Vector3; power: number }>(req: T, b: Omit<Buffered, 'until'>): T {
    if (b.finesse) {
      req.velocity.multiplyScalar(1.25);
      req.power = Math.min(1, req.power * 1.25);
    }
    return req;
  }

  /** Potencia automática de un toque rápido: según la distancia al arco o al receptor. */
  private autoPower(m: Match, team: Team, p: Player, a: KickAction, style?: ShotStyle): number {
    if (a === 'shoot') {
      const d = dist2D(p.pos, team.attackGoal);
      return clamp(0.42 + d / 55 + (style?.power ? 0.12 : 0), 0.5, 0.95);
    }
    return a === 'pass' ? 0.5 : 0.55;
  }

  /** Punto de apuntado en el arco a partir del stick y la potencia (como los juegos modernos). */
  private shotAim(m: Match, team: Team, p: Player, dir: Vector3, power: number, finesse: boolean) {
    const gx = HALF_LENGTH * team.attackDir;
    const assist = !!this.settings.assist;
    const gk = m.otherTeam(team.index).goalkeeper;
    const inner = GOAL_HALF_WIDTH - (assist ? 0.65 : 0.35);
    let z: number;
    const toGoalX = gx - p.pos.x;
    const stickAligned = Math.sign(dir.x) === Math.sign(toGoalX) && Math.abs(dir.x) > 0.15;
    const hasDir = this.input.move().x !== 0 || this.input.move().y !== 0 || (assist && stickAligned);
    if (hasDir) {
      if (stickAligned) {
        z = p.pos.z + (dir.z / dir.x) * toGoalX;
      } else {
        z = Math.sign(dir.z || p.pos.z || 1) * GOAL_HALF_WIDTH;
      }
      if (assist) {
        // imán: un disparo que iba "casi" al arco entra entre los palos
        if (Math.abs(z) < GOAL_HALF_WIDTH + 3.2) z = clamp(z, -inner, inner);
        // y se aleja del arquero si iba a su zona de alcance
        if (gk && Math.abs(z - gk.pos.z) < 1.1) z = clamp(z + (z >= gk.pos.z ? 1.5 : -1.5), -inner, inner);
      }
      z = clamp(z, -inner, inner);
    } else {
      // sin dirección: al palo más alejado del arquero (asistencia)
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
    // A (X) mantenido: posicionamiento automático. Cerca del portador, contener por delante del arco
    // (sin entrar); lejos, cerrar la línea de pase hacia su compañero más peligroso.
    if (input.held('pass') && carrier) {
      const goal = team.ownGoal;
      let tx: number;
      let tz: number;
      const dc = dist2D(p.pos, carrier.pos);
      if (dc < 8) {
        const gx = goal.x - carrier.pos.x;
        const gz = goal.z - carrier.pos.z;
        const gl = Math.hypot(gx, gz) || 1;
        tx = carrier.pos.x + (gx / gl) * 1.8 + carrier.vel.x * 0.25;
        tz = carrier.pos.z + (gz / gl) * 1.8 + carrier.vel.z * 0.25;
      } else {
        const ct = m.teams[carrier.team];
        const danger = ct.active.filter((q) => q !== carrier && !q.isGK).sort((a, b) => dist2D(a.pos, goal) - dist2D(b.pos, goal))[0];
        const to = danger ? danger.pos : goal;
        tx = carrier.pos.x + (to.x - carrier.pos.x) * 0.4;
        tz = carrier.pos.z + (to.z - carrier.pos.z) * 0.4;
      }
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.min(9.5, d * 3);
      if (d > 0.1) p.desiredVel.set((dx / d) * sp, 0, (dz / d) * sp);
      p.sprinting = input.held('sprint') || d > 4;
      if (d < 2.5) {
        p.desiredFacing = Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z);
        p.jockeying = dc < 4;
      }
      // pulsar A repetidamente corriendo al lado del rival: carga con el hombro
      if (input.pressed('pass') && dc < 1.6 && Math.hypot(p.vel.x, p.vel.z) > 3.5) m.shoulderChallenge(p, carrier);
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
    // carga con el hombro también con una pulsación suelta pegado al portador
    if (!input.held('pass') && input.pressed('pass') && carrier && dist2D(p.pos, carrier.pos) < 1.6 && Math.hypot(p.vel.x, p.vel.z) > 3.5) m.shoulderChallenge(p, carrier);
    // Contener (jockey)
    if (input.held('jockey')) {
      p.jockeying = true;
      p.desiredFacing = Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z);
    }
    // Entrada de pie / barrida
    // modo asistido: la entrada se orienta sola hacia el balón si el rival está cerca
    const faceBall = !!this.settings.assist && !!carrier && dist2D(p.pos, ball) < 4.5;
    if (input.pressed('shoot')) {
      if ((!hasStick || faceBall) && carrier) p.facing = Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z);
      m.requestTackle(p, false);
    } else if (input.released('lob') >= 0) {
      // X (cuadrado): barrida al soltar; cuanto más se mantiene, más alcance
      const hold = input.released('lob');
      if (!hasStick || faceBall) p.facing = Math.atan2(ball.x - p.pos.x, ball.z - p.pos.z);
      else p.facing = Math.atan2(stick.x, stick.z);
      m.requestTackle(p, true, 1 + clamp(hold - 0.15, 0, 0.5) * 0.5);
    }
    // Salida del arquero (Y mantenido); doble toque de Y: el arquero se queda en la línea
    if (input.pressed('through')) {
      if (m.time - this.yTapAt < 0.35) team.gkHoldLineUntil = m.time + 5;
      this.yTapAt = m.time;
    }
    if (input.held('through') && input.holdTime('through') > 0.15) {
      team.gkRushUntil = m.time + 0.3;
      team.gkHoldLineUntil = 0;
    }
    // Presión de un compañero (RB mantenido); doble toque de RB y mantener: presión de equipo
    if (input.pressed('finesse')) {
      this.teamPressHold = m.time - this.rbTapAt < 0.35;
      this.rbTapAt = m.time;
    }
    if (input.held('finesse')) {
      team.teammatePressUntil = m.time + 0.3;
      if (this.teamPressHold) team.teamPressUntil = m.time + 0.3;
    } else {
      this.teamPressHold = false;
    }
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
      // Y (triángulo) tocado con el balón en las manos: lo suelta al suelo para jugar con el pie
      if (a === 'through' && rel < 0.3) {
        m.gkDropBall(p);
        return;
      }
      if (a === 'pass' || a === 'through') {
        const q = this.pickReceiver(m, team, p, dir, false, hasStick);
        const target = q ? q.pos.clone() : p.pos.clone().addScaledVector(dir, 15 + power * 15);
        const req = buildGroundPass(m, p, target, power - 0.3, 1, q ?? undefined);
        req.kind = 'gkthrow';
        req.velocity.y = a === 'through' ? 4 : 1.2;
        m.requestKick(p, req);
      } else {
        const q = this.pickReceiver(m, team, p, dir, false, hasStick);
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
    const goal = team.attackGoal;
    // Tiro libre directo cerca del arco: se apunta la trayectoria del balón, no al jugador
    const fk = this.updateFreeKick(m, team, p, r);
    // Apuntar con el stick (gira al jugador)
    if (hasStick && !fk) {
      p.facing = Math.atan2(stick.x, stick.z);
    }
    const dir = hasStick ? stick.clone().normalize() : p.forward();
    this.charge = null;
    // Penal: mira visible en el arco (lado según el stick, altura según la potencia que se carga)
    if (r.type === 'penalty') {
      const mv = input.move();
      const lat = new Vector3().addScaledVector(this.view.right, mv.x).addScaledVector(this.view.forward, mv.y);
      const pw = input.held('shoot') ? clamp(input.holdTime('shoot') / this.settings.powerBarTime, 0.1, 1) : 0.45;
      const gx = (HALF_LENGTH + 0.3) * team.attackDir;
      this.penaltyAim = { path: [], target: new Vector3(gx, 0.2 + pw * pw * 2.1, clamp(lat.z * 3.4, -(GOAL_HALF_WIDTH - 0.3), GOAL_HALF_WIDTH - 0.3)) };
    } else {
      this.penaltyAim = null;
    }
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
        const st = this.currentStyle(input.takeGesture('shot'));
        m.requestKick(p, buildShot(m, p, z, y, power, st.chip ? { ...NORMAL_SHOT, chip: true } : false, 1, 'penalty'));
        return;
      }
      if (r.type === 'throwin') {
        const q = this.pickReceiver(m, team, p, dir, false, hasStick);
        const target = q ? q.pos.clone() : p.pos.clone().addScaledVector(dir, 8 + power * 12);
        const d = dist2D(m.ball.pos, target);
        const v = new Vector3(target.x - m.ball.pos.x, 0, target.z - m.ball.pos.z).normalize().multiplyScalar(clamp(d * 0.75 + 4, 6, a === 'lob' ? 19 : 15));
        v.y = clamp(d * 0.25 + 2, 3, 6.5);
        m.requestKick(p, { kind: 'throwin', velocity: v, spin: new Vector3(), targetId: q?.id, power: 0.4, errorScale: 1 });
        return;
      }
      if (a === 'shoot' && fk) {
        input.takeGesture('shot');
        // toque rápido con asistencia: potencia media (la trayectoria ya está apuntada)
        const pw = this.settings.assist && rel < 0.28 ? 0.6 : power;
        m.requestKick(p, this.freeKickRequest(m, team, fk, pw));
        this.freeKick = null;
        return;
      }
      if (a === 'shoot') {
        const st = this.currentStyle(input.takeGesture('shot'));
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

  /** Velocidad de salida del tiro libre según la potencia (0..1). */
  private static fkSpeed(power: number) {
    return 18 + clamp(power, 0, 1) * 14;
  }

  /** Giro del balón para el efecto elegido (ω vertical; positivo = curva hacia la izquierda del tirador). */
  private static fkSpin(curve: number) {
    return -curve * 62;
  }

  /**
   * Tiro libre directo (estilo FC): el stick mueve el punto de mira en el arco (izquierda/derecha y
   * altura), J/L, el stick derecho o los botones táctiles de efecto curvan la trayectoria, y TIRO
   * (mantener) da la potencia. La trayectoria prevista se recalcula con la física real del balón.
   */
  private updateFreeKick(m: Match, team: Team, p: Player, r: Restart) {
    const goal = team.attackGoal;
    const active = r.type === 'freekick' && r.team === team.index && r.taker === p && dist2D(m.ball.pos, goal) < 36;
    if (!active) {
      this.freeKick = null;
      return null;
    }
    let fk = this.freeKick;
    if (!fk || fk.restart !== r) {
      const far = -(Math.sign(m.ball.pos.z) || 1);
      fk = this.freeKick = { restart: r, aimZ: far * 2.2, aimY: 1.9, curve: 0, path: [], target: new Vector3(), power: 0.6 };
    }
    const input = this.input;
    const dt = 1 / 60;
    const mv = input.move();
    // izquierda/derecha de la pantalla → a lo ancho del arco; arriba/abajo → altura
    // la cámara del tiro libre va detrás del balón: la derecha de la pantalla es ±z en el mundo
    const lateral = Math.sign(this.view.right.z) || team.attackDir;
    fk.aimZ = clamp(fk.aimZ + mv.x * lateral * 3.2 * dt, -(GOAL_HALF_WIDTH + 2.5), GOAL_HALF_WIDTH + 2.5);
    fk.aimY = clamp(fk.aimY + mv.y * 1.7 * dt, 0.25, 3.6);
    if (input.held('skillLeft')) fk.curve = clamp(fk.curve - 1.1 * dt, -1, 1);
    if (input.held('skillRight')) fk.curve = clamp(fk.curve + 1.1 * dt, -1, 1);
    if (input.held('shoot')) fk.power = clamp(input.holdTime('shoot') / this.settings.powerBarTime, 0.1, 1);
    else fk.power = 0.6;
    const gx = (HALF_LENGTH + 0.3) * team.attackDir;
    const sol = solveCurvedKick(m.ball.pos, gx, fk.aimZ, fk.aimY, HumanController.fkSpeed(fk.power), HumanController.fkSpin(fk.curve), fk.path);
    fk.target.set(gx, fk.aimY, fk.aimZ);
    // el lanzador mira hacia donde sale el balón
    p.facing = Math.atan2(sol.velocity.x, sol.velocity.z);
    return fk;
  }

  private freeKickRequest(m: Match, team: Team, fk: NonNullable<HumanController['freeKick']>, power: number) {
    const gx = (HALF_LENGTH + 0.3) * team.attackDir;
    const { velocity, spin } = solveCurvedKick(m.ball.pos, gx, fk.aimZ, fk.aimY, HumanController.fkSpeed(power), HumanController.fkSpin(fk.curve));
    const curved = Math.abs(fk.curve) > 0.12;
    return {
      kind: curved ? 'finesse' as const : 'shoot' as const,
      velocity,
      spin,
      power: Math.min(1, 0.55 + power * 0.45),
      errorScale: 0.5,
      style: { ...NORMAL_SHOT, finesse: curved, power: power > 0.85 },
    };
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

  /**
   * Receptor del pase. Sin asistencia: el compañero más cercano a la dirección del stick (cono de ~60°).
   * Con asistencia: se puntúan todos los compañeros por dirección, espacio libre, línea de pase sin rivales,
   * distancia útil y progreso, y se evitan los fueras de juego; sin stick se mira hacia donde corre el jugador.
   */
  private pickReceiver(m: Match, team: Team, p: Player, dir: Vector3, forwardOnly = false, intent = true): Player | null {
    const cands = team.active.filter((q) => q !== p && (!q.isGK || team.u(p.pos) < -HALF_LENGTH + 30) && (!forwardOnly || !q.isGK));
    if (!this.settings.assist) {
      const best = this.pickFrom(p, cands, dir);
      if (!best) return null;
      const vx = best.pos.x - p.pos.x;
      const vz = best.pos.z - p.pos.z;
      const cos = (vx * dir.x + vz * dir.z) / Math.hypot(vx, vz);
      return cos > 0.45 ? best : null;
    }
    const opps = m.otherTeam(team.index).active;
    const offU = offsideLineU(m, team);
    const ballU = team.u(m.ball.pos);
    const pu = team.u(p.pos);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const q of cands) {
      const vx = q.pos.x - p.pos.x;
      const vz = q.pos.z - p.pos.z;
      const d = Math.hypot(vx, vz);
      if (d < 3) continue;
      const cos = (vx * dir.x + vz * dir.z) / d;
      if (intent && cos < -0.15) continue; // nunca en sentido contrario al stick
      const qu = team.u(q.pos);
      if (qu > offU + 0.1 && qu > ballU) continue; // en fuera de juego
      if (forwardOnly && qu < pu - 2) continue;
      let nearest = Infinity;
      let lane = Infinity;
      for (const o of opps) {
        nearest = Math.min(nearest, dist2D(o.pos, q.pos));
        const t = clamp(((o.pos.x - p.pos.x) * vx + (o.pos.z - p.pos.z) * vz) / (d * d), 0, 1);
        lane = Math.min(lane, Math.hypot(o.pos.x - (p.pos.x + vx * t), o.pos.z - (p.pos.z + vz * t)));
      }
      const open = clamp(nearest / 6, 0, 1);
      const laneClear = clamp(lane / 2.5, 0, 1);
      const distScore = clamp(1 - Math.abs(d - 16) / 30, 0, 1);
      const progress = (qu - pu) / 30;
      let score = cos * (intent ? 2.4 : 0.9) + open * 1.0 + laneClear * 1.3 + distScore * 0.5 + progress * (forwardOnly ? 2 : 0.6);
      if (q.isGK) score -= 1.5;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best;
  }

  /** Para la ayuda visual: ¿a quién iría un pase ahora? */
  previewReceiver(m: Match, team: Team): Player | null {
    const p = team.controlled;
    if (!p || m.owner !== p) return null;
    const hasStick = this.input.move().x !== 0 || this.input.move().y !== 0;
    return this.pickReceiver(m, team, p, hasStick ? this.aimDir : p.forward(), false, hasStick);
  }
}

export type { Action };
