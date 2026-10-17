import type { CrowdSampleUrls } from './CrowdSamples';
import golGrito1 from '../assets/crowd/gol-grito-1.mp3?url';
import golGrito2 from '../assets/crowd/gol-grito-2.mp3?url';
import silbidosLoop from '../assets/crowd/silbidos-loop.mp3?url';

/**
 * Grabaciones de tribuna: dos gritos de gol (solo la parte del grito, con entrada rápida y fundido
 * de salida) y un loop de silbidos del público de 30 s sin costura. Se incrustan como data: URI en jugar.html.
 */
export const CROWD_SAMPLES: CrowdSampleUrls = {
  goals: [golGrito1, golGrito2],
  whistles: silbidosLoop,
};
