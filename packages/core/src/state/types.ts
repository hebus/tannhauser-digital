import type { BoardState, NodeId } from '../board/types';
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
  /** Joueur dont c'est actuellement le tour d'activer un personnage. */
  readonly activePlayerId: PlayerId | null;
}

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
