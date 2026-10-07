import type { NodeId } from '../board/types';
import type { GameEvent } from '../events/events';
import type { CharacterState, FlagState, GameState, PlayerId } from '../state/types';

/** Drapeaux que chaque joueur place à la mise en place (Capture du drapeau, RULE-VICT-002). */
export const FLAGS_PER_PLAYER = 3;
/** Drapeaux ennemis à planter dans son camp pour gagner (RULE-VICT-002). */
export const FLAGS_TO_WIN = 2;
export const CTF_REASON = 'CTF_FLAGS_PLANTED';

export const isCaptureTheFlag = (state: GameState): boolean => state.mode === 'CAPTURE_THE_FLAG';

export const flagsOf = (state: GameState): readonly FlagState[] => state.flags ?? [];

/** Personnage blessé : il a perdu au moins un niveau de santé (un blessé ne manipule pas de drapeau, RULE-OBJ-011). */
export const isWounded = (character: CharacterState): boolean => character.health < character.statRows.length;

export const carriedFlags = (state: GameState, characterId: string): readonly FlagState[] =>
  flagsOf(state).filter((f) => f.location.kind === 'CARRIED' && f.location.characterId === characterId);

/** Drapeaux plantés par `playerId` dans son camp. */
export const plantedFlags = (state: GameState, playerId: PlayerId): readonly FlagState[] =>
  flagsOf(state).filter((f) => f.location.kind === 'PLANTED' && f.location.playerId === playerId);

/** Un personnage éliminé dépose ses drapeaux sur sa case (RULE-OBJ-012). */
export function dropFlags(state: GameState, characterId: string): { state: GameState; events: GameEvent[] } {
  const carried = carriedFlags(state, characterId);
  const character = state.characters.find((c) => c.id === characterId);
  if (carried.length === 0 || !character) return { state, events: [] };
  const dropped = new Set(carried.map((f) => f.id));
  const events: GameEvent[] = carried.map((f) => ({ type: 'FLAG_DROPPED', flagId: f.id, characterId, nodeId: character.nodeId }));
  return {
    state: {
      ...state,
      flags: flagsOf(state).map((f) => (dropped.has(f.id) ? { ...f, location: { kind: 'NODE', nodeId: character.nodeId } } : f)),
    },
    events,
  };
}

/** Premier joueur (dans l'ordre de la partie) qui a planté assez de drapeaux ennemis dans son camp. */
export function captureTheFlagWinner(state: GameState): PlayerId | null {
  if (!isCaptureTheFlag(state)) return null;
  return state.players.find((p) => plantedFlags(state, p.id).length >= FLAGS_TO_WIN)?.id ?? null;
}

/** Cases d'objectif du plateau, triées par id (cases où l'on place les drapeaux). */
export function objectiveNodes(state: GameState): NodeId[] {
  return Object.values(state.board.nodes)
    .filter((n) => n.properties.kind === 'OBJECTIVE' && n.properties.passable)
    .map((n) => n.id)
    .sort();
}
