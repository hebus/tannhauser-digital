/**
 * Mise en page d'AFFICHAGE d'un plateau non orthogonal (pièces + couloirs), en coordonnées du plateau (celles des
 * nœuds). Pure donnée : le renderer n'y lit aucune règle, qui vient toujours du graphe `BoardState`.
 * Les fonctions ci-dessous sont pures (aucune dépendance à Pixi) pour rester testables sans WebGL.
 */
export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

export interface LayoutRoom {
  readonly id: string;
  /** Clé de libellé (résolue par le client via `label`). */
  readonly nameKey?: string;
  /** Sommets du polygone (simple, convexe ou non), au moins 3. */
  readonly polygon: readonly LayoutPoint[];
  /** Teinte optionnelle "#rrggbb" appliquée au fond de la pièce. */
  readonly fill?: string;
}

export interface LayoutCorridor {
  readonly id: string;
  /** Ligne brisée (au moins 2 points). */
  readonly points: readonly LayoutPoint[];
  /** Largeur du couloir, en unités plateau. */
  readonly width: number;
}

export interface BoardLayout {
  readonly rooms: readonly LayoutRoom[];
  readonly corridors: readonly LayoutCorridor[];
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Centroïde d'un polygone (pondéré par l'aire) ; repli sur la moyenne des sommets si l'aire est nulle. */
export function polygonCentroid(points: readonly LayoutPoint[]): LayoutPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-9) {
    const n = points.length;
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

/** Aire non signée d'un polygone. */
export function polygonArea(points: readonly LayoutPoint[]): number {
  let a2 = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a2 += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a2) / 2;
}

/** Aplatit des points en `[x0, y0, x1, y1, …]` (format attendu par Pixi). */
export function flattenPoints(points: readonly LayoutPoint[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

/** Boîte englobante de polygones et couloirs (largeur des couloirs incluse) ; `null` si le layout est vide. */
export function layoutBounds(layout: BoardLayout): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number, pad = 0): void => {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  };
  for (const r of layout.rooms) for (const p of r.polygon) add(p.x, p.y);
  for (const c of layout.corridors) for (const p of c.points) add(p.x, p.y, c.width / 2);
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union de deux boîtes. */
export function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** Marge d'une boîte (même valeur sur les 4 côtés). */
export function padBox(box: Box, pad: number): Box {
  return { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
}

export interface CorridorSegment {
  readonly a: LayoutPoint;
  readonly b: LayoutPoint;
  readonly length: number;
  /** Angle de la direction a → b (radians). */
  readonly angle: number;
}

/** Découpe une ligne brisée en segments (les segments de longueur nulle, donc les points doublons, sont ignorés). */
export function corridorSegments(points: readonly LayoutPoint[]): CorridorSegment[] {
  const out: CorridorSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-9) continue;
    out.push({ a, b, length, angle: Math.atan2(b.y - a.y, b.x - a.x) });
  }
  return out;
}

export interface DoorGeometry {
  /** Centre de la porte (milieu de l'arête). */
  readonly x: number;
  readonly y: number;
  /** Angle de l'arête a → b (radians). */
  readonly edgeAngle: number;
  /** Angle de la barre de porte : perpendiculaire à l'arête. */
  readonly barAngle: number;
  /** Extrémités de la barre (perpendiculaire à l'arête, centrée au milieu). */
  readonly p1: LayoutPoint;
  readonly p2: LayoutPoint;
}

/** Position et orientation d'une porte portée par l'arête a → b : barre perpendiculaire à l'arête, au milieu. */
export function doorGeometry(a: LayoutPoint, b: LayoutPoint, barLength: number): DoorGeometry {
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  const edgeAngle = Math.atan2(b.y - a.y, b.x - a.x);
  const barAngle = edgeAngle + Math.PI / 2;
  const hx = (Math.cos(barAngle) * barLength) / 2;
  const hy = (Math.sin(barAngle) * barLength) / 2;
  return { x, y, edgeAngle, barAngle, p1: { x: x - hx, y: y - hy }, p2: { x: x + hx, y: y + hy } };
}

/** "#rrggbb" → entier 0xrrggbb ; `undefined` si le format est invalide. */
export function parseHexColor(hex: string | undefined): number | undefined {
  if (!hex) return undefined;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  return m ? parseInt(m[1]!, 16) : undefined;
}
