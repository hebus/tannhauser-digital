import { nextId, omit, sameEdge, type EdgeRef, type EditorDoc, type EditorDoor } from './model';

/** Opérations pures sur les arêtes, les portes et les portails. */

export const findEdge = (doc: EditorDoc, ref: EdgeRef) => doc.edges.find((e) => sameEdge(e, ref));

/** Relie deux cases (rien si elles le sont déjà, dans un sens ou l'autre, ou si c'est la même case). */
export function connect(doc: EditorDoc, a: string, b: string): EditorDoc {
  if (a === b || findEdge(doc, { from: a, to: b })) return doc;
  return { ...doc, edges: [...doc.edges, { from: a, to: b }] };
}

/** Retire une arête et la porte qu'elle portait. */
export function disconnect(doc: EditorDoc, ref: EdgeRef): EditorDoc {
  const edge = findEdge(doc, ref);
  if (!edge) return doc;
  const next = { ...doc, edges: doc.edges.filter((e) => e !== edge) };
  return edge.doorId ? removeUnusedDoors(next) : next;
}

/** Relie deux cases, ou les délie si elles l'étaient (outil « relier »). */
export function toggleEdge(doc: EditorDoc, a: string, b: string): EditorDoc {
  return findEdge(doc, { from: a, to: b }) ? disconnect(doc, { from: a, to: b }) : connect(doc, a, b);
}

const mapEdge = (doc: EditorDoc, ref: EdgeRef, f: (e: EditorDoc['edges'][number]) => EditorDoc['edges'][number]): EditorDoc => ({
  ...doc,
  edges: doc.edges.map((e) => (sameEdge(e, ref) ? f(e) : e)),
});

/** Sens unique : l'arête se parcourt de `from` vers `to` seulement. */
export function setOneWay(doc: EditorDoc, ref: EdgeRef, oneWay: boolean): EditorDoc {
  return mapEdge(doc, ref, (e) => (oneWay ? { ...e, oneWay: true } : omit(e, 'oneWay')));
}

/** Inverse le sens d'une arête (utile pour un sens unique). */
export function reverseEdge(doc: EditorDoc, ref: EdgeRef): EditorDoc {
  return mapEdge(doc, ref, (e) => ({ ...e, from: e.to, to: e.from }));
}

function removeUnusedDoors(doc: EditorDoc): EditorDoc {
  const used = new Set(doc.edges.flatMap((e) => (e.doorId ? [e.doorId] : [])));
  return { ...doc, doors: (doc.doors ?? []).filter((d) => used.has(d.id)) };
}

/** Pose une porte (en bois, fermée par défaut) sur une arête, ou la retire s'il y en a déjà une (outil « porte »). */
export function toggleDoor(doc: EditorDoc, ref: EdgeRef): { doc: EditorDoc; doorId: string | null } {
  const edge = findEdge(doc, ref);
  if (!edge) return { doc, doorId: null };
  if (edge.doorId) {
    const without = mapEdge(doc, ref, (e) => omit(e, 'doorId'));
    return { doc: removeUnusedDoors(without), doorId: null };
  }
  const doorId = nextId((doc.doors ?? []).map((d) => d.id), 'door');
  const door: EditorDoor = { id: doorId, type: 'WOODEN', state: 'CLOSED' };
  return { doc: { ...mapEdge(doc, ref, (e) => ({ ...e, doorId })), doors: [...(doc.doors ?? []), door] }, doorId };
}

export function setDoor(doc: EditorDoc, doorId: string, patch: Partial<Pick<EditorDoor, 'type' | 'state'>>): EditorDoc {
  return { ...doc, doors: (doc.doors ?? []).map((d) => (d.id === doorId ? { ...d, ...patch } : d)) };
}

/** Ajoute un portail (porte secrète) entre deux cases, ou retire celui qui les relie déjà. */
export function togglePortal(doc: EditorDoc, a: string, b: string): { doc: EditorDoc; id: string | null } {
  if (a === b) return { doc, id: null };
  const portals = doc.portals ?? [];
  const existing = portals.find((p) => sameEdge(p, { from: a, to: b }));
  if (existing) return { doc: { ...doc, portals: portals.filter((p) => p !== existing) }, id: null };
  const id = nextId(portals.map((p) => p.id), 'portal');
  return { doc: { ...doc, portals: [...portals, { id, from: a, to: b, type: 'SECRET_DOOR' }] }, id };
}

export function removePortal(doc: EditorDoc, id: string): EditorDoc {
  return { ...doc, portals: (doc.portals ?? []).filter((p) => p.id !== id) };
}
