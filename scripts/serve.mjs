// Sirve la compilación (dist/) en http://localhost:8080 y abre el juego en el navegador.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { exec } from 'node:child_process';

const ROOT = resolve('dist');
if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('No existe dist/. Ejecuta primero: npm run build');
  process.exit(1);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const port = Number(process.env.PORT ?? 8080);
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) throw new Error('ruta no válida');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('No encontrado');
  }
}).listen(port, () => {
  const url = `http://localhost:${port}/`;
  console.log(`Football Elite 3D disponible en ${url}  (Ctrl+C para salir)`);
  const cmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  if (!process.env.NO_OPEN) exec(cmd, () => {});
});
