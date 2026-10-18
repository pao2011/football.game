// Escudos de los clubes (webp de 192 px en src/assets/crests/<id>.webp). jugar.html los incrusta como data: URI.
const FILES = import.meta.glob('../assets/crests/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export const CRESTS: Record<string, string> = {};
for (const [path, url] of Object.entries(FILES)) {
  const m = /\/([^/]+)\.webp$/.exec(path);
  if (m) CRESTS[m[1]] = url;
}
