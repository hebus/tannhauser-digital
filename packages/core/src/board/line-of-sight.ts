import type { BoardState, NodeId } from './types';

export interface LineOfSightContext {
  /** Nœuds actuellement sous fumée (TimedBoardEffect SMOKE) : coupent la ligne de vue. */
  readonly smokeNodes?: ReadonlySet<NodeId>;
  /** Équipement porté qui ignore la fumée (capacité `ignoresSmokeForLineOfSight`). */
  readonly ignoresSmoke?: boolean;
}

/**
 * Nœuds visibles depuis `from` (hors `from`).
 *
 * Modèle (RULE-LOS-001, confirmé) : B est visible depuis A s'il existe une couleur
 * présente sur TOUS les nœuds d'un chemin reliant A à B. La relation est donc réciproque.
 * Le sens des arêtes est ignoré. Une porte fermée et la fumée (sauf équipement dédié)
 * coupent le chemin.
 */
export function visibleNodes(board: BoardState, from: NodeId, ctx: LineOfSightContext = {}): Set<NodeId> {
  const origin = board.nodes[from];
  if (!origin) throw new Error(`Nœud inconnu : ${from}`);
  const smoke = ctx.ignoresSmoke ? undefined : ctx.smokeNodes;

  const neighbours = new Map<NodeId, NodeId[]>();
  for (const edge of board.edges) {
    if (edge.doorId !== undefined && board.doors[edge.doorId]?.state === 'CLOSED') continue;
    (neighbours.get(edge.from) ?? neighbours.set(edge.from, []).get(edge.from)!).push(edge.to);
    (neighbours.get(edge.to) ?? neighbours.set(edge.to, []).get(edge.to)!).push(edge.from);
  }

  const visible = new Set<NodeId>();
  for (const color of origin.colors) {
    const seen = new Set<NodeId>([from]);
    const queue: NodeId[] = [from];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of neighbours.get(current) ?? []) {
        if (seen.has(next)) continue;
        const node = board.nodes[next];
        if (!node || !node.colors.includes(color)) continue;
        if (smoke?.has(next)) continue;
        seen.add(next);
        visible.add(next);
        queue.push(next);
      }
    }
  }
  return visible;
}

export function canSee(board: BoardState, from: NodeId, to: NodeId, ctx: LineOfSightContext = {}): boolean {
  return from === to || visibleNodes(board, from, ctx).has(to);
}
