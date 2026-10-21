import type { AudioEngine } from '../../audio/AudioEngine';
import type { Club } from '../../modes/club/Club';
import type { Handlers, Screen } from '../dom';

/** Lo que cada pantalla del modo Club necesita de la aplicación. */
export interface ClubHost {
  /** Muestra una pantalla (reemplaza la actual). `back` se ejecuta con Esc / Volver. */
  show(html: string, handlers: Handlers, back: (() => void) | null, cls?: string): Screen;
  audio: AudioEngine;
  club: Club;
  now(): number;
  /** Aviso breve (ok o error) sobre la pantalla actual. */
  toast(text: string, kind?: 'ok' | 'err'): void;
  /** Vuelve al panel principal del club. */
  hub(): void;
  /** Abre otra pantalla del modo. */
  goto(screen: 'squad' | 'packs' | 'market' | 'collection' | 'competitions' | 'objectives' | 'sbc' | 'history'): void;
}

export type ClubScreenFn = (host: ClubHost) => void;
