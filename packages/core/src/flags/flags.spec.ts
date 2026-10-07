import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import { applyCommand } from '../engine/apply-command';
import { getLegalActions } from '../actions/legal-actions';
import { ScriptedRng, SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import type { CharacterState, FlagState, GameState } from '../state/types';
import '../index';
import { captureTheFlagWinner, flagsOf } from './state';

const stats = { combat: 8, physical: 5, mental: 5, movement: 3 };

function character(id: string, playerId: string, nodeId: string, health = 2): CharacterState {
  return {
    id,
    definitionId: id,
    playerId,
    nodeId,
    health,
    statRows: [stats, stats],
    alive: true,
    activated: false,
    movementLeft: 3,
    weapons: [{ id: 'pistol', kind: 'PISTOL', dice: 4 }],
  };
}

/** e1 - a - O1 - O2 - O3 - O4 - O5 - O6 - b - e2 : deux camps (e1, e2) et six cases d'objectif au milieu. */
function board(objectives = 6) {
  const builder = new BoardBuilder().node('e1', ['r'], 0, 0, { kind: 'ENTRY_POINT' }).node('a', ['r'], 1, 0);
  const ids = Array.from({ length: objectives }, (_, i) => `O${i + 1}`);
  ids.forEach((id, i) => builder.node(id, ['r'], 2 + i, 0, { kind: 'OBJECTIVE' }));
  builder.node('b', ['r'], 20, 0).node('e2', ['r'], 21, 0, { kind: 'ENTRY_POINT' });
  const chain = ['e1', 'a', ...ids, 'b', 'e2'];
  for (let i = 0; i + 1 < chain.length; i += 1) builder.edge(chain[i]!, chain[i + 1]!);
  return builder.build();
}

function initial(overrides: { mode?: 'CAPTURE_THE_FLAG' | 'DEATHMATCH'; objectives?: number; camps?: boolean; characters?: CharacterState[] } = {}): GameState {
  return createInitialState({
    gameId: 'ctf',
    scenarioId: 'ctf',
    board: board(overrides.objectives),
    players: [
      { id: 'p1', factionId: 'f1', commandPoints: 0 },
      { id: 'p2', factionId: 'f2', commandPoints: 0 },
    ],
    characters: overrides.characters ?? [character('c1', 'p1', 'a'), character('c2', 'p2', 'b')],
    rng: new SeededRng(1).snapshot(),
    ...(overrides.mode === 'DEATHMATCH' ? {} : { mode: 'CAPTURE_THE_FLAG' as const }),
    ...(overrides.camps === false ? {} : { camps: { p1: ['e1'], p2: ['e2'] } }),
  });
}

const started = (state = initial()): GameState => {
  const result = applyCommand(state, { type: 'START_GAME' }, new ScriptedRng([3, 8]));
  if (!result.accepted) throw new Error(result.errors.map((e) => e.message).join());
  return result.state;
};

/** État d'activation direct : `playerId` joue, `characterId` est activé, aucune action utilisée. */
const activation = (state: GameState, playerId: string, characterId: string, patch: Partial<GameState> = {}): GameState => ({
  ...state,
  ...patch,
  phase: 'ACTIVATION',
  turn: { ...state.turn, activePlayerId: playerId, activeCharacterId: characterId, actionUsed: false, reaction: undefined },
});

const withFlags = (state: GameState, flags: FlagState[]): GameState => ({ ...state, flags });
const run = (state: GameState, command: Parameters<typeof applyCommand>[1]) => applyCommand(state, command, new ScriptedRng([5]));

describe('mise en place des drapeaux', () => {
  it('place 3 drapeaux par joueur sur des cases d’objectif distinctes, chacun près de ses personnages', () => {
    const state = started();
    const flags = flagsOf(state);
    expect(flags).toHaveLength(6);
    expect(new Set(flags.map((f) => (f.location.kind === 'NODE' ? f.location.nodeId : ''))).size).toBe(6);
    const nodesOf = (owner: string) => flags.filter((f) => f.ownerId === owner).map((f) => (f.location as { nodeId: string }).nodeId).sort();
    expect(nodesOf('p1')).toEqual(['O1', 'O2', 'O3']);
    expect(nodesOf('p2')).toEqual(['O4', 'O5', 'O6']);
    expect(state.history.filter((e) => e.type === 'FLAG_PLACED')).toHaveLength(6);
  });

  it('refuse de démarrer sans assez de cases d’objectif ou sans camps', () => {
    const few = applyCommand(initial({ objectives: 5 }), { type: 'START_GAME' }, new ScriptedRng([3, 8]));
    expect(few.accepted).toBe(false);
    expect(few.errors[0]!.code).toBe('NOT_ENOUGH_OBJECTIVES');
    const noCamps = applyCommand(initial({ camps: false }), { type: 'START_GAME' }, new ScriptedRng([3, 8]));
    expect(noCamps.errors[0]!.code).toBe('NO_CAMPS');
  });

  it('le Deathmatch ne pose aucun drapeau et refuse les commandes de drapeau', () => {
    const state = started(initial({ mode: 'DEATHMATCH' }));
    expect(flagsOf(state)).toHaveLength(0);
    const refused = run(activation(state, 'p1', 'c1'), { type: 'CAPTURE_FLAG', playerId: 'p1', characterId: 'c1', flagId: 'flag.p2.1' });
    expect(refused.errors[0]!.code).toBe('NO_FLAGS_IN_MODE');
  });
});

describe('récupérer un drapeau', () => {
  const base = () => {
    const s = started();
    // c1 en O3 avec le drapeau ennemi en O4 (voisin), c2 loin.
    return withFlags(activation({ ...s, characters: s.characters.map((c) => (c.id === 'c1' ? { ...c, nodeId: 'O3' } : c)) }, 'p1', 'c1'), [
      { id: 'f.p2', ownerId: 'p2', location: { kind: 'NODE', nodeId: 'O4' } },
      { id: 'f.p1', ownerId: 'p1', location: { kind: 'NODE', nodeId: 'O2' } },
    ]);
  };
  const capture = (state: GameState, flagId = 'f.p2') => run(state, { type: 'CAPTURE_FLAG', playerId: 'p1', characterId: 'c1', flagId });

  it('un drapeau ennemi adjacent est porté, l’action est consommée', () => {
    const result = capture(base());
    expect(result.accepted).toBe(true);
    expect(flagsOf(result.state).find((f) => f.id === 'f.p2')!.location).toEqual({ kind: 'CARRIED', characterId: 'c1' });
    expect(result.state.turn.actionUsed).toBe(true);
    expect(result.events).toEqual([{ type: 'FLAG_CAPTURED', flagId: 'f.p2', characterId: 'c1', nodeId: 'O4' }]);
    expect(capture(result.state).errors[0]!.code).toBe('ACTION_ALREADY_USED');
  });

  it('refuse : son propre drapeau, trop loin, blessé, ennemi adjacent', () => {
    expect(capture(base(), 'f.p1').errors[0]!.code).toBe('OWN_FLAG');
    const far = base();
    expect(capture(withFlags(far, [{ id: 'f.p2', ownerId: 'p2', location: { kind: 'NODE', nodeId: 'O6' } }])).errors[0]!.code).toBe('FLAG_NOT_ADJACENT');
    const wounded = base();
    expect(capture({ ...wounded, characters: wounded.characters.map((c) => (c.id === 'c1' ? { ...c, health: 1 } : c)) }).errors[0]!.code).toBe('WOUNDED_CANNOT_HANDLE_FLAG');
    const enemy = base();
    expect(capture({ ...enemy, characters: enemy.characters.map((c) => (c.id === 'c2' ? { ...c, nodeId: 'O2' } : c)) }).errors[0]!.code).toBe('ENEMY_ADJACENT');
  });

  it('ne reprend pas un drapeau déjà porté ou planté', () => {
    const carried = withFlags(base(), [{ id: 'f.p2', ownerId: 'p2', location: { kind: 'CARRIED', characterId: 'c2' } }]);
    expect(capture(carried).errors[0]!.code).toBe('FLAG_CARRIED');
    const planted = withFlags(base(), [{ id: 'f.p2', ownerId: 'p2', location: { kind: 'PLANTED', playerId: 'p1', nodeId: 'e1' } }]);
    expect(capture(planted).errors[0]!.code).toBe('FLAG_PLANTED');
  });

  it('getLegalActions indique les drapeaux récupérables', () => {
    const action = getLegalActions(base(), 'c1').find((a) => a.id === 'CAPTURE_FLAG')!;
    expect(action.available).toBe(true);
    expect(action.details?.flagIds).toEqual(['f.p2']);
    expect(getLegalActions(base(), 'c1').find((a) => a.id === 'PLANT_FLAG')!.available).toBe(false);
  });
});

describe('planter un drapeau et victoire', () => {
  const carrying = (nodeId: string, planted: FlagState[] = []) => {
    const s = started();
    return withFlags(activation({ ...s, characters: s.characters.map((c) => (c.id === 'c1' ? { ...c, nodeId } : c)) }, 'p1', 'c1'), [
      { id: 'f.p2.1', ownerId: 'p2', location: { kind: 'CARRIED', characterId: 'c1' } },
      { id: 'f.p2.2', ownerId: 'p2', location: { kind: 'CARRIED', characterId: 'c1' } },
      ...planted,
    ]);
  };
  const plant = (state: GameState, flagId = 'f.p2.1') => run(state, { type: 'PLANT_FLAG', playerId: 'p1', characterId: 'c1', flagId });

  it('planter près de son point d’entrée', () => {
    const result = plant(carrying('a'));
    expect(result.accepted).toBe(true);
    expect(flagsOf(result.state).find((f) => f.id === 'f.p2.1')!.location).toEqual({ kind: 'PLANTED', playerId: 'p1', nodeId: 'e1' });
    expect(result.state.phase).not.toBe('FINISHED');
    expect(result.state.turn.actionUsed).toBe(true);
  });

  it('refuse loin du camp ou avec un ennemi adjacent au point d’entrée', () => {
    expect(plant(carrying('O3')).errors[0]!.code).toBe('NOT_AT_CAMP');
    const s = carrying('a');
    const blocked = { ...s, characters: s.characters.map((c) => (c.id === 'c2' ? { ...c, nodeId: 'a' } : c)) };
    expect(plant(blocked).errors[0]!.code).toBe('ENEMY_AT_CAMP');
    expect(plant(carrying('a'), 'f.p1.1').errors[0]!.code).toBe('UNKNOWN_FLAG');
  });

  it('le deuxième drapeau ennemi planté fait gagner immédiatement', () => {
    const first = plant(carrying('a')).state;
    const second = run({ ...first, turn: { ...first.turn, actionUsed: false } }, { type: 'PLANT_FLAG', playerId: 'p1', characterId: 'c1', flagId: 'f.p2.2' });
    expect(second.accepted).toBe(true);
    expect(second.state.phase).toBe('FINISHED');
    expect(second.state.victory).toEqual({ winnerId: 'p1', reason: 'CTF_FLAGS_PLANTED' });
    expect(second.events.at(-1)).toEqual({ type: 'VICTORY', winnerId: 'p1', reason: 'CTF_FLAGS_PLANTED' });
    expect(captureTheFlagWinner(second.state)).toBe('p1');
  });
});

describe('mort du porteur', () => {
  it('dépose les drapeaux portés sur la case du personnage éliminé', () => {
    const s = started(initial({ characters: [character('c1', 'p1', 'O3', 1), character('c2', 'p2', 'O4'), character('c3', 'p2', 'b')] }));
    const state = withFlags(activation({ ...s, characters: s.characters }, 'p2', 'c2'), [{ id: 'f.p1.1', ownerId: 'p1', location: { kind: 'CARRIED', characterId: 'c1' } }]);
    // Attaque garantie : tous les dés à 10 côté attaquant, 1 côté défenseur.
    const result = applyCommand(state, { type: 'ATTACK', playerId: 'p2', attackerId: 'c2', targetId: 'c1', weaponId: 'pistol' }, new ScriptedRng([10, 10, 10, 10, 1, 1, 1, 1]));
    expect(result.accepted).toBe(true);
    expect(result.state.characters.find((c) => c.id === 'c1')!.alive).toBe(false);
    expect(flagsOf(result.state).find((f) => f.id === 'f.p1.1')!.location).toEqual({ kind: 'NODE', nodeId: 'O3' });
    expect(result.events).toContainEqual({ type: 'FLAG_DROPPED', flagId: 'f.p1.1', characterId: 'c1', nodeId: 'O3' });
  });
});
