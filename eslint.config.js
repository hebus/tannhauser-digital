import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-types/**', '.claude/**', '**/node_modules/**', '**/*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.ts', 'packages/renderer/**/*.ts', 'packages/renderer-3d/**/*.ts'],
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
    // Le rendu 3D n'embarque pas Pixi : l'index de @tannhauser/renderer l'importe, on passe donc par ses modules purs (sous-chemins).
    files: ['packages/renderer-3d/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@tannhauser/renderer', message: "Importer le module pur voulu (@tannhauser/renderer/src/…) : l'index tire Pixi." }],
          patterns: [{ group: ['pixi.js', 'pixi.js/*', '@pixi/*'], message: 'Le rendu 3D ne dépend pas de Pixi.' }],
        },
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
