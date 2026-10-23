import { describe, expect, it } from 'vitest';
import { loadDevContent } from '@tannhauser/content';
import { corridorPolygons, passageWidth, planWalls, pointInPolygons, type Pt } from './wall-geometry';

const square = (x: number, y: number, s: number): Pt[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const OPTIONS = { thickness: 8, openingWidth: 56, capExtension: 36 };

describe('planWalls', () => {
  it("borde l'empreinte d'un mur extérieur, sans mur à l'intérieur", () => {
    const { footprint, walls } = planWalls([square(0, 0, 200)], [], [], OPTIONS);
    expect(footprint).toHaveLength(1);
    expect(pointInPolygons({ x: 100, y: 100 }, walls)).toBe(false);
    expect(pointInPolygons({ x: 207, y: 100 }, walls)).toBe(true);
    expect(pointInPolygons({ x: 210, y: 100 }, walls)).toBe(false);
  });

  it("fusionne un couloir qui chevauche une pièce : pas de mur dans le passage", () => {
    const corridor = { points: [{ x: 100, y: 100 }, { x: 400, y: 100 }], width: 60 };
    const { footprint, walls } = planWalls([square(0, 0, 200)], [corridor], [], OPTIONS);
    expect(footprint).toHaveLength(1);
    expect(pointInPolygons({ x: 200, y: 100 }, walls)).toBe(false); // jonction pièce / couloir
    expect(pointInPolygons({ x: 300, y: 134 }, walls)).toBe(true); // mur latéral du couloir
    expect(pointInPolygons({ x: 300, y: 140 }, walls)).toBe(false); // épaisseur = 8
    expect(pointInPolygons({ x: 300, y: 100 }, walls)).toBe(false);
  });

  it('perce une ouverture là où une arête sort de l’empreinte', () => {
    const rooms = [square(0, 0, 100), square(160, 0, 100)];
    const blocked = planWalls(rooms, [], [], OPTIONS);
    expect(pointInPolygons({ x: 104, y: 50 }, blocked.walls)).toBe(true);
    const open = planWalls(rooms, [], [{ a: { x: 50, y: 50 }, b: { x: 210, y: 50 } }], OPTIONS);
    expect(pointInPolygons({ x: 104, y: 50 }, open.walls)).toBe(false);
    expect(pointInPolygons({ x: 104, y: 90 }, open.walls)).toBe(true); // le reste du mur demeure
  });

  it('une arête entièrement dans l’empreinte ne perce rien', () => {
    const { walls } = planWalls([square(0, 0, 200)], [], [{ a: { x: 10, y: 100 }, b: { x: 190, y: 100 } }], OPTIONS);
    expect(pointInPolygons({ x: 204, y: 100 }, walls)).toBe(true);
  });
});

describe('passageWidth', () => {
  it('mesure la largeur d’un couloir perpendiculairement à son axe', () => {
    const corridor = { points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], width: 70 };
    const { footprint } = planWalls([], [corridor], [], OPTIONS);
    expect(passageWidth(footprint, { x: 150, y: 0 }, Math.PI / 2, 100)).toBeGreaterThanOrEqual(68);
    expect(passageWidth(footprint, { x: 150, y: 0 }, Math.PI / 2, 100)).toBeLessThanOrEqual(70);
  });
});

describe('corridorPolygons', () => {
  it('donne un polygone à coins en onglet pour une ligne brisée', () => {
    const polys = corridorPolygons({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], width: 20 });
    expect(pointInPolygons({ x: 105, y: -5 }, polys)).toBe(true);
    expect(polys).toHaveLength(1);
  });
});

describe('plateaux réels', () => {
  const content = loadDevContent();
  for (const id of ['castle', 'manoir']) {
    it(`${id} : aucun nœud ni arête de déplacement n'est enfermé dans un mur`, () => {
      const loaded = content.boards.find((b) => b.id === id)!;
      const layout = loaded.layout!;
      const board = loaded.board;
      const edges = board.edges.flatMap((e) => {
        const a = board.nodes[e.from];
        const b = board.nodes[e.to];
        return a && b ? [{ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }] : [];
      });
      const { footprint, walls } = planWalls(
        layout.rooms.map((r) => r.polygon),
        layout.corridors,
        edges,
        OPTIONS,
      );
      expect(footprint.length).toBeGreaterThan(0);
      expect(walls.length).toBeGreaterThan(0);
      const buried = Object.values(board.nodes).filter((n) => pointInPolygons(n, walls));
      expect(buried.map((n) => n.id)).toEqual([]);
      // Le milieu de chaque arête de déplacement doit rester praticable (jamais dans un mur).
      const blocked = edges.filter((e) => pointInPolygons({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, walls));
      expect(blocked).toEqual([]);
    });
  }
});
