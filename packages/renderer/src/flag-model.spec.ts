import { describe, expect, it } from 'vitest';
import type { FlagState, GameState } from '@tannhauser/core';
import { carriedOwnerIndexes, flagMarks, objectiveNodeIds, plantedNodeIds, usesFlags } from './flag-model';

const node = (id: string, kind: string) => [id, { id, properties: { kind } }] as const;

const state = (flags: FlagState[], mode: GameState['mode'] = 'CAPTURE_THE_FLAG'): GameState =>
  ({
    mode,
    players: [{ id: 'p1' }, { id: 'p2' }],
    board: { nodes: Object.fromEntries([node('b', 'OBJECTIVE'), node('a', 'OBJECTIVE'), node('c', 'NORMAL'), node('e', 'ENTRY_POINT')]) },
    flags,
  }) as unknown as GameState;

const flags: FlagState[] = [
  { id: 'flag.p2.1', ownerId: 'p2', location: { kind: 'NODE', nodeId: 'a' } },
  { id: 'flag.p1.1', ownerId: 'p1', location: { kind: 'NODE', nodeId: 'a' } },
  { id: 'flag.p1.2', ownerId: 'p1', location: { kind: 'CARRIED', characterId: 'h2' } },
  { id: 'flag.p2.2', ownerId: 'p2', location: { kind: 'PLANTED', playerId: 'p1', nodeId: 'e' } },
];

describe('modèle des drapeaux (renderer)', () => {
  it('cases d objectif : marquées seulement en Capture du drapeau, triées', () => {
    expect(objectiveNodeIds(state(flags))).toEqual(['a', 'b']);
    expect(objectiveNodeIds(state(flags, 'DEATHMATCH'))).toEqual([]);
    expect(objectiveNodeIds({ ...state(flags), mode: undefined } as GameState)).toEqual([]);
    expect(usesFlags(state(flags))).toBe(true);
  });

  it('drapeaux au sol et plantés : propriétaire (index), case, planté, rang sur la case ; les portés sont exclus', () => {
    expect(flagMarks(state(flags))).toEqual([
      { flagId: 'flag.p1.1', ownerIndex: 0, nodeId: 'a', planted: false, slot: 0 },
      { flagId: 'flag.p2.1', ownerIndex: 1, nodeId: 'a', planted: false, slot: 1 },
      { flagId: 'flag.p2.2', ownerIndex: 1, nodeId: 'e', planted: true, slot: 0 },
    ]);
  });

  it('drapeaux portés : un index propriétaire par drapeau du porteur', () => {
    expect(carriedOwnerIndexes(state(flags), 'h2')).toEqual([0]);
    expect(carriedOwnerIndexes(state(flags), 'autre')).toEqual([]);
  });

  it('cases de camp avec drapeau planté ; aucun drapeau sans état de drapeaux', () => {
    expect(plantedNodeIds(state(flags))).toEqual(['e']);
    expect(flagMarks({ ...state([]), flags: undefined } as GameState)).toEqual([]);
  });
});
