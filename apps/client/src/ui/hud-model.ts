import { OVERWATCH_COST, currentStats, getLegalActions, getReactionOptions, type ActionId, type CharacterState, type GameCommand, type GameState } from '@tannhauser/core';
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

/** Phase de placement de l'Overwatch (avant les activations) : le HUD affiche alors le panneau de placement. */
export const isPlacementPhase = (state: GameState): boolean => state.phase === 'OVERWATCH';

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
  readonly placement: boolean;
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
    placement: isPlacementPhase(state),
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

export interface PlacementRow {
  readonly characterId: string;
  readonly name: string;
  readonly key: string;
  /** Déjà en Overwatch ce tour-ci. */
  readonly placed: boolean;
  readonly available: boolean;
  /** Raison lisible quand le placement est impossible (et que le personnage n'est pas déjà placé). */
  readonly reason: string | undefined;
}

export interface PlacementModel {
  readonly playerId: string;
  readonly playerName: string;
  readonly commandPoints: number;
  readonly cost: number;
  readonly rows: readonly PlacementRow[];
  /** Passer (ne placer personne) : toujours possible pour le joueur qui décide. */
  readonly passAvailable: boolean;
  readonly passReason: string | undefined;
  /** Joueur qui décidera après celui-ci (affichage « en attente »). */
  readonly otherPlayerName: string | null;
  /** Passes consécutives déjà enregistrées (la phase se ferme quand tous les joueurs ont passé). */
  readonly consecutivePasses: number;
  readonly playersCount: number;
}

/** Phase d'Overwatch : personnages du joueur qui décide (UN placement ou une passe), avec disponibilité/raison issues de `getLegalActions`. `null` hors phase. */
export function placementModel(state: GameState, labels: Labeler): PlacementModel | null {
  if (!isPlacementPhase(state) || !state.turn.activePlayerId) return null;
  const playerId = state.turn.activePlayerId;
  const own = state.characters.filter((c) => c.playerId === playerId && c.alive);
  const rows = own.map((c, i): PlacementRow => {
    const ow = getLegalActions(state, c.id).find((a) => a.id === 'OVERWATCH')!;
    return {
      characterId: c.id,
      name: labels.character(c.id),
      key: String(i + 1),
      placed: c.overwatch === true,
      available: ow.available,
      reason: ow.available ? undefined : reasonText(ow.code, ow.reason),
    };
  });
  const pass = own[0] ? getLegalActions(state, own[0].id).find((a) => a.id === 'PASS_OVERWATCH') : undefined;
  return {
    playerId,
    playerName: labels.player(playerId),
    commandPoints: state.players.find((p) => p.id === playerId)?.commandPoints ?? 0,
    cost: OVERWATCH_COST,
    rows,
    passAvailable: pass?.available ?? true,
    passReason: pass && !pass.available ? reasonText(pass.code, pass.reason) : undefined,
    otherPlayerName: state.players.length > 1 ? labels.player(state.players[(state.players.findIndex((x) => x.id === playerId) + 1) % state.players.length]!.id) : null,
    consecutivePasses: state.turn.overwatchPasses ?? 0,
    playersCount: state.players.length,
  };
}

/** Texte de l'action adverse suspendue par une réaction (déclencheur b), ou `null` pour une entrée dans la ligne de vue. */
export function announcedText(command: GameCommand | undefined, labels: Labeler): string | null {
  if (!command) return null;
  switch (command.type) {
    case 'MOVE_CHARACTER':
      return t('reaction.announced.move', { character: labels.character(command.characterId), node: command.path[command.path.length - 1] ?? '?' });
    case 'ATTACK':
      return t('reaction.announced.attack', { character: labels.character(command.attackerId), target: labels.character(command.targetId) });
    case 'OPEN_DOOR':
      return t('reaction.announced.openDoor', { character: labels.character(command.characterId), door: command.doorId });
    case 'CLOSE_DOOR':
      return t('reaction.announced.closeDoor', { character: labels.character(command.characterId), door: command.doorId });
    default:
      return null;
  }
}

/** Phrase de contexte d'une réaction : action annoncée en attente, ou déplacement interrompu. */
export function reactionContext(state: GameState, labels: Labeler): string | null {
  const options = getReactionOptions(state);
  if (!options) return null;
  return announcedText(options.announced, labels) ?? t('reaction.entered', { target: labels.character(options.targetId) });
}