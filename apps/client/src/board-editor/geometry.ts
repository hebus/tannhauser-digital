import { nodeRadius, type EdgeRef, type EditorDoc, type EditorLayout, type Pt } from './model';

/** Géométrie pure de l'éditeur, en coordonnées plateau : grille, appartenance aux pièces, et cible sous le pointeur. */

export const snap = (p: Pt, grid: number | null): Pt => (grid ? { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid } : { x: Math.round(p.x), y: Math.round(p.y) });

/** Point dans un polygone (parité ; polygones concaves compris). */
export function pointInPolygon(p: Pt, polygon: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolyline(p: Pt, points: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i]!, points[i + 1]!));
  return best;
}

/** Zone (pièce, sinon couloir) qui contient un point ; `undefined` hors du plan. */
export function zoneAt(layout: EditorLayout | undefined, p: Pt): string | undefined {
  if (!layout) return undefined;
  const room = layout.rooms.find((r) => pointInPolygon(p, r.polygon));
  if (room) return room.id;
  return layout.corridors.find((c) => distanceToPolyline(p, c.points) <= c.width / 2 + 4)?.id;
}

export type Hit =
  | { readonly kind: 'room-vertex'; readonly id: string; readonly index: number }
  | { readonly kind: 'corridor-point'; readonly id: string; readonly index: number }
  /** Milieu du côté qui suit le sommet `index` : y glisser insère un sommet. */
  | { readonly kind: 'room-mid'; readonly id: string; readonly index: number }
  | { readonly kind: 'corridor-mid'; readonly id: string; readonly index: number }
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'portal'; readonly id: string }
  | { readonly kind: 'edge'; readonly ref: EdgeRef }
  | { readonly kind: 'corridor'; readonly id: string }
  | { readonly kind: 'room'; readonly id: string }
  | { readonly kind: 'empty' };

/** Milieux des côtés (fermés pour un polygone) : poignées d'insertion de sommet. */
export function midpoints(points: readonly Pt[], closed: boolean): Pt[] {
  const count = closed ? points.length : points.length - 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  });
}

export interface HitOptions {
  /** Tolérance en unités plateau (pixels écran ÷ zoom). */
  readonly tolerance: number;
  /** Pièce ou couloir dont les sommets sont saisissables (forme sélectionnée). */
  readonly handles?: { readonly kind: 'room' | 'corridor'; readonly id: string } | null;
}

/**
 * Ce qui est sous le pointeur, par priorité : sommet de la forme sélectionnée, case, portail, arête, couloir, pièce,
 * vide. Les pièces viennent en dernier : on y place des cases, et un clic dans le vide d'une pièce la désigne.
 */
export function hitTest(doc: EditorDoc, p: Pt, options: HitOptions): Hit {
  const tol = options.tolerance;
  const handles = options.handles;
  if (handles && doc.layout) {
    const points = handles.kind === 'room' ? doc.layout.rooms.find((r) => r.id === handles.id)?.polygon : doc.layout.corridors.find((c) => c.id === handles.id)?.points;
    const index = (points ?? []).findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol * 1.5);
    if (index >= 0) return handles.kind === 'room' ? { kind: 'room-vertex', id: handles.id, index } : { kind: 'corridor-point', id: handles.id, index };
    const mid = midpoints(points ?? [], handles.kind === 'room').findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol * 1.2);
    if (mid >= 0) return handles.kind === 'room' ? { kind: 'room-mid', id: handles.id, index: mid } : { kind: 'corridor-mid', id: handles.id, index: mid };
  }
  const radius = nodeRadius(doc);
  let nearest: { id: string; d: number } | null = null;
  for (const n of doc.nodes) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= radius + tol && (!nearest || d < nearest.d)) nearest = { id: n.id, d };
  }
  if (nearest) return { kind: 'node', id: nearest.id };
  const at = (id: string) => doc.nodes.find((n) => n.id === id);
  for (const portal of doc.portals ?? []) {
    const a = at(portal.from);
    const b = at(portal.to);
    if (a && b && distanceToSegment(p, a, b) <= tol) return { kind: 'portal', id: portal.id };
  }
  for (const e of doc.edges) {
    const a = at(e.from);
    const b = at(e.to);
    if (a && b && distanceToSegment(p, a, b) <= tol) return { kind: 'edge', ref: { from: e.from, to: e.to } };
  }
  const corridor = doc.layout?.corridors.find((c) => distanceToPolyline(p, c.points) <= c.width / 2);
  if (corridor) return { kind: 'corridor', id: corridor.id };
  const room = doc.layout?.rooms.find((r) => pointInPolygon(p, r.polygon));
  if (room) return { kind: 'room', id: room.id };
  return { kind: 'empty' };
}

/** Nœuds dans un rectangle (sélection au cadre). */
export function nodesInBox(doc: EditorDoc, a: Pt, b: Pt): string[] {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return doc.nodes.filter((n) => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1).map((n) => n.id);
}

/** Emprise de tout le contenu (cases et plan), pour cadrer la vue ; `null` si le plateau est vide. */
export function contentBounds(doc: EditorDoc): { x: number; y: number; width: number; height: number } | null {
  const points: Pt[] = [...doc.nodes, ...(doc.layout?.rooms.flatMap((r) => r.polygon) ?? []), ...(doc.layout?.corridors.flatMap((c) => c.points) ?? [])];
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
