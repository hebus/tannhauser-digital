import type { BoardState } from '../board/types';
import type { RngState } from '../rng/rng';
import {
  STATE_SCHEMA_VERSION,
  DEFAULT_GAME_CONFIG,
  type CharacterState,
  type GameConfig,
  type GameState,
  type PlayerState,
} from './types';

export interface InitialStateInput {
  readonly gameId: string;
  readonly scenarioId: string;
  readonly board: BoardState;
  readonly players: readonly PlayerState[];
  readonly characters: readonly CharacterState[];
  readonly rng: RngState;
  /** Valeurs de configuration ; complétées par les défauts (2 PC par tour). */
  readonly config?: Partial<GameConfig>;
}

export function createInitialState(input: InitialStateInput): GameState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    gameId: input.gameId,
    scenarioId: input.scenarioId,
    config: { ...DEFAULT_GAME_CONFIG, ...input.config },
    turn: { number: 0, initiativePlayerId: null, activePlayerId: null },
    phase: 'SETUP',
    players: input.players,
    characters: input.characters,
    board: input.board,
    objectives: [],
    effects: [],
    history: [],
    rng: input.rng,
    victory: { winnerId: null, reason: null },
  };
}
