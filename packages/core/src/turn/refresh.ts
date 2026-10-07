import type { GameEvent } from '../events/events';
import { currentStats, type ActiveEffect, type GameState } from '../state/types';

export interface RefreshResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * Refresh de début de tour (§66.1) :
 * - PC de chaque joueur remis à `config.commandPointsPerTurn` (les PC non dépensés sont perdus) ;
 * - personnages vivants : `activated` remis à faux, `movementLeft` selon leur ligne de stats courante ;
 *   l'Overwatch est retiré ici (décision du PO, OQ-OVERWATCH-006) : un Overwatch non tiré dure tout le tour ;
 * - effets SMOKE décrémentés ; ceux qui arrivent à 0 sont retirés (SMOKE_EXPIRED).
 */
export function refreshTurn(state: GameState): RefreshResult {
  const events: GameEvent[] = [];
  const amount = state.config.commandPointsPerTurn;

  const players = state.players.map((p) => ({ ...p, commandPoints: amount }));
  for (const p of players) events.push({ type: 'COMMAND_POINTS_REFRESHED', playerId: p.id, amount });

  const characters = state.characters.map((c) =>
    c.alive ? { ...c, activated: false, overwatch: false, movementLeft: currentStats(c).movement } : c,
  );

  const effects: ActiveEffect[] = [];
  for (const effect of state.effects) {
    const remainingTurns = effect.remainingTurns - 1;
    if (remainingTurns <= 0) {
      events.push({ type: 'SMOKE_EXPIRED', effectId: effect.id, origin: effect.origin });
    } else {
      effects.push({ ...effect, remainingTurns });
    }
  }

  return { state: { ...state, players, characters, effects }, events };
}
