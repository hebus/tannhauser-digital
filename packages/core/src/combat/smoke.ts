import type { NodeId } from '../board/types';
import type { CharacterState, GameState } from '../state/types';
import type { WeaponDefinition } from './weapons';

/** Durée d'une fumée à son lancement (RULE-EQUIP-013) : elle perd 1 tour à chaque refresh et disparaît à 0. */
export const SMOKE_DURATION_TURNS = 2;

/** Dés retirés à l'attaquant qui tire (hors corps à corps) sur une cible dans la fumée (RULE-COMBAT-013). */
export const SMOKE_ATTACK_PENALTY_DICE = 2;

/** Cases où une fumée a été lancée. */
export function smokeNodes(state: GameState): ReadonlySet<NodeId> {
  return new Set(state.effects.filter((e) => e.type === 'SMOKE').map((e) => e.origin));
}

/** Étendue de la fumée : origines, nœuds et arêtes couverts, avec leur épaisseur (voir `smokeSpread`). */
export interface SmokeSpread {
  readonly origins: ReadonlySet<NodeId>;
  /** Nœuds sous fumée : les origines et tout nœud partageant au moins une couleur avec une origine. */
  readonly nodes: ReadonlySet<NodeId>;
  /** Épaisseur de la fumée par nœud, de 1 (venant d'être lancée) à 0 : `remainingTurns / SMOKE_DURATION_TURNS`, la plus épaisse l'emporte. */
  readonly intensity: ReadonlyMap<NodeId, number>;
  /** Arêtes dont les deux extrémités sont sous fumée (la propagation se lit le long d'elles), avec la plus faible des deux intensités. */
  readonly edges: readonly { readonly from: NodeId; readonly to: NodeId; readonly intensity: number }[];
}

/**
 * Propagation de la fumée telle que la décrit la règle : une fumée posée sur une case gagne toutes les cases qui partagent
 * une couleur avec elle, et les arêtes qui les relient. Son épaisseur décroît avec les tours restants. Fonction pure,
 * utilisée par les règles de combat (`isInSmoke`) et par l'affichage.
 */
export function smokeSpread(state: GameState): SmokeSpread {
  const origins = new Set<NodeId>();
  const intensity = new Map<NodeId, number>();
  for (const effect of state.effects) {
    if (effect.type !== 'SMOKE') continue;
    origins.add(effect.origin);
    const strength = Math.min(1, Math.max(0, effect.remainingTurns / SMOKE_DURATION_TURNS));
    const colors = new Set(state.board.nodes[effect.origin]?.colors ?? []);
    const covered = Object.values(state.board.nodes).filter((n) => n.id === effect.origin || n.colors.some((c) => colors.has(c)));
    for (const node of covered) intensity.set(node.id, Math.max(intensity.get(node.id) ?? 0, strength));
  }
  const nodes = new Set(intensity.keys());
  const edges = state.board.edges
    .filter((e) => nodes.has(e.from) && nodes.has(e.to))
    .map((e) => ({ from: e.from, to: e.to, intensity: Math.min(intensity.get(e.from)!, intensity.get(e.to)!) }));
  return { origins, nodes, intensity, edges };
}

/** Le nœud est-il sous fumée (case lancée ou case qui partage une couleur avec elle) ? */
export function isInSmoke(state: GameState, nodeId: NodeId): boolean {
  return smokeSpread(state).nodes.has(nodeId);
}

/**
 * Malus de dés de l'attaquant (RULE-COMBAT-013) : une cible dans la fumée ne se touche bien qu'au corps à corps ;
 * toute autre arme subit -2 dés. La fumée ne coupe pas la ligne de vue.
 */
export function smokeAttackPenalty(state: GameState, target: Pick<CharacterState, 'nodeId'>, weapon: Pick<WeaponDefinition, 'kind'>): number {
  return weapon.kind !== 'CAC' && isInSmoke(state, target.nodeId) ? SMOKE_ATTACK_PENALTY_DICE : 0;
}
