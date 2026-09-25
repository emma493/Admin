import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Netlify serves the static dist/ output; local dev uses plain Vite HMR.
      hmr: true,
      fs: {
        // Local-only: parent path has `~` + space (`PICS ~Pictures`) which
        // breaks Vite's strict allowlist comparison even when the same path
        // is listed — disable strict check for `npm run dev`.
        // Production `npm run build` -> Netlify is unaffected.
        strict: false,
      },
    },
    build: {
      // Split the ~600kB single chunk so browser caches vendor bundles
      // separately and the app shell renders without waiting on Firebase.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/firestore', 'firebase/storage'],
            vendor: ['react', 'react-dom', 'react-router-dom'],
            forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
          },
        },
      },
    },
  };
});
