import { describe, expect, it } from 'vitest';
import { contentBounds, distanceToPolyline, hitTest, nodesInBox, pointInPolygon, snap, zoneAt } from './geometry';
import type { EditorDoc } from './model';

const L = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 200 },
  { x: 0, y: 200 },
];

const doc: EditorDoc = {
  id: 't',
  nameKey: 'k',
  nodes: [
    { id: 'a', x: 50, y: 50, colors: ['red'] },
    { id: 'b', x: 150, y: 50, colors: ['red'] },
    { id: 'c', x: 400, y: 50, colors: ['red'] },
  ],
  edges: [{ from: 'a', to: 'b' }],
  portals: [{ id: 'p1', from: 'b', to: 'c', type: 'SECRET_DOOR' }],
  layout: { rooms: [{ id: 'salle', polygon: L }], corridors: [{ id: 'couloir', points: [{ x: 200, y: 50 }, { x: 500, y: 50 }], width: 60 }] },
};

describe('géométrie', () => {
  it('grille et arrondi', () => {
    expect(snap({ x: 37, y: 62 }, 25)).toEqual({ x: 25, y: 50 });
    expect(snap({ x: 37.4, y: 62.6 }, null)).toEqual({ x: 37, y: 63 });
  });

  it('point dans un polygone concave', () => {
    expect(pointInPolygon({ x: 50, y: 150 }, L)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 150 }, L)).toBe(false);
  });

  it('distance à une ligne brisée', () => {
    expect(distanceToPolyline({ x: 300, y: 80 }, [{ x: 200, y: 50 }, { x: 500, y: 50 }])).toBe(30);
  });

  it('zone : la pièce avant le couloir, rien hors du plan', () => {
    expect(zoneAt(doc.layout, { x: 50, y: 150 })).toBe('salle');
    expect(zoneAt(doc.layout, { x: 300, y: 60 })).toBe('couloir');
    expect(zoneAt(doc.layout, { x: 300, y: 300 })).toBeUndefined();
  });
});

describe('cible sous le pointeur', () => {
  const at = (x: number, y: number, handles: { kind: 'room' | 'corridor'; id: string } | null = null) => hitTest(doc, { x, y }, { tolerance: 6, handles });

  it('priorité : case, puis portail et arête, puis couloir, puis pièce, puis vide', () => {
    expect(at(55, 52)).toEqual({ kind: 'node', id: 'a' });
    expect(at(100, 52)).toEqual({ kind: 'edge', ref: { from: 'a', to: 'b' } });
    expect(at(300, 52)).toEqual({ kind: 'portal', id: 'p1' });
    expect(at(450, 70)).toEqual({ kind: 'corridor', id: 'couloir' });
    expect(at(50, 150)).toEqual({ kind: 'room', id: 'salle' });
    expect(at(150, 150)).toEqual({ kind: 'empty' });
  });

  it('les sommets ne se saisissent que sur la forme sélectionnée', () => {
    expect(at(2, 198)).toEqual({ kind: 'room', id: 'salle' });
    expect(at(2, 198, { kind: 'room', id: 'salle' })).toEqual({ kind: 'room-vertex', id: 'salle', index: 5 });
  });

  it('cadre de sélection et emprise', () => {
    expect(nodesInBox(doc, { x: 200, y: 0 }, { x: 0, y: 100 })).toEqual(['a', 'b']);
    expect(contentBounds(doc)).toEqual({ x: 0, y: 0, width: 500, height: 200 });
    expect(contentBounds({ ...doc, nodes: [], layout: undefined })).toBeNull();
  });
});
