import { defineConfig } from 'vite';

// VITE_BASE : sous-chemin de déploiement (GitHub Pages : /tannhauser-digital/), "/" en dev.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: { target: 'es2022' },
});
