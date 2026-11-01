import { nextId, omit, type EditorDoc } from './model';

/**
 * Caisses en bois : au plus une par case ; fermée, elle rend sa case impraticable (règle du moteur, `isPassable`).
 * Un plateau sans caisse n'a pas de champ `crates` (plateaux existants inchangés).
 */

function withCrates(doc: EditorDoc, crates: NonNullable<EditorDoc['crates']>): EditorDoc {
  return crates.length > 0 ? { ...doc, crates } : omit(doc, 'crates');
}

export const hasCrate = (doc: EditorDoc, nodeId: string): boolean => (doc.crates ?? []).some((c) => c.nodeId === nodeId);

/** Pose ou retire des caisses sur des cases (toutes à `on`). */
export function setCrates(doc: EditorDoc, nodeIds: readonly string[], on: boolean): EditorDoc {
  let crates = [...(doc.crates ?? [])];
  if (!on) return withCrates(doc, crates.filter((c) => !nodeIds.includes(c.nodeId)));
  for (const nodeId of nodeIds) {
    if (crates.some((c) => c.nodeId === nodeId) || !doc.nodes.some((n) => n.id === nodeId)) continue;
    crates = [...crates, { id: nextId(crates.map((c) => c.id), 'crate'), nodeId }];
  }
  return withCrates(doc, crates);
}

/** Outil « caisse » : un clic sur une case pose une caisse, ou retire celle qui y est. */
export const toggleCrate = (doc: EditorDoc, nodeId: string): EditorDoc => setCrates(doc, [nodeId], !hasCrate(doc, nodeId));

/** Suit le renommage d'une case. */
export function renameCrateNode(doc: EditorDoc, oldId: string, newId: string): EditorDoc {
  return doc.crates ? { ...doc, crates: doc.crates.map((c) => (c.nodeId === oldId ? { ...c, nodeId: newId } : c)) } : doc;
}
