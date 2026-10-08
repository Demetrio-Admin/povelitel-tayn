import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { host: true }, build: { rollupOptions: { input: { index: 'index.html', admin: 'admin.html' } }, outDir: 'dist', assetsInlineLimit: 0 } });
