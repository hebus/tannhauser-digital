import { describe, expect, it } from 'vitest';
import { currentStats } from '@tannhauser/core';
import { createCharacterState, loadDevContent } from './index';

describe('createCharacterState', () => {
  const { characters, weapons } = loadDevContent();

  it('crée un personnage vivant à pleine santé avec ses armes et sa ligne de stats active', () => {
    const hero = characters.find((c) => c.id === 'char.alpha.hero')!;
    const state = createCharacterState(hero, weapons, { playerId: 'p1', nodeId: 'n1' });
    expect(state.health).toBe(hero.statRows.length);
    expect(state.alive).toBe(true);
    expect(state.weapons?.map((w) => w.id)).toEqual(['weapon.pistol', 'weapon.melee', 'weapon.unarmed']);
    expect(currentStats(state)).toEqual(hero.statRows[0]);
    expect(state.movementLeft).toBe(hero.statRows[0]!.movement);
  });

  it('est sérialisable et refuse une arme inconnue', () => {
    const troop = characters.find((c) => c.id === 'char.beta.troop')!;
    const state = createCharacterState(troop, weapons, { playerId: 'p2', nodeId: 'n16' });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(() => createCharacterState({ ...troop, weaponIds: ['nope'] }, weapons, { playerId: 'p2', nodeId: 'n16' })).toThrow(/Arme inconnue/);
  });
});
