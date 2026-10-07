// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  corridorSegments,
  doorGeometry,
  flattenPoints,
  layoutBounds,
  padBox,
  parseHexColor,
  polygonArea,
  polygonCentroid,
  unionBox,
  type BoardLayout,
} from './board-layout';

describe('polygonCentroid', () => {
  it('rectangle : son centre', () => {
    const c = polygonCentroid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 }]);
    expect(c.x).toBeCloseTo(5);
    expect(c.y).toBeCloseTo(2);
  });

  it('sens horaire ou antihoraire donne le même résultat', () => {
    const pts = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }];
    const a = polygonCentroid(pts);
    const b = polygonCentroid([...pts].reverse());
    expect(a.x).toBeCloseTo(2);
    expect(a.y).toBeCloseTo(2);
    expect(b.x).toBeCloseTo(2);
    expect(b.y).toBeCloseTo(2);
  });

  it('polygone en L : pondéré par l aire (pas la moyenne des sommets)', () => {
    // Carré 2x2 (aire 4) + carré 1x1 (aire 1) accolé en haut à droite : L de 5.
    const l = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }];
    expect(polygonArea(l)).toBeCloseTo(3);
    const c = polygonCentroid(l);
    // Centroïde exact : (5/6, 5/6) (L = 3 carrés unité).
    expect(c.x).toBeCloseTo(5 / 6);
    expect(c.y).toBeCloseTo(5 / 6);
  });

  it('repli sur la moyenne si l aire est nulle ; (0,0) si vide', () => {
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 8, y: 0 }])).toEqual({ x: 4, y: 0 });
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 });
  });
});

describe('doorGeometry', () => {
  it('arête horizontale : barre verticale au milieu', () => {
    const d = doorGeometry({ x: 0, y: 0 }, { x: 10, y: 0 }, 6);
    expect(d.x).toBe(5);
    expect(d.y).toBe(0);
    expect(d.edgeAngle).toBeCloseTo(0);
    expect(d.barAngle).toBeCloseTo(Math.PI / 2);
    expect(d.p1.x).toBeCloseTo(5);
    expect(d.p1.y).toBeCloseTo(-3);
    expect(d.p2.y).toBeCloseTo(3);
  });

  it('arête diagonale : barre perpendiculaire (produit scalaire nul) et de la bonne longueur', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 8, y: 6 };
    const d = doorGeometry(a, b, 10);
    const bar = { x: d.p2.x - d.p1.x, y: d.p2.y - d.p1.y };
    expect(bar.x * (b.x - a.x) + bar.y * (b.y - a.y)).toBeCloseTo(0);
    expect(Math.hypot(bar.x, bar.y)).toBeCloseTo(10);
    expect(d.x).toBe(4);
    expect(d.y).toBe(3);
  });
});

describe('layoutBounds', () => {
  const layout: BoardLayout = {
    rooms: [{ id: 'r', nameKey: 'r', polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }] }],
    corridors: [{ id: 'c', width: 20, points: [{ x: 100, y: 25 }, { x: 200, y: 25 }] }],
  };

  it('inclut polygones et couloirs (demi-largeur comprise)', () => {
    expect(layoutBounds(layout)).toEqual({ x: 0, y: 0, width: 210, height: 50 });
  });

  it('le demi-couloir peut dépasser les pièces', () => {
    const b = layoutBounds({ rooms: [], corridors: [{ id: 'c', width: 20, points: [{ x: 0, y: 0 }, { x: 0, y: 40 }] }] });
    expect(b).toEqual({ x: -10, y: -10, width: 20, height: 60 });
  });

  it('vide : null', () => {
    expect(layoutBounds({ rooms: [], corridors: [] })).toBeNull();
  });

  it('union et marge', () => {
    const u = unionBox({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: -5, width: 20, height: 8 });
    expect(u).toEqual({ x: 0, y: -5, width: 25, height: 15 });
    expect(padBox(u, 2)).toEqual({ x: -2, y: -7, width: 29, height: 19 });
  });
});

describe('corridorSegments', () => {
  it('découpe une ligne brisée en segments avec longueur et angle', () => {
    const segs = corridorSegments([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.length).toBeCloseTo(5);
    expect(segs[1]!.length).toBeCloseTo(6);
    expect(segs[1]!.angle).toBeCloseTo(Math.PI / 2);
  });

  it('ignore les points doublons ; moins de 2 points : rien', () => {
    expect(corridorSegments([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 4, y: 1 }])).toHaveLength(1);
    expect(corridorSegments([{ x: 1, y: 1 }])).toEqual([]);
  });
});

describe('utilitaires', () => {
  it('flattenPoints', () => {
    expect(flattenPoints([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toEqual([1, 2, 3, 4]);
  });

  it('parseHexColor', () => {
    expect(parseHexColor('#ff8800')).toBe(0xff8800);
    expect(parseHexColor('ff8800')).toBeUndefined();
    expect(parseHexColor(undefined)).toBeUndefined();
  });
});
