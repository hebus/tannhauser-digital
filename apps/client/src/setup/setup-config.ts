import type { BoardState, NodeId } from '@tannhauser/core';
import type { CharacterDefinition, LoadedBoard } from '@tannhauser/content';

/** Configuration d'une partie choisie sur l'écran de mise en place. Pure et sérialisable (hash d'URL). */
export interface TeamConfig {
  readonly playerId: string;
  readonly characterIds: readonly string[];
}

export interface SetupConfig {
  readonly boardId: string;
  readonly seed: number;
  readonly teams: readonly TeamConfig[];
  /** Joueurs pilotés par l'IA (absent : partie entre humains). */
  readonly ai?: readonly string[];
}

export const MAX_TEAM_SIZE = 4;
export const MAX_SEED = 0xffffffff;
export const PLAYER_IDS = ['p1', 'p2'] as const;

export interface SetupContent {
  readonly boards: readonly Pick<LoadedBoard, 'id' | 'board'>[];
  readonly characters: readonly Pick<CharacterDefinition, 'id' | 'factionId'>[];
}

/** Problème de configuration : code stable + paramètres (le texte vient de `setupError.<code>` dans i18n). */
export interface SetupIssue {
  readonly code: 'UNKNOWN_BOARD' | 'TEAM_COUNT' | 'TEAM_EMPTY' | 'TEAM_TOO_LARGE' | 'UNKNOWN_CHARACTER' | 'DUPLICATE_CHARACTER' | 'BAD_SEED' | 'NOT_ENOUGH_NODES';
  readonly params?: Readonly<Record<string, string | number>>;
}

export function validateSetup(config: SetupConfig, content: SetupContent): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const board = content.boards.find((b) => b.id === config.boardId);
  if (!board) issues.push({ code: 'UNKNOWN_BOARD', params: { id: config.boardId } });
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > MAX_SEED) issues.push({ code: 'BAD_SEED', params: { max: MAX_SEED } });
  if (config.teams.length !== 2) issues.push({ code: 'TEAM_COUNT' });

  const known = new Set(content.characters.map((c) => c.id));
  let total = 0;
  for (const team of config.teams) {
    if (team.characterIds.length === 0) issues.push({ code: 'TEAM_EMPTY', params: { player: team.playerId } });
    if (team.characterIds.length > MAX_TEAM_SIZE) issues.push({ code: 'TEAM_TOO_LARGE', params: { player: team.playerId, max: MAX_TEAM_SIZE } });
    const seen = new Set<string>();
    for (const id of team.characterIds) {
      if (!known.has(id)) issues.push({ code: 'UNKNOWN_CHARACTER', params: { id } });
      else if (seen.has(id)) issues.push({ code: 'DUPLICATE_CHARACTER', params: { player: team.playerId, id } });
      seen.add(id);
    }
    total += team.characterIds.length;
  }
  if (board) {
    const free = Object.values(board.board.nodes).filter((n) => n.properties.passable).length;
    if (free < total) issues.push({ code: 'NOT_ENOUGH_NODES', params: { n: total } });
  }
  return issues;
}

/** Graine aléatoire entière sur 32 bits (la source d'aléa est injectable pour les tests). */
export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * (MAX_SEED + 1));
}

/** Équipes par défaut : une faction par joueur (au plus MAX_TEAM_SIZE personnages), 2 contre 2 avec le contenu de dev. */
export function defaultSetup(content: SetupContent, seed: number): SetupConfig {
  const factions = [...new Set(content.characters.map((c) => c.factionId))];
  const teams: TeamConfig[] = PLAYER_IDS.map((playerId, i) => {
    const faction = factions[i] ?? factions[0];
    const ids = content.characters.filter((c) => c.factionId === faction).map((c) => c.id);
    return { playerId, characterIds: ids.slice(0, MAX_TEAM_SIZE) };
  });
  return { boardId: content.boards[0]?.id ?? '', seed, teams };
}

// --- Sérialisation (hash d'URL : permet de rejouer une partie en rechargeant la page) ---

export function encodeSetup(config: SetupConfig): string {
  const params = new URLSearchParams();
  params.set('board', config.boardId);
  params.set('seed', String(config.seed));
  for (const team of config.teams) params.set(team.playerId, team.characterIds.join(','));
  if (config.ai && config.ai.length > 0) params.set('ai', config.ai.join(','));
  return params.toString();
}

/** Lit un hash d'URL ; `null` si absent ou incomplet (l'écran de mise en place est alors affiché). */
export function decodeSetup(hash: string): SetupConfig | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const board = params.get('board');
  const seedText = params.get('seed');
  if (!board || seedText === null || !/^\d+$/.test(seedText)) return null;
  const teams: TeamConfig[] = [];
  for (const playerId of PLAYER_IDS) {
    const raw = params.get(playerId);
    if (raw === null) return null;
    teams.push({ playerId, characterIds: raw.split(',').filter((s) => s.length > 0) });
  }
  const ai = (params.get('ai') ?? '').split(',').filter((id) => (PLAYER_IDS as readonly string[]).includes(id));
  return { boardId: board, seed: Number(seedText), teams, ...(ai.length > 0 ? { ai } : {}) };
}

// --- Placement initial ---

/** Distances en pas (arêtes non orientées, portes ignorées : simple critère d'éloignement de mise en place). */
function distancesFrom(board: BoardState, from: NodeId): Map<NodeId, number> {
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const e of board.edges) {
    (adjacency.get(e.from) ?? adjacency.set(e.from, []).get(e.from)!).push(e.to);
    (adjacency.get(e.to) ?? adjacency.set(e.to, []).get(e.to)!).push(e.from);
  }
  const dist = new Map<NodeId, number>([[from, 0]]);
  let frontier = [from];
  while (frontier.length > 0) {
    const next: NodeId[] = [];
    for (const n of frontier) {
      for (const m of adjacency.get(n) ?? []) {
        if (dist.has(m)) continue;
        dist.set(m, dist.get(n)! + 1);
        next.push(m);
      }
    }
    frontier = next;
  }
  return dist;
}

/**
 * Cases où un personnage posé en `from` peut se rendre, PM illimités (état initial des portes) : arêtes orientées
 * (sens unique respecté), portes fermées et cases impraticables infranchissables, portails dans les deux sens.
 * Sert à ne pas poser un personnage dans une zone verrouillée (ex. salle d'armes derrière une porte renforcée).
 */
function movementReachable(board: BoardState, from: NodeId): Set<NodeId> {
  const next = new Map<NodeId, NodeId[]>();
  const add = (a: NodeId, b: NodeId) => (next.get(a) ?? next.set(a, []).get(a)!).push(b);
  for (const e of board.edges) {
    if (e.doorId !== undefined && board.doors[e.doorId]?.state !== 'OPEN') continue;
    add(e.from, e.to);
    if (!e.oneWay) add(e.to, e.from);
  }
  for (const p of board.portals) {
    add(p.from, p.to);
    add(p.to, p.from);
  }
  const seen = new Set<NodeId>([from]);
  const queue = [from];
  while (queue.length > 0) {
    for (const m of next.get(queue.shift()!) ?? []) {
      if (seen.has(m) || !board.nodes[m]?.properties.passable) continue;
      seen.add(m);
      queue.push(m);
    }
  }
  return seen;
}

const INF = Number.POSITIVE_INFINITY;
/** Comparaison numérique sûre avec Infinity (évite NaN). */
const cmp = (x: number, y: number): number => (x === y ? 0 : x < y ? -1 : 1);

/**
 * Place les équipes sur le plateau et renvoie, par joueur, les cases de départ (une par personnage, sans doublon).
 *
 * Règle de mise en place (documentée, non issue du livre de règles) :
 * 1. Chaque équipe reçoit une « ancre » : les points d'entrée du plateau (ENTRY_POINT) les plus éloignés entre eux
 *    (le premier dans l'ordre des ids, puis éloignement maximal) ; s'il y a moins de points d'entrée que d'équipes,
 *    les ancres sont choisies parmi toutes les cases praticables, toujours les plus éloignées.
 * 2. Tour à tour, chaque équipe prend d'abord les points d'entrée libres dont son ancre est la plus proche.
 * 3. S'il n'y en a pas assez, elle complète avec les cases libres les plus éloignées des ancres adverses
 *    (à égalité : les plus proches de sa propre ancre, puis l'id), en évitant les points d'entrée adverses.
 * 4. Une équipe ne reçoit que des cases joignables depuis son ancre (portes fermées, sens uniques et cases impraticables
 *    respectés) : jamais de personnage enfermé dans une zone verrouillée. Sur un plateau sans zone verrouillée, sans effet.
 * Retourne `null` si le plateau n'a pas assez de cases praticables.
 */
export function placeTeams(board: BoardState, teams: readonly { readonly playerId: string; readonly count: number }[]): Record<string, NodeId[]> | null {
  const passable = Object.values(board.nodes)
    .filter((n) => n.properties.passable)
    .map((n) => n.id)
    .sort();
  const total = teams.reduce((sum, t) => sum + t.count, 0);
  if (passable.length < total) return null;

  const entries = passable.filter((id) => board.nodes[id]!.properties.kind === 'ENTRY_POINT');
  const pool = entries.length >= teams.length ? entries : passable;

  // Ancres par éloignement maximal (farthest-first).
  const anchors: NodeId[] = [pool[0]!];
  const anchorDist = new Map<NodeId, Map<NodeId, number>>([[pool[0]!, distancesFrom(board, pool[0]!)]]);
  while (anchors.length < teams.length) {
    let best: { id: NodeId; d: number } | null = null;
    for (const id of pool) {
      if (anchors.includes(id)) continue;
      const d = Math.min(...anchors.map((a) => anchorDist.get(a)!.get(id) ?? INF));
      if (!best || d > best.d) best = { id, d };
    }
    const chosen = best?.id ?? pool.find((id) => !anchors.includes(id));
    if (chosen === undefined) break; // plateau d'une seule case praticable : ancres répétées, la contrainte `total` a déjà filtré
    anchors.push(chosen);
    anchorDist.set(chosen, distancesFrom(board, chosen));
  }
  const distTo = (team: number, id: NodeId): number => anchorDist.get(anchors[team] ?? anchors[0]!)!.get(id) ?? INF;
  const nearestTeam = (id: NodeId): number => {
    let best = 0;
    for (let i = 1; i < teams.length; i += 1) if (distTo(i, id) < distTo(best, id)) best = i;
    return best;
  };

  const zones = anchors.map((a) => movementReachable(board, a));
  const claimed = new Set<NodeId>();
  const result: Record<string, NodeId[]> = Object.fromEntries(teams.map((t) => [t.playerId, [] as NodeId[]]));
  const rounds = Math.max(0, ...teams.map((t) => t.count));
  for (let round = 0; round < rounds; round += 1) {
    teams.forEach((team, i) => {
      if (team.count <= round) return;
      const unclaimed = passable.filter((id) => !claimed.has(id));
      // Zone jouable de l'équipe : cases joignables depuis son ancre ; à défaut (plateau très verrouillé), toutes les libres.
      const reachable = zones[i] ?? zones[0]!;
      const reachableFree = unclaimed.filter((id) => reachable.has(id));
      const free = reachableFree.length > 0 ? reachableFree : unclaimed;
      const ownEntries = free.filter((id) => entries.includes(id) && nearestTeam(id) === i).sort((a, b) => cmp(distTo(i, a), distTo(i, b)) || a.localeCompare(b));
      let pick = ownEntries[0];
      if (pick === undefined) {
        const candidates = free.filter((id) => !(entries.includes(id) && nearestTeam(id) !== i));
        const usable = candidates.length > 0 ? candidates : free;
        const enemyDist = (id: NodeId): number => {
          const others = teams.map((_, k) => k).filter((k) => k !== i);
          return others.length === 0 ? 0 : Math.min(...others.map((k) => distTo(k, id)));
        };
        pick = [...usable].sort((a, b) => cmp(enemyDist(b), enemyDist(a)) || cmp(distTo(i, a), distTo(i, b)) || a.localeCompare(b))[0];
      }
      if (pick === undefined) return;
      claimed.add(pick);
      result[team.playerId]!.push(pick);
    });
  }
  return result;
}
