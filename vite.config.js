import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { host: true, allowedHosts: ['terminal.local'] }, build: { rollupOptions: { input: { index: 'index.html', admin: 'admin.html', cameraTest: 'camera-test/index.html' } }, outDir: 'dist', assetsInlineLimit: 0 } });
