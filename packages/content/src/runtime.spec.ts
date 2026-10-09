import { describe, expect, it } from 'vitest';
import { currentStats } from '@tannhauser/core';
import { createCharacterState, loadDevContent } from './index';

describe('createCharacterState', () => {
  const { characters, equipment } = loadDevContent();

  it('crée un personnage vivant à pleine santé avec ses armes et sa ligne de stats active', () => {
    const hero = characters.find((c) => c.id === 'char.alpha.hero')!;
    const state = createCharacterState(hero, equipment, { playerId: 'p1', nodeId: 'n1' });
    expect(state.health).toBe(hero.statRows.length);
    expect(state.alive).toBe(true);
    expect(state.weapons?.map((w) => w.id)).toEqual(['weapon.mauser-c96', 'weapon.unarmed']);
    expect(currentStats(state)).toEqual(hero.statRows[0]);
    expect(state.movementLeft).toBe(hero.statRows[0]!.movement);
  });

  it('copie les effets : armes dans `weapons`, le reste dans `equipment`', () => {
    const alpha = createCharacterState(characters.find((c) => c.id === 'char.alpha.hero')!, equipment, { playerId: 'p1', nodeId: 'n1' });
    expect(alpha.equipment?.map((i) => i.id)).toEqual(['medal.iron-cross-1st-class', 'ability.critical-hit']);
    expect(alpha.equipment?.[0]?.effects).toEqual([{ type: 'GAIN_COMMAND_POINTS', amount: 2 }]);
    const beta = createCharacterState(characters.find((c) => c.id === 'char.beta.hero')!, equipment, { playerId: 'p2', nodeId: 'n16' });
    expect(beta.weapons?.find((w) => w.id === 'weapon.flash-gun-mk1')?.effects).toEqual([{ type: 'EXTRA_DICE_ON_NATURAL_10', dice: 2 }]);
    expect(beta.equipment?.map((i) => i.id)).toEqual(['medal.combat-infantry-badge', 'medal.medal-of-honor']);
    // Une troupe sans équipement non-arme n'a pas de liste `equipment`.
    expect(createCharacterState(characters.find((c) => c.id === 'char.alpha.troop')!, equipment, { playerId: 'p1', nodeId: 'n5' }).equipment).toBeUndefined();
  });

  it('est sérialisable et refuse un équipement inconnu', () => {
    const troop = characters.find((c) => c.id === 'char.beta.troop')!;
    const state = createCharacterState(troop, equipment, { playerId: 'p2', nodeId: 'n16' });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(() => createCharacterState({ ...troop, equipmentIds: ['nope'] }, equipment, { playerId: 'p2', nodeId: 'n16' })).toThrow(/Équipement inconnu/);
  });
});
