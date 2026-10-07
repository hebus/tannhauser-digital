import type { Door, DoorId, NodeId } from '../board/types';
import type { GameCommand } from '../commands/commands';
import type { GameEvent, RuleError } from '../events/events';
import { registerHandler, type HandlerOutcome } from '../engine/apply-command';
import type { CharacterState, GameState } from '../state/types';
import { findOverwatchTrigger } from '../overwatch/trigger';
import { validatePath } from './validate-path';

/** Une porte ne coûte rien : ni à l'ouverture ni à la fermeture (décision du product owner). */
export const CLOSE_DOOR_COST = 0;
/** Coût en PM pour ouvrir une porte : la spec n'en donne pas (OQ-DOOR-001). */
export const OPEN_DOOR_COST = 0;

export type ActorCheck =
  | { readonly ok: true; readonly character: CharacterState }
  | { readonly ok: false; readonly error: RuleError };

/** Contrôles communs : phase, joueur actif, propriété, vivant, activation non terminée (OQ-MOVE-003). */
export function checkActor(state: GameState, playerId: string, characterId: string): ActorCheck {
  const no = (code: string, message: string): ActorCheck => ({ ok: false, error: { code, message } });
  if (state.phase !== 'ACTIVATION') return no('WRONG_PHASE', "Impossible : ce n'est pas la phase d'activation.");
  if (state.turn.activePlayerId !== playerId) return no('NOT_ACTIVE_PLAYER', "Impossible : ce n'est pas votre tour.");
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return no('UNKNOWN_CHARACTER', `Personnage inconnu : ${characterId}.`);
  if (character.playerId !== playerId) return no('NOT_OWNER', 'Impossible : ce personnage ne vous appartient pas.');
  if (!character.alive) return no('CHARACTER_DEAD', 'Impossible : ce personnage est hors de combat.');
  if (character.activated && state.turn.activeCharacterId !== character.id) return no('ALREADY_ACTIVATED', 'Impossible : ce personnage a déjà terminé son activation.');
  return { ok: true, character };
}

function withCharacter(state: GameState, next: CharacterState): GameState {
  return { ...state, characters: state.characters.map((c) => (c.id === next.id ? next : c)) };
}

registerHandler('MOVE_CHARACTER', (state, command) => {
  const actor = checkActor(state, command.playerId, command.characterId);
  if (!actor.ok) return { ok: false, errors: [actor.error] };
  const { character } = actor;

  const validation = validatePath(state, character.id, command.path);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  // Overwatch (déclencheur a) : le déplacement s'arrête à la première case vue par un adversaire en Overwatch.
  let stopAt = validation.path.length;
  let overwatcher: CharacterState | null = null;
  for (let i = 0; i < validation.path.length; i += 1) {
    overwatcher = findOverwatchTrigger(state, character, validation.path[i]!);
    if (overwatcher) {
      stopAt = i + 1;
      break;
    }
  }
  const path = validation.path.slice(0, stopAt);
  const cost = validation.costs.slice(0, stopAt).reduce((a, b) => a + b, 0);
  const destination = path[path.length - 1]!;
  const moved = withCharacter(state, { ...character, nodeId: destination, movementLeft: character.movementLeft - cost });
  const events: GameEvent[] = [{ type: 'CHARACTER_MOVED', characterId: character.id, path, cost }];
  if (!overwatcher) return { ok: true, state: moved, events };

  events.push({ type: 'OVERWATCH_TRIGGERED', overwatcherId: overwatcher.id, targetId: character.id, nodeId: destination });
  return {
    ok: true,
    events,
    state: {
      ...moved,
      turn: { ...moved.turn, reaction: { overwatcherId: overwatcher.id, targetId: character.id, forPlayerId: overwatcher.playerId } },
    },
  };
});

/** Porte adjacente au nœud (portée par une arête dont une extrémité est ce nœud). */
function isAdjacentToDoor(state: GameState, nodeId: NodeId, doorId: DoorId): boolean {
  return state.board.edges.some((e) => e.doorId === doorId && (e.from === nodeId || e.to === nodeId));
}

export type DoorCheck =
  | { readonly ok: true; readonly character: CharacterState; readonly door: Door; readonly cost: number }
  | { readonly ok: false; readonly error: RuleError };

/** Conditions d'ouverture/fermeture d'une porte (partagées avec `getLegalActions`). */
export function checkDoorToggle(
  state: GameState,
  playerId: string,
  characterId: string,
  doorId: DoorId,
  target: 'OPEN' | 'CLOSED',
): DoorCheck {
  const no = (code: string, message: string): DoorCheck => ({ ok: false, error: { code, message } });
  const actor = checkActor(state, playerId, characterId);
  if (!actor.ok) return actor;
  const { character } = actor;

  const door = state.board.doors[doorId];
  if (!door) return no('UNKNOWN_DOOR', `Porte inconnue : ${doorId}.`);
  if (!isAdjacentToDoor(state, character.nodeId, door.id)) {
    return no('DOOR_NOT_ADJACENT', 'Impossible : le personnage doit être sur une case adjacente à la porte.');
  }
  if (door.state === target) {
    return target === 'OPEN'
      ? no('DOOR_ALREADY_OPEN', 'Impossible : la porte est déjà ouverte.')
      : no('DOOR_ALREADY_CLOSED', 'Impossible : la porte est déjà fermée.');
  }
  const cost = target === 'OPEN' ? OPEN_DOOR_COST : CLOSE_DOOR_COST;
  if (character.movementLeft < cost) {
    return no('INSUFFICIENT_MOVEMENT', `Impossible : ${cost} PM requis, ${character.movementLeft} disponible(s).`);
  }
  return { ok: true, character, door, cost };
}

/** Portes de la carte dont une arête touche le nœud. */
export function doorsAdjacentTo(state: GameState, nodeId: NodeId): Door[] {
  return Object.values(state.board.doors).filter((d) => isAdjacentToDoor(state, nodeId, d.id));
}

type DoorCommand = Extract<GameCommand, { type: 'OPEN_DOOR' | 'CLOSE_DOOR' }>;

function toggleDoor(state: GameState, command: DoorCommand, target: 'OPEN' | 'CLOSED'): HandlerOutcome {
  const checked = checkDoorToggle(state, command.playerId, command.characterId, command.doorId, target);
  if (!checked.ok) return { ok: false, errors: [checked.error] };
  const { character, door, cost } = checked;
  const board = { ...state.board, doors: { ...state.board.doors, [door.id]: { ...door, state: target } } };
  return {
    ok: true,
    state: withCharacter({ ...state, board }, { ...character, movementLeft: character.movementLeft - cost }),
    events: [
      target === 'OPEN'
        ? { type: 'DOOR_OPENED', characterId: character.id, doorId: door.id, cost }
        : { type: 'DOOR_CLOSED', characterId: character.id, doorId: door.id, cost },
    ],
  };
}

registerHandler('OPEN_DOOR', (state, command) => toggleDoor(state, command, 'OPEN'));
registerHandler('CLOSE_DOOR', (state, command) => toggleDoor(state, command, 'CLOSED'));
