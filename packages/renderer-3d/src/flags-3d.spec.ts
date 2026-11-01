// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TILE_RADIUS } from './board-scene';
import { createObjectiveMarker } from './flags-3d';

describe('marque des cases d’objectif (3D)', () => {
  const marker = createObjectiveMarker();
  const meshes = marker.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);

  it('bande en pointillés (8 tirets à plat) et 4 piquets en relief', () => {
    expect(meshes.filter((m) => m.geometry instanceof THREE.RingGeometry)).toHaveLength(8);
    const stakes = meshes.filter((m) => m.geometry instanceof THREE.ConeGeometry);
    expect(stakes).toHaveLength(4);
    for (const s of stakes) expect(s.position.y).toBeGreaterThan(5);
  });

  it('autour de la tuile, sans la recouvrir (la couleur de la case décide de la ligne de vue)', () => {
    for (const m of meshes.filter((x) => x.geometry instanceof THREE.RingGeometry)) {
      expect((m.geometry as THREE.RingGeometry).parameters.innerRadius).toBeGreaterThan(TILE_RADIUS);
    }
  });
});
