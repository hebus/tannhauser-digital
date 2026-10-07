import {
  SeededRng,
  applyCommand,
  createInitialState,
  reachableNodes,
  type CommandResult,
  type GameCommand,
  type GameEvent,
  type GameState,
} from '@tannhauser/core';
import { createCharacterState, loadDevContent } from '@tannhauser/content';

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

  /** Partie de développement : deux joueurs, un héros et une troupe chacun, partie démarrée. */
  static createDev(seed = 1): GameFacade {
    const content = loadDevContent();
    const rng = new SeededRng(seed);
    const def = (id: string) => content.characters.find((c) => c.id === id)!;
    const place = (id: string, playerId: string, nodeId: string) => createCharacterState(def(id), content.weapons, { playerId, nodeId });
    const initial = createInitialState({
      gameId: `dev-${seed}`,
      scenarioId: 'dev',
      board: content.board.board,
      players: [
        { id: 'p1', factionId: 'faction.alpha', commandPoints: 0 },
        { id: 'p2', factionId: 'faction.beta', commandPoints: 0 },
      ],
      characters: [
        place('char.alpha.hero', 'p1', 'n1'),
        place('char.alpha.troop', 'p1', 'n5'),
        place('char.beta.hero', 'p2', 'n16'),
        place('char.beta.troop', 'p2', 'n15'),
      ],
      rng: rng.snapshot(),
    });
    const started = applyCommand(initial, { type: 'START_GAME' }, rng);
    const facade = new GameFacade(started.state, seed);
    facade.rng = rng;
    return facade;
  }

  get state(): GameState {
    return this.current;
  }

  get replaySeed(): number {
    return this.seed;
  }

  /** Nœuds atteignables par un personnage (calculés par le moteur, jamais par l'UI). */
  reachable(characterId: string): { nodeId: string; path: readonly string[]; cost: number }[] {
    return [...reachableNodes(this.current, characterId).entries()]
      .filter(([, r]) => r.path.length > 0)
      .map(([nodeId, r]) => ({ nodeId, path: r.path, cost: r.cost }));
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
