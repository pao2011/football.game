import { FORMATIONS } from '../../data/formations';
import type { FormationId } from '../../data/types';
import { fitPenalty, roleFit } from './roles';
import type { CardDef, Role, Squad, StyleId } from './types';
import { clamp } from './util';

// Química: cada jugador tiene 0..3 puntos según los vínculos con sus compañeros más cercanos en la formación
// (mismo club, misma nacionalidad, misma liga), su puesto y el entrenador. La química de la plantilla es la suma (0..33).
// Efecto en el partido: (química − 1) × 2,2 puntos en todos los atributos (de −2,2 a +4,4): ayuda, pero no sustituye a la calidad.

export interface Coach { id: string; name: string; nat: string; league: string; style: StyleId; blurb: string }
export const COACHES: Coach[] = [
  { id: 'c_gomez', name: 'Aníbal Gómez Rueda', nat: 'Argentina', league: 'lpf', style: 'balanced', blurb: 'Equilibrado · +1 química a los argentinos' },
  { id: 'c_menezes', name: 'Paulo Menezes', nat: 'Brasil', league: 'brasil', style: 'possession', blurb: 'Posesión · +1 química a los brasileños' },
  { id: 'c_ferrer', name: 'Joan Ferrer', nat: 'España', league: 'esp', style: 'possession', blurb: 'Posesión · +1 química a los de LaLiga' },
  { id: 'c_wolff', name: 'Matthias Wolff', nat: 'Alemania', league: 'ger', style: 'press', blurb: 'Presión alta · +1 química a los de la Bundesliga' },
  { id: 'c_bianchi', name: 'Stefano Bianchi', nat: 'Italia', league: 'ita', style: 'counter', blurb: 'Contraataque · +1 química a los italianos' },
  { id: 'c_clarke', name: 'Gareth Clarke', nat: 'Inglaterra', league: 'eng', style: 'press', blurb: 'Presión alta · +1 química a los de la Premier' },
  { id: 'c_quiroga', name: 'Mario Quiroga', nat: 'Uruguay', league: 'uruguay', style: 'counter', blurb: 'Contraataque · +1 química a los uruguayos' },
  { id: 'c_neutral', name: 'Entrenador interino', nat: '', league: '', style: 'balanced', blurb: 'Sin bonus de nacionalidad ni liga' },
];
export const STYLE_NAMES: Record<StyleId, string> = { balanced: 'Equilibrado', possession: 'Posesión', counter: 'Contraataque', press: 'Presión alta' };

export function coachById(id: string): Coach { return COACHES.find((c) => c.id === id) ?? COACHES[COACHES.length - 1]; }

/** ¿Encaja el jugador en el estilo táctico? (bonus de +1 de química) */
export function fitsStyle(d: CardDef, style: StyleId): boolean {
  const s = d.stats;
  switch (style) {
    case 'possession': return s.pas >= 72 && s.dri >= 68 && d.group !== 'GK';
    case 'counter': return s.pac >= 76 && d.group !== 'GK';
    case 'press': return s.phy >= 70 && (s.def >= 60 || d.group === 'FWD') && d.group !== 'GK';
    default: return false;
  }
}

export type LinkEdge = { a: number; b: number };
const edgeCache = new Map<FormationId, LinkEdge[]>();

/** Vínculos entre puestos de una formación: cada puesto se une a sus 3 vecinos más cercanos (dentro de un alcance). */
export function formationLinks(f: FormationId): LinkEdge[] {
  const hit = edgeCache.get(f);
  if (hit) return hit;
  const slots = FORMATIONS[f];
  const set = new Set<string>();
  const dist = (i: number, j: number) => Math.hypot(slots[i].depth - slots[j].depth, (slots[i].lateral - slots[j].lateral) * 0.5);
  slots.forEach((_, i) => {
    const near = slots.map((__, j) => j).filter((j) => j !== i).sort((x, y) => dist(i, x) - dist(i, y)).slice(0, 3).filter((j) => dist(i, j) <= 0.46);
    for (const j of near) set.add(i < j ? `${i}-${j}` : `${j}-${i}`);
  });
  const edges = [...set].map((k) => { const [a, b] = k.split('-').map(Number); return { a, b }; });
  edgeCache.set(f, edges);
  return edges;
}

/** Fuerza del vínculo entre dos cartas: club 2 · nacionalidad 1 · liga 1 (máx. 3). */
export function linkScore(a: CardDef, b: CardDef): number {
  let s = 0;
  if (a.clubId && a.clubId === b.clubId) s += 2;
  if (a.nat === b.nat) s += 1;
  if (a.league && a.league === b.league) s += 1;
  return Math.min(3, s);
}

export interface SlotEval {
  slot: number;
  role: Role;
  def: CardDef | null;
  fit: number;
  chem: number;
  /** Valoración efectiva en ese puesto con su química. */
  effOvr: number;
}
export interface SquadEval {
  slots: SlotEval[];
  links: { a: number; b: number; score: number }[];
  ovr: number;
  chem: number;
  filled: number;
}

export function chemAttrBonus(chem: number): number { return (chem - 1) * 2.2; }

/** Evalúa la alineación: ajuste de puesto, química y valoración de cada jugador y del equipo. */
export function evaluateSquad(formation: FormationId, defs: (CardDef | null)[], style: StyleId, coachId: string): SquadEval {
  const slots = FORMATIONS[formation];
  const coach = coachById(coachId);
  const links = formationLinks(formation).map((e) => {
    const a = defs[e.a];
    const b = defs[e.b];
    return { a: e.a, b: e.b, score: a && b ? linkScore(a, b) : -1 };
  });
  const evals: SlotEval[] = slots.map((s, i) => {
    const d = defs[i];
    if (!d) return { slot: i, role: s.role as Role, def: null, fit: 0, chem: 0, effOvr: 0 };
    const fit = roleFit(d.role, d.alt, s.role as Role);
    const mine = links.filter((l) => (l.a === i || l.b === i) && l.score >= 0);
    let chem = mine.length ? Math.round((mine.reduce((t, l) => t + l.score, 0) / mine.length) * 1.25) : 0;
    chem = clamp(chem, 0, 3);
    if (fitsStyle(d, style)) chem += 1;
    if (coach.nat && (d.nat === coach.nat || (coach.league && d.league === coach.league))) chem += 1;
    chem = clamp(chem, 0, 3);
    if (fit < 0.9) chem = 0; // fuera de su puesto no hay química
    else if (fit < 1) chem = Math.min(chem, 2);
    const effOvr = Math.round(d.ovr - fitPenalty(fit) + (chem - 1) * 1.5);
    return { slot: i, role: s.role as Role, def: d, fit, chem, effOvr: clamp(effOvr, 1, 99) };
  });
  const filled = evals.filter((e) => e.def).length;
  const ovr = filled ? Math.round(evals.reduce((t, e) => t + (e.def ? e.effOvr : 0), 0) / 11) : 0;
  return { slots: evals, links, ovr, chem: evals.reduce((t, e) => t + e.chem, 0), filled };
}
