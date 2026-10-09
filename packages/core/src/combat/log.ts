import type { EquipmentEffect } from '../equipment/effects';
import type { DuelOutcome } from './duel';
import type { DieResult, TestResult } from './test';

/** Effet d'équipement qui a réellement joué dans un jet (et non simplement possédé), pour le journal. */
export interface AppliedEffect {
  readonly type: EquipmentEffect['type'];
  /** Jet concerné. */
  readonly side: 'ATTACK' | 'DEFENSE';
  /** Personnage qui en bénéficie. */
  readonly characterId: string;
}

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
  /** Jet de défense (Physique) : `null` si aucune défense possible (Physique à 0). */
  readonly defenseRoll: DefenseRollLog | null;
  readonly hit: boolean;
  readonly wounds: number;
  readonly healthBefore: number;
  readonly healthAfter: number;
  readonly defeated: boolean;
  /** Effets d'équipement appliqués à cet échange (absent = aucun). */
  readonly effects?: readonly AppliedEffect[];
}

export interface DefenseRollLog {
  readonly defenderId: string;
  readonly physicalValue: number;
  readonly difficulty: number;
  readonly poolSize: number;
  readonly dice: readonly DieResult[];
  readonly successes: number;
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

/** Précisions sur un dé issu d'un effet d'équipement (relance, dé supplémentaire, succès doublé). */
function dieNotes(d: DieResult): string {
  const notes: string[] = [];
  if (d.rerolledFrom !== undefined) notes.push(`relancé, avant : ${d.rerolledFrom}`);
  if (d.bonus) notes.push('dé supplémentaire');
  if (d.success && (d.weight ?? 1) > 1) notes.push(`compte pour ${d.weight} succès`);
  return notes.length > 0 ? ` (${notes.join(' ; ')})` : '';
}

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
    lines.push(`Dé ${i + 1} : ${d.natural}${mod} → ${OUTCOME_LABEL[d.outcome]}${dieNotes(d)}.`);
  });
  lines.push(
    `Succès : ${log.rolledSuccesses} tiré(s) + ${log.autoSuccesses} automatique(s)` +
      (log.autoFailure ? ' ; échec automatique : 0 succès' : '') +
      ` = ${log.successes}.`,
  );
  lines.push(log.successes >= 1 ? `Blessures infligées par l'attaque : ${log.successes}.` : 'Aucune blessure : attaque manquée.');
  if (log.defenseRoll) {
    const r = log.defenseRoll;
    lines.push(`Défense de ${r.defenderId} : Physique ${r.physicalValue}, difficulté ${r.difficulty}, ${r.poolSize} dé(s).`);
    r.dice.forEach((d, i) => lines.push(`Dé de défense ${i + 1} : ${d.natural} → ${OUTCOME_LABEL[d.outcome]}${dieNotes(d)}.`));
  }
  if (log.defense) {
    lines.push(`Parades : ${log.defense.defenderSuccesses} sur ${log.defense.attackerSuccesses} blessure(s) → ${log.defense.remaining} non parée(s).`);
  }
  if (log.wounds > 0) {
    lines.push(
      `Dégâts : ${log.wounds} (santé ${log.healthBefore} → ${log.healthAfter})` + (log.defeated ? ' ; mis hors de combat.' : '.'),
    );
  } else if (log.successes >= 1) {
    lines.push('Toutes les blessures sont parées : aucun dégât.');
  }
  return lines;
}
