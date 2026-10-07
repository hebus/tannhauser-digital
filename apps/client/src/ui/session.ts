import { decodeSetup, encodeSetup, type SetupConfig } from '../setup/setup-config';

/**
 * La configuration de la partie vit dans le hash de l'URL (`#board=…&seed=…&p1=…&p2=…`) :
 * recharger la page rejoue exactement la même partie, un lien la partage, et une URL sans hash ouvre la mise en place.
 */
const LAST_KEY = 'tannhauser.setup.last';

export function setupFromLocation(): SetupConfig | null {
  return decodeSetup(location.hash);
}

export function writeSetupToLocation(config: SetupConfig): void {
  history.replaceState(null, '', `#${encodeSetup(config)}`);
  try {
    localStorage.setItem(LAST_KEY, encodeSetup(config));
  } catch {
    // stockage indisponible : la dernière configuration n'est pas mémorisée
  }
}

/** Dernière configuration jouée (préremplit l'écran de mise en place). */
export function lastSetup(): SetupConfig | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? decodeSetup(raw) : null;
  } catch {
    return null;
  }
}

/** Rejoue avec la même graine : recharge la page, le hash reconstruit la même partie. */
export function replaySameSeed(): void {
  location.reload();
}

/** Retourne à l'écran de mise en place (hash effacé, dernière configuration conservée comme valeur initiale). */
export function openNewSetup(): void {
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
}
