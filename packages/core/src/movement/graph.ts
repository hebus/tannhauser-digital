import type { BoardState, NodeId } from '../board/types';
import type { RuleError } from '../events/events';
import type { CharacterId, CharacterState, GameState } from '../state/types';

/** Mode de franchissement d'un pas : arête de plateau ou portail (porte secrète). */
export type StepKind = 'EDGE' | 'PORTAL';

export type StepCheck =
  | {
      readonly ok: true;
      readonly kind: StepKind;
      readonly cost: number;
      /** Ennemi occupant la case : le pas n'est possible que par un passage en force (duel de Physique). */
      readonly crossing?: CharacterId;
    }
  | { readonly ok: false; readonly error: RuleError };

const fail = (code: string, message: string): StepCheck => ({ ok: false, error: { code, message } });

/** Coût d'entrée d'une case : 1 PM + surcoût de la case d'arrivée (§68.2, §68.4). */
export function entryCost(board: BoardState, nodeId: NodeId): number {
  const node = board.nodes[nodeId];
  return 1 + Math.max(0, node?.properties.movementCostModifier ?? 0);
}

/** Personnages vivants occupant une case (hors `exceptId`). */
export function occupantsOf(state: GameState, nodeId: NodeId, exceptId?: string): readonly CharacterState[] {
  return state.characters.filter((c) => c.alive && c.nodeId === nodeId && c.id !== exceptId);
}

/** Cases voisines (candidates) depuis `from`, triées par id pour un résultat déterministe. */
export function neighborCandidates(board: BoardState, from: NodeId): readonly NodeId[] {
  const out = new Set<NodeId>();
  for (const e of board.edges) {
    if (e.from === from) out.add(e.to);
    else if (e.to === from && !e.oneWay) out.add(e.from);
  }
  for (const p of board.portals) {
    if (p.from === from) out.add(p.to);
    else if (p.to === from) out.add(p.from);
  }
  return [...out].sort();
}

/**
 * Vérifie un pas `from` → `to` pour `character` (hors PM disponibles et hors case d'arrivée finale).
 * Ordre des contrôles : existence, liaison (sens unique), porte, case impraticable, ennemi.
 * Une case ennemie est refusée (ENEMY_OCCUPIED), sauf si `allowEnemy` : le pas est alors accepté et marqué `crossing`.
 */
export function checkStep(
  state: GameState,
  character: CharacterState,
  from: NodeId,
  to: NodeId,
  allowEnemy = false,
): StepCheck {
  const board = state.board;
  const target = board.nodes[to];
  if (!target) return fail('UNKNOWN_NODE', `Impossible : la case ${to} n'existe pas.`);

  const edges = board.edges.filter(
    (e) => (e.from === from && e.to === to) || (!e.oneWay && e.from === to && e.to === from),
  );
  const portal = board.portals.some((p) => (p.from === from && p.to === to) || (p.from === to && p.to === from));

  if (edges.length === 0 && !portal) {
    const reverseOneWay = board.edges.some((e) => e.oneWay && e.from === to && e.to === from);
    return reverseOneWay
      ? fail('ONE_WAY', `Impossible : la case ${to} ne se rejoint pas depuis ${from} (sens unique).`)
      : fail('NOT_ADJACENT', `Impossible : ${from} et ${to} ne sont pas reliées.`);
  }

  let kind: StepKind = 'PORTAL';
  if (!portal) {
    // Une porte absente de `doors` est considérée fermée (prudence).
    const open = edges.some((e) => !e.doorId || board.doors[e.doorId]?.state === 'OPEN');
    if (!open) return fail('DOOR_CLOSED', `Impossible : une porte fermée bloque le passage vers ${to}.`);
    kind = 'EDGE';
  }

  if (!target.properties.passable) {
    return fail('IMPASSABLE', `Impossible : la case ${to} est impraticable.`);
  }
  const enemy = occupantsOf(state, to, character.id).find((c) => c.playerId !== character.playerId);
  if (enemy) {
    if (!allowEnemy) return fail('ENEMY_OCCUPIED', `Impossible : la case ${to} est occupée par un ennemi.`);
    return { ok: true, kind, cost: entryCost(board, to), crossing: enemy.id };
  }
  return { ok: true, kind, cost: entryCost(board, to) };
}
