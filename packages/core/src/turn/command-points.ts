import type { GameEvent } from '../events/events';
import type { GameState, PlayerId } from '../state/types';

/** Raison d'un refus de dépense de PC. */
export type SpendFailureReason = 'UNKNOWN_PLAYER' | 'INVALID_AMOUNT' | 'INSUFFICIENT_COMMAND_POINTS';

export type CanSpendResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SpendFailureReason; readonly message: string };

export type SpendResult =
  | { readonly ok: true; readonly state: GameState; readonly event: GameEvent }
  | { readonly ok: false; readonly reason: SpendFailureReason; readonly message: string };

function canSpend(state: GameState, playerId: PlayerId, amount: number): CanSpendResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: 'UNKNOWN_PLAYER', message: `Joueur inconnu : ${playerId}.` };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, reason: 'INVALID_AMOUNT', message: `Montant de PC invalide : ${amount}.` };
  }
  if (player.commandPoints < amount) {
    return {
      ok: false,
      reason: 'INSUFFICIENT_COMMAND_POINTS',
      message: `PC insuffisants : ${player.commandPoints} disponible(s), ${amount} requis.`,
    };
  }
  return { ok: true };
}

/**
 * Dépense pure de PC (§75) : renvoie un nouvel état et l'événement, ou la raison du refus.
 * `purpose` identifie l'usage (ex. `REROLL_INITIATIVE`) pour la traçabilité.
 */
function spend(state: GameState, playerId: PlayerId, amount: number, purpose: string): SpendResult {
  const check = canSpend(state, playerId, amount);
  if (!check.ok) return check;
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, commandPoints: p.commandPoints - amount } : p,
  );
  const remaining = players.find((p) => p.id === playerId)!.commandPoints;
  return {
    ok: true,
    state: { ...state, players },
    event: { type: 'COMMAND_POINTS_SPENT', playerId, amount, purpose, remaining },
  };
}

/** Service générique de Points de Commande : fonctions pures, aucune règle propre à un usage. */
export const CommandPointService = { canSpend, spend } as const;
