import {
  SeededRng,
  applyCommand,
  createInitialState,
  type CommandResult,
  type GameCommand,
  type GameEvent,
  type GameState,
} from '@tannhauser/core';
import { loadDevContent } from '@tannhauser/content';

type Listener = (events: readonly GameEvent[], state: GameState) => void;

/** Seul pont entre le client (Pixi/UI) et le moteur : le client n'importe jamais les règles directement. */
export class GameFacade {
  private current: GameState;
  private rng: SeededRng;
  private readonly listeners = new Set<Listener>();

  constructor(
    state: GameState,
    private readonly seed: number,
  ) {
    this.current = state;
    this.rng = SeededRng.fromSnapshot(state.rng);
  }

  static createDev(seed = 1): GameFacade {
    const content = loadDevContent();
    const rng = new SeededRng(seed);
    const state = createInitialState({
      gameId: `dev-${seed}`,
      scenarioId: 'dev',
      board: content.board.board,
      players: [
        { id: 'p1', factionId: 'faction.alpha', commandPoints: 0 },
        { id: 'p2', factionId: 'faction.beta', commandPoints: 0 },
      ],
      characters: [],
      rng: rng.snapshot(),
    });
    return new GameFacade(state, seed);
  }

  get state(): GameState {
    return this.current;
  }

  get replaySeed(): number {
    return this.seed;
  }

  dispatch(command: GameCommand): CommandResult {
    const result = applyCommand(this.current, command, this.rng);
    if (result.accepted) {
      this.current = result.state;
      for (const l of this.listeners) l(result.events, result.state);
    }
    return result;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
