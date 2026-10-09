import type { WeaponDefinition } from '../combat/weapons';
import type { CharacterState } from '../state/types';

/**
 * Effets de règle portés par un équipement (données sérialisables, copiées du contenu à la mise en place).
 * Le moteur ne connaît que ces types d'effet : un équipement du contenu n'ajoute jamais de logique spéciale.
 */
export type EquipmentEffect =
  /** Chaque 10 naturel d'un combat (attaque ou défense) compte pour 2 succès au lieu d'un. */
  | { readonly type: 'CRITICAL_HIT' }
  /** Utilise toujours la valeur la plus haute de la caractéristique, même blessé. */
  | { readonly type: 'BEST_CHARACTERISTIC'; readonly characteristic: 'combat' | 'physical' }
  /** À l'attaque : si au moins un 10 naturel est obtenu, lance `dice` dés de plus et les ajoute au jet. */
  | { readonly type: 'EXTRA_DICE_ON_NATURAL_10'; readonly dice: number }
  /** À l'attaque : relance les `count` dés ratés de plus basse valeur (1 naturels compris). */
  | { readonly type: 'REROLL_LOWEST'; readonly count: number }
  /** À l'attaque avec l'arme `weaponId` : `dice` dés supplémentaires. */
  | { readonly type: 'EXTRA_DICE_WITH_WEAPON'; readonly weaponId: string; readonly dice: number }
  /** Jeton à défausser (hors action) : ajoute `amount` PC à la réserve de son joueur. */
  | { readonly type: 'GAIN_COMMAND_POINTS'; readonly amount: number }
  /** Jeton à défausser, comme ACTION : place le personnage en Overwatch sans dépenser de PC. */
  | { readonly type: 'FREE_OVERWATCH' };

/** Équipement non-arme porté par un personnage (les armes sont dans `CharacterState.weapons`). */
export interface EquipmentItem {
  readonly id: string;
  readonly traits: readonly string[];
  readonly effects?: readonly EquipmentEffect[];
}

/** Effets de tous les équipements portés (un jeton défaussé n'est plus dans la liste). */
export function characterEffects(character: Pick<CharacterState, 'equipment'>): readonly EquipmentEffect[] {
  return (character.equipment ?? []).flatMap((item) => item.effects ?? []);
}

/** Effets applicables à une attaque : ceux du porteur et ceux de l'arme utilisée. */
export function attackEffects(character: Pick<CharacterState, 'equipment'>, weapon: WeaponDefinition): readonly EquipmentEffect[] {
  return [...characterEffects(character), ...(weapon.effects ?? [])];
}

/** Effets de jeton (à défausser) : seuls ceux-là s'utilisent par la commande USE_EQUIPMENT. */
export const TOKEN_EFFECT_TYPES: ReadonlySet<EquipmentEffect['type']> = new Set(['GAIN_COMMAND_POINTS', 'FREE_OVERWATCH']);
