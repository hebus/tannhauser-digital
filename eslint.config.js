import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-types/**', '.claude/**', '**/node_modules/**', '**/*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.ts', 'packages/renderer/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Contrat de rendu : ces fichiers sont COMMUNS à tous les rendus (Pixi 2D, 3D…) et n'importent donc aucun moteur graphique.
    files: ['packages/renderer/src/contract.ts', 'packages/renderer/src/presentation/{effects,presentation,plan,banner,animation-queue,path-geometry,timing}.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['pixi.js', 'pixi.js/*', '@pixi/*', 'three', 'three/*'], message: 'Fichier commun aux rendus : aucun moteur graphique ici (voir contract.ts).' }] },
      ],
    },
  },
  {
    // Règle d'architecture (§3.2) : le moteur ne dépend ni de Pixi, ni du DOM, ni du rendu.
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['pixi.js', 'pixi.js/*', '@pixi/*', 'gsap'], message: 'core ne doit pas dépendre du rendu.' },
            { group: ['@tannhauser/renderer', '@tannhauser/client'], message: 'core ne dépend de rien d\'autre.' },
          ],
        },
      ],
    },
  },
);
