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
import { findOverwatchTrigger } from './trigger';

const pistol = { id: 'pistol', kind: 'PISTOL', dice: 4 } as const;
const knife = { id: 'knife', kind: 'CAC', dice: 2 } as const;

/** Combat 7 (difficulté 3), Physique 5 (difficulté de défense 5), 4 PM. */
const rows = [
  { combat: 7, physical: 5, mental: 5, movement: 4 },
  { combat: 7, physical: 5, mental: 5, movement: 4 },
  { combat: 7, physical: 5, mental: 5, movement: 4 },
];
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

interface Opts {
  board?: BoardState;
  characters?: CharacterState[];
  activePlayerId?: string;
  activeCharacterId?: string | null;
  effects?: GameState['effects'];
}

/** Par défaut : h1 (p1) est actif en a ; e1 (p2) est en Overwatch en e ; h2 (p1) en z garde p1 en vie. */
function makeState(opts: Opts = {}): GameState {
  const characters = opts.characters ?? [
    char('h1', 'p1', 'a', { activated: true }),
    char('h2', 'p1', 'z'),
    char('e1', 'p2', 'e', { overwatch: true }),
  ];
  const base = createInitialState({
    gameId: 'g',
    scenarioId: 'ow',
    board: opts.board ?? board(),
    players: [
      { id: 'p1', factionId: 'union', commandPoints: 0 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters,
    rng: new SeededRng(1).snapshot(),
  });
  const activePlayerId = opts.activePlayerId ?? 'p1';
  const active = opts.activeCharacterId === undefined ? 'h1' : opts.activeCharacterId;
  return {
    ...base,
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

const move = (path: string[], characterId = 'h1', playerId = 'p1'): GameCommand => ({
  type: 'MOVE_CHARACTER',
  playerId,
  characterId,
  path,
});
const fire = (weaponId = 'pistol', playerId = 'p2'): GameCommand => ({ type: 'OVERWATCH_FIRE', playerId, weaponId });
const decline = (playerId = 'p2'): GameCommand => ({ type: 'OVERWATCH_DECLINE', playerId });
const overwatch = (characterId = 'h1', playerId = 'p1'): GameCommand => ({ type: 'OVERWATCH', playerId, characterId });

const hp = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const types = (events: readonly { type: string }[]) => events.map((e) => e.type);

/** Applique une commande qui doit être acceptée. */
function run(state: GameState, cmd: GameCommand, rolls: number[] = []) {
  const res = applyCommand(state, cmd, new ScriptedRng(rolls));
  expect(res.errors, JSON.stringify(res.errors)).toEqual([]);
  return res;
}

/** État où h1 a déclenché l'Overwatch de e1 en c (PM restants : 2). */
function triggered(opts: Opts = {}): GameState {
  return run(makeState(opts), move(['b', 'c'])).state;
}

describe('OVERWATCH : pose', () => {
  it('consomme l\'action, pose overwatch=true et émet OVERWATCH_PLACED', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'e')],
    });
    const res = run(state, overwatch());
    expect(types(res.events)).toEqual(['OVERWATCH_PLACED']);
    expect(res.events[0]).toMatchObject({ characterId: 'h1' });
    expect(hp(res.state, 'h1').overwatch).toBe(true);
    expect(res.state.turn.actionUsed).toBe(true);
    expect(res.state.turn.activeCharacterId).toBe('h1');
    expect(res.state.history).toEqual(res.events);
  });

  it('ne coûte aucun PM et n\'empêche pas de bouger ensuite (action puis déplacement)', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'e')] });
    const placed = run(state, overwatch()).state;
    expect(hp(placed, 'h1').movementLeft).toBe(4);
    const moved = run(placed, move(['b']));
    expect(hp(moved.state, 'h1')).toMatchObject({ nodeId: 'b', movementLeft: 3 });
  });

  it('action unique : une seconde pose ou une attaque après est refusée (ACTION_ALREADY_USED)', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c')] });
    const placed = run(state, overwatch()).state;
    expect(applyCommand(placed, overwatch(), new ScriptedRng([])).errors[0]?.code).toBe('ACTION_ALREADY_USED');
    const atk: GameCommand = { type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: 'e1', weaponId: 'pistol' };
    expect(applyCommand(placed, atk, new ScriptedRng([9])).errors[0]?.code).toBe('ACTION_ALREADY_USED');
  });

  it('une attaque déjà faite interdit la pose', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    const atk: GameCommand = { type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: 'e1', weaponId: 'pistol' };
    const attacked = run(state, atk, MISS4).state;
    expect(applyCommand(attacked, overwatch(), new ScriptedRng([])).errors[0]?.code).toBe('ACTION_ALREADY_USED');
  });

  it('refuse : personnage non actif, hors tour, personnage étranger, mort, inconnu, hors activation', () => {
    const base = makeState({
      characters: [char('h1', 'p1', 'a'), char('h2', 'p1', 'b'), char('e1', 'p2', 'e')],
    });
    const code = (s: GameState, cmd: GameCommand) => applyCommand(s, cmd, new ScriptedRng([])).errors[0]?.code;
    expect(code(base, overwatch('h2'))).toBe('NOT_ACTIVE_CHARACTER');
    expect(code(makeState({ characters: base.characters.slice(), activeCharacterId: null }), overwatch())).toBe('NOT_ACTIVE_CHARACTER');
    expect(code(base, overwatch('h1', 'p2'))).toBe('NOT_YOUR_TURN');
    expect(code(base, overwatch('e1'))).toBe('NOT_OWN_CHARACTER');
    expect(code(base, overwatch('zz'))).toBe('UNKNOWN_CHARACTER');
    expect(code({ ...base, phase: 'SETUP' }, overwatch())).toBe('WRONG_PHASE');
    const dead = makeState({ characters: [char('h1', 'p1', 'a', { alive: false, health: 0 }), char('e1', 'p2', 'e')] });
    expect(code(dead, overwatch())).toBe('CHARACTER_DEAD');
  });
});

describe('OVERWATCH : déclenchement', () => {
  it('le déplacement s\'arrête sur la première case vue : chemin tronqué, coût partiel, réaction posée', () => {
    // e1 en e voit c mais pas b : h1 (a -> b -> c -> d) s'arrête en c.
    const res = run(makeState(), move(['b', 'c', 'd']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED', 'OVERWATCH_TRIGGERED']);
    expect(res.events[0]).toMatchObject({ characterId: 'h1', path: ['b', 'c'], cost: 2 });
    expect(res.events[1]).toMatchObject({ overwatcherId: 'e1', targetId: 'h1', nodeId: 'c' });
    expect(hp(res.state, 'h1')).toMatchObject({ nodeId: 'c', movementLeft: 2 });
    expect(res.state.turn.reaction).toEqual({ overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' });
    expect(res.state.turn.activeCharacterId).toBe('h1');
    expect(hp(res.state, 'e1').overwatch).toBe(true);
  });

  it('arrêt dès le premier pas quand la première case est déjà vue', () => {
    const open = new BoardBuilder()
      .node('a', ['r']).node('b', ['r']).node('c', ['r']).node('d', ['r'])
      .edge('a', 'b').edge('b', 'c').edge('c', 'd')
      .build();
    const state = makeState({ board: open, characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'd', { overwatch: true })] });
    const res = run(state, move(['b', 'c']));
    expect(res.events[0]).toMatchObject({ path: ['b'], cost: 1 });
    expect(hp(res.state, 'h1')).toMatchObject({ nodeId: 'b', movementLeft: 3 });
  });

  it('un déplacement qui ne croise aucune case vue n\'est pas interrompu', () => {
    const res = run(makeState(), move(['b']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED']);
    expect(res.state.turn.reaction).toBeUndefined();
  });

  it('un déplacement sans Overwatch adverse n\'est jamais interrompu', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'e')] });
    const res = run(state, move(['b', 'c', 'd']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED']);
    expect(hp(res.state, 'h1').nodeId).toBe('d');
  });

  it('une porte fermée coupe la ligne de vue : pas de déclenchement ; ouverte, si', () => {
    const mk = (door: 'OPEN' | 'CLOSED') =>
      new BoardBuilder()
        .node('a', ['r']).node('b', ['r']).node('c', ['r']).node('d', ['r'])
        .door('door', door)
        .edge('a', 'b').edge('b', 'c').edge('c', 'd', { doorId: 'door' })
        .build();
    const chars = [char('h1', 'p1', 'a'), char('e1', 'p2', 'd', { overwatch: true })];
    const closed = run(makeState({ board: mk('CLOSED'), characters: chars }), move(['b', 'c']));
    expect(types(closed.events)).toEqual(['CHARACTER_MOVED']);
    expect(hp(closed.state, 'h1').nodeId).toBe('c');
    const opened = run(makeState({ board: mk('OPEN'), characters: chars }), move(['b', 'c']));
    expect(types(opened.events)).toContain('OVERWATCH_TRIGGERED');
    expect(hp(opened.state, 'h1').nodeId).toBe('b');
  });

  it('la fumée coupe la ligne de vue : pas de déclenchement', () => {
    const open = new BoardBuilder()
      .node('a', ['r']).node('b', ['r']).node('c', ['r']).node('d', ['r'])
      .edge('a', 'b').edge('b', 'c').edge('c', 'd')
      .build();
    const chars = [char('h1', 'p1', 'a'), char('e1', 'p2', 'd', { overwatch: true })];
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
        char('e1', 'p2', 'e', { overwatch: true }),
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
      characters: [char('h1', 'p1', 'a'), char('h2', 'p1', 'z'), char('e1', 'p2', 'e', { overwatch: true, alive: false, health: 0 })],
    });
    expect(types(run(state, move(['b', 'c'])).events)).toEqual(['CHARACTER_MOVED']);
  });

  it('findOverwatchTrigger : premier overwatcher dans l\'ordre de l\'état', () => {
    const state = makeState({
      characters: [
        char('h1', 'p1', 'a'),
        char('e1', 'p2', 'e', { overwatch: true }),
        char('e2', 'p2', 'd', { overwatch: true }),
      ],
    });
    const mover = hp(state, 'h1');
    expect(findOverwatchTrigger(state, mover, 'c')?.id).toBe('e1');
    expect(findOverwatchTrigger(state, mover, 'b')).toBeNull();
  });
});

describe('OVERWATCH : réaction en attente', () => {
  const code = (s: GameState, cmd: GameCommand) => {
    const rng = new ScriptedRng([9, 9, 9, 9, 9, 9, 9, 9]);
    const res = applyCommand(s, cmd, rng);
    expect(res.accepted).toBe(false);
    expect(res.state).toBe(s);
    expect(rng.snapshot().draws).toBe(0);
    return res.errors[0]?.code;
  };

  it('toute autre commande est refusée avec REACTION_PENDING', () => {
    const state = triggered();
    expect(code(state, move(['d']))).toBe('REACTION_PENDING');
    expect(code(state, { type: 'END_TURN', playerId: 'p1' })).toBe('REACTION_PENDING');
    expect(code(state, { type: 'PASS', playerId: 'p1' })).toBe('REACTION_PENDING');
    expect(code(state, { type: 'SELECT_CHARACTER', playerId: 'p1', characterId: 'h2' })).toBe('REACTION_PENDING');
    expect(code(state, { type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: 'e1', weaponId: 'pistol' })).toBe('REACTION_PENDING');
    expect(code(state, overwatch())).toBe('REACTION_PENDING');
    expect(code(state, { type: 'OPEN_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'x' })).toBe('REACTION_PENDING');
  });

  it('OVERWATCH_FIRE / DECLINE refusés sans réaction, par le mauvais joueur, avec une arme inconnue', () => {
    expect(code(makeState(), fire())).toBe('NO_REACTION');
    expect(code(makeState(), decline())).toBe('NO_REACTION');
    const state = triggered();
    expect(code(state, fire('pistol', 'p1'))).toBe('NOT_YOUR_REACTION');
    expect(code(state, decline('p1'))).toBe('NOT_YOUR_REACTION');
    expect(code(state, fire('bazooka'))).toBe('WEAPON_NOT_OWNED');
  });

  it('un FIRE impossible (corps à corps non adjacent) est refusé et la réaction reste en attente', () => {
    const state = triggered();
    expect(code(state, fire('knife'))).toBe('NOT_ADJACENT');
    expect(state.turn.reaction).toBeDefined();
  });
});

describe('OVERWATCH_FIRE', () => {
  it('touché : échange attaque/défense complet, OVERWATCH_RESOLVED, réaction et overwatch retirés', () => {
    // e1 (Combat 7) : [10,10,1,1] = 2 blessures ; h1 (Physique 5) pare avec [10,1,1,1] -> 1 dégât.
    const res = run(triggered(), fire(), [10, 10, 1, 1, 10, 1, 1, 1]);
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'OVERWATCH_RESOLVED',
    ]);
    expect(res.events[0]).toMatchObject({ attackerId: 'e1', targetId: 'h1', weaponId: 'pistol' });
    expect(res.events[4]).toMatchObject({ wounds: 1, healthLeft: 2 });
    expect(res.events[5]).toMatchObject({ overwatcherId: 'e1', fired: true });
    expect(hp(res.state, 'h1').health).toBe(2);
    expect(res.state.turn.reaction).toBeUndefined();
    expect(hp(res.state, 'e1').overwatch).toBe(false);
  });

  it('l\'activation du mover reprend avec ses PM restants (action de h1 non consommée par la réaction)', () => {
    const res = run(triggered(), fire(), [10, 10, 1, 1, 10, 1, 1, 1]);
    expect(res.state.turn.activeCharacterId).toBe('h1');
    expect(res.state.turn.activePlayerId).toBe('p1');
    expect(res.state.turn.actionUsed).toBe(false);
    expect(hp(res.state, 'h1').movementLeft).toBe(2);
    const next = run(res.state, move(['y']));
    expect(hp(next.state, 'h1')).toMatchObject({ nodeId: 'y', movementLeft: 1 });
  });

  it('manqué : aucun dégât, mais la réaction est tout de même consommée', () => {
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

  it('cible tuée : CHARACTER_DEFEATED puis fin de l\'activation adverse (main au joueur suivant)', () => {
    const state = triggered({
      characters: [
        char('h1', 'p1', 'a', { activated: true, health: 1 }),
        char('h2', 'p1', 'z'),
        char('e1', 'p2', 'e', { overwatch: true }),
      ],
    });
    const res = run(state, fire(), [10, 10, 10, 10, 1, 1, 1, 1]);
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED',
      'CHARACTER_DEFEATED', 'OVERWATCH_RESOLVED', 'CHARACTER_ACTIVATION_ENDED',
    ]);
    expect(res.events.at(-1)).toMatchObject({ characterId: 'h1' });
    expect(hp(res.state, 'h1')).toMatchObject({ alive: false, health: 0 });
    expect(res.state.phase).toBe('ACTIVATION');
    expect(res.state.turn.activeCharacterId).toBeUndefined();
    expect(res.state.turn.reaction).toBeUndefined();
    expect(res.state.turn.activePlayerId).toBe('p2');
  });

  it('cible tuée et dernier personnage : VICTORY, partie terminée, pas de fin d\'activation', () => {
    const state = triggered({
      characters: [char('h1', 'p1', 'a', { activated: true, health: 1 }), char('e1', 'p2', 'e', { overwatch: true })],
    });
    const res = run(state, fire(), [10, 10, 10, 10, 1, 1, 1, 1]);
    expect(res.state.phase).toBe('FINISHED');
    expect(res.state.victory).toEqual({ winnerId: 'p2', reason: 'DEATHMATCH_ELIMINATION' });
    expect(types(res.events)).toContain('VICTORY');
    expect(types(res.events)).not.toContain('CHARACTER_ACTIVATION_ENDED');
  });

  it('une seule réaction : après FIRE, un nouveau déplacement en vue ne redéclenche rien', () => {
    const after = run(triggered(), fire(), MISS4).state;
    const res = run(after, move(['d']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED']);
    expect(res.state.turn.reaction).toBeUndefined();
    expect(hp(res.state, 'h1').nodeId).toBe('d');
  });

  it('deux personnages en Overwatch : un seul réagit à la fois, l\'autre garde son Overwatch', () => {
    const state = triggered({
      characters: [
        char('h1', 'p1', 'a', { activated: true }),
        char('h2', 'p1', 'z'),
        char('e1', 'p2', 'e', { overwatch: true }),
        char('e2', 'p2', 'd', { overwatch: true }),
      ],
    });
    expect(state.turn.reaction?.overwatcherId).toBe('e1');
    const after = run(state, fire(), MISS4).state;
    expect(hp(after, 'e1').overwatch).toBe(false);
    expect(hp(after, 'e2').overwatch).toBe(true);
    // h1 (en c, 2 PM) bouge vers y : vu par e2 -> deuxième réaction.
    const second = run(after, move(['y']));
    expect(second.events.map((e) => e.type)).toContain('OVERWATCH_TRIGGERED');
    expect(second.state.turn.reaction?.overwatcherId).toBe('e2');
  });
});

describe('OVERWATCH_DECLINE', () => {
  it('renonce : OVERWATCH_RESOLVED(fired=false), aucun dé, overwatch retiré, réaction retirée', () => {
    const rng = new ScriptedRng([]);
    const res = applyCommand(triggered(), decline(), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual(['OVERWATCH_RESOLVED']);
    expect(res.events[0]).toMatchObject({ overwatcherId: 'e1', fired: false });
    expect(rng.snapshot().draws).toBe(0);
    expect(res.state.turn.reaction).toBeUndefined();
    expect(hp(res.state, 'e1').overwatch).toBe(false);
    expect(hp(res.state, 'h1').health).toBe(3);
  });

  it('le mouvement peut reprendre avec les PM restants, sans nouveau déclenchement', () => {
    const declined = run(triggered(), decline()).state;
    expect(declined.turn.activeCharacterId).toBe('h1');
    const res = run(declined, move(['d']));
    expect(types(res.events)).toEqual(['CHARACTER_MOVED']);
    expect(hp(res.state, 'h1')).toMatchObject({ nodeId: 'd', movementLeft: 1 });
  });

  it('l\'activation peut ensuite se terminer normalement', () => {
    const declined = run(triggered(), decline()).state;
    const res = run(declined, { type: 'END_TURN', playerId: 'p1' });
    expect(types(res.events)).toContain('CHARACTER_ACTIVATION_ENDED');
    expect(res.state.turn.activePlayerId).toBe('p2');
  });
});

describe('OVERWATCH : cycle de vie', () => {
  it('l\'Overwatch est effacé au refresh du tour suivant', () => {
    const state = makeState({
      characters: [
        char('h1', 'p1', 'a', { activated: true }),
        char('e1', 'p2', 'e', { activated: true, overwatch: true }),
      ],
    });
    const res = run(state, { type: 'END_TURN', playerId: 'p1' }, [9, 2]);
    expect(types(res.events)).toContain('TURN_STARTED');
    expect(res.state.turn.number).toBe(2);
    expect(hp(res.state, 'e1').overwatch).toBe(false);
    expect(hp(res.state, 'h1').overwatch).toBe(false);
  });

  it('un Overwatch posé reste actif jusqu\'à la fin du tour (même après la fin de l\'activation)', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), char('h2', 'p1', 'z'), char('e1', 'p2', 'e')],
    });
    const placed = run(state, overwatch()).state;
    const ended = run(placed, { type: 'END_TURN', playerId: 'p1' }).state;
    expect(hp(ended, 'h1').overwatch).toBe(true);
    expect(ended.turn.actionUsed).toBeUndefined();
  });

  it('état gelé : ni le déclenchement ni FIRE ne mutent l\'état d\'entrée', () => {
    const deepFreeze = <T>(o: T): T => {
      if (o && typeof o === 'object') {
        Object.values(o as object).forEach(deepFreeze);
        Object.freeze(o);
      }
      return o;
    };
    const state = deepFreeze(makeState());
    const trig = run(state, move(['b', 'c']));
    expect(hp(state, 'h1').nodeId).toBe('a');
    deepFreeze(trig.state);
    expect(() => run(trig.state, fire(), [10, 10, 1, 1, 1, 1, 1, 1])).not.toThrow();
    expect(trig.state.turn.reaction).toBeDefined();
  });
});
