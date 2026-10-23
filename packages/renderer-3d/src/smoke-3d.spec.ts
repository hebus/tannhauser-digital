// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GameState } from '@tannhauser/core';
import { SmokeLayer3D } from './smoke-3d';

const node = (id: string, x: number, colors: string[]) => ({ id, x, y: 0, colors, properties: { kind: 'NORMAL', passable: true, movementCostModifier: 0, modifiers: [] } });
const state = (effects: GameState['effects']): GameState =>
  ({
    board: { nodes: { a: node('a', 0, ['red']), b: node('b', 100, ['red']), c: node('c', 200, ['blue']) }, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], doors: {}, portals: [] },
    effects,
  }) as unknown as GameState;

const puffs = (layer: SmokeLayer3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  layer.group.traverse((o) => o instanceof THREE.Mesh && out.push(o));
  return out;
};
const opacity = (m: THREE.Mesh): number => (m.material as THREE.Material).opacity;

describe('SmokeLayer3D', () => {
  it('crée des bouffées sur la case lancée, les cases de même couleur et l’arête qui les relie', () => {
    const layer = new SmokeLayer3D();
    layer.update(state([{ id: 's1', type: 'SMOKE', origin: 'a', remainingTurns: 2 }]));
    expect(layer.group.children.length).toBe(3); // cases a et b (couleur rouge) + arête a→b ; c est bleue
    expect(puffs(layer).length).toBeGreaterThan(0);
  });

  it('les bouffées apparaissent en fondu : invisibles à l’instant 0, visibles après quelques centaines de ms', () => {
    const layer = new SmokeLayer3D();
    layer.update(state([{ id: 's1', type: 'SMOKE', origin: 'a', remainingTurns: 2 }]));
    expect(Math.max(...puffs(layer).map(opacity))).toBe(0);
    layer.tick(800, false);
    expect(Math.max(...puffs(layer).map(opacity))).toBeGreaterThan(0.15);
  });

  it('une fumée qui disparaît s’efface puis est retirée de la scène', () => {
    const layer = new SmokeLayer3D();
    layer.update(state([{ id: 's1', type: 'SMOKE', origin: 'a', remainingTurns: 2 }]));
    layer.tick(800, false);
    layer.update(state([]));
    layer.tick(100, false);
    expect(layer.group.children.length).toBe(3);
    layer.tick(800, false);
    expect(layer.group.children.length).toBe(0);
  });
});
