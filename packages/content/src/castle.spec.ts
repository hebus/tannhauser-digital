import { describe, expect, it } from 'vitest';
import {
  SeededRng,
  canSee,
  createInitialState,
  reachableNodes,
  visibleNodes,
  type BoardState,
  type CharacterState,
  type GameState,
} from '@tannhauser/core';
import { loadBoard, loadDevContent, type BoardLayoutJson } from './index';
import castleJson from './data/castle-board.json';

const content = loadDevContent();
const castle = content.boards.find((b) => b.id === 'castle')!;
const board = castle.board;
const layout = castle.layout!;
const nodes = Object.values(board.nodes);
const inZone = (zone: string) => nodes.filter((n) => n.zoneId === zone).map((n) => n.id);
const ROOMS = ['hall', 'armurerie', 'bibliotheque', 'cuisine', 'chapelle', 'cour'];

function withDoor(b: BoardState, doorId: string, state: 'OPEN' | 'CLOSED'): BoardState {
  return { ...b, doors: { ...b.doors, [doorId]: { ...b.doors[doorId]!, state } } };
}

function stateWith(b: BoardState, nodeId: string, movementLeft: number): GameState {
  const hero: CharacterState = {
    id: 'h1',
    definitionId: 'd',
    playerId: 'p1',
    nodeId,
    health: 1,
    statRows: [{ combat: 3, physical: 3, mental: 3, movement: movementLeft }],
    alive: true,
    activated: false,
    movementLeft,
  };
  return createInitialState({
    gameId: 'g',
    scenarioId: 'castle',
    board: b,
    players: [
      { id: 'p1', factionId: 'faction.alpha', commandPoints: 0 },
      { id: 'p2', factionId: 'faction.beta', commandPoints: 0 },
    ],
    characters: [hero],
    rng: new SeededRng(1).snapshot(),
  });
}

const reach = (b: BoardState, from: string, pm = 99) => reachableNodes(stateWith(b, from, pm), 'h1');

describe('chargement du château', () => {
  it('loadDevContent expose le plateau de dev ET le château (board reste le plateau de dev)', () => {
    expect(content.boards.map((b) => b.id)).toEqual(['dev-board', 'castle', 'manoir']);
    expect(content.board).toBe(content.boards[0]);
    expect(castle.nameKey).toBe('board.castle.name');
    expect(content.boards[0]!.layout).toBeUndefined();
  });

  it('se charge (schéma + validateBoard du moteur) depuis le JSON committé', () => {
    expect(() => loadBoard(castleJson, 'castle')).not.toThrow();
  });
});

describe('contenu du château', () => {
  it('a au moins 6 pièces et une taille raisonnable (~50 nœuds)', () => {
    expect(layout.rooms.map((r) => r.id).sort()).toEqual([...ROOMS].sort());
    expect(nodes.length).toBeGreaterThanOrEqual(35);
    expect(nodes.length).toBeLessThanOrEqual(60);
  });

  it('respecte les couleurs : au moins 4 au total, 1 à 3 par nœud, une couleur propre par pièce', () => {
    const all = new Set(nodes.flatMap((n) => n.colors));
    expect(all.size).toBeGreaterThanOrEqual(4);
    for (const n of nodes) {
      expect(n.colors.length).toBeGreaterThanOrEqual(1);
      expect(n.colors.length).toBeLessThanOrEqual(3);
    }
    for (const room of ROOMS) expect(inZone(room).every((id) => board.nodes[id]!.colors.includes(`r.${room}`))).toBe(true);
  });

  it('contient 2 points d\'entrée : grande porte au sud (cour) et poterne au nord-est', () => {
    const entries = nodes.filter((n) => n.properties.kind === 'ENTRY_POINT');
    expect(entries.map((n) => n.id).sort()).toEqual(['cor-poterne-03', 'cour-05']);
    const south = entries.find((n) => n.zoneId === 'cour')!;
    const northEast = entries.find((n) => n.zoneId === 'cor-poterne')!;
    expect(south.y).toBeGreaterThan(northEast.y);
    expect(northEast.x).toBeGreaterThan(south.x);
  });

  it('contient portes (bois/renforcée, ouverte/fermée), portail secret, case impraticable, surcoût et sens unique', () => {
    const doors = Object.values(board.doors);
    expect(doors.some((d) => d.type === 'REINFORCED' && d.state === 'CLOSED')).toBe(true);
    expect(doors.some((d) => d.type === 'WOODEN' && d.state === 'OPEN')).toBe(true);
    expect(doors.some((d) => d.type === 'WOODEN' && d.state === 'CLOSED')).toBe(true);
    // Chaque porte est portée par exactement une arête.
    for (const d of doors) expect(board.edges.filter((e) => e.doorId === d.id)).toHaveLength(1);

    expect(board.portals).toHaveLength(1);
    const portal = board.portals[0]!;
    expect([board.nodes[portal.from]!.zoneId, board.nodes[portal.to]!.zoneId].sort()).toEqual(['bibliotheque', 'chapelle']);

    expect(nodes.filter((n) => !n.properties.passable).map((n) => n.id)).toEqual(['cour-03']);
    expect(nodes.filter((n) => n.properties.movementCostModifier === 1).map((n) => n.id)).toEqual(['cuisine-03']);
    expect(board.edges.filter((e) => e.oneWay)).toHaveLength(1);
  });

  it('est non orthogonal : des couloirs en diagonale', () => {
    const diagonal = board.edges.filter((e) => {
      const a = board.nodes[e.from]!;
      const b = board.nodes[e.to]!;
      return a.zoneId === b.zoneId && a.zoneId!.startsWith('cor-') && a.x !== b.x && a.y !== b.y;
    });
    expect(diagonal.length).toBeGreaterThanOrEqual(10);
  });
});

describe('lignes de vue du château', () => {
  it('toute la pièce est visible depuis chacun de ses nœuds', () => {
    for (const room of ROOMS) {
      const ids = inZone(room);
      for (const a of ids) for (const b of ids) expect(canSee(board, a, b), `${a} → ${b}`).toBe(true);
    }
  });

  it('pas de vue d\'une pièce à l\'autre à travers un mur (aucune paire de pièces différentes)', () => {
    for (const roomA of ROOMS) {
      for (const roomB of ROOMS) {
        if (roomA === roomB) continue;
        for (const a of inZone(roomA)) for (const b of inZone(roomB)) expect(canSee(board, a, b), `${a} → ${b}`).toBe(false);
      }
    }
  });

  it('on voit le long d\'un couloir depuis son seuil, jusqu\'au coude seulement', () => {
    // Porte ouverte : hall-08 est le seuil de cor-sud.
    expect(canSee(board, 'hall-08', 'cor-sud-01')).toBe(true);
    expect(canSee(board, 'hall-08', 'cor-sud-02')).toBe(true); // le coude porte la couleur du premier segment
    expect(canSee(board, 'hall-08', 'cor-sud-03')).toBe(false); // au-delà du coude
    // Depuis le côté cour : second segment.
    expect(canSee(board, 'cour-02', 'cor-sud-03')).toBe(true);
    expect(canSee(board, 'cour-02', 'cor-sud-02')).toBe(true);
    expect(canSee(board, 'cour-02', 'cor-sud-01')).toBe(false);
    // Depuis l'intérieur de la pièce (hors seuil) : on ne voit pas dans le couloir.
    expect(canSee(board, 'hall-05', 'cor-sud-01')).toBe(false);
  });

  it('une porte fermée coupe la vue ; ouverte, elle ne change rien', () => {
    // door-hall-nord-est est fermée : le seuil hall-03 ne voit pas le couloir.
    expect(board.doors['door-hall-nord-est']!.state).toBe('CLOSED');
    expect(canSee(board, 'hall-03', 'cor-nord-est-01')).toBe(false);
    const opened = withDoor(board, 'door-hall-nord-est', 'OPEN');
    expect(canSee(opened, 'hall-03', 'cor-nord-est-01')).toBe(true);
    expect(canSee(opened, 'hall-03', 'cor-nord-est-02')).toBe(true);
    // Fermer une porte ouverte coupe la vue.
    const closed = withDoor(board, 'door-hall-sud', 'CLOSED');
    expect(canSee(closed, 'hall-08', 'cor-sud-01')).toBe(false);
    // Les autres vues ne changent pas : la pièce reste entièrement visible.
    expect(visibleNodes(closed, 'hall-05').size).toBe(inZone('hall').length - 1);
  });

  it('le sens unique et le portail n\'influencent pas la vue', () => {
    expect(canSee(board, 'cor-nord-ouest-03', 'cor-nord-ouest-02')).toBe(true);
    expect(canSee(board, 'cor-nord-ouest-02', 'cor-nord-ouest-03')).toBe(true);
    expect(canSee(board, 'bibliotheque-04', 'chapelle-04')).toBe(false);
  });

  it('est réciproque sur toutes les paires de nœuds', () => {
    const ids = Object.keys(board.nodes);
    const sight = new Map(ids.map((id) => [id, visibleNodes(board, id)]));
    for (const a of ids) for (const b of ids) expect(sight.get(a)!.has(b) || a === b, `${a} ↔ ${b}`).toBe(sight.get(b)!.has(a) || a === b);
    // Même après ouverture de toutes les portes.
    let open = board;
    for (const d of Object.keys(board.doors)) open = withDoor(open, d, 'OPEN');
    const sightOpen = new Map(ids.map((id) => [id, visibleNodes(open, id)]));
    for (const a of ids) for (const b of ids) if (a !== b) expect(sightOpen.get(a)!.has(b), `${a} ↔ ${b}`).toBe(sightOpen.get(b)!.has(a));
  });
});

describe('déplacement sur le château', () => {
  const keys = (m: ReadonlyMap<string, unknown>) => [...m.keys()];

  it('depuis la grande porte : hall, couloirs, cour et cuisine ; pas la salle d\'armes verrouillée ni la chapelle', () => {
    const r = reach(board, 'cour-05');
    for (const id of ['cour-01', 'cor-sud-03', 'cor-sud-01', 'hall-05', 'hall-04', 'cor-est-02', 'cuisine-01']) expect(r.has(id), id).toBe(true);
    for (const id of [...inZone('armurerie'), ...inZone('cor-ouest'), ...inZone('chapelle'), ...inZone('cor-nord-est'), ...inZone('cor-poterne')]) {
      expect(r.has(id), id).toBe(false);
    }
  });

  it('la porte renforcée fermée bloque ; ouverte, la salle d\'armes devient accessible', () => {
    expect(reach(board, 'hall-04').has('cor-ouest-01')).toBe(false);
    const opened = withDoor(board, 'door-hall-ouest', 'OPEN');
    const r = reach(opened, 'hall-04');
    expect(r.has('armurerie-01')).toBe(true);
    expect(r.get('cor-ouest-01')!.cost).toBe(1);
  });

  it('le portail coûte 1 PM et relie la bibliothèque à la chapelle (dans les deux sens)', () => {
    const r = reach(board, 'bibliotheque-04', 1);
    expect(r.get('chapelle-04')).toEqual({ cost: 1, path: ['chapelle-04'] });
    const back = reach(board, 'chapelle-04', 1);
    expect(back.get('bibliotheque-04')).toEqual({ cost: 1, path: ['bibliotheque-04'] });
  });

  it('depuis la poterne : chapelle, bibliothèque (portail), puis hall par le sens unique', () => {
    const r = reach(board, 'cor-poterne-03');
    for (const id of ['cor-poterne-01', 'chapelle-02', 'chapelle-04', 'bibliotheque-01', 'cor-nord-ouest-01', 'hall-01', 'cour-05']) expect(r.has(id), id).toBe(true);
    expect(r.has('cor-nord-est-01')).toBe(true); // couloir atteint côté chapelle...
    expect(r.get('hall-03')!.path).not.toContain('cor-nord-est-01'); // ... mais la porte fermée côté hall ne se franchit pas
    expect(inZone('armurerie').some((id) => r.has(id))).toBe(false);
  });

  it('sens unique : de la bibliothèque vers le hall, jamais l\'inverse', () => {
    expect(reach(board, 'cor-nord-ouest-03', 1).has('cor-nord-ouest-02')).toBe(true);
    const back = reach(board, 'cor-nord-ouest-02', 1);
    expect(back.has('cor-nord-ouest-03')).toBe(false);
    expect(back.has('cor-nord-ouest-01')).toBe(true);
    // Depuis le hall, la bibliothèque n'est atteignable que par le portail (donc pas sans la chapelle).
    expect(inZone('bibliotheque').some((id) => reach(board, 'hall-05').has(id))).toBe(false);
  });

  it('case impraticable (puits) : jamais atteignable, mais contournable', () => {
    for (const from of ['cour-02', 'cour-07', 'cour-01']) expect(reach(board, from).has('cour-03')).toBe(false);
    expect(keys(reach(board, 'cour-02'))).toContain('cour-06');
    expect(reach(board, 'cour-06').get('cour-07')!.cost).toBe(1);
  });

  it('surcoût +1 : entrer dans les gravats de la cuisine coûte 2 PM', () => {
    const r = reach(board, 'cuisine-02');
    expect(r.get('cuisine-03')!.cost).toBe(2);
    expect(r.get('cuisine-04')!.cost).toBe(1);
    expect(reach(board, 'cuisine-02', 1).has('cuisine-03')).toBe(false);
  });
});

describe('mise en page du château (layout)', () => {
  const area = (poly: BoardLayoutJson['rooms'][number]['polygon']) =>
    Math.abs(poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length]!.y - poly[(i + 1) % poly.length]!.x * p.y, 0)) / 2;
  const inside = (p: { x: number; y: number }, poly: BoardLayoutJson['rooms'][number]['polygon']) => {
    let ok = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const a = poly[i]!;
      const b = poly[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ok = !ok;
    }
    return ok;
  };
  const distSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  it('a des identifiants uniques, des polygones valides et des libellés room.*', () => {
    const ids = [...layout.rooms.map((r) => r.id), ...layout.corridors.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const room of layout.rooms) {
      expect(room.polygon.length).toBeGreaterThanOrEqual(3);
      expect(area(room.polygon)).toBeGreaterThan(1000);
      expect(room.nameKey).toBe(`room.${room.id}`);
      expect(room.fill).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const c of layout.corridors) {
      expect(c.points.length).toBeGreaterThanOrEqual(2);
      expect(c.width).toBeGreaterThan(0);
    }
  });

  it('chaque nœud de pièce est dans le polygone de sa pièce', () => {
    for (const room of layout.rooms) for (const id of inZone(room.id)) expect(inside(board.nodes[id]!, room.polygon), id).toBe(true);
  });

  it('chaque nœud de couloir est sur la ligne brisée de son couloir ; chaque couloir est tracé', () => {
    for (const c of layout.corridors) {
      const members = inZone(c.id);
      expect(members.length).toBeGreaterThanOrEqual(3);
      for (const id of members) {
        const n = board.nodes[id]!;
        const d = Math.min(...c.points.slice(1).map((p, i) => distSeg(n, c.points[i]!, p)));
        expect(d, id).toBeLessThan(1);
      }
    }
    expect(layout.corridors.map((c) => c.id).sort()).toEqual([...new Set(nodes.filter((n) => n.zoneId!.startsWith('cor-')).map((n) => n.zoneId!))].sort());
  });

  it('les polygones de pièces ne se chevauchent pas', () => {
    for (const a of layout.rooms) {
      for (const b of layout.rooms) {
        if (a.id >= b.id) continue;
        expect(a.polygon.some((p) => inside(p, b.polygon)) || b.polygon.some((p) => inside(p, a.polygon)), `${a.id}/${b.id}`).toBe(false);
      }
    }
  });
});
