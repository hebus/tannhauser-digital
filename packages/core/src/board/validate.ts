import { MAX_COLORS_PER_NODE, type BoardState } from './types';

export interface BoardIssue {
  readonly code:
    | 'EMPTY_BOARD'
    | 'EDGE_UNKNOWN_NODE'
    | 'DUPLICATE_EDGE'
    | 'SELF_LOOP'
    | 'ORPHAN_NODE'
    | 'UNKNOWN_DOOR'
    | 'PORTAL_UNKNOWN_NODE'
    | 'BAD_COLOR_COUNT'
    | 'DUPLICATE_COLOR'
    | 'ID_MISMATCH'
    | 'NEGATIVE_MOVEMENT_COST'
    | 'UNREACHABLE_AREA';
  readonly message: string;
}

/**
 * Valide la cohérence structurelle d'un plateau.
 * (Les identifiants dupliqués sont impossibles dans un Record : ils se détectent au chargement JSON.)
 */
export function validateBoard(board: BoardState): BoardIssue[] {
  const issues: BoardIssue[] = [];
  const ids = Object.keys(board.nodes);
  if (ids.length === 0) return [{ code: 'EMPTY_BOARD', message: 'Plateau vide' }];

  for (const [key, node] of Object.entries(board.nodes)) {
    if (node.id !== key) issues.push({ code: 'ID_MISMATCH', message: `Clé ${key} ≠ id ${node.id}` });
    if (node.colors.length < 1 || node.colors.length > MAX_COLORS_PER_NODE) {
      issues.push({ code: 'BAD_COLOR_COUNT', message: `${key} : ${node.colors.length} couleur(s), attendu 1 à ${MAX_COLORS_PER_NODE}` });
    }
    if (new Set(node.colors).size !== node.colors.length) {
      issues.push({ code: 'DUPLICATE_COLOR', message: `${key} : couleur dupliquée` });
    }
    if (node.properties.movementCostModifier < 0) {
      issues.push({ code: 'NEGATIVE_MOVEMENT_COST', message: `${key} : coût de déplacement négatif` });
    }
  }

  const seen = new Set<string>();
  const touched = new Set<string>();
  for (const edge of board.edges) {
    if (!(edge.from in board.nodes) || !(edge.to in board.nodes)) {
      issues.push({ code: 'EDGE_UNKNOWN_NODE', message: `Arête ${edge.from}→${edge.to} : nœud inconnu` });
      continue;
    }
    if (edge.from === edge.to) issues.push({ code: 'SELF_LOOP', message: `Boucle sur ${edge.from}` });
    const key = edge.oneWay ? `${edge.from}>${edge.to}` : [edge.from, edge.to].sort().join('~');
    if (seen.has(key)) issues.push({ code: 'DUPLICATE_EDGE', message: `Arête dupliquée ${key}` });
    seen.add(key);
    touched.add(edge.from);
    touched.add(edge.to);
    if (edge.doorId !== undefined && !(edge.doorId in board.doors)) {
      issues.push({ code: 'UNKNOWN_DOOR', message: `Arête ${edge.from}→${edge.to} : porte ${edge.doorId} inconnue` });
    }
  }

  for (const portal of board.portals) {
    for (const end of [portal.from, portal.to]) {
      if (!(end in board.nodes)) issues.push({ code: 'PORTAL_UNKNOWN_NODE', message: `Portail ${portal.id} : nœud ${end} inconnu` });
      else touched.add(end);
    }
  }

  for (const id of ids) {
    if (!touched.has(id) && ids.length > 1) issues.push({ code: 'ORPHAN_NODE', message: `Nœud orphelin ${id}` });
  }

  // Connexité faible (arêtes non dirigées + portails) : tout nœud praticable doit être joignable.
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!(a in board.nodes) || !(b in board.nodes)) return;
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
    (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
  };
  for (const e of board.edges) link(e.from, e.to);
  for (const p of board.portals) link(p.from, p.to);
  const start = ids[0]!;
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  for (const id of ids) {
    if (!visited.has(id) && touched.has(id)) {
      issues.push({ code: 'UNREACHABLE_AREA', message: `Zone non reliée : ${id}` });
    }
  }
  return issues;
}
