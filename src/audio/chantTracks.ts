import type { ChantTrack } from './StadiumChants';
import bomboYRepique from '../assets/chants/bombo-y-repique.mp3?url';
import vamosQueTenemosQueGanar from '../assets/chants/vamos-que-tenemos-que-ganar.mp3?url';
import aVerSiPonenHuevos from '../assets/chants/a-ver-si-ponen-huevos.mp3?url';
import laVidaEsUnCarnaval from '../assets/chants/la-vida-es-un-carnaval.mp3?url';
import queEstaTardeTenemosQueGanar from '../assets/chants/que-esta-tarde-tenemos-que-ganar.mp3?url';
import belgrano1 from '../assets/chants/belgrano-1.mp3?url';
import belgrano2 from '../assets/chants/belgrano-2.mp3?url';
import belgrano3 from '../assets/chants/belgrano-3.mp3?url';
import belgrano4 from '../assets/chants/belgrano-4.mp3?url';
import belgrano5 from '../assets/chants/belgrano-5.mp3?url';
import belgrano6 from '../assets/chants/belgrano-6.mp3?url';
import belgrano7 from '../assets/chants/belgrano-7.mp3?url';
import belgrano8 from '../assets/chants/belgrano-8.mp3?url';
import belgranoMinuto68 from '../assets/chants/belgrano-minuto-68.mp3?url';

/**
 * Cánticos de cancha grabados, normalizados a −16 LUFS, mono 32 kHz.
 * En el juego de un solo archivo (jugar.html) scripts/single-file.mjs los incrusta como data: URI.
 */

/** Cánticos genéricos (Hinchadas Argentinas): estadios neutrales y clubes sin grabaciones propias. */
export const GENERIC_CHANTS: ChantTrack[] = [
  { name: 'Bombo y repique', url: bomboYRepique },
  { name: 'Vamos que tenemos que ganar', url: vamosQueTenemosQueGanar },
  { name: 'A ver si ponen huevos', url: aVerSiPonenHuevos },
  { name: 'La vida es un carnaval', url: laVidaEsUnCarnaval },
  { name: 'Que esta tarde tenemos que ganar', url: queEstaTardeTenemosQueGanar },
];

/** Cánticos de la hinchada de Belgrano: solo suenan en su cancha. */
export const BELGRANO_CHANTS: ChantTrack[] = [
  { name: 'Belgrano 1', url: belgrano1 },
  { name: 'Belgrano 2', url: belgrano2 },
  { name: 'Belgrano 3', url: belgrano3 },
  { name: 'Belgrano 4', url: belgrano4 },
  { name: 'Belgrano 5', url: belgrano5 },
  { name: 'Belgrano 6', url: belgrano6 },
  { name: 'Belgrano 7', url: belgrano7 },
  { name: 'Belgrano 8', url: belgrano8 },
];

/** Cánticos de cada hinchada (4 temas de ~1 minuto por club, sacados de sus compilados), por id de equipo. */
const CLUB_FILES = import.meta.glob('../assets/chants/clubs/*.mp3', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
export const CLUB_CHANTS: Record<string, ChantTrack[]> = {};
for (const [path, url] of Object.entries(CLUB_FILES).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
  const m = /\/([a-z]+)-(\d+)\.mp3$/.exec(path);
  if (!m) continue;
  (CLUB_CHANTS[m[1]] ??= []).push({ name: `${m[1]} ${m[2]}`, url });
}
// Belgrano: además de su compilado, los temas de la tribuna sacados de videos
CLUB_CHANTS.belgrano = [...BELGRANO_CHANTS, ...(CLUB_CHANTS.belgrano ?? [])];
// Boca: sus dos temas más los genéricos (hay pocas grabaciones propias)
CLUB_CHANTS.boca = [...(CLUB_CHANTS.boca ?? []), ...GENERIC_CHANTS];

export interface StadiumChantSet {
  tracks: ChantTrack[];
  /** Tema que no está en la rotación: suena una sola vez, justo al llegar al minuto indicado. */
  special?: { minute: number; track: ChantTrack };
}

/**
 * Cánticos de un estadio: los de la hinchada del club dueño de la cancha (solo suenan ahí); los estadios
 * neutrales y los clubes sin grabaciones usan los genéricos. Belgrano tiene además su tema del minuto 68.
 */
export function chantsForStadium(stadium: { id: string; homeTeam?: string }): StadiumChantSet {
  const club = stadium.homeTeam ? CLUB_CHANTS[stadium.homeTeam] : undefined;
  const set: StadiumChantSet = { tracks: club?.length ? club : GENERIC_CHANTS };
  if (stadium.homeTeam === 'belgrano') set.special = { minute: 68, track: { name: 'Belgrano minuto 68', url: belgranoMinuto68 } };
  return set;
}
