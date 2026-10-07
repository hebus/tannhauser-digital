import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import type { BoardState } from '../board/types';
import { applyCommand } from '../engine/apply-command';
import { SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import type { CharacterState, GameState } from '../state/types';
import { reachableNodes } from './reachable';
import { previewPath, validatePath } from './validate-path';
import './index';

const stats = { combat: 3, physical: 3, mental: 3, movement: 4 };

function char(id: string, playerId: string, nodeId: string, movementLeft = 4, extra: Partial<CharacterState> = {}): CharacterState {
  return { id, definitionId: 'd', playerId, nodeId, health: 1, statRows: [stats], alive: true, activated: false, movementLeft, ...extra };
}

function makeState(board: BoardState, characters: CharacterState[]): GameState {
  const base = createInitialState({
    gameId: 'g', scenarioId: 's', board,
    players: [
      { id: 'p1', factionId: 'union', commandPoints: 0 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters, rng: new SeededRng(1).snapshot(),
  });
  return { ...base, phase: 'ACTIVATION', turn: { number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1' } };
}

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

/** a - b - c - d en ligne. */
const line = () => new BoardBuilder().node('a', ['r']).node('b', ['r']).node('c', ['r']).node('d', ['r'])
  .edge('a', 'b').edge('b', 'c').edge('c', 'd');

const move = (s: GameState, path: string[], characterId = 'h1', playerId = 'p1') =>
  applyCommand(s, { type: 'MOVE_CHARACTER', playerId, characterId, path }, new SeededRng(2));

describe('reachableNodes', () => {
  it('coût normal : 1 PM par case, limité par les PM restants', () => {
    const s = makeState(line().build(), [char('h1', 'p1', 'a', 2)]);
    const r = reachableNodes(s, 'h1');
    expect([...r.keys()]).toEqual(['a', 'b', 'c']);
    expect(r.get('c')).toEqual({ cost: 2, path: ['b', 'c'] });
    expect(r.get('a')).toEqual({ cost: 0, path: [] });
  });

  it('surcoût +1 / +2 à l\'entrée de la case d\'arrivée', () => {
    const board = new BoardBuilder().node('a', ['r']).node('b', ['r'], 0, 0, { movementCostModifier: 1 })
      .node('c', ['r'], 0, 0, { movementCostModifier: 2 }).edge('a', 'b').edge('b', 'c').build();
    const r = reachableNodes(makeState(board, [char('h1', 'p1', 'a', 5)]), 'h1');
    expect(r.get('b')!.cost).toBe(2);
    expect(r.get('c')!.cost).toBe(5);
    expect([...reachableNodes(makeState(board, [char('h1', 'p1', 'a', 4)]), 'h1').keys()]).toEqual(['a', 'b']);
  });

  it('préfère le chemin le moins cher', () => {
    const board = new BoardBuilder().node('a', ['r']).node('b', ['r'], 0, 0, { movementCostModifier: 2 })
      .node('c', ['r']).node('d', ['r']).edge('a', 'b').edge('b', 'd').edge('a', 'c').edge('c', 'd').build();
    expect(reachableNodes(makeState(board, [char('h1', 'p1', 'a')]), 'h1').get('d')).toEqual({ cost: 2, path: ['c', 'd'] });
  });

  it('case impraticable : inatteignable et non traversable', () => {
    const board = new BoardBuilder().node('a', ['r']).node('b', ['r'], 0, 0, { passable: false }).node('c', ['r'])
      .edge('a', 'b').edge('b', 'c').build();
    expect([...reachableNodes(makeState(board, [char('h1', 'p1', 'a')]), 'h1').keys()]).toEqual(['a']);
  });

  it('sens unique : aller autorisé, retour refusé', () => {
    const board = new BoardBuilder().node('a', ['r']).node('b', ['r']).edge('a', 'b', { oneWay: true }).build();
    expect(reachableNodes(makeState(board, [char('h1', 'p1', 'a')]), 'h1').has('b')).toBe(true);
    expect(reachableNodes(makeState(board, [char('h1', 'p1', 'b')]), 'h1').has('a')).toBe(false);
  });

  it('porte fermée bloque, porte ouverte laisse passer', () => {
    const mk = (st: 'OPEN' | 'CLOSED') => new BoardBuilder().node('a', ['r']).node('b', ['r']).door('D', st)
      .edge('a', 'b', { doorId: 'D' }).build();
    expect(reachableNodes(makeState(mk('CLOSED'), [char('h1', 'p1', 'a')]), 'h1').has('b')).toBe(false);
    expect(reachableNodes(makeState(mk('OPEN'), [char('h1', 'p1', 'a')]), 'h1').has('b')).toBe(true);
  });

  it('portail : relie deux nœuds distants dans les deux sens, 1 PM', () => {
    const board = new BoardBuilder().node('a', ['r']).node('z', ['b'], 50, 50).portal('P', 'a', 'z').build();
    const r = reachableNodes(makeState(board, [char('h1', 'p1', 'a')]), 'h1');
    expect(r.get('z')).toEqual({ cost: 1, path: ['z'] });
    expect(reachableNodes(makeState(board, [char('h1', 'p1', 'z')]), 'h1').has('a')).toBe(true);
  });

  it('ennemi bloque ; allié traversable mais pas case d\'arrivée', () => {
    const s = makeState(line().build(), [char('h1', 'p1', 'a'), char('e', 'p2', 'b')]);
    expect([...reachableNodes(s, 'h1').keys()]).toEqual(['a']);
    const s2 = makeState(line().build(), [char('h1', 'p1', 'a'), char('f', 'p1', 'b')]);
    const r = reachableNodes(s2, 'h1');
    expect(r.has('b')).toBe(false);
    expect(r.get('c')).toEqual({ cost: 2, path: ['b', 'c'] });
  });

  it('un ennemi hors de combat n\'occupe plus la case', () => {
    const s = makeState(line().build(), [char('h1', 'p1', 'a'), char('e', 'p2', 'b', 4, { alive: false })]);
    expect(reachableNodes(s, 'h1').has('b')).toBe(true);
  });

  it('personnage inconnu ou mort : rien d\'atteignable', () => {
    const s = makeState(line().build(), [char('h1', 'p1', 'a', 4, { alive: false })]);
    expect(reachableNodes(s, 'h1').size).toBe(0);
    expect(reachableNodes(s, 'zz').size).toBe(0);
  });

  it('déterministe et sans mutation', () => {
    const s = deepFreeze(makeState(line().build(), [char('h1', 'p1', 'b')]));
    const a = [...reachableNodes(s, 'h1').entries()];
    expect(a).toEqual([...reachableNodes(s, 'h1').entries()]);
    expect(a.map(([k]) => k)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('validatePath / previewPath', () => {
  const s = makeState(line().build(), [char('h1', 'p1', 'a', 2)]);

  it('valide un chemin et tolère l\'origine en tête', () => {
    const v = validatePath(s, 'h1', ['a', 'b', 'c']);
    expect(v).toEqual({ ok: true, cost: 2, path: ['b', 'c'], costs: [1, 1] });
    expect(previewPath(s, 'h1', ['b'])).toMatchObject({ ok: true, cost: 1 });
  });

  it('PM insuffisants avec message lisible', () => {
    const v = validatePath(s, 'h1', ['b', 'c', 'd']);
    expect(v).toEqual({ ok: false, errors: [{ code: 'INSUFFICIENT_MOVEMENT', message: 'Impossible : 3 PM requis, 2 disponible(s).' }] });
  });

  it('chemin non connexe, vide, case inconnue', () => {
    expect(validatePath(s, 'h1', ['c'])).toMatchObject({ ok: false, errors: [{ code: 'NOT_ADJACENT' }] });
    expect(validatePath(s, 'h1', [])).toMatchObject({ ok: false, errors: [{ code: 'EMPTY_PATH' }] });
    expect(validatePath(s, 'h1', ['zz'])).toMatchObject({ ok: false, errors: [{ code: 'UNKNOWN_NODE' }] });
    expect(validatePath(s, 'nope', ['b'])).toMatchObject({ ok: false, errors: [{ code: 'UNKNOWN_CHARACTER' }] });
  });

  it('refus : sens unique, porte, impraticable, ennemi, allié en arrivée', () => {
    const board = new BoardBuilder().node('a', ['r']).node('b', ['r']).node('c', ['r']).node('d', ['r'], 0, 0, { passable: false })
      .node('e', ['r']).door('D', 'CLOSED').edge('a', 'b', { oneWay: true }).edge('b', 'c', { doorId: 'D' })
      .edge('b', 'd').edge('b', 'e').build();
    const st = makeState(board, [char('h1', 'p1', 'b'), char('en', 'p2', 'e')]);
    expect(validatePath(st, 'h1', ['a'])).toMatchObject({ ok: false, errors: [{ code: 'ONE_WAY' }] });
    expect(validatePath(st, 'h1', ['c'])).toMatchObject({ ok: false, errors: [{ code: 'DOOR_CLOSED' }] });
    expect(validatePath(st, 'h1', ['d'])).toMatchObject({ ok: false, errors: [{ code: 'IMPASSABLE' }] });
    expect(validatePath(st, 'h1', ['e'])).toMatchObject({ ok: false, errors: [{ code: 'ENEMY_OCCUPIED' }] });
    const st2 = makeState(board, [char('h1', 'p1', 'b'), char('al', 'p1', 'e')]);
    expect(validatePath(st2, 'h1', ['e'])).toMatchObject({ ok: false, errors: [{ code: 'DESTINATION_OCCUPIED' }] });
  });
});

describe('MOVE_CHARACTER', () => {
  const base = () => makeState(line().build(), [char('h1', 'p1', 'a', 3), char('e', 'p2', 'd')]);

  it('déplace, déduit les PM et émet CHARACTER_MOVED', () => {
    const res = move(base(), ['b', 'c']);
    expect(res.accepted).toBe(true);
    const h = res.state.characters.find((c) => c.id === 'h1')!;
    expect(h.nodeId).toBe('c');
    expect(h.movementLeft).toBe(1);
    expect(res.events).toEqual([{ type: 'CHARACTER_MOVED', characterId: 'h1', path: ['b', 'c'], cost: 2 }]);
    expect(res.state.history).toContainEqual(res.events[0]);
  });

  it('traverse un portail pour exactement 1 PM, dans les deux sens', () => {
    const board = new BoardBuilder().node('a', ['r']).node('z', ['b'], 9, 9).portal('P', 'a', 'z').build();
    const res = move(makeState(board, [char('h1', 'p1', 'a', 3)]), ['z']);
    expect(res.accepted).toBe(true);
    expect(res.state.characters[0]!.nodeId).toBe('z');
    expect(res.state.characters[0]!.movementLeft).toBe(2);
    expect(res.events).toEqual([{ type: 'CHARACTER_MOVED', characterId: 'h1', path: ['z'], cost: 1 }]);
    const back = move(makeState(board, [char('h1', 'p1', 'z', 1)]), ['a']);
    expect(back.accepted).toBe(true);
    expect(back.state.characters[0]!.movementLeft).toBe(0);
  });

  it('activation : mouvement possible après une action (PM conservés), avant une action, et entre deux', () => {
    const active = (extra: Partial<GameState['turn']>) => {
      const s = base();
      return { ...s, turn: { ...s.turn, activeCharacterId: 'h1', ...extra } };
    };
    // action déjà effectuée : le déplacement reste permis et n'altère pas actionUsed
    const afterAction = move(active({ actionUsed: true }), ['b']);
    expect(afterAction.accepted).toBe(true);
    expect(afterAction.state.characters[0]!.movementLeft).toBe(2);
    expect(afterAction.state.turn.actionUsed).toBe(true);
    // avant l'action : le déplacement ne consomme pas l'action
    const beforeAction = move(active({}), ['b']);
    expect(beforeAction.accepted).toBe(true);
    expect(beforeAction.state.turn.actionUsed).toBeFalsy();
    // bouger, agir, bouger : le reliquat de PM se réutilise après l'action
    const second = move({ ...beforeAction.state, turn: { ...beforeAction.state.turn, actionUsed: true } }, ['c']);
    expect(second.accepted).toBe(true);
    expect(second.state.characters[0]!.nodeId).toBe('c');
    expect(second.state.characters[0]!.movementLeft).toBe(1);
  });

  it('refuse sans modifier l\'état : mauvais joueur, propriétaire, mort, activé, phase, PM, ennemi', () => {
    const s = base();
    const cases: [ReturnType<typeof move>, string][] = [
      [move(s, ['b'], 'h1', 'p2'), 'NOT_ACTIVE_PLAYER'],
      [move({ ...s, turn: { ...s.turn, activePlayerId: 'p2' } }, ['d'], 'e', 'p1'), 'NOT_ACTIVE_PLAYER'],
      [move(s, ['c'], 'e', 'p1'), 'NOT_OWNER'],
      [move(s, ['b'], 'nope'), 'UNKNOWN_CHARACTER'],
      [move({ ...s, characters: [char('h1', 'p1', 'a', 3, { alive: false })] }, ['b']), 'CHARACTER_DEAD'],
      [move({ ...s, characters: [char('h1', 'p1', 'a', 3, { activated: true })] }, ['b']), 'ALREADY_ACTIVATED'],
      [move({ ...s, phase: 'REFRESH' }, ['b']), 'WRONG_PHASE'],
      [move(makeState(line().build(), [char('h1', 'p1', 'a', 1)]), ['b', 'c']), 'INSUFFICIENT_MOVEMENT'],
    ];
    for (const [res, code] of cases) {
      expect(res.accepted).toBe(false);
      expect(res.errors[0]!.code).toBe(code);
      expect(res.events).toEqual([]);
    }
    const enemyAdj = makeState(line().build(), [char('h1', 'p1', 'c', 3), char('e', 'p2', 'd')]);
    const r = move(enemyAdj, ['d']);
    expect(r.errors[0]).toEqual({ code: 'ENEMY_OCCUPIED', message: 'Impossible : la case d est occupée par un ennemi.' });
    expect(r.state).toBe(enemyAdj);
  });

  it('immutabilité : l\'état d\'origine gelé n\'est pas muté', () => {
    const s = deepFreeze(base());
    const res = move(s, ['b']);
    expect(res.accepted).toBe(true);
    expect(res.state).not.toBe(s);
    expect(s.characters[0]!.nodeId).toBe('a');
  });

  it('déterministe', () => {
    expect(move(base(), ['b', 'c'])).toEqual(move(base(), ['b', 'c']));
  });
});

describe('OPEN_DOOR / CLOSE_DOOR', () => {
  const board = (st: 'OPEN' | 'CLOSED') => new BoardBuilder().node('a', ['r']).node('b', ['r']).node('c', ['r'])
    .door('D', st).edge('a', 'b', { doorId: 'D' }).edge('b', 'c').build();
  const cmd = (s: GameState, type: 'OPEN_DOOR' | 'CLOSE_DOOR', characterId = 'h1') =>
    applyCommand(s, { type, playerId: 'p1', characterId, doorId: 'D' }, new SeededRng(3));

  it('ferme une porte ouverte : 0 PM, DOOR_CLOSED, la porte bloque ensuite', () => {
    const s = makeState(board('OPEN'), [char('h1', 'p1', 'a', 3)]);
    const res = cmd(s, 'CLOSE_DOOR');
    expect(res.accepted).toBe(true);
    expect(res.state.board.doors.D!.state).toBe('CLOSED');
    expect(res.state.characters[0]!.movementLeft).toBe(3);
    expect(res.events).toEqual([{ type: 'DOOR_CLOSED', characterId: 'h1', doorId: 'D', cost: 0 }]);
    expect(reachableNodes(res.state, 'h1').has('b')).toBe(false);
  });

  it('ouvre une porte fermée (0 PM, OQ-DOOR-001) depuis l\'autre côté aussi', () => {
    const s = makeState(board('CLOSED'), [char('h1', 'p1', 'b', 3)]);
    const res = cmd(s, 'OPEN_DOOR');
    expect(res.accepted).toBe(true);
    expect(res.state.board.doors.D!.state).toBe('OPEN');
    expect(res.state.characters[0]!.movementLeft).toBe(3);
    expect(res.events[0]).toEqual({ type: 'DOOR_OPENED', characterId: 'h1', doorId: 'D', cost: 0 });
    expect(reachableNodes(res.state, 'h1').has('a')).toBe(true);
  });

  it('refus : non adjacent, déjà dans l\'état, PM insuffisants, porte inconnue, immuabilité', () => {
    const far = makeState(board('OPEN'), [char('h1', 'p1', 'c', 3)]);
    expect(cmd(far, 'CLOSE_DOOR').errors[0]!.code).toBe('DOOR_NOT_ADJACENT');
    const near = deepFreeze(makeState(board('OPEN'), [char('h1', 'p1', 'a', 0)]));
    expect(cmd(near, 'OPEN_DOOR').errors[0]!.code).toBe('DOOR_ALREADY_OPEN');
    const closed = makeState(board('CLOSED'), [char('h1', 'p1', 'a', 3)]);
    expect(cmd(closed, 'CLOSE_DOOR').errors[0]!.code).toBe('DOOR_ALREADY_CLOSED');
    const unknown = applyCommand(near, { type: 'CLOSE_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'X' }, new SeededRng(3));
    expect(unknown.errors[0]!.code).toBe('UNKNOWN_DOOR');
    expect(near.board.doors.D!.state).toBe('OPEN');
  });

  it('une porte ne coûte rien, même avec 0 PM restant (ouvrir et fermer)', () => {
    const closed = cmd(makeState(board('OPEN'), [char('h1', 'p1', 'a', 0)]), 'CLOSE_DOOR');
    expect(closed.accepted).toBe(true);
    expect(closed.state.board.doors.D!.state).toBe('CLOSED');
    expect(closed.state.characters[0]!.movementLeft).toBe(0);
    expect(closed.events).toEqual([{ type: 'DOOR_CLOSED', characterId: 'h1', doorId: 'D', cost: 0 }]);
    const opened = cmd(makeState(board('CLOSED'), [char('h1', 'p1', 'a', 0)]), 'OPEN_DOOR');
    expect(opened.accepted).toBe(true);
    expect(opened.state.board.doors.D!.state).toBe('OPEN');
    expect(opened.state.characters[0]!.movementLeft).toBe(0);
    expect(opened.events).toEqual([{ type: 'DOOR_OPENED', characterId: 'h1', doorId: 'D', cost: 0 }]);
  });

  it('refuse un joueur non actif', () => {
    const s = makeState(board('OPEN'), [char('h1', 'p1', 'a', 3)]);
    const res = applyCommand(s, { type: 'CLOSE_DOOR', playerId: 'p2', characterId: 'h1', doorId: 'D' }, new SeededRng(3));
    expect(res.errors[0]!.code).toBe('NOT_ACTIVE_PLAYER');
  });
});
