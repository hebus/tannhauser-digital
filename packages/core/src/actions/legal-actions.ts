import { checkAttacker, checkTargeting, validateAttack } from '../combat/attack';
import { checkCommandGate } from '../engine/apply-command';
import type { RuleError } from '../events/events';
import { checkActor, checkDoorToggle, doorsAdjacentTo } from '../movement/handlers';
import { reachableNodes } from '../movement/reachable';
import { checkOverwatchAction } from '../overwatch/handlers';
import type { CharacterState, GameState } from '../state/types';
import { checkEndActivation, checkPass, checkSelectCharacter } from '../turn/handlers';
import type { GameCommandType } from '../commands/commands';

/**
 * Actions qu'un personnage peut tenter. `SELECT` (début d'activation) s'ajoute aux actions de jeu
 * pour que l'interface explique aussi pourquoi un personnage ne peut pas être activé.
 */
export type ActionId = 'SELECT' | 'MOVE' | 'ATTACK' | 'OVERWATCH' | 'OPEN_DOOR' | 'CLOSE_DOOR' | 'END_ACTIVATION' | 'PASS';

export interface AttackOption {
  readonly targetId: string;
  readonly weaponId: string;
}

export interface BlockedAttack extends AttackOption {
  readonly code: string;
  readonly reason: string;
}

export interface ActionDetails {
  /** MOVE : nombre de cases d'arrivée atteignables et PM restants. */
  readonly reachableCount?: number;
  readonly movementLeft?: number;
  /** ATTACK : couples (cible, arme) acceptés par le moteur ; `blocked` explique les autres. */
  readonly attackOptions?: readonly AttackOption[];
  readonly blocked?: readonly BlockedAttack[];
  /** OPEN_DOOR / CLOSE_DOOR : portes utilisables. */
  readonly doorIds?: readonly string[];
}

export interface LegalAction {
  readonly id: ActionId;
  readonly available: boolean;
  /** Code de règle stable du refus (ex. `ACTION_ALREADY_USED`) — clé de localisation possible côté interface. */
  readonly code?: string;
  /** Explication lisible en français, présente quand l'action est indisponible. */
  readonly reason?: string;
  readonly details?: ActionDetails;
}

const GAME_COMMAND_OF: Record<ActionId, GameCommandType> = {
  SELECT: 'SELECT_CHARACTER',
  MOVE: 'MOVE_CHARACTER',
  ATTACK: 'ATTACK',
  OVERWATCH: 'OVERWATCH',
  OPEN_DOOR: 'OPEN_DOOR',
  CLOSE_DOOR: 'CLOSE_DOOR',
  END_ACTIVATION: 'END_TURN',
  PASS: 'PASS',
};

const ok = (id: ActionId, details?: ActionDetails): LegalAction => (details ? { id, available: true, details } : { id, available: true });
const refuse = (id: ActionId, error: RuleError, details?: ActionDetails): LegalAction => ({
  id,
  available: false,
  code: error.code,
  reason: error.message,
  ...(details ? { details } : {}),
});
const refuseWith = (id: ActionId, code: string, reason: string, details?: ActionDetails): LegalAction =>
  refuse(id, { code, message: reason }, details);

function moveAction(state: GameState, character: CharacterState): LegalAction {
  const actor = checkActor(state, character.playerId, character.id);
  if (!actor.ok) return refuse('MOVE', actor.error);
  const destinations = [...reachableNodes(state, character.id).entries()].filter(([, r]) => r.path.length > 0).length;
  const details = { reachableCount: destinations, movementLeft: character.movementLeft };
  if (destinations === 0) {
    return character.movementLeft <= 0
      ? refuseWith('MOVE', 'NO_MOVEMENT_LEFT', 'Impossible : plus aucun point de mouvement.', details)
      : refuseWith('MOVE', 'NO_REACHABLE_NODE', 'Impossible : aucune case atteignable.', details);
  }
  return ok('MOVE', details);
}

function attackAction(state: GameState, character: CharacterState): LegalAction {
  const checked = checkAttacker(state, character.playerId, character.id);
  if (!checked.ok) return refuse('ATTACK', checked.errors[0]!);
  const enemies = state.characters.filter((c) => c.alive && c.playerId !== character.playerId);
  if (enemies.length === 0) return refuseWith('ATTACK', 'NO_ENEMY', 'Impossible : aucun ennemi en jeu.');
  const weapons = character.weapons ?? [];
  if (weapons.length === 0) return refuseWith('ATTACK', 'NO_WEAPON', 'Impossible : aucune arme.');

  const options: AttackOption[] = [];
  const blocked: BlockedAttack[] = [];
  for (const target of enemies) {
    for (const weapon of weapons) {
      const v = validateAttack(state, { playerId: character.playerId, attackerId: character.id, targetId: target.id, weaponId: weapon.id });
      if (v.ok) options.push({ targetId: target.id, weaponId: weapon.id });
      else blocked.push({ targetId: target.id, weaponId: weapon.id, code: v.errors[0]!.code, reason: v.errors[0]!.message });
    }
  }
  if (options.length > 0) return ok('ATTACK', { attackOptions: options, blocked });
  // Combat à 0 : le motif est le même pour toutes les cibles, on le dit tel quel.
  if (blocked.every((b) => b.code === 'CHARACTERISTIC_ZERO')) {
    return refuseWith('ATTACK', 'CHARACTERISTIC_ZERO', blocked[0]!.reason, { attackOptions: [], blocked });
  }
  return refuseWith('ATTACK', 'NO_TARGET_IN_RANGE', 'Impossible : aucun ennemi à portée.', { attackOptions: [], blocked });
}

function doorAction(state: GameState, character: CharacterState, id: 'OPEN_DOOR' | 'CLOSE_DOOR'): LegalAction {
  const target = id === 'OPEN_DOOR' ? 'OPEN' : 'CLOSED';
  const actor = checkActor(state, character.playerId, character.id);
  if (!actor.ok) return refuse(id, actor.error);
  const adjacent = doorsAdjacentTo(state, character.nodeId);
  if (adjacent.length === 0) return refuseWith(id, 'NO_ADJACENT_DOOR', 'Impossible : aucune porte adjacente.');
  const results = adjacent.map((d) => ({ door: d, check: checkDoorToggle(state, character.playerId, character.id, d.id, target) }));
  const usable = results.filter((r) => r.check.ok).map((r) => r.door.id);
  if (usable.length > 0) return ok(id, { doorIds: usable });
  const first = results[0]!.check;
  return refuse(id, first.ok ? { code: 'NO_DOOR', message: 'Impossible : aucune porte utilisable.' } : first.error);
}

/**
 * Actions d'un personnage avec leur disponibilité. Source unique pour l'interface : AUCUNE règle n'est
 * recopiée ici, chaque entrée appelle les mêmes validations que le handler de la commande correspondante
 * (`checkAttacker`/`checkTargeting`, `checkActor`/`reachableNodes`, `checkOverwatchAction`, `checkDoorToggle`,
 * `checkEndActivation`, `checkPass`, `checkSelectCharacter`) après la garde commune d'`applyCommand`
 * (partie terminée, réaction en attente). Pure : ne modifie pas l'état.
 */
export function getLegalActions(state: GameState, characterId: string): LegalAction[] {
  const ids = Object.keys(GAME_COMMAND_OF) as ActionId[];
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return ids.map((id) => refuseWith(id, 'UNKNOWN_CHARACTER', `Personnage inconnu : ${characterId}.`));

  return ids.map((id): LegalAction => {
    const gate = checkCommandGate(state, GAME_COMMAND_OF[id]);
    if (gate) return refuse(id, gate);
    switch (id) {
      case 'SELECT': {
        const c = checkSelectCharacter(state, character.playerId, character.id);
        return c.ok ? ok(id) : refuse(id, c.error);
      }
      case 'MOVE':
        return moveAction(state, character);
      case 'ATTACK':
        return attackAction(state, character);
      case 'OVERWATCH': {
        const c = checkOverwatchAction(state, character.playerId, character.id);
        return c.ok ? ok(id) : refuse(id, c.errors[0]!);
      }
      case 'OPEN_DOOR':
      case 'CLOSE_DOOR':
        return doorAction(state, character, id);
      case 'END_ACTIVATION': {
        const c = checkEndActivation(state, character.playerId);
        return c.ok ? ok(id) : refuse(id, c.error);
      }
      case 'PASS': {
        const c = checkPass(state, character.playerId);
        return c.ok ? ok(id) : refuse(id, c.error);
      }
    }
  });
}

export interface ReactionFireOption {
  readonly weaponId: string;
  readonly available: boolean;
  readonly reason?: string;
}

export interface ReactionOptions {
  readonly overwatcherId: string;
  readonly targetId: string;
  readonly forPlayerId: string;
  /** Armes avec lesquelles tirer (même ciblage que l'attaque). Refuser est toujours possible. */
  readonly fire: readonly ReactionFireOption[];
  readonly canFire: boolean;
}

/** Choix offerts pour la réaction d'Overwatch en attente (`null` s'il n'y en a pas). */
export function getReactionOptions(state: GameState): ReactionOptions | null {
  const reaction = state.turn.reaction;
  if (!reaction || state.phase === 'FINISHED') return null;
  const overwatcher = state.characters.find((c) => c.id === reaction.overwatcherId);
  const target = state.characters.find((c) => c.id === reaction.targetId);
  const fire = (overwatcher?.weapons ?? []).map((w): ReactionFireOption => {
    if (!overwatcher || !target) return { weaponId: w.id, available: false, reason: 'Personnage de la réaction introuvable.' };
    const refused = checkTargeting(state, overwatcher, target, w);
    return refused && !refused.ok ? { weaponId: w.id, available: false, reason: refused.errors[0]!.message } : { weaponId: w.id, available: true };
  });
  return { ...reaction, fire, canFire: fire.some((f) => f.available) };
}
