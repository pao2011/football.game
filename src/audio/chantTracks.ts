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

/** Cánticos genéricos (Hinchadas Argentinas): suenan en todos los estadios menos en el de Belgrano. */
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

export interface StadiumChantSet {
  tracks: ChantTrack[];
  /** Tema que no está en la rotación: suena una sola vez, justo al llegar al minuto indicado. */
  special?: { minute: number; track: ChantTrack };
}

/** Cánticos de cada estadio. */
export function chantsForStadium(stadiumId: string): StadiumChantSet {
  if (stadiumId === 'villagra') return { tracks: BELGRANO_CHANTS, special: { minute: 68, track: { name: 'Belgrano minuto 68', url: belgranoMinuto68 } } };
  return { tracks: GENERIC_CHANTS };
}
