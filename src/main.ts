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

// Aplicación instalable (PWA) y juego sin conexión: solo en http(s) de producción (no en Electron ni en desarrollo)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker no registrado:', e));
  });
}

window.addEventListener('error', (e) => console.error('Error no controlado:', e.message));
boot();
