import { defineConfig } from 'vite';
export default defineConfig({ server: { fs: { deny: ['.env', '.env.*', '**/server.js', '**/*.server.js', '**/*.test.js', '**/email-config.local.json', '**/data/**'] } }, build: { rollupOptions: { input: { storefront: 'index.html', admin: 'admin.html', account: 'account.html', recovery: 'recovery.html' } } } });
