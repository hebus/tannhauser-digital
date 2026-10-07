import { OVERWATCH_COST, type GameEvent, type GameState } from '@tannhauser/core';
import { t } from './i18n';
import type { Labeler } from './labels';

/**
 * Frise des phases du tour : modèle pur (état + événements récents → données), sans DOM, testable.
 * Aucune règle : la phase affichée est lue dans `GameState.phase` ; les phases instantanées (refresh, initiative)
 * apparaissent comme « passées » une fois la phase suivante atteinte.
 */
export type PhaseStepId = 'refresh' | 'initiative' | 'overwatch' | 'activation';
export type PhaseStepStatus = 'done' | 'current' | 'upcoming';

/** Ordre d'affichage (= ordre réel d'un tour, voir docs/rules/turn-structure.md). */
export const PHASE_STEP_IDS: readonly PhaseStepId[] = ['refresh', 'initiative', 'overwatch', 'activation'];

/** Pictogrammes (texte, masqués aux lecteurs d'écran) : la phase n'est jamais indiquée par la seule couleur. */
export const PHASE_ICONS: Readonly<Record<PhaseStepId, string>> = { refresh: '↻', initiative: '⚑', overwatch: '◉', activation: '▶' };

export interface PhaseStep {
  readonly id: PhaseStepId;
  readonly label: string;
  readonly icon: string;
  readonly status: PhaseStepStatus;
  /** Libellé accessible de l'état (« en cours », « terminée », « à venir »). */
  readonly statusText: string;
  /** Précision lue dans l'état (ex. qui a l'initiative, nombre d'Overwatch posés). */
  readonly detail: string | null;
  /** Index (dans `GameState.players`) du joueur mis en avant dans `detail` (gagnant de l'initiative), pour son marqueur forme+couleur. */
  readonly detailPlayerIndex: number | null;
  /** Phase instantanée dont un événement vient de passer dans le dernier lot (mise en valeur brève). */
  readonly fresh: boolean;
}

export interface PhaseModel {
  readonly steps: readonly PhaseStep[];
  readonly currentId: PhaseStepId | null;
  /** Ligne contextuelle sous la frise. */
  readonly context: string;
  /** Joueur à qui c'est la main (index dans `GameState.players`), ou null. */
  readonly activePlayerIndex: number | null;
}

/** Index (dans PHASE_STEP_IDS) de l'étape courante ; `PHASE_STEP_IDS.length` = toutes passées ; -1 = aucune commencée. */
export function currentStepIndex(state: GameState): number {
  switch (state.phase) {
    case 'REFRESH':
      return 0;
    case 'INITIATIVE':
      return 1;
    case 'OVERWATCH':
      return 2;
    case 'ACTIVATION':
      return 3;
    case 'END_OF_TURN':
    case 'FINISHED':
      return PHASE_STEP_IDS.length;
    default:
      return -1;
  }
}

const FRESH_EVENTS: Readonly<Record<PhaseStepId, readonly GameEvent['type'][]>> = {
  refresh: ['COMMAND_POINTS_REFRESHED'],
  initiative: ['INITIATIVE_ROLLED', 'INITIATIVE_CHANGED'],
  overwatch: ['OVERWATCH_PLACED', 'OVERWATCH_PASSED'],
  activation: ['CHARACTER_ACTIVATION_STARTED'],
};

/** Ligne contextuelle : qui décide / que faire maintenant. */
export function phaseContext(state: GameState, labels: Labeler): string {
  const player = state.turn.activePlayerId ? labels.player(state.turn.activePlayerId) : '—';
  if (state.phase === 'FINISHED') {
    const winner = state.victory.winnerId;
    return winner ? t('phase.context.finished', { player: labels.player(winner) }) : t('phase.context.finishedNoWinner');
  }
  if (state.turn.reaction) return t('phase.context.reaction', { player: labels.player(state.turn.reaction.forPlayerId) });
  switch (state.phase) {
    case 'SETUP':
      return t('phase.context.setup');
    case 'REFRESH':
      return t('phase.context.refresh');
    case 'INITIATIVE':
      return t('phase.context.initiative');
    case 'OVERWATCH':
      return t('phase.context.overwatch', { player, cost: OVERWATCH_COST });
    case 'ACTIVATION':
      return state.turn.activeCharacterId
        ? t('phase.context.activating', { player, character: labels.character(state.turn.activeCharacterId) })
        : t('phase.context.activate', { player });
    case 'END_OF_TURN':
      return t('phase.context.endOfTurn');
    default:
      return '';
  }
}

/** Jets du dernier tirage d'initiative du tour courant (le gagnant d'abord, ex. « 7 – 1 »), lus dans l'historique. */
export function lastInitiativeRolls(state: GameState): string | null {
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const e = state.history[i]!;
    if (e.type === 'TURN_STARTED') return null;
    if (e.type === 'INITIATIVE_ROLLED') {
      const winnerRoll = e.rolls[e.winnerId];
      const others = Object.entries(e.rolls).filter(([id]) => id !== e.winnerId).map(([, v]) => v).sort((a, b) => b - a);
      return winnerRoll === undefined ? null : [winnerRoll, ...others].join(' – ');
    }
  }
  return null;
}

export function phaseModel(state: GameState, labels: Labeler, recent: readonly GameEvent[] = []): PhaseModel {
  const current = currentStepIndex(state);
  const recentTypes = new Set(recent.map((e) => e.type));
  const owCount = state.characters.filter((c) => c.alive && c.overwatch === true).length;
  const steps = PHASE_STEP_IDS.map((id, i): PhaseStep => {
    const status: PhaseStepStatus = i < current ? 'done' : i === current ? 'current' : 'upcoming';
    let detail: string | null = null;
    let detailPlayerIndex: number | null = null;
    if (id === 'initiative' && status !== 'upcoming' && state.turn.initiativePlayerId) {
      const winner = state.turn.initiativePlayerId;
      const rolls = lastInitiativeRolls(state);
      detail = rolls
        ? t('phase.detail.initiativeRolls', { player: labels.player(winner), rolls })
        : t('phase.detail.initiative', { player: labels.player(winner) });
      const index = state.players.findIndex((p) => p.id === winner);
      detailPlayerIndex = index >= 0 ? index : null;
    } else if (id === 'overwatch' && status !== 'upcoming' && owCount > 0) {
      detail = t('phase.detail.overwatch', { n: owCount });
    }
    return {
      id,
      label: t(`phase.${id}`),
      icon: PHASE_ICONS[id],
      status,
      statusText: t(`phase.status.${status}`),
      detail,
      detailPlayerIndex,
      fresh: FRESH_EVENTS[id].some((type) => recentTypes.has(type)),
    };
  });
  const activeId = state.phase === 'FINISHED' ? null : (state.turn.reaction?.forPlayerId ?? state.turn.activePlayerId);
  const index = activeId ? state.players.findIndex((p) => p.id === activeId) : -1;
  return {
    steps,
    currentId: current >= 0 && current < PHASE_STEP_IDS.length ? PHASE_STEP_IDS[current]! : null,
    context: phaseContext(state, labels),
    activePlayerIndex: index >= 0 ? index : null,
  };
}
