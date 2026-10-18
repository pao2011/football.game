import type { MatchConfig } from '../sim/Match';

/**
 * Estilo del marcador por competición: rótulo y colores propios de cada torneo (inspirados en el estilo de sus
 * transmisiones; no son los gráficos oficiales ni implican afiliación). El formato del marcador es siempre el mismo:
 * [competición] [periodo + reloj] [local] [goles] [visitante].
 */
interface Theme { label: string; dark: string; light: string; lightInk?: string; score?: string; scoreInk?: string; labelInk?: string }

const NAVY = '#0a0f3c';
const THEMES: Record<string, Theme> = {
  lpf: { label: 'LPF', dark: NAVY, light: '#d4d6dd' },
  primeranacional: { label: 'PRIMERA NACIONAL', dark: NAVY, light: '#d4d6dd' },
  brasil: { label: 'BRASILEIRÃO', dark: '#0b1d33', light: '#ffdf00', lightInk: '#0b1d33' },
  colombia: { label: 'LIGA COLOMBIANA', dark: '#111a3a', light: '#ffd100', lightInk: '#111a3a' },
  peru: { label: 'LIGA 1', dark: '#2a0d12', light: '#e8e8ec', lightInk: '#2a0d12' },
  chile: { label: 'CAMPEONATO', dark: '#0d1840', light: '#e8e8ec', lightInk: '#0d1840' },
  paraguay: { label: 'PARAGUAY', dark: '#10183a', light: '#e8e8ec', lightInk: '#10183a' },
  uruguay: { label: 'URUGUAY', dark: '#0b1d3d', light: '#7fb3e6', lightInk: '#06142e' },
  ecuador: { label: 'LIGAPRO', dark: '#0c1a33', light: '#ffd100', lightInk: '#0c1a33' },
  bolivia: { label: 'BOLIVIA', dark: '#0f1f17', light: '#e8e8ec', lightInk: '#0f1f17' },
  venezuela: { label: 'VENEZUELA', dark: '#2a0d12', light: '#e8e8ec', lightInk: '#2a0d12' },
  eng: { label: 'PREMIER LEAGUE', dark: '#38003c', light: '#00ff85', lightInk: '#38003c' },
  esp: { label: 'LALIGA', dark: '#16171d', light: '#ff4b44', lightInk: '#ffffff' },
  ita: { label: 'SERIE A', dark: '#0a1d3a', light: '#e8f0fa', lightInk: '#0a1d3a' },
  ger: { label: 'BUNDESLIGA', dark: '#16171d', light: '#d20515', lightInk: '#ffffff' },
  fra: { label: 'LIGUE 1', dark: '#0c1a3a', light: '#dbe83a', lightInk: '#0c1a3a' },
  por: { label: 'LIGA PORTUGAL', dark: '#10122e', light: '#e30613', lightInk: '#ffffff' },
  ned: { label: 'EREDIVISIE', dark: '#1a1b2e', light: '#ff6f00', lightInk: '#ffffff' },
  bel: { label: 'PRO LEAGUE', dark: '#12181f', light: '#f5c400', lightInk: '#12181f' },
  tur: { label: 'SÜPER LİG', dark: '#1d0a0d', light: '#e30a17', lightInk: '#ffffff' },
  sco: { label: 'PREMIERSHIP', dark: '#0a1f4b', light: '#e8f0fa', lightInk: '#0a1f4b' },
  libertadores: { label: 'LIBERTADORES', dark: '#0b1620', light: '#c8a24a', lightInk: '#0b1620' },
  sudamericana: { label: 'SUDAMERICANA', dark: '#0a1a3a', light: '#00a3e0', lightInk: '#ffffff' },
  champions: { label: 'CHAMPIONS LEAGUE', dark: '#0a1445', light: '#e8f0fa', lightInk: '#0a1445' },
  europa: { label: 'EUROPA LEAGUE', dark: '#1b1b1f', light: '#ff6c00', lightInk: '#ffffff' },
  conference: { label: 'CONFERENCE LEAGUE', dark: '#08261d', light: '#00c389', lightInk: '#08261d' },
  tournament: { label: 'COPA', dark: NAVY, light: '#d4d6dd' },
  friendly: { label: 'AMISTOSO', dark: NAVY, light: '#d4d6dd' },
};

export function competitionStyle(config: Pick<MatchConfig, 'competition' | 'training'>): { label: string; vars: Record<string, string> } {
  const t = THEMES[config.training ? 'friendly' : config.competition ?? 'friendly'] ?? THEMES.friendly;
  return {
    label: config.training ? 'ENTRENAMIENTO' : t.label,
    vars: {
      '--sb-dark': t.dark,
      '--sb-light': t.light,
      '--sb-light-ink': t.lightInk ?? t.dark,
      '--sb-score': t.score ?? '#ffffff',
      '--sb-score-ink': t.scoreInk ?? t.dark,
      '--sb-label': t.labelInk ?? '#ffffff',
    },
  };
}
