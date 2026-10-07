import type { RandomSource } from '../rng/rng';

/** Difficulté de base : 10 − caractéristique courante (§71.1). */
export const DIFFICULTY_BASE = 10;
/** Taille de réserve par défaut d'un Test (§71.1). */
export const DEFAULT_TEST_POOL = 4;

/**
 * Modificateurs d'un Test (§71.3). Les quatre natures sont volontairement distinctes :
 * - `extraDice`      : dés supplémentaires (négatif = dés retirés) ;
 * - `resultModifier` : modificateur appliqué à chaque résultat de dé, APRÈS les 1/10 naturels ;
 * - `autoSuccesses`  : succès automatiques, ajoutés aux succès tirés ;
 * - `autoFailure`    : échec automatique, le Test échoue quoi qu'il arrive (prioritaire).
 */
export interface TestModifiers {
  readonly extraDice?: number;
  readonly resultModifier?: number;
  readonly autoSuccesses?: number;
  readonly autoFailure?: boolean;
}

export type DieOutcome = 'NATURAL_10' | 'NATURAL_1' | 'SUCCESS' | 'FAILURE';

export interface DieResult {
  /** Résultat naturel (avant modificateur). */
  readonly natural: number;
  /** Résultat après modificateur de résultat (informatif pour les 1/10 naturels). */
  readonly modified: number;
  readonly success: boolean;
  readonly outcome: DieOutcome;
}

export interface TestResult {
  readonly impossible: boolean;
  readonly difficulty: number;
  readonly basePool: number;
  readonly extraDice: number;
  /** Nombre de dés réellement lancés (jamais négatif). */
  readonly poolSize: number;
  readonly resultModifier: number;
  readonly dice: readonly DieResult[];
  readonly rolledSuccesses: number;
  readonly autoSuccesses: number;
  readonly autoFailure: boolean;
  /** Succès totaux (0 si échec automatique). */
  readonly successes: number;
  /** Au moins un succès. */
  readonly success: boolean;
}

/** Cumule plusieurs sources de modificateurs (somme, OU pour l'échec automatique). */
export function combineModifiers(...list: readonly (TestModifiers | undefined)[]): Required<TestModifiers> {
  const out = { extraDice: 0, resultModifier: 0, autoSuccesses: 0, autoFailure: false };
  for (const m of list) {
    if (!m) continue;
    out.extraDice += m.extraDice ?? 0;
    out.resultModifier += m.resultModifier ?? 0;
    out.autoSuccesses += m.autoSuccesses ?? 0;
    out.autoFailure ||= m.autoFailure ?? false;
  }
  return out;
}

/** Difficulté pour une caractéristique ; `null` si la caractéristique est nulle (§65.2 : Test impossible). */
export function difficultyFor(characteristic: number): number | null {
  if (!Number.isFinite(characteristic) || characteristic <= 0) return null;
  return DIFFICULTY_BASE - characteristic;
}

/**
 * Résout un Test (§71.1-71.3). Pure hormis la consommation de `rng`.
 *
 * 10 naturel = succès, 1 naturel = jamais succès (tous deux AVANT modificateurs) ;
 * sinon succès si (dé + modificateur de résultat) ≥ difficulté.
 * Le détail par dé alimente le journal de combat.
 */
export function resolveTest(
  pool: number,
  difficulty: number,
  modifiers: TestModifiers,
  rng: RandomSource,
): TestResult {
  const m = combineModifiers(modifiers);
  const basePool = Math.max(0, Math.trunc(pool));
  const poolSize = Math.max(0, basePool + Math.trunc(m.extraDice));
  const dice: DieResult[] = [];
  for (let i = 0; i < poolSize; i += 1) {
    const natural = rng.nextInt(1, 10);
    const modified = natural + m.resultModifier;
    let outcome: DieOutcome;
    if (natural === 10) outcome = 'NATURAL_10';
    else if (natural === 1) outcome = 'NATURAL_1';
    else outcome = modified >= difficulty ? 'SUCCESS' : 'FAILURE';
    dice.push({ natural, modified, success: outcome === 'NATURAL_10' || outcome === 'SUCCESS', outcome });
  }
  const rolledSuccesses = dice.filter((d) => d.success).length;
  const autoSuccesses = Math.max(0, Math.trunc(m.autoSuccesses));
  const successes = m.autoFailure ? 0 : rolledSuccesses + autoSuccesses;
  return {
    impossible: false,
    difficulty,
    basePool,
    extraDice: Math.trunc(m.extraDice),
    poolSize,
    resultModifier: m.resultModifier,
    dice,
    rolledSuccesses,
    autoSuccesses,
    autoFailure: m.autoFailure,
    successes,
    success: successes >= 1,
  };
}

/** Test basé sur une caractéristique : impossible (aucun dé tiré) si elle vaut 0 (§65.2). */
export function resolveCharacteristicTest(
  characteristic: number,
  pool: number,
  modifiers: TestModifiers,
  rng: RandomSource,
): TestResult {
  const difficulty = difficultyFor(characteristic);
  if (difficulty === null) {
    return {
      impossible: true,
      difficulty: DIFFICULTY_BASE,
      basePool: Math.max(0, Math.trunc(pool)),
      extraDice: 0,
      poolSize: 0,
      resultModifier: 0,
      dice: [],
      rolledSuccesses: 0,
      autoSuccesses: 0,
      autoFailure: false,
      successes: 0,
      success: false,
    };
  }
  return resolveTest(pool, difficulty, modifiers, rng);
}
