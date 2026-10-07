import type { DuelOutcome } from './duel';
import type { DieResult, TestResult } from './test';

/** Journal de combat structuré (§85) : base + bonus − pénalités → jet → succès → défense → blessures. */
export interface CombatLog {
  readonly attackerId: string;
  readonly targetId: string;
  readonly weaponId: string;
  readonly combatValue: number;
  readonly difficulty: number;
  readonly basePool: number;
  readonly bonusDice: number;
  readonly penaltyDice: number;
  readonly poolSize: number;
  readonly resultModifier: number;
  readonly dice: readonly DieResult[];
  readonly rolledSuccesses: number;
  readonly autoSuccesses: number;
  readonly autoFailure: boolean;
  readonly successes: number;
  /** Défense (Duel) : `null` quand l'attaque n'ouvre pas de Duel (voir OQ-COMBAT-002). */
  readonly defense: DuelOutcome | null;
  readonly hit: boolean;
  readonly wounds: number;
  readonly healthBefore: number;
  readonly healthAfter: number;
  readonly defeated: boolean;
}

export type PoolLog = Pick<
  CombatLog,
  | 'difficulty'
  | 'basePool'
  | 'bonusDice'
  | 'penaltyDice'
  | 'poolSize'
  | 'resultModifier'
  | 'dice'
  | 'rolledSuccesses'
  | 'autoSuccesses'
  | 'autoFailure'
  | 'successes'
>;

export function buildPoolLog(test: TestResult): PoolLog {
  return {
    difficulty: test.difficulty,
    basePool: test.basePool,
    bonusDice: Math.max(0, test.extraDice),
    penaltyDice: Math.max(0, -test.extraDice),
    poolSize: test.poolSize,
    resultModifier: test.resultModifier,
    dice: test.dice,
    rolledSuccesses: test.rolledSuccesses,
    autoSuccesses: test.autoSuccesses,
    autoFailure: test.autoFailure,
    successes: test.successes,
  };
}

const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${-n}`);

const OUTCOME_LABEL: Record<DieResult['outcome'], string> = {
  NATURAL_10: '10 naturel : succès',
  NATURAL_1: '1 naturel : échec',
  SUCCESS: 'succès',
  FAILURE: 'échec',
};

/** Rend le journal en lignes lisibles (français), une étape par ligne. */
export function explainCombat(log: CombatLog): string[] {
  const lines: string[] = [];
  lines.push(`${log.attackerId} attaque ${log.targetId} avec ${log.weaponId}.`);
  lines.push(
    `Réserve : ${log.basePool} (arme) + ${log.bonusDice} (bonus) − ${log.penaltyDice} (pénalités) = ${log.poolSize} dé(s).`,
  );
  lines.push(`Difficulté : 10 − Combat ${log.combatValue} = ${log.difficulty}.`);
  if (log.resultModifier !== 0) lines.push(`Modificateur de résultat : ${signed(log.resultModifier)}.`);
  log.dice.forEach((d, i) => {
    const mod = log.resultModifier !== 0 ? ` (${d.natural}${signed(log.resultModifier)} = ${d.modified})` : '';
    lines.push(`Dé ${i + 1} : ${d.natural}${mod} → ${OUTCOME_LABEL[d.outcome]}.`);
  });
  lines.push(
    `Succès : ${log.rolledSuccesses} tiré(s) + ${log.autoSuccesses} automatique(s)` +
      (log.autoFailure ? ' ; échec automatique : 0 succès' : '') +
      ` = ${log.successes}.`,
  );
  if (log.defense) {
    lines.push(
      `Défense : ${log.defense.defenderSuccesses} succès annulent ${log.defense.attackerSuccesses} → reste ${log.defense.remaining}.`,
    );
  }
  lines.push(log.hit ? 'Résultat : touché.' : 'Résultat : manqué.');
  if (log.hit) {
    lines.push(
      `Blessures : ${log.wounds} (santé ${log.healthBefore} → ${log.healthAfter})` + (log.defeated ? ' ; mis hors de combat.' : '.'),
    );
  }
  return lines;
}
