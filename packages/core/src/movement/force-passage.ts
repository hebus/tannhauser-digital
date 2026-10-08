import { rollDuel, type DuelOutcome } from '../combat/duel';
import { DEFAULT_TEST_POOL, type TestResult } from '../combat/test';
import type { RandomSource } from '../rng/rng';
import { currentStats, type CharacterState, type GameState } from '../state/types';

/** Le personnage actif a déjà tenté un passage en force pendant cette activation (réussi ou non). */
export function forcePassageUsed(state: GameState): boolean {
  return state.turn.forcePassageUsed === true;
}

export interface ForcePassageResult {
  readonly attacker: TestResult;
  readonly defender: TestResult;
  readonly outcome: DuelOutcome;
}

/**
 * Passage en force (bull rush) : duel de Physique. Chacun lance 4 dés, difficulté = 10 − Physique ; chaque succès du
 * défenseur annule un succès de l'initiateur, qui doit en conserver au moins 1 pour traverser (`outcome.attackerWins`).
 */
export function resolveForcePassage(mover: CharacterState, enemy: CharacterState, rng: RandomSource): ForcePassageResult {
  return rollDuel(
    { characteristic: currentStats(mover).physical, pool: DEFAULT_TEST_POOL },
    { characteristic: currentStats(enemy).physical, pool: DEFAULT_TEST_POOL },
    rng,
  );
}
