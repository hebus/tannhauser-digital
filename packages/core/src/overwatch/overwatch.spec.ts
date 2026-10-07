import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import type { BoardState } from '../board/types';
import type { GameCommand } from '../commands/commands';
import { applyCommand } from '../engine/apply-command';
import '../engine/start-game';
import { ScriptedRng, SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import type { CharacterState, GameState } from '../state/types';
import '../combat/attack';
import '../movement/index';
import '../turn/handlers';
import './handlers';
import { findOverwatchers, findOverwatchTrigger } from './trigger';

const pistol = { id: 'pistol', kind: 'PISTOL', dice: 4 } as const;
const knife = { id: 'knife', kind: 'CAC', dice: 2 } as const;

/** Combat 7 (difficulté 3), Physique 5 (difficulté de défense 5), 4 PM. */
const row = { combat: 7, physical: 5, mental: 5, movement: 4 };
const rows = [row, row, row];
const MISS4 = [1, 1, 1, 1];

/**
 * a(r) - b(r) - c(g) - d(g) - e(g), et y(g) accroché à c ; z(r) accroché à a.
 * Un personnage en e (ou d) voit c, d, e, y mais ni a ni b ni z.
 */
function board(): BoardState {
  return new BoardBuilder()
    .node('a', ['r'])
    .node('b', ['r'])
    .node('c', ['g'])
    .node('d', ['g'])
    .node('e', ['g'])
    .node('y', ['g'])
    .node('z', ['r'])
    .edge('a', 'b')
    .edge('b', 'c')
    .edge('c', 'd')
    .edge('d', 'e')
    .edge('c', 'y')
    .edge('a', 'z')
    .build();
}

/** Ligne a-b-c-d toute rouge (tout le monde se voit) avec une porte sur la branche b-s. */
function doorBoard(door: 'OPEN' | 'CLOSED'): BoardState {
  return new BoardBuilder()
    .node('a', ['r'])
    .node('b', ['r'])
    .node('c', ['r'])
    .node('d', ['r'])
    .node('s', ['r'])
    .door('dr', door)
    .edge('a', 'b')
    .edge('b', 'c')
    .edge('c', 'd')
    .edge('b', 's', { doorId: 'dr' })
    .build();
}

function char(id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}): CharacterState {
  return {
    id,
    definitionId: id,
    playerId,
    nodeId,
    health: 3,
    statRows: rows,
    alive: true,
    weapons: [pistol, knife],
    activated: false,
    movementLeft: 4,
    ...extra,
  };
}

/** Personnage placé en Overwatch ce tour-ci : en Overwatch et déjà « activé ». */
const watcher = (id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}) =>
  char(id, playerId, nodeId, { overwatch: true, activated: true, ...extra });

interface Opts {
  board?: BoardState;
  characters?: CharacterState[];
  activePlayerId?: string;
  activeCharacterId?: string | null;
  effects?: GameState['effects'];
  commandPoints?: number;
}

function baseState(opts: Opts, characters: CharacterState[]): GameState {
  const cp = opts.commandPoints ?? 2;
  return createInitialState({
    gameId: 'g',
    scenarioId: 'ow',
    board: opts.board ?? board(),
    players: [
      { id: 'p1', factionId: 'union', commandPoints: cp },
      { id: 'p2', factionId: 'reich', commandPoints: cp },
    ],
    characters,
    rng: new SeededRng(1).snapshot(),
  });
}

/** Phase d'activation : h1 (p1) est actif en a ; e1 (p2) est en Overwatch en e ; h2 (p1) en z garde p1 en vie. */
function makeState(opts: Opts = {}): GameState {
  const characters = opts.characters ?? [char('h1', 'p1', 'a', { activated: true }), char('h2', 'p1', 'z'), watcher('e1', 'p2', 'e')];
  const activePlayerId = opts.activePlayerId ?? 'p1';
  const active = opts.activeCharacterId === undefined ? 'h1' : opts.activeCharacterId;
  return {
    ...baseState(opts, characters),
    phase: 'ACTIVATION',
    effects: opts.effects ?? [],
    turn: {
      number: 1,
      initiativePlayerId: 'p1',
      activePlayerId,
      ...(active === null ? {} : { activeCharacterId: active, actionUsed: false }),
    },
  };
}

/** Phase de placement : p2 a l'initiative et décide d'abord. */
function placementState(opts: Opts = {}): GameState {
  const characters = opts.characters ?? [char('h1', 'p1', 'a'), char('h2', 'p1', 'z'), char('e1', 'p2', 'e'), char('e2', 'p2', 'd')];
  return {
    ...baseState(opts, characters),
    phase: 'OVERWATCH',
    turn: { number: 1, initiativePlayerId: 'p2', activePlayerId: opts.activePlayerId ?? 'p2' },
  };
}

const move = (path: string[], characterId = 'h1', playerId = 'p1'): GameCommand => ({
  type: 'MOVE_CHARACTER',
  playerId,
  characterId,
  path,
});
const attack = (targetId = 'e1', attackerId = 'h1', weaponId = 'pistol', playerId = 'p1'): GameCommand => ({
  type: 'ATTACK',
  playerId,
  attackerId,
  targetId,
  weaponId,
});
const fire = (weaponId = 'pistol', playerId = 'p2'): GameCommand => ({ type: 'OVERWATCH_FIRE', playerId, weaponId });
const decline = (playerId = 'p2'): GameCommand => ({ type: 'OVERWATCH_DECLINE', playerId });
const overwatch = (characterId = 'e1', playerId = 'p2'): GameCommand => ({ type: 'OVERWATCH', playerId, characterId });
const endPlacement = (playerId = 'p2'): GameCommand => ({ type: 'END_OVERWATCH_PLACEMENT', playerId });
const endTurn = (playerId = 'p1'): GameCommand => ({ type: 'END_TURN', playerId });

const hp = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const types = (events: readonly { type: string }[]) => events.map((e) => e.type);

/** Applique une commande qui doit être acceptée. */
function run(state: GameState, cmd: GameCommand, rolls: number[] = []) {
  const res = applyCommand(state, cmd, new ScriptedRng(rolls));
  expect(res.errors, JSON.stringify(res.errors)).toEqual([]);
  return res;
}

/** Refus : état inchangé (même référence) et aucun tirage. */
function refusal(state: GameState, cmd: GameCommand): string | undefined {
  const rng = new ScriptedRng([9, 9, 9, 9, 9, 9, 9, 9]);
  const res = applyCommand(state, cmd, rng);
  expect(res.accepted).toBe(false);
  expect(res.state).toBe(state);
  expect(rng.snapshot().draws).toBe(0);
  return res.errors[0]?.code;
}

/** h1 (p1) a déclenché l'Overwatch de e1 en c (PM restants : 2) : déclencheur a, sans commande à reprendre. */
function triggered(opts: Opts = {}): GameState {
  return run(makeState(opts), move(['b', 'c'])).state;
}

/** h1 (p1) est en c, vu de e1 (Overwatch) : toute commande annoncée ouvre une réaction. */
function inSight(extra: Opts = {}): GameState {
  return makeState({
    characters: [char('h1', 'p1', 'c', { activated: true }), char('h2', 'p1', 'z'), watcher('e1', 'p2', 'e')],
    ...extra,
  });
}

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

describe('OVERWATCH : placement (phase OVERWATCH, 1 PC)', () => {
  it('coûte 1 PC, pose overwatch + activated et émet COMMAND_POINTS_SPENT puis OVERWATCH_PLACED', () => {
    const rng = new ScriptedRng([]);
    const res = applyCommand(placementState(), overwatch(), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual(['COMMAND_POINTS_SPENT', 'OVERWATCH_PLACED']);
    expect(res.events[0]).toEqual({ type: 'COMMAND_POINTS_SPENT', playerId: 'p2', amount: 1, purpose: 'OVERWATCH', remaining: 1 });
    expect(res.events[1]).toEqual({ type: 'OVERWATCH_PLACED', characterId: 'e1' });
    expect(res.state.players.find((p) => p.id === 'p2')?.commandPoints).toBe(1);
    expect(res.state.players.find((p) => p.id === 'p1')?.commandPoints).toBe(2);
    expect(hp(res.state, 'e1')).toMatchObject({ overwatch: true, activated: true, movementLeft: 4 });
    expect(res.state.history).toEqual(res.events);
    expect(rng.snapshot().draws).toBe(0);
    expect(res.state.phase).toBe('OVERWATCH');
    expect(res.state.turn.actionUsed).toBeUndefined();
  });

  it('refusé sans PC : INSUFFICIENT_COMMAND_POINTS, « Impossible : 1 PC requis. », état inchangé', () => {
    const state = placementState({ commandPoints: 0 });
    const res = applyCommand(state, overwatch(), new ScriptedRng([]));
    expect(res.accepted).toBe(false);
    expect(res.errors[0]).toEqual({ code: 'INSUFFICIENT_COMMAND_POINTS', message: 'Impossible : 1 PC requis.' });
    expect(res.state).toBe(state);
  });

  it('plusieurs placements tant qu\'il reste des PC ; le troisième est refusé', () => {
    let state = run(placementState({ commandPoints: 2 }), overwatch('e1')).state;
    state = run(state, overwatch('e2')).state;
    expect(state.players.find((p) => p.id === 'p2')?.commandPoints).toBe(0);
    expect(hp(state, 'e1').overwatch).toBe(true);
    expect(hp(state, 'e2').overwatch).toBe(true);
    const more = placementState({
      commandPoints: 2,
      characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'e'), char('e2', 'p2', 'd'), char('e3', 'p2', 'y')],
    });
    const two = run(run(more, overwatch('e1')).state, overwatch('e2')).state;
    expect(refusal(two, overwatch('e3'))).toBe('INSUFFICIENT_COMMAND_POINTS');
  });

  it('ordre de décision : le joueur d\'initiative d\'abord, l\'autre ensuite', () => {
    const state = placementState();
    expect(refusal(state, overwatch('h1', 'p1'))).toBe('NOT_YOUR_PLACEMENT_TURN');
    expect(refusal(state, endPlacement('p1'))).toBe('NOT_YOUR_PLACEMENT_TURN');
    const afterFirst = run(state, endPlacement('p2')).state;
    expect(afterFirst.turn.activePlayerId).toBe('p1');
    expect(refusal(afterFirst, overwatch('e1', 'p2'))).toBe('NOT_YOUR_PLACEMENT_TURN');
    const placed = run(afterFirst, overwatch('h1', 'p1'));
    expect(hp(placed.state, 'h1').overwatch).toBe(true);
    expect(placed.state.players.find((p) => p.id === 'p1')?.commandPoints).toBe(1);
    const ended = run(placed.state, endPlacement('p1'));
    expect(ended.state.phase).toBe('ACTIVATION');
    expect(ended.state.turn.activePlayerId).toBe('p2');
  });

  it('refusé : hors phase de placement, personnage déjà en Overwatch, étranger, mort, inconnu', () => {
    const base = placementState();
    expect(refusal(makeState(), overwatch('h2', 'p1'))).toBe('OVERWATCH_BEFORE_ACTIVATIONS');
    expect(applyCommand(makeState(), overwatch('h2', 'p1'), new ScriptedRng([])).errors[0]?.message).toBe(
      "Impossible : l'Overwatch se place avant les activations.",
    );
    expect(refusal({ ...base, phase: 'SETUP' }, overwatch())).toBe('OVERWATCH_BEFORE_ACTIVATIONS');
    const placed = run(base, overwatch()).state;
    expect(refusal(placed, overwatch())).toBe('ALREADY_OVERWATCH');
    expect(refusal(base, overwatch('h1'))).toBe('NOT_OWN_CHARACTER');
    expect(refusal(base, overwatch('zz'))).toBe('UNKNOWN_CHARACTER');
    const dead = placementState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'e', { alive: false, health: 0 })] });
    expect(refusal(dead, overwatch())).toBe('CHARACTER_DEAD');
  });

  it('END_OVERWATCH_PLACEMENT : événement, puis activations ; refusé hors phase', () => {
    const res = run(run(placementState(), endPlacement('p2')).state, endPlacement('p1'));
    expect(types(res.events)).toEqual(['OVERWATCH_PLACEMENT_ENDED']);
    expect(res.state.phase).toBe('ACTIVATION');
    expect(refusal(res.state, endPlacement('p2'))).toBe('NOT_PLACEMENT_PHASE');
  });

  it('les commandes d\'activation sont refusées pendant la phase de placement', () => {
    const state = placementState();
    expect(refusal(state, { type: 'SELECT_CHARACTER', playerId: 'p2', characterId: 'e1' })).toBe('WRONG_PHASE');
    expect(refusal(state, move(['b'], 'e1', 'p2'))).toBe('WRONG_PHASE');
    expect(refusal(state, endTurn('p2'))).toBe('WRONG_PHASE');
  });
});

describe('Déclencheur a : entrée dans la ligne de vue pendant un déplacement', () => {
  it('le déplacement s\'arrête sur la première case vue : chemin tronqué, coût partiel, réaction posée', () => {
    // e1 en e voit c mais pas b : h1 (a -> b -> c -> d) s'arrête en c.
    const res = run(makeState(), move(['b', 'c', 'd']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED', 'OVERWATCH_TRIGGERED']);
    expect(res.events[0]).toMatchObject({ characterId: 'h1', path: ['b', 'c'], cost: 2 });
    expect(res.events[1]).toMatchObject({ overwatcherId: 'e1', targetId: 'h1', nodeId: 'c' });
    expect(res.events[1]).not.toHaveProperty('announced');
    expect(hp(res.state, 'h1')).toMatchObject({ nodeId: 'c', movementLeft: 2 });
    expect(res.state.turn.reaction).toEqual({ overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' });
    expect(res.state.turn.activeCharacterId).toBe('h1');
    expect(hp(res.state, 'e1').overwatch).toBe(true);
  });

  it('arrêt dès le premier pas quand la première case est déjà vue (départ hors de vue)', () => {
    const open = new BoardBuilder()
      .node('a', ['r']).node('b', ['g']).node('c', ['g']).node('d', ['g'])
      .edge('a', 'b').edge('b', 'c').edge('c', 'd')
      .build();
    const state = makeState({ board: open, characters: [char('h1', 'p1', 'a', { activated: true }), watcher('e1', 'p2', 'd')] });
    const res = run(state, move(['b', 'c']));
    expect(res.events[0]).toMatchObject({ path: ['b'], cost: 1 });
    expect(hp(res.state, 'h1')).toMatchObject({ nodeId: 'b', movementLeft: 3 });
  });

  it('un déplacement qui ne croise aucune case vue n\'est pas interrompu', () => {
    const res = run(makeState(), move(['b']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED']);
    expect(res.state.turn.reaction).toBeUndefined();
  });

  it('sans Overwatch adverse, un déplacement n\'est jamais interrompu', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a', { activated: true }), char('e1', 'p2', 'e', { activated: true })] });
    const res = run(state, move(['b', 'c', 'd']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED']);
    expect(hp(res.state, 'h1').nodeId).toBe('d');
  });

  it('une porte fermée coupe la ligne de vue : pas de déclenchement ; ouverte, si', () => {
    const mk = (door: 'OPEN' | 'CLOSED') =>
      new BoardBuilder()
        .node('a', ['r']).node('b', ['g']).node('c', ['g']).node('d', ['g'])
        .door('door', door)
        .edge('a', 'b').edge('b', 'c').edge('c', 'd', { doorId: 'door' })
        .build();
    const chars = [char('h1', 'p1', 'a', { activated: true }), watcher('e1', 'p2', 'd')];
    const closed = run(makeState({ board: mk('CLOSED'), characters: chars }), move(['b', 'c']));
    expect(types(closed.events)).toEqual(['CHARACTER_MOVED']);
    expect(hp(closed.state, 'h1').nodeId).toBe('c');
    const opened = run(makeState({ board: mk('OPEN'), characters: chars }), move(['b', 'c']));
    expect(types(opened.events)).toContain('OVERWATCH_TRIGGERED');
    expect(hp(opened.state, 'h1').nodeId).toBe('b');
  });

  it('la fumée coupe la ligne de vue : pas de déclenchement', () => {
    const open = new BoardBuilder()
      .node('a', ['r']).node('b', ['g']).node('c', ['g']).node('d', ['g'])
      .edge('a', 'b').edge('b', 'c').edge('c', 'd')
      .build();
    const chars = [char('h1', 'p1', 'a', { activated: true }), watcher('e1', 'p2', 'd')];
    const smoke = [{ id: 'fx', type: 'SMOKE', origin: 'c', remainingTurns: 2 }] as const;
    const smoked = run(makeState({ board: open, characters: chars, effects: smoke }), move(['b', 'c']));
    expect(types(smoked.events)).toEqual(['CHARACTER_MOVED']);
    expect(hp(smoked.state, 'h1').nodeId).toBe('c');
    const clear = run(makeState({ board: open, characters: chars }), move(['b', 'c']));
    expect(types(clear.events)).toContain('OVERWATCH_TRIGGERED');
  });

  it('un allié de l\'overwatcher ne déclenche pas son propre Overwatch', () => {
    const state = makeState({
      activePlayerId: 'p2',
      activeCharacterId: 'e2',
      characters: [
        char('h1', 'p1', 'a'),
        watcher('e1', 'p2', 'e'),
        char('e2', 'p2', 'y', { activated: true }),
      ],
    });
    const res = run(state, move(['c', 'd'], 'e2', 'p2'));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED']);
    expect(res.state.turn.reaction).toBeUndefined();
    expect(hp(res.state, 'e2').nodeId).toBe('d');
  });

  it('un Overwatch mort ne réagit pas', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a', { activated: true }), char('h2', 'p1', 'z'), watcher('e1', 'p2', 'e', { alive: false, health: 0 })],
    });
    expect(types(run(state, move(['b', 'c'])).events)).toEqual(['CHARACTER_MOVED']);
  });

  it('findOverwatchTrigger / findOverwatchers : premier dans l\'ordre de l\'état, refus pris en compte', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), watcher('e1', 'p2', 'e'), watcher('e2', 'p2', 'd')],
    });
    const mover = hp(state, 'h1');
    expect(findOverwatchTrigger(state, mover, 'c')?.id).toBe('e1');
    expect(findOverwatchers(state, mover, 'c').map((c) => c.id)).toEqual(['e1', 'e2']);
    expect(findOverwatchTrigger(state, mover, 'b')).toBeNull();
    const waived = { ...state, turn: { ...state.turn, overwatchWaived: ['e1'] } };
    expect(findOverwatchers(waived, mover, 'c').map((c) => c.id)).toEqual(['e2']);
  });
});

describe('Déclencheur b : adversaire déjà dans la ligne de vue qui tente de se déplacer ou d\'agir', () => {
  it('déplacement : la réaction s\'ouvre AVANT, la commande est mémorisée, rien n\'est déplacé ni tiré', () => {
    const rng = new ScriptedRng([]);
    const res = applyCommand(inSight(), move(['b']), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual(['OVERWATCH_TRIGGERED']);
    expect(res.events[0]).toMatchObject({ overwatcherId: 'e1', targetId: 'h1', nodeId: 'c', announced: 'MOVE_CHARACTER' });
    expect(res.state.turn.reaction).toEqual({ overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2', resume: move(['b']) });
    expect(hp(res.state, 'h1')).toMatchObject({ nodeId: 'c', movementLeft: 4 });
    expect(rng.snapshot().draws).toBe(0);
    expect(res.state.rng).toEqual(rng.snapshot());
  });

  it('attaque : la réaction s\'ouvre avant, sans consommer le RNG ni l\'action', () => {
    const rng = new ScriptedRng([]);
    const res = applyCommand(inSight(), attack(), rng);
    expect(types(res.events)).toEqual(['OVERWATCH_TRIGGERED']);
    expect(res.events[0]).toMatchObject({ announced: 'ATTACK' });
    expect(res.state.turn.reaction?.resume).toEqual(attack());
    expect(res.state.turn.actionUsed).toBe(false);
    expect(rng.snapshot().draws).toBe(0);
  });

  it('ouverture et fermeture de porte : réaction avant l\'exécution', () => {
    const chars = [char('h1', 'p1', 'b', { activated: true }), watcher('e1', 'p2', 'd')];
    const open = run(makeState({ board: doorBoard('CLOSED'), characters: chars }), { type: 'OPEN_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'dr' });
    expect(types(open.events)).toEqual(['OVERWATCH_TRIGGERED']);
    expect(open.events[0]).toMatchObject({ announced: 'OPEN_DOOR' });
    expect(open.state.board.doors['dr']?.state).toBe('CLOSED');
    const closeCmd: GameCommand = { type: 'CLOSE_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'dr' };
    const close = run(makeState({ board: doorBoard('OPEN'), characters: chars }), closeCmd);
    expect(types(close.events)).toEqual(['OVERWATCH_TRIGGERED']);
    expect(close.events[0]).toMatchObject({ announced: 'CLOSE_DOOR' });
    expect(close.state.board.doors['dr']?.state).toBe('OPEN');
  });

  it('toute autre commande est refusée pendant la réaction (REACTION_PENDING)', () => {
    const state = run(inSight(), move(['b'])).state;
    expect(refusal(state, move(['d']))).toBe('REACTION_PENDING');
    expect(refusal(state, endTurn())).toBe('REACTION_PENDING');
    expect(refusal(state, { type: 'PASS', playerId: 'p1' })).toBe('REACTION_PENDING');
    expect(refusal(state, attack())).toBe('REACTION_PENDING');
    expect(refusal(state, { type: 'OPEN_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'x' })).toBe('REACTION_PENDING');
    expect(refusal(state, overwatch('h2', 'p1'))).toBe('REACTION_PENDING');
  });

  it('commande invalide : aucune réaction, le refus normal du handler est renvoyé', () => {
    const state = inSight();
    expect(refusal(state, attack('e1', 'h1', 'knife'))).toBe('NOT_ADJACENT');
    expect(refusal(state, attack('e1', 'h1', 'bazooka'))).toBe('WEAPON_NOT_OWNED');
    expect(refusal(state, move(['e']))).toBeDefined();
    expect(refusal(state, move(['y', 'z']))).toBeDefined();
    expect(refusal(state, { type: 'OPEN_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'inconnue' })).toBe('UNKNOWN_DOOR');
    expect(refusal(state, move(['b'], 'h1', 'p2'))).toBeDefined();
    expect(state.turn.reaction).toBeUndefined();
  });

  it('pas de réaction si le personnage n\'est pas l\'actif, ni si l\'adversaire n\'est pas en vue', () => {
    // h2 (z) n'est pas le personnage actif : la commande suit son cours (et est refusée par le handler).
    const state = inSight();
    expect(applyCommand(state, move(['a'], 'h2'), new ScriptedRng([])).errors).toHaveLength(0);
    // h1 en b n'est pas vu de e1 : aucune réaction.
    const hidden = makeState({ characters: [char('h1', 'p1', 'b', { activated: true }), watcher('e1', 'p2', 'e')] });
    expect(types(run(hidden, move(['a'])).events)).toEqual(['CHARACTER_MOVED']);
  });

  it('une ligne de vue coupée par la fumée sur la case du mover : pas de réaction', () => {
    const smoke = [{ id: 'fx', type: 'SMOKE', origin: 'c', remainingTurns: 2 }] as const;
    expect(types(run(inSight({ effects: smoke }), move(['b'])).events)).toEqual(['CHARACTER_MOVED']);
  });

  it('une ligne de vue coupée par une porte fermée : pas de réaction', () => {
    const closedLine = new BoardBuilder()
      .node('a', ['r']).node('b', ['r']).node('c', ['r']).node('d', ['r'])
      .door('door', 'CLOSED')
      .edge('a', 'b').edge('b', 'c').edge('c', 'd', { doorId: 'door' })
      .build();
    const state = makeState({ board: closedLine, characters: [char('h1', 'p1', 'c', { activated: true }), watcher('e1', 'p2', 'd')] });
    expect(types(run(state, move(['b'])).events)).toEqual(['CHARACTER_MOVED']);
  });

  it('un Overwatch allié ne réagit pas à son propre camp', () => {
    const state = makeState({
      activePlayerId: 'p2',
      activeCharacterId: 'e2',
      characters: [char('h1', 'p1', 'a'), watcher('e1', 'p2', 'e'), char('e2', 'p2', 'c', { activated: true })],
    });
    expect(types(run(state, move(['b'], 'e2', 'p2')).events)).toEqual(['CHARACTER_MOVED']);
  });
});

describe('OVERWATCH_FIRE', () => {
  /** Réaction qui inflige exactement 1 dégât : attaque [10,10,1,1] (2 blessures), défense [10,1,1,1] (1 parée). */
  const HIT = [10, 10, 1, 1, 10, 1, 1, 1];

  it('touché (déclencheur a) : échange attaque/défense complet, OVERWATCH_RESOLVED, plus en Overwatch mais toujours non activable', () => {
    // e1 (Combat 7) : [10,10,1,1] = 2 blessures ; h1 (Physique 5) pare avec [10,1,1,1] -> 1 dégât.
    const res = run(triggered(), fire(), HIT);
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'OVERWATCH_RESOLVED',
    ]);
    expect(res.events[0]).toMatchObject({ attackerId: 'e1', targetId: 'h1', weaponId: 'pistol' });
    expect(res.events[4]).toMatchObject({ wounds: 1, healthLeft: 2 });
    expect(res.events[5]).toMatchObject({ overwatcherId: 'e1', fired: true });
    expect(hp(res.state, 'h1').health).toBe(2);
    expect(res.state.turn.reaction).toBeUndefined();
    expect(hp(res.state, 'e1')).toMatchObject({ overwatch: false, activated: true });
  });

  it('l\'activation du mover reprend avec ses PM restants (action non consommée par la réaction)', () => {
    const res = run(triggered(), fire(), HIT);
    expect(res.state.turn.activeCharacterId).toBe('h1');
    expect(res.state.turn.activePlayerId).toBe('p1');
    expect(res.state.turn.actionUsed).toBe(false);
    expect(hp(res.state, 'h1').movementLeft).toBe(2);
    const next = run(res.state, move(['y']));
    expect(hp(next.state, 'h1')).toMatchObject({ nodeId: 'y', movementLeft: 1 });
  });

  it('manqué : aucun dégât, mais l\'attaque d\'opportunité est consommée', () => {
    const res = run(triggered(), fire(), MISS4);
    expect(types(res.events)).toEqual(['ATTACK_DECLARED', 'COMBAT_ROLLED', 'ATTACK_MISSED', 'OVERWATCH_RESOLVED']);
    expect(hp(res.state, 'h1').health).toBe(3);
    expect(res.state.turn.reaction).toBeUndefined();
    expect(hp(res.state, 'e1').overwatch).toBe(false);
  });

  it('entièrement paré : ATTACK_MISSED après DEFENSE_ROLLED', () => {
    const res = run(triggered(), fire(), [10, 1, 1, 1, 10, 1, 1, 1]);
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_MISSED', 'OVERWATCH_RESOLVED',
    ]);
    expect(hp(res.state, 'h1').health).toBe(3);
  });

  it('ne consomme que les dés de l\'échange (attaque puis défense)', () => {
    const rng = new ScriptedRng([10, 1, 1, 1, 1, 1, 1, 1]);
    const res = applyCommand(triggered(), fire(), rng);
    expect(res.accepted).toBe(true);
    expect(rng.snapshot().draws).toBe(8);
  });

  it('FIRE / DECLINE refusés sans réaction, par le mauvais joueur, arme inconnue ou ciblage impossible', () => {
    expect(refusal(makeState(), fire())).toBe('NO_REACTION');
    expect(refusal(makeState(), decline())).toBe('NO_REACTION');
    const state = triggered();
    expect(refusal(state, fire('pistol', 'p1'))).toBe('NOT_YOUR_REACTION');
    expect(refusal(state, decline('p1'))).toBe('NOT_YOUR_REACTION');
    expect(refusal(state, fire('bazooka'))).toBe('WEAPON_NOT_OWNED');
    expect(refusal(state, fire('knife'))).toBe('NOT_ADJACENT');
    expect(state.turn.reaction).toBeDefined();
  });

  it('déclencheur b : après la réaction, la commande annoncée (déplacement) est exécutée avec les PM intacts', () => {
    const res = run(run(inSight(), move(['b'])).state, fire(), HIT);
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'OVERWATCH_RESOLVED', 'CHARACTER_MOVED',
    ]);
    expect(hp(res.state, 'h1')).toMatchObject({ nodeId: 'b', movementLeft: 3, health: 2 });
    expect(res.state.turn.reaction).toBeUndefined();
    expect(res.state.history.slice(-7)).toEqual(res.events);
  });

  it('déclencheur b : attaque annoncée exécutée après un tir raté (tirages : réaction puis attaque)', () => {
    // Réaction de e1 : [1,1,1,1] (raté). Attaque de h1 sur e1 : [10,10,1,1] ; défense de e1 [10,10,1,1] -> tout paré.
    const rolls = [...MISS4, 10, 10, 1, 1, 10, 10, 1, 1];
    const rng = new ScriptedRng(rolls);
    const res = applyCommand(run(inSight(), attack()).state, fire(), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'ATTACK_MISSED', 'OVERWATCH_RESOLVED',
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_MISSED',
    ]);
    expect(res.events[4]).toMatchObject({ attackerId: 'h1', targetId: 'e1' });
    expect(res.state.turn.actionUsed).toBe(true);
    expect(rng.snapshot().draws).toBe(12);
  });

  it('déclencheur b : ouverture de porte exécutée après la réaction', () => {
    const chars = [char('h1', 'p1', 'b', { activated: true }), watcher('e1', 'p2', 'd')];
    const open: GameCommand = { type: 'OPEN_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'dr' };
    const state = run(makeState({ board: doorBoard('CLOSED'), characters: chars }), open).state;
    const res = run(state, fire(), MISS4);
    expect(types(res.events)).toEqual(['ATTACK_DECLARED', 'COMBAT_ROLLED', 'ATTACK_MISSED', 'OVERWATCH_RESOLVED', 'DOOR_OPENED']);
    expect(res.state.board.doors['dr']?.state).toBe('OPEN');
  });

  it('cible tuée par la réaction : activation terminée, la commande annoncée n\'est PAS exécutée', () => {
    const state = run(
      inSight({
        characters: [char('h1', 'p1', 'c', { activated: true, health: 1 }), char('h2', 'p1', 'z'), watcher('e1', 'p2', 'e')],
      }),
      move(['b']),
    ).state;
    const res = run(state, fire(), [10, 10, 10, 10, 1, 1, 1, 1]);
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED',
      'CHARACTER_DEFEATED', 'OVERWATCH_RESOLVED', 'CHARACTER_ACTIVATION_ENDED',
    ]);
    expect(res.events.at(-1)).toMatchObject({ characterId: 'h1' });
    expect(hp(res.state, 'h1')).toMatchObject({ alive: false, health: 0, nodeId: 'c' });
    expect(res.state.phase).toBe('ACTIVATION');
    expect(res.state.turn.activeCharacterId).toBeUndefined();
    expect(res.state.turn.reaction).toBeUndefined();
    // p2 n'a rien d'activable (e1 est déjà « activé ») : la main reste à p1.
    expect(res.state.turn.activePlayerId).toBe('p1');
  });

  it('cible tuée (déclencheur a) : fin de l\'activation adverse, main au joueur suivant', () => {
    const state = triggered({
      characters: [
        char('h1', 'p1', 'a', { activated: true, health: 1 }),
        char('h2', 'p1', 'z'),
        watcher('e1', 'p2', 'e'),
        char('e2', 'p2', 'y'),
      ],
    });
    const res = run(state, fire(), [10, 10, 10, 10, 1, 1, 1, 1]);
    expect(types(res.events).slice(-2)).toEqual(['OVERWATCH_RESOLVED', 'CHARACTER_ACTIVATION_ENDED']);
    expect(res.state.turn.activePlayerId).toBe('p2');
  });

  it('cible tuée et dernier personnage : VICTORY, partie terminée, pas de fin d\'activation ni de reprise', () => {
    const state = run(
      inSight({ characters: [char('h1', 'p1', 'c', { activated: true, health: 1 }), watcher('e1', 'p2', 'e')] }),
      move(['b']),
    ).state;
    const res = run(state, fire(), [10, 10, 10, 10, 1, 1, 1, 1]);
    expect(res.state.phase).toBe('FINISHED');
    expect(res.state.victory).toEqual({ winnerId: 'p2', reason: 'DEATHMATCH_ELIMINATION' });
    expect(types(res.events)).toContain('VICTORY');
    expect(types(res.events)).not.toContain('CHARACTER_ACTIVATION_ENDED');
    expect(types(res.events)).not.toContain('CHARACTER_MOVED');
  });

  it('reprise refusée après le tir (état modifié) : OVERWATCH_RESUME_REFUSED, la réaction est tout de même résolue', () => {
    // h1 : santé 2, Combat 0 à la dernière ligne ; touché une fois (santé 1), son attaque annoncée devient impossible.
    const state = run(
      inSight({
        characters: [char('h1', 'p1', 'c', { activated: true, health: 2, statRows: [row, { ...row, combat: 0 }] }), watcher('e1', 'p2', 'e')],
      }),
      attack(),
    ).state;
    const res = run(state, fire(), HIT);
    expect(types(res.events).slice(-2)).toEqual(['OVERWATCH_RESOLVED', 'OVERWATCH_RESUME_REFUSED']);
    expect(res.events.at(-1)).toMatchObject({ characterId: 'h1', command: 'ATTACK', code: 'CHARACTERISTIC_ZERO' });
    expect(res.state.turn.reaction).toBeUndefined();
    expect(res.state.turn.actionUsed).toBe(false);
    expect(hp(res.state, 'h1').health).toBe(1);
  });

  it('plusieurs overwatchers : réactions successives avant la commande annoncée', () => {
    const two = [char('h1', 'p1', 'c', { activated: true }), char('h2', 'p1', 'z'), watcher('e1', 'p2', 'e'), watcher('e2', 'p2', 'd')];
    const first = run(makeState({ characters: two }), move(['b'])).state;
    expect(first.turn.reaction?.overwatcherId).toBe('e1');
    // e1 tire (raté) : la commande annoncée est rejouée mais e2 voit toujours h1 -> deuxième réaction.
    const afterFirst = run(first, fire(), MISS4);
    expect(types(afterFirst.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'ATTACK_MISSED', 'OVERWATCH_RESOLVED', 'OVERWATCH_TRIGGERED',
    ]);
    expect(afterFirst.state.turn.reaction).toMatchObject({ overwatcherId: 'e2', resume: move(['b']) });
    expect(hp(afterFirst.state, 'e1').overwatch).toBe(false);
    expect(hp(afterFirst.state, 'e2').overwatch).toBe(true);
    expect(hp(afterFirst.state, 'h1').nodeId).toBe('c');
    // e2 renonce : enfin le déplacement s'exécute.
    const afterSecond = run(afterFirst.state, decline());
    expect(types(afterSecond.events)).toEqual(['OVERWATCH_RESOLVED', 'CHARACTER_MOVED']);
    expect(hp(afterSecond.state, 'h1').nodeId).toBe('b');
  });

  it('une seule attaque par Overwatch : après FIRE, un nouveau déplacement en vue ne redéclenche rien', () => {
    const after = run(triggered(), fire(), MISS4).state;
    const res = run(after, move(['d']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED']);
    expect(res.state.turn.reaction).toBeUndefined();
    expect(hp(res.state, 'h1').nodeId).toBe('d');
  });

  it('deux personnages en Overwatch (déclencheur a) : un seul réagit à la fois, le second au pas suivant', () => {
    const state = triggered({
      characters: [char('h1', 'p1', 'a', { activated: true }), char('h2', 'p1', 'z'), watcher('e1', 'p2', 'e'), watcher('e2', 'p2', 'd')],
    });
    expect(state.turn.reaction?.overwatcherId).toBe('e1');
    const after = run(state, fire(), MISS4);
    expect(hp(after.state, 'e1').overwatch).toBe(false);
    expect(hp(after.state, 'e2').overwatch).toBe(true);
    expect(after.state.turn.reaction).toBeUndefined();
    // h1 (en c) tente de bouger : e2 le voit -> deuxième réaction, avant le déplacement.
    const second = run(after.state, move(['y']));
    expect(types(second.events)).toEqual(['OVERWATCH_TRIGGERED']);
    expect(second.state.turn.reaction).toMatchObject({ overwatcherId: 'e2', resume: move(['y']) });
  });
});

describe('OVERWATCH_DECLINE', () => {
  it('renonce (déclencheur a) : OVERWATCH_RESOLVED(fired=false), aucun dé, Overwatch conservé, réaction retirée', () => {
    const rng = new ScriptedRng([]);
    const res = applyCommand(triggered(), decline(), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual(['OVERWATCH_RESOLVED']);
    expect(res.events[0]).toMatchObject({ overwatcherId: 'e1', fired: false });
    expect(rng.snapshot().draws).toBe(0);
    expect(res.state.turn.reaction).toBeUndefined();
    expect(res.state.turn.overwatchWaived).toEqual(['e1']);
    expect(hp(res.state, 'e1')).toMatchObject({ overwatch: true, activated: true });
    expect(hp(res.state, 'h1').health).toBe(3);
  });

  it('pas de redéclenchement contre le même adversaire pendant son activation (a puis b)', () => {
    const declined = run(triggered(), decline()).state;
    expect(types(run(declined, move(['y'])).events)).toEqual(['CHARACTER_MOVED']);
    // Même en sortant puis en rentrant dans la ligne de vue.
    const out = run(declined, move(['b'])).state;
    expect(types(run(out, move(['c'])).events)).toEqual(['CHARACTER_MOVED']);
    // Une attaque est exécutée directement (aucune réaction), les dés de la partie sont consommés.
    expect(types(run(declined, attack(), MISS4).events).slice(0, 2)).toEqual(['ATTACK_DECLARED', 'COMBAT_ROLLED']);
  });

  it('déclencheur b refusé : la commande annoncée est exécutée immédiatement', () => {
    const res = run(run(inSight(), move(['b'])).state, decline());
    expect(types(res.events)).toEqual(['OVERWATCH_RESOLVED', 'CHARACTER_MOVED']);
    expect(hp(res.state, 'h1')).toMatchObject({ nodeId: 'b', movementLeft: 3 });
    expect(hp(res.state, 'e1').overwatch).toBe(true);
    expect(res.state.turn.reaction).toBeUndefined();
  });

  it('déclencheur b refusé : une attaque annoncée consomme alors les dés de la partie', () => {
    const rng = new ScriptedRng([10, 10, 1, 1, 10, 10, 1, 1]);
    const res = applyCommand(run(inSight(), attack()).state, decline(), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events).slice(0, 3)).toEqual(['OVERWATCH_RESOLVED', 'ATTACK_DECLARED', 'COMBAT_ROLLED']);
    expect(rng.snapshot().draws).toBe(8);
  });

  it('l\'Overwatch redevient actif pour l\'activation suivante (refus remis à zéro)', () => {
    const declined = run(triggered(), decline()).state;
    const ended = run(run(declined, move(['b'])).state, endTurn()).state;
    expect(ended.turn.overwatchWaived).toBeUndefined();
    expect(ended.turn.activePlayerId).toBe('p1');
    const selected = run(ended, { type: 'SELECT_CHARACTER', playerId: 'p1', characterId: 'h2' }).state;
    expect(selected.turn.overwatchWaived).toBeUndefined();
    // h2 (en z) rejoint la ligne de vue : e1 réagit de nouveau.
    const entering = run(selected, move(['a', 'b', 'c'], 'h2'));
    expect(types(entering.events)).toEqual(['CHARACTER_MOVED', 'OVERWATCH_TRIGGERED']);
  });

  it('plusieurs overwatchers : le refus de l\'un laisse l\'autre réagir avant la commande annoncée', () => {
    const two = [char('h1', 'p1', 'c', { activated: true }), char('h2', 'p1', 'z'), watcher('e1', 'p2', 'e'), watcher('e2', 'p2', 'd')];
    const first = run(makeState({ characters: two }), move(['b'])).state;
    const afterFirst = run(first, decline());
    expect(types(afterFirst.events)).toEqual(['OVERWATCH_RESOLVED', 'OVERWATCH_TRIGGERED']);
    expect(afterFirst.state.turn.reaction?.overwatcherId).toBe('e2');
    expect(afterFirst.state.turn.overwatchWaived).toEqual(['e1']);
    const afterSecond = run(afterFirst.state, decline());
    expect(types(afterSecond.events)).toEqual(['OVERWATCH_RESOLVED', 'CHARACTER_MOVED']);
    expect(afterSecond.state.turn.overwatchWaived).toEqual(['e1', 'e2']);
  });

  it('l\'activation peut ensuite se terminer normalement', () => {
    const declined = run(triggered(), decline()).state;
    const res = run(declined, endTurn());
    expect(types(res.events)).toContain('CHARACTER_ACTIVATION_ENDED');
  });
});

describe('OVERWATCH : cycle de vie', () => {
  /** Fin du tour 1 : tout le monde est activé ; END_TURN de p1 démarre le tour 2 (initiative 9 vs 2 : p1). */
  function nextTurnState(characters: CharacterState[]): GameState {
    const state = makeState({ characters });
    return run(state, endTurn(), [9, 2]).state;
  }

  it('le refresh du tour suivant retire l\'Overwatch et rend les PC (on peut alors le replacer pour 1 PC)', () => {
    const state = nextTurnState([char('h1', 'p1', 'a', { activated: true }), watcher('e1', 'p2', 'e')]);
    expect(state.turn.number).toBe(2);
    expect(state.phase).toBe('OVERWATCH');
    expect(hp(state, 'e1')).toMatchObject({ overwatch: false, activated: false });
    expect(state.players.map((p) => p.commandPoints)).toEqual([2, 2]);
    const placed = run(run(state, endPlacement('p1')).state, overwatch('e1'));
    expect(hp(placed.state, 'e1')).toMatchObject({ overwatch: true, activated: true });
    expect(placed.state.players.find((p) => p.id === 'p2')?.commandPoints).toBe(1);
  });

  it('un Overwatch non tiré dure tout le tour : il couvre les activations des deux joueurs, jusqu\'au refresh', () => {
    let state = run(run(placementState(), overwatch()).state, endPlacement('p2')).state;
    state = run(state, endPlacement('p1')).state;
    expect(hp(state, 'e1').overwatch).toBe(true);
    // p2 active e2, puis p1 joue : l'Overwatch de e1 est toujours actif.
    state = run(run(state, { type: 'SELECT_CHARACTER', playerId: 'p2', characterId: 'e2' }).state, endTurn('p2')).state;
    expect(state.turn.activePlayerId).toBe('p1');
    expect(hp(state, 'e1').overwatch).toBe(true);
  });
  it('un Overwatch posé reste actif jusqu\'à la fin du tour et n\'est jamais activable', () => {
    const placed = run(placementState(), overwatch()).state;
    const started = run(run(placed, endPlacement('p2')).state, endPlacement('p1')).state;
    expect(hp(started, 'e1')).toMatchObject({ overwatch: true, activated: true });
    expect(started.turn.activePlayerId).toBe('p2');
    expect(refusal(started, { type: 'SELECT_CHARACTER', playerId: 'p2', characterId: 'e1' })).toBe('IN_OVERWATCH');
  });

  it('un personnage dont l\'attaque d\'opportunité a été réalisée n\'est toujours pas activable ce tour', () => {
    const state = run(triggered(), fire(), MISS4).state;
    expect(hp(state, 'e1')).toMatchObject({ overwatch: false, activated: true });
    const withP2 = { ...state, turn: { ...state.turn, activePlayerId: 'p2', activeCharacterId: undefined } } as GameState;
    expect(refusal(withP2, { type: 'SELECT_CHARACTER', playerId: 'p2', characterId: 'e1' })).toBe('ALREADY_ACTIVATED');
  });
});

describe('OVERWATCH : déterminisme, immutabilité, sérialisation', () => {
  const script: GameCommand[] = [
    overwatch('e1'),
    endPlacement('p2'),
    overwatch('h2', 'p1'),
    endPlacement('p1'),
    { type: 'SELECT_CHARACTER', playerId: 'p1', characterId: 'h1' },
    move(['b', 'c', 'd']),
    fire(),
    move(['y']),
    endTurn(),
  ];

  function play(seed: number) {
    const rng = new SeededRng(seed);
    const base = placementState({
      characters: [char('h1', 'p1', 'a'), char('h2', 'p1', 'z'), char('e1', 'p2', 'e')],
    });
    let state = base;
    const accepted: boolean[] = [];
    for (const cmd of script) {
      const res = applyCommand(state, cmd, rng);
      accepted.push(res.accepted);
      if (res.accepted) state = res.state;
    }
    return { state, accepted };
  }

  it('même seed + mêmes commandes = même état et mêmes refus (replay)', () => {
    const a = play(7);
    const b = play(7);
    expect(a.state).toEqual(b.state);
    expect(a.accepted).toEqual(b.accepted);
    expect(a.accepted.slice(0, 6)).toEqual([true, true, true, true, true, true]);
  });

  it('l\'état reste sérialisable en JSON sans perte, réaction en attente comprise', () => {
    const pending = run(inSight(), move(['b'])).state;
    expect(JSON.parse(JSON.stringify(pending))).toEqual(pending);
    expect(JSON.parse(JSON.stringify(play(7).state))).toEqual(play(7).state);
  });

  it('ouvrir une réaction n\'avance jamais le RNG de la partie', () => {
    const rng = new SeededRng(3);
    const before = rng.snapshot();
    const res = applyCommand(inSight(), attack(), rng);
    expect(res.accepted).toBe(true);
    expect(rng.snapshot()).toEqual(before);
    expect(res.state.rng).toEqual(before);
  });

  it('états gelés : ni le placement, ni le déclenchement, ni FIRE (avec reprise) ne mutent l\'état d\'entrée', () => {
    const placement = deepFreeze(placementState());
    expect(() => run(placement, overwatch())).not.toThrow();
    const state = deepFreeze(inSight());
    const trig = run(state, move(['b']));
    expect(hp(state, 'h1').nodeId).toBe('c');
    deepFreeze(trig.state);
    const res = run(trig.state, fire(), [10, 10, 1, 1, 1, 1, 1, 1]);
    expect(trig.state.turn.reaction).toBeDefined();
    expect(hp(res.state, 'h1').nodeId).toBe('b');
    deepFreeze(res.state);
    expect(() => run(deepFreeze(run(inSight(), move(['b'])).state), decline())).not.toThrow();
  });
});

