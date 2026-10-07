import type { BoardState, NodeId } from '../board/types';
import type { GameCommand } from '../commands/commands';
import type { GameEvent } from '../events/events';
import type { WeaponDefinition } from '../combat/weapons';
import type { RngState } from '../rng/rng';

export const STATE_SCHEMA_VERSION = 1;

export type PlayerId = string;
export type CharacterId = string;
export type FactionId = string;

export type GamePhase = 'SETUP' | 'REFRESH' | 'INITIATIVE' | 'OVERWATCH' | 'ACTIVATION' | 'END_OF_TURN' | 'FINISHED';

export interface TurnState {
  readonly number: number;
  /** Joueur qui a l'initiative (à jouer en premier) ce tour-ci. */
  readonly initiativePlayerId: PlayerId | null;
  /**
   * Joueur dont c'est actuellement le tour : en phase OVERWATCH, celui qui doit décider (placer UN personnage en
   * Overwatch ou passer) ; en phase ACTIVATION, celui qui active un personnage.
   */
  readonly activePlayerId: PlayerId | null;
  /** Phase OVERWATCH : nombre de passes consécutives (remis à 0 par un placement ; la phase s'achève quand tous ont passé). */
  readonly overwatchPasses?: number;
  /** Phase OVERWATCH : nombre de décisions prises (placements + passes) ; la relance d'initiative exige 0. */
  readonly overwatchDecisions?: number;
  /** Personnage en cours d'activation (absent hors activation). */
  readonly activeCharacterId?: CharacterId;
  /** Le personnage actif a déjà effectué son unique action de l'activation. */
  readonly actionUsed?: boolean;
  /** Réaction d'Overwatch en attente : suspend l'activation adverse (toutes les autres commandes sont refusées). */
  readonly reaction?: PendingReaction;
  /**
   * Overwatchers ayant refusé l'attaque d'opportunité pendant l'activation courante : ils ne se
   * redéclenchent pas contre ce même adversaire (OQ-OVERWATCH-005). Remis à zéro à chaque changement d'activation.
   */
  readonly overwatchWaived?: readonly CharacterId[];
}

/** Réaction d'Overwatch (attaque d'opportunité) déclenchée par un adversaire dans la ligne de vue. */
export interface PendingReaction {
  readonly overwatcherId: CharacterId;
  readonly targetId: CharacterId;
  /** Joueur qui doit répondre (propriétaire du personnage en Overwatch). */
  readonly forPlayerId: PlayerId;
  /**
   * Commande annoncée par l'adversaire (déplacement ou action) et suspendue : elle est rejouée une fois la
   * réaction résolue si la cible est toujours en vie. Absente pour un déclenchement par entrée dans la ligne de vue.
   */
  readonly resume?: GameCommand;
}

/** Paramètres de partie sérialisables (valeurs de mode de jeu, pas de constantes en dur). */
export interface GameConfig {
  /** PC attribués à chaque joueur à chaque refresh de début de tour (§66.1, §75). */
  readonly commandPointsPerTurn: number;
  /** Taille de la réserve de dés d'un jet de défense (donnée, voir OQ-COMBAT-002). */
  readonly defensePoolSize: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = { commandPointsPerTurn: 2, defensePoolSize: 4 };

export interface PlayerState {
  readonly id: PlayerId;
  readonly factionId: FactionId;
  readonly commandPoints: number;
}

/** Ligne de caractéristiques (valeur courante selon la santé restante). */
export interface CharacterStats {
  readonly combat: number;
  readonly physical: number;
  readonly mental: number;
  readonly movement: number;
}

export interface CharacterState {
  readonly id: CharacterId;
  readonly definitionId: string;
  readonly playerId: PlayerId;
  readonly nodeId: NodeId;
  /** Niveaux de santé restants (>= 1 tant que vivant). */
  readonly health: number;
  /**
   * Lignes de caractéristiques, de la pleine santé à la dernière blessure.
   * La ligne active est `statRows[statRows.length - health]`.
   */
  readonly statRows: readonly CharacterStats[];
  readonly alive: boolean;
  /** Armes possédées (définitions runtime sérialisables, copiées du contenu à la mise en place). */
  readonly weapons?: readonly WeaponDefinition[];
  readonly activated: boolean;
  /**
   * En Overwatch : réagit à un adversaire (entrée dans la ligne de vue, ou action/déplacement tenté dans sa ligne
   * de vue). Un personnage placé en Overwatch est aussi marqué ctivated : il n'est pas activable ce tour.
   */
  readonly overwatch?: boolean;
  readonly movementLeft: number;
}

export interface ObjectiveState {
  readonly id: string;
  readonly definitionId: string;
  readonly stage: 0 | 1 | 2;
}

export type ActiveEffect = {
  readonly id: string;
  readonly type: 'SMOKE';
  readonly origin: NodeId;
  readonly remainingTurns: number;
};

export interface VictoryState {
  readonly winnerId: PlayerId | null;
  readonly reason: string | null;
}

export interface GameState {
  readonly schemaVersion: number;
  readonly gameId: string;
  readonly scenarioId: string;
  readonly config: GameConfig;
  readonly turn: TurnState;
  readonly phase: GamePhase;
  readonly players: readonly PlayerState[];
  readonly characters: readonly CharacterState[];
  readonly board: BoardState;
  readonly objectives: readonly ObjectiveState[];
  readonly effects: readonly ActiveEffect[];
  readonly history: readonly GameEvent[];
  readonly rng: RngState;
  readonly victory: VictoryState;
}

/** Caractéristiques courantes d'un personnage (ligne active selon la santé). */
export function currentStats(character: CharacterState): CharacterStats {
  const row = character.statRows[Math.min(character.statRows.length - 1, Math.max(0, character.statRows.length - character.health))];
  if (!row) throw new Error(`Aucune ligne de caractéristiques pour ${character.id}`);
  return row;
}
