import { describe, expect, it } from 'vitest';
import { BoardBuilder, SeededRng, createInitialState, type CharacterState } from '@tannhauser/core';
import { adjustHealth, freeNodes, relocateCharacter, resetActivation, switchOwner } from './edit-state';

const rows = [
  { combat: 3, physical: 3, mental: 3, movement: 4 },
  { combat: 2, physical: 2, mental: 2, movement: 3 },
];
const char = (id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}): CharacterState => ({
  id, definitionId: 'd', playerId, nodeId, health: 2, statRows: rows, alive: true, activated: false, movementLeft: 4, ...extra,
});
const board = new BoardBuilder().node('a', ['r']).node('b', ['r']).node('c', ['r']).node('x', ['r'], 0, 0, { passable: false })
  .edge('a', 'b').edge('b', 'c').edge('c', 'x').build();
const state = createInitialState({
  gameId: 'g', scenarioId: 's', board,
  players: [{ id: 'p1', factionId: 'f1', commandPoints: 0 }, { id: 'p2', factionId: 'f2', commandPoints: 0 }],
  characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')], rng: new SeededRng(1).snapshot(),
});

describe('éditeur : retouches d\'état', () => {
  it('placement : case libre seulement', () => {
    const ok = relocateCharacter(state, 'h1', 'c');
    expect(ok.ok && ok.state.characters.find((c) => c.id === 'h1')?.nodeId).toBe('c');
    expect(relocateCharacter(state, 'h1', 'b')).toMatchObject({ ok: false });
    expect(relocateCharacter(state, 'h1', 'x')).toMatchObject({ ok: false });
    expect(relocateCharacter(state, 'h1', 'zz')).toMatchObject({ ok: false });
    expect(freeNodes(state, 'h1')).toEqual(['a', 'c']);
  });

  it('santé bornée à 1..lignes, ressuscite un personnage hors de combat', () => {
    expect(adjustHealth(state, 'h1', +1)).toMatchObject({ ok: false });
    const down = adjustHealth(state, 'h1', -5);
    expect(down.ok && down.state.characters[0]).toMatchObject({ health: 1, alive: true });
    const dead = { ...state, characters: [char('h1', 'p1', 'a', { health: 0, alive: false }), ...state.characters.slice(1)] };
    const back = adjustHealth(dead, 'h1', +1);
    expect(back.ok && back.state.characters[0]).toMatchObject({ health: 1, alive: true });
  });

  it('changement de camp et remise à zéro de l\'activation', () => {
    const swapped = switchOwner(state, 'h1');
    expect(swapped.ok && swapped.state.characters[0]!.playerId).toBe('p2');
    const spent = { ...state, characters: [char('h1', 'p1', 'a', { activated: true, movementLeft: 0 }), ...state.characters.slice(1)] };
    const reset = resetActivation({ ...spent, turn: { ...spent.turn, activeCharacterId: 'h1', actionUsed: true, forcePassageUsed: true } }, 'h1');
    expect(reset.ok && reset.state.characters[0]).toMatchObject({ activated: false, movementLeft: 4 });
    expect(reset.ok && reset.state.turn).toMatchObject({ actionUsed: false, forcePassageUsed: false });
  });
});
