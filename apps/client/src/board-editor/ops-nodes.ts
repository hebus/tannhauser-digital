import { snap, zoneAt } from './geometry';
import { renameCrateNode, setCrates } from './ops-crates';
import { nextId, omit, type EditorDoc, type EditorNode, type NodeKind, type Pt } from './model';

/** Opérations pures sur les cases. Aucune ne modifie le document reçu. */

type Properties = NonNullable<EditorNode['properties']>;

/** Couleurs par défaut d'une case selon sa zone (convention de `docs/boards.md`) : `r.<pièce>`, `c.<couloir>-a`. */
export function suggestColors(doc: EditorDoc, zoneId: string | undefined): string[] {
  if (zoneId && doc.layout?.rooms.some((r) => r.id === zoneId)) return [`r.${zoneId}`];
  if (zoneId && doc.layout?.corridors.some((c) => c.id === zoneId)) return [`c.${zoneId}-a`];
  return ['red'];
}

/** Ajoute une case au point donné (aligné sur la grille) ; id `<zone>-NN` dans une zone, sinon `n<k>`. */
export function addNode(doc: EditorDoc, p: Pt, options: { grid: number | null; colors?: readonly string[] }): { doc: EditorDoc; id: string } {
  const at = snap(p, options.grid);
  const zoneId = zoneAt(doc.layout, at);
  const ids = doc.nodes.map((n) => n.id);
  const id = zoneId ? nextId(ids, `${zoneId}-`, 2) : nextId(ids, 'n');
  const node: EditorNode = { id, x: at.x, y: at.y, ...(zoneId ? { zoneId } : {}), colors: [...(options.colors ?? suggestColors(doc, zoneId))] };
  return { doc: { ...doc, nodes: [...doc.nodes, node] }, id };
}

/**
 * Déplace des cases depuis leur position d'origine (celle du début du glisser) : chaque case est alignée sur la grille.
 * Une case posée dans une zone du plan en prend l'identifiant ; hors du plan elle garde le sien.
 */
export function moveNodes(doc: EditorDoc, origin: Readonly<Record<string, Pt>>, delta: Pt, grid: number | null): EditorDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const from = origin[n.id];
      if (!from) return n;
      const at = snap({ x: from.x + delta.x, y: from.y + delta.y }, grid);
      const zoneId = zoneAt(doc.layout, at) ?? n.zoneId;
      return { ...n, x: at.x, y: at.y, ...(zoneId ? { zoneId } : {}) };
    }),
  };
}

/** Supprime des cases et tout ce qui les relie (arêtes, portails, caisses), puis les portes devenues inutiles. */
export function deleteNodes(doc: EditorDoc, ids: readonly string[]): EditorDoc {
  const gone = new Set(ids);
  const edges = doc.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
  const used = new Set(edges.flatMap((e) => (e.doorId ? [e.doorId] : [])));
  return {
    ...setCrates(doc, ids, false),
    nodes: doc.nodes.filter((n) => !gone.has(n.id)),
    edges,
    doors: (doc.doors ?? []).filter((d) => used.has(d.id)),
    portals: (doc.portals ?? []).filter((p) => !gone.has(p.from) && !gone.has(p.to)),
  };
}

export type RenameResult = { readonly ok: true; readonly doc: EditorDoc } | { readonly ok: false; readonly reason: string };

/** Renomme une case et met à jour arêtes et portails ; refuse un identifiant vide ou déjà pris. */
export function renameNode(doc: EditorDoc, oldId: string, newId: string): RenameResult {
  const id = newId.trim();
  if (id === oldId) return { ok: true, doc };
  if (!id) return { ok: false, reason: 'Identifiant vide.' };
  if (doc.nodes.some((n) => n.id === id)) return { ok: false, reason: `L'identifiant ${id} est déjà pris.` };
  const swap = (x: string): string => (x === oldId ? id : x);
  return {
    ok: true,
    doc: {
      ...renameCrateNode(doc, oldId, id),
      nodes: doc.nodes.map((n) => (n.id === oldId ? { ...n, id } : n)),
      edges: doc.edges.map((e) => ({ ...e, from: swap(e.from), to: swap(e.to) })),
      portals: (doc.portals ?? []).map((p) => ({ ...p, from: swap(p.from), to: swap(p.to) })),
    },
  };
}

const mapNodes = (doc: EditorDoc, ids: readonly string[], f: (n: EditorNode) => EditorNode): EditorDoc => {
  const set = new Set(ids);
  return { ...doc, nodes: doc.nodes.map((n) => (set.has(n.id) ? f(n) : n)) };
};

export function setNodePosition(doc: EditorDoc, id: string, p: Pt): EditorDoc {
  return mapNodes(doc, [id], (n) => ({ ...n, x: p.x, y: p.y }));
}

/** Couleurs de ligne de vue : sans blancs ni doublons (le validateur signale toujours plus de 3 couleurs). */
export function setNodeColors(doc: EditorDoc, ids: readonly string[], colors: readonly string[]): EditorDoc {
  const clean = [...new Set(colors.map((c) => c.trim()).filter((c) => c.length > 0))];
  return mapNodes(doc, ids, (n) => ({ ...n, colors: clean }));
}

export interface PropertiesPatch {
  readonly kind?: NodeKind;
  readonly passable?: boolean;
  readonly movementCostModifier?: number;
}

/** Propriétés de jeu ; une valeur par défaut est retirée du JSON (comme les plateaux écrits à la main), `modifiers` est conservé. */
export function setNodeProperties(doc: EditorDoc, ids: readonly string[], patch: PropertiesPatch): EditorDoc {
  return mapNodes(doc, ids, (n) => {
    const merged: Properties = { ...n.properties, ...patch };
    const properties: Properties = {
      ...(merged.kind && merged.kind !== 'NORMAL' ? { kind: merged.kind } : {}),
      ...(merged.passable === false ? { passable: false } : {}),
      ...(merged.movementCostModifier ? { movementCostModifier: merged.movementCostModifier } : {}),
      ...(merged.modifiers && merged.modifiers.length > 0 ? { modifiers: merged.modifiers } : {}),
    };
    return Object.keys(properties).length > 0 ? { ...n, properties } : omit(n, 'properties');
  });
}

/** Zone explicite (`undefined` : aucune). */
export function setNodeZone(doc: EditorDoc, ids: readonly string[], zoneId: string | undefined): EditorDoc {
  return mapNodes(doc, ids, (n) => (zoneId ? { ...n, zoneId } : omit(n, 'zoneId')));
}

/** Recalcule la zone de chaque case d'après le plan (une case hors du plan garde sa zone). */
export function assignZones(doc: EditorDoc): EditorDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const zoneId = zoneAt(doc.layout, n);
      return zoneId && zoneId !== n.zoneId ? { ...n, zoneId } : n;
    }),
  };
}

export function setBoardMeta(doc: EditorDoc, patch: { readonly nameKey?: string }): EditorDoc {
  return { ...doc, ...(patch.nameKey !== undefined ? { nameKey: patch.nameKey } : {}) };
}
