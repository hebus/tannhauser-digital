import type { GameState } from '@tannhauser/core';

/** Modèle d'affichage des drapeaux (Capture du drapeau) : pur (état → données), sans Pixi, testable. */

/** Drapeau à dessiner sur une case : au sol ou planté dans un camp. */
export interface FlagMark {
  readonly flagId: string;
  /** Index (dans `GameState.players`) du joueur propriétaire : couleur ET forme de l'emblème. */
  readonly ownerIndex: number;
  readonly nodeId: string;
  readonly planted: boolean;
  /** Rang parmi les drapeaux de la même case (décalage pour qu'ils restent lisibles). */
  readonly slot: number;
}

const playerIndex = (state: GameState, playerId: string): number => Math.max(0, state.players.findIndex((p) => p.id === playerId));

/** Vrai quand la partie utilise des drapeaux (les décors du mode ne sont dessinés que dans ce cas). */
export const usesFlags = (state: GameState): boolean => state.mode === 'CAPTURE_THE_FLAG';

/** Cases d'objectif à marquer (anneau discret) : uniquement en Capture du drapeau, triées par id. */
export function objectiveNodeIds(state: GameState): string[] {
  if (!usesFlags(state)) return [];
  return Object.values(state.board.nodes)
    .filter((n) => n.properties.kind === 'OBJECTIVE')
    .map((n) => n.id)
    .sort();
}

/** Drapeaux visibles sur le plateau (au sol ou plantés), dans l'ordre des ids ; les drapeaux portés suivent leur porteur. */
export function flagMarks(state: GameState): FlagMark[] {
  const perNode = new Map<string, number>();
  const marks: FlagMark[] = [];
  for (const f of [...(state.flags ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    if (f.location.kind === 'CARRIED') continue;
    const nodeId = f.location.nodeId;
    const slot = perNode.get(nodeId) ?? 0;
    perNode.set(nodeId, slot + 1);
    marks.push({ flagId: f.id, ownerIndex: playerIndex(state, f.ownerId), nodeId, planted: f.location.kind === 'PLANTED', slot });
  }
  return marks;
}

/** Index propriétaire des drapeaux portés par ce personnage (un fanion par drapeau, accroché au pion). */
export function carriedOwnerIndexes(state: GameState, characterId: string): number[] {
  return (state.flags ?? [])
    .filter((f) => f.location.kind === 'CARRIED' && f.location.characterId === characterId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f) => playerIndex(state, f.ownerId));
}

/** Cases (camp) où un drapeau est planté : elles reçoivent le marqueur « planté » (double anneau). */
export function plantedNodeIds(state: GameState): string[] {
  return [...new Set(flagMarks(state).filter((m) => m.planted).map((m) => m.nodeId))];
}
