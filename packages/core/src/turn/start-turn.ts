import type { GameEvent } from '../events/events';
import type { RandomSource } from '../rng/rng';
import type { GameState, PlayerId, TurnState } from '../state/types';
import { rollInitiative } from './initiative';
import { refreshTurn } from './refresh';

/** Premier joueur, à partir de l'indice `fromIndex` (inclus, ordre cyclique des joueurs), ayant encore un personnage à activer. */
export function nextPlayerWithActivation(state: GameState, fromIndex: number): PlayerId | null {
  const n = state.players.length;
  for (let i = 0; i < n; i += 1) {
    const player = state.players[(fromIndex + i) % n]!;
    if (state.characters.some((c) => c.playerId === player.id && c.alive && !c.activated)) return player.id;
  }
  return null;
}

/** Copie du tour sans activation en cours (ni action, réaction, refus d'attaque d'opportunité, ni compteurs de la phase OVERWATCH). */
export function turnWithoutActivation(turn: TurnState, activePlayerId: PlayerId | null): TurnState {
  return {
    number: turn.number,
    initiativePlayerId: turn.initiativePlayerId,
    activePlayerId,
  };
}

/**
 * Démarre le tour `turnNumber` : TURN_STARTED, refresh (PC, fin des Overwatch), initiative, puis phase OVERWATCH
 * (un personnage par décision, avant les activations). Le gagnant de l'initiative décide en premier, puis les
 * joueurs alternent jusqu'à ce que tous passent consécutivement.
 */
export function startTurn(
  state: GameState,
  turnNumber: number,
  rng: RandomSource,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const events: GameEvent[] = [{ type: 'TURN_STARTED', turn: turnNumber }];
  const refreshed = refreshTurn(state);
  events.push(...refreshed.events);

  const { rolls, winnerId } = rollInitiative(
    refreshed.state.players.map((p) => p.id),
    rng,
  );
  events.push({ type: 'INITIATIVE_ROLLED', rolls, winnerId });

  return {
    events,
    state: {
      ...refreshed.state,
      phase: 'OVERWATCH',
      turn: { number: turnNumber, initiativePlayerId: winnerId, activePlayerId: winnerId, overwatchPasses: 0, overwatchDecisions: 0 },
    },
  };
}

/**
 * Fin de la phase d'Overwatch (deux passes consécutives) : ouvre les activations (le joueur d'initiative, ou le suivant s'il n'a rien à
 * activer) ; si plus aucun personnage n'est activable, le tour se termine aussitôt.
 */
export function beginActivations(state: GameState, events: GameEvent[], rng: RandomSource): GameState {
  const initiativeIndex = Math.max(0, state.players.findIndex((p) => p.id === state.turn.initiativePlayerId));
  const first = nextPlayerWithActivation(state, initiativeIndex);
  if (first === null) {
    events.push({ type: 'TURN_ENDED', turn: state.turn.number });
    const started = startTurn(state, state.turn.number + 1, rng);
    events.push(...started.events);
    return started.state;
  }
  return { ...state, phase: 'ACTIVATION', turn: turnWithoutActivation(state.turn, first) };
}