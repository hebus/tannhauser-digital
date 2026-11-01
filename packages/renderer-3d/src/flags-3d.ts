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

/** Hauteur des marques posées sur les tuiles (au-dessus de la tuile et de son contour). */
const MARK_Y = 3.2;

/**
 * Marque d'une case d'objectif : bande dorée en pointillés autour de la tuile (pleine et large : lisible vue de dessus,
 * sans masquer la couleur de la case) et quatre piquets dorés aux angles (le relief se lit aussi en vue rasante).
 */
export function createObjectiveMarker(): THREE.Group {
  const g = new THREE.Group();
  const band = new THREE.MeshBasicMaterial({ color: OBJECTIVE_COLOR, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
  const dashes = 8;
  for (let i = 0; i < dashes; i++) {
    const arc = (Math.PI * 2) / dashes;
    const dash = new THREE.Mesh(new THREE.RingGeometry(TILE_RADIUS + 3, TILE_RADIUS + 9, 6, 1, i * arc + arc * 0.15, arc * 0.7), band);
    dash.rotation.x = -Math.PI / 2;
    dash.position.y = MARK_Y;
    g.add(dash);
  }
  const gold = new THREE.MeshStandardMaterial({ color: OBJECTIVE_COLOR, emissive: 0x4a3600, flatShading: true, roughness: 0.5, metalness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const stake = new THREE.Mesh(new THREE.ConeGeometry(5, 18, 4), gold);
    stake.position.set(Math.cos(a) * (TILE_RADIUS + 6), MARK_Y + 9, Math.sin(a) * (TILE_RADIUS + 6));
    stake.castShadow = true;
    g.add(stake);
  }
  return g;
}

/** Double bande pleine : une case où un drapeau est planté (forme distincte de l'objectif libre). */
function createPlantedMarker(): THREE.Group {
  const g = new THREE.Group();
  const band = new THREE.MeshBasicMaterial({ color: OBJECTIVE_COLOR, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  for (const [inner, outer] of [[TILE_RADIUS + 10, TILE_RADIUS + 13.5], [TILE_RADIUS + 16, TILE_RADIUS + 18]] as const) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 40), band);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = MARK_Y;
    g.add(ring);
  }
  return g;
}

/** Drapeaux au sol ou plantés, et marques des cases d'objectif (Capture du drapeau) : reflètent l'état, ne le modifient pas. */
export class FlagLayer3D {
  readonly group = new THREE.Group();

  update(state: GameState): void {
    clearGroup(this.group);
    const place = (marker: THREE.Object3D, nodeId: string): void => {
      const n = state.board.nodes[nodeId];
      if (!n) return;
      marker.position.set(n.x, 0, n.y);
      this.group.add(marker);
    };
    for (const id of objectiveNodeIds(state)) place(createObjectiveMarker(), id);
    for (const id of plantedNodeIds(state)) place(createPlantedMarker(), id);
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
