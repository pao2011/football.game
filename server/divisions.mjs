// Division Rivals: divisiones y puntos (lo comparten el servidor y el juego).

/** De la División 10 (inicio) a Élite. `min` = puntos necesarios. */
export const DIVISIONS = [
  { name: 'División 10', min: 0 },
  { name: 'División 9', min: 120 },
  { name: 'División 8', min: 260 },
  { name: 'División 7', min: 420 },
  { name: 'División 6', min: 600 },
  { name: 'División 5', min: 800 },
  { name: 'División 4', min: 1020 },
  { name: 'División 3', min: 1260 },
  { name: 'División 2', min: 1520 },
  { name: 'División 1', min: 1800 },
  { name: 'Élite', min: 2100 },
];

/** Índice de división (0 = División 10 … 10 = Élite) para unos puntos. */
export function divisionIndex(points) {
  let i = 0;
  while (i + 1 < DIVISIONS.length && points >= DIVISIONS[i + 1].min) i++;
  return i;
}

/** Información de progreso dentro de la división actual. */
export function divisionInfo(points) {
  const i = divisionIndex(points);
  const d = DIVISIONS[i];
  const next = DIVISIONS[i + 1] ?? null;
  return {
    index: i,
    name: d.name,
    points,
    next: next ? next.name : null,
    toNext: next ? next.min - points : 0,
    progress: next ? (points - d.min) / (next.min - d.min) : 1,
  };
}

/**
 * Puntos ganados o perdidos en un partido de Rivals.
 * Victoria +30 (+5 por gol de diferencia, máx. +10), empate +10, derrota −12 (−20 si abandonas).
 * Contra un rival de división más alta se gana algo más; los puntos nunca bajan de 0.
 */
export function rivalsDelta(myGoals, oppGoals, myPoints, oppPoints, forfeit = false) {
  const gap = divisionIndex(oppPoints) - divisionIndex(myPoints);
  if (forfeit) return -20;
  if (myGoals > oppGoals) return 30 + Math.min(10, (myGoals - oppGoals - 1) * 5) + Math.max(0, gap) * 4;
  if (myGoals === oppGoals) return 10 + Math.max(0, gap) * 2;
  return -12 + Math.max(0, gap) * 2;
}

/** Aplica el resultado a un registro de jugador (puntos, victorias…). */
export function applyRivals(rec, myGoals, oppGoals, oppPoints, forfeit = false) {
  const before = rec.points;
  const delta = rivalsDelta(myGoals, oppGoals, rec.points, oppPoints, forfeit);
  rec.points = Math.max(0, rec.points + delta);
  if (forfeit || myGoals < oppGoals) rec.losses++;
  else if (myGoals > oppGoals) rec.wins++;
  else rec.draws++;
  rec.best = Math.max(rec.best ?? 0, divisionIndex(rec.points));
  return { before, after: rec.points, delta: rec.points - before };
}
