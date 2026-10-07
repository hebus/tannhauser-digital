import type { GameState, PlayerId } from '../state/types';

export const DEATHMATCH_REASON = 'DEATHMATCH_ELIMINATION';

/** Victoire Deathmatch minimale : seul joueur ayant encore un personnage vivant, sinon `null`. */
export function deathmatchWinner(state: GameState): PlayerId | null {
  const alive = new Set(state.characters.filter((c) => c.alive).map((c) => c.playerId));
  if (alive.size !== 1) return null;
  const [winner] = [...alive];
  return winner ?? null;
}
