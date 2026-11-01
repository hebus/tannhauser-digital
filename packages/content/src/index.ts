import equipmentJson from './data/equipment.json';
import factionsJson from './data/factions.json';
import charactersJson from './data/characters.json';
import { loadBoardModules } from './board-registry';
import { loadCharacters, loadEquipment, loadFactions } from './loaders';

export * from './schemas';
export * from './loaders';
export * from './board-format';
export * from './board-registry';
export * from './generated-boards';

// Tous les plateaux de `data/` : écrits à la main (dev-board), générés par `npm run generate:boards` (castle, manoir :
// ne pas modifier à la main) ou enregistrés par l'éditeur de plateaux. Un nouveau fichier apparaît sans autre réglage.
const boardModules = import.meta.glob<unknown>('./data/*-board.json', { eager: true, import: 'default' });

/** JSON bruts des plateaux embarqués dans l'application (l'éditeur de plateaux du navigateur les propose en lecture seule). */
export function bundledBoardSources(): unknown[] {
  return Object.values(boardModules);
}

/**
 * Contenu de développement (placeholders originaux, aucun asset sous licence).
 * `boards` liste tous les plateaux sélectionnables (dev d'abord, puis château, puis manoir, puis les autres par
 * identifiant) ; `board` reste le plateau de dev (rétro-compatibilité).
 */
export function loadDevContent() {
  const factions = loadFactions(factionsJson);
  const equipment = loadEquipment(equipmentJson);
  const characters = loadCharacters(charactersJson, factions, equipment);
  const boards = loadBoardModules(boardModules);
  const board = boards.find((b) => b.id === 'dev-board');
  if (!board) throw new Error('Plateau de dev introuvable (data/dev-board.json)');
  return { factions, equipment, characters, board, boards };
}

/** Noms des personnages par clé i18n (`nameKey`) pour une langue : source unique = `data/characters.json`. */
export function characterNameMessages(locale: 'fr' | 'en'): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const c of charactersJson) messages[c.nameKey] = locale === 'en' ? (c.names.en ?? c.names.fr) : c.names.fr;
  return messages;
}
export * from './runtime';
