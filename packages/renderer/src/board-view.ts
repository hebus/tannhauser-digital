import { Container, Graphics, Text } from 'pixi.js';
import type { BoardNode, BoardState } from '@tannhauser/core';
import { colorHex } from './palette';

export const NODE_RADIUS = 26;

export interface BoardViewOptions {
  readonly showNodeIds?: boolean;
}

/**
 * Vue d'un plateau : lecture seule de `BoardState`, aucune règle ici (§0.1).
 * Chaque nœud est un disque dont les couleurs (1 à 3) sont des secteurs.
 */
export class BoardView extends Container {
  private readonly edgeLayer = new Container();
  private readonly nodeLayer = new Container();
  private readonly labelLayer = new Container();

  constructor(
    private readonly board: BoardState,
    private readonly options: BoardViewOptions = {},
  ) {
    super();
    this.label = 'BoardView';
    this.addChild(this.edgeLayer, this.nodeLayer, this.labelLayer);
    this.draw();
  }

  /** Rectangle englobant (coordonnées plateau) pour cadrer la caméra. */
  bounds2D(): { x: number; y: number; width: number; height: number } {
    const nodes = Object.values(this.board.nodes);
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - NODE_RADIUS * 2;
    const minY = Math.min(...ys) - NODE_RADIUS * 2;
    return { x: minX, y: minY, width: Math.max(...xs) + NODE_RADIUS * 2 - minX, height: Math.max(...ys) + NODE_RADIUS * 2 - minY };
  }

  private draw(): void {
    this.drawEdges();
    for (const node of Object.values(this.board.nodes)) this.drawNode(node);
    this.drawPortals();
  }

  private drawEdges(): void {
    const g = new Graphics();
    for (const e of this.board.edges) {
      const a = this.board.nodes[e.from];
      const b = this.board.nodes[e.to];
      if (!a || !b) continue;
      const closed = e.doorId !== undefined && this.board.doors[e.doorId]?.state === 'CLOSED';
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: closed ? 5 : 3, color: closed ? 0xb7791f : 0x8b8d98, alpha: 0.9 });
      if (e.oneWay) this.drawArrow(g, a, b);
      if (e.doorId !== undefined) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        g.rect(mx - 7, my - 7, 14, 14).fill(closed ? 0xb7791f : 0x3a3f47).stroke({ width: 2, color: 0xe8c47c });
      }
    }
    this.edgeLayer.addChild(g);
  }

  private drawArrow(g: Graphics, a: BoardNode, b: BoardNode): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const tipX = b.x - ux * (NODE_RADIUS + 4);
    const tipY = b.y - uy * (NODE_RADIUS + 4);
    g.poly([tipX, tipY, tipX - ux * 14 - uy * 8, tipY - uy * 14 + ux * 8, tipX - ux * 14 + uy * 8, tipY - uy * 14 - ux * 8]).fill(0xffffff);
  }

  private drawPortals(): void {
    const g = new Graphics();
    for (const p of this.board.portals) {
      const a = this.board.nodes[p.from];
      const b = this.board.nodes[p.to];
      if (!a || !b) continue;
      const steps = 24;
      for (let i = 0; i < steps; i += 2) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0)
          .lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1)
          .stroke({ width: 2, color: 0xc084fc });
      }
    }
    this.edgeLayer.addChild(g);
  }

  private drawNode(node: BoardNode): void {
    const g = new Graphics();
    const colors = node.colors.length > 0 ? node.colors : ['?'];
    const sector = (Math.PI * 2) / colors.length;
    colors.forEach((c, i) => {
      const start = -Math.PI / 2 + i * sector;
      g.moveTo(node.x, node.y)
        .arc(node.x, node.y, NODE_RADIUS, start, start + sector)
        .lineTo(node.x, node.y)
        .fill(colorHex(c));
    });
    g.circle(node.x, node.y, NODE_RADIUS).stroke({ width: 3, color: node.properties.passable ? 0x1c1f24 : 0xff4d4f });

    if (!node.properties.passable) {
      g.moveTo(node.x - 14, node.y - 14).lineTo(node.x + 14, node.y + 14).stroke({ width: 4, color: 0xff4d4f });
      g.moveTo(node.x + 14, node.y - 14).lineTo(node.x - 14, node.y + 14).stroke({ width: 4, color: 0xff4d4f });
    }
    if (node.properties.kind === 'ENTRY_POINT') {
      g.circle(node.x, node.y, NODE_RADIUS + 6).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }
    this.nodeLayer.addChild(g);

    if (node.properties.movementCostModifier > 0) {
      const badge = new Text({
        text: `+${node.properties.movementCostModifier}`,
        style: { fill: 0xffffff, fontSize: 14, fontWeight: '700', stroke: { color: 0x000000, width: 3 } },
      });
      badge.anchor.set(0.5);
      badge.position.set(node.x + NODE_RADIUS * 0.75, node.y - NODE_RADIUS * 0.75);
      this.labelLayer.addChild(badge);
    }
    if (this.options.showNodeIds) {
      const label = new Text({ text: node.id, style: { fill: 0xffffff, fontSize: 12, stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5, 0);
      label.position.set(node.x, node.y + NODE_RADIUS + 4);
      this.labelLayer.addChild(label);
    }
  }
}
