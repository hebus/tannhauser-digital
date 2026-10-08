import { describe, expect, it } from 'vitest';
import { loadBoard, loadDevContent } from './index';
import manoirJson from './data/manoir-board.json';

const content = loadDevContent();
const manoir = content.boards.find((b) => b.id === 'manoir')!;
const nodes = Object.values(manoir.board.nodes);

describe('plateau Manoir', () => {
  it('se charge et expose une mise en page', () => {
    expect(() => loadBoard(manoirJson, 'manoir')).not.toThrow();
    expect(manoir.nameKey).toBe('board.manoir.name');
    expect(manoir.layout!.rooms).toHaveLength(15);
  });

  it('chaque nœud a 1 à 3 couleurs de ligne de vue', () => {
    for (const n of nodes) {
      expect(n.colors.length, n.id).toBeGreaterThanOrEqual(1);
      expect(n.colors.length, n.id).toBeLessThanOrEqual(3);
    }
  });

  it('toutes les cases praticables sont joignables depuis chaque point d’entrée (portes comprises, portail secret inclus)', () => {
    const adjacency = new Map<string, string[]>();
    const link = (a: string, b: string): void => {
      adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    };
    for (const e of manoir.board.edges) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    for (const p of Object.values(manoir.board.portals)) {
      link(p.from, p.to);
      link(p.to, p.from);
    }
    const entries = nodes.filter((n) => n.properties.kind === 'ENTRY_POINT').map((n) => n.id);
    expect(entries).toHaveLength(2);
    for (const start of entries) {
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length > 0) {
        for (const next of adjacency.get(queue.shift()!) ?? []) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      for (const n of nodes) expect(seen.has(n.id), `${n.id} depuis ${start}`).toBe(true);
    }
  });

  it('offre assez de cases d’objectif pour la Capture du drapeau (6 drapeaux)', () => {
    expect(nodes.filter((n) => n.properties.kind === 'OBJECTIVE').length).toBeGreaterThanOrEqual(6);
  });
});
