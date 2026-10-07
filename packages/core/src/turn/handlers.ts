import type { GameEvent, RuleError } from '../events/events';
import { registerHandler, reject } from '../engine/apply-command';
import type { CharacterState, GameState, PlayerId } from '../state/types';
import { CommandPointService } from './command-points';
import { rollInitiative } from './initiative';
import { nextPlayerWithActivation, settleOverwatchPhase, startTurn, turnWithoutActivation } from './start-turn';
import type { RandomSource } from '../rng/rng';

/** Coût en PC de la relance d'initiative (§66.2, §75). */
export const REROLL_INITIATIVE_COST = 1;

/**
 * Après une activation (ou un PASS) : donne la main au joueur suivant qui a encore des
 * personnages à activer ; si plus personne, le tour se termine et le suivant démarre (refresh + initiative).
 */
function advance(state: GameState, events: GameEvent[], rng: RandomSource): GameState {
  const current = state.players.findIndex((p) => p.id === state.turn.activePlayerId);
  const next = nextPlayerWithActivation(state, current + 1);
  if (next !== null) {
    return { ...state, turn: turnWithoutActivation(state.turn, next) };
  }
  events.push({ type: 'TURN_ENDED', turn: state.turn.number });
  const started = startTurn(state, state.turn.number + 1, rng);
  events.push(...started.events);
  return started.state;
}

/** Termine l'activation en cours (événement + passage au joueur suivant ou au tour suivant). */
export function endActivation(state: GameState, events: GameEvent[], rng: RandomSource): GameState {
  const characterId = state.turn.activeCharacterId;
  if (characterId !== undefined) events.push({ type: 'CHARACTER_ACTIVATION_ENDED', characterId });
  return advance(state, events, rng);
}

export type TurnCheck<T = object> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: RuleError };

const no = (code: string, message: string): { ok: false; error: RuleError } => ({ ok: false, error: { code, message } });

function checkActivationPhase(state: GameState, playerId: PlayerId): { ok: false; error: RuleError } | null {
  if (state.phase !== 'ACTIVATION') return no('WRONG_PHASE', "Aucune phase d'activation en cours.");
  if (state.turn.activePlayerId !== playerId) {
    return no('NOT_YOUR_TURN', `Ce n'est pas au joueur ${playerId} d'agir.`);
  }
  return null;
}

/** Conditions de SELECT_CHARACTER (partagées avec `getLegalActions`). */
export function checkSelectCharacter(state: GameState, playerId: PlayerId, characterId: string): TurnCheck<{ character: CharacterState }> {
  const refused = checkActivationPhase(state, playerId);
  if (refused) return refused;
  if (state.turn.activeCharacterId !== undefined) {
    return no('ACTIVATION_IN_PROGRESS', 'Une activation est déjà en cours.');
  }
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return no('UNKNOWN_CHARACTER', `Personnage inconnu : ${characterId}.`);
  if (character.playerId !== playerId) {
    return no('NOT_YOUR_CHARACTER', `Le personnage ${character.id} n'appartient pas au joueur ${playerId}.`);
  }
  if (!character.alive) return no('CHARACTER_DEAD', `Le personnage ${character.id} est hors de combat.`);
  // Placé en Overwatch ce tour-ci (marqué `activated`) : non activable.
  if (character.activated && character.overwatch) {
    return no('IN_OVERWATCH', `Impossible : le personnage ${character.id} est en Overwatch ce tour-ci.`);
  }
  if (character.activated) {
    return no('ALREADY_ACTIVATED', `Le personnage ${character.id} a déjà été activé ce tour.`);
  }
  return { ok: true, character };
}

registerHandler('SELECT_CHARACTER', (state, command) => {
  const checked = checkSelectCharacter(state, command.playerId, command.characterId);
  if (!checked.ok) return { ok: false, errors: [checked.error] };
  const { character } = checked;
  return {
    ok: true,
    events: [{ type: 'CHARACTER_ACTIVATION_STARTED', characterId: character.id }],
    state: {
      ...state,
      characters: state.characters.map((c) => (c.id === character.id ? { ...c, activated: true } : c)),
      turn: { ...turnWithoutActivation(state.turn, state.turn.activePlayerId), activeCharacterId: character.id },
    },
  };
});

/** Conditions de END_TURN (fin d'activation), partagées avec `getLegalActions`. */
export function checkEndActivation(state: GameState, playerId: PlayerId): TurnCheck<{ characterId: string }> {
  const refused = checkActivationPhase(state, playerId);
  if (refused) return refused;
  const characterId = state.turn.activeCharacterId;
  if (characterId === undefined) return no('NO_ACTIVE_CHARACTER', 'Aucune activation en cours à terminer.');
  return { ok: true, characterId };
}

/** END_TURN : fin de l'activation du personnage en cours (le tour entier se termine quand tous ont été activés). */
registerHandler('END_TURN', (state, command, rng) => {
  const checked = checkEndActivation(state, command.playerId);
  if (!checked.ok) return { ok: false, errors: [checked.error] };
  const events: GameEvent[] = [{ type: 'CHARACTER_ACTIVATION_ENDED', characterId: checked.characterId }];
  return { ok: true, events, state: advance(state, events, rng) };
});

/** Conditions de PASS, partagées avec `getLegalActions`. */
export function checkPass(state: GameState, playerId: PlayerId): TurnCheck {
  const refused = checkActivationPhase(state, playerId);
  if (refused) return refused;
  if (state.turn.activeCharacterId !== undefined) {
    return no('ACTIVATION_IN_PROGRESS', "Terminez l'activation en cours avant de passer.");
  }
  return { ok: true };
}

/**
 * PASS : le joueur renonce à toutes ses activations restantes pour ce tour
 * (ses personnages non activés sont marqués activés). Voir OQ-TURN-005.
 */
registerHandler('PASS', (state, command, rng) => {
  const checked = checkPass(state, command.playerId);
  if (!checked.ok) return { ok: false, errors: [checked.error] };
  const events: GameEvent[] = [{ type: 'PLAYER_PASSED', playerId: command.playerId }];
  const passed: GameState = {
    ...state,
    characters: state.characters.map((c) =>
      c.playerId === command.playerId && c.alive && !c.activated ? { ...c, activated: true } : c,
    ),
  };
  return { ok: true, events, state: advance(passed, events, rng) };
});

/**
 * REROLL_INITIATIVE : le gagnant de l'initiative dépense 1 PC pour relancer, pendant la phase OVERWATCH et avant
 * toute décision, placement ou passe (OQ-TURN-006). Le nouveau gagnant décide alors en premier.
 */
registerHandler('REROLL_INITIATIVE', (state, command, rng) => {
  if (state.phase !== 'OVERWATCH') {
    return reject('WRONG_PHASE', "L'initiative ne peut être relancée que dans la phase Overwatch, avant toute décision.");
  }
  const previousWinnerId = state.turn.initiativePlayerId;
  if (previousWinnerId !== command.playerId) {
    return reject('NOT_INITIATIVE_WINNER', 'Seul le gagnant de l\'initiative peut la relancer.');
  }
  if ((state.turn.overwatchDecisions ?? 0) > 0) {
    return reject('OVERWATCH_DECISIONS_STARTED', "L'initiative ne peut plus être relancée : un placement ou une passe d'Overwatch a eu lieu.");
  }
  const spent = CommandPointService.spend(state, command.playerId, REROLL_INITIATIVE_COST, 'REROLL_INITIATIVE');
  if (!spent.ok) return reject(spent.reason, spent.message);

  const { rolls, winnerId } = rollInitiative(
    spent.state.players.map((p) => p.id),
    rng,
  );
  const events: GameEvent[] = [spent.event, { type: 'INITIATIVE_ROLLED', rolls, winnerId }];
  if (winnerId !== previousWinnerId) events.push({ type: 'INITIATIVE_CHANGED', previousWinnerId, winnerId });

  const rerolled: GameState = {
    ...spent.state,
    turn: { number: state.turn.number, initiativePlayerId: winnerId, activePlayerId: winnerId, overwatchPasses: 0, overwatchDecisions: 0 },
  };
  return { ok: true, events, state: settleOverwatchPhase(rerolled, events, rng) };
});