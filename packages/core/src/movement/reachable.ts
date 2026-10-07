import type { NodeId } from '../board/types';
import type { CharacterId, GameState } from '../state/types';
import { checkStep, neighborCandidates, occupantsOf } from './graph';

export interface ReachableEntry {
  readonly cost: number;
  /** Cases franchies dans l'ordre, origine exclue (vide pour l'origine). */
  readonly path: readonly NodeId[];
}

/**
 * Cases atteignables par un personnage avec ses PM restants (Dijkstra).
 * Une case occupée par un allié est traversable mais n'est pas une case d'arrivée valide
 * (OQ-MOVE-002) ; elle est donc absente du résultat. L'origine est présente (coût 0).
 */
export function reachableNodes(state: GameState, characterId: CharacterId): ReadonlyMap<NodeId, ReachableEntry> {
  const character = state.characters.find((c) => c.id === characterId);
  const result = new Map<NodeId, ReachableEntry>();
  if (!character || !character.alive) return result;

  const best = new Map<NodeId, ReachableEntry>([[character.nodeId, { cost: 0, path: [] }]]);
  const done = new Set<NodeId>();
  for (;;) {
    // Plus petit coût ; égalité → id le plus petit (déterminisme).
    let current: NodeId | null = null;
    for (const [id, entry] of best) {
      if (done.has(id)) continue;
      if (current === null) {
        current = id;
        continue;
      }
      const cur = best.get(current)!;
      if (entry.cost < cur.cost || (entry.cost === cur.cost && id < current)) current = id;
    }
    if (current === null) break;
    done.add(current);
    const entry = best.get(current)!;
    for (const to of neighborCandidates(state.board, current)) {
      if (done.has(to)) continue;
      const step = checkStep(state, character, current, to);
      if (!step.ok) continue;
      const cost = entry.cost + step.cost;
      if (cost > character.movementLeft) continue;
      const known = best.get(to);
      if (!known || cost < known.cost) best.set(to, { cost, path: [...entry.path, to] });
    }
  }

  for (const id of [...best.keys()].sort()) {
    if (occupantsOf(state, id, character.id).length > 0) continue;
    result.set(id, best.get(id)!);
  }
  return result;
}
