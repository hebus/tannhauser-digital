import { canSee } from '../board/line-of-sight';
import type { BoardState, NodeId } from '../board/types';
import { registerHandler, reject } from '../engine/apply-command';
import type { GameEvent } from '../events/events';
import { currentStats, type CharacterState, type GameState } from '../state/types';
import { DEATHMATCH_REASON, deathmatchWinner } from '../victory/deathmatch';
import { buildPoolLog, type CombatLog } from './log';
import { combineModifiers, resolveCharacteristicTest } from './test';
import type { WeaponDefinition } from './weapons';

/** Blessures par attaque réussie (§72.4 ne lie pas le nombre aux succès : OQ-COMBAT-003). */
export const WOUNDS_PER_HIT = 1;

/** Deux nœuds sont adjacents s'ils sont reliés par une arête (porte ignorée : §70.1, OQ-COMBAT-001). */
export function areAdjacent(board: BoardState, a: NodeId, b: NodeId): boolean {
  return board.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
}

/** Distance en pas sur les arêtes non bloquées par une porte fermée ; `null` si injoignable. */
export function stepDistance(board: BoardState, from: NodeId, to: NodeId): number | null {
  if (from === to) return 0;
  const seen = new Set<NodeId>([from]);
  let frontier: NodeId[] = [from];
  for (let d = 1; frontier.length > 0; d += 1) {
    const next: NodeId[] = [];
    for (const n of frontier) {
      for (const e of board.edges) {
        if (e.doorId !== undefined && board.doors[e.doorId]?.state === 'CLOSED') continue;
        const other = e.from === n ? e.to : e.to === n ? e.from : null;
        if (other === null || seen.has(other)) continue;
        if (other === to) return d;
        seen.add(other);
        next.push(other);
      }
    }
    frontier = next;
  }
  return null;
}

function smokeNodes(state: GameState): ReadonlySet<NodeId> {
  return new Set(state.effects.filter((e) => e.type === 'SMOKE').map((e) => e.origin));
}

function replaceCharacter(state: GameState, updated: CharacterState): GameState {
  return { ...state, characters: state.characters.map((c) => (c.id === updated.id ? updated : c)) };
}

registerHandler('ATTACK', (state, command, rng) => {
  if (state.phase !== 'ACTIVATION') return reject('NOT_IN_ACTIVATION', "Aucune attaque hors de la phase d'activation.");
  if (state.turn.activePlayerId !== command.playerId) return reject('NOT_ACTIVE_PLAYER', "Ce n'est pas le tour de ce joueur.");

  const attacker = state.characters.find((c) => c.id === command.attackerId);
  if (!attacker) return reject('UNKNOWN_ATTACKER', `Attaquant inconnu : ${command.attackerId}`);
  if (attacker.playerId !== command.playerId) return reject('NOT_OWN_CHARACTER', "Ce personnage n'appartient pas au joueur.");
  if (!attacker.alive) return reject('ATTACKER_DEAD', 'Un personnage mort ne peut pas agir.');

  const target = state.characters.find((c) => c.id === command.targetId);
  if (!target) return reject('UNKNOWN_TARGET', `Cible inconnue : ${command.targetId}`);
  if (!target.alive) return reject('TARGET_DEAD', 'La cible est déjà hors de combat.');
  if (target.playerId === attacker.playerId) return reject('TARGET_NOT_ENEMY', 'La cible doit être ennemie.');

  const weapon: WeaponDefinition | undefined = attacker.weapons?.find((w) => w.id === command.weaponId);
  if (!weapon) return reject('WEAPON_NOT_OWNED', `Arme non possédée : ${command.weaponId}`);

  const stats = currentStats(attacker);
  if (stats.combat <= 0) return reject('CHARACTERISTIC_ZERO', 'Combat à 0 : Test impossible (§65.2).');

  // Ciblage : corps à corps = adjacence (indépendante de la LdM, §70.1) ; sinon LdM + portée.
  if (weapon.kind === 'CAC') {
    if (!areAdjacent(state.board, attacker.nodeId, target.nodeId)) {
      return reject('NOT_ADJACENT', 'Le corps à corps exige une cible adjacente.');
    }
  } else {
    if (!canSee(state.board, attacker.nodeId, target.nodeId, { smokeNodes: smokeNodes(state) })) {
      return reject('NO_LINE_OF_SIGHT', 'Aucune ligne de vue sur la cible.');
    }
    if (weapon.maxRange !== undefined) {
      const dist = stepDistance(state.board, attacker.nodeId, target.nodeId);
      if (dist === null || dist > weapon.maxRange) return reject('OUT_OF_RANGE', 'Cible hors de portée.');
    }
  }

  // Modificateurs : arme + modificateurs de la case de l'attaquant (OQ-COMBAT-004).
  const nodeMods = (state.board.nodes[attacker.nodeId]?.properties.modifiers ?? []).filter(
    (m) => m.applies === 'OCCUPANT' || m.applies === 'ATTACKER',
  );
  const modifiers = combineModifiers(
    { extraDice: weapon.extraDice, resultModifier: weapon.resultModifier, autoSuccesses: weapon.autoSuccesses },
    ...nodeMods.map((m) => ({ extraDice: m.extraDice, resultModifier: m.resultModifier })),
  );

  const test = resolveCharacteristicTest(stats.combat, weapon.dice, modifiers, rng);
  const hit = test.success;
  const wounds = hit ? WOUNDS_PER_HIT : 0;
  const healthBefore = target.health;
  const healthAfter = Math.max(0, healthBefore - wounds);
  const defeated = hit && healthAfter === 0;

  const log: CombatLog = {
    attackerId: attacker.id,
    targetId: target.id,
    weaponId: weapon.id,
    combatValue: stats.combat,
    ...buildPoolLog(test),
    defense: null,
    hit,
    wounds,
    healthBefore,
    healthAfter,
    defeated,
  };

  const events: GameEvent[] = [
    { type: 'ATTACK_DECLARED', attackerId: attacker.id, targetId: target.id, weaponId: weapon.id },
    {
      type: 'COMBAT_ROLLED',
      attackerId: attacker.id,
      dice: test.dice.map((d) => d.natural),
      successes: test.successes,
      difficulty: test.difficulty,
      log,
    },
  ];

  let next = state;
  if (!hit) {
    events.push({ type: 'ATTACK_MISSED', attackerId: attacker.id, targetId: target.id });
    return { ok: true, state: next, events };
  }

  events.push({ type: 'ATTACK_HIT', attackerId: attacker.id, targetId: target.id });
  next = replaceCharacter(next, { ...target, health: healthAfter, alive: healthAfter > 0 });
  events.push({ type: 'DAMAGE_APPLIED', targetId: target.id, wounds, healthLeft: healthAfter });
  if (defeated) events.push({ type: 'CHARACTER_DEFEATED', characterId: target.id });

  const winnerId = deathmatchWinner(next);
  if (winnerId !== null) {
    next = { ...next, phase: 'FINISHED', victory: { winnerId, reason: DEATHMATCH_REASON } };
    events.push({ type: 'VICTORY', winnerId, reason: DEATHMATCH_REASON });
  }
  return { ok: true, state: next, events };
});
