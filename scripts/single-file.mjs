// Genera el juego completo en UN solo archivo HTML (JS y CSS incluidos), listo para
// abrir sin servidor o publicar como página. Salidas:
//   jugar.html                      en la raíz del repositorio (y en dist/): se abre con doble clic tras
//                                   descargar el ZIP; index.html redirige aquí cuando se abre como archivo
//   release/FootballElite3D.html    el mismo documento, para publicarlo como descarga
//   release/artifact/index.html     fragmento (sin <html>/<head>) para publicarlo como página de claude.ai
// Los cánticos (.mp3) se incrustan como data: URI para que suenen también al abrir el archivo con doble clic.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const assets = readdirSync(join(dist, 'assets'));
const jsFiles = assets.filter((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
if (jsFiles.length !== 1 || !cssFile) throw new Error('Ejecuta primero: npm run build (debe generar un único .js)');

// Evita que el JS cierre la etiqueta <script> o abra un comentario HTML al incrustarlo
let js = readFileSync(join(dist, 'assets', jsFiles[0]), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
for (const f of assets.filter((a) => a.endsWith('.mp3'))) {
  const ref = JSON.stringify(f);
  if (!js.includes(ref)) throw new Error(`No se encontró la referencia a ${f} en el JS`);
  js = js.split(ref).join(JSON.stringify(`data:audio/mpeg;base64,${readFileSync(join(dist, 'assets', f)).toString('base64')}`));
}
const css = readFileSync(join(dist, 'assets', cssFile), 'utf8') + '\n:root{color-scheme:dark}\n';

const body = `<canvas id="game"></canvas>
<div id="ui"></div>
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
writeFileSync('jugar.html', fullDoc);
writeFileSync(join(dist, 'jugar.html'), fullDoc);
writeFileSync('release/FootballElite3D.html', fullDoc);
writeFileSync('release/artifact/index.html', fragment);
const mb = (s) => (Buffer.byteLength(s) / 1048576).toFixed(2);
console.log(`jugar.html y release/FootballElite3D.html ${mb(fullDoc)} MB\nrelease/artifact/index.html ${mb(fragment)} MB`);
