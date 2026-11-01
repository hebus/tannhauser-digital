import { snap } from './geometry';
import { nextId, omit, type EditorDoc, type EditorLayout, type Pt } from './model';

/** Opérations pures sur le plan (pièces en polygones, couloirs en lignes brisées). */

const layoutOf = (doc: EditorDoc): EditorLayout => doc.layout ?? { rooms: [], corridors: [] };

/** Remplace le plan ; un plan vide disparaît du JSON (plateau « grille » simple). */
function withLayout(doc: EditorDoc, layout: EditorLayout): EditorDoc {
  const rest = omit(doc, 'layout');
  return layout.rooms.length === 0 && layout.corridors.length === 0 ? rest : { ...rest, layout };
}

const zoneIds = (doc: EditorDoc): string[] => [...layoutOf(doc).rooms.map((r) => r.id), ...layoutOf(doc).corridors.map((c) => c.id)];

export const DEFAULT_CORRIDOR_WIDTH = 60;

export function addRoom(doc: EditorDoc, polygon: readonly Pt[]): { doc: EditorDoc; id: string } {
  const layout = layoutOf(doc);
  const id = nextId(zoneIds(doc), 'piece-');
  return { doc: withLayout(doc, { ...layout, rooms: [...layout.rooms, { id, nameKey: id, polygon: polygon.map((p) => ({ x: p.x, y: p.y })) }] }), id };
}

export function addCorridor(doc: EditorDoc, points: readonly Pt[], width = DEFAULT_CORRIDOR_WIDTH): { doc: EditorDoc; id: string } {
  const layout = layoutOf(doc);
  const id = nextId(zoneIds(doc), 'couloir-');
  return { doc: withLayout(doc, { ...layout, corridors: [...layout.corridors, { id, points: points.map((p) => ({ x: p.x, y: p.y })), width }] }), id };
}

type Shape = 'room' | 'corridor';

/** Applique `f` aux points d'une pièce (polygone) ou d'un couloir (ligne brisée). */
function mapPoints(doc: EditorDoc, shape: Shape, id: string, f: (points: Pt[]) => Pt[]): EditorDoc {
  const layout = layoutOf(doc);
  return shape === 'room'
    ? withLayout(doc, { ...layout, rooms: layout.rooms.map((r) => (r.id === id ? { ...r, polygon: f([...r.polygon]) } : r)) })
    : withLayout(doc, { ...layout, corridors: layout.corridors.map((c) => (c.id === id ? { ...c, points: f([...c.points]) } : c)) });
}

export function moveVertex(doc: EditorDoc, shape: Shape, id: string, index: number, p: Pt, grid: number | null): EditorDoc {
  return mapPoints(doc, shape, id, (points) => points.map((q, i) => (i === index ? snap(p, grid) : q)));
}

/** Insère un sommet au milieu du côté qui suit `index` (pour affiner une forme). */
export function insertVertex(doc: EditorDoc, shape: Shape, id: string, index: number): EditorDoc {
  return mapPoints(doc, shape, id, (points) => {
    const a = points[index];
    const b = shape === 'room' ? points[(index + 1) % points.length] : points[index + 1];
    if (!a || !b) return points;
    return [...points.slice(0, index + 1), { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }, ...points.slice(index + 1)];
  });
}

/** Retire un sommet, sans descendre sous 3 (pièce) ou 2 (couloir). */
export function deleteVertex(doc: EditorDoc, shape: Shape, id: string, index: number): EditorDoc {
  const min = shape === 'room' ? 3 : 2;
  return mapPoints(doc, shape, id, (points) => (points.length > min ? points.filter((_, i) => i !== index) : points));
}

/** Déplace une forme entière ; avec ses cases (celles de sa zone) si `withNodes`. */
export function moveShape(doc: EditorDoc, shape: Shape, id: string, delta: Pt, withNodes: boolean): EditorDoc {
  const moved = mapPoints(doc, shape, id, (points) => points.map((q) => ({ x: q.x + delta.x, y: q.y + delta.y })));
  if (!withNodes) return moved;
  return { ...moved, nodes: moved.nodes.map((n) => (n.zoneId === id ? { ...n, x: n.x + delta.x, y: n.y + delta.y } : n)) };
}

export function setRoom(doc: EditorDoc, id: string, patch: { readonly nameKey?: string; readonly fill?: string | null }): EditorDoc {
  const layout = layoutOf(doc);
  return withLayout(doc, {
    ...layout,
    rooms: layout.rooms.map((r) => {
      if (r.id !== id) return r;
      const rest = omit(r, 'fill');
      const fill = patch.fill === undefined ? r.fill : (patch.fill ?? undefined);
      return { ...rest, ...(patch.nameKey !== undefined ? { nameKey: patch.nameKey } : {}), ...(fill ? { fill } : {}) };
    }),
  });
}

export function setCorridorWidth(doc: EditorDoc, id: string, width: number): EditorDoc {
  const layout = layoutOf(doc);
  return withLayout(doc, { ...layout, corridors: layout.corridors.map((c) => (c.id === id ? { ...c, width: Math.max(1, width) } : c)) });
}

export type ZoneRenameResult = { readonly ok: true; readonly doc: EditorDoc } | { readonly ok: false; readonly reason: string };

/** Renomme une pièce ou un couloir : la zone des cases suit, ainsi que leurs couleurs de convention (`r.<id>`, `c.<id>-x`). */
export function renameZone(doc: EditorDoc, oldId: string, newId: string): ZoneRenameResult {
  const id = newId.trim();
  if (id === oldId) return { ok: true, doc };
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return { ok: false, reason: 'Identifiant de zone : minuscules, chiffres et tirets.' };
  if (zoneIds(doc).includes(id)) return { ok: false, reason: `La zone ${id} existe déjà.` };
  const layout = layoutOf(doc);
  const color = (c: string): string => (c === `r.${oldId}` ? `r.${id}` : c.startsWith(`c.${oldId}-`) ? `c.${id}-${c.slice(`c.${oldId}-`.length)}` : c);
  return {
    ok: true,
    doc: {
      ...withLayout(doc, {
        rooms: layout.rooms.map((r) => (r.id === oldId ? { ...r, id, ...(r.nameKey === oldId ? { nameKey: id } : {}) } : r)),
        corridors: layout.corridors.map((c) => (c.id === oldId ? { ...c, id } : c)),
      }),
      nodes: doc.nodes.map((n) => (n.zoneId === oldId ? { ...n, zoneId: id, colors: n.colors.map(color) } : { ...n, colors: n.colors.map(color) })),
    },
  };
}

/** Supprime une pièce ou un couloir ; ses cases restent, sans zone. */
export function deleteShape(doc: EditorDoc, shape: Shape, id: string): EditorDoc {
  const layout = layoutOf(doc);
  const next = withLayout(doc, {
    rooms: shape === 'room' ? layout.rooms.filter((r) => r.id !== id) : layout.rooms,
    corridors: shape === 'corridor' ? layout.corridors.filter((c) => c.id !== id) : layout.corridors,
  });
  return {
    ...next,
    nodes: next.nodes.map((n) => (n.zoneId === id ? omit(n, 'zoneId') : n)),
  };
}
