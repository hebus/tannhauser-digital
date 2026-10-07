import type { GameEvent } from '../events/events';
import type { RandomSource } from '../rng/rng';
import type { GameState, PlayerId, TurnState } from '../state/types';
import { CommandPointService } from './command-points';
import { rollInitiative } from './initiative';
import { refreshTurn } from './refresh';

/** Premier joueur, à partir de l'indice `fromIndex` (inclus, ordre cyclique des joueurs), ayant encore un personnage à activer. */
export function nextPlayerWithActivation(state: GameState, fromIndex: number): PlayerId | null {
  const n = state.players.length;
  for (let i = 0; i < n; i += 1) {
    const player = state.players[(fromIndex + i) % n]!;
    if (state.characters.some((c) => c.playerId === player.id && c.alive && !c.activated)) return player.id;
  }
  return null;
}

/** Copie du tour sans activation en cours (ni action, réaction, refus d'attaque d'opportunité, ni compteurs de la phase OVERWATCH). */
export function turnWithoutActivation(turn: TurnState, activePlayerId: PlayerId | null): TurnState {
  return {
    number: turn.number,
    initiativePlayerId: turn.initiativePlayerId,
    activePlayerId,
  };
}

/**
 * Démarre le tour `turnNumber` : TURN_STARTED, refresh (PC, fin des Overwatch), initiative, puis phase OVERWATCH
 * (un personnage par décision, avant les activations). Le gagnant de l'initiative décide en premier, puis les
 * joueurs alternent jusqu'à ce que tous passent consécutivement.
 */
export function startTurn(
  state: GameState,
  turnNumber: number,
  rng: RandomSource,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const events: GameEvent[] = [{ type: 'TURN_STARTED', turn: turnNumber }];
  const refreshed = refreshTurn(state);
  events.push(...refreshed.events);

  const { rolls, winnerId } = rollInitiative(
    refreshed.state.players.map((p) => p.id),
    rng,
  );
  events.push({ type: 'INITIATIVE_ROLLED', rolls, winnerId });

  const overwatchState: GameState = {
    ...refreshed.state,
    phase: 'OVERWATCH',
    turn: { number: turnNumber, initiativePlayerId: winnerId, activePlayerId: winnerId, overwatchPasses: 0, overwatchDecisions: 0 },
  };
  return { events, state: settleOverwatchPhase(overwatchState, events, rng) };
}

/** Coût en PC d'un Overwatch (règle du product owner) : défini ici pour éviter une dépendance circulaire. */
export const OVERWATCH_PLACEMENT_COST = 1;

/** Joueur suivant dans l'ordre des joueurs (cyclique) à partir du joueur qui décide actuellement. */
export function nextOverwatchDecider(state: GameState): PlayerId | null {
  const current = state.players.findIndex((p) => p.id === state.turn.activePlayerId);
  return state.players[(current + 1) % state.players.length]?.id ?? null;
}

/**
 * Le joueur peut-il encore placer un personnage en Overwatch ? Il faut au moins 1 PC ET un personnage éligible
 * (vivant, ni en Overwatch ni déjà non activable). Sinon il passe automatiquement.
 */
export function canPlaceOverwatch(state: GameState, playerId: PlayerId): boolean {
  if (!CommandPointService.canSpend(state, playerId, OVERWATCH_PLACEMENT_COST).ok) return false;
  return state.characters.some((c) => c.playerId === playerId && c.alive && !c.overwatch && !c.activated);
}

/**
 * Applique la passe du joueur qui décide : si tous les joueurs ont passé consécutivement la phase s'achève et les
 * activations commencent, sinon la main passe à l'autre joueur.
 */
export function passOverwatchDecision(state: GameState, events: GameEvent[], rng: RandomSource, auto = false): GameState {
  const playerId = state.turn.activePlayerId;
  if (playerId === null) return state;
  events.push(auto ? { type: 'OVERWATCH_PASSED', playerId, auto: true } : { type: 'OVERWATCH_PASSED', playerId });
  const passes = (state.turn.overwatchPasses ?? 0) + 1;
  const decisions = (state.turn.overwatchDecisions ?? 0) + 1;
  if (passes >= state.players.length) {
    events.push({ type: 'OVERWATCH_PHASE_ENDED' });
    return beginActivations(state, events, rng);
  }
  return { ...state, turn: { ...state.turn, activePlayerId: nextOverwatchDecider(state), overwatchPasses: passes, overwatchDecisions: decisions } };
}

/**
 * Tant que le joueur qui doit décider ne peut plus placer personne (plus de PC ou plus de personnage éligible), il
 * passe automatiquement (événement `OVERWATCH_PASSED` avec `auto`). S'arrête dès qu'un joueur peut décider ou que la
 * phase d'Overwatch est terminée.
 */
export function settleOverwatchPhase(state: GameState, events: GameEvent[], rng: RandomSource): GameState {
  // Sans aucun personnage vivant, rien à décider ni à activer : pas de passage automatique (évite une boucle de tours vides).
  if (!state.characters.some((c) => c.alive)) return state;
  let current = state;
  while (current.phase === 'OVERWATCH' && current.turn.activePlayerId !== null && !canPlaceOverwatch(current, current.turn.activePlayerId)) {
    current = passOverwatchDecision(current, events, rng, true);
  }
  return current;
}

/**
 * Fin de la phase d'Overwatch (deux passes consécutives) : ouvre les activations (le joueur d'initiative, ou le suivant s'il n'a rien à
 * activer) ; si plus aucun personnage n'est activable, le tour se termine aussitôt.
 */
export function beginActivations(state: GameState, events: GameEvent[], rng: RandomSource): GameState {
  const initiativeIndex = Math.max(0, state.players.findIndex((p) => p.id === state.turn.initiativePlayerId));
  const first = nextPlayerWithActivation(state, initiativeIndex);
  if (first === null) {
    events.push({ type: 'TURN_ENDED', turn: state.turn.number });
    const started = startTurn(state, state.turn.number + 1, rng);
    events.push(...started.events);
    return started.state;
  }
  return { ...state, phase: 'ACTIVATION', turn: turnWithoutActivation(state.turn, first) };
}