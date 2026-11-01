import { describe, expect, it } from 'vitest';
import { BOARD_ID_PATTERN, newBoardFileName, normalizeBoardJson, serializeBoard } from './board-format';
import type { BoardJson } from './schemas';

// Texte brut des plateaux committés : la normalisation ne doit rien y changer.
const committed = import.meta.glob<string>('./data/*-board.json', { eager: true, query: '?raw', import: 'default' });

describe('format canonique des plateaux', () => {
  it('relire puis réécrire chaque plateau committé ne produit aucune différence', () => {
    expect(Object.keys(committed).length).toBeGreaterThanOrEqual(3);
    for (const [path, text] of Object.entries(committed)) {
      const normalized = text.replace(/\r\n/g, '\n');
      expect(serializeBoard(normalizeBoardJson(JSON.parse(normalized) as BoardJson)), path).toBe(normalized);
    }
  });

  it('ordre de clés fixe, sans valeur undefined, portes et portails toujours présents', () => {
    const messy = {
      nodes: [{ colors: ['red'], properties: { passable: false, kind: 'OBJECTIVE' }, zoneId: undefined, y: 2, x: 1, id: 'a' }],
      edges: [{ doorId: undefined, to: 'b', from: 'a' }],
      nameKey: 'board.t.name',
      id: 't',
    } as unknown as BoardJson;
    const out = normalizeBoardJson(messy);
    expect(Object.keys(out)).toEqual(['id', 'nameKey', 'nodes', 'edges', 'doors', 'portals']);
    expect(Object.keys(out.nodes[0]!)).toEqual(['id', 'x', 'y', 'colors', 'properties']);
    expect(Object.keys(out.nodes[0]!.properties!)).toEqual(['kind', 'passable']);
    expect(out.edges[0]).toEqual({ from: 'a', to: 'b' });
  });

  it('des propriétés vides disparaissent', () => {
    const out = normalizeBoardJson({ id: 't', nameKey: 'k', nodes: [{ id: 'a', x: 0, y: 0, colors: ['red'], properties: {} }], edges: [] });
    expect('properties' in out.nodes[0]!).toBe(false);
  });

  it('identifiants de nouveaux plateaux', () => {
    expect(['crypte', 'a1', 'mon-plateau'].every((id) => BOARD_ID_PATTERN.test(id))).toBe(true);
    expect(['', 'A', '1a', '../x', 'x/y', 'x y', 'a'.repeat(41)].some((id) => BOARD_ID_PATTERN.test(id))).toBe(false);
    expect(newBoardFileName('crypte')).toBe('crypte-board.json');
  });
});
