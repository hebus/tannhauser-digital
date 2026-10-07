import type { GameEvent, GameState } from '@tannhauser/core';
import { chooseBanner, type BannerPlan } from './banner';

/** Étape de présentation : description pure (données) d'une animation déduite d'un événement du moteur. */
export type PresentationStep =
  | { readonly kind: 'move'; readonly characterId: string; readonly nodeIds: readonly string[] }
  | { readonly kind: 'damage'; readonly targetId: string; readonly wounds: number }
  | { readonly kind: 'defeat'; readonly characterId: string }
  | { readonly kind: 'overwatchPlaced'; readonly characterId: string }
  | { readonly kind: 'overwatchTriggered'; readonly overwatcherId: string; readonly targetId: string; readonly nodeId: string }
  /** Bannière de grande transition (début de tour, phase, changement de main, réaction, victoire) : au plus une par lot. */
  | { readonly kind: 'banner'; readonly banner: BannerPlan };

interface Candidate {
  readonly plan: BannerPlan;
  /** Position d'insertion parmi les étapes (la bannière est non bloquante : elle s'affiche à ce moment de la file). */
  readonly at: number;
}

/**
 * Événements → étapes de présentation, dans l'ordre. `prev` donne les positions de départ des déplacements
 * (null si inconnu : le tracé part alors de la première case du chemin) ; `next` donne le joueur actif et la phase.
 * Au plus UNE bannière par lot : la plus significative l'emporte (voir `chooseBanner`).
 */
export function planPresentation(events: readonly GameEvent[], prev: GameState | null, next: GameState): PresentationStep[] {
  const steps: PresentationStep[] = [];
  const candidates: Candidate[] = [];
  const positions = new Map<string, string>();
  for (const c of prev?.characters ?? []) positions.set(c.id, c.nodeId);
  const ownerOf = (characterId: string): string | null =>
    next.characters.find((c) => c.id === characterId)?.playerId ?? prev?.characters.find((c) => c.id === characterId)?.playerId ?? null;

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
        candidates.push({
          plan: { kind: 'reaction', turn: next.turn.number, playerId: ownerOf(e.overwatcherId), overwatcherId: e.overwatcherId, targetId: e.targetId },
          at: steps.length,
        });
        steps.push({ kind: 'overwatchTriggered', overwatcherId: e.overwatcherId, targetId: e.targetId, nodeId: e.nodeId });
        break;
      case 'TURN_STARTED': {
        const rolled = events.slice(index + 1).find((x) => x.type === 'INITIATIVE_ROLLED');
        const playerId = next.turn.number === e.turn ? next.turn.activePlayerId : rolled?.type === 'INITIATIVE_ROLLED' ? rolled.winnerId : null;
        candidates.push({ plan: { kind: 'turnStart', turn: e.turn, playerId }, at: steps.length });
        break;
      }
      case 'VICTORY':
        candidates.push({ plan: { kind: 'victory', turn: next.turn.number, playerId: e.winnerId }, at: Number.MAX_SAFE_INTEGER });
        break;
      default:
        break;
    }
  });

  // Changement de phase ou de main : annonce la phase (Overwatch / activation) ou à qui c'est le tour.
  const activeId = next.turn.activePlayerId;
  if (prev !== null && activeId !== null) {
    const phaseChanged = prev.phase !== next.phase;
    const handChanged = prev.turn.activePlayerId !== activeId;
    const turn = next.turn.number;
    if (next.phase === 'OVERWATCH' && (phaseChanged || handChanged)) {
      candidates.push({ plan: { kind: 'overwatchPhase', turn, playerId: activeId }, at: Number.MAX_SAFE_INTEGER });
    } else if (next.phase === 'ACTIVATION' && phaseChanged) {
      candidates.push({ plan: { kind: 'activationPhase', turn, playerId: activeId }, at: Number.MAX_SAFE_INTEGER });
    } else if (next.phase === 'ACTIVATION' && handChanged) {
      candidates.push({ plan: { kind: 'turnOf', turn, playerId: activeId }, at: Number.MAX_SAFE_INTEGER });
    }
  }

  const chosen = chooseBanner(candidates.map((c) => c.plan));
  if (chosen) {
    const at = Math.min(candidates.find((c) => c.plan === chosen)!.at, steps.length);
    steps.splice(at, 0, { kind: 'banner', banner: chosen });
  }
  return steps;
}
