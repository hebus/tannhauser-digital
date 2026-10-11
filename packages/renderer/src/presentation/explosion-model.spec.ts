import { describe, expect, it } from 'vitest';
import { explosionSparks, shakeOffset, sootPuffs, sparkAt, SOOT_PUFFS_PER_EXPLOSION, SPARKS_PER_EXPLOSION } from './explosion-model';

describe('explosion', () => {
  it("les étincelles sont déterministes pour une même graine et varient d'une graine à l'autre", () => {
    expect(explosionSparks('boom:1')).toEqual(explosionSparks('boom:1'));
    expect(explosionSparks('boom:1')).not.toEqual(explosionSparks('boom:2'));
    expect(explosionSparks('boom:1')).toHaveLength(SPARKS_PER_EXPLOSION);
    expect(sootPuffs('boom:1')).toHaveLength(SOOT_PUFFS_PER_EXPLOSION);
  });

  it("une étincelle part du centre, s'éloigne en ralentissant puis s'éteint", () => {
    const [spark] = explosionSparks('x');
    const start = sparkAt(spark!, 0);
    const mid = sparkAt(spark!, spark!.life / 2);
    const end = sparkAt(spark!, 1);
    expect(start).toEqual({ radius: 0, alpha: 1 });
    expect(mid.radius).toBeGreaterThan(start.radius);
    expect(mid.radius).toBeLessThan(spark!.distance);
    // Elle parcourt plus de la moitié du trajet dans la première moitié de sa vie (décélération).
    expect(mid.radius).toBeGreaterThan(spark!.distance / 2);
    expect(end.alpha).toBe(0);
    expect(end.radius).toBeCloseTo(spark!.distance);
  });

  it('les paramètres restent dans des bornes raisonnables', () => {
    for (const s of explosionSparks('bornes', 60)) {
      expect(s.distance).toBeGreaterThan(1);
      expect(s.distance).toBeLessThan(3.5);
      expect(s.life).toBeGreaterThan(0.5);
      expect(s.life).toBeLessThanOrEqual(1);
    }
  });

  it('la secousse part de zéro, oscille le long de la direction donnée et revient exactement en place', () => {
    expect(shakeOffset(0, 6, 0)).toEqual({ dx: 0, dy: 0 });
    const horizontal = shakeOffset(0.05, 6, 0);
    expect(horizontal.dx).not.toBe(0);
    expect(horizontal.dy).toBeCloseTo(0);
    const vertical = shakeOffset(0.05, 6, Math.PI / 2);
    expect(vertical.dx).toBeCloseTo(0);
    expect(vertical.dy).not.toBe(0);
    const end = shakeOffset(1, 6, 1);
    expect(Math.abs(end.dx)).toBeLessThan(1e-9);
    expect(Math.abs(end.dy)).toBeLessThan(1e-9);
    // Amplitude bornée par `amp`.
    for (let p = 0; p <= 1; p += 0.01) expect(Math.hypot(shakeOffset(p, 6, 0.7).dx, shakeOffset(p, 6, 0.7).dy)).toBeLessThanOrEqual(6 + 1e-9);
  });
});
