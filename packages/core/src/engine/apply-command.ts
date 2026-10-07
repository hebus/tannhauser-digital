import type { GameCommand, GameCommandType } from '../commands/commands';
import type { GameEvent, RuleError } from '../events/events';
import type { RandomSource } from '../rng/rng';
import type { GameState } from '../state/types';

export interface CommandResult {
  readonly accepted: boolean;
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly errors: readonly RuleError[];
}

/** Résultat interne d'un handler : le nouvel état (hors historique/rng) et ses événements. */
export type HandlerOutcome =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly errors: readonly RuleError[] };

export type CommandHandler<C extends GameCommand = GameCommand> = (
  state: GameState,
  command: C,
  rng: RandomSource,
) => HandlerOutcome;

type HandlerMap = { [K in GameCommandType]?: CommandHandler<Extract<GameCommand, { type: K }>> };

const handlers: HandlerMap = {};

export function registerHandler<K extends GameCommandType>(
  type: K,
  handler: CommandHandler<Extract<GameCommand, { type: K }>>,
): void {
  (handlers as Record<string, unknown>)[type] = handler;
}

export function reject(code: string, message: string): HandlerOutcome {
  return { ok: false, errors: [{ code, message }] };
}

/**
 * Point d'entrée unique du moteur. Pure vis-à-vis de `state` (jamais muté) ;
 * l'aléa passe exclusivement par `rng`. Une commande refusée renvoie l'état d'origine.
 */
export function applyCommand(state: GameState, command: GameCommand, rng: RandomSource): CommandResult {
  if (state.phase === 'FINISHED' && command.type !== 'START_GAME') {
    return refused(state, 'GAME_FINISHED', 'La partie est terminée.');
  }
  const handler = handlers[command.type] as CommandHandler | undefined;
  if (!handler) return refused(state, 'UNSUPPORTED_COMMAND', `Commande non supportée : ${command.type}`);

  const outcome = handler(state, command, rng);
  if (!outcome.ok) return { accepted: false, state, events: [], errors: outcome.errors };

  const next: GameState = {
    ...outcome.state,
    history: [...outcome.state.history, ...outcome.events],
    rng: rng.snapshot(),
  };
  return { accepted: true, state: next, events: outcome.events, errors: [] };
}

function refused(state: GameState, code: string, message: string): CommandResult {
  return { accepted: false, state, events: [], errors: [{ code, message }] };
}
