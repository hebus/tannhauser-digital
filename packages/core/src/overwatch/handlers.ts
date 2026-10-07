import { checkTargeting } from '../combat/attack';
import { resolveAttackExchange } from '../combat/exchange';
import { registerHandler, reject } from '../engine/apply-command';
import type { GameEvent } from '../events/events';
import type { GameState, TurnState } from '../state/types';
import { endActivation } from '../turn/handlers';

/** Retire la réaction en attente et l'état Overwatch du personnage (une seule réaction par Overwatch). */
function resolveReaction(state: GameState, overwatcherId: string): GameState {
  const turn: TurnState = {
    number: state.turn.number,
    initiativePlayerId: state.turn.initiativePlayerId,
    activePlayerId: state.turn.activePlayerId,
    activeCharacterId: state.turn.activeCharacterId,
    actionUsed: state.turn.actionUsed,
  };
  return {
    ...state,
    turn,
    characters: state.characters.map((c) => (c.id === overwatcherId ? { ...c, overwatch: false } : c)),
  };
}

/** OVERWATCH : action du personnage actif (son unique action de l'activation). */
registerHandler('OVERWATCH', (state, command) => {
  if (state.phase !== 'ACTIVATION') return reject('WRONG_PHASE', "Aucune phase d'activation en cours.");
  if (state.turn.activePlayerId !== command.playerId) return reject('NOT_YOUR_TURN', "Ce n'est pas votre tour.");
  const character = state.characters.find((c) => c.id === command.characterId);
  if (!character) return reject('UNKNOWN_CHARACTER', `Personnage inconnu : ${command.characterId}.`);
  if (character.playerId !== command.playerId) return reject('NOT_OWN_CHARACTER', "Ce personnage n'est pas à vous.");
  if (!character.alive) return reject('CHARACTER_DEAD', 'Un personnage mort ne peut pas agir.');
  if (state.turn.activeCharacterId !== character.id) {
    return reject('NOT_ACTIVE_CHARACTER', "Ce personnage n'est pas en cours d'activation.");
  }
  if (state.turn.actionUsed) return reject('ACTION_ALREADY_USED', 'Une seule action par activation : elle est déjà utilisée.');
  return {
    ok: true,
    events: [{ type: 'OVERWATCH_PLACED', characterId: character.id }],
    state: {
      ...state,
      turn: { ...state.turn, actionUsed: true },
      characters: state.characters.map((c) => (c.id === character.id ? { ...c, overwatch: true } : c)),
    },
  };
});

/** OVERWATCH_FIRE : le joueur en Overwatch réagit en attaquant l'adversaire qui a déclenché la réaction. */
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
  let next = resolveReaction(exchange.state, overwatcher.id);
  // Cible hors de combat : l'activation adverse s'arrête (une victoire éventuelle a déjà terminé la partie).
  const targetAfter = next.characters.find((c) => c.id === target.id);
  if (next.phase !== 'FINISHED' && targetAfter && !targetAfter.alive) next = endActivation(next, events, rng);
  return { ok: true, state: next, events };
});

/** OVERWATCH_DECLINE : le joueur renonce à réagir ; l'activation adverse reprend. */
registerHandler('OVERWATCH_DECLINE', (state, command) => {
  const reaction = state.turn.reaction;
  if (!reaction) return reject('NO_REACTION', "Aucune réaction d'Overwatch en attente.");
  if (reaction.forPlayerId !== command.playerId) return reject('NOT_YOUR_REACTION', "Cette réaction n'est pas la vôtre.");
  return {
    ok: true,
    events: [{ type: 'OVERWATCH_RESOLVED', overwatcherId: reaction.overwatcherId, fired: false }],
    state: resolveReaction(state, reaction.overwatcherId),
  };
});
