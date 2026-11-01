import type { BoardJson } from './schemas';

/**
 * Format canonique d'un plateau JSON : même ordre de clés que les plateaux générés, aucune valeur `undefined`,
 * `doors` et `portals` toujours présents, `crates` seulement s'il y a des caisses. L'ordre des tableaux n'est jamais modifié (relire puis réécrire un plateau
 * ne produit aucune différence). Pur : partagé par le générateur et l'éditeur de plateaux.
 */

/** Identifiant d'un plateau créé par l'éditeur : minuscules, chiffres et tirets ; sert aussi au nom de fichier. */
export const BOARD_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

/** Fichier d'un NOUVEAU plateau (un plateau existant garde son fichier, dont le nom ne suit pas toujours son id). */
export const newBoardFileName = (id: string): string => `${id}-board.json`;

/** Recopie `source` en ne gardant que `keys`, dans cet ordre, sans les valeurs `undefined`. */
function pick<T extends object>(source: T, keys: readonly (keyof T)[]): T {
  const out: Partial<T> = {};
  for (const k of keys) if (source[k] !== undefined) out[k] = source[k];
  return out as T;
}

type Node = BoardJson['nodes'][number];
type Layout = NonNullable<BoardJson['layout']>;

export function normalizeBoardJson(json: BoardJson): BoardJson {
  const nodes = json.nodes.map((n) => {
    const node = pick(n, ['id', 'x', 'y', 'zoneId', 'colors', 'properties']);
    if (n.properties) {
      const properties = pick(n.properties, ['kind', 'passable', 'movementCostModifier', 'modifiers']);
      if (Object.keys(properties).length > 0) node.properties = properties;
      else delete node.properties;
    }
    return node as Node;
  });
  const layout: Layout | undefined = json.layout
    ? {
        rooms: json.layout.rooms.map((r) => ({ ...pick(r, ['id', 'nameKey', 'polygon', 'fill']), polygon: r.polygon.map((p) => ({ x: p.x, y: p.y })) })),
        corridors: json.layout.corridors.map((c) => ({ id: c.id, points: c.points.map((p) => ({ x: p.x, y: p.y })), width: c.width })),
      }
    : undefined;
  return pick(
    {
      id: json.id,
      nameKey: json.nameKey,
      nodes,
      edges: json.edges.map((e) => pick(e, ['from', 'to', 'oneWay', 'doorId'])),
      doors: (json.doors ?? []).map((d) => pick(d, ['id', 'type', 'state'])),
      portals: (json.portals ?? []).map((p) => pick(p, ['id', 'from', 'to', 'type'])),
      // Absent si le plateau n'a pas de caisse : les plateaux existants restent identiques.
      crates: json.crates && json.crates.length > 0 ? json.crates.map((c) => pick(c, ['id', 'nodeId'])) : undefined,
      layout,
    },
    ['id', 'nameKey', 'nodes', 'edges', 'doors', 'portals', 'crates', 'layout'],
  );
}

/** Texte du fichier : JSON indenté (2 espaces) et saut de ligne final. */
export function serializeBoard(json: BoardJson): string {
  return `${JSON.stringify(json, null, 2)}\n`;
}
