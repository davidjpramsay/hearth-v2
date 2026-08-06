import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4310',
    },
  },
  preview: {
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4310',
    },
  },
  build: {
    target: 'baseline-widely-available',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
