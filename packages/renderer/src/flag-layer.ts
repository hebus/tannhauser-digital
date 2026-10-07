import { Container, Graphics } from 'pixi.js';
import type { GameState } from '@tannhauser/core';
import { NODE_RADIUS } from './board-view';
import { createPennant } from './character-layer';
import { flagMarks, objectiveNodeIds, plantedNodeIds } from './flag-model';

const OBJECTIVE_COLOR = 0xf0c040;

/**
 * Couche des drapeaux (Capture du drapeau) : lecture seule de `GameState`, reconstruite à chaque `update`.
 * Cases d'objectif = anneau pointillé discret ; drapeau au sol = fanion à la couleur et à l'emblème du propriétaire ;
 * drapeau planté = fanion sur socle doré + double anneau doré (forme distincte). Les drapeaux portés sont dessinés
 * par `CharacterLayer` (ils suivent le pion). Hors du mode, la couche reste vide.
 */
export class FlagLayer extends Container {
  constructor(private readonly nodeRadius: number = NODE_RADIUS) {
    super();
    this.label = 'FlagLayer';
  }

  update(state: GameState): void {
    for (const child of this.removeChildren()) child.destroy({ children: true });
    const R = this.nodeRadius;
    const rings = new Graphics();
    for (const id of objectiveNodeIds(state)) {
      const node = state.board.nodes[id];
      if (!node) continue;
      // Anneau pointillé : l'objectif se lit à la forme, sans masquer la couleur de la case.
      for (let i = 0; i < 16; i += 2) {
        rings.arc(node.x, node.y, R + 4, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2).stroke({ width: 2, color: OBJECTIVE_COLOR, alpha: 0.75 });
      }
    }
    for (const id of plantedNodeIds(state)) {
      const node = state.board.nodes[id];
      if (!node) continue;
      rings.circle(node.x, node.y, R + 9).stroke({ width: 2, color: OBJECTIVE_COLOR });
      rings.circle(node.x, node.y, R + 13).stroke({ width: 2, color: OBJECTIVE_COLOR, alpha: 0.6 });
    }
    this.addChild(rings);
    for (const mark of flagMarks(state)) {
      const node = state.board.nodes[mark.nodeId];
      if (!node) continue;
      const pennant = createPennant(mark.ownerIndex, 0.9, mark.planted);
      pennant.position.set(node.x - R * 0.7 + mark.slot * 11, node.y + R * 0.3);
      this.addChild(pennant);
    }
  }
}
