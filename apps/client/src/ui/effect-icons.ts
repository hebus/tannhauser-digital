import type { EquipmentEffect } from '@tannhauser/core';
import { t } from './i18n';

/** Pictogramme de chaque effet d'équipement : le journal les affiche en petites pastilles (jamais la couleur seule). */
export const EFFECT_ICONS: Record<EquipmentEffect['type'], string> = {
  CRITICAL_HIT: '✸',
  BEST_CHARACTERISTIC: '▲',
  EXTRA_DICE_ON_NATURAL_10: '✚',
  REROLL_LOWEST: '↻',
  EXTRA_DICE_WITH_WEAPON: '⚙',
  GAIN_COMMAND_POINTS: '✪',
  FREE_OVERWATCH: '◎',
};

export interface EffectBadge {
  readonly icon: string;
  /** Nom de l'effet (info-bulle et lecteurs d'écran). */
  readonly label: string;
}

export const effectBadge = (type: EquipmentEffect['type']): EffectBadge => ({ icon: EFFECT_ICONS[type], label: t(`effect.${type}`) });
