import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import { applyCommand, type CommandResult } from '../engine/apply-command';
import '../engine/start-game';
import '../overwatch/handlers';
import './handlers';
import { ScriptedRng, SeededRng, type RandomSource } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import type { CharacterState, GameState } from '../state/types';
import type { GameCommand } from '../commands/commands';
import { CommandPointService } from './command-points';
import { refreshTurn } from './refresh';

const rows = [
  { combat: 5, physical: 5, mental: 5, movement: 6 },
  { combat: 4, physical: 4, mental: 4, movement: 3 },
];

function character(id: string, playerId: string, extra: Partial<CharacterState> = {}): CharacterState {
  return {
    id, definitionId: 'd', playerId, nodeId: 'a', health: 2, statRows: rows,
    alive: true, activated: false, movementLeft: 0, ...extra,
  };
}

function makeState(config?: { commandPointsPerTurn: number }): GameState {
  const board = new BoardBuilder().node('a', ['red']).node('b', ['red']).edge('a', 'b').build();
  return createInitialState({
    gameId: 'g1', scenarioId: 'dev', board,
    players: [
      { id: 'p1', factionId: 'union', commandPoints: 0 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters: [character('a1', 'p1'), character('a2', 'p1'), character('b1', 'p2'), character('b2', 'p2')],
    rng: new SeededRng(1).snapshot(),
    config,
  });
}

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

/** Enchaîne des commandes en exigeant leur acceptation. */
function run(state: GameState, rng: RandomSource, ...commands: GameCommand[]): CommandResult {
  let res: CommandResult = { accepted: true, state, events: [], errors: [] };
  for (const c of commands) {
    res = applyCommand(res.state, c, rng);
    expect(res.errors, JSON.stringify(c)).toEqual([]);
  }
  return res;
}

const select = (playerId: string, characterId: string): GameCommand => ({ type: 'SELECT_CHARACTER', playerId, characterId });
const end = (playerId: string): GameCommand => ({ type: 'END_TURN', playerId });

const endPlacement = (playerId: string): GameCommand => ({ type: 'END_OVERWATCH_PLACEMENT', playerId });
const otherPlayer = (playerId: string) => (playerId === 'p1' ? 'p2' : 'p1');

/** Termine la phase de placement sans Overwatch : le gagnant de l'initiative confirme, puis l'autre joueur. */
function skipPlacement(state: GameState, rng: RandomSource): GameState {
  const winner = state.turn.initiativePlayerId!;
  return run(state, rng, endPlacement(winner), endPlacement(otherPlayer(winner))).state;
}

/** Partie démarrée en phase OVERWATCH : p2 gagne l'initiative du tour 1 (3 vs 8) et décide en premier. */
function startedPlacement(rng: RandomSource = new ScriptedRng([3, 8])): GameState {
  return applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
}

/** Partie démarrée, placements sautés : phase ACTIVATION, p2 active en premier. */
function started(rng: RandomSource = new ScriptedRng([3, 8])): GameState {
  return skipPlacement(startedPlacement(rng), rng);
}

describe('refresh de début de tour', () => {
  it('remet les PC à la valeur de configuration', () => {
    const state = applyCommand(makeState({ commandPointsPerTurn: 5 }), { type: 'START_GAME' }, new ScriptedRng([3, 8])).state;
    expect(state.players.map((p) => p.commandPoints)).toEqual([5, 5]);
  });

  it('perd les PC non dépensés et réinitialise les personnages vivants', () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      players: base.players.map((p) => ({ ...p, commandPoints: 9 })),
      characters: [
        character('a1', 'p1', { activated: true, movementLeft: 1, health: 1 }),
        character('d1', 'p2', { alive: false, activated: true, movementLeft: 7 }),
      ],
    };
    const { state: next, events } = refreshTurn(state);
    expect(next.players.map((p) => p.commandPoints)).toEqual([2, 2]);
    // Ligne courante selon la santé : health 1 → dernière ligne (mouvement 3).
    expect(next.characters[0]).toMatchObject({ activated: false, movementLeft: 3 });
    expect(next.characters[1]).toMatchObject({ activated: true, movementLeft: 7 });
    expect(events.map((e) => e.type)).toEqual(['COMMAND_POINTS_REFRESHED', 'COMMAND_POINTS_REFRESHED']);
  });

  it('décrémente la fumée et émet SMOKE_EXPIRED à son terme', () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      effects: [
        { id: 's1', type: 'SMOKE', origin: 'a', remainingTurns: 2 },
        { id: 's2', type: 'SMOKE', origin: 'b', remainingTurns: 1 },
      ],
    };
    const { state: next, events } = refreshTurn(state);
    expect(next.effects).toEqual([{ id: 's1', type: 'SMOKE', origin: 'a', remainingTurns: 1 }]);
    expect(events).toContainEqual({ type: 'SMOKE_EXPIRED', effectId: 's2', origin: 'b' });
  });
});

describe('CommandPointService', () => {
  const state = deepFreeze({ ...makeState(), players: [{ id: 'p1', factionId: 'u', commandPoints: 2 }] });

  it('canSpend / spend purs avec raison de refus', () => {
    expect(CommandPointService.canSpend(state, 'p1', 2)).toEqual({ ok: true });
    expect(CommandPointService.canSpend(state, 'p1', 3)).toMatchObject({ ok: false, reason: 'INSUFFICIENT_COMMAND_POINTS' });
    expect(CommandPointService.canSpend(state, 'p1', 0)).toMatchObject({ ok: false, reason: 'INVALID_AMOUNT' });
    expect(CommandPointService.canSpend(state, 'zz', 1)).toMatchObject({ ok: false, reason: 'UNKNOWN_PLAYER' });
    const res = CommandPointService.spend(state, 'p1', 1, 'TEST');
    expect(res.ok && res.state.players[0]?.commandPoints).toBe(1);
    expect(res.ok && res.event).toEqual({ type: 'COMMAND_POINTS_SPENT', playerId: 'p1', amount: 1, purpose: 'TEST', remaining: 1 });
    expect(state.players[0]?.commandPoints).toBe(2);
  });
});

describe('activations alternées', () => {
  it('alterne en commençant par le gagnant de l\'initiative', () => {
    let res = run(started(), new SeededRng(1), select('p2', 'b1'));
    expect(res.events.map((e) => e.type)).toEqual(['CHARACTER_ACTIVATION_STARTED']);
    res = run(res.state, new SeededRng(1), end('p2'));
    expect(res.state.turn.activePlayerId).toBe('p1');
    res = run(res.state, new SeededRng(1), select('p1', 'a1'), end('p1'));
    expect(res.state.turn.activePlayerId).toBe('p2');
    res = run(res.state, new SeededRng(1), select('p2', 'b2'), end('p2'));
    expect(res.state.turn.activePlayerId).toBe('p1');
    expect(res.state.turn.number).toBe(1);
  });

  it('le joueur adverse enchaîne quand l\'autre n\'a plus de personnage', () => {
    const state: GameState = { ...started(), characters: started().characters.filter((c) => c.id !== 'b2') };
    const res = run(state, new SeededRng(1), select('p2', 'b1'), end('p2'), select('p1', 'a1'), end('p1'));
    expect(res.state.turn.activePlayerId).toBe('p1');
  });

  it('enchaîne sur le tour suivant : refresh + initiative, TURN_ENDED', () => {
    // Tour 1 : p2 gagne (3 vs 8). Tour 2 : p1 gagne (9 vs 4).
    const rng = new ScriptedRng([3, 8, 9, 4]);
    const state = started(rng);
    const res = run(
      state, rng,
      select('p2', 'b1'), end('p2'), select('p1', 'a1'), end('p1'),
      select('p2', 'b2'), end('p2'), select('p1', 'a2'),
    );
    const last = applyCommand(res.state, end('p1'), rng);
    expect(last.accepted).toBe(true);
    expect(last.events.map((e) => e.type)).toEqual([
      'CHARACTER_ACTIVATION_ENDED', 'TURN_ENDED', 'TURN_STARTED',
      'COMMAND_POINTS_REFRESHED', 'COMMAND_POINTS_REFRESHED', 'INITIATIVE_ROLLED',
    ]);
    expect(last.state.turn).toEqual({ number: 2, initiativePlayerId: 'p1', activePlayerId: 'p1' });
    expect(last.state.characters.every((c) => !c.activated && c.movementLeft === 6)).toBe(true);
    expect(last.state.phase).toBe('OVERWATCH');
  });

  it('les PC dépensés sont perdus au refresh suivant', () => {
    const rng = new ScriptedRng([3, 8, 2, 9, 6, 2]);
    let state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    state = run(state, rng, { type: 'REROLL_INITIATIVE', playerId: 'p2' }).state; // p2 : 2 → 1 PC
    expect(state.players.find((p) => p.id === 'p2')?.commandPoints).toBe(1);
    state = skipPlacement(state, rng);
    state = run(
      state, rng,
      select('p2', 'b1'), end('p2'), select('p1', 'a1'), end('p1'),
      select('p2', 'b2'), end('p2'), select('p1', 'a2'), end('p1'),
    ).state;
    expect(state.turn.number).toBe(2);
    expect(state.players.map((p) => p.commandPoints)).toEqual([2, 2]);
  });

  it('PASS : le joueur renonce à ses activations restantes', () => {
    const res = run(started(), new SeededRng(1), { type: 'PASS', playerId: 'p2' });
    expect(res.events[0]).toEqual({ type: 'PLAYER_PASSED', playerId: 'p2' });
    expect(res.state.turn.activePlayerId).toBe('p1');
    const after = run(res.state, new SeededRng(1), select('p1', 'a1'), end('p1'));
    expect(after.state.turn.activePlayerId).toBe('p1');
  });

  it('PASS des deux joueurs termine le tour', () => {
    const rng = new ScriptedRng([3, 8, 1, 2]);
    const state = started(rng);
    const res = run(state, rng, { type: 'PASS', playerId: 'p2' }, { type: 'PASS', playerId: 'p1' });
    expect(res.state.turn.number).toBe(2);
    expect(res.events.map((e) => e.type)).toContain('TURN_ENDED');
  });
});

describe('refus de commandes', () => {
  const codeOf = (state: GameState, command: GameCommand) => {
    const res = applyCommand(state, command, new SeededRng(1));
    expect(res.accepted).toBe(false);
    expect(res.state).toBe(state);
    return res.errors[0]?.code;
  };

  it('refuse le mauvais joueur, un personnage adverse, inconnu, mort ou déjà activé', () => {
    const state = started();
    expect(codeOf(state, select('p1', 'a1'))).toBe('NOT_YOUR_TURN');
    expect(codeOf(state, select('p2', 'a1'))).toBe('NOT_YOUR_CHARACTER');
    expect(codeOf(state, select('p2', 'zz'))).toBe('UNKNOWN_CHARACTER');
    const dead: GameState = { ...state, characters: state.characters.map((c) => (c.id === 'b1' ? { ...c, alive: false } : c)) };
    expect(codeOf(dead, select('p2', 'b1'))).toBe('CHARACTER_DEAD');
    const done = run(state, new SeededRng(1), select('p2', 'b1'), end('p2'), select('p1', 'a1'), end('p1')).state;
    expect(codeOf(done, select('p2', 'b1'))).toBe('ALREADY_ACTIVATED');
  });

  it('refuse une seconde sélection, END_TURN/PASS hors contexte et avant démarrage', () => {
    const state = started();
    const active = run(state, new SeededRng(1), select('p2', 'b1')).state;
    expect(codeOf(active, select('p2', 'b2'))).toBe('ACTIVATION_IN_PROGRESS');
    expect(codeOf(active, { type: 'PASS', playerId: 'p2' })).toBe('ACTIVATION_IN_PROGRESS');
    expect(codeOf(state, end('p2'))).toBe('NO_ACTIVE_CHARACTER');
    expect(codeOf(active, end('p1'))).toBe('NOT_YOUR_TURN');
    expect(codeOf(makeState(), select('p1', 'a1'))).toBe('WRONG_PHASE');
  });
});

describe('REROLL_INITIATIVE', () => {
  it('relance, dépense 1 PC et peut changer le gagnant', () => {
    const rng = new ScriptedRng([3, 8, 9, 2]);
    const state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    const res = run(state, rng, { type: 'REROLL_INITIATIVE', playerId: 'p2' });
    expect(res.events.map((e) => e.type)).toEqual(['COMMAND_POINTS_SPENT', 'INITIATIVE_ROLLED', 'INITIATIVE_CHANGED']);
    expect(res.state.turn).toEqual({ number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1' });
    expect(res.state.players.find((p) => p.id === 'p2')?.commandPoints).toBe(1);
  });

  it('rejette si le joueur n\'est pas le gagnant', () => {
    const res = applyCommand(startedPlacement(), { type: 'REROLL_INITIATIVE', playerId: 'p1' }, new SeededRng(1));
    expect(res.errors[0]?.code).toBe('NOT_INITIATIVE_WINNER');
  });

  it('rejette si les PC sont insuffisants', () => {
    const state = startedPlacement();
    const broke: GameState = { ...state, players: state.players.map((p) => ({ ...p, commandPoints: 0 })) };
    const res = applyCommand(broke, { type: 'REROLL_INITIATIVE', playerId: 'p2' }, new SeededRng(1));
    expect(res.accepted).toBe(false);
    expect(res.errors[0]?.code).toBe('INSUFFICIENT_COMMAND_POINTS');
    expect(res.state).toBe(broke);
  });

  it('rejette en phase d\'activation (WRONG_PHASE)', () => {
    const res = applyCommand(started(), { type: 'REROLL_INITIATIVE', playerId: 'p2' }, new SeededRng(1));
    expect(res.errors[0]?.code).toBe('WRONG_PHASE');
  });

  it('rejette dès qu\'un placement a eu lieu ou que le gagnant a confirmé (PLACEMENT_STARTED)', () => {
    const rng = new SeededRng(1);
    const placed = run(startedPlacement(), rng, { type: 'OVERWATCH', playerId: 'p2', characterId: 'b1' }).state;
    expect(applyCommand(placed, { type: 'REROLL_INITIATIVE', playerId: 'p2' }, rng).errors[0]?.code).toBe('PLACEMENT_STARTED');
    const confirmed = run(startedPlacement(), rng, endPlacement('p2')).state;
    expect(applyCommand(confirmed, { type: 'REROLL_INITIATIVE', playerId: 'p2' }, rng).errors[0]?.code).toBe('PLACEMENT_STARTED');
  });

  it('un nouveau gagnant décide en premier après la relance', () => {
    const rng = new ScriptedRng([3, 8, 9, 2]);
    const state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    const rerolled = run(state, rng, { type: 'REROLL_INITIATIVE', playerId: 'p2' }).state;
    expect(rerolled.phase).toBe('OVERWATCH');
    expect(rerolled.turn.activePlayerId).toBe('p1');
    expect(applyCommand(rerolled, endPlacement('p2'), rng).errors[0]?.code).toBe('NOT_YOUR_PLACEMENT_TURN');
  });
});

describe('phase OVERWATCH : enchaînement du tour', () => {
  it('START_GAME : refresh, initiative, puis phase OVERWATCH (le gagnant décide d\'abord)', () => {
    const res = applyCommand(makeState(), { type: 'START_GAME' }, new ScriptedRng([3, 8]));
    expect(res.state.phase).toBe('OVERWATCH');
    expect(res.state.turn).toEqual({ number: 1, initiativePlayerId: 'p2', activePlayerId: 'p2' });
    expect(res.events.map((e) => e.type)).toEqual([
      'GAME_STARTED', 'TURN_STARTED', 'COMMAND_POINTS_REFRESHED', 'COMMAND_POINTS_REFRESHED', 'INITIATIVE_ROLLED',
    ]);
  });

  it('ordre de décision : le gagnant confirme, puis l\'autre ; ensuite les activations (gagnant en premier)', () => {
    const rng = new ScriptedRng([3, 8]);
    const state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    expect(applyCommand(state, endPlacement('p1'), rng).errors[0]?.code).toBe('NOT_YOUR_PLACEMENT_TURN');
    const first = run(state, rng, endPlacement('p2'));
    expect(first.events.map((e) => e.type)).toEqual(['OVERWATCH_PLACEMENT_ENDED']);
    expect(first.state.phase).toBe('OVERWATCH');
    expect(first.state.turn.activePlayerId).toBe('p1');
    const second = run(first.state, rng, endPlacement('p1'));
    expect(second.state.phase).toBe('ACTIVATION');
    expect(second.state.turn.activePlayerId).toBe('p2');
  });

  it('END_OVERWATCH_PLACEMENT est refusé hors de la phase OVERWATCH', () => {
    expect(applyCommand(started(), endPlacement('p2'), new SeededRng(1)).errors[0]?.code).toBe('NOT_PLACEMENT_PHASE');
  });

  it('SELECT_CHARACTER est refusé pendant la phase de placement', () => {
    expect(applyCommand(startedPlacement(), select('p2', 'b1'), new SeededRng(1)).errors[0]?.code).toBe('WRONG_PHASE');
  });

  it('un personnage en Overwatch n\'est pas activable (IN_OVERWATCH) et le tour se termine sans lui', () => {
    const rng = new ScriptedRng([3, 8, 9, 4]);
    let state = startedPlacement(rng);
    state = run(state, rng, { type: 'OVERWATCH', playerId: 'p2', characterId: 'b1' }, endPlacement('p2'), endPlacement('p1')).state;
    expect(applyCommand(state, select('p2', 'b1'), rng).errors[0]?.code).toBe('IN_OVERWATCH');
    state = run(state, rng, select('p2', 'b2'), end('p2'), select('p1', 'a1'), end('p1'), select('p1', 'a2')).state;
    const last = applyCommand(state, end('p1'), rng);
    expect(last.events.map((e) => e.type)).toContain('TURN_ENDED');
    expect(last.state.turn.number).toBe(2);
    expect(last.state.phase).toBe('OVERWATCH');
  });

  it('un joueur dont tous les personnages sont en Overwatch ne bloque pas la partie', () => {
    const rng = new ScriptedRng([3, 8, 9, 4]);
    let state = startedPlacement(rng);
    state = run(
      state, rng,
      { type: 'OVERWATCH', playerId: 'p2', characterId: 'b1' },
      { type: 'OVERWATCH', playerId: 'p2', characterId: 'b2' },
      endPlacement('p2'), endPlacement('p1'),
    ).state;
    // p2 n'a rien à activer : la main revient à p1 qui enchaîne ses deux personnages, puis le tour se termine.
    expect(state.turn.activePlayerId).toBe('p1');
    state = run(state, rng, select('p1', 'a1'), end('p1')).state;
    expect(state.turn.activePlayerId).toBe('p1');
    const last = run(state, rng, select('p1', 'a2'), end('p1'));
    expect(last.events.map((e) => e.type)).toContain('TURN_ENDED');
    expect(last.state.turn.number).toBe(2);
  });

  it('si plus aucun personnage n\'est activable, le tour suivant démarre aussitôt', () => {
    const rng = new ScriptedRng([3, 8, 7, 6]);
    const base = startedPlacement(rng);
    const lone: GameState = { ...base, characters: base.characters.filter((c) => c.playerId === 'p2') };
    const state = run(
      lone, rng,
      { type: 'OVERWATCH', playerId: 'p2', characterId: 'b1' },
      { type: 'OVERWATCH', playerId: 'p2', characterId: 'b2' },
      endPlacement('p2'),
    ).state;
    const res = applyCommand(state, endPlacement('p1'), rng);
    expect(res.accepted).toBe(true);
    expect(res.events.map((e) => e.type)).toEqual([
      'OVERWATCH_PLACEMENT_ENDED', 'TURN_ENDED', 'TURN_STARTED',
      'COMMAND_POINTS_REFRESHED', 'COMMAND_POINTS_REFRESHED', 'INITIATIVE_ROLLED',
    ]);
    expect(res.state.turn.number).toBe(2);
    expect(res.state.phase).toBe('OVERWATCH');
  });
});
describe('déterminisme et immutabilité', () => {
  const script: GameCommand[] = [
    { type: 'REROLL_INITIATIVE', playerId: 'p1' },
    { type: 'OVERWATCH', playerId: 'p1', characterId: 'a1' }, { type: 'OVERWATCH', playerId: 'p2', characterId: 'b1' },
    endPlacement('p1'), endPlacement('p2'), endPlacement('p1'),
    select('p1', 'a2'), end('p1'), select('p2', 'b2'), end('p2'),
  ];

  it('même seed + mêmes commandes = même état', () => {
    const play = (seed: number) => {
      const rng = new SeededRng(seed);
      let state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
      for (const c of script) {
        const winner = state.turn.initiativePlayerId!;
        const cmd = c.type === 'REROLL_INITIATIVE' ? { ...c, playerId: winner } : c;
        const res = applyCommand(state, cmd, rng);
        if (res.accepted) state = res.state;
      }
      return state;
    };
    expect(play(42)).toEqual(play(42));
    expect(JSON.parse(JSON.stringify(play(42)))).toEqual(play(42));
  });

  it('ne mute jamais un état gelé', () => {
    const rng = new ScriptedRng([3, 8, 4, 9, 1, 2, 3, 4]);
    let state = deepFreeze(applyCommand(makeState(), { type: 'START_GAME' }, rng).state);
    for (const c of [
      { type: 'REROLL_INITIATIVE', playerId: 'p2' }, endPlacement('p2'), endPlacement('p1'), select('p1', 'a1'), end('p1'),
      { type: 'PASS', playerId: 'p2' }, { type: 'PASS', playerId: 'p1' },
    ] as GameCommand[]) {
      const res = applyCommand(state, c, rng);
      if (res.accepted) state = deepFreeze(res.state);
    }
    expect(state.turn.number).toBeGreaterThanOrEqual(1);
  });
});
