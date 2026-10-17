import type { ChantTrack } from './StadiumChants';
import bomboYRepique from '../assets/chants/bombo-y-repique.mp3?url';
import vamosQueTenemosQueGanar from '../assets/chants/vamos-que-tenemos-que-ganar.mp3?url';
import aVerSiPonenHuevos from '../assets/chants/a-ver-si-ponen-huevos.mp3?url';
import laVidaEsUnCarnaval from '../assets/chants/la-vida-es-un-carnaval.mp3?url';
import queEstaTardeTenemosQueGanar from '../assets/chants/que-esta-tarde-tenemos-que-ganar.mp3?url';
import cancha6 from '../assets/chants/cancha-6.mp3?url';
import cancha7 from '../assets/chants/cancha-7.mp3?url';
import cancha8 from '../assets/chants/cancha-8.mp3?url';
import cancha9 from '../assets/chants/cancha-9.mp3?url';
import cancha10 from '../assets/chants/cancha-10.mp3?url';

/**
 * Cánticos de cancha grabados (Hinchadas Argentinas), normalizados a −16 LUFS, mono 32 kHz.
 * En el juego de un solo archivo (jugar.html) scripts/single-file.mjs los incrusta como data: URI.
 */
export const CHANT_TRACKS: ChantTrack[] = [
  { name: 'Bombo y repique', url: bomboYRepique },
  { name: 'Vamos que tenemos que ganar', url: vamosQueTenemosQueGanar },
  { name: 'A ver si ponen huevos', url: aVerSiPonenHuevos },
  { name: 'La vida es un carnaval', url: laVidaEsUnCarnaval },
  { name: 'Que esta tarde tenemos que ganar', url: queEstaTardeTenemosQueGanar },
  { name: 'Cancha 6', url: cancha6 },
  { name: 'Cancha 7', url: cancha7 },
  { name: 'Cancha 8', url: cancha8 },
  { name: 'Cancha 9', url: cancha9 },
  { name: 'Cancha 10', url: cancha10 },
];
