import { type } from 'arktype';
import { defaultNodeProperties, validateBoard, type BoardState, type BoardNode, type Door } from '@tannhauser/core';
import {
  boardSchema,
  type BoardLayoutJson,
  characterSchema,
  factionsFileSchema,
  weaponSchema,
  type CharacterDefinition,
  type FactionsFile,
  type WeaponDefinition,
} from './schemas';

/** Erreur de contenu (catégorie « Content error » du plan §29) : jamais montrée brute au joueur. */
export class ContentError extends Error {
  constructor(
    readonly source: string,
    readonly problems: readonly string[],
  ) {
    super(`Contenu invalide (${source}) :\n- ${problems.join('\n- ')}`);
    this.name = 'ContentError';
  }
}

function check<T>(source: string, out: T | type.errors): T {
  if (out instanceof type.errors) throw new ContentError(source, out.map((e) => e.toString()));
  return out;
}

export interface LoadedBoard {
  readonly id: string;
  readonly nameKey: string;
  readonly board: BoardState;
  /** Mise en page d'affichage (pièces, couloirs) : absente pour un plateau « grille » simple. */
  readonly layout?: BoardLayoutJson;
}

/** Valide un plateau JSON (schéma + cohérence du graphe) et le convertit en `BoardState`. */
export function loadBoard(data: unknown, source = 'board'): LoadedBoard {
  const json = check(source, boardSchema(data));

  const ids = new Set<string>();
  const duplicates: string[] = [];
  for (const n of json.nodes) {
    if (ids.has(n.id)) duplicates.push(`Identifiant de nœud dupliqué : ${n.id}`);
    ids.add(n.id);
  }
  if (duplicates.length > 0) throw new ContentError(source, duplicates);

  const nodes: Record<string, BoardNode> = {};
  for (const n of json.nodes) {
    nodes[n.id] = {
      id: n.id,
      x: n.x,
      y: n.y,
      zoneId: n.zoneId,
      colors: n.colors,
      properties: { ...defaultNodeProperties, ...n.properties, modifiers: n.properties?.modifiers ?? [] },
    };
  }
  const doors: Record<string, Door> = {};
  for (const d of json.doors ?? []) doors[d.id] = d;

  const board: BoardState = { nodes, edges: json.edges, doors, portals: json.portals ?? [] };
  const issues = validateBoard(board);
  if (issues.length > 0) throw new ContentError(source, issues.map((i) => `${i.code} : ${i.message}`));
  const problems = json.layout ? layoutProblems(json.layout) : [];
  if (problems.length > 0) throw new ContentError(source, problems);
  return { id: json.id, nameKey: json.nameKey, board, ...(json.layout ? { layout: json.layout } : {}) };
}

export function loadWeapons(data: unknown, source = 'weapons'): WeaponDefinition[] {
  const list = check(source, weaponSchema.array()(data));
  assertUniqueIds(source, list);
  return list;
}

export function loadCharacters(data: unknown, factions: FactionsFile, weapons: readonly WeaponDefinition[], source = 'characters'): CharacterDefinition[] {
  const list = check(source, characterSchema.array()(data));
  assertUniqueIds(source, list);
  const factionIds = new Set(factions.factions.map((f) => f.id));
  const weaponIds = new Set(weapons.map((w) => w.id));
  const problems: string[] = [];
  for (const c of list) {
    if (!factionIds.has(c.factionId)) problems.push(`${c.id} : faction inconnue ${c.factionId}`);
    for (const w of c.weaponIds) if (!weaponIds.has(w)) problems.push(`${c.id} : arme inconnue ${w}`);
  }
  if (problems.length > 0) throw new ContentError(source, problems);
  return list;
}

export function loadFactions(data: unknown, source = 'factions'): FactionsFile {
  const file = check(source, factionsFileSchema(data));
  assertUniqueIds(source, file.factions);
  const ids = new Set(file.factions.map((f) => f.id));
  const problems = file.relations.flatMap((r) =>
    [r.factionA, r.factionB].filter((f) => !ids.has(f)).map((f) => `Relation : faction inconnue ${f}`),
  );
  if (problems.length > 0) throw new ContentError(source, problems);
  return file;
}

function assertUniqueIds(source: string, items: readonly { id: string }[]): void {
  const seen = new Set<string>();
  const dup = items.filter((i) => (seen.has(i.id) ? true : (seen.add(i.id), false))).map((i) => `Identifiant dupliqué : ${i.id}`);
  if (dup.length > 0) throw new ContentError(source, dup);
}

/** Cohérence de la mise en page : identifiants uniques, polygones non dégénérés. */
function layoutProblems(layout: BoardLayoutJson): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const id of [...layout.rooms.map((r) => r.id), ...layout.corridors.map((c) => c.id)]) {
    if (seen.has(id)) problems.push(`Identifiant de mise en page dupliqué : ${id}`);
    seen.add(id);
  }
  for (const room of layout.rooms) {
    let area2 = 0;
    room.polygon.forEach((p, i) => {
      const q = room.polygon[(i + 1) % room.polygon.length]!;
      area2 += p.x * q.y - q.x * p.y;
    });
    if (Math.abs(area2) < 1e-6) problems.push(`Pièce ${room.id} : polygone dégénéré (aire nulle)`);
  }
  return problems;
}
