import type { BoardState, ColorId, NodeId } from './types';

export interface LineOfSightContext {
  /** Nœuds actuellement sous fumée (TimedBoardEffect SMOKE) : coupent la ligne de vue. */
  readonly smokeNodes?: ReadonlySet<NodeId>;
  /** Équipement porté qui ignore la fumée (capacité `ignoresSmokeForLineOfSight`). */
  readonly ignoresSmoke?: boolean;
}

/**
 * Nœuds visibles depuis `from` (hors `from`).
 *
 * Modèle (RULE-LOS-001) : la vue se propage de proche en proche, sans tenir compte du sens
 * des arêtes, à travers les nœuds qui contiennent au moins une couleur du nœud d'origine.
 * Une porte fermée et la fumée (sauf équipement dédié) coupent la propagation.
 *
 * Questions ouvertes (docs/rules/open-questions.md) : réciprocité stricte, fumée sur la case
 * cible elle-même.
 */
export function visibleNodes(board: BoardState, from: NodeId, ctx: LineOfSightContext = {}): Set<NodeId> {
  const origin = board.nodes[from];
  if (!origin) throw new Error(`Nœud inconnu : ${from}`);
  const colors: ReadonlySet<ColorId> = new Set(origin.colors);
  const smoke = ctx.ignoresSmoke ? undefined : ctx.smokeNodes;

  const neighbours = new Map<NodeId, NodeId[]>();
  for (const edge of board.edges) {
    if (edge.doorId !== undefined && board.doors[edge.doorId]?.state === 'CLOSED') continue;
    (neighbours.get(edge.from) ?? neighbours.set(edge.from, []).get(edge.from)!).push(edge.to);
    (neighbours.get(edge.to) ?? neighbours.set(edge.to, []).get(edge.to)!).push(edge.from);
  }

  const visible = new Set<NodeId>();
  const queue: NodeId[] = [from];
  const seen = new Set<NodeId>([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbours.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      const node = board.nodes[next];
      if (!node || !node.colors.some((c) => colors.has(c))) continue;
      if (smoke?.has(next)) continue;
      visible.add(next);
      queue.push(next);
    }
  }
  return visible;
}

export function canSee(board: BoardState, from: NodeId, to: NodeId, ctx: LineOfSightContext = {}): boolean {
  return from === to || visibleNodes(board, from, ctx).has(to);
}
