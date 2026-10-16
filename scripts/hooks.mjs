// Activa los hooks de git del proyecto (.githooks/pre-commit regenera jugar.html). Lo ejecuta `npm install`.
// No falla si no hay git o si el proyecto no es un repositorio (p. ej. descargado como ZIP).
import { execSync } from 'node:child_process';
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
  // sin git: nada que hacer
}
