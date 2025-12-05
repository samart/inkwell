import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: '../cmd/inkwell/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        landing: 'landing.html',
        validate: 'validate-logo.html',
        render: 'render-svg.html',
        view: 'view-logos.html',
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
      '/assets': 'http://localhost:8080',
    },
  },
});
