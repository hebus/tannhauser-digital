import type { GameEvent, GameState } from '@tannhauser/core';

/** Étape de présentation : description pure (données) d'une animation déduite d'un événement du moteur. */
export type PresentationStep =
  | { readonly kind: 'move'; readonly characterId: string; readonly nodeIds: readonly string[] }
  | { readonly kind: 'damage'; readonly targetId: string; readonly wounds: number }
  | { readonly kind: 'defeat'; readonly characterId: string }
  | { readonly kind: 'overwatchPlaced'; readonly characterId: string }
  | { readonly kind: 'overwatchTriggered'; readonly overwatcherId: string; readonly targetId: string; readonly nodeId: string }
  | { readonly kind: 'banner'; readonly turn: number; readonly playerId: string | null }
  /** Changement de joueur actif (ou de phase) : annonce à quelle équipe c'est le tour de jouer. */
  | { readonly kind: 'turnOf'; readonly playerId: string; readonly phase: string };

/**
 * Événements → étapes de présentation, dans l'ordre. `prev` donne les positions de départ des déplacements
 * (null si inconnu : le tracé part alors de la première case du chemin) ; `next` donne le joueur actif.
 */
export function planPresentation(events: readonly GameEvent[], prev: GameState | null, next: GameState): PresentationStep[] {
  const steps: PresentationStep[] = [];
  const positions = new Map<string, string>();
  for (const c of prev?.characters ?? []) positions.set(c.id, c.nodeId);

  events.forEach((e, index) => {
    switch (e.type) {
      case 'CHARACTER_MOVED': {
        const origin = positions.get(e.characterId);
        const nodeIds = origin !== undefined ? [origin, ...e.path] : [...e.path];
        const last = e.path[e.path.length - 1];
        if (last !== undefined) positions.set(e.characterId, last);
        if (nodeIds.length > 1) steps.push({ kind: 'move', characterId: e.characterId, nodeIds });
        break;
      }
      case 'DAMAGE_APPLIED':
        if (e.wounds > 0) steps.push({ kind: 'damage', targetId: e.targetId, wounds: e.wounds });
        break;
      case 'CHARACTER_DEFEATED':
        steps.push({ kind: 'defeat', characterId: e.characterId });
        break;
      case 'OVERWATCH_PLACED':
        steps.push({ kind: 'overwatchPlaced', characterId: e.characterId });
        break;
      case 'OVERWATCH_TRIGGERED':
        steps.push({ kind: 'overwatchTriggered', overwatcherId: e.overwatcherId, targetId: e.targetId, nodeId: e.nodeId });
        break;
      case 'TURN_STARTED': {
        const rolled = events.slice(index + 1).find((x) => x.type === 'INITIATIVE_ROLLED');
        const playerId = next.turn.number === e.turn ? next.turn.activePlayerId : rolled?.type === 'INITIATIVE_ROLLED' ? rolled.winnerId : null;
        steps.push({ kind: 'banner', turn: e.turn, playerId });
        break;
      }
      default:
        break;
    }
  });
  // Hors début de tour (déjà annoncé par la bannière « Tour N »), on annonce chaque changement de main.
  const turnStarted = steps.some((st) => st.kind === 'banner');
  const activeId = next.turn.activePlayerId;
  const changed = prev !== null && (prev.turn.activePlayerId !== activeId || prev.phase !== next.phase);
  if (!turnStarted && changed && activeId !== null && next.phase !== 'FINISHED' && next.phase !== 'SETUP') {
    steps.push({ kind: 'turnOf', playerId: activeId, phase: next.phase });
  }
  return steps;
}
