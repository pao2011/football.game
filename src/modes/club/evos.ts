import { baseIdOf, evolvedId, getCardDef } from './catalog';
import { addTx } from './economy';
import { EVOS, evoById, type EvoDef, type EvoMetric } from './evoDefs';
import { addSeasonPoints, track } from './progress';
import type { CardDef, ClubState, Result } from './types';
import { fail, ok } from './types';

// Evoluciones en curso: empezar, sumar progreso tras cada partido y subir de nivel la carta.
export const MAX_ACTIVE_EVOS = 3;

/** ¿Puede esta carta hacer esta evolución? (las ya evolucionadas no pueden empezar otra) */
export function evoEligible(e: EvoDef, d: CardDef): boolean {
  const r = e.req;
  if (d.evo) return false;
  if (d.ovr > r.maxOvr) return false;
  if (r.groups && !r.groups.includes(d.group)) return false;
  if (r.rarities && !r.rarities.includes(d.rarity)) return false;
  if (r.maxAge !== undefined && d.age > r.maxAge) return false;
  return true;
}

export function startEvo(s: ClubState, evoId: string, uid: string, now: number): Result<void> {
  const e = evoById(evoId);
  if (!e) return fail('Evolución no encontrada.');
  const c = s.inventory.find((x) => x.uid === uid);
  const d = c ? getCardDef(c.defId) : undefined;
  if (!c || !d) return fail('Esa carta no está en tu club.');
  if (s.evos.some((x) => x.uid === uid)) return fail('Esa carta ya está evolucionando.');
  if (s.evos.length >= MAX_ACTIVE_EVOS) return fail(`Máximo ${MAX_ACTIVE_EVOS} evoluciones a la vez.`);
  if (!evoEligible(e, d)) return fail(`La carta no cumple el requisito: ${e.req.text}.`);
  if (e.cost) { const tx = addTx(s, 'evo', -e.cost, `Evolución: ${e.name} (${d.name})`, now, uid); if (!tx.ok) return tx as Result<never>; }
  s.evos.push({ uid, evoId, level: 0, progress: e.levels[0].tasks.map(() => 0), startedAt: now });
  track(s, 'evoStart', 1, now);
  return ok(undefined);
}

export function cancelEvo(s: ClubState, uid: string): Result<void> {
  const i = s.evos.findIndex((x) => x.uid === uid);
  if (i < 0) return fail('Esa carta no está evolucionando.');
  s.evos.splice(i, 1);
  return ok(undefined);
}

/** Quita las evoluciones de cartas que ya no están en el club. */
export function cleanEvos(s: ClubState) {
  const have = new Set(s.inventory.map((c) => c.uid));
  s.evos = (s.evos ?? []).filter((x) => have.has(x.uid) && evoById(x.evoId));
}

/** Suma el partido a las evoluciones de los titulares. Devuelve los avisos (niveles completados). */
export function progressEvos(s: ClubState, starters: (string | null)[], stats: Record<EvoMetric, number>, now: number): string[] {
  const lines: string[] = [];
  for (const a of [...s.evos]) {
    if (!starters.includes(a.uid)) continue;
    const e = evoById(a.evoId)!;
    const lvl = e.levels[a.level];
    lvl.tasks.forEach((t, i) => { a.progress[i] = Math.min(t.target, (a.progress[i] ?? 0) + stats[t.metric]); });
    if (!lvl.tasks.every((t, i) => a.progress[i] >= t.target)) continue;
    const card = s.inventory.find((c) => c.uid === a.uid);
    if (!card) continue;
    a.level++;
    card.defId = evolvedId(baseIdOf(card.defId), e.id, a.level);
    const d = getCardDef(card.defId);
    track(s, 'evoLevel', 1, now);
    addSeasonPoints(s, 20, now);
    if (a.level >= e.levels.length) {
      s.evos.splice(s.evos.indexOf(a), 1);
      lines.push(`¡Evolución completada! ${d?.name ?? ''} ya es ${d?.ovr ?? ''} (${e.name}).`);
    } else {
      a.progress = e.levels[a.level].tasks.map(() => 0);
      lines.push(`Evolución: ${d?.name ?? ''} sube al nivel ${a.level} (${d?.ovr ?? ''}).`);
    }
  }
  return lines;
}

export { EVOS };
