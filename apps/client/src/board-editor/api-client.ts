import type { EditorDoc } from './model';
import { API_PREFIX, WRITE_HEADER, type BoardDocument, type BoardSummary } from './server/api';

/** Appels à l'API du serveur de développement (voir `server/api.ts`). */

const base = (): string => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${API_PREFIX}`;

export async function listBoards(): Promise<BoardSummary[]> {
  const r = await fetch(`${base()}/boards`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Liste des plateaux indisponible (${r.status}) : l'éditeur exige le serveur de développement (npm run dev).`);
  return (await r.json()) as BoardSummary[];
}

export async function getBoard(id: string): Promise<BoardDocument | null> {
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
  const r = await fetch(`${base()}/boards/${encodeURIComponent(doc.id)}${options.create ? '?create=1' : ''}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', [WRITE_HEADER]: '1' },
    body: JSON.stringify({ json: doc, ...(options.baseHash ? { baseHash: options.baseHash } : {}) }),
  });
  const body = (await r.json().catch(() => ({}))) as { file?: string; hash?: string; error?: string; problems?: string[] };
  if (r.ok && body.file && body.hash) return { ok: true, file: body.file, hash: body.hash };
  return { ok: false, status: r.status, error: body.error ?? 'unknown', problems: body.problems ?? [] };
}
