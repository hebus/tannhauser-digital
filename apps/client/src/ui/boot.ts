import { loadDevContent } from '@tannhauser/content';
import type { GameFacade } from '../game-facade';
import { showSetupScreen } from '../setup/setup-screen';
import { defaultSetup, randomSeed, validateSetup, type SetupConfig } from '../setup/setup-config';
import '../../ui.css';
import { detectLocale, setLocale } from './i18n';
import { createGameFromSetup, setupContentOf } from './new-game';
import { lastSetup, setupFromLocation, writeSetupToLocation } from './session';

/**
 * Point d'entrée « avant la partie » : lit la configuration dans l'URL ou affiche l'écran de mise en place,
 * puis renvoie la façade d'une partie démarrée. Remplace `GameFacade.createDev()` dans main.ts.
 */
export async function startFromSetup(): Promise<GameFacade> {
  setLocale(detectLocale(location.search));
  document.documentElement.lang = detectLocale(location.search);
  const content = loadDevContent();
  const available = setupContentOf(content);

  let config: SetupConfig | null = setupFromLocation();
  if (config && validateSetup(config, available).length > 0) config = null;

  if (!config) {
    // Équipes de la dernière partie si elles sont encore valides ; nouvelle graine à chaque mise en place.
    const previous = lastSetup();
    const base = defaultSetup(available, randomSeed());
    const initial: SetupConfig = previous && validateSetup(previous, available).length === 0 ? { ...previous, seed: base.seed } : base;
    config = await showSetupScreen(document.body, { boards: content.boards, characters: content.characters }, initial);
  }
  writeSetupToLocation(config);
  return createGameFromSetup(config, content);
}
