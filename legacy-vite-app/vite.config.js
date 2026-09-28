import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Single-page app; output goes to dist/ and can be hosted anywhere static
// (Netlify, GitHub Pages, a folder on the branch PC, etc).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
