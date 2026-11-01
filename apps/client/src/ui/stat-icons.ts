import type { CharacterStats } from '@tannhauser/core';

/** Pictogramme de chaque caractéristique : la fiche personnage les affiche à la place des initiales (nom en info-bulle). */
export const STAT_ICONS: Record<keyof CharacterStats, string> = {
  combat: '⚔',
  physical: '🛡',
  mental: '🧠',
  movement: '👣',
};

/** Pictogramme du mode d'attaque d'une arme (fiche du personnage actif). */
export const ATTACK_ICONS = { MELEE: '🗡', RANGED: '🔫' } as const;
