import { describe, expect, it } from 'vitest';
import { orderBoards, PINNED_BOARD_IDS } from './board-registry';
import { diagnoseBoard, loadBoard } from './loaders';
import { loadDevContent } from './index';

describe('registre des plateaux', () => {
  it('les plateaux historiques d’abord, puis les autres par identifiant', () => {
    const ids = orderBoards([{ id: 'zeta' }, { id: 'manoir' }, { id: 'alpha' }, { id: 'dev-board' }, { id: 'castle' }]).map((b) => b.id);
    expect(ids).toEqual(['dev-board', 'castle', 'manoir', 'alpha', 'zeta']);
  });

  it('tous les fichiers de data/ sont chargés, plateau de dev en premier', () => {
    const content = loadDevContent();
    expect(content.boards.map((b) => b.id).slice(0, PINNED_BOARD_IDS.length)).toEqual(PINNED_BOARD_IDS);
    expect(content.board).toBe(content.boards[0]);
  });
});

describe('diagnostic sans exception', () => {
  it('plateau valide : aucun problème', () => {
    const board = { id: 't', nameKey: 'k', nodes: [{ id: 'a', x: 0, y: 0, colors: ['red'] }, { id: 'b', x: 100, y: 0, colors: ['red'] }], edges: [{ from: 'a', to: 'b' }] };
    expect(diagnoseBoard(board)).toEqual([]);
  });

  it('plateau invalide : problèmes préfixés par leur code', () => {
    const problems = diagnoseBoard({ id: 't', nameKey: 'k', nodes: [{ id: 'a', x: 0, y: 0, colors: ['red'] }, { id: 'b', x: 1, y: 0, colors: ['red'] }], edges: [] });
    expect(problems.some((p) => p.startsWith('ORPHAN_NODE'))).toBe(true);
  });

  it('caisses : chargées dans le plateau, refusées sur une case inconnue', () => {
    const board = { id: 't', nameKey: 'k', nodes: [{ id: 'a', x: 0, y: 0, colors: ['red'] }, { id: 'b', x: 100, y: 0, colors: ['red'] }], edges: [{ from: 'a', to: 'b' }] };
    expect(loadBoard({ ...board, crates: [{ id: 'crate1', nodeId: 'b' }] }).board.crates).toEqual([{ id: 'crate1', nodeId: 'b' }]);
    expect('crates' in loadBoard(board).board).toBe(false);
    expect(diagnoseBoard({ ...board, crates: [{ id: 'crate1', nodeId: 'zz' }] }).some((p) => p.startsWith('CRATE_UNKNOWN_NODE'))).toBe(true);
  });

  it('schéma non respecté : problèmes du schéma', () => {
    expect(diagnoseBoard({ id: 't' }).length).toBeGreaterThan(0);
  });
});
