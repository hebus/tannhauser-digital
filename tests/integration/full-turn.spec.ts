import { describe, expect, it } from 'vitest';
import {
  BoardBuilder,
  ScriptedRng,
  SeededRng,
  applyCommand,
  createInitialState,
  type CharacterState,
  type GameCommand,
  type GameState,
} from '@tannhauser/core';

const stats = { combat: 8, physical: 5, mental: 5, movement: 3 };

function character(id: string, playerId: string, nodeId: string): CharacterState {
  return {
    id,
    definitionId: id,
    playerId,
    nodeId,
    health: 1,
    statRows: [stats],
    alive: true,
    activated: false,
    movementLeft: 3,
    weapons: [{ id: 'pistol', kind: 'PISTOL', dice: 4 }],
  };
}

function start(rng: ScriptedRng): GameState {
  const board = new BoardBuilder()
    .node('a', ['red'])
    .node('b', ['red'])
    .node('c', ['red'])
    .edge('a', 'b')
    .edge('b', 'c')
    .build();
  const initial = createInitialState({
    gameId: 'it',
    scenarioId: 'it',
    board,
    players: [
      { id: 'p1', factionId: 'f1', commandPoints: 0 },
      { id: 'p2', factionId: 'f2', commandPoints: 0 },
    ],
    characters: [character('h1', 'p1', 'a'), character('h2', 'p2', 'c')],
    rng: new SeededRng(1).snapshot(),
  });
  return applyCommand(initial, { type: 'START_GAME' }, rng).state;
}

describe('tour complet : start → select → move → attack → end', () => {
  it('enchaîne les commandes avec les contrôles d\'activation cohérents', () => {
    // Initiative : p1 = 9, p2 = 2 ; puis jets d'attaque : 10 naturel garantit un succès.
    const rng = new ScriptedRng([9, 2, 10, 10, 10, 10]);
    let state = start(rng);
    expect(state.turn.activePlayerId).toBe('p1');

    const run = (cmd: GameCommand) => {
      const res = applyCommand(state, cmd, rng);
      expect(res.errors, JSON.stringify(res.errors)).toEqual([]);
      state = res.state;
      return res;
    };

    run({ type: 'SELECT_CHARACTER', playerId: 'p1', characterId: 'h1' });
    run({ type: 'MOVE_CHARACTER', playerId: 'p1', characterId: 'h1', path: ['b'] });
    expect(state.characters.find((c) => c.id === 'h1')?.nodeId).toBe('b');

    const attack = run({ type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: 'h2', weaponId: 'pistol' });
    expect(attack.events.map((e) => e.type)).toContain('CHARACTER_DEFEATED');
    expect(state.phase).toBe('FINISHED');
    expect(state.victory.winnerId).toBe('p1');
  });

  it('rejette un déplacement sans activation en cours pour un personnage déjà activé', () => {
    const rng = new ScriptedRng([9, 2]);
    let state = start(rng);
    state = applyCommand(state, { type: 'SELECT_CHARACTER', playerId: 'p1', characterId: 'h1' }, rng).state;
    state = applyCommand(state, { type: 'END_TURN', playerId: 'p1' }, rng).state;
    const res = applyCommand(state, { type: 'MOVE_CHARACTER', playerId: 'p1', characterId: 'h1', path: ['b'] }, rng);
    expect(res.accepted).toBe(false);
  });
});
