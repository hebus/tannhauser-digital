import { getLegalActions, type GameCommand, type GameState, type RuleError } from '@tannhauser/core';
import { reasonText, t } from './i18n';

/**
 * Explications des entrées qui ne produisent aucune commande ou que le moteur refuse.
 * Principe : l'interface ne décide jamais de la légalité ; elle ne fait que restituer le motif.
 */

export interface RefusedCommand {
  readonly command: GameCommand;
  readonly errors: readonly RuleError[];
}

/** Messages (dédoublonnés) à montrer pour un ou plusieurs refus survenus pendant une même saisie. */
export function describeRefusals(refused: readonly RefusedCommand[], state: GameState): string[] {
  const messages: string[] = [];
  const push = (text: string): void => {
    if (!messages.includes(text)) messages.push(text);
  };
  for (const { command, errors } of refused) {
    if (command.type === 'ATTACK') {
      // Plusieurs armes essayées à la suite : si aucune attaque n'est possible, on donne le motif global.
      const attack = getLegalActions(state, command.attackerId).find((a) => a.id === 'ATTACK');
      if (attack && !attack.available) {
        push(reasonText(attack.code, attack.reason));
        continue;
      }
    }
    for (const e of errors) push(reasonText(e.code, e.message));
  }
  return messages;
}

/** Pourquoi un clic sur le plateau n'a rien déclenché. */
export function explainIgnoredClick(state: GameState): string {
  if (state.phase === 'FINISHED') return t('input.gameFinished');
  if (state.turn.reaction) return t('input.reactionPending');
  if (state.phase === 'OVERWATCH') return t('input.placement');
  if (!state.turn.activeCharacterId) return t('input.noActive');
  return t('input.nothingHere');
}

/** Pourquoi une touche de réaction (T/D) n'a rien déclenché ; `null` si la touche n'est pas concernée. */
export function explainIgnoredKey(state: GameState, key: string): string | null {
  const k = key.toLowerCase();
  if ((k === 't' || k === 'd') && !state.turn.reaction) return state.phase === 'FINISHED' ? t('input.gameFinished') : t('input.noReaction');
  return null;
}
