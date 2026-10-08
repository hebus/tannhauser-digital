import type { NodeId } from '../board/types';
import type { RuleError } from '../events/events';
import type { CharacterId, GameState } from '../state/types';
import { checkStep, occupantsOf } from './graph';
import { forcePassageUsed } from './force-passage';

export type PathValidation =
  | {
      readonly ok: true;
      readonly cost: number;
      readonly path: readonly NodeId[];
      readonly costs: readonly number[];
      /** Passage en force à tenter : indice (dans `path`) de la case ennemie traversée, et son occupant. */
      readonly crossing?: { readonly index: number; readonly enemyId: CharacterId };
    }
  | { readonly ok: false; readonly errors: readonly RuleError[] };

const err = (code: string, message: string): PathValidation => ({ ok: false, errors: [{ code, message }] });

/**
 * Valide un chemin (liste de cases à franchir). L'origine en tête est tolérée et retirée.
 * Renvoie le coût total et le coût de chaque pas, ou la première erreur de règle rencontrée.
 * Une case ennemie intermédiaire peut être traversée par UN passage en force par activation (duel résolu par le
 * handler) ; elle ne peut jamais être la case d'arrivée.
 */
export function validatePath(state: GameState, characterId: CharacterId, rawPath: readonly NodeId[]): PathValidation {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return err('UNKNOWN_CHARACTER', `Personnage inconnu : ${characterId}.`);
  if (!character.alive) return err('CHARACTER_DEAD', 'Impossible : ce personnage est hors de combat.');

  const path = rawPath[0] === character.nodeId ? rawPath.slice(1) : rawPath;
  if (path.length === 0) return err('EMPTY_PATH', 'Impossible : le chemin est vide.');

  let from = character.nodeId;
  let total = 0;
  const costs: number[] = [];
  let crossing: { index: number; enemyId: CharacterId } | undefined;
  for (const [index, to] of path.entries()) {
    const mayCross = crossing === undefined && !forcePassageUsed(state) && index < path.length - 1;
    const step = checkStep(state, character, from, to, mayCross);
    if (!step.ok) return { ok: false, errors: [step.error] };
    if (step.crossing !== undefined) crossing = { index, enemyId: step.crossing };
    total += step.cost;
    costs.push(step.cost);
    if (total > character.movementLeft) {
      return err('INSUFFICIENT_MOVEMENT', `Impossible : ${total} PM requis, ${character.movementLeft} disponible(s).`);
    }
    from = to;
  }
  if (occupantsOf(state, from, character.id).length > 0) {
    return err('DESTINATION_OCCUPIED', `Impossible : la case d'arrivée ${from} est occupée par un allié.`);
  }
  return { ok: true, cost: total, path, costs, ...(crossing ? { crossing } : {}) };
}

/** Aperçu d'un chemin pour l'interface : même validation, sans effet sur l'état. */
export function previewPath(state: GameState, characterId: CharacterId, path: readonly NodeId[]): PathValidation {
  return validatePath(state, characterId, path);
}
