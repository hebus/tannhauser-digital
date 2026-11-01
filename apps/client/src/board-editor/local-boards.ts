import { diagnoseBoard, normalizeBoardJson, serializeBoard, type BoardJson } from '@tannhauser/content';

/**
 * Plateaux enregistrés dans le navigateur (éditeur en production, où aucun fichier n'est écrit) : un seul objet JSON
 * « id → plateau » dans `localStorage`. Le jeu les ajoute à sa liste (voir `../content.ts`). Pur côté stockage : un
 * `Storage` est injecté (testable), et un stockage indisponible ou un contenu corrompu donne simplement « aucun plateau ».
 */

export const LOCAL_BOARDS_KEY = 'tannhauser.localBoards';

type Boards = Record<string, BoardJson>;

/** Empreinte non cryptographique (FNV-1a) : détecte un plateau modifié dans un autre onglet depuis son ouverture. */
export function localHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

export function readLocalBoards(storage: Pick<Storage, 'getItem'> | null): Boards {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(LOCAL_BOARDS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([id, b]) => typeof (b as BoardJson | undefined)?.id === 'string' && (b as BoardJson).id === id)) as Boards;
  } catch {
    return {};
  }
}

export type LocalSave = { readonly ok: true; readonly hash: string } | { readonly ok: false; readonly error: 'invalid' | 'exists' | 'changed' | 'storage'; readonly problems: readonly string[] };

/** Enregistre un plateau valide. `create` refuse d'écraser ; `baseHash` refuse un plateau modifié depuis l'ouverture. */
export function saveLocalBoard(storage: Pick<Storage, 'getItem' | 'setItem'> | null, board: BoardJson, options: { readonly create: boolean; readonly baseHash?: string }): LocalSave {
  const problems = diagnoseBoard(board, board.id);
  if (problems.length > 0) return { ok: false, error: 'invalid', problems };
  const boards = readLocalBoards(storage);
  const existing = boards[board.id];
  if (existing && options.create) return { ok: false, error: 'exists', problems: [] };
  if (existing && options.baseHash && options.baseHash !== localHash(serializeBoard(existing))) return { ok: false, error: 'changed', problems: [] };
  const normalized = normalizeBoardJson(board);
  try {
    if (!storage) throw new Error('no storage');
    storage.setItem(LOCAL_BOARDS_KEY, JSON.stringify({ ...boards, [board.id]: normalized }));
  } catch {
    return { ok: false, error: 'storage', problems: [] };
  }
  return { ok: true, hash: localHash(serializeBoard(normalized)) };
}

export function deleteLocalBoard(storage: Pick<Storage, 'getItem' | 'setItem'> | null, id: string): void {
  const rest = readLocalBoards(storage);
  delete rest[id];
  try {
    storage?.setItem(LOCAL_BOARDS_KEY, JSON.stringify(rest));
  } catch {
    // stockage bloqué : rien à retirer de toute façon
  }
}

export function browserBoardStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
