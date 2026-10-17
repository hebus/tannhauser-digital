import type { CharacterStats } from '@tannhauser/core';

/** Pictogramme de chaque caractéristique : la fiche personnage les affiche à la place des initiales (nom en info-bulle). */
export const STAT_ICONS: Record<keyof CharacterStats, string> = {
  combat: '⚔',
  physical: '🛡',
  mental: '🧠',
  movement: '👣',
};
