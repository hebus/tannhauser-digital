import * as THREE from 'three';
import type { GameState } from '@tannhauser/core';
import { flagMarks, objectiveNodeIds, plantedNodeIds } from '@tannhauser/renderer/src/flag-model';
import { playerColor } from '@tannhauser/renderer/src/palette';
import { TILE_RADIUS } from './board-scene';
import { clearGroup } from './three-util';

const OBJECTIVE_COLOR = 0xf0c040;

/** Fanion d'un joueur : mât et drapeau triangulaire à sa couleur ; planté, il porte un socle doré. */
export function createPennant(ownerIndex: number, scale = 1, planted = false): THREE.Group {
  const g = new THREE.Group();
  const color = playerColor(ownerIndex);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd, flatShading: true }));
  pole.position.y = 15;
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(16, 5), new THREE.Vector2(0, 10)]);
  const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, flatShading: true }));
  cloth.position.set(0.9, 19, 0);
  g.add(pole, cloth);
  if (planted) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 3, 8), new THREE.MeshStandardMaterial({ color: OBJECTIVE_COLOR, flatShading: true }));
    base.position.y = 1.5;
    g.add(base);
  }
  g.scale.setScalar(scale);
  return g;
}

/** Drapeaux au sol ou plantés, et anneaux des cases d'objectif (Capture du drapeau) : reflètent l'état, ne le modifient pas. */
export class FlagLayer3D {
  readonly group = new THREE.Group();

  update(state: GameState): void {
    clearGroup(this.group);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: OBJECTIVE_COLOR, transparent: true, opacity: 0.75 });
    const ring = (x: number, y: number, radius: number, dashed: boolean): void => {
      // Pointillé = l'objectif se lit à la forme, sans masquer la couleur de la case.
      const arcs = dashed ? 8 : 1;
      for (let i = 0; i < arcs; i++) {
        const arc = dashed ? Math.PI / 8 : Math.PI * 2;
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.9, 6, dashed ? 4 : 32, arc), ringMaterial);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = (i / arcs) * Math.PI * 2;
        mesh.position.set(x, 3, y);
        this.group.add(mesh);
      }
    };
    for (const id of objectiveNodeIds(state)) {
      const n = state.board.nodes[id];
      if (n) ring(n.x, n.y, TILE_RADIUS + 4, true);
    }
    for (const id of plantedNodeIds(state)) {
      const n = state.board.nodes[id];
      if (!n) continue;
      ring(n.x, n.y, TILE_RADIUS + 9, false);
      ring(n.x, n.y, TILE_RADIUS + 13, false);
    }
    for (const mark of flagMarks(state)) {
      const n = state.board.nodes[mark.nodeId];
      if (!n) continue;
      const pennant = createPennant(mark.ownerIndex, 0.9, mark.planted);
      pennant.position.set(n.x - TILE_RADIUS * 0.6 + mark.slot * 12, 2, n.y + TILE_RADIUS * 0.3);
      this.group.add(pennant);
    }
  }

  destroy(): void {
    clearGroup(this.group);
  }
}
