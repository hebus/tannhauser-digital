import type { GameCommand, GameCommandType } from '../commands/commands';
import type { GameEvent, RuleError } from '../events/events';
import type { RandomSource, RngState } from '../rng/rng';
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
 * Garde commune à toutes les commandes : partie terminée, réaction d'Overwatch en attente.
 * Partagée avec `getLegalActions` pour que l'interface voie exactement les mêmes refus.
 */
export function checkCommandGate(state: GameState, type: GameCommandType): RuleError | null {
  if (state.phase === 'FINISHED' && type !== 'START_GAME') {
    return { code: 'GAME_FINISHED', message: 'La partie est terminée.' };
  }
  // Une réaction d'Overwatch suspend tout le reste jusqu'à sa résolution.
  if (state.turn.reaction && type !== 'OVERWATCH_FIRE' && type !== 'OVERWATCH_DECLINE') {
    return { code: 'REACTION_PENDING', message: "Une réaction d'Overwatch est en attente de résolution." };
  }
  return null;
}

/**
 * Intercepteur de commande : appelé après la garde commune et avant le handler. Il peut suspendre la commande
 * (ex. ouvrir une réaction d'Overwatch qui mémorise la commande annoncée) en renvoyant un résultat ; `null`
 * laisse la commande suivre son cours normal.
 */
export type CommandInterceptor = (state: GameState, command: GameCommand, rng: RandomSource) => HandlerOutcome | null;

const interceptors: CommandInterceptor[] = [];

export function registerInterceptor(interceptor: CommandInterceptor): void {
  interceptors.push(interceptor);
}

/**
 * RNG factice pour valider une commande sans consommer l'aléa de la partie : renvoie toujours la borne basse.
 * Son résultat n'est jamais conservé, seul l'accord ou le refus du handler compte.
 */
export class DryRng implements RandomSource {
  nextInt(min: number): number {
    return min;
  }

  nextFloat(): number {
    return 0;
  }

  snapshot(): RngState {
    return { kind: 'scripted', value: 0, draws: 0 };
  }
}

/** Le handler accepterait-il cette commande ? (sans intercepteur, sans RNG de la partie, état jamais modifié) */
export function dryValidate(state: GameState, command: GameCommand): HandlerOutcome {
  const handler = handlers[command.type] as CommandHandler | undefined;
  if (!handler) return reject('UNSUPPORTED_COMMAND', `Commande non supportée : ${command.type}`);
  return handler(state, command, new DryRng());
}

/**
 * Exécute une commande (garde, intercepteurs, handler) SANS toucher à l'historique ni au RNG sérialisé :
 * brique commune d'`applyCommand` et de la reprise d'une commande suspendue par une réaction.
 */
export function executeCommand(state: GameState, command: GameCommand, rng: RandomSource): HandlerOutcome {
  const gate = checkCommandGate(state, command.type);
  if (gate) return { ok: false, errors: [gate] };
  for (const interceptor of interceptors) {
    const intercepted = interceptor(state, command, rng);
    if (intercepted) return intercepted;
  }
  const handler = handlers[command.type] as CommandHandler | undefined;
  if (!handler) return reject('UNSUPPORTED_COMMAND', `Commande non supportée : ${command.type}`);
  return handler(state, command, rng);
}

/**
 * Point d'entrée unique du moteur. Pure vis-à-vis de `state` (jamais muté) ;
 * l'aléa passe exclusivement par `rng`. Une commande refusée renvoie l'état d'origine.
 */
export function applyCommand(state: GameState, command: GameCommand, rng: RandomSource): CommandResult {
  const outcome = executeCommand(state, command, rng);
  if (!outcome.ok) return { accepted: false, state, events: [], errors: outcome.errors };

  const next: GameState = {
    ...outcome.state,
    history: [...outcome.state.history, ...outcome.events],
    rng: rng.snapshot(),
  };
  return { accepted: true, state: next, events: outcome.events, errors: [] };
}