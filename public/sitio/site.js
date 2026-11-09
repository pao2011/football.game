// Ranking y cuenta del sitio. La API vive en el servidor del juego (mismo origen cuando se sirve desde él).
const DEFAULT_API = 'https://football-elite-3d-19vc.onrender.com';
const API = location.protocol.startsWith('http') && !/github\.io|claude|usercontent/.test(location.hostname) ? '' : DEFAULT_API;
const KEY = 'football-elite-3d:account'; // la misma sesión que usa el juego (mismo origen)
const $ = (id) => document.getElementById(id);

const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del() { try { localStorage.removeItem(KEY); } catch { /* */ } },
};

async function api(path, init = {}) {
  const s = store.get();
  const r = await fetch(`${API}/api/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s.token}` } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error del servidor');
  return j;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// --- Ranking ---
(async function ranking() {
  try {
    const [{ top }, st] = await Promise.all([api('leaderboard'), api('stats')]);
    $('rk-body').innerHTML = top.length
      ? top.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.points}</td><td class="num">${r.wins}</td><td class="num">${r.draws}</td><td class="num">${r.losses}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">Todavía no hay partidos clasificatorios. ¡Sé el primero!</td></tr>';
    $('rk-stats').textContent = `${st.online} conectados ahora · ${st.accounts} cuentas`;
  } catch {
    $('rk-body').innerHTML = '<tr><td colspan="6" class="muted">No se pudo cargar el ranking. Si el servidor es gratuito, puede tardar un minuto en despertar: recarga luego.</td></tr>';
  }
})();

// --- Cuenta ---
let mode = 'login';
function setMode(m) {
  mode = m;
  $('t-login').setAttribute('aria-selected', String(m === 'login'));
  $('t-reg').setAttribute('aria-selected', String(m === 'register'));
  $('l-name').hidden = $('l-mail').hidden = m === 'login';
  $('l-who').hidden = m === 'register';
  $('f-pw').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('f-go').textContent = m === 'login' ? 'Entrar' : 'Crear cuenta';
  say('');
}
function say(t, err) { const m = $('ac-msg'); m.textContent = t; m.classList.toggle('err', !!err); }
$('t-login').onclick = () => setMode('login');
$('t-reg').onclick = () => setMode('register');

const LABELS = { club: 'Soffti Club', career: 'Carrera', tournament: 'Copa Élite', continental: 'Copas internacionales', achievements: 'Logros', customTeams: 'Equipos propios', 'online-profile': 'Perfil online' };
async function showAccount() {
  const s = store.get();
  $('ac-in').hidden = !!s;
  $('ac-out').hidden = !s;
  if (!s) return;
  $('o-name').textContent = s.name;
  $('o-mail').textContent = s.email;
  try {
    const { data } = await api('sync');
    const keys = Object.keys(data);
    const last = Math.max(0, ...keys.map((k) => data[k].t));
    $('o-prog').textContent = keys.length
      ? `Guardado en la nube: ${keys.map((k) => LABELS[k] || k).join(', ')}${last ? ` · última actualización ${new Date(last).toLocaleString('es')}` : ''}.`
      : 'Aún no hay progreso en la nube. Abre el juego con esta cuenta y se guardará solo.';
  } catch (e) {
    if (/sesión/i.test(e.message)) { store.del(); showAccount(); return; }
    $('o-prog').textContent = 'No se pudo leer tu progreso ahora mismo.';
  }
}
$('ac-form').onsubmit = async (e) => {
  e.preventDefault();
  say(mode === 'login' ? 'Entrando…' : 'Creando cuenta…');
  $('f-go').disabled = true;
  try {
    const body = mode === 'login' ? { who: $('f-who').value.trim(), password: $('f-pw').value } : { name: $('f-name').value.trim(), email: $('f-mail').value.trim(), password: $('f-pw').value };
    const r = await api(mode, { method: 'POST', body: JSON.stringify(body) });
    store.set({ token: r.token, ...r.user });
    $('f-pw').value = '';
    say('');
    showAccount();
  } catch (err) {
    say(err.message === 'Failed to fetch' ? 'No se pudo conectar con el servidor.' : err.message, true);
  } finally {
    $('f-go').disabled = false;
  }
};
$('o-exit').onclick = async () => { try { await api('logout', { method: 'POST', body: '{}' }); } catch { /* sin conexión */ } store.del(); showAccount(); };
showAccount();
