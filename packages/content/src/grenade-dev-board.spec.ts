import { isThrowTarget } from '@tannhauser/core';
import { describe, expect, it } from 'vitest';
import { loadDevContent } from './index';

const board = loadDevContent().board.board;
const targets = (from: string, range: number): string[] =>
  Object.keys(board.nodes).filter((id) => isThrowTarget(board, from, id, range)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

describe('grenade (portée 5) sur le plateau de développement, depuis n10', () => {
  it('une case adjacente est visable même sans couleur commune : n9 (dernière case)', () => {
    expect(targets('n10', 5)).toContain('n9');
  });

  it('n6 est visible, et n2 (voisine de n6) est la dernière case de cette ligne de vue', () => {
    expect(targets('n10', 5)).toEqual(expect.arrayContaining(['n6', 'n2']));
  });

  it('n7 est visible, et n8 et n3 (voisines de n7) sont ses dernières cases', () => {
    expect(targets('n10', 5)).toEqual(expect.arrayContaining(['n7', 'n8', 'n3']));
  });

  it('la case du lanceur n\'est jamais visée par une grenade explosive', () => {
    expect(targets('n10', 5)).not.toContain('n10');
  });
});
