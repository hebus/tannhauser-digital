import type { NodeId } from '../board/types';
import { areAdjacent } from '../combat/attack';
import type { GameEvent, RuleError } from '../events/events';
import { checkActor } from '../movement/handlers';
import type { CharacterState, FlagState, GameState } from '../state/types';
import { FLAGS_PER_PLAYER, flagsOf, isCaptureTheFlag, objectiveNodes } from './state';

const fail = (code: string, message: string): { ok: false; error: RuleError } => ({ ok: false, error: { code, message } });

export type FlagCheck =
  | { readonly ok: true; readonly character: CharacterState; readonly flag: FlagState; readonly nodeId: NodeId }
  | { readonly ok: false; readonly error: RuleError };

/** Même case ou case voisine (arête, sans tenir compte du sens ni des portes, comme le corps à corps). */
const nearOrSame = (state: GameState, a: NodeId, b: NodeId): boolean => a === b || areAdjacent(state.board, a, b);

const enemyNear = (state: GameState, playerId: string, nodeId: NodeId): boolean =>
  state.characters.some((c) => c.alive && c.playerId !== playerId && nearOrSame(state, c.nodeId, nodeId));

/** Conditions communes (partagées avec `getLegalActions`) : mode, activation en cours, une seule action, personnage valide. */
function checkFlagActor(state: GameState, playerId: string, characterId: string, flagId: string): FlagCheck {
  if (!isCaptureTheFlag(state)) return fail('NO_FLAGS_IN_MODE', "Ce mode de jeu n'utilise pas de drapeaux.");
  const actor = checkActor(state, playerId, characterId);
  if (!actor.ok) return { ok: false, error: actor.error };
  const { character } = actor;
  if (state.turn.activeCharacterId !== character.id) return fail('NOT_ACTIVE_CHARACTER', "Ce personnage n'est pas en cours d'activation.");
  if (state.turn.actionUsed) return fail('ACTION_ALREADY_USED', 'Une seule action par activation : elle est déjà utilisée.');
  const flag = flagsOf(state).find((f) => f.id === flagId);
  if (!flag) return fail('UNKNOWN_FLAG', `Drapeau inconnu : ${flagId}.`);
  return { ok: true, character, flag, nodeId: character.nodeId };
}

/**
 * Récupérer un drapeau ennemi au sol (RULE-OBJ-010) : personnage (même blessé), sur la case du drapeau ou à côté,
 * sans ennemi adjacent au personnage (lecture à confirmer : OQ-FLAG-002). Une action.
 */
export function checkCaptureFlag(state: GameState, playerId: string, characterId: string, flagId: string): FlagCheck {
  const base = checkFlagActor(state, playerId, characterId, flagId);
  if (!base.ok) return base;
  const { character, flag } = base;
  if (flag.ownerId === playerId) return fail('OWN_FLAG', 'On ne récupère que les drapeaux ennemis.');
  if (flag.location.kind === 'CARRIED') return fail('FLAG_CARRIED', 'Ce drapeau est déjà porté.');
  if (flag.location.kind === 'PLANTED') return fail('FLAG_PLANTED', 'Ce drapeau est déjà planté.');
  if (!nearOrSame(state, character.nodeId, flag.location.nodeId)) return fail('FLAG_NOT_ADJACENT', 'Le drapeau doit être sur la case du personnage ou sur une case voisine.');
  if (enemyNear(state, playerId, character.nodeId)) return fail('ENEMY_ADJACENT', 'Impossible : un ennemi est adjacent.');
  return { ok: true, character, flag, nodeId: flag.location.nodeId };
}

/**
 * Planter un drapeau ennemi porté dans son camp (RULE-OBJ-013) : le personnage est sur un point d'entrée de son camp
 * ou à côté, et aucun ennemi n'est adjacent à ce point d'entrée. Une action. Renvoie le point d'entrée utilisé.
 */
export function checkPlantFlag(state: GameState, playerId: string, characterId: string, flagId: string): FlagCheck {
  const base = checkFlagActor(state, playerId, characterId, flagId);
  if (!base.ok) return base;
  const { character, flag } = base;
  if (flag.location.kind !== 'CARRIED' || flag.location.characterId !== character.id) return fail('FLAG_NOT_CARRIED', "Ce personnage ne porte pas ce drapeau.");
  const camp = state.camps?.[playerId] ?? [];
  const near = camp.filter((n) => nearOrSame(state, character.nodeId, n));
  if (near.length === 0) return fail('NOT_AT_CAMP', "Il faut être sur un point d'entrée de son camp ou à côté.");
  const free = near.find((n) => !enemyNear(state, playerId, n));
  if (!free) return fail('ENEMY_AT_CAMP', "Impossible : un ennemi est adjacent au point d'entrée.");
  return { ok: true, character, flag, nodeId: free };
}

/** Drapeaux que ce personnage peut récupérer (resp. planter) maintenant. */
export function capturableFlags(state: GameState, character: CharacterState): FlagState[] {
  return flagsOf(state).filter((f) => checkCaptureFlag(state, character.playerId, character.id, f.id).ok);
}
export function plantableFlags(state: GameState, character: CharacterState): FlagState[] {
  return flagsOf(state).filter((f) => checkPlantFlag(state, character.playerId, character.id, f.id).ok);
}

/** Distances en pas (arêtes non orientées + portails) depuis plusieurs cases : critère de proximité de la mise en place. */
function distancesFrom(state: GameState, sources: readonly NodeId[]): Map<NodeId, number> {
  const adjacency = new Map<NodeId, NodeId[]>();
  const link = (a: NodeId, b: NodeId) => (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
  for (const e of state.board.edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  for (const p of state.board.portals) {
    link(p.from, p.to);
    link(p.to, p.from);
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

export type PlacementResult =
  | { readonly ok: true; readonly state: GameState; readonly events: GameEvent[] }
  | { readonly ok: false; readonly error: RuleError };

/**
 * Mise en place des drapeaux : les joueurs posent à tour de rôle (dans l'ordre de la partie) leurs
 * `FLAGS_PER_PLAYER` drapeaux sur des cases d'objectif libres, chacun sur la case la plus proche de ses propres
 * personnages. Automatique et déterministe en attendant le choix du joueur (OQ-FLAG-001).
 */
export function placeInitialFlags(state: GameState): PlacementResult {
  const objectives = objectiveNodes(state);
  const needed = state.players.length * FLAGS_PER_PLAYER;
  if (objectives.length < needed) return fail('NOT_ENOUGH_OBJECTIVES', `Il faut ${needed} cases d'objectif, le plateau en a ${objectives.length}.`);
  if (!state.players.every((p) => (state.camps?.[p.id] ?? []).length > 0)) return fail('NO_CAMPS', "Chaque joueur doit avoir un camp (point d'entrée).");
  const distances = new Map(
    state.players.map((p) => [p.id, distancesFrom(state, state.characters.filter((c) => c.alive && c.playerId === p.id).map((c) => c.nodeId))]),
  );
  const free = new Set(objectives);
  const flags: FlagState[] = [];
  const events: GameEvent[] = [];
  for (let n = 1; n <= FLAGS_PER_PLAYER; n += 1) {
    for (const player of state.players) {
      const dist = distances.get(player.id)!;
      const node = [...free].sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity) || a.localeCompare(b))[0]!;
      free.delete(node);
      const id = `flag.${player.id}.${n}`;
      flags.push({ id, ownerId: player.id, location: { kind: 'NODE', nodeId: node } });
      events.push({ type: 'FLAG_PLACED', flagId: id, ownerId: player.id, nodeId: node });
    }
  }
  return { ok: true, state: { ...state, flags }, events };
}
