import { registerHandler, reject } from '../engine/apply-command';
import type { GameEvent, RuleError } from '../events/events';
import type { CharacterState, GameState } from '../state/types';
import { TOKEN_EFFECT_TYPES, type EquipmentEffect, type EquipmentItem } from './effects';

/** Effet de jeton (à défausser) : les seuls effets que USE_EQUIPMENT sait déclencher. */
export type TokenEffect = Extract<EquipmentEffect, { type: 'GAIN_COMMAND_POINTS' | 'FREE_OVERWATCH' }>;

export type UseEquipmentCheck =
  | { readonly ok: true; readonly character: CharacterState; readonly item: EquipmentItem; readonly effect: TokenEffect }
  | { readonly ok: false; readonly error: RuleError };

/** Premier effet de jeton d'un équipement (`undefined` : ce n'est pas un jeton à défausser). */
export function tokenEffectOf(item: EquipmentItem): TokenEffect | undefined {
  return (item.effects ?? []).find((e): e is TokenEffect => TOKEN_EFFECT_TYPES.has(e.type));
}

/** Jetons qu'un personnage peut défausser maintenant (source unique pour `getLegalActions` et l'interface). */
export function usableTokens(state: GameState, character: CharacterState): EquipmentItem[] {
  return (character.equipment ?? []).filter((item) => checkUseEquipment(state, character.playerId, character.id, item.id).ok);
}

/**
 * Conditions de USE_EQUIPMENT (partagées avec `getLegalActions`).
 * - Tout jeton : au tour de son propriétaire (décision d'Overwatch ou activation), par un personnage vivant et à lui.
 * - GAIN_COMMAND_POINTS (Iron Cross) : hors action, utilisable à tout moment de son tour.
 * - FREE_OVERWATCH (Medal of Honor) : comme ACTION, par le personnage actif qui n'a pas encore agi.
 */
export function checkUseEquipment(state: GameState, playerId: string, characterId: string, equipmentId: string): UseEquipmentCheck {
  const no = (code: string, message: string): UseEquipmentCheck => ({ ok: false, error: { code, message } });
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return no('UNKNOWN_CHARACTER', `Personnage inconnu : ${characterId}.`);
  if (character.playerId !== playerId) return no('NOT_OWN_CHARACTER', "Impossible : ce personnage n'est pas à vous.");
  if (!character.alive) return no('CHARACTER_DEAD', 'Impossible : ce personnage est hors de combat.');
  const item = (character.equipment ?? []).find((i) => i.id === equipmentId);
  if (!item) return no('EQUIPMENT_NOT_OWNED', `Équipement non possédé : ${equipmentId}.`);
  const effect = tokenEffectOf(item);
  if (!effect) return no('NOT_A_TOKEN', "Cet équipement n'est pas un jeton à défausser.");
  if (state.turn.activePlayerId !== playerId || (state.phase !== 'OVERWATCH' && state.phase !== 'ACTIVATION')) {
    return no('NOT_YOUR_TURN', "Impossible : ce n'est pas votre tour.");
  }
  if (effect.type === 'FREE_OVERWATCH') {
    if (state.phase !== 'ACTIVATION') return no('NOT_IN_ACTIVATION', "Impossible : l'Overwatch gratuit se joue comme action pendant une activation.");
    if (state.turn.activeCharacterId !== character.id) return no('NOT_ACTIVE_CHARACTER', "Ce personnage n'est pas en cours d'activation.");
    if (state.turn.actionUsed) return no('ACTION_ALREADY_USED', 'Une seule action par activation : elle est déjà utilisée.');
    if (character.overwatch) return no('ALREADY_OVERWATCH', 'Impossible : ce personnage est déjà en Overwatch.');
  }
  return { ok: true, character, item, effect };
}

/**
 * USE_EQUIPMENT : défausse un jeton et applique son effet. Le jeton sort de l'équipement du personnage (usage unique).
 * - GAIN_COMMAND_POINTS : ajoute des PC à la réserve du joueur (aucune action consommée).
 * - FREE_OVERWATCH : consomme l'action de l'activation et place le personnage en Overwatch sans dépenser de PC.
 */
registerHandler('USE_EQUIPMENT', (state, command) => {
  const checked = checkUseEquipment(state, command.playerId, command.characterId, command.equipmentId);
  if (!checked.ok) return reject(checked.error.code, checked.error.message);
  const { character, item, effect } = checked;

  const events: GameEvent[] = [{ type: 'EQUIPMENT_USED', characterId: character.id, equipmentId: item.id, effect: effect.type }];
  const discard = (c: CharacterState): CharacterState => ({ ...c, equipment: (c.equipment ?? []).filter((i) => i.id !== item.id) });

  if (effect.type === 'GAIN_COMMAND_POINTS') {
    const players = state.players.map((p) => (p.id === command.playerId ? { ...p, commandPoints: p.commandPoints + effect.amount } : p));
    events.push({ type: 'COMMAND_POINTS_GAINED', playerId: command.playerId, amount: effect.amount, total: players.find((p) => p.id === command.playerId)!.commandPoints });
    return { ok: true, events, state: { ...state, players, characters: state.characters.map((c) => (c.id === character.id ? discard(c) : c)) } };
  }

  events.push({ type: 'OVERWATCH_PLACED', characterId: character.id });
  return {
    ok: true,
    events,
    state: {
      ...state,
      turn: { ...state.turn, actionUsed: true },
      characters: state.characters.map((c) => (c.id === character.id ? { ...discard(c), overwatch: true, activated: true } : c)),
    },
  };
});
