import { describe, expect, it } from 'vitest';
import { cloudFade, edgePuffs, PUFFS_PER_CLOUD, PUFFS_PER_EDGE, smokePuffs } from './smoke-model';

describe('fumée', () => {
  it("les bouffées sont déterministes pour un même effet et varient d'un effet à l'autre", () => {
    expect(smokePuffs('smoke-1')).toEqual(smokePuffs('smoke-1'));
    expect(smokePuffs('smoke-1')).not.toEqual(smokePuffs('smoke-2'));
    expect(smokePuffs('smoke-1')).toHaveLength(PUFFS_PER_CLOUD);
  });

  it('les bouffées restent dans le nuage', () => {
    for (const p of smokePuffs('x', 40)) {
      expect(p.orbit).toBeGreaterThan(0);
      expect(p.orbit).toBeLessThanOrEqual(0.8);
      expect(p.alpha).toBeGreaterThan(0);
      expect(p.alpha).toBeLessThan(1);
    }
  });

  it('fondu : entrée progressive, sortie progressive, jamais hors de 0..1', () => {
    expect(cloudFade(0, null)).toBe(0);
    expect(cloudFade(350, null)).toBeCloseTo(0.5);
    expect(cloudFade(5000, null)).toBe(1);
    expect(cloudFade(5000, 350)).toBeCloseTo(0.5);
    expect(cloudFade(5000, 9999)).toBe(0);
  });

  it("les bouffées d'arête sont déterministes et réparties le long du segment", () => {
    expect(edgePuffs('a-b')).toEqual(edgePuffs('a-b'));
    expect(edgePuffs('a-b')).toHaveLength(PUFFS_PER_EDGE);
    const along = edgePuffs('a-b').map((p) => p.along);
    expect(along).toEqual([...along].sort((x, y) => x - y));
    for (const a of along) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1);
    }
  });
});
