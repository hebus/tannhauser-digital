// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BoardState } from '@tannhauser/core';
import { buildColorMap } from '@tannhauser/renderer/src/palette';
import { buildBoardScene, TILE_RADIUS } from './board-scene';

const node = (id: string, x: number, y: number, colors: string[]) => ({ id, x, y, colors, properties: { kind: 'NORMAL' as const, passable: true, movementCostModifier: 0, modifiers: [] } });
const board: BoardState = {
  nodes: { a: node('a', 0, 0, ['red', 'green', 'blue']), b: node('b', 200, 0, ['yellow']), c: node('c', 200, 150, ['orange', 'purple']) },
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', oneWay: true }],
  doors: {},
  portals: [],
};
const scene = buildBoardScene(board, undefined, (k) => k);
const sectors = (nodeId: string) => scene.pickables.filter((m) => m.userData.nodeId === nodeId);
const params = (m: THREE.Mesh) => (m.geometry as THREE.CylinderGeometry).parameters;
const hexOf = (m: THREE.Mesh) => (m.material as THREE.MeshBasicMaterial).color.getHex();

describe('couleurs des cases', () => {
  const colors = buildColorMap(Object.values(board.nodes).flatMap((n) => n.colors));

  it('un secteur par couleur, dans l’ordre des données', () => {
    for (const n of Object.values(board.nodes)) {
      expect(sectors(n.id).map(hexOf)).toEqual(n.colors.map((c) => new THREE.Color(colors.get(c)!).getHex()));
    }
  });

  it('couleur exacte : matériau sans éclairage (ni ombre ni reflet ne la modifient)', () => {
    for (const m of scene.pickables) expect(m.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it('même disposition que le rendu 2D : premier secteur en haut, puis dans le sens des aiguilles d’une montre', () => {
    // 2D (BoardView) : secteur i = angles −π/2 + i·s … −π/2 + (i+1)·s, avec x = cos, y = sin (y vers le bas de l'écran).
    // 3D : Three mesure l'angle depuis +z ; x = sin θ, z = cos θ, et z correspond au y du plateau.
    for (const n of Object.values(board.nodes)) {
      const s = (Math.PI * 2) / n.colors.length;
      sectors(n.id).forEach((m, i) => {
        const p = params(m);
        expect(p.thetaLength).toBeCloseTo(s);
        const mid = p.thetaStart + p.thetaLength / 2;
        const phi = -Math.PI / 2 + (i + 0.5) * s;
        expect(Math.sin(mid)).toBeCloseTo(Math.cos(phi), 6);
        expect(Math.cos(mid)).toBeCloseTo(Math.sin(phi), 6);
      });
    }
  });
});

describe('chemins (arêtes)', () => {
  const ribbons = scene.group.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.geometry.type === 'BufferGeometry' && !!o.geometry.index);
  // Le trait clair, le plus étroit, est dessiné par-dessus l'ombre : c'est le dernier ruban.
  const quads = (m: THREE.Mesh): { x: number; z: number }[][] => {
    const pos = m.geometry.getAttribute('position');
    return Array.from({ length: pos.count / 4 }, (_, q) => Array.from({ length: 4 }, (_, v) => ({ x: pos.getX(q * 4 + v), z: pos.getZ(q * 4 + v) })));
  };

  it('une arête du graphe = un ruban entre les centres de ses deux cases', () => {
    const line = ribbons[1]!;
    const q = quads(line);
    expect(q).toHaveLength(board.edges.length);
    const edgeAB = q[0]!;
    // a (0,0) → b (200,0) : le ruban couvre x de 0 à 200, et reste mince sur z.
    expect(Math.min(...edgeAB.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.max(...edgeAB.map((p) => p.x))).toBeCloseTo(200);
    expect(Math.max(...edgeAB.map((p) => Math.abs(p.z)))).toBeLessThan(TILE_RADIUS);
    const edgeBC = q[1]!;
    // b (200,0) → c (200,150) : vertical.
    expect(Math.min(...edgeBC.map((p) => p.z))).toBeCloseTo(0);
    expect(Math.max(...edgeBC.map((p) => p.z))).toBeCloseTo(150);
  });

  it('une arête à sens unique reçoit une flèche tournée vers la case d’arrivée', () => {
    const arrow = scene.group.children.find((o): o is THREE.Mesh => o instanceof THREE.Mesh && !o.geometry.index && o.geometry.type === 'BufferGeometry');
    expect(arrow).toBeDefined();
    const pos = arrow!.geometry.getAttribute('position');
    expect(pos.count).toBe(3);
    // Pointe sur b→c (vers z croissant), à l'approche de c (200,150) : la pointe est la plus proche de c.
    const zs = [0, 1, 2].map((i) => pos.getZ(i));
    expect(Math.max(...zs)).toBeLessThan(150);
    expect(Math.max(...zs)).toBeGreaterThan(150 - TILE_RADIUS - 6);
  });
});
