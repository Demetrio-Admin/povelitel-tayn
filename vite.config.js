import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { host: true, allowedHosts: ['terminal.local'] }, build: { rollupOptions: { input: { index: 'index.html', admin: 'admin.html', v2: 'v2/index.html' } }, outDir: 'dist', assetsInlineLimit: 0 } });
