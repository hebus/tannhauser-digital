import { describe, expect, it } from 'vitest';
import { bundledBoardSources, type BoardJson } from '@tannhauser/content';
import { loadGameContent } from '../content';
import { LOCAL_BOARDS_KEY, deleteLocalBoard, localHash, readLocalBoards, saveLocalBoard } from './local-boards';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem = (k: string): string | null => this.data.get(k) ?? null;
  setItem = (k: string, v: string): void => void this.data.set(k, v);
}

const sample = (id: string): BoardJson => ({
  id,
  nameKey: `board.${id}.name`,
  nodes: [
    { id: 'a', x: 0, y: 0, colors: ['red'] },
    { id: 'b', x: 50, y: 0, colors: ['red'] },
  ],
  edges: [{ from: 'a', to: 'b' }],
  doors: [],
  portals: [],
});

describe('plateaux locaux (navigateur)', () => {
  it('enregistre puis relit un plateau valide', () => {
    const s = new MemoryStorage();
    const r = saveLocalBoard(s, sample('mon-plateau'), { create: true });
    expect(r.ok).toBe(true);
    expect(Object.keys(readLocalBoards(s))).toEqual(['mon-plateau']);
  });

  it('refuse un plateau invalide sans rien écrire', () => {
    const s = new MemoryStorage();
    const r = saveLocalBoard(s, { ...sample('casse'), edges: [{ from: 'a', to: 'zzz' }] }, { create: true });
    expect(r).toMatchObject({ ok: false, error: 'invalid' });
    expect(s.getItem(LOCAL_BOARDS_KEY)).toBeNull();
  });

  it('refuse d’écraser en création et détecte un plateau modifié ailleurs', () => {
    const s = new MemoryStorage();
    const first = saveLocalBoard(s, sample('p'), { create: true });
    expect(saveLocalBoard(s, sample('p'), { create: true })).toMatchObject({ error: 'exists' });
    expect(saveLocalBoard(s, sample('p'), { create: false, baseHash: 'autre' })).toMatchObject({ error: 'changed' });
    expect(first.ok && saveLocalBoard(s, sample('p'), { create: false, baseHash: first.hash }).ok).toBe(true);
  });

  it('tolère un stockage absent ou corrompu', () => {
    expect(readLocalBoards(null)).toEqual({});
    const s = new MemoryStorage();
    s.setItem(LOCAL_BOARDS_KEY, '{pas du json');
    expect(readLocalBoards(s)).toEqual({});
    expect(saveLocalBoard(null, sample('p'), { create: true })).toMatchObject({ error: 'storage' });
  });

  it('supprime un plateau et a une empreinte stable', () => {
    const s = new MemoryStorage();
    saveLocalBoard(s, sample('p'), { create: true });
    deleteLocalBoard(s, 'p');
    expect(readLocalBoards(s)).toEqual({});
    expect(localHash('x')).toBe(localHash('x'));
  });
});

describe('contenu du jeu avec plateaux locaux', () => {
  it('ajoute les plateaux locaux valides, ignore les cassés et les ids embarqués', () => {
    const s = new MemoryStorage();
    saveLocalBoard(s, sample('mon-plateau'), { create: true });
    const bundledId = (bundledBoardSources()[0] as BoardJson).id;
    s.setItem(LOCAL_BOARDS_KEY, JSON.stringify({ ...readLocalBoards(s), [bundledId]: sample(bundledId), casse: { id: 'casse' } }));
    const ids = loadGameContent(s).boards.map((b) => b.id);
    expect(ids).toContain('mon-plateau');
    expect(ids).not.toContain('casse');
    expect(ids.filter((id) => id === bundledId)).toHaveLength(1);
  });
});
