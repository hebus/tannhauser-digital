import type { RandomSource } from '../rng/rng';
import { resolveCharacteristicTest, type TestModifiers, type TestResult } from './test';

export interface DuelOutcome {
  readonly attackerSuccesses: number;
  readonly defenderSuccesses: number;
  /** Succès restants à l'attaquant après annulation (jamais négatif). */
  readonly remaining: number;
  readonly attackerWins: boolean;
}

/**
 * Duel (§71.4) : chaque succès du défenseur annule un succès de l'attaquant ;
 * l'attaquant gagne s'il lui reste au moins 1 succès.
 */
export function resolveDuel(attacker: TestResult, defender: TestResult): DuelOutcome {
  const remaining = Math.max(0, attacker.successes - defender.successes);
  return {
    attackerSuccesses: attacker.successes,
    defenderSuccesses: defender.successes,
    remaining,
    attackerWins: remaining >= 1,
  };
}

export interface DuelSide {
  readonly characteristic: number;
  readonly pool: number;
  readonly modifiers?: TestModifiers;
}

/** Lance les deux réserves (attaquant d'abord) puis résout le Duel. */
export function rollDuel(
  attacker: DuelSide,
  defender: DuelSide,
  rng: RandomSource,
): { readonly attacker: TestResult; readonly defender: TestResult; readonly outcome: DuelOutcome } {
  const a = resolveCharacteristicTest(attacker.characteristic, attacker.pool, attacker.modifiers ?? {}, rng);
  const d = resolveCharacteristicTest(defender.characteristic, defender.pool, defender.modifiers ?? {}, rng);
  return { attacker: a, defender: d, outcome: resolveDuel(a, d) };
}
