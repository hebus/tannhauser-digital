import type { GameMode } from '@tannhauser/core';
import { t } from './i18n';

/** Nombre de règles détaillées par mode (clés `modeHelp.<MODE>.rule<n>` dans i18n). */
const RULE_COUNT: Readonly<Record<GameMode, number>> = { DEATHMATCH: 2, CAPTURE_THE_FLAG: 5 };

export interface ModeRules {
  readonly name: string;
  /** Condition de victoire en une phrase. */
  readonly goal: string;
  /** Règles utiles pour y parvenir. */
  readonly rules: readonly string[];
}

/** Explication d'un mode de jeu (texte seulement : les règles elles-mêmes sont dans le moteur). */
export function modeRules(mode: GameMode): ModeRules {
  return {
    name: t(`mode.${mode}`),
    goal: t(`modeHelp.${mode}.goal`),
    rules: Array.from({ length: RULE_COUNT[mode] }, (_, i) => t(`modeHelp.${mode}.rule${i + 1}`)),
  };
}
