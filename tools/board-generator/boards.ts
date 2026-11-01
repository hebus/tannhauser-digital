import type { BoardSpec } from './board-generator';
import { castleSpec } from './castle.map';
import { manoirSpec } from './manoir.map';

/**
 * Cartes produites par `npm run generate:boards`, et leur fichier dans `packages/content/src/data/`. Sans effet de bord
 * (contrairement à `generate.ts`) : importable par les tests. Doit rester égale à `GENERATED_BOARDS` de
 * `@tannhauser/content` (l'éditeur de plateaux refuse d'enregistrer ces fichiers) : voir `boards.spec.ts`.
 */
export const BOARDS: readonly { readonly spec: BoardSpec; readonly output: string }[] = [
  { spec: castleSpec, output: 'castle-board.json' },
  { spec: manoirSpec, output: 'manoir-board.json' },
];
