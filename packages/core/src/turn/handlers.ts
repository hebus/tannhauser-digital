import type { GameEvent } from '../events/events';
import { registerHandler, reject, type HandlerOutcome } from '../engine/apply-command';
import type { GameState, PlayerId, TurnState } from '../state/types';
import { CommandPointService } from './command-points';
import { rollInitiative } from './initiative';
import { nextPlayerWithActivation, startTurn } from './start-turn';
import type { RandomSource } from '../rng/rng';

/** Coût en PC de la relance d'initiative (§66.2, §75). */
export const REROLL_INITIATIVE_COST = 1;

/** Copie du tour sans personnage actif. */
function withoutActiveCharacter(turn: TurnState, activePlayerId: PlayerId | null): TurnState {
  return { number: turn.number, initiativePlayerId: turn.initiativePlayerId, activePlayerId };
}

/**
 * Après une activation (ou un PASS) : donne la main au joueur suivant qui a encore des
 * personnages à activer ; si plus personne, le tour se termine et le suivant démarre (refresh + initiative).
 */
function advance(state: GameState, events: GameEvent[], rng: RandomSource): GameState {
  const current = state.players.findIndex((p) => p.id === state.turn.activePlayerId);
  const next = nextPlayerWithActivation(state, current + 1);
  if (next !== null) {
    return { ...state, turn: withoutActiveCharacter(state.turn, next) };
  }
  events.push({ type: 'TURN_ENDED', turn: state.turn.number });
  const started = startTurn(state, state.turn.number + 1, rng);
  events.push(...started.events);
  return started.state;
}

function checkActivationPhase(state: GameState, playerId: PlayerId): HandlerOutcome | null {
  if (state.phase !== 'ACTIVATION') return reject('WRONG_PHASE', 'Aucune phase d\'activation en cours.');
  if (state.turn.activePlayerId !== playerId) {
    return reject('NOT_YOUR_TURN', `Ce n'est pas au joueur ${playerId} d'agir.`);
  }
  return null;
}

registerHandler('SELECT_CHARACTER', (state, command) => {
  const refused = checkActivationPhase(state, command.playerId);
  if (refused) return refused;
  if (state.turn.activeCharacterId !== undefined) {
    return reject('ACTIVATION_IN_PROGRESS', 'Une activation est déjà en cours.');
  }
  const character = state.characters.find((c) => c.id === command.characterId);
  if (!character) return reject('UNKNOWN_CHARACTER', `Personnage inconnu : ${command.characterId}.`);
  if (character.playerId !== command.playerId) {
    return reject('NOT_YOUR_CHARACTER', `Le personnage ${character.id} n'appartient pas au joueur ${command.playerId}.`);
  }
  if (!character.alive) return reject('CHARACTER_DEAD', `Le personnage ${character.id} est hors de combat.`);
  if (character.activated) {
    return reject('ALREADY_ACTIVATED', `Le personnage ${character.id} a déjà été activé ce tour.`);
  }
  return {
    ok: true,
    events: [{ type: 'CHARACTER_ACTIVATION_STARTED', characterId: character.id }],
    state: {
      ...state,
      characters: state.characters.map((c) => (c.id === character.id ? { ...c, activated: true } : c)),
      turn: { ...state.turn, activeCharacterId: character.id },
    },
  };
});

/** END_TURN : fin de l'activation du personnage en cours (le tour entier se termine quand tous ont été activés). */
registerHandler('END_TURN', (state, command, rng) => {
  const refused = checkActivationPhase(state, command.playerId);
  if (refused) return refused;
  const characterId = state.turn.activeCharacterId;
  if (characterId === undefined) return reject('NO_ACTIVE_CHARACTER', 'Aucune activation en cours à terminer.');
  const events: GameEvent[] = [{ type: 'CHARACTER_ACTIVATION_ENDED', characterId }];
  return { ok: true, events, state: advance(state, events, rng) };
});

/**
 * PASS : le joueur renonce à toutes ses activations restantes pour ce tour
 * (ses personnages non activés sont marqués activés). Voir OQ-TURN-005.
 */
registerHandler('PASS', (state, command, rng) => {
  const refused = checkActivationPhase(state, command.playerId);
  if (refused) return refused;
  if (state.turn.activeCharacterId !== undefined) {
    return reject('ACTIVATION_IN_PROGRESS', 'Terminez l\'activation en cours avant de passer.');
  }
  const events: GameEvent[] = [{ type: 'PLAYER_PASSED', playerId: command.playerId }];
  const passed: GameState = {
    ...state,
    characters: state.characters.map((c) =>
      c.playerId === command.playerId && c.alive && !c.activated ? { ...c, activated: true } : c,
    ),
  };
  return { ok: true, events, state: advance(passed, events, rng) };
});

/** REROLL_INITIATIVE : le gagnant de l'initiative dépense 1 PC pour relancer, avant toute activation (OQ-TURN-006). */
registerHandler('REROLL_INITIATIVE', (state, command, rng) => {
  if (state.phase !== 'ACTIVATION') return reject('WRONG_PHASE', 'Aucune initiative à relancer.');
  const previousWinnerId = state.turn.initiativePlayerId;
  if (previousWinnerId !== command.playerId) {
    return reject('NOT_INITIATIVE_WINNER', 'Seul le gagnant de l\'initiative peut la relancer.');
  }
  if (state.turn.activeCharacterId !== undefined || state.characters.some((c) => c.alive && c.activated)) {
    return reject('ACTIVATIONS_STARTED', 'L\'initiative ne peut plus être relancée : les activations ont commencé.');
  }
  const spent = CommandPointService.spend(state, command.playerId, REROLL_INITIATIVE_COST, 'REROLL_INITIATIVE');
  if (!spent.ok) return reject(spent.reason, spent.message);

  const { rolls, winnerId } = rollInitiative(
    spent.state.players.map((p) => p.id),
    rng,
  );
  const events: GameEvent[] = [spent.event, { type: 'INITIATIVE_ROLLED', rolls, winnerId }];
  if (winnerId !== previousWinnerId) events.push({ type: 'INITIATIVE_CHANGED', previousWinnerId, winnerId });

  const winnerIndex = spent.state.players.findIndex((p) => p.id === winnerId);
  const activePlayerId = nextPlayerWithActivation(spent.state, winnerIndex) ?? winnerId;
  return {
    ok: true,
    events,
    state: {
      ...spent.state,
      turn: { number: state.turn.number, initiativePlayerId: winnerId, activePlayerId },
    },
  };
});
