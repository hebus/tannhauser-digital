import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { boardEditorPlugin } from './board-editor-plugin';

// VITE_BASE : sous-chemin de déploiement (GitHub Pages : /tannhauser-digital/), "/" en dev.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: { target: 'es2022' },
  // Éditeur de plateaux (`?editor`, développement uniquement) : écrit dans les données de contenu.
  plugins: [boardEditorPlugin(fileURLToPath(new URL('../../packages/content/src/data', import.meta.url)))],
});
