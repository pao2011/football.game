// Servidor online de Soffti's Football Game (gratis: tu PC, la red local o un plan gratuito como Render).
//   npm run server            (tras `npm run build` sirve también el juego desde dist/)
// Variables de entorno: PORT (8080), DATA_DIR (server/data).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { Lobby } from './lobby.mjs';
import { JsonStore } from './store.mjs';
import { Accounts } from './accounts.mjs';
import { handleApi } from './api.mjs';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

const APK_URL = 'https://github.com/pao2011/football.game/releases/latest/download/FootballElite3D.apk';
const store = new JsonStore(process.env.DATA_DIR || join(ROOT, 'server', 'data'));
const lobby = new Lobby(store);
const accounts = new Accounts(process.env.DATA_DIR || join(ROOT, 'server', 'data'));

function lanIps() {
  return Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

async function serve(req, res) {
  const url = new URL(req.url, 'http://x');
  if (await handleApi(req, res, { accounts, lobby, store })) return;
  if (url.pathname === '/estado') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, juego: 'football-elite-3d', online: lobby.clients.size, partidos: lobby.matches.size }));
    return;
  }
  if (url.pathname === '/sitio') {
    res.writeHead(302, { location: '/sitio/' });
    res.end();
    return;
  }
  if (url.pathname === '/apk' || url.pathname === '/apk/') {
    // atajo para compartir: lleva a la última APK publicada en GitHub
    res.writeHead(302, { location: APK_URL, 'cache-control': 'no-store' });
    res.end();
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  const file = join(DIST, path);
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('no es un archivo');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    if (path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Soffti's Football Game</title>
        <body style="font-family:sans-serif;background:#07101f;color:#fff;padding:40px">
        <h1>Servidor de Soffti's Football Game en marcha ✅</h1>
        <p>Ejecuta <code>npm run build</code> para servir también el juego desde aquí.</p>
        <p>WebSocket: <code>ws://${String(req.headers.host).replace(/[<>"]/g, '')}/ws</code></p></body>`);
    } else {
      res.writeHead(404);
      res.end('No encontrado');
    }
  }
}

const server = http.createServer((req, res) => {
  serve(req, res).catch(() => {
    res.writeHead(500);
    res.end();
  });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
wss.on('connection', (ws) => lobby.connect(ws));
wss.on('error', () => {});
setInterval(() => lobby.heartbeat(), 15000);
setInterval(() => lobby.matchmake(), 2000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`\n  [ERROR] El puerto ${PORT} ya está en uso. Prueba con otro: PORT=8081 npm run server\n`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  Servidor online de Soffti's Football Game en el puerto ${PORT}`);
  console.log(`  · Este ordenador:  http://localhost:${PORT}`);
  for (const ip of lanIps()) console.log(`  · Red local:       http://${ip}:${PORT}   (en el juego: ONLINE → Servidor → ${ip}:${PORT})`);
  console.log('');
});

function shutdown() {
  store.flush();
  accounts.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
