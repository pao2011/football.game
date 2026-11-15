import { defineConfig } from 'vite';

// Apex Grand Prix (racing.html): compilación aparte para no tocar la del juego de fútbol
export default defineConfig({
  base: './',
  build: { outDir: 'dist-racing', chunkSizeWarningLimit: 1500, rollupOptions: { input: 'racing.html' } },
});
