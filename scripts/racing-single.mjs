// Apex Grand Prix en UN solo archivo HTML (apex-gp.html): se abre con doble clic o se sube a cualquier hosting.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist-racing';
const js = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
if (js.length !== 1) throw new Error('Se esperaba un único .js en dist-racing/assets');
// evita que el JS cierre la etiqueta <script> o abra un comentario HTML al incrustarlo
const code = readFileSync(join(dist, 'assets', js[0]), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const html = readFileSync(join(dist, 'racing.html'), 'utf8').replace(/<script type="module"[^>]*><\/script>/, () => `<script type="module">\n${code}\n</script>`);
if (!html.includes(code.slice(0, 200))) throw new Error('No se pudo incrustar el JS');
writeFileSync('apex-gp.html', html);
console.log(`apex-gp.html ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB`);
