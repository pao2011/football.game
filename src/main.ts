import './ui/styles.css';
import { App } from './ui/App';

function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  try {
    const app = new App(canvas, ui);
    (window as any).__app = app; // acceso para pruebas automáticas
    app.start();
  } catch (err) {
    console.error(err);
    ui.innerHTML = `<div class="screen" style="align-items:center;justify-content:center;text-align:center">
      <h2>No se pudo iniciar Football Elite 3D</h2>
      <p>Tu navegador o tarjeta gráfica no soporta WebGL2 o se produjo un error.</p>
      <pre style="white-space:pre-wrap;font-size:12px;max-width:80vw">${String((err as Error)?.message ?? err)}</pre></div>`;
  }
}

window.addEventListener('error', (e) => console.error('Error no controlado:', e.message));
boot();
