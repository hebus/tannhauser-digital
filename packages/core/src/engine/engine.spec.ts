import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import type { GameState } from '../state/types';
import { createInitialState } from '../state/initial-state';
import { ScriptedRng, SeededRng } from '../rng/rng';
import { applyCommand } from './apply-command';
import './start-game';

function makeState(): GameState {
  const board = new BoardBuilder().node('a', ['red']).node('b', ['red']).edge('a', 'b').build();
  return createInitialState({
    gameId: 'g1',
    scenarioId: 'dev',
    board,
    players: [
      { id: 'p1', factionId: 'union', commandPoints: 0 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters: [],
    rng: new SeededRng(1).snapshot(),
  });
}

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

describe('applyCommand / START_GAME', () => {
  it('démarre la partie, attribue les PC et désigne le joueur d\'initiative', () => {
    const res = applyCommand(makeState(), { type: 'START_GAME' }, new ScriptedRng([3, 8]));
    expect(res.accepted).toBe(true);
    expect(res.state.phase).toBe('ACTIVATION');
    expect(res.state.turn).toEqual({ number: 1, initiativePlayerId: 'p2', activePlayerId: 'p2' });
    expect(res.state.players.map((p) => p.commandPoints)).toEqual([2, 2]);
    expect(res.events.map((e) => e.type)).toEqual([
      'GAME_STARTED', 'TURN_STARTED', 'COMMAND_POINTS_REFRESHED', 'COMMAND_POINTS_REFRESHED', 'INITIATIVE_ROLLED',
    ]);
    expect(res.state.history).toEqual(res.events);
  });

  it('relance en cas d\'égalité à l\'initiative', () => {
    const res = applyCommand(makeState(), { type: 'START_GAME' }, new ScriptedRng([5, 5, 2, 9]));
    expect(res.state.turn.initiativePlayerId).toBe('p2');
  });

  it('ne mute jamais l\'état d\'entrée (état gelé)', () => {
    const state = deepFreeze(makeState());
    expect(() => applyCommand(state, { type: 'START_GAME' }, new SeededRng(5))).not.toThrow();
    expect(state.phase).toBe('SETUP');
  });

  it('refuse un second démarrage et renvoie l\'état d\'origine', () => {
    const first = applyCommand(makeState(), { type: 'START_GAME' }, new SeededRng(5));
    const second = applyCommand(first.state, { type: 'START_GAME' }, new SeededRng(5));
    expect(second.accepted).toBe(false);
    expect(second.errors[0]?.code).toBe('NOT_IN_SETUP');
    expect(second.state).toBe(first.state);
  });

  it('est déterministe : même seed + mêmes commandes = même état', () => {
    const run = () => applyCommand(makeState(), { type: 'START_GAME' }, new SeededRng(123)).state;
    expect(run()).toEqual(run());
  });

  it('l\'état est sérialisable en JSON sans perte', () => {
    const { state } = applyCommand(makeState(), { type: 'START_GAME' }, new SeededRng(7));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('rejette une commande sans handler', () => {
    const res = applyCommand(makeState(), { type: 'PASS', playerId: 'p1' }, new SeededRng(1));
    expect(res.accepted).toBe(false);
    expect(res.errors[0]?.code).toBe('UNSUPPORTED_COMMAND');
  });
});
