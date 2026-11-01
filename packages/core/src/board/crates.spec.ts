import { describe, expect, it } from 'vitest';
import { objectiveNodes } from '../flags/state';
import { reachableNodes } from '../movement/reachable';
import { validatePath } from '../movement/validate-path';
import { SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import type { CharacterState, GameState } from '../state/types';
import { BoardBuilder } from './builder';
import { crateAt, isPassable, type BoardState } from './types';
import { validateBoard } from './validate';

const stats = { combat: 3, physical: 3, mental: 3, movement: 4 };
const char = (id: string, nodeId: string, movementLeft = 4): CharacterState => ({
  id,
  definitionId: 'd',
  playerId: 'p1',
  nodeId,
  health: 1,
  statRows: [stats],
  alive: true,
  activated: false,
  movementLeft,
});

function makeState(board: BoardState, characters: CharacterState[]): GameState {
  const base = createInitialState({
    gameId: 'g',
    scenarioId: 's',
    board,
    players: [
      { id: 'p1', factionId: 'union', commandPoints: 0 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters,
    rng: new SeededRng(1).snapshot(),
  });
  return { ...base, phase: 'ACTIVATION', turn: { number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1' } };
}

/** a - b - c en ligne, une caisse sur b. */
const line = () => new BoardBuilder().node('a', ['r']).node('b', ['r']).node('c', ['r']).edge('a', 'b').edge('b', 'c').crate('crate1', 'b').build();

describe('caisses en bois (RULE-NODE-006)', () => {
  it('une caisse rend sa case impraticable, et seulement elle', () => {
    const board = line();
    expect(crateAt(board, 'b')?.id).toBe('crate1');
    expect([isPassable(board, 'a'), isPassable(board, 'b'), isPassable(board, 'c'), isPassable(board, 'zz')]).toEqual([true, false, true, false]);
  });

  it('le déplacement ne traverse pas une case à caisse', () => {
    const s = makeState(line(), [char('h1', 'a')]);
    expect([...reachableNodes(s, 'h1').keys()]).toEqual(['a']);
    const refused = validatePath(s, 'h1', ['b']);
    expect(refused).toMatchObject({ ok: false, errors: [{ code: 'IMPASSABLE' }] });
    expect(refused.ok ? '' : refused.errors[0]!.message).toContain('caisse');
  });

  it('une case objectif sous une caisse ne reçoit pas de drapeau', () => {
    const board = new BoardBuilder().node('a', ['r'], 0, 0, { kind: 'OBJECTIVE' }).node('b', ['r'], 0, 0, { kind: 'OBJECTIVE' }).edge('a', 'b').crate('crate1', 'b').build();
    expect(objectiveNodes(makeState(board, []))).toEqual(['a']);
  });

  it('validation : case inconnue, deux caisses sur une case, identifiant dupliqué', () => {
    const base = new BoardBuilder().node('a', ['r']).node('b', ['r']).edge('a', 'b').build();
    const codes = (crates: BoardState['crates']) => validateBoard({ ...base, crates }).map((i) => i.code);
    expect(codes([{ id: 'c1', nodeId: 'a' }])).toEqual([]);
    expect(codes([{ id: 'c1', nodeId: 'zz' }])).toEqual(['CRATE_UNKNOWN_NODE']);
    expect(codes([{ id: 'c1', nodeId: 'a' }, { id: 'c2', nodeId: 'a' }])).toEqual(['DUPLICATE_CRATE']);
    expect(codes([{ id: 'c1', nodeId: 'a' }, { id: 'c1', nodeId: 'b' }])).toEqual(['DUPLICATE_CRATE']);
  });

  it('un plateau sans caisse reste inchangé (champ absent)', () => {
    expect('crates' in new BoardBuilder().node('a', ['r']).build()).toBe(false);
  });
});
