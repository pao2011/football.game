import { Vector3 } from 'three';
import { FORMATIONS } from '../data/formations';
import type { FormationId, KitData, TeamData } from '../data/types';
import { HALF_LENGTH, HALF_WIDTH } from '../config/constants';
import { Player } from './Player';

export interface TeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  possessionTime: number;
  fouls: number;
  corners: number;
  offsides: number;
  yellow: number;
  red: number;
  saves: number;
  tackles: number;
}

export class Team {
  players: Player[] = [];
  readonly bench: Player[] = [];
  /** Jugadores sustituidos (ya no pueden volver a entrar). */
  readonly subbedOff: Player[] = [];
  /** Cambios realizados. */
  subsUsed = 0;
  /** +1 si ataca hacia x positivo, -1 si ataca hacia x negativo. */
  attackDir: 1 | -1;
  /** Jugador controlado por el humano (null si el equipo es de la IA). */
  controlled: Player | null = null;
  readonly stats: TeamStats = {
    goals: 0, shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0, possessionTime: 0,
    fouls: 0, corners: 0, offsides: 0, yellow: 0, red: 0, saves: 0, tackles: 0,
  };
  formation: FormationId;
  /** Fase táctica actual calculada por la IA de equipo. */
  phase: 'attack' | 'defend' | 'transition' = 'defend';
  /** Línea defensiva (coordenada u del equipo) y bloque. */
  defensiveLineU = -30;
  scorers: { name: string; minute: number }[] = [];
  /** Mentalidad: −2 ultradefensiva … 0 equilibrada … +2 ultraofensiva. */
  mentality = 0;
  /** Órdenes del humano: salida del arquero y presión de un compañero (hasta este instante). */
  gkRushUntil = 0;
  teammatePressUntil = 0;
  /** Presión de equipo (doble toque de RB): más jugadores presionan. */
  teamPressUntil = 0;
  /** Arquero clavado en la línea (doble toque de Y). */
  gkHoldLineUntil = 0;
  /** Colocación manual del arquero (R3 + stick derecho). */
  gkManualUntil = 0;
  readonly gkManual = new Vector3();

  constructor(
    readonly index: 0 | 1,
    readonly data: TeamData,
    readonly kit: KitData,
    public human: boolean,
    formation?: FormationId,
    lineup?: string[],
  ) {
    this.attackDir = index === 0 ? 1 : -1;
    this.formation = formation ?? data.formation;
    const slots = FORMATIONS[this.formation];
    // Alineación: ids elegidos (modo carrera) o los 11 primeros
    const ids = lineup && lineup.length === 11 ? lineup : data.players.slice(0, 11).map((p) => p.id);
    const starters = ids.map((id) => data.players.find((p) => p.id === id)!).filter(Boolean);
    // El arquero titular siempre ocupa el slot 0
    const gkIdx = starters.findIndex((p) => p.position === 'GK');
    if (gkIdx > 0) [starters[0], starters[gkIdx]] = [starters[gkIdx], starters[0]];
    this.players = starters.map((pd, i) => new Player(pd, index, slots[i], i));
    for (const pd of data.players) {
      if (!ids.includes(pd.id)) this.bench.push(new Player(pd, index, slots[10], 10));
    }
  }

  get goalkeeper(): Player | undefined {
    return this.players.find((p) => p.isGK && !p.sentOff);
  }

  get active(): Player[] {
    return this.players.filter((p) => !p.sentOff);
  }

  /** Convierte coordenadas del equipo (u: hacia el arco rival, l: lateral derecha) a mundo. */
  toWorld(u: number, l: number, out = new Vector3()) {
    // atacando +x: derecha = +z ; atacando -x: derecha = -z
    return out.set(u * this.attackDir, 0, l * this.attackDir);
  }

  /** Coordenada u (avance hacia el arco rival) de una posición de mundo. */
  u(p: { x: number }) {
    return p.x * this.attackDir;
  }

  l(p: { z: number }) {
    return p.z * this.attackDir;
  }

  /** Centro del arco rival. */
  get attackGoal() {
    return new Vector3(HALF_LENGTH * this.attackDir, 0, 0);
  }

  get ownGoal() {
    return new Vector3(-HALF_LENGTH * this.attackDir, 0, 0);
  }

  /** Posición base de un slot de la formación (sin ajustes dinámicos). */
  slotBase(slotIndex: number, out = new Vector3()) {
    const s = FORMATIONS[this.formation][slotIndex];
    const u = -HALF_LENGTH + s.depth * HALF_LENGTH * 2;
    return this.toWorld(u, s.lateral * HALF_WIDTH * 0.82, out);
  }
}
