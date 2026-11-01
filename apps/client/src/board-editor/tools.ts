import { nodesInBox, snap, type Hit } from './geometry';
import type { EditorDoc, Pt, Selection, Tool } from './model';
import { disconnect, toggleDoor, toggleEdge, togglePortal, removePortal } from './ops-edges';
import { addCorridor, addRoom, deleteShape, deleteVertex, insertVertex, moveShape, moveVertex } from './ops-layout';
import { toggleCrate } from './ops-crates';
import { addNode, deleteNodes, moveNodes } from './ops-nodes';

/**
 * Outils de l'éditeur, sous forme d'automate pur : un événement de pointeur (position plateau + cible) donne le nouvel
 * état de l'outil et le nouveau document. La vue ne fait que traduire les événements du DOM et redessiner.
 */

type Shape = 'room' | 'corridor';

export type Gesture =
  | { readonly type: 'idle' }
  | { readonly type: 'nodes'; readonly origin: Readonly<Record<string, Pt>>; readonly start: Pt }
  | { readonly type: 'box'; readonly start: Pt; readonly current: Pt; readonly additive: boolean; readonly fallback: Selection }
  | { readonly type: 'vertex'; readonly shape: Shape; readonly id: string; readonly index: number }
  | { readonly type: 'shape'; readonly shape: Shape; readonly id: string; readonly start: Pt; readonly base: EditorDoc };

export interface ToolState {
  readonly tool: Tool;
  readonly selection: Selection;
  readonly gesture: Gesture;
  /** Première case choisie par « relier » ou « portail ». */
  readonly pending: string | null;
  /** Points de la pièce ou du couloir en cours de tracé. */
  readonly draft: readonly Pt[];
  /** Numéro du geste en cours : clé de fusion de l'historique (un glisser = une étape). */
  readonly gestureCount: number;
}

export interface PointerInput {
  readonly world: Pt;
  readonly hit: Hit;
  readonly shift: boolean;
  /** Alt : glisser sans aligner sur la grille. */
  readonly alt: boolean;
  readonly grid: number | null;
  /** Tolérance (unités plateau) d'un clic : en deçà, un glisser reste un clic. */
  readonly tolerance: number;
}

export interface Step {
  readonly state: ToolState;
  readonly doc: EditorDoc;
  /** Clé de fusion pour l'historique (`null` : étape à part). */
  readonly key: string | null;
}

export const initialToolState = (tool: Tool = 'select'): ToolState => ({ tool, selection: null, gesture: { type: 'idle' }, pending: null, draft: [], gestureCount: 0 });

export const setTool = (state: ToolState, tool: Tool): ToolState => ({ ...state, tool, pending: null, draft: [], gesture: { type: 'idle' } });

/** Échap : abandonne le tracé, la case en attente et le geste ; sinon vide la sélection. */
export function cancel(state: ToolState): ToolState {
  if (state.pending !== null || state.draft.length > 0 || state.gesture.type !== 'idle') return { ...state, pending: null, draft: [], gesture: { type: 'idle' } };
  return { ...state, selection: null };
}

const key = (state: ToolState): string => `g${state.gestureCount}`;
const selectedNodes = (s: Selection): readonly string[] => (s?.kind === 'nodes' ? s.ids : []);

function originOf(doc: EditorDoc, ids: readonly string[]): Record<string, Pt> {
  const origin: Record<string, Pt> = {};
  for (const n of doc.nodes) if (ids.includes(n.id)) origin[n.id] = { x: n.x, y: n.y };
  return origin;
}

/** Appui avec l'outil de sélection (aussi utilisé par l'outil « case » sur une case existante). */
function selectDown(state: ToolState, doc: EditorDoc, input: PointerInput): Step {
  const { hit, world } = input;
  const done = (s: Partial<ToolState>): Step => ({ state: { ...state, ...s }, doc, key: null });
  switch (hit.kind) {
    case 'room-vertex':
    case 'corridor-point': {
      const shape = hit.kind === 'room-vertex' ? 'room' : 'corridor';
      // Alt + clic sur un sommet : le retirer.
      if (input.alt) return { state, doc: deleteVertex(doc, shape, hit.id, hit.index), key: null };
      return done({ gesture: { type: 'vertex', shape, id: hit.id, index: hit.index } });
    }
    case 'room-mid':
    case 'corridor-mid': {
      // Glisser depuis le milieu d'un côté : un nouveau sommet y naît et suit le pointeur (une seule étape d'historique).
      const shape = hit.kind === 'room-mid' ? 'room' : 'corridor';
      return { state: { ...state, gesture: { type: 'vertex', shape, id: hit.id, index: hit.index + 1 } }, doc: insertVertex(doc, shape, hit.id, hit.index), key: key(state) };
    }
    case 'node': {
      const current = selectedNodes(state.selection);
      if (input.shift) {
        const ids = current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id];
        return done({ selection: ids.length > 0 ? { kind: 'nodes', ids } : null });
      }
      const ids = current.includes(hit.id) ? current : [hit.id];
      return done({ selection: { kind: 'nodes', ids }, gesture: { type: 'nodes', origin: originOf(doc, ids), start: world } });
    }
    case 'edge':
      return done({ selection: { kind: 'edge', ref: hit.ref } });
    case 'portal':
      return done({ selection: { kind: 'portal', id: hit.id } });
    case 'room':
    case 'corridor': {
      const s = state.selection;
      if (s?.kind === hit.kind && s.id === hit.id && !input.shift) {
        return done({ gesture: { type: 'shape', shape: hit.kind, id: hit.id, start: world, base: doc } });
      }
      return done({ gesture: { type: 'box', start: world, current: world, additive: input.shift, fallback: { kind: hit.kind, id: hit.id } } });
    }
    case 'empty':
      return done({ gesture: { type: 'box', start: world, current: world, additive: input.shift, fallback: null } });
  }
}

export function pointerDown(state: ToolState, doc: EditorDoc, input: PointerInput): Step {
  const { hit } = input;
  const next = { ...state, gestureCount: state.gestureCount + 1 };
  switch (state.tool) {
    case 'select':
      return selectDown(next, doc, input);
    case 'node': {
      if (hit.kind !== 'empty' && hit.kind !== 'room' && hit.kind !== 'corridor' && hit.kind !== 'edge' && hit.kind !== 'portal') return selectDown(next, doc, input);
      const added = addNode(doc, input.world, { grid: input.grid });
      const node = added.doc.nodes.find((n) => n.id === added.id)!;
      // La case créée suit le pointeur tant qu'il reste appuyé (même étape d'historique).
      return {
        state: { ...next, selection: { kind: 'nodes', ids: [added.id] }, gesture: { type: 'nodes', origin: { [added.id]: { x: node.x, y: node.y } }, start: input.world } },
        doc: added.doc,
        key: key(next),
      };
    }
    case 'connect':
    case 'portal': {
      if (hit.kind !== 'node') return { state: { ...next, pending: null }, doc, key: null };
      if (next.pending === null || next.pending === hit.id) return { state: { ...next, pending: hit.id, selection: { kind: 'nodes', ids: [hit.id] } }, doc, key: null };
      if (state.tool === 'connect') {
        // Relier en chaîne : la case cliquée devient le départ de l'arête suivante.
        return { state: { ...next, pending: hit.id, selection: { kind: 'nodes', ids: [hit.id] } }, doc: toggleEdge(doc, next.pending, hit.id), key: null };
      }
      const portal = togglePortal(doc, next.pending, hit.id);
      return { state: { ...next, pending: null, selection: portal.id ? { kind: 'portal', id: portal.id } : null }, doc: portal.doc, key: null };
    }
    case 'crate': {
      if (hit.kind !== 'node') return selectDown(next, doc, input);
      return { state: { ...next, selection: { kind: 'nodes', ids: [hit.id] } }, doc: toggleCrate(doc, hit.id), key: null };
    }
    case 'door': {
      if (hit.kind !== 'edge') return selectDown(next, doc, input);
      return { state: { ...next, selection: { kind: 'edge', ref: hit.ref } }, doc: toggleDoor(doc, hit.ref).doc, key: null };
    }
    case 'room':
    case 'corridor': {
      const p = snap(input.world, input.grid);
      const first = next.draft[0];
      // Pièce : cliquer près du premier sommet ferme le polygone.
      if (state.tool === 'room' && first && next.draft.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) <= input.tolerance * 1.5) return finishDraft(next, doc);
      return { state: { ...next, draft: [...next.draft, p] }, doc, key: null };
    }
  }
}

export function pointerMove(state: ToolState, doc: EditorDoc, input: PointerInput): Step {
  const g = state.gesture;
  const grid = input.alt ? null : input.grid;
  const delta = (start: Pt): Pt => ({ x: input.world.x - start.x, y: input.world.y - start.y });
  switch (g.type) {
    case 'nodes':
      return { state, doc: moveNodes(doc, g.origin, delta(g.start), grid), key: key(state) };
    case 'box':
      return { state: { ...state, gesture: { ...g, current: input.world } }, doc, key: null };
    case 'vertex':
      return { state, doc: moveVertex(doc, g.shape, g.id, g.index, input.world, grid), key: key(state) };
    case 'shape': {
      const d = snap(delta(g.start), grid);
      return { state, doc: moveShape(g.base, g.shape, g.id, d, true), key: key(state) };
    }
    case 'idle':
      return { state, doc, key: null };
  }
}

export function pointerUp(state: ToolState, doc: EditorDoc, input: PointerInput): Step {
  const g = state.gesture;
  const idle = { ...state, gesture: { type: 'idle' } as const };
  if (g.type !== 'box') return { state: idle, doc, key: null };
  const moved = Math.hypot(g.current.x - g.start.x, g.current.y - g.start.y) > input.tolerance;
  if (!moved) return { state: { ...idle, selection: g.additive ? state.selection : g.fallback }, doc, key: null };
  const inBox = nodesInBox(doc, g.start, g.current);
  const ids = g.additive ? [...new Set([...selectedNodes(state.selection), ...inBox])] : inBox;
  return { state: { ...idle, selection: ids.length > 0 ? { kind: 'nodes', ids } : null }, doc, key: null };
}

/** Termine le tracé (Entrée, double-clic) : pièce d'au moins 3 sommets, couloir d'au moins 2 points. */
export function finishDraft(state: ToolState, doc: EditorDoc): Step {
  const reset = { ...state, draft: [] as Pt[] };
  if (state.tool === 'room' && state.draft.length >= 3) {
    const room = addRoom(doc, state.draft);
    return { state: { ...reset, selection: { kind: 'room', id: room.id } }, doc: room.doc, key: null };
  }
  if (state.tool === 'corridor' && state.draft.length >= 2) {
    const corridor = addCorridor(doc, state.draft);
    return { state: { ...reset, selection: { kind: 'corridor', id: corridor.id } }, doc: corridor.doc, key: null };
  }
  return { state: reset, doc, key: null };
}

/** Supprime ce qui est sélectionné (cases avec leurs liens, arête, portail, pièce ou couloir). */
export function deleteSelection(doc: EditorDoc, selection: Selection): EditorDoc {
  switch (selection?.kind) {
    case 'nodes':
      return deleteNodes(doc, selection.ids);
    case 'edge':
      return disconnect(doc, selection.ref);
    case 'portal':
      return removePortal(doc, selection.id);
    case 'room':
    case 'corridor':
      return deleteShape(doc, selection.kind, selection.id);
    default:
      return doc;
  }
}
