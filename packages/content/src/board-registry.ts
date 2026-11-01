import { loadBoard, type LoadedBoard } from './loaders';

/** Plateaux historiques, toujours en tête de liste (le plateau de dev reste le premier : plateau par défaut). */
export const PINNED_BOARD_IDS: readonly string[] = ['dev-board', 'castle', 'manoir'];

/** Ordre de la liste des plateaux : les plateaux historiques d'abord, puis les autres par identifiant. */
export function orderBoards<T extends { readonly id: string }>(boards: readonly T[]): T[] {
  const rank = (id: string): number => {
    const i = PINNED_BOARD_IDS.indexOf(id);
    return i < 0 ? PINNED_BOARD_IDS.length : i;
  };
  return [...boards].sort((a, b) => rank(a.id) - rank(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Charge les plateaux d'un dictionnaire « chemin → JSON » (résultat de `import.meta.glob`) : la source d'une erreur
 * est le nom du fichier sans extension (`castle-board`).
 */
export function loadBoardModules(modules: Readonly<Record<string, unknown>>): LoadedBoard[] {
  return orderBoards(
    Object.entries(modules).map(([path, data]) => loadBoard(data, path.replace(/^.*\//, '').replace(/\.json$/, ''))),
  );
}
