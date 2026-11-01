import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = fileURLToPath(new URL('../src', import.meta.url));

// The examples import the package by name; these aliases point it at the source, so no build is needed.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^three-motion-audit$/, replacement: `${src}/index.ts` },
      { find: /^three-motion-audit\/(.+)$/, replacement: `${src}/$1/index.ts` },
    ],
  },
});
