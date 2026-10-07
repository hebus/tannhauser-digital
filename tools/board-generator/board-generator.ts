import { ContentError, loadBoard, type BoardJson } from '@tannhauser/content';

/**
 * Générateur de plateaux « non orthogonaux » : décrit une carte par pièces (polygones), couloirs (lignes brisées),
 * portes, portails et cases spéciales, et produit le JSON de plateau (nœuds, arêtes, portes, portails, mise en page).
 *
 * Pur et déterministe : aucune lecture de fichier, aucun aléa, tri stable. Le résultat passe TOUJOURS par
 * `loadBoard` (schéma + `validateBoard` du moteur) : une carte invalide fait échouer la génération.
 * Voir `docs/boards.md` pour le guide de création de carte.
 */

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface RoomSpec {
  readonly id: string;
  readonly nameKey: string;
  /** Contour fermé (affichage + pavage). */
  readonly polygon: readonly Pt[];
  /** Remplissage d'affichage "#rrggbb". */
  readonly fill?: string;
  /** Couleur de ligne de vue de TOUS les nœuds de la pièce. */
  readonly color: string;
  /** Pas du pavage (défaut 100) ; sert aussi à relier les cases voisines (distance ≤ 1,5 × pas). */
  readonly pitch?: number;
  /** Distance minimale d'une case au bord du polygone (défaut 0,2 × pas). */
  readonly margin?: number;
  /** Origine du pavage (défaut : moyenne des sommets). */
  readonly origin?: Pt;
  /** Liste explicite de cases : remplace le pavage automatique. */
  readonly cells?: readonly Pt[];
}

export interface DoorSpec {
  readonly id: string;
  readonly type: 'WOODEN' | 'REINFORCED';
  readonly state: 'OPEN' | 'CLOSED';
}

/** Extrémité d'un couloir : rattachée à une pièce (seuil, porte facultative) ou libre (cul-de-sac / extérieur). */
export type CorridorEnd = { readonly room: string; readonly door?: string } | { readonly free: true };

export interface CorridorSpec {
  readonly id: string;
  readonly width: number;
  /** Ligne brisée (≥ 2 points, diagonales permises) : un nœud à chaque sommet et des nœuds espacés régulièrement. */
  readonly points: readonly Pt[];
  /** Une couleur par segment (`points.length - 1`) : changer de couleur à un coude coupe la ligne de vue. */
  readonly colors: readonly string[];
  readonly from: CorridorEnd;
  readonly to: CorridorEnd;
  /** Espacement cible des nœuds sur un segment (défaut 100). */
  readonly spacing?: number;
}

export interface MarkSpec {
  /** Nœud le plus proche de ce point (à `MARK_TOLERANCE` près). */
  readonly at: Pt;
  readonly kind?: 'NORMAL' | 'OBJECTIVE' | 'ACTION' | 'ENTRY_POINT';
  readonly passable?: boolean;
  readonly movementCostModifier?: number;
}

export interface PortalSpec {
  readonly id: string;
  readonly from: Pt;
  readonly to: Pt;
}

export interface OneWaySpec {
  /** Nœuds (les plus proches) d'une arête existante : déplacement autorisé de `from` vers `to` seulement. */
  readonly from: Pt;
  readonly to: Pt;
}

export interface BoardSpec {
  readonly id: string;
  readonly nameKey: string;
  readonly rooms: readonly RoomSpec[];
  readonly corridors: readonly CorridorSpec[];
  readonly doors?: readonly DoorSpec[];
  readonly marks?: readonly MarkSpec[];
  readonly portals?: readonly PortalSpec[];
  readonly oneWays?: readonly OneWaySpec[];
}

export class GeneratorError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Carte invalide :\n- ${problems.join('\n- ')}`);
    this.name = 'GeneratorError';
  }
}

/** Distance maximale entre un point de la spec et le nœud retenu (cases spéciales, portails, sens uniques). */
export const MARK_TOLERANCE = 30;

interface MutableNode {
  id: string;
  x: number;
  y: number;
  zoneId: string;
  colors: string[];
  kind: NonNullable<MarkSpec['kind']>;
  passable: boolean;
  movementCostModifier: number;
  room?: string;
}

interface MutableEdge {
  from: string;
  to: string;
  oneWay?: boolean;
  doorId?: string;
}

const round = (n: number): number => Math.round(n * 100) / 100;
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const pad = (n: number): string => String(n).padStart(2, '0');

function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function distanceToPolygonEdge(p: Pt, poly: readonly Pt[]): number {
  return Math.min(...poly.map((a, i) => distanceToSegment(p, a, poly[(i + 1) % poly.length]!)));
}

function roomCells(room: RoomSpec): Pt[] {
  if (room.cells) return room.cells.map((c) => ({ x: round(c.x), y: round(c.y) }));
  const pitch = room.pitch ?? 100;
  const margin = room.margin ?? pitch * 0.2;
  const origin = room.origin ?? {
    x: room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length,
    y: room.polygon.reduce((s, p) => s + p.y, 0) / room.polygon.length,
  };
  const xs = room.polygon.map((p) => p.x);
  const ys = room.polygon.map((p) => p.y);
  const cells: Pt[] = [];
  for (let j = Math.floor((Math.min(...ys) - origin.y) / pitch) - 1; j <= Math.ceil((Math.max(...ys) - origin.y) / pitch) + 1; j += 1) {
    for (let i = Math.floor((Math.min(...xs) - origin.x) / pitch) - 1; i <= Math.ceil((Math.max(...xs) - origin.x) / pitch) + 1; i += 1) {
      const p = { x: round(origin.x + i * pitch), y: round(origin.y + j * pitch) };
      if (pointInPolygon(p, room.polygon) && distanceToPolygonEdge(p, room.polygon) >= margin) cells.push(p);
    }
  }
  return cells;
}

function nearest<T extends Pt>(nodes: readonly T[], p: Pt): { node: T; d: number } | null {
  let best: { node: T; d: number } | null = null;
  for (const n of nodes) {
    const d = dist(n, p);
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && (n as unknown as { id: string }).id < (best.node as unknown as { id: string }).id)) best = { node: n, d };
  }
  return best;
}

/** Construit le JSON de plateau (validé par `loadBoard`). Lève `GeneratorError` si la carte est invalide. */
export function generateBoard(spec: BoardSpec): BoardJson {
  const problems: string[] = [];
  const nodes: MutableNode[] = [];
  const edges: MutableEdge[] = [];
  const colorsOfRoom = new Map<string, string>();
  const roomNodes = new Map<string, MutableNode[]>();

  const seenIds = new Set<string>();
  for (const id of [...spec.rooms.map((r) => r.id), ...spec.corridors.map((c) => c.id)]) {
    if (seenIds.has(id)) problems.push(`Identifiant de pièce/couloir dupliqué : ${id}`);
    seenIds.add(id);
  }

  // 1. Pièces : cases (pavage ou liste explicite), triées par (y, x) pour des ids stables, reliées entre voisines.
  for (const room of spec.rooms) {
    colorsOfRoom.set(room.id, room.color);
    if (room.polygon.length < 3) problems.push(`Pièce ${room.id} : polygone de moins de 3 points`);
    const cells = roomCells(room).sort((a, b) => a.y - b.y || a.x - b.x);
    if (cells.length === 0) problems.push(`Pièce ${room.id} : aucune case (polygone trop petit pour le pas ?)`);
    const list = cells.map<MutableNode>((c, i) => ({
      id: `${room.id}-${pad(i + 1)}`,
      x: c.x,
      y: c.y,
      zoneId: room.id,
      colors: [room.color],
      kind: 'NORMAL',
      passable: true,
      movementCostModifier: 0,
      room: room.id,
    }));
    roomNodes.set(room.id, list);
    nodes.push(...list);
    const link = (room.pitch ?? 100) * 1.5 + 1e-6;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]!;
        const b = list[j]!;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (dist(a, b) <= link && pointInPolygon(mid, room.polygon)) edges.push({ from: a.id, to: b.id });
      }
    }
  }

  // 2. Couloirs : un nœud à chaque sommet + subdivisions régulières ; couleur par segment (coudes bicolores).
  const usedDoors = new Set<string>();
  const doorIds = new Set((spec.doors ?? []).map((d) => d.id));
  const layoutCorridors: { id: string; points: Pt[]; width: number }[] = [];
  for (const cor of spec.corridors) {
    if (cor.points.length < 2) {
      problems.push(`Couloir ${cor.id} : au moins 2 points`);
      continue;
    }
    if (cor.colors.length !== cor.points.length - 1) {
      problems.push(`Couloir ${cor.id} : ${cor.colors.length} couleur(s) pour ${cor.points.length - 1} segment(s)`);
      continue;
    }
    const spacing = cor.spacing ?? 100;
    const chain: MutableNode[] = [];
    let counter = 0;
    const add = (p: Pt, colors: string[]): MutableNode => {
      counter += 1;
      const node: MutableNode = {
        id: `${cor.id}-${pad(counter)}`,
        x: round(p.x),
        y: round(p.y),
        zoneId: cor.id,
        colors: [...new Set(colors)],
        kind: 'NORMAL',
        passable: true,
        movementCostModifier: 0,
      };
      chain.push(node);
      return node;
    };
    cor.points.forEach((p, v) => {
      const own = [...(v > 0 ? [cor.colors[v - 1]!] : []), ...(v < cor.points.length - 1 ? [cor.colors[v]!] : [])];
      add(p, own);
      if (v < cor.points.length - 1) {
        const q = cor.points[v + 1]!;
        const n = Math.max(1, Math.round(dist(p, q) / spacing));
        for (let k = 1; k < n; k += 1) add({ x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n }, [cor.colors[v]!]);
      }
    });
    nodes.push(...chain);
    for (let i = 0; i + 1 < chain.length; i += 1) edges.push({ from: chain[i]!.id, to: chain[i + 1]!.id });

    const layoutPoints: Pt[] = cor.points.map((p) => ({ x: round(p.x), y: round(p.y) }));
    const attach = (end: CorridorEnd, corridorNode: MutableNode, color: string, atStart: boolean): void => {
      if ('free' in end) return;
      const candidates = roomNodes.get(end.room);
      if (!candidates) {
        problems.push(`Couloir ${cor.id} : pièce inconnue ${end.room}`);
        return;
      }
      const hit = nearest(candidates, corridorNode);
      const room = spec.rooms.find((r) => r.id === end.room)!;
      if (!hit || hit.d > (room.pitch ?? 100) * 1.6) {
        problems.push(`Couloir ${cor.id} : trop loin de la pièce ${end.room} (seuil à ${hit ? round(hit.d) : '∞'})`);
        return;
      }
      const threshold = hit.node;
      if (!threshold.colors.includes(color)) threshold.colors.push(color); // seuil : couleur de la pièce + du couloir
      if (end.door !== undefined) {
        if (!doorIds.has(end.door)) problems.push(`Couloir ${cor.id} : porte inconnue ${end.door}`);
        usedDoors.add(end.door);
      }
      edges.push({ from: threshold.id, to: corridorNode.id, ...(end.door !== undefined ? { doorId: end.door } : {}) });
      const tp = { x: threshold.x, y: threshold.y };
      if (atStart) layoutPoints.unshift(tp);
      else layoutPoints.push(tp);
    };
    attach(cor.from, chain[0]!, cor.colors[0]!, true);
    attach(cor.to, chain[chain.length - 1]!, cor.colors[cor.colors.length - 1]!, false);
    layoutCorridors.push({ id: cor.id, points: layoutPoints, width: cor.width });
  }
  for (const id of doorIds) if (!usedDoors.has(id)) problems.push(`Porte ${id} définie mais portée par aucun couloir`);

  // 3. Cases spéciales, portails, sens uniques (résolus sur le nœud le plus proche, tolérance bornée).
  const resolve = (what: string, p: Pt): MutableNode | null => {
    const hit = nearest(nodes, p);
    if (!hit || hit.d > MARK_TOLERANCE) {
      problems.push(`${what} : aucun nœud à moins de ${MARK_TOLERANCE} de (${p.x}, ${p.y})`);
      return null;
    }
    return hit.node;
  };
  for (const mark of spec.marks ?? []) {
    const node = resolve('Case spéciale', mark.at);
    if (!node) continue;
    if (mark.kind !== undefined) node.kind = mark.kind;
    if (mark.passable !== undefined) node.passable = mark.passable;
    if (mark.movementCostModifier !== undefined) node.movementCostModifier = mark.movementCostModifier;
  }
  const portals = (spec.portals ?? []).flatMap((p) => {
    const a = resolve(`Portail ${p.id}`, p.from);
    const b = resolve(`Portail ${p.id}`, p.to);
    return a && b ? [{ id: p.id, from: a.id, to: b.id, type: 'SECRET_DOOR' as const }] : [];
  });
  for (const ow of spec.oneWays ?? []) {
    const a = resolve('Sens unique', ow.from);
    const b = resolve('Sens unique', ow.to);
    if (!a || !b) continue;
    const idx = edges.findIndex((e) => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id));
    if (idx < 0) {
      problems.push(`Sens unique : aucune arête entre ${a.id} et ${b.id}`);
      continue;
    }
    edges[idx] = { from: a.id, to: b.id, oneWay: true, ...(edges[idx]!.doorId !== undefined ? { doorId: edges[idx]!.doorId } : {}) };
  }

  if (problems.length > 0) throw new GeneratorError(problems);

  // 4. Assemblage JSON déterministe (tri stable ; clés dans un ordre fixe).
  const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const edgeKey = (e: MutableEdge): string => `${e.from}|${e.to}`;
  const json: BoardJson = {
    id: spec.id,
    nameKey: spec.nameKey,
    nodes: [...nodes].sort(byId).map((n) => {
      const properties: Record<string, unknown> = {};
      if (n.kind !== 'NORMAL') properties.kind = n.kind;
      if (!n.passable) properties.passable = false;
      if (n.movementCostModifier > 0) properties.movementCostModifier = n.movementCostModifier;
      return {
        id: n.id,
        x: n.x,
        y: n.y,
        zoneId: n.zoneId,
        colors: [...n.colors].sort(),
        ...(Object.keys(properties).length > 0 ? { properties } : {}),
      } as BoardJson['nodes'][number];
    }),
    edges: edges
      .map<MutableEdge>((e) => (e.oneWay || e.from <= e.to ? e : { ...e, from: e.to, to: e.from }))
      .sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0)),
    doors: [...(spec.doors ?? [])].sort(byId).map((d) => ({ id: d.id, type: d.type, state: d.state })),
    portals: portals.sort(byId),
    layout: {
      rooms: spec.rooms.map((r) => ({
        id: r.id,
        nameKey: r.nameKey,
        polygon: r.polygon.map((p) => ({ x: round(p.x), y: round(p.y) })),
        ...(r.fill !== undefined ? { fill: r.fill } : {}),
      })),
      corridors: layoutCorridors,
    },
  };

  // 5. Validation par le chargeur de contenu : schéma ArkType + `validateBoard` du moteur + cohérence de la mise en page.
  try {
    loadBoard(json, spec.id);
  } catch (error) {
    if (error instanceof ContentError) throw new GeneratorError(error.problems);
    throw error;
  }
  return json;
}

/** Sérialisation canonique (indentation 2, fin de ligne LF) : la sortie est comparée octet par octet au JSON committé. */
export function serializeBoard(json: BoardJson): string {
  return `${JSON.stringify(json, null, 2)}\n`;
}
