import type { NodeId } from '../board/types';
import type { GameEvent } from '../events/events';
import type { GameState, CharacterState } from '../state/types';
import { currentStats, DEFAULT_GAME_CONFIG } from '../state/types';
import type { RandomSource } from '../rng/rng';
import { DEATHMATCH_REASON, deathmatchWinner } from '../victory/deathmatch';
import { buildPoolLog, type CombatLog, type DefenseRollLog } from './log';
import { combineModifiers, resolveCharacteristicTest } from './test';
import type { WeaponDefinition } from './weapons';

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
  const attackMods = combineModifiers(
    { extraDice: weapon.extraDice, resultModifier: weapon.resultModifier, autoSuccesses: weapon.autoSuccesses },
    ...nodeMods(attacker.nodeId, 'OCCUPANT', 'ATTACKER').map((m) => ({ extraDice: m.extraDice, resultModifier: m.resultModifier })),
  );
  const attack = resolveCharacteristicTest(stats.combat, weapon.dice, attackMods, rng);
  const wounds = attack.successes;

  // Défense : uniquement s'il y a des blessures à parer.
  const physical = currentStats(target).physical;
  let defenseRoll: DefenseRollLog | null = null;
  let parried = 0;
  const events: GameEvent[] = [];
  if (wounds >= 1 && physical > 0) {
    const defenseMods = combineModifiers(
      ...nodeMods(target.nodeId, 'OCCUPANT', 'DEFENDER').map((m) => ({ extraDice: m.extraDice, resultModifier: m.resultModifier })),
    );
    const poolSize = state.config?.defensePoolSize ?? DEFAULT_GAME_CONFIG.defensePoolSize;
    const defense = resolveCharacteristicTest(physical, poolSize, defenseMods, rng);
    parried = defense.successes;
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
  if (defeated) events.push({ type: 'CHARACTER_DEFEATED', characterId: target.id });

  const winnerId = deathmatchWinner(next);
  if (winnerId !== null) {
    next = { ...next, phase: 'FINISHED', victory: { winnerId, reason: DEATHMATCH_REASON } };
    events.push({ type: 'VICTORY', winnerId, reason: DEATHMATCH_REASON });
  }
  return { state: next, events };
}
