import { describe, expect, it } from 'vitest';
import { canSee } from '@tannhauser/core';
import { ContentError, loadBoard, loadCharacters, loadDevContent, loadFactions, loadWeapons } from './index';
import devBoardJson from './data/dev-board.json';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('contenu de développement', () => {
  const content = loadDevContent();

  it('se charge et se valide en entier', () => {
    expect(Object.keys(content.board.board.nodes)).toHaveLength(16);
    // Tableau des réserves de dés (règles v2) : sans arme 2, corps à corps 4, pistolet 4, mental 4, automatique 5.
    const dice = Object.fromEntries(content.weapons.map((w) => [w.id, w.dice]));
    expect(dice).toEqual({ 'weapon.unarmed': 2, 'weapon.melee': 4, 'weapon.pistol': 4, 'weapon.mental': 4, 'weapon.automatic': 5 });
    expect(content.characters).toHaveLength(4);
  });

  it('contient les cas spéciaux du plateau', () => {
    const { board } = content.board;
    expect(board.nodes['n12']?.properties.passable).toBe(false);
    expect(board.nodes['n8']?.properties.movementCostModifier).toBe(1);
    expect(board.edges.some((e) => e.oneWay)).toBe(true);
    expect(board.doors['door1']?.state).toBe('CLOSED');
    expect(Object.values(board.nodes).some((n) => n.colors.length === 3)).toBe(true);
  });

  it('applique la ligne de vue par couleur commune sur le plateau de dev', () => {
    const { board } = content.board;
    expect(canSee(board, 'n6', 'n2')).toBe(true); // rouge/vert communs, adjacents
    expect(canSee(board, 'n4', 'n6')).toBe(true); // chemin vert n4→n3→n2→n6
    expect(canSee(board, 'n10', 'n1')).toBe(false); // bleu seul : aucun chemin partageant une couleur
    expect(canSee(board, 'n16', 'n6')).toBe(false); // jaune vs rouge/vert/bleu : aucune couleur commune
    expect(canSee(board, 'n1', 'n16')).toBe(false); // le portail n'est pas une ligne de vue
  });

  it('est réciproque sur tout le plateau de dev', () => {
    const { board } = content.board;
    const ids = Object.keys(board.nodes);
    for (const a of ids) for (const b of ids) expect(canSee(board, a, b)).toBe(canSee(board, b, a));
  });
});

describe('validation des erreurs de contenu', () => {
  it('refuse un schéma invalide', () => {
    expect(() => loadBoard({ id: 'x' })).toThrow(ContentError);
  });

  it('refuse un identifiant de nœud dupliqué', () => {
    const data = clone(devBoardJson);
    data.nodes.push(clone(data.nodes[0]!));
    expect(() => loadBoard(data)).toThrow(/dupliqué/);
  });

  it('refuse un plateau structurellement invalide (arête cassée)', () => {
    const data = clone(devBoardJson);
    data.edges.push({ from: 'n1', to: 'ghost' } as never);
    expect(() => loadBoard(data)).toThrow(/EDGE_UNKNOWN_NODE/);
  });

  it('refuse un nœud à 4 couleurs', () => {
    const data = clone(devBoardJson);
    data.nodes[0]!.colors = ['a', 'b', 'c', 'd'];
    expect(() => loadBoard(data)).toThrow(/BAD_COLOR_COUNT/);
  });

  it('refuse un personnage avec faction ou arme inconnue', () => {
    const factions = loadFactions({ factions: [{ id: 'f', nameKey: 'k' }], relations: [] });
    const weapons = loadWeapons([{ id: 'w', nameKey: 'k', kind: 'PISTOL', dice: 4 }]);
    const base = { id: 'c', factionId: 'f', nameKey: 'k', kind: 'HERO', statRows: [{ combat: 1, physical: 1, mental: 1, movement: 1 }], weaponIds: ['w'], competencies: [] };
    expect(() => loadCharacters([{ ...base, factionId: 'zzz' }], factions, weapons)).toThrow(/faction inconnue/);
    expect(() => loadCharacters([{ ...base, weaponIds: ['nope'] }], factions, weapons)).toThrow(/arme inconnue/);
    expect(loadCharacters([base], factions, weapons)).toHaveLength(1);
  });

  it('refuse une relation vers une faction inconnue et un nombre de dés invalide', () => {
    expect(() => loadFactions({ factions: [{ id: 'f', nameKey: 'k' }], relations: [{ factionA: 'f', factionB: 'g', relation: 'ENEMY' }] })).toThrow(/inconnue/);
    expect(() => loadWeapons([{ id: 'w', nameKey: 'k', kind: 'PISTOL', dice: 0 }])).toThrow(ContentError);
  });
});
