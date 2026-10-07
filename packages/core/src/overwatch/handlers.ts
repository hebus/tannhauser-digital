import { checkTargeting } from '../combat/attack';
import { resolveAttackExchange } from '../combat/exchange';
import type { GameCommand } from '../commands/commands';
import {
  dryValidate,
  executeCommand,
  registerHandler,
  registerInterceptor,
  reject,
} from '../engine/apply-command';
import type { GameEvent, RuleError } from '../events/events';
import type { RandomSource } from '../rng/rng';
import type { CharacterState, GameState, PendingReaction } from '../state/types';
import { CommandPointService } from '../turn/command-points';
import { beginActivations } from '../turn/start-turn';
import { endActivation } from '../turn/handlers';
import { findOverwatchTrigger } from './trigger';

/** Coût en PC pour placer un personnage en Overwatch (règle du product owner). */
export const OVERWATCH_COST = 1;

/** Joueur suivant dans l'ordre de décision (à partir du joueur d'initiative), ou `null` si le tour de décision est bouclé. */
function nextPlacementPlayer(state: GameState): string | null {
  const n = state.players.length;
  const start = Math.max(0, state.players.findIndex((p) => p.id === state.turn.initiativePlayerId));
  const current = state.players.findIndex((p) => p.id === state.turn.activePlayerId);
  const next = (current + 1) % n;
  return next === start ? null : state.players[next]!.id;
}

export type OverwatchPlacementCheck =
  | { readonly ok: true; readonly character: CharacterState }
  | { readonly ok: false; readonly errors: readonly RuleError[] };

/** Conditions de la commande OVERWATCH (placement en phase OVERWATCH ; partagées avec `getLegalActions`). */
export function checkOverwatchPlacement(state: GameState, playerId: string, characterId: string): OverwatchPlacementCheck {
  const no = (code: string, message: string): OverwatchPlacementCheck => ({ ok: false, errors: [{ code, message }] });
  if (state.phase !== 'OVERWATCH') return no('OVERWATCH_BEFORE_ACTIVATIONS', "Impossible : l'Overwatch se place avant les activations.");
  if (state.turn.activePlayerId !== playerId) {
    return no('NOT_YOUR_PLACEMENT_TURN', "Impossible : ce n'est pas à vous de placer vos Overwatch.");
  }
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return no('UNKNOWN_CHARACTER', `Personnage inconnu : ${characterId}.`);
  if (character.playerId !== playerId) return no('NOT_OWN_CHARACTER', "Impossible : ce personnage n'est pas à vous.");
  if (!character.alive) return no('CHARACTER_DEAD', 'Impossible : ce personnage est hors de combat.');
  if (character.activated || character.overwatch) {
    return character.overwatch
      ? no('ALREADY_OVERWATCH', 'Impossible : ce personnage est déjà en Overwatch ce tour-ci.')
      : no('ALREADY_ACTIVATED', 'Impossible : ce personnage ne peut pas être activé ce tour-ci.');
  }
  const canSpend = CommandPointService.canSpend(state, playerId, OVERWATCH_COST);
  if (!canSpend.ok) return no('INSUFFICIENT_COMMAND_POINTS', `Impossible : ${OVERWATCH_COST} PC requis.`);
  return { ok: true, character };
}

/**
 * OVERWATCH : pendant la phase de placement, le joueur dépense 1 PC pour mettre un de ses personnages en
 * Overwatch. Le personnage est traité comme déjà activé (non activable ce tour). Ne consomme aucune action.
 */
registerHandler('OVERWATCH', (state, command) => {
  const checked = checkOverwatchPlacement(state, command.playerId, command.characterId);
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const { character } = checked;
  const spent = CommandPointService.spend(state, command.playerId, OVERWATCH_COST, 'OVERWATCH');
  if (!spent.ok) return reject(spent.reason, spent.message);
  return {
    ok: true,
    events: [spent.event, { type: 'OVERWATCH_PLACED', characterId: character.id }],
    state: {
      ...spent.state,
      characters: spent.state.characters.map((c) => (c.id === character.id ? { ...c, overwatch: true, activated: true } : c)),
    },
  };
});

/** Conditions de END_OVERWATCH_PLACEMENT (partagées avec `getLegalActions`). */
export function checkEndPlacement(state: GameState, playerId: string): { ok: true } | { ok: false; error: RuleError } {
  if (state.phase !== 'OVERWATCH') {
    return { ok: false, error: { code: 'NOT_PLACEMENT_PHASE', message: "Impossible : ce n'est pas la phase de placement de l'Overwatch." } };
  }
  if (state.turn.activePlayerId !== playerId) {
    return { ok: false, error: { code: 'NOT_YOUR_PLACEMENT_TURN', message: "Impossible : ce n'est pas à vous de placer vos Overwatch." } };
  }
  return { ok: true };
}

/**
 * END_OVERWATCH_PLACEMENT : le joueur a fini de placer ses Overwatch. Le joueur suivant décide à son tour ;
 * après le dernier, la phase d'activation commence.
 */
registerHandler('END_OVERWATCH_PLACEMENT', (state, command, rng) => {
  const checked = checkEndPlacement(state, command.playerId);
  if (!checked.ok) return { ok: false, errors: [checked.error] };
  const events: GameEvent[] = [{ type: 'OVERWATCH_PLACEMENT_ENDED', playerId: command.playerId }];
  const next = nextPlacementPlayer(state);
  if (next !== null) {
    return { ok: true, events, state: { ...state, turn: { ...state.turn, activePlayerId: next } } };
  }
  return { ok: true, events, state: beginActivations(state, events, rng) };
});

// --- Attaque d'opportunité ---------------------------------------------------------------------------------------

/** Commandes dont la tentative, dans la ligne de vue d'un Overwatch adverse, ouvre une réaction avant exécution. */
const ANNOUNCEABLE = new Set<GameCommand['type']>(['MOVE_CHARACTER', 'ATTACK', 'OPEN_DOOR', 'CLOSE_DOOR']);

function actorOf(command: GameCommand): string | null {
  switch (command.type) {
    case 'MOVE_CHARACTER':
    case 'OPEN_DOOR':
    case 'CLOSE_DOOR':
      return command.characterId;
    case 'ATTACK':
      return command.attackerId;
    default:
      return null;
  }
}

/**
 * Déclencheur (b) : l'adversaire est DÉJÀ dans la ligne de vue d'un Overwatch et tente de se déplacer ou d'agir.
 * La commande est d'abord validée à blanc (RNG factice, rien n'est consommé) : une commande invalide n'ouvre
 * aucune réaction. Sinon la réaction s'ouvre AVANT l'exécution et mémorise la commande annoncée (`resume`).
 */
registerInterceptor((state, command) => {
  if (!ANNOUNCEABLE.has(command.type) || state.phase !== 'ACTIVATION' || state.turn.reaction) return null;
  const actorId = actorOf(command);
  const mover = state.characters.find((c) => c.id === actorId);
  if (!mover || !mover.alive || state.turn.activeCharacterId !== mover.id || 'playerId' in command && command.playerId !== mover.playerId) return null;
  const overwatcher = findOverwatchTrigger(state, mover, mover.nodeId);
  if (!overwatcher) return null;
  if (!dryValidate(state, command).ok) return null;
  const reaction: PendingReaction = {
    overwatcherId: overwatcher.id,
    targetId: mover.id,
    forPlayerId: overwatcher.playerId,
    resume: command,
  };
  return {
    ok: true,
    events: [{ type: 'OVERWATCH_TRIGGERED', overwatcherId: overwatcher.id, targetId: mover.id, nodeId: mover.nodeId, announced: command.type }],
    state: { ...state, turn: { ...state.turn, reaction } },
  };
});

/** Retire la réaction en attente ; `overwatcherId` est ajouté aux refus si l'attaque d'opportunité est déclinée. */
function closeReaction(state: GameState, waive: string | null): GameState {
  const turn = { ...state.turn };
  delete turn.reaction;
  return {
    ...state,
    turn: waive === null ? turn : { ...turn, overwatchWaived: [...(turn.overwatchWaived ?? []), waive] },
  };
}

/**
 * Une fois la réaction résolue, rejoue la commande annoncée (si l'activation est toujours en cours). Elle repasse
 * par `executeCommand` : un autre Overwatch qui voit l'adversaire peut ouvrir une nouvelle réaction. Si elle est
 * refusée entre-temps (état modifié par le tir), l'événement OVERWATCH_RESUME_REFUSED le signale.
 */
function resumeAnnounced(state: GameState, reaction: PendingReaction, events: GameEvent[], rng: RandomSource): GameState {
  const command = reaction.resume;
  if (!command || state.phase === 'FINISHED') return state;
  const mover = state.characters.find((c) => c.id === reaction.targetId);
  if (!mover || !mover.alive) return state;
  const outcome = executeCommand(state, command, rng);
  if (!outcome.ok) {
    const error = outcome.errors[0]!;
    events.push({ type: 'OVERWATCH_RESUME_REFUSED', characterId: mover.id, command: command.type, code: error.code, message: error.message });
    return state;
  }
  events.push(...outcome.events);
  return outcome.state;
}

/** OVERWATCH_FIRE : attaque d'opportunité optionnelle ; l'échange d'attaque complet est utilisé. */
registerHandler('OVERWATCH_FIRE', (state, command, rng) => {
  const reaction = state.turn.reaction;
  if (!reaction) return reject('NO_REACTION', "Aucune réaction d'Overwatch en attente.");
  if (reaction.forPlayerId !== command.playerId) return reject('NOT_YOUR_REACTION', "Cette réaction n'est pas la vôtre.");
  const overwatcher = state.characters.find((c) => c.id === reaction.overwatcherId);
  const target = state.characters.find((c) => c.id === reaction.targetId);
  if (!overwatcher || !target) return reject('UNKNOWN_CHARACTER', 'Personnage de la réaction introuvable.');
  const weapon = overwatcher.weapons?.find((w) => w.id === command.weaponId);
  if (!weapon) return reject('WEAPON_NOT_OWNED', `Arme non possédée : ${command.weaponId}`);
  const refused = checkTargeting(state, overwatcher, target, weapon);
  if (refused) return refused;

  const exchange = resolveAttackExchange(state, overwatcher, target, weapon, rng);
  const events: GameEvent[] = [...exchange.events, { type: 'OVERWATCH_RESOLVED', overwatcherId: overwatcher.id, fired: true }];
  // L'attaque d'opportunité est réalisée : le personnage n'est plus en Overwatch (et reste non activable ce tour).
  let next = closeReaction(exchange.state, null);
  next = { ...next, characters: next.characters.map((c) => (c.id === overwatcher.id ? { ...c, overwatch: false } : c)) };
  if (next.phase === 'FINISHED') return { ok: true, state: next, events };
  const targetAfter = next.characters.find((c) => c.id === target.id);
  if (targetAfter && !targetAfter.alive) {
    // Cible hors de combat : son activation se termine sans reprise de la commande annoncée.
    return { ok: true, state: endActivation(next, events, rng), events };
  }
  return { ok: true, state: resumeAnnounced(next, reaction, events, rng), events };
});

/** OVERWATCH_DECLINE : l'Overwatch reste actif mais ne se redéclenche pas contre cet adversaire pendant son activation. */
registerHandler('OVERWATCH_DECLINE', (state, command, rng) => {
  const reaction = state.turn.reaction;
  if (!reaction) return reject('NO_REACTION', "Aucune réaction d'Overwatch en attente.");
  if (reaction.forPlayerId !== command.playerId) return reject('NOT_YOUR_REACTION', "Cette réaction n'est pas la vôtre.");
  const events: GameEvent[] = [{ type: 'OVERWATCH_RESOLVED', overwatcherId: reaction.overwatcherId, fired: false }];
  const next = closeReaction(state, reaction.overwatcherId);
  return { ok: true, state: resumeAnnounced(next, reaction, events, rng), events };
});
