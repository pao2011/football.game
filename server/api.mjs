// API HTTP: cuentas, sincronización y datos públicos (para el sitio web).
//   POST /api/register {name,email,password}   POST /api/login {who,password}   POST /api/logout
//   GET /api/me   GET|PUT /api/sync (Authorization: Bearer <token>)   GET /api/leaderboard   GET /api/stats
const MAX_BODY = 4_000_000;
const WINDOW = 10 * 60_000;
const MAX_TRIES = 30;
const tries = new Map(); // ip → { n, since }

function limited(ip) {
  const now = Date.now();
  let r = tries.get(ip);
  if (!r || now - r.since > WINDOW) tries.set(ip, (r = { n: 0, since: now }));
  return ++r.n > MAX_TRIES;
}

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('grande')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/** Devuelve true si la ruta era de la API (y ya respondió). */
export async function handleApi(req, res, { accounts, lobby, store }) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;
  if (req.method === 'OPTIONS') { send(res, 204, {}); return true; }
  const route = url.pathname.slice(5);
  try {
    if (route === 'leaderboard') return send(res, 200, { top: store.top(25).map((r) => ({ name: r.name, points: r.points, wins: r.wins, draws: r.draws, losses: r.losses })) }), true;
    if (route === 'stats') return send(res, 200, { online: lobby.clients.size, matches: lobby.matches.size, accounts: accounts.users.size }), true;
    const ip = req.socket.remoteAddress || '';
    if (route === 'register' || route === 'login') {
      if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' }), true;
      if (limited(ip)) return send(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' }), true;
      const b = await body(req);
      const r = route === 'register' ? await accounts.register(b) : await accounts.login(b);
      return send(res, r.error ? (route === 'login' ? 401 : 400) : 200, r), true;
    }
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const u = accounts.auth(token);
    if (!u) return send(res, 401, { error: 'Sesión no válida.' }), true;
    if (route === 'me') return send(res, 200, { user: accounts.pub(u) }), true;
    if (route === 'logout') return accounts.logout(u, token), send(res, 200, { ok: true }), true;
    if (route === 'sync' && (req.method === 'GET' || req.method === 'PUT')) {
      const data = accounts.sync(u, req.method === 'PUT' ? (await body(req)).data : null);
      return send(res, 200, { data }), true;
    }
    return send(res, 404, { error: 'No encontrado.' }), true;
  } catch {
    return send(res, 400, { error: 'Petición no válida.' }), true;
  }
}
