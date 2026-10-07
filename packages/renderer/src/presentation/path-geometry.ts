import type { BoardState, NodeId } from '@tannhauser/core';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ReachableEntryLike {
  readonly nodeId: string;
  readonly path: readonly string[];
  readonly cost: number;
}

export interface PathPreview {
  readonly nodeIds: readonly NodeId[];
  readonly points: readonly Point[];
  /** Coût en PM tel que calculé par le moteur. */
  readonly cost: number;
}

/**
 * Tracé d'aperçu vers `hoverNodeId` : uniquement pour un nœud présent dans les atteignables fournis par la façade
 * (qui vient du moteur). Aucune règle ici ; `null` si non atteignable. Le tracé part du nœud d'origine.
 */
export function buildPathPreview(
  board: BoardState,
  originId: NodeId,
  reachable: readonly ReachableEntryLike[],
  hoverNodeId: NodeId | null,
): PathPreview | null {
  if (hoverNodeId === null) return null;
  const entry = reachable.find((r) => r.nodeId === hoverNodeId);
  if (!entry || entry.path.length === 0) return null;
  const nodeIds = [originId, ...entry.path];
  const points: Point[] = [];
  for (const id of nodeIds) {
    const n = board.nodes[id];
    if (!n) return null;
    points.push({ x: n.x, y: n.y });
  }
  return { nodeIds, points, cost: entry.cost };
}

/** Position le long d'une polyligne, avec un temps égal par segment (déplacement « case par case »), p dans [0,1]. */
export function pointAlong(points: readonly Point[], p: number): Point {
  const first = points[0];
  if (!first) return { x: 0, y: 0 };
  if (points.length === 1 || p <= 0) return first;
  const last = points[points.length - 1]!;
  if (p >= 1) return last;
  const segs = points.length - 1;
  const f = p * segs;
  const i = Math.min(segs - 1, Math.floor(f));
  const t = f - i;
  const a = points[i]!;
  const b = points[i + 1]!;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Facteur d'échelle des textes monde pour garder une taille à l'écran lisible quel que soit le zoom caméra. */
export function textScaleForZoom(zoom: number, min = 0.8, max = 2.5): number {
  if (!(zoom > 0)) return 1;
  return Math.min(max, Math.max(min, 1 / zoom));
}
