import devBoardJson from './data/dev-board.json';
import equipmentJson from './data/equipment.json';
import factionsJson from './data/factions.json';
import charactersJson from './data/characters.json';
// Généré par `npm run generate:boards` (tools/board-generator) : ne pas modifier à la main.
import castleBoardJson from './data/castle-board.json';
import manoirBoardJson from './data/manoir-board.json';
import { loadBoard, loadCharacters, loadEquipment, loadFactions, type LoadedBoard } from './loaders';

export * from './schemas';
export * from './loaders';

/**
 * Contenu de développement (placeholders originaux, aucun asset sous licence).
 * `boards` liste tous les plateaux sélectionnables (dev d'abord, puis château, puis manoir) ; `board` reste le plateau de dev
 * (rétro-compatibilité).
 */
export function loadDevContent() {
  const factions = loadFactions(factionsJson);
  const equipment = loadEquipment(equipmentJson);
  const characters = loadCharacters(charactersJson, factions, equipment);
  const board = loadBoard(devBoardJson, 'dev-board');
  const castle = loadBoard(castleBoardJson, 'castle-board');
  const manoir = loadBoard(manoirBoardJson, 'manoir-board');
  const boards: LoadedBoard[] = [board, castle, manoir];
  return { factions, equipment, characters, board, boards };
}
export * from './runtime';
