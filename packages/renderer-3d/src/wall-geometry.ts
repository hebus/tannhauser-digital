// En ESM le paquet n'expose que l'export par défaut (les exports nommés n'existent que sous CommonJS) : import par défaut.
import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon as ClipPolygon } from 'polygon-clipping';

type Geom = ClipPolygon | MultiPolygon;
const { difference, union } = polygonClipping;

/**
 * Géométrie 2D des murs, pure (aucune dépendance à Three.js) donc testable sous Vitest.
 * Les pièces et les couloirs sont fusionnés en UNE empreinte ; les murs sont la bande qui borde cette empreinte
 * (aucun mur au milieu d'un passage) ; une ouverture est ajoutée là où une arête du graphe sort de l'empreinte.
 * Le décalage (épaississement) est fait ici avec des rectangles le long des arêtes : le décalage de clipper2-js
 * est faux même sur un carré, on s'en passe.
 */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Polygone avec trous (`outer` et chaque trou sont des anneaux ouverts : le dernier point n'est pas répété). */
export interface Polygon {
  readonly outer: Pt[];
  readonly holes: Pt[][];
}

export interface CorridorInput {
  readonly points: readonly Pt[];
  readonly width: number;
}

export interface EdgeInput {
  readonly a: Pt;
  readonly b: Pt;
}

export interface WallPlan {
  /** Empreinte jouable (union des pièces et des couloirs). */
  readonly footprint: Polygon[];
  /** Bande de mur qui borde l'empreinte, ouvertures retirées. */
  readonly walls: Polygon[];
}

export interface WallOptions {
  /** Épaisseur du mur, vers l'extérieur de l'empreinte. */
  readonly thickness: number;
  /** Largeur de l'ouverture percée pour une arête qui sort de l'empreinte. */
  readonly openingWidth: number;
  /** Prolongement de chaque bout de couloir : un nœud posé en bout de couloir ne doit pas finir dans le mur. */
  readonly capExtension: number;
}

/** Nombre de points testés le long d'une arête pour savoir si elle sort de l'empreinte. */
const EDGE_SAMPLES = 12;
/** Côtés du polygone qui comble le coude d'un couloir. */
const JOINT_SIDES = 8;

const toRing = (points: readonly Pt[]): ClipPolygon[number] => points.map((p) => [p.x, p.y] as [number, number]);

const toGeom = (points: readonly Pt[]): Geom => [toRing(points)];

function fromMulti(multi: MultiPolygon): Polygon[] {
  return multi.map((poly) => {
    const open = (ring: ClipPolygon[number]): Pt[] => ring.slice(0, -1).map(([x, y]) => ({ x: x!, y: y! }));
    return { outer: open(poly[0]!), holes: poly.slice(1).map(open) };
  });
}

/** Rectangle de demi-largeur `half` autour du segment a → b, prolongé de `extend` à chaque bout. */
function strip(a: Pt, b: Pt, half: number, extend = 0): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const ax = a.x - ux * extend;
  const ay = a.y - uy * extend;
  const bx = b.x + ux * extend;
  const by = b.y + uy * extend;
  const nx = -uy * half;
  const ny = ux * half;
  return [
    { x: ax + nx, y: ay + ny },
    { x: bx + nx, y: by + ny },
    { x: bx - nx, y: by - ny },
    { x: ax - nx, y: ay - ny },
  ];
}

/** Petit polygone régulier qui comble le coude extérieur d'un couloir. */
function joint(center: Pt, radius: number): Pt[] {
  const r = radius / Math.cos(Math.PI / JOINT_SIDES);
  return Array.from({ length: JOINT_SIDES }, (_, i) => {
    const t = ((i + 0.5) / JOINT_SIDES) * Math.PI * 2;
    return { x: center.x + Math.cos(t) * r, y: center.y + Math.sin(t) * r };
  });
}

/** Ligne brisée dont les deux bouts sont prolongés de `extension` dans leur direction. */
function extendEnds(points: readonly Pt[], extension: number): Pt[] {
  if (extension <= 0 || points.length < 2) return [...points];
  const push = (from: Pt, toward: Pt): Pt => {
    const len = Math.hypot(from.x - toward.x, from.y - toward.y) || 1;
    return { x: from.x + ((from.x - toward.x) / len) * extension, y: from.y + ((from.y - toward.y) / len) * extension };
  };
  const last = points.length - 1;
  return points.map((p, i) => (i === 0 ? push(p, points[1]!) : i === last ? push(p, points[last - 1]!) : p));
}

/** Pièces géométriques d'un couloir : un rectangle par tronçon, un polygone à chaque coude. */
function corridorParts(corridor: CorridorInput, capExtension: number): Geom[] {
  const pts = extendEnds(corridor.points, capExtension);
  const half = corridor.width / 2;
  const parts: Geom[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    if (Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y) < 1e-9) continue;
    parts.push(toGeom(strip(pts[i]!, pts[i + 1]!, half)));
  }
  for (let i = 1; i + 1 < pts.length; i++) parts.push(toGeom(joint(pts[i]!, half)));
  return parts;
}

/** Sol d'un couloir (même contour que celui qui entre dans l'empreinte, pour qu'ils coïncident). */
export function corridorPolygons(corridor: CorridorInput, capExtension = 0): Polygon[] {
  const parts = corridorParts(corridor, capExtension);
  return parts.length === 0 ? [] : fromMulti(union(parts[0]!, ...parts.slice(1)));
}

/** Point dans un ensemble de polygones à trous (parité sur tous les anneaux). */
export function pointInPolygons(p: Pt, polygons: readonly Polygon[]): boolean {
  let inside = false;
  const ring = (r: readonly Pt[]): void => {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i]!;
      const b = r[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  };
  for (const poly of polygons) {
    ring(poly.outer);
    poly.holes.forEach(ring);
  }
  return inside;
}

/** Une arête sort de l'empreinte si un de ses points intermédiaires est dehors : un mur la coupe. */
function leavesFootprint(edge: EdgeInput, footprint: readonly Polygon[]): boolean {
  for (let i = 1; i < EDGE_SAMPLES; i++) {
    const t = i / EDGE_SAMPLES;
    if (!pointInPolygons({ x: edge.a.x + (edge.b.x - edge.a.x) * t, y: edge.a.y + (edge.b.y - edge.a.y) * t }, footprint)) return true;
  }
  return false;
}

export function planWalls(
  rooms: readonly (readonly Pt[])[],
  corridors: readonly CorridorInput[],
  edges: readonly EdgeInput[],
  options: WallOptions,
): WallPlan {
  const parts: Geom[] = rooms.map(toGeom);
  for (const c of corridors) parts.push(...corridorParts(c, options.capExtension));
  if (parts.length === 0) return { footprint: [], walls: [] };
  const footprintGeom = union(parts[0]!, ...parts.slice(1));
  const footprint = fromMulti(footprintGeom);

  // Bande de mur : chaque arête du contour épaissie des DEUX côtés (et prolongée aux bouts pour fermer les coins), puis
  // l'empreinte est retirée : il ne reste que le côté extérieur.
  const strips: Geom[] = [];
  for (const poly of footprint) {
    for (const ring of [poly.outer, ...poly.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
        strips.push(toGeom(strip(a, b, options.thickness, options.thickness)));
      }
    }
  }
  let band: MultiPolygon = strips.length === 0 ? [] : difference(union(strips[0]!, ...strips.slice(1)), footprintGeom);

  const openings: Geom[] = edges.filter((e) => leavesFootprint(e, footprint)).map((e) => toGeom(strip(e.a, e.b, options.openingWidth / 2)));
  if (openings.length > 0 && band.length > 0) band = difference(band, union(openings[0]!, ...openings.slice(1)));

  return { footprint, walls: fromMulti(band) };
}

/**
 * Largeur du passage en `center`, mesurée perpendiculairement à `angle` jusqu'aux bords de l'empreinte (de chaque côté,
 * plafonnée à `maxHalf`) : une porte posée là bouche exactement le passage.
 */
export function passageWidth(footprint: readonly Polygon[], center: Pt, angle: number, maxHalf: number, step = 2): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const reach = (sign: 1 | -1): number => {
    let d = 0;
    while (d < maxHalf && pointInPolygons({ x: center.x + dx * (d + step) * sign, y: center.y + dy * (d + step) * sign }, footprint)) d += step;
    return d;
  };
  return reach(1) + reach(-1);
}
