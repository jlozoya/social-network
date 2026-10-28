import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const origin = process.env.SOCIAL_NETWORK_SITES_URL;
if (!origin) throw new Error('Define SOCIAL_NETWORK_SITES_URL con el origen HTTPS del Site.');
const parsed = new URL(origin);
if (
  parsed.protocol !== 'https:' ||
  parsed.username ||
  parsed.password ||
  parsed.search ||
  parsed.hash ||
  parsed.pathname !== '/'
) {
  throw new Error('SOCIAL_NETWORK_SITES_URL debe ser un origen HTTPS.');
}

export default defineConfig({
  root: fileURLToPath(new URL('./mobile', import.meta.url)),
  plugins: [react()],
  define: { __SOCIAL_NETWORK_ORIGIN__: JSON.stringify(parsed.origin) },
  css: { postcss: fileURLToPath(new URL('.', import.meta.url)) },
  build: { outDir: '../mobile-dist', emptyOutDir: true, target: 'es2022' },
});
