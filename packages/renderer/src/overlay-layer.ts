import { Container, Graphics, Text } from 'pixi.js';
import type { BoardState, NodeId } from '@tannhauser/core';
import { NODE_RADIUS } from './board-view';
import type { PathPreview } from './presentation/path-geometry';

export const OVERLAY_COLORS = {
  path: 0xffe066,
  target: 0xff4d4f,
  losVisible: 0x2fbf71,
  losHidden: 0xff6b6b,
} as const;

/**
 * Aperçus d'interaction (tracé de chemin, cibles d'attaque, ligne de vue). Lecture seule : les données
 * (chemins, cibles, nœuds visibles) viennent de la façade/du moteur ; ici on ne fait que dessiner.
 * Les états se distinguent par la forme (tracé + pastille, réticule, rond plein / croix), pas seulement la couleur.
 */
export class OverlayLayer extends Container {
  private readonly los = new Graphics();
  private readonly path = new Graphics();
  private readonly targets = new Graphics();
  private readonly costLabel = new Text({
    text: '',
    style: { fill: 0x111111, fontSize: 14, fontWeight: '800' },
  });
  private readonly costBg = new Graphics();

  constructor(private board: BoardState) {
    super();
    this.label = 'OverlayLayer';
    this.costLabel.anchor.set(0.5);
    this.costLabel.visible = false;
    this.addChild(this.los, this.path, this.targets, this.costBg, this.costLabel);
  }

  setBoard(board: BoardState): void {
    this.board = board;
  }

  /** Trace le chemin d'aperçu avec son coût en PM ; `null` efface. `textScale` garde le libellé lisible au zoom. */
  showPath(preview: PathPreview | null, textScale = 1): void {
    this.path.clear();
    this.costBg.clear();
    this.costLabel.visible = false;
    if (!preview || preview.points.length < 2) return;
    const pts = preview.points;
    const first = pts[0]!;
    this.path.moveTo(first.x, first.y);
    for (const p of pts.slice(1)) this.path.lineTo(p.x, p.y);
    this.path.stroke({ width: 7, color: 0x111111, alpha: 0.7 });
    this.path.moveTo(first.x, first.y);
    for (const p of pts.slice(1)) this.path.lineTo(p.x, p.y);
    this.path.stroke({ width: 4, color: OVERLAY_COLORS.path });
    // Pastilles aux cases intermédiaires, losange à l'arrivée.
    for (const p of pts.slice(1, -1)) this.path.circle(p.x, p.y, 5).fill(OVERLAY_COLORS.path).stroke({ width: 2, color: 0x111111 });
    const end = pts[pts.length - 1]!;
    this.path
      .poly([end.x, end.y - 11, end.x + 11, end.y, end.x, end.y + 11, end.x - 11, end.y])
      .fill(OVERLAY_COLORS.path)
      .stroke({ width: 2, color: 0x111111 });

    this.costLabel.text = `${preview.cost} PM`;
    this.costLabel.scale.set(textScale);
    const w = this.costLabel.width + 12 * textScale;
    const h = this.costLabel.height + 6 * textScale;
    const cx = end.x;
    const cy = end.y - NODE_RADIUS - 14 * textScale;
    this.costBg.roundRect(cx - w / 2, cy - h / 2, w, h, 5 * textScale).fill(OVERLAY_COLORS.path).stroke({ width: 2, color: 0x111111 });
    this.costLabel.position.set(cx, cy);
    this.costLabel.visible = true;
  }

  /** Réticule rouge sur chaque nœud contenant un ennemi ciblable (anneau + 4 repères : lisible sans la couleur). */
  showTargets(nodeIds: Iterable<NodeId>): void {
    this.targets.clear();
    for (const id of nodeIds) {
      const n = this.board.nodes[id];
      if (!n) continue;
      const r = NODE_RADIUS + 11;
      this.targets.circle(n.x, n.y, r).fill({ color: OVERLAY_COLORS.target, alpha: 0.16 }).stroke({ width: 4, color: OVERLAY_COLORS.target });
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        this.targets
          .moveTo(n.x + dx * (r - 6), n.y + dy * (r - 6))
          .lineTo(n.x + dx * (r + 8), n.y + dy * (r + 8))
          .stroke({ width: 4, color: OVERLAY_COLORS.target });
      }
    }
  }

  /** Overlay de ligne de vue depuis `origin` : visible = rond plein vert, non visible = croix rouge. `null` efface. */
  showLineOfSight(origin: NodeId | null, visible: ReadonlySet<NodeId> | null): void {
    this.los.clear();
    if (origin === null || visible === null) return;
    for (const n of Object.values(this.board.nodes)) {
      if (n.id === origin) continue;
      const ox = n.x - NODE_RADIUS * 0.8;
      const oy = n.y - NODE_RADIUS * 0.8;
      if (visible.has(n.id)) {
        this.los.circle(n.x, n.y, NODE_RADIUS + 3).fill({ color: OVERLAY_COLORS.losVisible, alpha: 0.28 }).stroke({ width: 3, color: OVERLAY_COLORS.losVisible });
        this.los.circle(ox, oy, 6).fill(OVERLAY_COLORS.losVisible).stroke({ width: 2, color: 0x111111 });
      } else {
        this.los.circle(n.x, n.y, NODE_RADIUS + 3).fill({ color: OVERLAY_COLORS.losHidden, alpha: 0.18 });
        this.los.moveTo(ox - 5, oy - 5).lineTo(ox + 5, oy + 5).stroke({ width: 4, color: 0x111111 });
        this.los.moveTo(ox + 5, oy - 5).lineTo(ox - 5, oy + 5).stroke({ width: 4, color: 0x111111 });
        this.los.moveTo(ox - 5, oy - 5).lineTo(ox + 5, oy + 5).stroke({ width: 2, color: OVERLAY_COLORS.losHidden });
        this.los.moveTo(ox + 5, oy - 5).lineTo(ox - 5, oy + 5).stroke({ width: 2, color: OVERLAY_COLORS.losHidden });
      }
    }
  }

  clear(): void {
    this.showPath(null);
    this.showTargets([]);
    this.showLineOfSight(null, null);
  }
}
