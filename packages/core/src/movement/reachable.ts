import type { NodeId } from '../board/types';
import type { CharacterId, GameState } from '../state/types';
import { forcePassageUsed } from './force-passage';
import { checkStep, neighborCandidates, occupantsOf } from './graph';

export interface ReachableEntry {
  readonly cost: number;
  /** Cases franchies dans l'ordre, origine exclue (vide pour l'origine). */
  readonly path: readonly NodeId[];
  /** Chemin passant par une case ennemie : passage en force (duel de Physique) à réussir, non garanti. */
  readonly forcePassage?: true;
}

/**
 * Cases atteignables par un personnage avec ses PM restants (Dijkstra).
 * Une case occupée par un allié est traversable mais n'est pas une case d'arrivée valide
 * (OQ-MOVE-004) ; elle est donc absente du résultat. L'origine est présente (coût 0).
 * Tant que le passage en force n'a pas été tenté, une case ennemie intermédiaire est traversable une fois :
 * les cases qu'on n'atteint que par là portent `forcePassage` ; un chemin sans duel est toujours préféré.
 */
export function reachableNodes(state: GameState, characterId: CharacterId): ReadonlyMap<NodeId, ReachableEntry> {
  const character = state.characters.find((c) => c.id === characterId);
  const result = new Map<NodeId, ReachableEntry>();
  if (!character || !character.alive) return result;

  const mayForce = !forcePassageUsed(state);
  // Deux couches : sans passage en force (0) et après avoir traversé un ennemi (1).
  const best = new Map<string, ReachableEntry & { node: NodeId; layer: 0 | 1 }>([
    [`${character.nodeId}|0`, { node: character.nodeId, layer: 0, cost: 0, path: [] }],
  ]);
  const done = new Set<string>();
  for (;;) {
    // Plus petit coût ; égalité → clé la plus petite (déterminisme).
    let currentKey: string | null = null;
    for (const [key, entry] of best) {
      if (done.has(key)) continue;
      if (currentKey === null) {
        currentKey = key;
        continue;
      }
      const cur = best.get(currentKey)!;
      if (entry.cost < cur.cost || (entry.cost === cur.cost && key < currentKey)) currentKey = key;
    }
    if (currentKey === null) break;
    done.add(currentKey);
    const entry = best.get(currentKey)!;
    for (const to of neighborCandidates(state.board, entry.node)) {
      const step = checkStep(state, character, entry.node, to, mayForce && entry.layer === 0);
      if (!step.ok) continue;
      const layer: 0 | 1 = step.crossing !== undefined ? 1 : entry.layer;
      const key = `${to}|${layer}`;
      if (done.has(key)) continue;
      const cost = entry.cost + step.cost;
      if (cost > character.movementLeft) continue;
      const known = best.get(key);
      if (!known || cost < known.cost) best.set(key, { node: to, layer, cost, path: [...entry.path, to] });
    }
  }

  const nodes = [...new Set([...best.values()].map((e) => e.node))].sort();
  for (const id of nodes) {
    if (occupantsOf(state, id, character.id).length > 0) continue;
    const plain = best.get(`${id}|0`);
    const forced = best.get(`${id}|1`);
    if (plain) result.set(id, { cost: plain.cost, path: plain.path });
    else if (forced) result.set(id, { cost: forced.cost, path: forced.path, forcePassage: true });
  }
  return result;
}
