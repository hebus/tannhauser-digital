import { canSee } from '../board/line-of-sight';
import type { NodeId } from '../board/types';
import type { CharacterState, GameState } from '../state/types';

/**
 * Personnages en Overwatch adverses qui voient `nodeId` (ligne de vue, fumée comprise), dans l'ordre de l'état.
 * Sont exclus : les morts, les alliés du `mover`, et ceux qui ont refusé l'attaque d'opportunité pendant
 * l'activation courante (`turn.overwatchWaived`, OQ-OVERWATCH-005).
 */
export function findOverwatchers(state: GameState, mover: CharacterState, nodeId: NodeId): CharacterState[] {
  const smokeNodes = new Set(state.effects.filter((e) => e.type === 'SMOKE').map((e) => e.origin));
  const waived = new Set(state.turn.overwatchWaived ?? []);
  return state.characters.filter(
    (c) =>
      c.alive &&
      c.overwatch &&
      c.playerId !== mover.playerId &&
      !waived.has(c.id) &&
      canSee(state.board, c.nodeId, nodeId, { smokeNodes }),
  );
}

/**
 * Premier personnage en Overwatch adverse qui voit `nodeId` (voir OQ-OVERWATCH-002 pour le choix quand
 * plusieurs le voient).
 */
export function findOverwatchTrigger(state: GameState, mover: CharacterState, nodeId: NodeId): CharacterState | null {
  return findOverwatchers(state, mover, nodeId)[0] ?? null;
}