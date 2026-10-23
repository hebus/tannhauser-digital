import type { ViewKind } from './mount';

const STORAGE_KEY = 'tannhauser.view';

export const isViewKind = (value: unknown): value is ViewKind => value === '2d' || value === '3d';

/** Stockage du navigateur, ou `null` s'il est indisponible (navigation privée, données bloquées) : le choix n'est alors pas mémorisé. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Vue au démarrage : paramètre d'URL (`?view=3d`), sinon le dernier choix mémorisé, sinon 2D. */
export function initialView(search: string, storage: Pick<Storage, 'getItem'> | null): ViewKind {
  const fromUrl = new URLSearchParams(search).get('view');
  if (isViewKind(fromUrl)) return fromUrl;
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (isViewKind(saved)) return saved;
  } catch {
    // stockage illisible : on retombe sur la vue par défaut
  }
  return '2d';
}

export function rememberView(view: ViewKind, storage: Pick<Storage, 'setItem'> | null): void {
  try {
    storage?.setItem(STORAGE_KEY, view);
  } catch {
    // quota ou stockage bloqué : le choix vaut pour cette session seulement
  }
}
