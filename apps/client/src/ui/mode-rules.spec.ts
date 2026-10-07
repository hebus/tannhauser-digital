// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GAME_MODES } from '../setup/setup-config';
import { EN, FR, setLocale } from './i18n';
import { modeRules } from './mode-rules';

describe('explication des modes de jeu', () => {
  it('chaque mode proposé a un objectif et des règles lisibles (pas de clé brute)', () => {
    setLocale('fr');
    for (const { mode } of GAME_MODES) {
      const info = modeRules(mode);
      expect(info.goal).not.toMatch(/^modeHelp\./);
      expect(info.rules.length).toBeGreaterThan(0);
      for (const rule of info.rules) expect(rule).not.toMatch(/^modeHelp\./);
    }
  });

  it('textes présents en français et en anglais pour chaque mode', () => {
    for (const messages of [FR, EN]) {
      for (const { mode } of GAME_MODES) {
        expect(messages[`mode.${mode}`], mode).toBeTruthy();
        expect(messages[`modeHelp.${mode}.goal`], mode).toBeTruthy();
        expect(messages[`modeHelp.${mode}.rule1`], mode).toBeTruthy();
      }
    }
  });
});
