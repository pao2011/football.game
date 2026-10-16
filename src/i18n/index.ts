// Traducción de la interfaz (inglés y portugués). El juego está escrito en español; en vez de envolver cada
// texto del código, se traduce lo que aparece en pantalla: un observador recorre los nodos de texto nuevos y
// los cambia por su traducción (coincidencia exacta o patrones con partes variables, como nombres o números).
import { en } from './en';
import { pt } from './pt';

export type Lang = 'es' | 'en' | 'pt';

export interface Dict {
  /** Texto en español (sin espacios al principio ni al final) → traducción. */
  exact: Record<string, string>;
  /** Patrones para textos con partes variables; la traducción usa $1, $2… */
  patterns: [RegExp, string][];
}

const DICTS: Record<Exclude<Lang, 'es'>, Dict> = { en, pt };

export const LANG_NAMES: Record<Lang, string> = { es: 'Español', en: 'English', pt: 'Português' };

let lang: Lang = 'es';
/** Resultados de los patrones ya calculados (null = sin traducción). */
const CACHE: Record<Exclude<Lang, 'es'>, Map<string, string | null>> = { en: new Map(), pt: new Map() };

export function getLang(): Lang {
  return lang;
}

/** Idioma del navegador si está soportado (si no, español). */
export function detectLang(): Lang {
  const n = (typeof navigator !== 'undefined' ? navigator.language : 'es').toLowerCase();
  return n.startsWith('en') ? 'en' : n.startsWith('pt') ? 'pt' : 'es';
}

/** Traduce un texto al idioma actual (o lo devuelve igual si no hay traducción). */
export function tr(text: string, to: Lang = lang): string {
  if (to === 'es' || !text) return text;
  const d = DICTS[to];
  const core = text.trim();
  if (!core) return text;
  let out: string | undefined = d.exact[core];
  const cache = CACHE[to];
  if (out === undefined && cache.has(core)) out = cache.get(core) ?? undefined;
  else if (out === undefined) {
    for (const [re, rep] of d.patterns) {
      if (re.test(core)) {
        out = core.replace(re, (...m) => rep.replace(/\$(\d)/g, (_s, i) => {
          const v = m[Number(i)] as string | undefined;
          // las partes variables también se traducen si son textos conocidos (p. ej. nombres de posiciones)
          return v === undefined ? '' : d.exact[v] ?? v;
        }));
        break;
      }
    }
    if (cache.size > 4000) cache.clear();
    cache.set(core, out ?? null);
  }
  if (out === undefined) return text;
  // conservar los espacios del original
  const lead = text.slice(0, text.length - text.trimStart().length);
  const trail = text.slice(text.trimEnd().length);
  return lead + out + trail;
}

const originals = new WeakMap<Node, string>();
const ATTRS = ['title', 'placeholder', 'aria-label'];

function translateNode(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) {
    const parent = n.parentElement;
    if (!parent || parent.closest('script,style,[data-no-tr]')) return;
    const cur = n.nodeValue ?? '';
    // si el texto cambió desde la última traducción, el nuevo es el original
    const prev = originals.get(n);
    const orig = prev !== undefined && tr(prev) === cur ? prev : cur;
    originals.set(n, orig);
    const t = tr(orig);
    if (t !== cur) n.nodeValue = t;
    return;
  }
  if (n.nodeType !== Node.ELEMENT_NODE) return;
  const e = n as Element;
  if (e.closest('script,style,[data-no-tr]')) return;
  for (const a of ATTRS) {
    const v = e.getAttribute(a);
    if (v) {
      const t = tr(v);
      if (t !== v) e.setAttribute(a, t);
    }
  }
  const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let c: Node | null;
  while ((c = w.nextNode())) {
    if (c.nodeType === Node.TEXT_NODE) translateNode(c);
    else for (const a of ATTRS) {
      const el = c as Element;
      const v = el.getAttribute(a);
      if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
}

let observer: MutationObserver | null = null;

/** Cambia el idioma y traduce lo que ya está en pantalla y todo lo que aparezca después. */
export function setLang(l: Lang, root: Node = document.body) {
  lang = l;
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  document.documentElement.lang = l;
  observer?.disconnect();
  observer = null;
  if (l === 'es') return;
  translateNode(root);
  observer = new MutationObserver((muts) => {
    observer!.disconnect();
    for (const m of muts) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
    observer!.observe(root, OPTS);
  });
  observer.observe(root, OPTS);
}

const OPTS: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
