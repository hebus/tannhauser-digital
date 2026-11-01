import { BOARD_ID_PATTERN, newBoardFileName, normalizeBoardJson, serializeBoard } from '@tannhauser/content/src/board-format';
import { GENERATED_BOARDS } from '@tannhauser/content/src/generated-boards';
import { diagnoseBoard } from '@tannhauser/content/src/loaders';
import { handleBoardEditorRequest, type ApiDeps, type BoardStore } from './api';

/**
 * Point d'entrée chargé par le plugin du serveur de développement (`server.ssrLoadModule`) : la configuration Vite ne
 * peut pas importer ce code directement (TypeScript des paquets, `import.meta.glob`). Aucun accès disque ici : le
 * plugin fournit le stockage et la fonction d'empreinte.
 */
export function createBoardEditorHandler(store: BoardStore, hash: (text: string) => string) {
  const deps: ApiDeps = {
    store,
    hash,
    generated: GENERATED_BOARDS,
    idPattern: BOARD_ID_PATTERN,
    newFileName: newBoardFileName,
    diagnose: diagnoseBoard,
    normalize: normalizeBoardJson,
    serialize: serializeBoard,
  };
  return (req: Parameters<typeof handleBoardEditorRequest>[0]) => handleBoardEditorRequest(req, deps);
}
