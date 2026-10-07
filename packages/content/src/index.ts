import devBoardJson from './data/dev-board.json';
import weaponsJson from './data/weapons.json';
import factionsJson from './data/factions.json';
import charactersJson from './data/characters.json';
// Généré par `npm run generate:boards` (tools/board-generator) : ne pas modifier à la main.
import castleBoardJson from './data/castle-board.json';
import { loadBoard, loadCharacters, loadFactions, loadWeapons, type LoadedBoard } from './loaders';

export * from './schemas';
export * from './loaders';

/**
 * Contenu de développement (placeholders originaux, aucun asset sous licence).
 * `boards` liste tous les plateaux sélectionnables (dev d'abord, puis château) ; `board` reste le plateau de dev
 * (rétro-compatibilité).
 */
export function loadDevContent() {
  const factions = loadFactions(factionsJson);
  const weapons = loadWeapons(weaponsJson);
  const characters = loadCharacters(charactersJson, factions, weapons);
  const board = loadBoard(devBoardJson, 'dev-board');
  const castle = loadBoard(castleBoardJson, 'castle-board');
  const boards: LoadedBoard[] = [board, castle];
  return { factions, weapons, characters, board, boards };
}
export * from './runtime';
