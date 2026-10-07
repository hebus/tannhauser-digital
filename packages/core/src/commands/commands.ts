import type { NodeId } from '../board/types';
import type { CharacterId, PlayerId } from '../state/types';

/** Seul moyen de muter l'état (§0.1). Toujours émis au nom d'un joueur. */
export type GameCommand =
  | { readonly type: 'START_GAME' }
  | { readonly type: 'SELECT_CHARACTER'; readonly playerId: PlayerId; readonly characterId: CharacterId }
  | { readonly type: 'MOVE_CHARACTER'; readonly playerId: PlayerId; readonly characterId: CharacterId; readonly path: readonly NodeId[] }
  | { readonly type: 'ATTACK'; readonly playerId: PlayerId; readonly attackerId: CharacterId; readonly targetId: CharacterId; readonly weaponId: string }
  | { readonly type: 'REROLL_INITIATIVE'; readonly playerId: PlayerId }
  | { readonly type: 'PASS'; readonly playerId: PlayerId }
  | { readonly type: 'END_TURN'; readonly playerId: PlayerId };

export type GameCommandType = GameCommand['type'];
