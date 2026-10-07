import type { NodeId } from '../board/types';
import type { CharacterId } from '../state/types';

/**
 * Point d'extension du passage en force (§69). NON IMPLÉMENTÉ : le système de duel n'existe pas encore.
 * TODO (OQ-MOVE-004) : quand le duel physique sera disponible, `checkStep` devra, au lieu de refuser
 * avec ENEMY_OCCUPIED, signaler une tentative de passage en force possible (PM suffisants, pas de
 * tentative précédente sur cette case durant l'activation) et un handler dédié résoudra le duel.
 */
export interface ForcePassageRequest {
  readonly characterId: CharacterId;
  readonly nodeId: NodeId;
  readonly enemyId: CharacterId;
}

export type ForcePassageOutcome =
  | { readonly success: true }
  | { readonly success: false; readonly counterAttack: boolean };

/** Résolveur injectable (duel physique). Aucune implémentation fournie pour l'instant. */
export type ForcePassageResolver = (request: ForcePassageRequest) => ForcePassageOutcome;

/** Code d'erreur renvoyé tant que le passage en force n'est pas disponible. */
export const FORCE_PASSAGE_UNAVAILABLE = 'ENEMY_OCCUPIED';
