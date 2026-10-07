import devBoardJson from './data/dev-board.json';
import weaponsJson from './data/weapons.json';
import factionsJson from './data/factions.json';
import charactersJson from './data/characters.json';
import { loadBoard, loadCharacters, loadFactions, loadWeapons } from './loaders';

export * from './schemas';
export * from './loaders';

/** Contenu de développement (placeholders originaux, aucun asset sous licence). */
export function loadDevContent() {
  const factions = loadFactions(factionsJson);
  const weapons = loadWeapons(weaponsJson);
  const characters = loadCharacters(charactersJson, factions, weapons);
  const board = loadBoard(devBoardJson, 'dev-board');
  return { factions, weapons, characters, board };
}
