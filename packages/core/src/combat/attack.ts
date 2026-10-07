import { canSee } from '../board/line-of-sight';
import type { BoardState, NodeId } from '../board/types';
import { registerHandler, reject, type HandlerOutcome } from '../engine/apply-command';
import { currentStats, type CharacterState, type GameState } from '../state/types';
import { resolveAttackExchange } from './exchange';
import type { WeaponDefinition } from './weapons';

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

/** Ciblage : corps à corps = arête entre les nœuds (OQ-COMBAT-001, confirmé) ; sinon ligne de vue + portée. */
export function checkTargeting(
  state: GameState,
  attacker: CharacterState,
  target: CharacterState,
  weapon: WeaponDefinition,
): HandlerOutcome | null {
  const stats = currentStats(attacker);
  if (stats.combat <= 0) return reject('CHARACTERISTIC_ZERO', 'Combat à 0 : Test impossible (§65.2).');
  if (weapon.kind === 'CAC') {
    if (!areAdjacent(state.board, attacker.nodeId, target.nodeId)) {
      return reject('NOT_ADJACENT', 'Le corps à corps exige une cible adjacente.');
    }
    return null;
  }
  if (!canSee(state.board, attacker.nodeId, target.nodeId, { smokeNodes: smokeNodes(state) })) {
    return reject('NO_LINE_OF_SIGHT', 'Aucune ligne de vue sur la cible.');
  }
  if (weapon.maxRange !== undefined) {
    const dist = stepDistance(state.board, attacker.nodeId, target.nodeId);
    if (dist === null || dist > weapon.maxRange) return reject('OUT_OF_RANGE', 'Cible hors de portée.');
  }
  return null;
}

registerHandler('ATTACK', (state, command, rng) => {
  if (state.phase !== 'ACTIVATION') return reject('NOT_IN_ACTIVATION', "Aucune attaque hors de la phase d'activation.");
  if (state.turn.activePlayerId !== command.playerId) return reject('NOT_ACTIVE_PLAYER', "Ce n'est pas le tour de ce joueur.");

  const attacker = state.characters.find((c) => c.id === command.attackerId);
  if (!attacker) return reject('UNKNOWN_ATTACKER', `Attaquant inconnu : ${command.attackerId}`);
  if (attacker.playerId !== command.playerId) return reject('NOT_OWN_CHARACTER', "Ce personnage n'appartient pas au joueur.");
  if (!attacker.alive) return reject('ATTACKER_DEAD', 'Un personnage mort ne peut pas agir.');
  // Une attaque est l'action unique de l'activation : le personnage doit être l'actif et n'avoir pas encore agi.
  if (state.turn.activeCharacterId !== attacker.id) {
    return reject('NOT_ACTIVE_CHARACTER', "Ce personnage n'est pas en cours d'activation.");
  }
  if (state.turn.actionUsed) return reject('ACTION_ALREADY_USED', "Une seule action par activation : elle est déjà utilisée.");

  const target = state.characters.find((c) => c.id === command.targetId);
  if (!target) return reject('UNKNOWN_TARGET', `Cible inconnue : ${command.targetId}`);
  if (!target.alive) return reject('TARGET_DEAD', 'La cible est déjà hors de combat.');
  if (target.playerId === attacker.playerId) return reject('TARGET_NOT_ENEMY', 'La cible doit être ennemie.');

  const weapon: WeaponDefinition | undefined = attacker.weapons?.find((w) => w.id === command.weaponId);
  if (!weapon) return reject('WEAPON_NOT_OWNED', `Arme non possédée : ${command.weaponId}`);

  const refused = checkTargeting(state, attacker, target, weapon);
  if (refused) return refused;

  const result = resolveAttackExchange({ ...state, turn: { ...state.turn, actionUsed: true } }, attacker, target, weapon, rng);
  return { ok: true, state: result.state, events: result.events };
});
