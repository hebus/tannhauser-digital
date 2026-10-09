import type { CombatLog } from '../combat/log';
import type { EquipmentEffect } from '../equipment/effects';

/** Événements émis par le moteur (§83). Source unique pour animations, audio, replay, IA. */
export type GameEvent =
  | { readonly type: 'GAME_STARTED'; readonly scenarioId: string }
  | { readonly type: 'TURN_STARTED'; readonly turn: number }
  | { readonly type: 'COMMAND_POINTS_REFRESHED'; readonly playerId: string; readonly amount: number }
  | { readonly type: 'COMMAND_POINTS_GAINED'; readonly playerId: string; readonly amount: number; readonly total: number }
  /** Jeton défaussé : son effet (`effect`) est appliqué par la suite d'événements. */
  | { readonly type: 'EQUIPMENT_USED'; readonly characterId: string; readonly equipmentId: string; readonly effect: EquipmentEffect['type'] }
  | { readonly type: 'COMMAND_POINTS_SPENT'; readonly playerId: string; readonly amount: number; readonly purpose: string; readonly remaining: number }
  | { readonly type: 'SMOKE_EXPIRED'; readonly effectId: string; readonly origin: string }
  | { readonly type: 'INITIATIVE_CHANGED'; readonly previousWinnerId: string; readonly winnerId: string }
  | { readonly type: 'INITIATIVE_ROLLED'; readonly rolls: Readonly<Record<string, number>>; readonly winnerId: string }
  | { readonly type: 'CHARACTER_ACTIVATION_STARTED'; readonly characterId: string }
  | { readonly type: 'CHARACTER_MOVED'; readonly characterId: string; readonly path: readonly string[]; readonly cost: number }
  /** Passage en force : duel de Physique entre le déplaçant et l'ennemi occupant `nodeId`. */
  | {
      readonly type: 'FORCE_PASSAGE_RESOLVED';
      readonly characterId: string;
      readonly enemyId: string;
      readonly nodeId: string;
      readonly dice: readonly number[];
      readonly difficulty: number;
      readonly successes: number;
      readonly defenderDice: readonly number[];
      readonly defenderDifficulty: number;
      readonly defenderSuccesses: number;
      readonly success: boolean;
    }
  | { readonly type: 'DOOR_OPENED'; readonly characterId: string; readonly doorId: string; readonly cost: number }
  | { readonly type: 'DOOR_CLOSED'; readonly characterId: string; readonly doorId: string; readonly cost: number }
  | { readonly type: 'CHARACTER_ACTIVATION_ENDED'; readonly characterId: string }
  | { readonly type: 'TEST_RESOLVED'; readonly characterId: string; readonly dice: readonly number[]; readonly difficulty: number; readonly successes: number }
  | { readonly type: 'ATTACK_DECLARED'; readonly attackerId: string; readonly targetId: string; readonly weaponId: string }
  | { readonly type: 'COMBAT_ROLLED'; readonly attackerId: string; readonly dice: readonly number[]; readonly successes: number; readonly difficulty?: number; readonly log?: CombatLog }
  | { readonly type: 'DEFENSE_ROLLED'; readonly defenderId: string; readonly dice: readonly number[]; readonly successes: number; readonly difficulty: number }
  | { readonly type: 'OVERWATCH_PLACED'; readonly characterId: string }
  /** `auto` : passe automatique (le joueur ne peut plus placer personne : plus de PC ou plus de personnage éligible). */
  | { readonly type: 'OVERWATCH_PASSED'; readonly playerId: string; readonly auto?: boolean }
  /** Les deux joueurs ont passé consécutivement : la phase d'Overwatch est terminée, les activations commencent. */
  | { readonly type: 'OVERWATCH_PHASE_ENDED' }
  | {
      readonly type: 'OVERWATCH_TRIGGERED';
      readonly overwatcherId: string;
      readonly targetId: string;
      readonly nodeId: string;
      /** Type de la commande adverse suspendue (absent : déclenchement par entrée dans la ligne de vue). */
      readonly announced?: string;
    }
  | { readonly type: 'OVERWATCH_RESUME_REFUSED'; readonly characterId: string; readonly command: string; readonly code: string; readonly message: string }
  | { readonly type: 'OVERWATCH_RESOLVED'; readonly overwatcherId: string; readonly fired: boolean }
  | { readonly type: 'ATTACK_HIT'; readonly attackerId: string; readonly targetId: string }
  | { readonly type: 'ATTACK_MISSED'; readonly attackerId: string; readonly targetId: string }
  | { readonly type: 'DAMAGE_APPLIED'; readonly targetId: string; readonly wounds: number; readonly healthLeft: number }
  | { readonly type: 'CHARACTER_DEFEATED'; readonly characterId: string }
  | { readonly type: 'TURN_ENDED'; readonly turn: number }
  | { readonly type: 'PLAYER_PASSED'; readonly playerId: string }
  | { readonly type: 'FLAG_PLACED'; readonly flagId: string; readonly ownerId: string; readonly nodeId: string }
  | { readonly type: 'FLAG_CAPTURED'; readonly flagId: string; readonly characterId: string; readonly nodeId: string }
  | { readonly type: 'FLAG_DROPPED'; readonly flagId: string; readonly characterId: string; readonly nodeId: string }
  | { readonly type: 'FLAG_PLANTED'; readonly flagId: string; readonly characterId: string; readonly playerId: string; readonly nodeId: string }
  | { readonly type: 'VICTORY'; readonly winnerId: string; readonly reason: string };

export type GameEventType = GameEvent['type'];

export interface RuleError {
  readonly code: string;
  readonly message: string;
}
