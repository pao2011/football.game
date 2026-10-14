// Genera el juego completo en UN solo archivo HTML (JS y CSS incluidos), listo para
// abrir sin servidor o publicar como página. Salidas (en release/):
//   FootballElite3D.html      documento completo (abrir con doble clic, ejecutable offline)
//   artifact/index.html       fragmento (sin <html>/<head>) para publicarlo como página de claude.ai
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const assets = readdirSync(join(dist, 'assets'));
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) throw new Error('Ejecuta primero: npm run build');

// Evita que el JS cierre la etiqueta <script> o abra un comentario HTML al incrustarlo
const js = readFileSync(join(dist, 'assets', jsFile), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = readFileSync(join(dist, 'assets', cssFile), 'utf8') + '\n:root{color-scheme:dark}\n';

const body = `<canvas id="game"></canvas>
<div id="ui"></div>
<input type="checkbox" id="rotate-skip-toggle" class="rotate-toggle" aria-hidden="true" tabindex="-1"><div class="rotate-hint"><div class="phone"></div>GIRA EL DISPOSITIVO<br><small style="font-size:14px;opacity:.7">Football Elite 3D se juega en horizontal</small><label for="rotate-skip-toggle" class="rotate-skip">JUGAR IGUALMENTE</label></div>
<script type="module">
${js}
</script>`;

const fragment = `<title>Football Elite 3D</title>
<style>
${css}
</style>
${body}
`;

const fullDoc = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#070b14" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚽</text></svg>" />
<title>Football Elite 3D</title>
<style>
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;

mkdirSync('release/artifact', { recursive: true });
writeFileSync('release/FootballElite3D.html', fullDoc);
writeFileSync('release/artifact/index.html', fragment);
const mb = (s) => (Buffer.byteLength(s) / 1048576).toFixed(2);
console.log(`release/FootballElite3D.html ${mb(fullDoc)} MB\nrelease/artifact/index.html ${mb(fragment)} MB`);
