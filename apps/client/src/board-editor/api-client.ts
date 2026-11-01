import { bundledBoardSources, serializeBoard, type BoardJson } from '@tannhauser/content';
import { browserBoardStorage, localHash, readLocalBoards, saveLocalBoard } from './local-boards';
import type { EditorDoc } from './model';
import { API_PREFIX, WRITE_HEADER, type BoardDocument, type BoardSummary } from './server/api';

/**
 * Accès aux plateaux de l'éditeur. Deux stockages, choisis au démarrage :
 * - développement (`npm run dev`) : API du serveur de développement, qui écrit dans `packages/content/src/data/`
 *   (voir `server/api.ts`) ;
 * - production : le navigateur (`localStorage`, voir `local-boards.ts`). Les plateaux embarqués sont en lecture seule
 *   (« Enregistrer sous » en fait une copie locale) ; les plateaux locaux sont ajoutés à la liste du jeu.
 */

/** Où l'éditeur enregistre (pour les textes de l'interface). */
export const STORAGE_KIND: 'disk' | 'browser' = import.meta.env.DEV ? 'disk' : 'browser';
export const STORAGE_LABEL = STORAGE_KIND === 'disk' ? 'packages/content/src/data/' : 'ce navigateur';

const base = (): string => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${API_PREFIX}`;

const bundled = (): BoardJson[] => bundledBoardSources().filter((b): b is BoardJson => typeof (b as BoardJson | null)?.id === 'string');
const summary = (json: BoardJson, editable: boolean): BoardSummary => ({ id: json.id, file: `${json.id}-board.json`, nameKey: json.nameKey, nodes: Array.isArray(json.nodes) ? json.nodes.length : 0, editable });

function listLocal(): BoardSummary[] {
  const local = Object.values(readLocalBoards(browserBoardStorage()));
  const ids = new Set(local.map((b) => b.id));
  return [...bundled().filter((b) => !ids.has(b.id)).map((b) => summary(b, false)), ...local.map((b) => summary(b, true))].sort((a, b) => (a.id < b.id ? -1 : 1));
}

function getLocal(id: string): BoardDocument | null {
  const local = readLocalBoards(browserBoardStorage())[id];
  const json = local ?? bundled().find((b) => b.id === id);
  return json ? { json, file: `${id}-board.json`, hash: localHash(serializeBoard(json)), editable: local !== undefined } : null;
}

function saveLocal(doc: EditorDoc, options: { readonly create: boolean; readonly baseHash?: string }): SaveResult {
  // Un plateau embarqué ne se remplace pas : le jeu le chargerait en double. « Enregistrer sous » un autre identifiant.
  if (bundled().some((b) => b.id === doc.id)) return { ok: false, status: 403, error: 'generated', problems: [] };
  const r = saveLocalBoard(browserBoardStorage(), doc as BoardJson, { create: options.create, ...(options.baseHash ? { baseHash: options.baseHash } : {}) });
  if (r.ok) return { ok: true, file: `${doc.id}-board.json`, hash: r.hash };
  const error = r.error === 'changed' ? 'changed-on-disk' : r.error;
  return { ok: false, status: r.error === 'invalid' ? 422 : 409, error, problems: r.problems };
}

export async function listBoards(): Promise<BoardSummary[]> {
  if (STORAGE_KIND === 'browser') return listLocal();
  const r = await fetch(`${base()}/boards`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Liste des plateaux indisponible (${r.status}) : l'éditeur exige le serveur de développement (npm run dev).`);
  return (await r.json()) as BoardSummary[];
}

export async function getBoard(id: string): Promise<BoardDocument | null> {
  if (STORAGE_KIND === 'browser') return getLocal(id);
  const r = await fetch(`${base()}/boards/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Lecture du plateau ${id} impossible (${r.status}).`);
  return (await r.json()) as BoardDocument;
}

export type SaveResult =
  | { readonly ok: true; readonly file: string; readonly hash: string }
  | { readonly ok: false; readonly status: number; readonly error: string; readonly problems: readonly string[] };

/** Enregistre ; `create` refuse d'écraser un plateau existant, `baseHash` refuse un fichier modifié depuis l'ouverture. */
export async function saveBoard(doc: EditorDoc, options: { readonly create: boolean; readonly baseHash?: string }): Promise<SaveResult> {
  if (STORAGE_KIND === 'browser') return saveLocal(doc, options);
  const r = await fetch(`${base()}/boards/${encodeURIComponent(doc.id)}${options.create ? '?create=1' : ''}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' },
    body: JSON.stringify({ json: doc, ...(options.baseHash ? { baseHash: options.baseHash } : {}) }),
  });
  const body = (await r.json().catch(() => ({}))) as { file?: string; hash?: string; error?: string; problems?: string[] };
  if (r.ok && body.file && body.hash) return { ok: true, file: body.file, hash: body.hash };
  return { ok: false, status: r.status, error: body.error ?? 'unknown', problems: body.problems ?? [] };
}
