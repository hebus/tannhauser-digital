/**
 * Plateaux produits par `tools/board-generator` (`npm run generate:boards`) : leur JSON ne se modifie pas à la main
 * (le contrôle de dérive échouerait), donc l'éditeur de plateaux refuse de les enregistrer. Cette liste doit rester
 * égale à `BOARDS` du générateur (vérifié par `tools/board-generator/boards.spec.ts`).
 */
export const GENERATED_BOARDS: readonly { readonly id: string; readonly file: string }[] = [
  { id: 'castle', file: 'castle-board.json' },
  { id: 'manoir', file: 'manoir-board.json' },
];
