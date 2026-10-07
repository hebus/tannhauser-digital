import { describe, expect, it } from 'vitest';
import { BoardBuilder } from './builder';
import { canSee, visibleNodes } from './line-of-sight';
import { validateBoard } from './validate';

describe('validateBoard', () => {
  it('accepte un plateau cohérent', () => {
    const board = new BoardBuilder().node('a', ['red']).node('b', ['red', 'blue']).edge('a', 'b').build();
    expect(validateBoard(board)).toEqual([]);
  });

  it('détecte nœud orphelin, arête cassée, porte inconnue, couleurs invalides', () => {
    const board = new BoardBuilder()
      .node('a', ['red'])
      .node('b', [])
      .node('c', ['r', 'g', 'b', 'x'])
      .node('d', ['red', 'red'])
      .node('lonely', ['red'])
      .edge('a', 'b')
      .edge('b', 'c')
      .edge('c', 'd', { doorId: 'ghost' })
      .edge('a', 'nowhere')
      .build();
    const codes = validateBoard(board).map((i) => i.code);
    expect(codes).toContain('ORPHAN_NODE');
    expect(codes).toContain('EDGE_UNKNOWN_NODE');
    expect(codes).toContain('UNKNOWN_DOOR');
    expect(codes.filter((c) => c === 'BAD_COLOR_COUNT')).toHaveLength(2);
    expect(codes).toContain('DUPLICATE_COLOR');
  });

  it('autorise plus de 3 couleurs sur le plateau (la limite est par nœud)', () => {
    const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange'];
    const b = new BoardBuilder();
    colors.forEach((c, i) => b.node(`n${i}`, [c, colors[(i + 1) % colors.length]!]));
    colors.forEach((_, i) => b.edge(`n${i}`, `n${(i + 1) % colors.length}`));
    expect(validateBoard(b.build())).toEqual([]);
  });

  it('détecte une zone non reliée au reste du plateau', () => {
    const board = new BoardBuilder()
      .node('a', ['red'])
      .node('b', ['red'])
      .node('c', ['red'])
      .node('d', ['red'])
      .edge('a', 'b')
      .edge('c', 'd')
      .build();
    expect(validateBoard(board).map((i) => i.code)).toContain('UNREACHABLE_AREA');
  });

  it('relie deux zones par un portail', () => {
    const board = new BoardBuilder()
      .node('a', ['red']).node('b', ['red']).node('c', ['red']).node('d', ['red'])
      .edge('a', 'b').edge('c', 'd').portal('p', 'b', 'c').build();
    expect(validateBoard(board)).toEqual([]);
  });
});

describe('ligne de vue par couleurs (RULE-LOS-001)', () => {
  // a(R,G,B) — b(R) — c(G) — d(Y)   et   e(B) rattaché à a
  const board = new BoardBuilder()
    .node('a', ['red', 'green', 'blue'])
    .node('b', ['red'])
    .node('c', ['green'])
    .node('d', ['yellow'])
    .node('e', ['blue'])
    .edge('a', 'b').edge('b', 'c').edge('c', 'd').edge('a', 'e')
    .build();

  it('un nœud à 3 couleurs voit les nœuds reliés par un chemin à couleur unique commune', () => {
    // c(green) n'est pas relié à a par un chemin 100 % vert (b est rouge) : invisible.
    expect([...visibleNodes(board, 'a')].sort()).toEqual(['b', 'e']);
  });

  it('exige une même couleur sur tout le chemin', () => {
    const b2 = new BoardBuilder()
      .node('a', ['red', 'green'])
      .node('m', ['red', 'green'])
      .node('z', ['green'])
      .edge('a', 'm').edge('m', 'z')
      .build();
    expect(canSee(b2, 'a', 'z')).toBe(true);
    const mixed = new BoardBuilder()
      .node('a', ['red', 'green'])
      .node('m', ['red'])
      .node('z', ['green'])
      .edge('a', 'm').edge('m', 'z')
      .build();
    expect(canSee(mixed, 'a', 'z')).toBe(false);
  });

  it('est réciproque', () => {
    const ids = Object.keys(board.nodes);
    for (const x of ids) for (const y of ids) expect(canSee(board, x, y)).toBe(canSee(board, y, x));
  });

  it('un nœud sans couleur commune n\'est pas visible', () => {
    expect(canSee(board, 'a', 'd')).toBe(false);
  });

  it('un nœud à 1 couleur ne voit pas à travers un nœud d\'une autre couleur', () => {
    expect(canSee(board, 'b', 'c')).toBe(false);
    expect(canSee(board, 'b', 'a')).toBe(true);
    expect(canSee(board, 'a', 'c')).toBe(false);
  });

  it('les arêtes à sens unique n\'affectent pas la ligne de vue', () => {
    const oneWay = new BoardBuilder().node('a', ['red']).node('b', ['red']).edge('a', 'b', { oneWay: true }).build();
    expect(canSee(oneWay, 'a', 'b')).toBe(true);
    expect(canSee(oneWay, 'b', 'a')).toBe(true);
  });

  it('une porte fermée coupe la vue, ouverte non', () => {
    const closed = new BoardBuilder().node('a', ['red']).node('b', ['red']).door('d1', 'CLOSED').edge('a', 'b', { doorId: 'd1' }).build();
    const open = new BoardBuilder().node('a', ['red']).node('b', ['red']).door('d1', 'OPEN').edge('a', 'b', { doorId: 'd1' }).build();
    expect(canSee(closed, 'a', 'b')).toBe(false);
    expect(canSee(open, 'a', 'b')).toBe(true);
  });

  it('la fumée coupe la vue sauf pour un porteur de l\'équipement dédié', () => {
    const line = new BoardBuilder()
      .node('a', ['red']).node('b', ['red']).node('c', ['red'])
      .edge('a', 'b').edge('b', 'c').build();
    const smokeNodes = new Set(['b']);
    expect(canSee(line, 'a', 'c', { smokeNodes })).toBe(false);
    expect(canSee(line, 'a', 'c', { smokeNodes, ignoresSmoke: true })).toBe(true);
    expect(canSee(line, 'a', 'c')).toBe(true);
  });
});
