import { describe, expect, it } from 'vitest';
import { newBoard, nextId, type EditorDoc } from './model';
import { connect, disconnect, reverseEdge, setDoor, setOneWay, toggleDoor, toggleEdge, togglePortal } from './ops-edges';
import { hasCrate, setCrates, toggleCrate } from './ops-crates';
import { addCorridor, addRoom, deleteShape, deleteVertex, insertVertex, moveShape, renameZone, setRoom } from './ops-layout';
import { addNode, assignZones, deleteNodes, moveNodes, renameNode, setNodeColors, setNodeProperties } from './ops-nodes';

/** Gel profond : une opération qui modifierait son entrée lèverait une erreur. */
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

function sample(): EditorDoc {
  return freeze({
    id: 't',
    nameKey: 'k',
    nodes: [
      { id: 'a', x: 0, y: 0, colors: ['red'] },
      { id: 'b', x: 100, y: 0, colors: ['red'] },
      { id: 'c', x: 200, y: 0, colors: ['blue'] },
    ],
    edges: [{ from: 'a', to: 'b', doorId: 'door1' }, { from: 'b', to: 'c' }],
    doors: [{ id: 'door1', type: 'WOODEN', state: 'CLOSED' }],
    portals: [{ id: 'portal1', from: 'a', to: 'c', type: 'SECRET_DOOR' }],
  } as EditorDoc);
}

describe('identifiants', () => {
  it('suffixe suivant, avec ou sans zéros', () => {
    expect(nextId(['n1', 'n7', 'x9'], 'n')).toBe('n8');
    expect(nextId(['salle-01'], 'salle-', 2)).toBe('salle-02');
    expect(nextId([], 'door')).toBe('door1');
  });
});

describe('cases', () => {
  it('ajout aligné sur la grille ; id et couleur de zone dans une pièce', () => {
    const plain = addNode(freeze(newBoard('t')), { x: 37, y: 62 }, { grid: 25 });
    expect(plain.id).toBe('n1');
    expect(plain.doc.nodes[0]).toEqual({ id: 'n1', x: 25, y: 50, colors: ['red'] });
    const withRoom = addRoom(newBoard('t'), square(0, 0, 200)).doc;
    const inRoom = addNode(freeze(withRoom), { x: 50, y: 50 }, { grid: null });
    expect(inRoom.doc.nodes[0]).toMatchObject({ id: 'piece-1-01', zoneId: 'piece-1', colors: ['r.piece-1'] });
  });

  it('déplacement depuis l’origine du glisser', () => {
    const doc = moveNodes(sample(), { a: { x: 0, y: 0 } }, { x: 13, y: 26 }, 25);
    expect(doc.nodes[0]).toMatchObject({ x: 25, y: 25 });
  });

  it('suppression en cascade : arêtes, portails, portes devenues inutiles', () => {
    const doc = deleteNodes(sample(), ['a']);
    expect(doc.nodes.map((n) => n.id)).toEqual(['b', 'c']);
    expect(doc.edges).toEqual([{ from: 'b', to: 'c' }]);
    expect(doc.doors).toEqual([]);
    expect(doc.portals).toEqual([]);
  });

  it('renommage : références suivies, collision refusée', () => {
    const r = renameNode(sample(), 'a', 'z');
    expect(r.ok && r.doc.edges[0]!.from).toBe('z');
    expect(r.ok && r.doc.portals![0]!.from).toBe('z');
    expect(renameNode(sample(), 'a', 'b').ok).toBe(false);
  });

  it('propriétés : valeurs par défaut retirées du JSON', () => {
    let doc = setNodeProperties(sample(), ['a'], { kind: 'OBJECTIVE', passable: false, movementCostModifier: 1 });
    expect(doc.nodes[0]!.properties).toEqual({ kind: 'OBJECTIVE', passable: false, movementCostModifier: 1 });
    doc = setNodeProperties(doc, ['a'], { kind: 'NORMAL', passable: true, movementCostModifier: 0 });
    expect('properties' in doc.nodes[0]!).toBe(false);
  });

  it('couleurs nettoyées', () => {
    expect(setNodeColors(sample(), ['a'], [' red', 'red', '', 'blue']).nodes[0]!.colors).toEqual(['red', 'blue']);
  });
});

describe('arêtes, portes, portails', () => {
  it('relier dans les deux sens, jamais une case à elle-même', () => {
    expect(connect(sample(), 'b', 'a')).toEqual(sample());
    expect(connect(sample(), 'a', 'a')).toEqual(sample());
    expect(connect(sample(), 'a', 'c').edges).toHaveLength(3);
    expect(toggleEdge(sample(), 'c', 'b').edges).toHaveLength(1);
  });

  it('délier retire la porte de l’arête', () => {
    const doc = disconnect(sample(), { from: 'b', to: 'a' });
    expect(doc.edges).toHaveLength(1);
    expect(doc.doors).toEqual([]);
  });

  it('sens unique et inversion', () => {
    const doc = setOneWay(sample(), { from: 'b', to: 'c' }, true);
    expect(doc.edges[1]).toEqual({ from: 'b', to: 'c', oneWay: true });
    expect(reverseEdge(doc, { from: 'b', to: 'c' }).edges[1]).toEqual({ from: 'c', to: 'b', oneWay: true });
    expect(setOneWay(doc, { from: 'b', to: 'c' }, false).edges[1]).toEqual({ from: 'b', to: 'c' });
  });

  it('porte : pose, réglage, retrait', () => {
    const put = toggleDoor(sample(), { from: 'b', to: 'c' });
    expect(put.doorId).toBe('door2');
    expect(put.doc.edges[1]!.doorId).toBe('door2');
    expect(setDoor(put.doc, 'door2', { state: 'OPEN', type: 'REINFORCED' }).doors![1]).toEqual({ id: 'door2', type: 'REINFORCED', state: 'OPEN' });
    const removed = toggleDoor(put.doc, { from: 'c', to: 'b' });
    expect(removed.doc.doors!.map((d) => d.id)).toEqual(['door1']);
  });

  it('portail : ajout puis retrait', () => {
    const added = togglePortal(sample(), 'b', 'c');
    expect(added.id).toBe('portal2');
    expect(togglePortal(added.doc, 'c', 'b').doc.portals).toHaveLength(1);
  });
});

describe('plan', () => {
  const withRoom = () => freeze(addNode(addRoom(newBoard('t'), square(0, 0, 200)).doc, { x: 50, y: 50 }, { grid: null }).doc);

  it('sommets : insertion au milieu d’un côté, suppression bornée à 3', () => {
    const doc = insertVertex(withRoom(), 'room', 'piece-1', 0);
    expect(doc.layout!.rooms[0]!.polygon[1]).toEqual({ x: 100, y: 0 });
    const triangle = deleteVertex(doc, 'room', 'piece-1', 1);
    expect(deleteVertex(deleteVertex(triangle, 'room', 'piece-1', 0), 'room', 'piece-1', 0).layout!.rooms[0]!.polygon).toHaveLength(3);
  });

  it('déplacer une pièce avec ses cases', () => {
    const doc = moveShape(withRoom(), 'room', 'piece-1', { x: 10, y: 0 }, true);
    expect(doc.layout!.rooms[0]!.polygon[0]).toEqual({ x: 10, y: 0 });
    expect(doc.nodes[0]).toMatchObject({ x: 60, y: 50 });
  });

  it('renommer une zone : cases et couleurs de convention suivent', () => {
    const r = renameZone(withRoom(), 'piece-1', 'crypte');
    expect(r.ok && r.doc.nodes[0]).toMatchObject({ zoneId: 'crypte', colors: ['r.crypte'] });
    expect(r.ok && r.doc.layout!.rooms[0]).toMatchObject({ id: 'crypte', nameKey: 'crypte' });
    expect(renameZone(withRoom(), 'piece-1', 'Pas bon').ok).toBe(false);
  });

  it('couleur de fond, couloir, zones recalculées, plan vide retiré', () => {
    const filled = setRoom(withRoom(), 'piece-1', { fill: '#336699' });
    expect(filled.layout!.rooms[0]!.fill).toBe('#336699');
    expect(setRoom(filled, 'piece-1', { fill: null }).layout!.rooms[0]!.fill).toBeUndefined();
    const corridor = addCorridor(withRoom(), [{ x: 200, y: 100 }, { x: 400, y: 100 }]);
    expect(corridor.id).toBe('couloir-1');
    const moved = { ...corridor.doc, nodes: [{ ...corridor.doc.nodes[0]!, x: 300, y: 100 }] };
    expect(assignZones(moved).nodes[0]!.zoneId).toBe('couloir-1');
    const emptied = deleteShape(deleteShape(corridor.doc, 'corridor', 'couloir-1'), 'room', 'piece-1');
    expect('layout' in emptied).toBe(false);
    expect('zoneId' in emptied.nodes[0]!).toBe(false);
  });
});

describe('caisses', () => {
  it('poser puis retirer : champ absent quand il n’y en a plus', () => {
    const one = toggleCrate(sample(), 'b');
    expect(one.crates).toEqual([{ id: 'crate1', nodeId: 'b' }]);
    expect(hasCrate(one, 'b')).toBe(true);
    expect('crates' in toggleCrate(one, 'b')).toBe(false);
  });

  it('plusieurs cases à la fois, jamais deux caisses sur une case ni sur une case inconnue', () => {
    const doc = setCrates(setCrates(sample(), ['a', 'b'], true), ['a', 'zz'], true);
    expect(doc.crates!.map((c) => c.nodeId)).toEqual(['a', 'b']);
  });

  it('suivent la case : suppression et renommage', () => {
    const doc = setCrates(sample(), ['a', 'b'], true);
    expect(deleteNodes(doc, ['a']).crates).toEqual([{ id: 'crate2', nodeId: 'b' }]);
    const renamed = renameNode(doc, 'b', 'z');
    expect(renamed.ok && renamed.doc.crates![1]).toEqual({ id: 'crate2', nodeId: 'z' });
  });
});
