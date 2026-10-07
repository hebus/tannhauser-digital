import { currentStats, getLegalActions, type ActionId, type CharacterState, type GameState } from '@tannhauser/core';
import { reasonText, t } from './i18n';
import type { Labeler } from './labels';

/** Modèle d'affichage du HUD : pur (état → données), sans DOM, testable. Aucune règle : tout vient du moteur. */

export const ACTION_ORDER: readonly ActionId[] = ['MOVE', 'ATTACK', 'OVERWATCH', 'OPEN_DOOR', 'CLOSE_DOOR', 'END_ACTIVATION', 'PASS'];

/**
 * Raccourcis clavier affichés. E/O/P (et T/D pour la réaction) sont traités par `main.ts` ; M/A/U/F, les chiffres
 * et Échap par le HUD (`MAIN_HANDLED_KEYS` évite le double traitement).
 */
export const ACTION_KEYS: Readonly<Partial<Record<ActionId, string>>> = {
  MOVE: 'M',
  ATTACK: 'A',
  OVERWATCH: 'O',
  OPEN_DOOR: 'U',
  CLOSE_DOOR: 'F',
  END_ACTIVATION: 'E',
  PASS: 'P',
};
export const MAIN_HANDLED_KEYS: ReadonlySet<string> = new Set(['e', 'o', 'p', 't', 'd', 'c', 'i']);

export interface CharacterCard {
  readonly id: string;
  readonly name: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly combat: number;
  readonly physical: number;
  readonly mental: number;
  readonly movementLeft: number;
  readonly movementMax: number;
  readonly overwatch: boolean;
}

export interface StatusModel {
  readonly finished: boolean;
  readonly turnNumber: number;
  readonly activePlayerId: string | null;
  readonly activePlayerName: string;
  readonly players: readonly { readonly id: string; readonly name: string; readonly commandPoints: number; readonly active: boolean }[];
  readonly character: CharacterCard | null;
  readonly actionUsed: boolean;
  readonly reactionFor: string | null;
  readonly winnerName: string | null;
}

export function characterCard(c: CharacterState, labels: Labeler): CharacterCard {
  const stats = currentStats(c);
  return {
    id: c.id,
    name: labels.character(c.id),
    health: c.health,
    maxHealth: c.statRows.length,
    combat: stats.combat,
    physical: stats.physical,
    mental: stats.mental,
    movementLeft: c.movementLeft,
    movementMax: stats.movement,
    overwatch: c.overwatch === true,
  };
}

export function statusModel(state: GameState, labels: Labeler): StatusModel {
  const active = state.characters.find((c) => c.id === state.turn.activeCharacterId);
  const winner = state.victory.winnerId;
  return {
    finished: state.phase === 'FINISHED',
    turnNumber: state.turn.number,
    activePlayerId: state.turn.activePlayerId,
    activePlayerName: state.turn.activePlayerId ? labels.player(state.turn.activePlayerId) : '—',
    players: state.players.map((p) => ({ id: p.id, name: labels.player(p.id), commandPoints: p.commandPoints, active: p.id === state.turn.activePlayerId })),
    character: active ? characterCard(active, labels) : null,
    actionUsed: state.turn.actionUsed === true,
    reactionFor: state.turn.reaction ? labels.player(state.turn.reaction.forPlayerId) : null,
    winnerName: winner ? labels.player(winner) : null,
  };
}

export interface ActionRow {
  readonly id: ActionId;
  readonly label: string;
  readonly key: string | undefined;
  readonly available: boolean;
  /** Raison lisible (traduite si possible) quand l'action est indisponible. */
  readonly reason: string | undefined;
  readonly code: string | undefined;
}

/** Lignes de la barre d'actions du personnage actif, dérivées de `getLegalActions`. */
export function actionRows(state: GameState, characterId: string): ActionRow[] {
  const legal = getLegalActions(state, characterId);
  return ACTION_ORDER.map((id): ActionRow => {
    const a = legal.find((x) => x.id === id)!;
    return {
      id,
      label: t(`action.${id}`),
      key: ACTION_KEYS[id],
      available: a.available,
      reason: a.available ? undefined : reasonText(a.code, a.reason),
      code: a.code,
    };
  });
}

export interface RosterRow {
  readonly characterId: string;
  readonly name: string;
  readonly key: string;
  readonly available: boolean;
  readonly reason: string | undefined;
}

/** Personnages du joueur actif que l'on peut activer (ou pourquoi pas), pour la phase « aucun personnage activé ». */
export function rosterRows(state: GameState, labels: Labeler): RosterRow[] {
  const player = state.turn.activePlayerId;
  if (!player) return [];
  return state.characters
    .filter((c) => c.playerId === player && c.alive)
    .map((c, i): RosterRow => {
      const select = getLegalActions(state, c.id).find((a) => a.id === 'SELECT')!;
      return {
        characterId: c.id,
        name: labels.character(c.id),
        key: String(i + 1),
        available: select.available,
        reason: select.available ? undefined : reasonText(select.code, select.reason),
      };
    });
}
