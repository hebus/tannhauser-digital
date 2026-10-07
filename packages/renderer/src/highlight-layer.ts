import { Container, Graphics } from 'pixi.js';
import type { BoardState } from '@tannhauser/core';
import { NODE_RADIUS } from './board-view';

/** Surbrillance des nœuds (déplacements possibles, sélection). */
export class HighlightLayer extends Container {
  private readonly g = new Graphics();

  constructor(private board: BoardState) {
    super();
    this.label = 'HighlightLayer';
    this.addChild(this.g);
  }

  setBoard(board: BoardState): void {
    this.board = board;
  }

  show(nodeIds: Iterable<string>, color = 0xffffff): void {
    this.g.clear();
    for (const id of nodeIds) {
      const n = this.board.nodes[id];
      if (!n) continue;
      this.g.circle(n.x, n.y, NODE_RADIUS + 9).stroke({ width: 4, color, alpha: 0.95 });
      this.g.circle(n.x, n.y, NODE_RADIUS + 9).fill({ color, alpha: 0.12 });
    }
  }

  clear(): void {
    this.g.clear();
  }
}
