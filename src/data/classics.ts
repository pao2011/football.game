/**
 * Clásicos entre equipos de Primera División y la estructura de zonas de la Liga Profesional.
 *
 * Cada torneo (Apertura y Clausura) se juega en dos zonas de 15 equipos. En una zona de 15 todos descansan
 * una fecha, y en esa fecha cada equipo juega el partido interzonal contra el equipo de la otra zona con el
 * que está emparejado: así los clásicos entre zonas son el partido interzonal de cada torneo. Los equipos sin
 * clásico en Primera juegan un interzonal común.
 */
export interface ZonePair {
  /** Equipo de la zona A. */
  a: string;
  /** Equipo de la zona B. */
  b: string;
  /** Nombre del clásico (si es un clásico verdadero). */
  classic?: string;
}

export const ZONE_PAIRS: ZonePair[] = [
  { a: 'boca', b: 'river', classic: 'Superclásico' },
  { a: 'independiente', b: 'racing', classic: 'Clásico de Avellaneda' },
  { a: 'newells', b: 'rosariocentral', classic: 'Clásico Rosarino' },
  { a: 'estudiantes', b: 'gimnasia', classic: 'Clásico Platense' },
  { a: 'talleres', b: 'belgrano', classic: 'Clásico Cordobés' },
  { a: 'banfield', b: 'lanus', classic: 'Clásico del Sur' },
  { a: 'gimnasiamza', b: 'indrivadavia', classic: 'Clásico Mendocino' },
  { a: 'sanlorenzo', b: 'huracan', classic: 'Clásico San Lorenzo – Huracán' },
  { a: 'tigre', b: 'platense', classic: 'Clásico Tigre – Platense' },
  // sin clásico en Primera: interzonal común
  { a: 'aldosivi', b: 'sarmiento' },
  { a: 'argentinos', b: 'barracas' },
  { a: 'atltucuman', b: 'centralcordoba' },
  { a: 'defensa', b: 'estudiantesrc' },
  { a: 'instituto', b: 'riestra' },
  { a: 'union', b: 'velez' },
];

export const ZONE_A = ZONE_PAIRS.map((p) => p.a);
export const ZONE_B = ZONE_PAIRS.map((p) => p.b);
/** Los 30 equipos de la Liga Profesional. */
export const LEAGUE_IDS = [...ZONE_A, ...ZONE_B];

/** Nombre del clásico entre dos equipos (null si no son rivales de clásico). */
export function classicName(a: string, b: string): string | null {
  for (const p of ZONE_PAIRS) {
    if (p.classic && ((p.a === a && p.b === b) || (p.a === b && p.b === a))) return p.classic;
  }
  return null;
}

/** Calor del partido 0..1: 0 normal, ~0.9 en un clásico (más roces, tarjetas, peleas y abucheos). */
export function matchHeat(a: string, b: string): number {
  return classicName(a, b) ? 0.9 : 0;
}
