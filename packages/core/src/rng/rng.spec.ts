import { describe, expect, it } from 'vitest';
import { LoggingRng, ScriptedRng, SeededRng } from './rng';

describe('SeededRng', () => {
  it('produit la même séquence pour la même seed', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const seqA = Array.from({ length: 50 }, () => a.nextInt(1, 10));
    const seqB = Array.from({ length: 50 }, () => b.nextInt(1, 10));
    expect(seqA).toEqual(seqB);
  });

  it('produit des séquences différentes pour des seeds différentes', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(Array.from({ length: 20 }, () => a.nextFloat())).not.toEqual(Array.from({ length: 20 }, () => b.nextFloat()));
  });

  it('reste dans les bornes et atteint min et max sur d10', () => {
    const rng = new SeededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.nextInt(1, 10);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
      seen.add(v);
    }
    expect(seen.size).toBe(10);
  });

  it('reprend la séquence à l\'identique depuis un snapshot', () => {
    const rng = new SeededRng(99);
    rng.nextInt(1, 10);
    rng.nextInt(1, 10);
    const snap = rng.snapshot();
    const expected = Array.from({ length: 10 }, () => rng.nextInt(1, 10));
    const restored = SeededRng.fromSnapshot(snap);
    expect(Array.from({ length: 10 }, () => restored.nextInt(1, 10))).toEqual(expected);
    expect(snap.draws).toBe(2);
  });

  it('rejette un intervalle invalide', () => {
    expect(() => new SeededRng(1).nextInt(5, 1)).toThrow(RangeError);
    expect(() => new SeededRng(1).nextInt(1.5, 3)).toThrow(RangeError);
  });
});

describe('ScriptedRng', () => {
  it('rejoue exactement le script', () => {
    const rng = new ScriptedRng([10, 1, 5]);
    expect([rng.nextInt(1, 10), rng.nextInt(1, 10), rng.nextInt(1, 10)]).toEqual([10, 1, 5]);
  });

  it('échoue quand le script est épuisé ou hors bornes', () => {
    expect(() => new ScriptedRng([]).nextInt(1, 10)).toThrow(/épuisé/);
    expect(() => new ScriptedRng([11]).nextInt(1, 10)).toThrow(RangeError);
  });
});

describe('LoggingRng', () => {
  it('journalise les tirages', () => {
    const rng = new LoggingRng(new ScriptedRng([3, 8]));
    rng.nextInt(1, 10);
    rng.nextInt(1, 10);
    expect(rng.log).toEqual([
      { min: 1, max: 10, result: 3 },
      { min: 1, max: 10, result: 8 },
    ]);
  });
});
