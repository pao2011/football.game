import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    // las tipografías (woff2) se incrustan en el CSS: también funcionan en jugar.html abierto como archivo
    assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? true : undefined),
    // un solo archivo JS (scripts/single-file.mjs lo incrusta en jugar.html)
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120000,
  },
} as any);
