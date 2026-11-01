import type { BoardJson } from '@tannhauser/content/src/schemas';

/**
 * Modèle de l'éditeur de plateaux (outil de développement, `?editor`). Le document édité EST le JSON du plateau
 * (`BoardJson`, celui de `packages/content/src/data/`) : aucune conversion, ce qui est enregistré est ce qui est vu.
 * Toutes les opérations (`ops-*.ts`) sont pures et renvoient un nouveau document.
 */

export type EditorDoc = BoardJson;
export type EditorNode = BoardJson['nodes'][number];
export type EditorEdge = BoardJson['edges'][number];
export type EditorDoor = NonNullable<BoardJson['doors']>[number];
export type EditorPortal = NonNullable<BoardJson['portals']>[number];
export type EditorLayout = NonNullable<BoardJson['layout']>;
export type EditorRoom = EditorLayout['rooms'][number];
export type EditorCorridor = EditorLayout['corridors'][number];
export type NodeKind = 'NORMAL' | 'OBJECTIVE' | 'ACTION' | 'ENTRY_POINT';

export const NODE_KINDS: readonly NodeKind[] = ['NORMAL', 'ENTRY_POINT', 'OBJECTIVE', 'ACTION'];

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Arête désignée par ses extrémités, dans un sens ou dans l'autre. */
export interface EdgeRef {
  readonly from: string;
  readonly to: string;
}

export type Selection =
  | { readonly kind: 'nodes'; readonly ids: readonly string[] }
  | { readonly kind: 'edge'; readonly ref: EdgeRef }
  | { readonly kind: 'portal'; readonly id: string }
  | { readonly kind: 'room'; readonly id: string }
  | { readonly kind: 'corridor'; readonly id: string }
  | null;

export type Tool = 'select' | 'node' | 'connect' | 'door' | 'portal' | 'crate' | 'room' | 'corridor';

/** Rayon d'une case (unités plateau), comme le rendu 2D (`NODE_RADIUS` / `LAYOUT_NODE_RADIUS` de `board-view.ts`). */
export const nodeRadius = (doc: EditorDoc): number => (doc.layout ? 22 : 26);

export const sameEdge = (e: EdgeRef, ref: EdgeRef): boolean => (e.from === ref.from && e.to === ref.to) || (e.from === ref.to && e.to === ref.from);

/** Plateau vide prêt à éditer. */
export function newBoard(id: string): EditorDoc {
  return { id, nameKey: `board.${id}.name`, nodes: [], edges: [], doors: [], portals: [] };
}

/** Copie sans une clé (une clé optionnelle absente du JSON plutôt qu'à `undefined`). */
export function omit<T extends object, K extends keyof T>(source: T, k: K): Omit<T, K> {
  const copy = { ...source };
  delete copy[k];
  return copy;
}

/** Identifiant libre `<préfixe><n>` (n = plus grand suffixe numérique existant + 1), sur `pad` chiffres. */
export function nextId(existing: Iterable<string>, prefix: string, pad = 1): string {
  let max = 0;
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}
