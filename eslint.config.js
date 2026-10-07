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
