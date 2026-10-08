import { describe, expect, it } from 'vitest';
import { ScriptedRng, SeededRng } from '../rng/rng';
import { resolveDuel, rollDuel } from './duel';
import { buildPoolLog, explainCombat, type CombatLog } from './log';
import {
  combineModifiers,
  DEFAULT_TEST_POOL,
  difficultyFor,
  resolveCharacteristicTest,
  resolveTest,
} from './test';

describe('resolveTest (§71.1-71.3)', () => {
  it('la réserve par défaut est de 4 dés et la difficulté vaut 10 − caractéristique', () => {
    expect(DEFAULT_TEST_POOL).toBe(4);
    expect(difficultyFor(6)).toBe(4);
    expect(difficultyFor(0)).toBe(10);
  });

  it('jet minimum : 4 dés à 2 (hors 1 naturel) à difficulté 5 = aucun succès', () => {
    const r = resolveTest(4, 5, {}, new ScriptedRng([2, 2, 2, 2]));
    expect(r.successes).toBe(0);
    expect(r.success).toBe(false);
    expect(r.dice.map((d) => d.outcome)).toEqual(['FAILURE', 'FAILURE', 'FAILURE', 'FAILURE']);
  });

  it('jet maximum : 4 dés à 10 = 4 succès', () => {
    const r = resolveTest(4, 9, {}, new ScriptedRng([10, 10, 10, 10]));
    expect(r.successes).toBe(4);
    expect(r.success).toBe(true);
  });

  it('succès si dé ≥ difficulté (borne incluse)', () => {
    const r = resolveTest(3, 6, {}, new ScriptedRng([5, 6, 7]));
    expect(r.dice.map((d) => d.success)).toEqual([false, true, true]);
  });

  it('10 naturel = toujours succès, même à difficulté > 10', () => {
    const r = resolveTest(1, 14, {}, new ScriptedRng([10]));
    expect(r.dice[0]).toMatchObject({ success: true, outcome: 'NATURAL_10' });
  });

  it('10 naturel reste un succès malgré un malus de résultat', () => {
    const r = resolveTest(1, 9, { resultModifier: -5 }, new ScriptedRng([10]));
    expect(r.dice[0]).toMatchObject({ natural: 10, modified: 5, success: true });
  });

  it('1 naturel = jamais succès, même avec difficulté ≤ 1 ou bonus de résultat', () => {
    const r = resolveTest(2, 1, { resultModifier: +9 }, new ScriptedRng([1, 2]));
    expect(r.dice[0]).toMatchObject({ natural: 1, modified: 10, success: false, outcome: 'NATURAL_1' });
    expect(r.dice[1]?.success).toBe(true);
  });

  it('modificateur de résultat : appliqué à chaque dé après les naturels', () => {
    const bonus = resolveTest(2, 7, { resultModifier: 2 }, new ScriptedRng([5, 4]));
    expect(bonus.dice.map((d) => d.success)).toEqual([true, false]);
    const malus = resolveTest(2, 7, { resultModifier: -1 }, new ScriptedRng([7, 8]));
    expect(malus.dice.map((d) => d.success)).toEqual([false, true]);
  });

  it('dés supplémentaires : agrandissent / réduisent la réserve (jamais sous 0)', () => {
    expect(resolveTest(4, 5, { extraDice: 2 }, new ScriptedRng([5, 5, 5, 5, 5, 5])).dice).toHaveLength(6);
    expect(resolveTest(4, 5, { extraDice: -3 }, new ScriptedRng([5])).dice).toHaveLength(1);
    const none = resolveTest(2, 5, { extraDice: -9 }, new ScriptedRng([]));
    expect(none.poolSize).toBe(0);
    expect(none.successes).toBe(0);
  });

  it('succès automatiques : ajoutés aux succès tirés, sans consommer de dé', () => {
    const rng = new ScriptedRng([2, 2]);
    const r = resolveTest(2, 8, { autoSuccesses: 2 }, rng);
    expect(r.rolledSuccesses).toBe(0);
    expect(r.autoSuccesses).toBe(2);
    expect(r.successes).toBe(2);
    expect(rng.snapshot().draws).toBe(2);
  });

  it('échec automatique : 0 succès, prioritaire sur les succès automatiques et tirés', () => {
    const r = resolveTest(2, 2, { autoFailure: true, autoSuccesses: 3 }, new ScriptedRng([10, 9]));
    expect(r.rolledSuccesses).toBe(2);
    expect(r.successes).toBe(0);
    expect(r.success).toBe(false);
  });

  it('combineModifiers somme les natures sans les mélanger', () => {
    expect(
      combineModifiers({ extraDice: 1, resultModifier: -1 }, undefined, { extraDice: 2, autoSuccesses: 1, autoFailure: true }),
    ).toEqual({ extraDice: 3, resultModifier: -1, autoSuccesses: 1, autoFailure: true });
  });

  it('caractéristique à 0 : 4 dés lancés, difficulté 10 (seuls les 10 naturels réussissent)', () => {
    const rng = new ScriptedRng([9, 9, 10, 1]);
    const r = resolveCharacteristicTest(0, 4, {}, rng);
    expect(r.difficulty).toBe(10);
    expect(r.dice).toHaveLength(4);
    expect(r.successes).toBe(1);
    expect(rng.snapshot().draws).toBe(4);
  });

  it('est déterministe pour une seed donnée et n\'altère pas ses entrées', () => {
    const mods = Object.freeze({ extraDice: 1 });
    const a = resolveTest(4, 6, mods, new SeededRng(99));
    const b = resolveTest(4, 6, mods, new SeededRng(99));
    expect(a).toEqual(b);
  });

  it('propriété : succès toujours entiers, bornés par la réserve + auto, jamais NaN ni négatifs', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const pool = seed % 7;
      const r = resolveTest(pool, 10 - (seed % 10), { extraDice: (seed % 5) - 2, autoSuccesses: seed % 3 }, new SeededRng(seed));
      expect(Number.isInteger(r.successes)).toBe(true);
      expect(r.successes).toBeGreaterThanOrEqual(0);
      expect(r.successes).toBeLessThanOrEqual(r.poolSize + r.autoSuccesses);
      for (const d of r.dice) {
        expect(d.natural).toBeGreaterThanOrEqual(1);
        expect(d.natural).toBeLessThanOrEqual(10);
        if (d.natural === 1) expect(d.success).toBe(false);
        if (d.natural === 10) expect(d.success).toBe(true);
      }
    }
  });
});

describe('Duel (§71.4)', () => {
  const test = (successes: number) => resolveTest(successes, 2, {}, new ScriptedRng(Array<number>(successes).fill(9)));

  it('chaque succès du défenseur annule un succès de l\'attaquant', () => {
    expect(resolveDuel(test(3), test(1))).toEqual({
      attackerSuccesses: 3,
      defenderSuccesses: 1,
      remaining: 2,
      attackerWins: true,
    });
  });

  it('égalité : le défenseur gagne (l\'attaquant doit garder ≥ 1 succès)', () => {
    expect(resolveDuel(test(2), test(2))).toMatchObject({ remaining: 0, attackerWins: false });
  });

  it('défenseur supérieur : reste borné à 0, jamais négatif', () => {
    expect(resolveDuel(test(1), test(4)).remaining).toBe(0);
  });

  it('attaquant sans succès : perd même si le défenseur n\'en a pas', () => {
    expect(resolveDuel(test(0), test(0)).attackerWins).toBe(false);
  });

  it('rollDuel lance l\'attaquant puis le défenseur ; caractéristique 0 = pas de dés', () => {
    const res = rollDuel(
      { characteristic: 7, pool: 2 },
      { characteristic: 7, pool: 2 },
      new ScriptedRng([9, 9, 9, 2]),
    );
    expect(res.attacker.successes).toBe(2);
    expect(res.defender.successes).toBe(1);
    expect(res.outcome.remaining).toBe(1);
    const zero = rollDuel({ characteristic: 7, pool: 1 }, { characteristic: 0, pool: 4 }, new ScriptedRng([9, 9, 9, 9, 9]));
    expect(zero.defender.successes).toBe(0);
    expect(zero.outcome.attackerWins).toBe(true);
  });
});

describe('explainCombat', () => {
  it('restitue base + bonus − pénalités, dés, succès et blessures', () => {
    const t = resolveTest(4, 3, { extraDice: 1, resultModifier: 1, autoSuccesses: 1 }, new ScriptedRng([1, 2, 10, 5, 6]));
    const log: CombatLog = {
      attackerId: 'a',
      targetId: 'b',
      weaponId: 'pistol',
      combatValue: 7,
      ...buildPoolLog(t),
      defense: null,
      defenseRoll: null,
      hit: true,
      wounds: 1,
      healthBefore: 3,
      healthAfter: 2,
      defeated: false,
    };
    const text = explainCombat(log).join('\n');
    expect(text).toContain('Réserve : 4 (arme) + 1 (bonus) − 0 (pénalités) = 5 dé(s).');
    expect(text).toContain('Difficulté : 10 − Combat 7 = 3.');
    expect(text).toContain('1 naturel : échec');
    expect(text).toContain('10 naturel : succès');
    expect(text).toContain('= 5.');
    expect(text).toContain('santé 3 → 2');
  });
});
