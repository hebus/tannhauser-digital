import { loadBoard, loadDevContent, orderBoards, type LoadedBoard } from '@tannhauser/content';
import { browserBoardStorage, readLocalBoards } from './board-editor/local-boards';

/**
 * Contenu du jeu : celui du paquet `@tannhauser/content` plus les plateaux enregistrés dans ce navigateur par l'éditeur.
 * Un plateau local invalide, ou dont l'identifiant est déjà pris par un plateau embarqué, est ignoré (jamais bloquant).
 */
export function loadGameContent(storage: Pick<Storage, 'getItem'> | null = browserBoardStorage()): ReturnType<typeof loadDevContent> {
  const content = loadDevContent();
  const taken = new Set(content.boards.map((b) => b.id));
  const local: LoadedBoard[] = [];
  for (const [id, json] of Object.entries(readLocalBoards(storage))) {
    if (taken.has(id)) continue;
    try {
      local.push(loadBoard(json, `${id} (navigateur)`));
    } catch {
      // plateau local cassé : ignoré
    }
  }
  return local.length === 0 ? content : { ...content, boards: orderBoards([...content.boards, ...local]) };
}
