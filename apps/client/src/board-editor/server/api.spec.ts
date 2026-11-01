import { describe, expect, it } from 'vitest';
import { BOARD_ID_PATTERN, diagnoseBoard, GENERATED_BOARDS, newBoardFileName, normalizeBoardJson, serializeBoard, type BoardJson } from '@tannhauser/content';
import { handleBoardEditorRequest, MAX_BODY_BYTES, type ApiDeps, type ApiRequest, type BoardStore } from './api';

const board = (id: string, extra: Partial<BoardJson> = {}): BoardJson => ({
  id,
  nameKey: `board.${id}.name`,
  nodes: [
    { id: 'a', x: 0, y: 0, colors: ['red'] },
    { id: 'b', x: 100, y: 0, colors: ['red'] },
  ],
  edges: [{ from: 'a', to: 'b' }],
  doors: [],
  portals: [],
  ...extra,
});

function memoryStore(files: Record<string, string>): BoardStore & { files: Record<string, string> } {
  return {
    files,
    list: async () => Object.keys(files),
    read: async (f) => files[f] ?? null,
    write: async (f, text) => {
      files[f] = text;
    },
  };
}

const deps = (store: BoardStore): ApiDeps => ({
  store,
  generated: GENERATED_BOARDS,
  idPattern: BOARD_ID_PATTERN,
  newFileName: newBoardFileName,
  diagnose: diagnoseBoard,
  normalize: normalizeBoardJson,
  serialize: serializeBoard,
  hash: (t) => `h${t.length}`,
});

const repo = () =>
  memoryStore({
    'dev-board.json': serializeBoard(board('dev-board')),
    'castle-board.json': serializeBoard(board('castle')),
    'manoir-board.json': serializeBoard(board('manoir')),
  });

const put = (id: string, json: unknown, opts: { create?: boolean; baseHash?: string; header?: boolean } = {}): ApiRequest => ({
  method: 'PUT',
  path: `/boards/${id}`,
  query: new URLSearchParams(opts.create ? 'create=1' : ''),
  headers: opts.header === false ? {} : { 'x-board-editor': '1' },
  body: JSON.stringify({ json, ...(opts.baseHash ? { baseHash: opts.baseHash } : {}) }),
});

describe('lecture', () => {
  it('liste les plateaux ; castle et manoir sont en lecture seule', async () => {
    const r = await handleBoardEditorRequest({ method: 'GET', path: '/boards', query: new URLSearchParams(), headers: {} }, deps(repo()));
    expect(r.status).toBe(200);
    const list = r.body as { id: string; file: string; editable: boolean }[];
    expect(list.map((b) => [b.id, b.file, b.editable])).toEqual([
      ['castle', 'castle-board.json', false],
      ['dev-board', 'dev-board.json', true],
      ['manoir', 'manoir-board.json', false],
    ]);
  });

  it('un plateau par son id, avec son empreinte ; 404 sinon', async () => {
    const store = repo();
    const ok = await handleBoardEditorRequest({ method: 'GET', path: '/boards/dev-board', query: new URLSearchParams(), headers: {} }, deps(store));
    expect(ok.body).toMatchObject({ file: 'dev-board.json', editable: true, hash: `h${store.files['dev-board.json']!.length}` });
    const missing = await handleBoardEditorRequest({ method: 'GET', path: '/boards/nope', query: new URLSearchParams(), headers: {} }, deps(store));
    expect(missing.status).toBe(404);
  });
});

describe('écriture', () => {
  it('crée un nouveau plateau dans <id>-board.json, au format canonique', async () => {
    const store = repo();
    const json = board('crypte');
    const r = await handleBoardEditorRequest(put('crypte', json, { create: true }), deps(store));
    expect(r).toMatchObject({ status: 200, body: { file: 'crypte-board.json', created: true } });
    expect(store.files['crypte-board.json']).toBe(serializeBoard(normalizeBoardJson(json)));
  });

  it('met à jour un plateau existant dans SON fichier (dev-board.json)', async () => {
    const store = repo();
    const r = await handleBoardEditorRequest(put('dev-board', board('dev-board', { nameKey: 'board.dev.name' })), deps(store));
    expect(r).toMatchObject({ status: 200, body: { file: 'dev-board.json', created: false } });
  });

  it('refuse les plateaux générés', async () => {
    for (const id of ['castle', 'manoir']) {
      const r = await handleBoardEditorRequest(put(id, board(id)), deps(repo()));
      expect([r.status, (r.body as { error: string }).error]).toEqual([403, 'generated']);
    }
  });

  it('refuse les identifiants hors motif et un corps d’un autre plateau', async () => {
    for (const id of ['A', '..%2Fx', 'x%2Fy', 'foo%20bar', '1a']) {
      const r = await handleBoardEditorRequest(put(id, board(decodeURIComponent(id))), deps(repo()));
      expect(r.status, id).toBe(400);
    }
    const mismatch = await handleBoardEditorRequest(put('crypte', board('autre')), deps(repo()));
    expect(mismatch.status).toBe(400);
  });

  it('exige l’en-tête d’écriture et limite la taille', async () => {
    expect((await handleBoardEditorRequest(put('crypte', board('crypte'), { header: false }), deps(repo()))).status).toBe(403);
    const huge: ApiRequest = { ...put('crypte', board('crypte')), body: 'x'.repeat(MAX_BODY_BYTES + 1) };
    expect((await handleBoardEditorRequest(huge, deps(repo()))).status).toBe(413);
  });

  it('refuse un plateau invalide, avec ses problèmes', async () => {
    const orphan = board('crypte', { edges: [] });
    const r = await handleBoardEditorRequest(put('crypte', orphan), deps(repo()));
    expect(r.status).toBe(422);
    expect((r.body as { problems: string[] }).problems.some((p) => p.startsWith('ORPHAN_NODE'))).toBe(true);
  });

  it('conflits : création d’un id existant, fichier modifié depuis l’ouverture, fichier pris par un autre id', async () => {
    expect((await handleBoardEditorRequest(put('dev-board', board('dev-board'), { create: true }), deps(repo()))).status).toBe(409);
    expect((await handleBoardEditorRequest(put('dev-board', board('dev-board'), { baseHash: 'périmée' }), deps(repo()))).status).toBe(409);
    const store = repo();
    store.files['crypte-board.json'] = serializeBoard(board('autre-id'));
    expect((await handleBoardEditorRequest(put('crypte', board('crypte')), deps(store))).status).toBe(409);
  });
});
