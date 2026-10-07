import { describe, expect, it } from 'vitest';
import { currentStats, type CharacterState } from './types';

const row = (combat: number, physical: number, mental: number, movement: number) => ({ combat, physical, mental, movement });

function withHealth(health: number): CharacterState {
  return {
    id: 'c',
    definitionId: 'd',
    playerId: 'p',
    nodeId: 'n',
    health,
    // Chaque niveau de santé a sa propre ligne : les valeurs peuvent monter OU descendre.
    statRows: [row(7, 6, 5, 4), row(5, 7, 5, 3), row(8, 4, 6, 5)],
    alive: true,
    activated: false,
    movementLeft: 0,
  };
}

describe('caractéristiques selon la santé', () => {
  it('lit la ligne du niveau de santé courant, sans supposer de baisse monotone', () => {
    expect(currentStats(withHealth(3))).toEqual(row(7, 6, 5, 4));
    expect(currentStats(withHealth(2))).toEqual(row(5, 7, 5, 3)); // combat baisse, physique monte
    expect(currentStats(withHealth(1))).toEqual(row(8, 4, 6, 5)); // combat remonte, physique baisse
  });
});
