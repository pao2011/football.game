// Logros y desafíos: se desbloquean escuchando los eventos del partido del usuario (y algunos al terminar un
// torneo, una temporada o un partido online). Se guardan en el almacenamiento local.
import type { Match } from '../sim/Match';
import type { MatchEvent } from '../sim/types';
import { loadJSON, saveJSON } from '../save/Storage';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_goal', name: 'Primer gol', desc: 'Marca tu primer gol', icon: '⚽' },
  { id: 'first_win', name: 'Primera victoria', desc: 'Gana un partido', icon: '🏅' },
  { id: 'chip', name: 'Picadita', desc: 'Marca de vaselina', icon: '🪶' },
  { id: 'bicycle', name: 'Chilena de antología', desc: 'Marca de chilena', icon: '🤸' },
  { id: 'scorpion', name: 'Escorpión', desc: 'Marca de escorpión', icon: '🦂' },
  { id: 'volley', name: 'A la volea', desc: 'Marca de volea', icon: '💥' },
  { id: 'header', name: 'Cabeza de oro', desc: 'Marca de cabeza', icon: '🎯' },
  { id: 'longshot', name: 'Desde lejos', desc: 'Marca desde más de 25 m', icon: '🚀' },
  { id: 'hattrick', name: 'Hat-trick', desc: 'Un jugador marca 3 goles en un partido', icon: '🎩' },
  { id: 'cleansheet', name: 'Valla invicta', desc: 'Gana sin recibir goles', icon: '🧤' },
  { id: 'comeback', name: 'Remontada', desc: 'Gana un partido que ibas perdiendo', icon: '🔄' },
  { id: 'thrashing', name: 'Goleada', desc: 'Gana por 4 goles o más', icon: '🔥' },
  { id: 'nutmeg', name: 'Caño', desc: 'Supera a un rival con un caño', icon: '🦵' },
  { id: 'fairplay', name: 'Juego limpio', desc: 'Gana sin ninguna tarjeta', icon: '🤝' },
  { id: 'shootout', name: 'Nervios de acero', desc: 'Gana una tanda de penales', icon: '😤' },
  { id: 'snow', name: 'Bajo la nieve', desc: 'Gana un partido con nieve', icon: '❄' },
  { id: 'legend', name: 'Leyenda', desc: 'Gana en dificultad Leyenda', icon: '👑' },
  { id: 'cup', name: 'Campeón de la Copa', desc: 'Gana la Copa Élite', icon: '🏆' },
  { id: 'league', name: 'Campeón de liga', desc: 'Gana una temporada del modo carrera', icon: '🥇' },
  { id: 'rivals', name: 'Rival temible', desc: 'Gana un partido de Division Rivals', icon: '🌐' },
];

const KEY = 'achievements';

export function unlockedSet(): Record<string, number> {
  return loadJSON<Record<string, number>>(KEY, {});
}

/** Desbloquea un logro; devuelve su definición si es nuevo (o null si ya estaba). */
export function unlock(id: string): AchievementDef | null {
  const u = unlockedSet();
  if (u[id]) return null;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  u[id] = Date.now();
  saveJSON(KEY, u);
  return def;
}

/** Sigue un partido del usuario y desbloquea logros (también los que dependen del resultado final). */
export class AchievementTracker {
  /** Logros nuevos de este partido (para la pantalla de resultado). */
  readonly unlockedNow: AchievementDef[] = [];
  private lastKick = new Map<string, { kind: string; aerial?: string; t: number; dist: number }>();
  private trailed = false;
  onUnlock: ((a: AchievementDef) => void) | null = null;

  constructor(private match: Match, private team: 0 | 1) {}

  private give(id: string) {
    const a = unlock(id);
    if (a) {
      this.unlockedNow.push(a);
      this.onUnlock?.(a);
    }
  }

  private mine(id?: string) {
    return !!id && this.match.teams[this.team].players.concat(this.match.teams[this.team].subbedOff).some((p) => p.id === id);
  }

  onEvent(e: MatchEvent) {
    const m = this.match;
    if (m.config.training) return;
    if (e.type === 'kick' && e.playerId && this.mine(e.playerId)) {
      const p = m.playersAll.find((q) => q.id === e.playerId);
      const g = m.teams[this.team].attackGoal;
      const dist = p ? Math.hypot(g.x - p.pos.x, g.z - p.pos.z) : 0;
      this.lastKick.set(e.playerId, { kind: e.kind ?? '', t: m.time, dist });
    }
    if (e.type === 'skill' && e.playerId && this.mine(e.playerId)) {
      const k = this.lastKick.get(e.playerId);
      if (k && ['volley', 'scissor', 'bicycle', 'scorpion', 'diving', 'backheel'].includes(e.kind ?? '')) k.aerial = e.kind;
      if (e.kind === 'beat' && e.text === 'Caño') this.give('nutmeg');
    }
    if (e.type === 'goal' && e.kind !== 'shootout') {
      const [a, b] = m.teams;
      const ours = m.teams[this.team].stats.goals;
      const theirs = (this.team === 0 ? b : a).stats.goals;
      if (e.team !== this.team && theirs > ours) this.trailed = true;
      if (e.team === this.team && e.kind !== 'own' && e.playerId && this.mine(e.playerId)) {
        this.give('first_goal');
        const k = this.lastKick.get(e.playerId);
        if (k && m.time - k.t < 4) {
          if (k.kind === 'chip') this.give('chip');
          if (k.kind === 'header') this.give('header');
          if (k.aerial === 'bicycle') this.give('bicycle');
          if (k.aerial === 'scorpion') this.give('scorpion');
          if (k.aerial === 'volley') this.give('volley');
          if (k.dist > 25 && (k.kind === 'shoot' || k.kind === 'finesse' || k.kind === 'chip')) this.give('longshot');
        }
        const scorer = m.playersAll.find((q) => q.id === e.playerId);
        if (scorer && scorer.goals >= 3) this.give('hattrick');
      }
    }
  }

  /** Al final del partido: logros que dependen del resultado. */
  finish(winner: 0 | 1 | -1, penalties: boolean) {
    const m = this.match;
    if (m.config.training) return;
    if (winner !== this.team) return;
    const me = m.teams[this.team];
    const them = m.teams[this.team === 0 ? 1 : 0];
    this.give('first_win');
    if (penalties) this.give('shootout');
    if (them.stats.goals === 0) this.give('cleansheet');
    if (this.trailed) this.give('comeback');
    if (me.stats.goals - them.stats.goals >= 4) this.give('thrashing');
    if (me.stats.yellow === 0 && me.stats.red === 0) this.give('fairplay');
    if (m.weather === 'snow') this.give('snow');
    if (m.config.difficulty === 'legend') this.give('legend');
  }
}
