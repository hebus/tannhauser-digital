// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { clampToBox, CLOSE_POLAR, FIT_POLAR, fitDistance, nextQuarter, polarForDistance, quarterIndex, wrapAngle } from './camera-math';

const Q = Math.PI / 2;

describe('inclinaison liée au zoom', () => {
  it('rasante au plus près, presque de dessus au cadrage et au-delà', () => {
    expect(polarForDistance(100, 100, 1000)).toBeCloseTo(CLOSE_POLAR);
    expect(polarForDistance(1000, 100, 1000)).toBeCloseTo(FIT_POLAR);
    expect(polarForDistance(5000, 100, 1000)).toBeCloseTo(FIT_POLAR);
  });

  it('monotone : plus on s’éloigne, plus la vue se redresse', () => {
    const angles = [100, 300, 600, 900].map((d) => polarForDistance(d, 100, 1000));
    for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeLessThan(angles[i - 1]!);
  });

  it('cadrage plus proche que le minimum : vue de cadrage', () => {
    expect(polarForDistance(50, 100, 80)).toBe(FIT_POLAR);
  });
});

describe('rotation par quarts de tour', () => {
  it('depuis un cran, passe au suivant dans le sens demandé', () => {
    expect(nextQuarter(0, 1)).toBeCloseTo(Q);
    expect(nextQuarter(0, -1)).toBeCloseTo(-Q);
    expect(nextQuarter(Q, 1)).toBeCloseTo(2 * Q);
  });

  it('depuis un angle libre, rejoint le cran voisin dans ce sens', () => {
    expect(nextQuarter(0.3, 1)).toBeCloseTo(Q);
    expect(nextQuarter(0.3, -1)).toBeCloseTo(0);
    expect(nextQuarter(Q - 0.01, 1)).toBeCloseTo(2 * Q);
  });

  it('index du quart de tour, angles négatifs compris', () => {
    expect([0, Q, Math.PI, -Q, -Math.PI + 0.1].map(quarterIndex)).toEqual([0, 1, 2, 3, 2]);
  });

  it('ramène les angles dans ]-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Q)).toBeCloseTo(Q);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });
});

describe('bornes et cadrage', () => {
  const box = { x: 0, y: 0, width: 1000, height: 600 };

  it('le point visé reste dans l’emprise', () => {
    expect(clampToBox(-50, 300, box)).toEqual({ x: 0, y: 300 });
    expect(clampToBox(1200, 900, box)).toEqual({ x: 1000, y: 600 });
    expect(clampToBox(400, 200, box)).toEqual({ x: 400, y: 200 });
  });

  it('un quart de tour échange largeur et profondeur', () => {
    const base = { bounds: box, polar: FIT_POLAR, fov: 40, aspect: 16 / 9, freeWidth: 0.8, freeHeight: 0.9, wallHeight: 40 };
    const flat = fitDistance({ ...base, quarter: 0 });
    const turned = fitDistance({ ...base, quarter: 1 });
    expect(fitDistance({ ...base, quarter: 2 })).toBeCloseTo(flat);
    // Le plateau, plus large que profond, demande plus de recul une fois tourné (sa largeur devient la profondeur).
    expect(turned).toBeGreaterThan(flat);
  });

  it('moins de place libre (HUD) = plus de recul', () => {
    const base = { bounds: box, quarter: 0, polar: FIT_POLAR, fov: 40, aspect: 16 / 9, freeHeight: 0.9, wallHeight: 40 };
    expect(fitDistance({ ...base, freeWidth: 0.5 })).toBeGreaterThan(fitDistance({ ...base, freeWidth: 0.9 }));
  });
});
