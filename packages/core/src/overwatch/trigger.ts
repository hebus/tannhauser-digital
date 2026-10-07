import { canSee } from '../board/line-of-sight';
import type { NodeId } from '../board/types';
import type { CharacterState, GameState } from '../state/types';

/**
 * Personnage en Overwatch adverse qui voit `nodeId` (ligne de vue, fumée comprise).
 * Si plusieurs peuvent réagir, le premier dans l'ordre de l'état (voir OQ-OVERWATCH-002).
 */
export function findOverwatchTrigger(state: GameState, mover: CharacterState, nodeId: NodeId): CharacterState | null {
  const smokeNodes = new Set(state.effects.filter((e) => e.type === 'SMOKE').map((e) => e.origin));
  for (const c of state.characters) {
    if (!c.alive || !c.overwatch || c.playerId === mover.playerId) continue;
    if (canSee(state.board, c.nodeId, nodeId, { smokeNodes })) return c;
  }
  return null;
}
