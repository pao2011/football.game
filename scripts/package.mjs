// Genera ejecutables de escritorio con Electron para Linux y Windows (x64).
import { packager } from '@electron/packager';
import { cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';

const platforms = (process.env.PLATFORMS ?? 'linux,win32').split(',');
const stage = 'release/.stage';
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync('dist', `${stage}/dist`, { recursive: true });
cpSync('electron', `${stage}/electron`, { recursive: true });
writeFileSync(`${stage}/package.json`, JSON.stringify({ name: 'football-elite-3d', productName: 'Football Elite 3D', version: '1.0.0', main: 'electron/main.cjs' }, null, 2));
const paths = await packager({
  dir: stage,
  out: 'release',
  name: 'FootballElite3D',
  executableName: 'FootballElite3D',
  platform: platforms,
  arch: 'x64',
  electronVersion: '33.2.1',
  overwrite: true,
  asar: true,
  appCopyright: 'Football Elite 3D — proyecto original',
});
rmSync(stage, { recursive: true, force: true });
console.log('Ejecutables generados:\n' + paths.join('\n'));
