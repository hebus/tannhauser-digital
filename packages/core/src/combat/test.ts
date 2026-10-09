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

/**
 * Règles d'effet d'un Test (équipements). Toutes optionnelles : sans elles, le Test est celui des règles de base.
 * Ordre d'application : lancer de la réserve, puis relances, puis dés supplémentaires sur 10 naturel.
 */
export interface TestRules {
  /** Succès comptés par un 10 naturel (défaut 1). */
  readonly naturalTenSuccesses?: number;
  /** Relance une fois les N dés ratés de plus basse valeur (les 1 naturels sont relançables). */
  readonly rerollLowest?: number;
  /** Si au moins un 10 naturel est présent après les relances : lance ce nombre de dés de plus (sans enchaînement). */
  readonly extraDiceOnNaturalTen?: number;
}

export type DieOutcome = 'NATURAL_10' | 'NATURAL_1' | 'SUCCESS' | 'FAILURE';

export interface DieResult {
  /** Résultat naturel (avant modificateur). */
  readonly natural: number;
  /** Résultat après modificateur de résultat (informatif pour les 1/10 naturels). */
  readonly modified: number;
  readonly success: boolean;
  readonly outcome: DieOutcome;
  /** Nombre de succès que compte ce dé s'il réussit (absent = 1 ; 2 pour un 10 naturel avec Coup critique). */
  readonly weight?: number;
  /** Résultat naturel avant relance, si le dé a été relancé. */
  readonly rerolledFrom?: number;
  /** Dé supplémentaire gagné par un effet (ex. 10 naturel du Flash-Gun). */
  readonly bonus?: boolean;
}

export interface TestResult {
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

/** Difficulté pour une caractéristique : 10 − valeur (jamais négative : 0 donne 10, il faut des 10 naturels). */
export function difficultyFor(characteristic: number): number {
  return DIFFICULTY_BASE - (Number.isFinite(characteristic) ? Math.max(0, characteristic) : 0);
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
  rules: TestRules = {},
): TestResult {
  const m = combineModifiers(modifiers);
  const basePool = Math.max(0, Math.trunc(pool));
  const poolSize = Math.max(0, basePool + Math.trunc(m.extraDice));
  const tenWeight = Math.max(1, Math.trunc(rules.naturalTenSuccesses ?? 1));
  const rollDie = (extra: Pick<DieResult, 'rerolledFrom' | 'bonus'> = {}): DieResult => {
    const natural = rng.nextInt(1, 10);
    const modified = natural + m.resultModifier;
    let outcome: DieOutcome;
    if (natural === 10) outcome = 'NATURAL_10';
    else if (natural === 1) outcome = 'NATURAL_1';
    else outcome = modified >= difficulty ? 'SUCCESS' : 'FAILURE';
    return {
      natural,
      modified,
      success: outcome === 'NATURAL_10' || outcome === 'SUCCESS',
      outcome,
      ...(outcome === 'NATURAL_10' && tenWeight > 1 ? { weight: tenWeight } : {}),
      ...extra,
    };
  };
  const dice: DieResult[] = [];
  for (let i = 0; i < poolSize; i += 1) dice.push(rollDie());

  // Relances : les dés ratés de plus basse valeur (un dé réussi n'est jamais relancé : ce serait perdre au change).
  const rerolls = Math.max(0, Math.trunc(rules.rerollLowest ?? 0));
  if (rerolls > 0) {
    const lowestFailures = dice
      .map((die, index) => ({ die, index }))
      .filter(({ die }) => !die.success)
      .sort((a, b) => a.die.natural - b.die.natural || a.index - b.index)
      .slice(0, rerolls)
      .sort((a, b) => a.index - b.index);
    for (const { die, index } of lowestFailures) dice[index] = rollDie({ rerolledFrom: die.natural });
  }

  // Dés supplémentaires déclenchés par un 10 naturel (une seule fois, sans enchaînement).
  const bonusDice = Math.max(0, Math.trunc(rules.extraDiceOnNaturalTen ?? 0));
  if (bonusDice > 0 && dice.some((d) => d.natural === 10)) {
    for (let i = 0; i < bonusDice; i += 1) dice.push(rollDie({ bonus: true }));
  }
  const rolledSuccesses = dice.reduce((sum, d) => sum + (d.success ? (d.weight ?? 1) : 0), 0);
  const autoSuccesses = Math.max(0, Math.trunc(m.autoSuccesses));
  const successes = m.autoFailure ? 0 : rolledSuccesses + autoSuccesses;
  return {
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

/** Test basé sur une caractéristique : la valeur abaisse la difficulté ; à 0 on lance quand même la réserve. */
export function resolveCharacteristicTest(
  characteristic: number,
  pool: number,
  modifiers: TestModifiers,
  rng: RandomSource,
  rules: TestRules = {},
): TestResult {
  return resolveTest(pool, difficultyFor(characteristic), modifiers, rng, rules);
}
