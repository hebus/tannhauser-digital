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

/** Pictogrammes (noms ; dessinés en SVG trait par `phase-tracker`, masqués aux lecteurs d'écran) : la phase n'est jamais indiquée par la seule couleur. */
export type PhaseIconName = 'refresh' | 'flag' | 'eye' | 'play';
export const PHASE_ICONS: Readonly<Record<PhaseStepId, PhaseIconName>> = { refresh: 'refresh', initiative: 'flag', overwatch: 'eye', activation: 'play' };

export interface PhaseStep {
  readonly id: PhaseStepId;
  readonly label: string;
  readonly icon: PhaseIconName;
  /** Numéro d'ordre (1 à 4), affiché dans le nœud d'une phase à venir. */
  readonly number: number;
  readonly status: PhaseStepStatus;
  /** Libellé accessible de l'état (« en cours », « terminée », « à venir »). */
  readonly statusText: string;
  /** Précision lue dans l'état (ex. qui a l'initiative, nombre d'Overwatch posés). */
  readonly detail: string | null;
  /** Index (dans `GameState.players`) du joueur mis en avant dans `detail` (gagnant de l'initiative), pour son marqueur forme+couleur. */
  readonly detailPlayerIndex: number | null;
  /** Sous-ligne de l'étape COURANTE uniquement (« Joueur 1 décide », « Joueur 2 joue », « Joueur 1 commence »). */
  readonly subline: string | null;
  /** Phase instantanée dont un événement vient de passer dans le dernier lot (mise en valeur brève). */
  readonly fresh: boolean;
}

/** Pastille d'initiative, visible pendant tout le tour : « à venir » tant que le tirage n'a pas eu lieu. */
export interface InitiativeBadge {
  readonly decided: boolean;
  /** Index (dans `GameState.players`) du gagnant, pour son marqueur forme+couleur. */
  readonly playerIndex: number | null;
  readonly playerName: string | null;
  /** Jets, gagnant d'abord (« 8 – 4 »), ou null. */
  readonly rolls: string | null;
  /** Texte des jets prêt à afficher (« jets 8 – 4 »), ou null. */
  readonly rollsText: string | null;
}

/** Capsule de PC d'un joueur. Aucune règle : état Overwatch / à activer compté depuis `GameState`. */
export interface PlayerCapsule {
  readonly id: string;
  readonly index: number;
  readonly name: string;
  readonly commandPoints: number;
  readonly pcText: string;
  readonly active: boolean;
  readonly initiative: boolean;
  /** Personnages vivants en Overwatch. */
  readonly overwatchCount: number;
  /** Personnages vivants pas encore activés ce tour. */
  readonly toActivateCount: number;
  /** « 1 en Overwatch », « 2 à activer »… ou null quand rien d'utile à dire (phase instantanée, mise en place, fin). */
  readonly stateText: string | null;
}

export interface PhaseModel {
  /** Numéro du tour (null avant le premier tour). */
  readonly turnNumber: number | null;
  readonly initiative: InitiativeBadge;
  readonly players: readonly PlayerCapsule[];
  readonly activePlayerName: string | null;
  readonly steps: readonly PhaseStep[];
  readonly currentId: PhaseStepId | null;
  /** Ligne contextuelle sous la frise (phrase complète, avec le nom du joueur). */
  readonly context: string;
  /** Consigne seule : la phrase contextuelle sans le nom du joueur qui a la main (affiché à part, avec son marqueur). */
  readonly instruction: string;
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

/** Retire le nom du joueur en tête d'une phrase contextuelle (« Joueur 1 : activez… » → « activez… »). */
export function withoutLeadingName(context: string, name: string | null): string {
  if (!name || !context.startsWith(name)) return context;
  return context.slice(name.length).replace(/^[\s:,–-]+/, '');
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

/** Sous-ligne de l'étape courante (qui décide, qui joue, qui commence). */
export function stepSubline(state: GameState, labels: Labeler, id: PhaseStepId): string | null {
  const reaction = state.turn.reaction;
  const player = state.turn.activePlayerId ? labels.player(state.turn.activePlayerId) : null;
  switch (id) {
    case 'refresh':
      return t('phase.sub.refresh');
    case 'initiative': {
      const winner = state.turn.initiativePlayerId;
      return winner && state.phase !== 'INITIATIVE' ? t('phase.sub.starts', { player: labels.player(winner) }) : t('phase.sub.rolling');
    }
    case 'overwatch':
      return player ? t('phase.sub.decides', { player }) : null;
    case 'activation':
      if (reaction) return t('phase.sub.decides', { player: labels.player(reaction.forPlayerId) });
      return player ? t('phase.sub.plays', { player }) : null;
  }
}

function capsules(state: GameState, labels: Labeler, activeId: string | null): PlayerCapsule[] {
  const live = state.phase !== 'SETUP' && state.phase !== 'FINISHED';
  return state.players.map((p, index): PlayerCapsule => {
    const mine = state.characters.filter((c) => c.alive && c.playerId === p.id);
    const overwatchCount = mine.filter((c) => c.overwatch === true).length;
    const toActivateCount = mine.filter((c) => !c.activated).length;
    const parts: string[] = [];
    if (state.phase === 'OVERWATCH' || state.phase === 'ACTIVATION') {
      if (state.phase === 'ACTIVATION') parts.push(toActivateCount > 0 ? t('phase.capsule.toActivate', { n: toActivateCount }) : t('phase.capsule.allActivated'));
      if (overwatchCount > 0) parts.push(t('phase.detail.overwatch', { n: overwatchCount }));
    }
    return {
      id: p.id,
      index,
      name: labels.player(p.id),
      commandPoints: p.commandPoints,
      pcText: t('status.pc', { n: p.commandPoints }),
      active: p.id === activeId && state.phase !== 'FINISHED',
      initiative: live && p.id === state.turn.initiativePlayerId,
      overwatchCount,
      toActivateCount,
      stateText: parts.length > 0 ? parts.join(' · ') : null,
    };
  });
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
      number: i + 1,
      status,
      statusText: t(`phase.status.${status}`),
      detail,
      detailPlayerIndex,
      subline: status === 'current' ? stepSubline(state, labels, id) : null,
      fresh: FRESH_EVENTS[id].some((type) => recentTypes.has(type)),
    };
  });
  const activeId = state.phase === 'FINISHED' ? null : (state.turn.reaction?.forPlayerId ?? state.turn.activePlayerId);
  const index = activeId ? state.players.findIndex((p) => p.id === activeId) : -1;
  const initiativeStep = steps[1]!;
  const winnerId = state.turn.initiativePlayerId;
  const decided = initiativeStep.status !== 'upcoming' && winnerId !== null;
  const rolls = decided ? lastInitiativeRolls(state) : null;
  const context = phaseContext(state, labels);
  const activeName = activeId && state.phase !== 'FINISHED' ? labels.player(activeId) : null;
  return {
    turnNumber: state.phase === 'SETUP' || state.turn.number < 1 ? null : state.turn.number,
    initiative: {
      decided,
      playerIndex: decided ? initiativeStep.detailPlayerIndex : null,
      playerName: decided && winnerId ? labels.player(winnerId) : null,
      rolls,
      rollsText: rolls ? t('phase.initiative.rolls', { rolls }) : null,
    },
    players: capsules(state, labels, activeId),
    activePlayerName: activeName,
    steps,
    currentId: current >= 0 && current < PHASE_STEP_IDS.length ? PHASE_STEP_IDS[current]! : null,
    context,
    instruction: withoutLeadingName(context, activeName),
    activePlayerIndex: index >= 0 ? index : null,
  };
}
