import type { BoardJson } from '@tannhauser/content/src/schemas';

/**
 * API de l'éditeur de plateaux, servie par le serveur de développement (voir `board-editor-plugin.ts`). Pure : les
 * fichiers passent par un `BoardStore` injecté, ce qui la rend testable sans disque ni Node.
 *
 * - `GET  /__board-editor/boards`      : plateaux de `data/` (id, fichier, nom, nombre de cases, modifiable ou non) ;
 * - `GET  /__board-editor/boards/:id`  : JSON d'un plateau, son empreinte (`hash`) et s'il est modifiable ;
 * - `PUT  /__board-editor/boards/:id`  : enregistre un plateau valide (`?create=1` : création, refusée si l'id existe).
 *
 * Refus : plateaux générés (castle, manoir : leur source est un `.map.ts`), id hors motif ou différent du corps,
 * fichier modifié depuis l'ouverture (`baseHash`), plateau invalide (un JSON invalide casserait le chargement du jeu).
 */

export const API_PREFIX = '/__board-editor';
/** En-tête obligatoire des écritures : une requête d'un autre site ne peut pas l'envoyer sans pré-vérification CORS. */
export const WRITE_HEADER = 'x-board-editor';
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Seuls ces fichiers de `data/` sont des plateaux (ni chemin, ni autre extension). */
export const BOARD_FILE_PATTERN = /^[a-z0-9-]+-board\.json$/;

/** Fichiers de plateaux, par nom simple (jamais de chemin) : `list` ne renvoie que des noms conformes. */
export interface BoardStore {
  list(): Promise<string[]>;
  read(file: string): Promise<string | null>;
  write(file: string, text: string): Promise<void>;
}

export interface ApiDeps {
  readonly store: BoardStore;
  readonly generated: readonly { readonly id: string; readonly file: string }[];
  readonly idPattern: RegExp;
  readonly newFileName: (id: string) => string;
  readonly diagnose: (data: unknown, source: string) => string[];
  readonly normalize: (json: BoardJson) => BoardJson;
  readonly serialize: (json: BoardJson) => string;
  readonly hash: (text: string) => string;
}

export interface ApiRequest {
  readonly method: string;
  /** Chemin sans le préfixe ni la requête : `/boards`, `/boards/crypte`. */
  readonly path: string;
  readonly query: URLSearchParams;
  /** En-têtes, noms en minuscules. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body?: string;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface BoardSummary {
  readonly id: string;
  readonly file: string;
  readonly nameKey: string;
  readonly nodes: number;
  readonly editable: boolean;
}

export interface BoardDocument {
  readonly json: BoardJson;
  readonly file: string;
  readonly hash: string;
  readonly editable: boolean;
}

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ApiResponse => ({ status, body: { error, ...extra } });

interface Entry {
  readonly file: string;
  readonly text: string;
  readonly json: BoardJson;
}

/** Plateaux lisibles de `data/` (un fichier illisible est ignoré : le jeu le signalerait déjà au chargement). */
async function entries(deps: ApiDeps): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const file of (await deps.store.list()).filter((f) => BOARD_FILE_PATTERN.test(f)).sort()) {
    const text = await deps.store.read(file);
    if (text === null) continue;
    try {
      const json = JSON.parse(text) as BoardJson;
      if (typeof json?.id === 'string') out.push({ file, text, json });
    } catch {
      // JSON illisible : ignoré
    }
  }
  return out;
}

const isGenerated = (deps: ApiDeps, id: string, file: string): boolean => deps.generated.some((g) => g.id === id || g.file === file);

export async function handleBoardEditorRequest(req: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
  const segments = req.path.split('/').filter((s) => s.length > 0);
  if (segments[0] !== 'boards' || segments.length > 2) return fail(404, 'not-found');
  const all = await entries(deps);

  if (segments.length === 1) {
    if (req.method !== 'GET') return fail(405, 'method-not-allowed');
    const list: BoardSummary[] = all.map((e) => ({
      id: e.json.id,
      file: e.file,
      nameKey: e.json.nameKey,
      nodes: Array.isArray(e.json.nodes) ? e.json.nodes.length : 0,
      editable: !isGenerated(deps, e.json.id, e.file),
    }));
    return { status: 200, body: list };
  }

  let id: string;
  try {
    id = decodeURIComponent(segments[1]!);
  } catch {
    return fail(400, 'bad-id');
  }
  const existing = all.find((e) => e.json.id === id);

  if (req.method === 'GET') {
    if (!existing) return fail(404, 'not-found');
    const doc: BoardDocument = { json: existing.json, file: existing.file, hash: deps.hash(existing.text), editable: !isGenerated(deps, id, existing.file) };
    return { status: 200, body: doc };
  }
  if (req.method !== 'PUT') return fail(405, 'method-not-allowed');

  if (req.headers[WRITE_HEADER] !== '1') return fail(403, 'missing-header');
  const body = req.body ?? '';
  if (body.length > MAX_BODY_BYTES) return fail(413, 'too-large');
  if (!deps.idPattern.test(id)) return fail(400, 'bad-id');
  let payload: { json?: unknown; baseHash?: unknown };
  try {
    payload = JSON.parse(body) as { json?: unknown; baseHash?: unknown };
  } catch {
    return fail(400, 'bad-json');
  }
  const json = payload.json as BoardJson | undefined;
  if (!json || typeof json !== 'object' || json.id !== id) return fail(400, 'id-mismatch');

  const file = existing?.file ?? deps.newFileName(id);
  if (!BOARD_FILE_PATTERN.test(file)) return fail(400, 'bad-id');
  if (isGenerated(deps, id, file)) return fail(403, 'generated');
  // Le fichier visé appartient déjà à un autre plateau (son id ne suit pas son nom de fichier).
  if (!existing && all.some((e) => e.file === file)) return fail(409, 'file-taken');
  if (existing && req.query.get('create') === '1') return fail(409, 'exists');
  if (existing && typeof payload.baseHash === 'string' && payload.baseHash !== deps.hash(existing.text)) return fail(409, 'changed-on-disk');

  const problems = deps.diagnose(json, file.replace(/\.json$/, ''));
  if (problems.length > 0) return fail(422, 'invalid', { problems });

  const text = deps.serialize(deps.normalize(json));
  await deps.store.write(file, text);
  return { status: 200, body: { file, hash: deps.hash(text), created: !existing } };
}
