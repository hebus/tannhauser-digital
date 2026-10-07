import {
  getLegalActions,
  getReactionOptions,
  reachableNodes,
  type BoardState,
  type CharacterState,
  type GameCommand,
  type GameState,
  type NodeId,
  type WeaponDefinition,
} from '@tannhauser/core';

/**
 * IA basique : agressive, déterministe, sans état. Elle ne choisit que des commandes que le moteur accepte
 * (disponibilité lue dans `getLegalActions` / `getReactionOptions`, jamais recopiée) ; les règles restent dans le core.
 * Tout est une heuristique simple : attaquer si possible, sinon se rapprocher de l'ennemi le plus proche (en ouvrant
 * les portes qui bloquent), sinon finir l'activation.
 */

/** Joueur qui doit décider maintenant (réaction en attente, sinon joueur actif), `null` si la partie est finie. */
export function decidingPlayer(state: GameState): string | null {
  if (state.phase === 'FINISHED' || state.phase === 'SETUP') return null;
  return state.turn.reaction?.forPlayerId ?? state.turn.activePlayerId;
}

/** Distances (en pas, arêtes non orientées, portes comptées comme passables) depuis l'ennemi le plus proche de chaque nœud. */
function distancesToNearest(board: BoardState, sources: readonly NodeId[]): Map<NodeId, number> {
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const e of board.edges) {
    (adjacency.get(e.from) ?? adjacency.set(e.from, []).get(e.from)!).push(e.to);
    (adjacency.get(e.to) ?? adjacency.set(e.to, []).get(e.to)!).push(e.from);
  }
  const dist = new Map<NodeId, number>(sources.map((n) => [n, 0]));
  let frontier = [...sources];
  while (frontier.length > 0) {
    const next: NodeId[] = [];
    for (const n of frontier) {
      for (const m of adjacency.get(n) ?? []) {
        if (dist.has(m)) continue;
        dist.set(m, dist.get(n)! + 1);
        next.push(m);
      }
    }
    frontier = next;
  }
  return dist;
}

const weaponPower = (w: WeaponDefinition | undefined): number => (w ? w.dice + (w.extraDice ?? 0) + (w.autoSuccesses ?? 0) : 0);

const enemiesOf = (state: GameState, playerId: string): CharacterState[] => state.characters.filter((c) => c.alive && c.playerId !== playerId);

function distanceMap(state: GameState, playerId: string): Map<NodeId, number> {
  return distancesToNearest(state.board, enemiesOf(state, playerId).map((c) => c.nodeId));
}

function reaction(state: GameState, playerId: string): GameCommand | null {
  const options = getReactionOptions(state);
  if (!options) return null;
  const best = options.fire
    .filter((f) => f.available)
    .map((f) => ({ f, power: weaponPower(state.characters.find((c) => c.id === options.overwatcherId)?.weapons?.find((w) => w.id === f.weaponId)) }))
    .sort((a, b) => b.power - a.power)[0];
  return best ? { type: 'OVERWATCH_FIRE', playerId, weaponId: best.f.weaponId } : { type: 'OVERWATCH_DECLINE', playerId };
}

const RANGED: ReadonlySet<WeaponDefinition['kind']> = new Set(['PISTOL', 'AUTOMATIC', 'MENTAL']);

function overwatchPhase(state: GameState, playerId: string): GameCommand {
  const own = state.characters.filter((c) => c.alive && c.playerId === playerId);
  const free = own.filter((c) => !c.overwatch);
  // Au moins un personnage doit rester libre pour agir ; on met en garde un tireur qui n'a pas déjà un ennemi en vue.
  const candidate = free.find(
    (c) =>
      free.length > 1 &&
      (c.weapons ?? []).some((w) => RANGED.has(w.kind)) &&
      getLegalActions(state, c.id).some((a) => a.id === 'OVERWATCH' && a.available),
  );
  return candidate ? { type: 'OVERWATCH', playerId, characterId: candidate.id } : { type: 'PASS_OVERWATCH', playerId };
}

function select(state: GameState, playerId: string): GameCommand | null {
  const dist = distanceMap(state, playerId);
  const candidates = state.characters
    .filter((c) => c.alive && c.playerId === playerId && getLegalActions(state, c.id).some((a) => a.id === 'SELECT' && a.available))
    .sort((a, b) => (dist.get(a.nodeId) ?? Infinity) - (dist.get(b.nodeId) ?? Infinity) || a.id.localeCompare(b.id));
  const first = candidates[0];
  return first ? { type: 'SELECT_CHARACTER', playerId, characterId: first.id } : { type: 'PASS', playerId };
}

function activate(state: GameState, playerId: string, character: CharacterState): GameCommand {
  const legal = getLegalActions(state, character.id);
  const action = (id: string) => legal.find((a) => a.id === id && a.available);

  const attack = action('ATTACK')?.details?.attackOptions;
  if (attack && attack.length > 0) {
    const scored = attack
      .map((o) => ({
        o,
        health: state.characters.find((c) => c.id === o.targetId)?.health ?? Infinity,
        power: weaponPower(character.weapons?.find((w) => w.id === o.weaponId)),
      }))
      .sort((a, b) => a.health - b.health || b.power - a.power || a.o.targetId.localeCompare(b.o.targetId));
    const pick = scored[0]!.o;
    return { type: 'ATTACK', playerId, attackerId: character.id, targetId: pick.targetId, weaponId: pick.weaponId };
  }

  if (action('MOVE')) {
    const dist = distanceMap(state, playerId);
    const here = dist.get(character.nodeId) ?? Infinity;
    const best = reachableDestinations(state, character.id)
      .map((r) => ({ r, d: dist.get(r.nodeId) ?? Infinity }))
      .sort((a, b) => a.d - b.d || a.r.cost - b.r.cost || a.r.nodeId.localeCompare(b.r.nodeId))[0];
    if (best && best.d < here) return { type: 'MOVE_CHARACTER', playerId, characterId: character.id, path: best.r.path };
  }

  const doors = action('OPEN_DOOR')?.details?.doorIds;
  if (doors && doors.length > 0) return { type: 'OPEN_DOOR', playerId, characterId: character.id, doorId: doors[0]! };

  return action('END_ACTIVATION') ? { type: 'END_TURN', playerId } : { type: 'PASS', playerId };
}

/** Destinations atteignables du personnage (le moteur calcule coûts et chemins). */
function reachableDestinations(state: GameState, characterId: string): { nodeId: NodeId; path: readonly NodeId[]; cost: number }[] {
  return [...reachableNodes(state, characterId).entries()]
    .filter(([, r]) => r.path.length > 0)
    .map(([nodeId, r]) => ({ nodeId, path: r.path, cost: r.cost }));
}

/**
 * Commande que l'IA jouerait pour `playerId` dans `state`, ou `null` si ce n'est pas à lui de décider.
 * Pure et déterministe : le même état donne la même commande.
 */
export function chooseCommand(state: GameState, playerId: string): GameCommand | null {
  if (decidingPlayer(state) !== playerId) return null;
  if (state.turn.reaction) return reaction(state, playerId);
  if (state.phase === 'OVERWATCH') return overwatchPhase(state, playerId);
  if (state.phase !== 'ACTIVATION') return null;
  const active = state.characters.find((c) => c.id === state.turn.activeCharacterId);
  return active ? activate(state, playerId, active) : select(state, playerId);
}
