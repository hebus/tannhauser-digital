/**
 * Historique d'édition (annuler / rétablir). Les étapes d'un même geste (glisser une case, taper dans un champ) sont
 * fusionnées grâce à une clé : un glisser entier s'annule d'un coup. Pur et générique.
 */

export const HISTORY_LIMIT = 200;

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** Clé de fusion de la dernière étape (même clé = même étape). */
  readonly lastKey: string | null;
  /** État enregistré (sur disque) : sert à savoir s'il reste des modifications. */
  readonly saved: T;
}

export const createHistory = <T>(initial: T): History<T> => ({ past: [], present: initial, future: [], lastKey: null, saved: initial });

export function commit<T>(h: History<T>, next: T, key: string | null = null): History<T> {
  if (next === h.present) return h;
  if (key !== null && key === h.lastKey) return { ...h, present: next, future: [] };
  return { ...h, past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], lastKey: key };
}

export function undo<T>(h: History<T>): History<T> {
  const previous = h.past[h.past.length - 1];
  if (previous === undefined) return h;
  return { ...h, past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastKey: null };
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return { ...h, past: [...h.past, h.present], present: next, future: rest, lastKey: null };
}

/** Clôt l'étape en cours : la prochaine modification ne se fusionnera pas avec elle. */
export const seal = <T>(h: History<T>): History<T> => (h.lastKey === null ? h : { ...h, lastKey: null });

export const markSaved = <T>(h: History<T>, saved: T = h.present): History<T> => ({ ...h, saved, lastKey: null });

export const isDirty = <T>(h: History<T>): boolean => h.present !== h.saved;
