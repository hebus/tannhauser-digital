import {
  SeededRng,
  applyCommand,
  checkTargeting,
  createInitialState,
  reachableNodes,
  smokeNodes,
  visibleNodes,
  type CommandResult,
  type GameCommand,
  type GameEvent,
  type GameState,
} from '@tannhauser/core';
import { createCharacterState, loadDevContent } from '@tannhauser/content';
import type { BoardLayout } from '@tannhauser/renderer';

/** Ennemi ciblable par le personnage, avec les armes qui passent `checkTargeting`. */
export interface TargetableEntry {
  readonly targetId: string;
  readonly nodeId: string;
  readonly weaponIds: readonly string[];
}

type Listener = (events: readonly GameEvent[], state: GameState) => void;

/** Seul pont entre le client (Pixi/UI) et le moteur : le client n'importe jamais les règles directement. */
export class GameFacade {
  private current: GameState;
  private rng: SeededRng;
  private readonly listeners = new Set<Listener>();

  constructor(
    state: GameState,
    private readonly seed: number,
    /** Mise en page d'affichage du plateau (pièces, couloirs), absente pour une grille simple. */
    readonly layout?: BoardLayout,
    /** Joueurs pilotés par l'IA : leurs commandes ne passent que par `dispatchAi`. */
    private readonly aiPlayers: ReadonlySet<string> = new Set(),
  ) {
    this.current = state;
    this.rng = SeededRng.fromSnapshot(state.rng);
  }

  /** Partie de développement : deux joueurs, un héros et une troupe chacun, partie démarrée. */
  static createDev(seed = 1): GameFacade {
    const content = loadDevContent();
    const rng = new SeededRng(seed);
    const def = (id: string) => content.characters.find((c) => c.id === id)!;
    const place = (id: string, playerId: string, nodeId: string) => createCharacterState(def(id), content.equipment, { playerId, nodeId });
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

  /**
   * Ennemis que `characterId` peut attaquer maintenant, avec les armes utilisables. Vide si le personnage n'est pas
   * celui en activation, a déjà agi, ou si une réaction est en attente. La légalité du ciblage (portée, ligne de vue,
   * adjacence, combat à 0) vient de `checkTargeting` du moteur : aucune règle dupliquée ici.
   */
  targetable(characterId: string): TargetableEntry[] {
    const s = this.current;
    const attacker = s.characters.find((c) => c.id === characterId);
    if (!attacker || !attacker.alive) return [];
    if (s.phase !== 'ACTIVATION' || s.turn.reaction || s.turn.activeCharacterId !== attacker.id || s.turn.actionUsed) return [];
    const result: TargetableEntry[] = [];
    for (const target of s.characters) {
      if (!target.alive || target.playerId === attacker.playerId) continue;
      const weaponIds = (attacker.weapons ?? []).filter((w) => checkTargeting(s, attacker, target, w) === null).map((w) => w.id);
      if (weaponIds.length > 0) result.push({ targetId: target.id, nodeId: target.nodeId, weaponIds });
    }
    return result;
  }

  /** Nœuds visibles depuis le personnage (ligne de vue du moteur, fumée comprise). */
  visibleFrom(characterId: string): Set<string> {
    const c = this.current.characters.find((x) => x.id === characterId);
    if (!c) return new Set();
    return visibleNodes(this.current.board, c.nodeId, { smokeNodes: smokeNodes(this.current) });
  }

  isAi(playerId: string): boolean {
    return this.aiPlayers.has(playerId);
  }

  /** Commande d'un humain : refusée si elle est émise au nom d'un joueur piloté par l'IA. */
  dispatch(command: GameCommand): CommandResult {
    if ('playerId' in command && this.aiPlayers.has(command.playerId)) {
      return { accepted: false, state: this.current, events: [], errors: [{ code: 'AI_PLAYER', message: 'Ce joueur est piloté par l’IA.' }] };
    }
    return this.dispatchAi(command);
  }

  /** Commande de l'IA (ou interne) : aucune restriction de pilotage, le moteur valide comme pour un humain. */
  dispatchAi(command: GameCommand): CommandResult {
    const result = applyCommand(this.current, command, this.rng);
    if (result.accepted) {
      this.current = result.state;
      for (const l of this.listeners) l(result.events, result.state);
    }
    return result;
  }

  /**
   * Éditeur : remplace l'état par une version retouchée à la main (placement, santé…), HORS règles et sans événement.
   * Les écouteurs sont prévenus pour redessiner ; l'historique et le RNG sont conservés tels quels.
   */
  replaceState(next: GameState): void {
    this.current = next;
    for (const l of this.listeners) l([], next);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
