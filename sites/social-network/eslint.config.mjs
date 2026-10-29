import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    'dist/**',
    'mobile-dist/**',
    '.vinext/**',
    '.wrangler/**',
    '.sites-runtime/**',
    'outputs/**',
    'work/**',
  ]),
  {
    files: ['app/client/**/*.{ts,tsx}'],
    rules: {
      // Las fotos ya se convierten a WebP en el cliente. <img> conserva las URL
      // blob y la lectura con cookies de R2 tanto en la web como en Capacitor.
      '@next/next/no-img-element': 'off',
    },
  },
]);

export default eslintConfig;
