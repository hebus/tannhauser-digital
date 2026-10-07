import type { GameEvent } from '../events/events';
import type { RandomSource } from '../rng/rng';
import type { GameState, PlayerId } from '../state/types';
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

/**
 * Démarre le tour `turnNumber` : TURN_STARTED, refresh, initiative.
 * Le joueur d'initiative commence (ou, s'il n'a rien à activer, le suivant dans l'ordre).
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

  const winnerIndex = refreshed.state.players.findIndex((p) => p.id === winnerId);
  const activePlayerId = nextPlayerWithActivation(refreshed.state, winnerIndex) ?? winnerId;

  return {
    events,
    state: {
      ...refreshed.state,
      phase: 'ACTIVATION',
      turn: { number: turnNumber, initiativePlayerId: winnerId, activePlayerId },
    },
  };
}
