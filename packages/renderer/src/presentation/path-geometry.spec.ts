import { describe, expect, it } from 'vitest';
import type { BoardState } from '@tannhauser/core';
import { buildPathPreview, pointAlong, textScaleForZoom } from './path-geometry';

const board = {
  nodes: {
    a: { id: 'a', x: 0, y: 0 },
    b: { id: 'b', x: 100, y: 0 },
    c: { id: 'c', x: 100, y: 100 },
  },
} as unknown as BoardState;

const reachable = [
  { nodeId: 'b', path: ['b'], cost: 1 },
  { nodeId: 'c', path: ['b', 'c'], cost: 3 },
];

describe('buildPathPreview', () => {
  it('trace le chemin du moteur depuis l origine avec son coût', () => {
    const p = buildPathPreview(board, 'a', reachable, 'c')!;
    expect(p.nodeIds).toEqual(['a', 'b', 'c']);
    expect(p.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(p.cost).toBe(3);
  });

  it('aucun tracé pour un nœud non atteignable, l origine ou aucun survol', () => {
    expect(buildPathPreview(board, 'a', reachable, 'zz')).toBeNull();
    expect(buildPathPreview(board, 'a', [{ nodeId: 'a', path: [], cost: 0 }], 'a')).toBeNull();
    expect(buildPathPreview(board, 'a', reachable, null)).toBeNull();
  });
});

describe('pointAlong', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  it('temps égal par segment, bornes comprises', () => {
    expect(pointAlong(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(pts, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAlong(pts, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAlong(pts, 0.75)).toEqual({ x: 100, y: 50 });
    expect(pointAlong(pts, 1)).toEqual({ x: 100, y: 100 });
    expect(pointAlong(pts, 3)).toEqual({ x: 100, y: 100 });
  });
});

describe('textScaleForZoom', () => {
  it('compense le zoom caméra dans des bornes lisibles', () => {
    expect(textScaleForZoom(1)).toBe(1);
    expect(textScaleForZoom(0.5)).toBe(2);
    expect(textScaleForZoom(0.1)).toBe(2.5);
    expect(textScaleForZoom(4)).toBe(0.8);
    expect(textScaleForZoom(0)).toBe(1);
  });
});
