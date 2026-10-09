import type { NodeId } from '../board/types';
import type { GameEvent } from '../events/events';
import type { GameState, CharacterState } from '../state/types';
import { baseStats, currentStats, DEFAULT_GAME_CONFIG } from '../state/types';
import type { RandomSource } from '../rng/rng';
import { attackEffects, characterEffects, type EquipmentEffect } from '../equipment/effects';
import { dropFlags } from '../flags/state';
import { DEATHMATCH_REASON, deathmatchWinner } from '../victory/deathmatch';
import { buildPoolLog, type AppliedEffect, type CombatLog, type DefenseRollLog } from './log';
import { combineModifiers, resolveCharacteristicTest, type TestRules } from './test';
import type { DieResult } from './test';
import type { WeaponDefinition } from './weapons';

const sumOf = (effects: readonly EquipmentEffect[], pick: (e: EquipmentEffect) => number): number => effects.reduce((n, e) => n + pick(e), 0);

/** Règles de jet d'une attaque, issues des effets du porteur et de l'arme (Coup critique, relances, dés sur 10 naturel). */
function attackRules(effects: readonly EquipmentEffect[]): TestRules {
  return {
    naturalTenSuccesses: effects.some((e) => e.type === 'CRITICAL_HIT') ? 2 : 1,
    rerollLowest: sumOf(effects, (e) => (e.type === 'REROLL_LOWEST' ? e.count : 0)),
    extraDiceOnNaturalTen: sumOf(effects, (e) => (e.type === 'EXTRA_DICE_ON_NATURAL_10' ? e.dice : 0)),
  };
}

/** Défense : seul le Coup critique s'applique (les relances et dés bonus sont propres à l'attaque). */
function defenseRules(effects: readonly EquipmentEffect[]): TestRules {
  return { naturalTenSuccesses: effects.some((e) => e.type === 'CRITICAL_HIT') ? 2 : 1 };
}

/** Effets qui ont réellement joué : un Coup critique sans 10 naturel, ou une relance sans dé raté, n'apparaît pas au journal. */
function appliedEffects(
  attacker: CharacterState,
  target: CharacterState,
  effects: readonly EquipmentEffect[],
  hardwareDice: number,
  attackDice: readonly DieResult[],
  defenseDice: readonly DieResult[],
): AppliedEffect[] {
  const out: AppliedEffect[] = [];
  const critical = (dice: readonly DieResult[]): boolean => dice.some((d) => (d.weight ?? 1) > 1);
  const add = (type: AppliedEffect['type'], side: AppliedEffect['side'], characterId: string): void => {
    out.push({ type, side, characterId });
  };
  const has = (type: EquipmentEffect['type']): boolean => effects.some((e) => e.type === type);
  if (currentStats(attacker).combat > baseStats(attacker).combat) add('BEST_CHARACTERISTIC', 'ATTACK', attacker.id);
  if (hardwareDice > 0) add('EXTRA_DICE_WITH_WEAPON', 'ATTACK', attacker.id);
  if (has('REROLL_LOWEST') && attackDice.some((d) => d.rerolledFrom !== undefined)) add('REROLL_LOWEST', 'ATTACK', attacker.id);
  if (has('CRITICAL_HIT') && critical(attackDice)) add('CRITICAL_HIT', 'ATTACK', attacker.id);
  if (has('EXTRA_DICE_ON_NATURAL_10') && attackDice.some((d) => d.bonus)) add('EXTRA_DICE_ON_NATURAL_10', 'ATTACK', attacker.id);
  if (defenseDice.length > 0) {
    if (currentStats(target).physical > baseStats(target).physical) add('BEST_CHARACTERISTIC', 'DEFENSE', target.id);
    if (characterEffects(target).some((e) => e.type === 'CRITICAL_HIT') && critical(defenseDice)) add('CRITICAL_HIT', 'DEFENSE', target.id);
  }
  return out;
}

/**
 * Échange d'attaque (décision du product owner) :
 * 1. l'attaquant jette son pool ; difficulté = 10 − Combat ; chaque succès = une blessure ;
 * 2. le défenseur jette sa défense ; difficulté = 10 − Physique ; chaque succès annule une blessure ;
 * 3. chaque blessure non parée inflige 1 dégât (−1 santé).
 * Ne vérifie PAS les conditions de ciblage ni d'activation : l'appelant s'en charge.
 */
export function resolveAttackExchange(
  state: GameState,
  attacker: CharacterState,
  target: CharacterState,
  weapon: WeaponDefinition,
  rng: RandomSource,
): { state: GameState; events: GameEvent[] } {
  const stats = currentStats(attacker);

  const nodeMods = (nodeId: NodeId, ...roles: string[]) =>
    (state.board.nodes[nodeId]?.properties.modifiers ?? []).filter((m) => roles.includes(m.applies));
  const effects = attackEffects(attacker, weapon);
  // Matériel lié à une arme (ex. BA-27 avec le Flash machine gun) : dés supplémentaires quand on attaque avec elle.
  const hardwareDice = sumOf(effects, (e) => (e.type === 'EXTRA_DICE_WITH_WEAPON' && e.weaponId === weapon.id ? e.dice : 0));
  const attackMods = combineModifiers(
    { extraDice: (weapon.extraDice ?? 0) + hardwareDice, resultModifier: weapon.resultModifier, autoSuccesses: weapon.autoSuccesses },
    ...nodeMods(attacker.nodeId, 'OCCUPANT', 'ATTACKER').map((m) => ({ extraDice: m.extraDice, resultModifier: m.resultModifier })),
  );
  const attack = resolveCharacteristicTest(stats.combat, weapon.dice, attackMods, rng, attackRules(effects));
  const wounds = attack.successes;

  // Défense : uniquement s'il y a des blessures à parer.
  const physical = currentStats(target).physical;
  let defenseRoll: DefenseRollLog | null = null;
  let parried = 0;
  let defenseDice: readonly DieResult[] = [];
  const events: GameEvent[] = [];
  if (wounds >= 1) {
    const defenseMods = combineModifiers(
      ...nodeMods(target.nodeId, 'OCCUPANT', 'DEFENDER').map((m) => ({ extraDice: m.extraDice, resultModifier: m.resultModifier })),
    );
    const poolSize = state.config?.defensePoolSize ?? DEFAULT_GAME_CONFIG.defensePoolSize;
    const defense = resolveCharacteristicTest(physical, poolSize, defenseMods, rng, defenseRules(characterEffects(target)));
    parried = defense.successes;
    defenseDice = defense.dice;
    defenseRoll = {
      defenderId: target.id,
      physicalValue: physical,
      difficulty: defense.difficulty,
      poolSize: defense.poolSize,
      dice: defense.dice,
      successes: defense.successes,
    };
  }
  const duel = {
    attackerSuccesses: wounds,
    defenderSuccesses: parried,
    remaining: Math.max(0, wounds - parried),
    attackerWins: wounds - parried >= 1,
  };
  const damage = duel.remaining;
  const healthBefore = target.health;
  const healthAfter = Math.max(0, healthBefore - damage);
  const defeated = damage > 0 && healthAfter === 0;

  const applied = appliedEffects(attacker, target, effects, hardwareDice, attack.dice, defenseDice);
  const log: CombatLog = {
    attackerId: attacker.id,
    targetId: target.id,
    weaponId: weapon.id,
    combatValue: stats.combat,
    ...buildPoolLog(attack),
    defense: wounds >= 1 ? duel : null,
    defenseRoll,
    hit: damage > 0,
    wounds: damage,
    healthBefore,
    healthAfter,
    defeated,
    ...(applied.length > 0 ? { effects: applied } : {}),
  };

  events.push(
    { type: 'ATTACK_DECLARED', attackerId: attacker.id, targetId: target.id, weaponId: weapon.id },
    {
      type: 'COMBAT_ROLLED',
      attackerId: attacker.id,
      dice: attack.dice.map((d) => d.natural),
      successes: attack.successes,
      difficulty: attack.difficulty,
      log,
    },
  );
  if (defenseRoll) {
    events.push({
      type: 'DEFENSE_ROLLED',
      defenderId: target.id,
      dice: defenseRoll.dice.map((d) => d.natural),
      successes: defenseRoll.successes,
      difficulty: defenseRoll.difficulty,
    });
  }

  let next = state;
  if (damage === 0) {
    events.push({ type: 'ATTACK_MISSED', attackerId: attacker.id, targetId: target.id });
    return { state: next, events };
  }
  events.push({ type: 'ATTACK_HIT', attackerId: attacker.id, targetId: target.id });
  next = {
    ...next,
    characters: next.characters.map((c) => (c.id === target.id ? { ...c, health: healthAfter, alive: healthAfter > 0 } : c)),
  };
  events.push({ type: 'DAMAGE_APPLIED', targetId: target.id, wounds: damage, healthLeft: healthAfter });
  if (defeated) {
    events.push({ type: 'CHARACTER_DEFEATED', characterId: target.id });
    const dropped = dropFlags(next, target.id);
    next = dropped.state;
    events.push(...dropped.events);
  }

  const winnerId = deathmatchWinner(next);
  if (winnerId !== null) {
    next = { ...next, phase: 'FINISHED', victory: { winnerId, reason: DEATHMATCH_REASON } };
    events.push({ type: 'VICTORY', winnerId, reason: DEATHMATCH_REASON });
  }
  return { state: next, events };
}
