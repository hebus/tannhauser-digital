import { Container, Graphics, Text } from 'pixi.js';
import type { BoardNode, BoardState } from '@tannhauser/core';
import { buildColorMap, colorHex } from './palette';
import {
  corridorSegments,
  doorGeometry,
  flattenPoints,
  layoutBounds,
  padBox,
  parseHexColor,
  polygonCentroid,
  unionBox,
  type BoardLayout,
} from './board-layout';

export const NODE_RADIUS = 26;
/** Rayon des disques de nœud quand un layout est affiché (un peu plus petit pour laisser voir les pièces). */
export const LAYOUT_NODE_RADIUS = 22;

export interface BoardViewOptions {
  readonly showNodeIds?: boolean;
  /** Mise en page d'affichage (pièces, couloirs). Absente : plateau en grille, rendu historique. */
  readonly layout?: BoardLayout;
  /** Résout une clé de libellé (nom de pièce) ; par défaut la clé elle-même. */
  readonly label?: (key: string) => string;
}

/**
 * Vue d'un plateau : lecture seule de `BoardState`, aucune règle ici (§0.1).
 * Chaque nœud est un disque dont les couleurs (1 à 3) sont des secteurs.
 */
export class BoardView extends Container {
  private readonly terrainLayer = new Container();
  private readonly edgeLayer = new Container();
  private readonly nodeLayer = new Container();
  private readonly labelLayer = new Container();

  private readonly colorMap: Map<string, number>;

  constructor(
    private readonly board: BoardState,
    private readonly options: BoardViewOptions = {},
  ) {
    super();
    this.colorMap = buildColorMap(Object.values(board.nodes).flatMap((n) => n.colors));
    this.label = 'BoardView';
    this.addChild(this.terrainLayer, this.edgeLayer, this.nodeLayer, this.labelLayer);
    this.draw();
  }

  /** Rectangle englobant (coordonnées plateau) pour cadrer la caméra. */
  bounds2D(): { x: number; y: number; width: number; height: number } {
    const nodes = Object.values(this.board.nodes);
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - NODE_RADIUS * 2;
    const minY = Math.min(...ys) - NODE_RADIUS * 2;
    const nodesBox = { x: minX, y: minY, width: Math.max(...xs) + NODE_RADIUS * 2 - minX, height: Math.max(...ys) + NODE_RADIUS * 2 - minY };
    const lb = this.options.layout ? layoutBounds(this.options.layout) : null;
    return lb ? unionBox(nodesBox, padBox(lb, 16)) : nodesBox;
  }

  private get nodeRadius(): number {
    return this.options.layout ? LAYOUT_NODE_RADIUS : NODE_RADIUS;
  }

  private draw(): void {
    if (this.options.layout) {
      this.drawTerrain(this.options.layout);
      this.drawLayoutEdges();
      this.drawPortals();
      for (const node of Object.values(this.board.nodes)) this.drawNode(node);
      return;
    }
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

  /** Couloirs puis pièces (murs épais, fond, nom au centroïde). */
  private drawTerrain(layout: BoardLayout): void {
    const g = new Graphics();
    for (const c of layout.corridors) {
      const segs = corridorSegments(c.points);
      for (const s of segs) g.moveTo(s.a.x, s.a.y).lineTo(s.b.x, s.b.y);
      g.stroke({ width: c.width + 10, color: 0x07080a, alpha: 0.9, cap: 'round', join: 'round' });
      for (const s of segs) g.moveTo(s.a.x, s.a.y).lineTo(s.b.x, s.b.y);
      g.stroke({ width: c.width, color: 0x2e333c, cap: 'round', join: 'round' });
    }
    for (const r of layout.rooms) {
      if (r.polygon.length < 3) continue;
      const flat = flattenPoints(r.polygon);
      g.poly(flat).fill(0x1f2329);
      const tint = parseHexColor(r.fill);
      if (tint !== undefined) g.poly(flat).fill({ color: tint, alpha: 0.28 });
    }
    // Murs tracés après tous les fonds : un couloir ne déborde jamais sur le mur d'une pièce.
    for (const r of layout.rooms) {
      if (r.polygon.length < 3) continue;
      const flat = flattenPoints(r.polygon);
      g.poly(flat, true).stroke({ width: 8, color: 0x0b0c0e, join: 'round', cap: 'round' });
      g.poly(flat, true).stroke({ width: 4, color: 0x8a8f9a, join: 'round', cap: 'round' });
    }
    this.terrainLayer.addChild(g);

    const resolve = this.options.label ?? ((key: string) => key);
    for (const r of layout.rooms) {
      if (r.polygon.length < 3) continue;
      const c = polygonCentroid(r.polygon);
      const name = new Text({
        text: r.nameKey ? resolve(r.nameKey) : r.id,
        style: { fill: 0xe6e9ef, fontSize: 17, fontWeight: '700', letterSpacing: 2, stroke: { color: 0x000000, width: 4 } },
      });
      name.anchor.set(0.5);
      name.alpha = 0.5;
      name.position.set(c.x, c.y);
      this.terrainLayer.addChild(name);
    }
  }

  /** Arêtes fines, flèches de sens unique, puis portes orientées sur leur arête. */
  private drawLayoutEdges(): void {
    const g = new Graphics();
    for (const e of this.board.edges) {
      const a = this.board.nodes[e.from];
      const b = this.board.nodes[e.to];
      if (!a || !b) continue;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 5, color: 0x0b0c0e, alpha: 0.6 });
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.5, color: 0xb4b7c2, alpha: 0.95 });
      if (e.oneWay) this.drawArrow(g, a, b);
    }
    for (const e of this.board.edges) {
      if (e.doorId === undefined) continue;
      const a = this.board.nodes[e.from];
      const b = this.board.nodes[e.to];
      const door = this.board.doors[e.doorId];
      if (!a || !b || !door) continue;
      this.drawDoor(g, a, b, door.state === 'CLOSED', door.type === 'REINFORCED');
    }
    this.edgeLayer.addChild(g);
  }

  /**
   * Porte = barre perpendiculaire à l'arête. Fermée : pleine, ambre. Ouverte : deux montants et trait pointillé.
   * Renforcée : plus épaisse, avec rivets (fermée) ou montants doublés (ouverte).
   */
  private drawDoor(g: Graphics, a: BoardNode, b: BoardNode, closed: boolean, reinforced: boolean): void {
    const len = reinforced ? 54 : 46;
    const d = doorGeometry(a, b, len);
    const thick = reinforced ? 16 : 10;
    const ux = (Math.cos(d.edgeAngle) * thick) / 2;
    const uy = (Math.sin(d.edgeAngle) * thick) / 2;
    if (closed) {
      const corners = [d.p1.x - ux, d.p1.y - uy, d.p1.x + ux, d.p1.y + uy, d.p2.x + ux, d.p2.y + uy, d.p2.x - ux, d.p2.y - uy];
      g.poly(corners).fill(reinforced ? 0x9a5b12 : 0xd9902f).stroke({ width: 2.5, color: 0x1a1100, join: 'round' });
      if (reinforced) {
        for (const t of [-0.3, 0, 0.3]) {
          g.circle(d.x + Math.cos(d.barAngle) * len * t, d.y + Math.sin(d.barAngle) * len * t, 2.4).fill(0xffe2a8);
        }
      }
    } else {
      // Ouverte : le vantail pivote autour d'un montant et s'aligne le long du passage (vert), l'autre montant reste visible.
      const post = reinforced ? 6 : 4.5;
      const leafLen = len * 0.82;
      const dirX = Math.cos(d.edgeAngle);
      const dirY = Math.sin(d.edgeAngle);
      const leafEnd = { x: d.p1.x + dirX * leafLen, y: d.p1.y + dirY * leafLen };
      // Arc de balayage (pointillé) entre la position fermée et la position ouverte.
      const arcSteps = 7;
      for (let i = 0; i < arcSteps; i += 2) {
        const a0 = d.barAngle - (Math.PI / 2) * (i / arcSteps);
        const a1 = d.barAngle - (Math.PI / 2) * ((i + 1) / arcSteps);
        g.moveTo(d.p1.x + Math.cos(a0) * len, d.p1.y + Math.sin(a0) * len)
          .lineTo(d.p1.x + Math.cos(a1) * len, d.p1.y + Math.sin(a1) * len)
          .stroke({ width: 1.5, color: 0x7bd88f, alpha: 0.6 });
      }
      g.moveTo(d.p1.x, d.p1.y).lineTo(leafEnd.x, leafEnd.y).stroke({ width: (reinforced ? 8 : 6) + 3, color: 0x10240f, alpha: 0.9 });
      g.moveTo(d.p1.x, d.p1.y).lineTo(leafEnd.x, leafEnd.y).stroke({ width: reinforced ? 8 : 6, color: 0x7bd88f });
      if (reinforced) {
        for (const t of [0.35, 0.65]) g.circle(d.p1.x + dirX * leafLen * t, d.p1.y + dirY * leafLen * t, 2).fill(0x10240f);
      }
      for (const p of [d.p1, d.p2]) {
        g.circle(p.x, p.y, post).fill(0xe8c47c).stroke({ width: 1.5, color: 0x1a1100 });
        if (reinforced) g.circle(p.x, p.y, post + 4).stroke({ width: 1.5, color: 0xe8c47c });
      }
    }
  }

  private drawArrow(g: Graphics, a: BoardNode, b: BoardNode): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const tipX = b.x - ux * (this.nodeRadius + 4);
    const tipY = b.y - uy * (this.nodeRadius + 4);
    g.poly([tipX, tipY, tipX - ux * 14 - uy * 8, tipY - uy * 14 + ux * 8, tipX - ux * 14 + uy * 8, tipY - uy * 14 - ux * 8]).fill(0xffffff);
  }

  private drawPortals(): void {
    const g = new Graphics();
    const width = this.options.layout ? 3 : 2;
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
          .stroke({ width, color: 0xc084fc });
      }
    }
    this.edgeLayer.addChild(g);
  }

  private drawNode(node: BoardNode): void {
    const R = this.nodeRadius;
    const g = new Graphics();
    const colors = node.colors.length > 0 ? node.colors : ['?'];
    const sector = (Math.PI * 2) / colors.length;
    colors.forEach((c, i) => {
      const start = -Math.PI / 2 + i * sector;
      g.moveTo(node.x, node.y)
        .arc(node.x, node.y, R, start, start + sector)
        .lineTo(node.x, node.y)
        .fill(this.colorMap.get(c) ?? colorHex(c));
    });
    g.circle(node.x, node.y, R).stroke({ width: 3, color: node.properties.passable ? 0x1c1f24 : 0xff4d4f });

    if (!node.properties.passable) {
      const k = R * 0.54;
      g.moveTo(node.x - k, node.y - k).lineTo(node.x + k, node.y + k).stroke({ width: 4, color: 0xff4d4f });
      g.moveTo(node.x + k, node.y - k).lineTo(node.x - k, node.y + k).stroke({ width: 4, color: 0xff4d4f });
    }
    if (node.properties.kind === 'ENTRY_POINT') {
      g.circle(node.x, node.y, R + 6).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }
    this.nodeLayer.addChild(g);

    if (node.properties.movementCostModifier > 0) {
      const badge = new Text({
        text: `+${node.properties.movementCostModifier}`,
        style: { fill: 0xffffff, fontSize: 14, fontWeight: '700', stroke: { color: 0x000000, width: 3 } },
      });
      badge.anchor.set(0.5);
      badge.position.set(node.x + R * 0.75, node.y - R * 0.75);
      this.labelLayer.addChild(badge);
    }
    if (this.options.showNodeIds) {
      const label = new Text({ text: node.id, style: { fill: 0xffffff, fontSize: 12, stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5, 0);
      label.position.set(node.x, node.y + R + 4);
      this.labelLayer.addChild(label);
    }
  }
}
