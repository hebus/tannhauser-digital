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

const passOverwatch = (playerId: string): GameCommand => ({ type: 'PASS_OVERWATCH', playerId });
const placeOverwatch = (playerId: string, characterId: string): GameCommand => ({ type: 'OVERWATCH', playerId, characterId });
const otherPlayer = (playerId: string) => (playerId === 'p1' ? 'p2' : 'p1');

/** Termine la phase d'Overwatch sans placement : le gagnant de l'initiative passe, puis l'autre joueur (deux passes consécutives). */
function skipPlacement(state: GameState, rng: RandomSource): GameState {
  const winner = state.turn.initiativePlayerId!;
  return run(state, rng, passOverwatch(winner), passOverwatch(otherPlayer(winner))).state;
}

/** Partie démarrée en phase OVERWATCH : p2 gagne l'initiative du tour 1 (3 vs 8) et décide en premier. */
function startedPlacement(rng: RandomSource = new ScriptedRng([8, 3])): GameState {
  return applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
}

/** Partie démarrée, placements sautés : phase ACTIVATION, p2 active en premier. */
function started(rng: RandomSource = new ScriptedRng([8, 3])): GameState {
  return skipPlacement(startedPlacement(rng), rng);
}

describe('refresh de début de tour', () => {
  it('remet les PC à la valeur de configuration', () => {
    const state = applyCommand(makeState({ commandPointsPerTurn: 5 }), { type: 'START_GAME' }, new ScriptedRng([8, 3])).state;
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
    const rng = new ScriptedRng([8, 3, 4, 9]);
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
    expect(last.state.turn).toEqual({ number: 2, initiativePlayerId: 'p1', activePlayerId: 'p1', overwatchPasses: 0, overwatchDecisions: 0 });
    expect(last.state.characters.every((c) => !c.activated && c.movementLeft === 6)).toBe(true);
    expect(last.state.phase).toBe('OVERWATCH');
  });

  it('les PC dépensés sont perdus au refresh suivant', () => {
    const rng = new ScriptedRng([8, 3, 9, 2, 2, 6]);
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
    const rng = new ScriptedRng([8, 3, 2, 1]);
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
    const rng = new ScriptedRng([8, 3, 2, 9]);
    const state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    const res = run(state, rng, { type: 'REROLL_INITIATIVE', playerId: 'p2' });
    expect(res.events.map((e) => e.type)).toEqual(['COMMAND_POINTS_SPENT', 'INITIATIVE_ROLLED', 'INITIATIVE_CHANGED']);
    expect(res.state.turn).toEqual({ number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1', overwatchPasses: 0, overwatchDecisions: 0 });
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

  it('rejette dès qu\'un placement a eu lieu (OVERWATCH_DECISIONS_STARTED)', () => {
    const rng = new SeededRng(1);
    const placed = run(startedPlacement(), rng, placeOverwatch('p2', 'b1')).state;
    // La main est à p1 : le gagnant de l'initiative (p2) ne peut plus relancer, même quand elle lui reviendra.
    expect(applyCommand(placed, { type: 'REROLL_INITIATIVE', playerId: 'p2' }, rng).errors[0]?.code).toBe('OVERWATCH_DECISIONS_STARTED');
    const back = run(placed, rng, passOverwatch('p1')).state;
    expect(applyCommand(back, { type: 'REROLL_INITIATIVE', playerId: 'p2' }, rng).errors[0]?.code).toBe('OVERWATCH_DECISIONS_STARTED');
  });

  it('rejette dès que le gagnant a passé (OVERWATCH_DECISIONS_STARTED)', () => {
    const rng = new SeededRng(1);
    const passed = run(startedPlacement(), rng, passOverwatch('p2')).state;
    expect(applyCommand(passed, { type: 'REROLL_INITIATIVE', playerId: 'p2' }, rng).errors[0]?.code).toBe('OVERWATCH_DECISIONS_STARTED');
    expect(applyCommand(passed, { type: 'REROLL_INITIATIVE', playerId: 'p1' }, rng).errors[0]?.code).toBe('NOT_INITIATIVE_WINNER');
  });

  it('un nouveau gagnant décide en premier après la relance (les compteurs repartent à zéro)', () => {
    const rng = new ScriptedRng([8, 3, 2, 9]);
    const state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    const rerolled = run(state, rng, { type: 'REROLL_INITIATIVE', playerId: 'p2' }).state;
    expect(rerolled.phase).toBe('OVERWATCH');
    expect(rerolled.turn.activePlayerId).toBe('p1');
    expect(rerolled.turn).toMatchObject({ overwatchPasses: 0, overwatchDecisions: 0 });
    const early = applyCommand(rerolled, passOverwatch('p2'), rng);
    expect(early.errors[0]?.code).toBe('NOT_YOUR_DECISION_TURN');
    expect(early.errors[0]?.message).toBe("Impossible : ce n'est pas votre tour de décider.");
    // p1 (nouveau gagnant) décide en premier : un placement, puis la main passe à p2.
    const placed = run(rerolled, rng, placeOverwatch('p1', 'a1'));
    expect(placed.state.turn.activePlayerId).toBe('p2');
  });
});

describe('phase OVERWATCH : enchaînement du tour', () => {
  it('START_GAME : refresh, initiative, puis phase OVERWATCH (le gagnant décide d\'abord)', () => {
    const res = applyCommand(makeState(), { type: 'START_GAME' }, new ScriptedRng([8, 3]));
    expect(res.state.phase).toBe('OVERWATCH');
    expect(res.state.turn).toEqual({ number: 1, initiativePlayerId: 'p2', activePlayerId: 'p2', overwatchPasses: 0, overwatchDecisions: 0 });
    expect(res.events.map((e) => e.type)).toEqual([
      'GAME_STARTED', 'TURN_STARTED', 'COMMAND_POINTS_REFRESHED', 'COMMAND_POINTS_REFRESHED', 'INITIATIVE_ROLLED',
    ]);
  });

  it('ordre de décision : le gagnant décide, puis l\'autre ; deux passes consécutives ouvrent les activations (gagnant en premier)', () => {
    const rng = new ScriptedRng([8, 3]);
    const state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    expect(applyCommand(state, passOverwatch('p1'), rng).errors[0]?.code).toBe('NOT_YOUR_DECISION_TURN');
    const first = run(state, rng, passOverwatch('p2'));
    expect(first.events.map((e) => e.type)).toEqual(['OVERWATCH_PASSED']);
    expect(first.state.phase).toBe('OVERWATCH');
    expect(first.state.turn.activePlayerId).toBe('p1');
    expect(first.state.turn.overwatchPasses).toBe(1);
    const second = run(first.state, rng, passOverwatch('p1'));
    expect(second.events.map((e) => e.type)).toEqual(['OVERWATCH_PASSED', 'OVERWATCH_PHASE_ENDED']);
    expect(second.state.phase).toBe('ACTIVATION');
    expect(second.state.turn).toEqual({ number: 1, initiativePlayerId: 'p2', activePlayerId: 'p2' });
  });

  it('un placement remet le compteur de passes à zéro : une passe isolée ne ferme pas la phase', () => {
    const rng = new ScriptedRng([8, 3]);
    let state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    state = run(state, rng, passOverwatch('p2'), placeOverwatch('p1', 'a1')).state;
    expect(state.turn).toMatchObject({ activePlayerId: 'p2', overwatchPasses: 0, overwatchDecisions: 2 });
    state = run(state, rng, passOverwatch('p2')).state;
    expect(state.phase).toBe('OVERWATCH');
    expect(state.turn).toMatchObject({ activePlayerId: 'p1', overwatchPasses: 1 });
    state = run(state, rng, placeOverwatch('p1', 'a2')).state;
    expect(state.turn).toMatchObject({ activePlayerId: 'p2', overwatchPasses: 0 });
  });

  it('PASS_OVERWATCH est refusé hors de la phase OVERWATCH', () => {
    expect(applyCommand(started(), passOverwatch('p2'), new SeededRng(1)).errors[0]?.code).toBe('NOT_OVERWATCH_PHASE');
  });

  it('SELECT_CHARACTER est refusé pendant la phase de placement', () => {
    expect(applyCommand(startedPlacement(), select('p2', 'b1'), new SeededRng(1)).errors[0]?.code).toBe('WRONG_PHASE');
  });

  it('un personnage en Overwatch n\'est pas activable (IN_OVERWATCH) ; le refresh du tour suivant le retire', () => {
    const rng = new ScriptedRng([8, 3, 4, 9]);
    let state = startedPlacement(rng);
    state = run(state, rng, placeOverwatch('p2', 'b1'), passOverwatch('p1'), passOverwatch('p2')).state;
    expect(applyCommand(state, select('p2', 'b1'), rng).errors[0]?.code).toBe('IN_OVERWATCH');
    state = run(state, rng, select('p2', 'b2'), end('p2'), select('p1', 'a1'), end('p1'), select('p1', 'a2')).state;
    const last = applyCommand(state, end('p1'), rng);
    expect(last.events.map((e) => e.type)).toContain('TURN_ENDED');
    expect(last.state.turn.number).toBe(2);
    expect(last.state.phase).toBe('OVERWATCH');
    // Refresh : PC rendus, Overwatch retiré ; nouvelle phase d'Overwatch, p1 (initiative 9 vs 4) décide en premier.
    expect(last.state.characters.find((c) => c.id === 'b1')).toMatchObject({ overwatch: false, activated: false });
    expect(last.state.players.map((p) => p.commandPoints)).toEqual([2, 2]);
    expect(last.state.turn).toEqual({ number: 2, initiativePlayerId: 'p1', activePlayerId: 'p1', overwatchPasses: 0, overwatchDecisions: 0 });
  });

  it('un joueur dont tous les personnages sont en Overwatch ne bloque pas la partie (il passe automatiquement)', () => {
    const rng = new ScriptedRng([8, 3, 4, 9]);
    let state = startedPlacement(rng);
    state = run(state, rng, placeOverwatch('p2', 'b1'), passOverwatch('p1')).state;
    const placedLast = run(state, rng, placeOverwatch('p2', 'b2'), passOverwatch('p1'));
    // Dernier personnage de p2 placé, puis passe manuelle de p1 : p2 n'a plus rien à placer et passe seul (auto), ce qui ferme la phase.
    expect(placedLast.events.slice(-3)).toEqual([
      { type: 'OVERWATCH_PASSED', playerId: 'p1' },
      { type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true },
      { type: 'OVERWATCH_PHASE_ENDED' },
    ]);
    state = placedLast.state;
    // p2 n'a rien à activer : la main revient à p1 qui enchaîne ses deux personnages, puis le tour se termine.
    expect(state.phase).toBe('ACTIVATION');
    expect(state.turn.activePlayerId).toBe('p1');
    state = run(state, rng, select('p1', 'a1'), end('p1')).state;
    expect(state.turn.activePlayerId).toBe('p1');
    const last = run(state, rng, select('p1', 'a2'), end('p1'));
    expect(last.events.map((e) => e.type)).toContain('TURN_ENDED');
    expect(last.state.turn.number).toBe(2);
  });

  it('un joueur sans PC ne peut pas placer et passe automatiquement (dès un état où il doit décider)', () => {
    const rng = new ScriptedRng([8, 3]);
    const base = startedPlacement(rng);
    const broke: GameState = { ...base, players: base.players.map((p) => ({ ...p, commandPoints: 0 })) };
    expect(applyCommand(broke, placeOverwatch('p2', 'b1'), rng).errors[0]?.code).toBe('INSUFFICIENT_COMMAND_POINTS');
    // État fabriqué sans PC : la passe manuelle de p2 est suivie de la passe automatique de p1 (aucun PC).
    const res = run(broke, rng, passOverwatch('p2'));
    expect(res.events).toEqual([
      { type: 'OVERWATCH_PASSED', playerId: 'p2' },
      { type: 'OVERWATCH_PASSED', playerId: 'p1', auto: true },
      { type: 'OVERWATCH_PHASE_ENDED' },
    ]);
    expect(res.state.phase).toBe('ACTIVATION');
    expect(res.state.turn.activePlayerId).toBe('p2');
  });

  it('si plus aucun personnage n\'est activable, le tour suivant démarre aussitôt', () => {
    const rng = new ScriptedRng([8, 3, 6, 7]);
    const base = startedPlacement(rng);
    const lone: GameState = { ...base, characters: base.characters.filter((c) => c.playerId === 'p2') };
    // p1 n'a aucun personnage : il passe automatiquement après chaque décision de p2.
    const afterFirst = run(lone, rng, placeOverwatch('p2', 'b1'));
    expect(afterFirst.events.at(-1)).toEqual({ type: 'OVERWATCH_PASSED', playerId: 'p1', auto: true });
    expect(afterFirst.state.turn.activePlayerId).toBe('p2');
    const res = applyCommand(afterFirst.state, placeOverwatch('p2', 'b2'), rng);
    expect(res.accepted).toBe(true);
    expect(res.events.map((e) => e.type)).toEqual([
      'COMMAND_POINTS_SPENT', 'OVERWATCH_PLACED', 'OVERWATCH_PASSED', 'OVERWATCH_PASSED', 'OVERWATCH_PHASE_ENDED',
      'TURN_ENDED', 'TURN_STARTED', 'COMMAND_POINTS_REFRESHED', 'COMMAND_POINTS_REFRESHED', 'INITIATIVE_ROLLED',
      // Tour 2 : p1 gagne l'initiative (7 vs 6) mais n'a aucun personnage : il passe seul, p2 décide.
      'OVERWATCH_PASSED',
    ]);
    expect(res.events.at(-1)).toEqual({ type: 'OVERWATCH_PASSED', playerId: 'p1', auto: true });
    expect(res.state.turn).toMatchObject({ number: 2, initiativePlayerId: 'p1', activePlayerId: 'p2', overwatchPasses: 1 });
    expect(res.state.phase).toBe('OVERWATCH');
  });
});

describe('passe automatique d\'Overwatch (règle du product owner)', () => {
  /** Partie avec `commandPointsPerTurn` PC par tour et la liste de personnages donnée (p2 gagne l'initiative : 3 vs 8). */
  function start(characters: (state: GameState) => readonly CharacterState[], commandPointsPerTurn = 2, rolls: number[] = [8, 3]) {
    const rng = new ScriptedRng(rolls);
    const base = makeState({ commandPointsPerTurn });
    const res = applyCommand({ ...base, characters: characters(base) }, { type: 'START_GAME' }, rng);
    expect(res.errors).toEqual([]);
    return { rng, res };
  }
  const pendingTypes = (events: readonly { type: string }[]) => events.map((e) => e.type);

  it('un joueur sans personnage éligible passe automatiquement dès le début du tour ; l\'adversaire décide ensuite', () => {
    // p2 (gagnant de l'initiative) n'a que des personnages hors de combat.
    const { res } = start((s) => s.characters.map((c) => (c.playerId === 'p2' ? { ...c, alive: false } : c)));
    expect(pendingTypes(res.events)).toEqual([
      'GAME_STARTED', 'TURN_STARTED', 'COMMAND_POINTS_REFRESHED', 'COMMAND_POINTS_REFRESHED', 'INITIATIVE_ROLLED', 'OVERWATCH_PASSED',
    ]);
    expect(res.events.at(-1)).toEqual({ type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true });
    expect(res.state.phase).toBe('OVERWATCH');
    expect(res.state.turn).toEqual({ number: 1, initiativePlayerId: 'p2', activePlayerId: 'p1', overwatchPasses: 1, overwatchDecisions: 1 });
  });

  it('les deux joueurs ne pouvant rien placer (0 PC) : la phase se termine d\'elle-même et l\'activation commence dès le démarrage du tour', () => {
    const { rng, res } = start((s) => s.characters, 0);
    // Les deux joueurs passent seuls (gagnant d'abord) et l'activation commence aussitôt.
    expect(pendingTypes(res.events).slice(-3)).toEqual(['OVERWATCH_PASSED', 'OVERWATCH_PASSED', 'OVERWATCH_PHASE_ENDED']);
    expect(res.events.slice(-3, -1)).toEqual([
      { type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true },
      { type: 'OVERWATCH_PASSED', playerId: 'p1', auto: true },
    ]);
    expect(res.state.phase).toBe('ACTIVATION');
    // Activation : le joueur d'initiative (p2) commence.
    expect(res.state.turn).toEqual({ number: 1, initiativePlayerId: 'p2', activePlayerId: 'p2' });
    expect(applyCommand(res.state, passOverwatch('p2'), rng).errors[0]?.code).toBe('NOT_OVERWATCH_PHASE');
    expect(run(res.state, rng, select('p2', 'b1')).events).toEqual([{ type: 'CHARACTER_ACTIVATION_STARTED', characterId: 'b1' }]);
  });

  it('après son dernier PC dépensé, un joueur passe seul aux décisions suivantes ; l\'autre peut enchaîner', () => {
    // 1 PC par tour pour chacun : p2 place b1 (0 PC), p1 place a1 (0 PC) -> plus personne ne peut rien placer.
    const { rng, res } = start((s) => s.characters, 1);
    expect(res.state.turn.activePlayerId).toBe('p2');
    const p2 = run(res.state, rng, placeOverwatch('p2', 'b1'));
    expect(p2.state.turn.activePlayerId).toBe('p1');
    // p1 passe manuellement : p2 (sans PC) passe seul, ce qui ferme la phase.
    const closed = run(p2.state, rng, passOverwatch('p1'));
    expect(closed.events).toEqual([
      { type: 'OVERWATCH_PASSED', playerId: 'p1' },
      { type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true },
      { type: 'OVERWATCH_PHASE_ENDED' },
    ]);
    expect(closed.state.phase).toBe('ACTIVATION');
    // Variante : p1 dépense à son tour son dernier PC, les deux joueurs passent seuls dans la foulée.
    const both = run(p2.state, rng, placeOverwatch('p1', 'a1'));
    expect(both.events.slice(2)).toEqual([
      { type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true },
      { type: 'OVERWATCH_PASSED', playerId: 'p1', auto: true },
      { type: 'OVERWATCH_PHASE_ENDED' },
    ]);
    expect(both.state.phase).toBe('ACTIVATION');
    expect(both.state.players.map((p) => p.commandPoints)).toEqual([0, 0]);
  });

  it('après son dernier personnage éligible placé, un joueur passe seul ; l\'autre peut placer plusieurs personnages de suite', () => {
    // p2 n'a qu'un personnage (b1) ; p1 en a deux (a1, a2) et 2 PC.
    const { rng, res } = start((s) => s.characters.filter((c) => c.id !== 'b2'), 2, [8, 3, 6, 7]);
    const p2 = run(res.state, rng, placeOverwatch('p2', 'b1'));
    expect(p2.state.turn.activePlayerId).toBe('p1');
    const first = run(p2.state, rng, placeOverwatch('p1', 'a1'));
    expect(first.events.at(-1)).toEqual({ type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true });
    expect(first.state.turn).toMatchObject({ activePlayerId: 'p1', overwatchPasses: 1 });
    expect(first.state.phase).toBe('OVERWATCH');
    const second = run(first.state, rng, placeOverwatch('p1', 'a2'));
    expect(second.events.slice(2, 5)).toEqual([
      { type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true },
      { type: 'OVERWATCH_PASSED', playerId: 'p1', auto: true },
      { type: 'OVERWATCH_PHASE_ENDED' },
    ]);
    // Tous les personnages sont en Overwatch : plus rien à activer, le tour 2 démarre aussitôt (p1 gagne l'initiative 7 vs 6).
    expect(second.events.slice(5, 7).map((e) => e.type)).toEqual(['TURN_ENDED', 'TURN_STARTED']);
    expect(second.state.turn).toMatchObject({ number: 2, initiativePlayerId: 'p1', activePlayerId: 'p1', overwatchPasses: 0 });
    expect(second.state.phase).toBe('OVERWATCH');
  });

  it('relance d\'initiative (OQ-OVERWATCH-011) : possible tant qu\'aucune décision n\'a eu lieu', () => {
    const rng = new ScriptedRng([8, 3, 2, 9]);
    const state = applyCommand(makeState(), { type: 'START_GAME' }, rng).state;
    expect(state.turn).toMatchObject({ activePlayerId: 'p2', overwatchDecisions: 0 });
    const res = run(state, rng, { type: 'REROLL_INITIATIVE', playerId: 'p2' });
    expect(pendingTypes(res.events)).toEqual(['COMMAND_POINTS_SPENT', 'INITIATIVE_ROLLED', 'INITIATIVE_CHANGED']);
    expect(res.state.turn).toMatchObject({ initiativePlayerId: 'p1', activePlayerId: 'p1', overwatchDecisions: 0 });
  });

  it('relance d\'initiative : impossible si le gagnant a dû passer automatiquement dès le début du tour', () => {
    // p2 gagne mais n'a aucun personnage vivant éligible : sa passe automatique est une décision, la relance est refusée.
    const { rng, res } = start((s) => s.characters.map((c) => (c.playerId === 'p2' ? { ...c, alive: false } : c)));
    expect(res.state.turn.overwatchDecisions).toBe(1);
    const reroll = applyCommand(res.state, { type: 'REROLL_INITIATIVE', playerId: 'p2' }, rng);
    expect(reroll.accepted).toBe(false);
    expect(reroll.errors[0]?.code).toBe('OVERWATCH_DECISIONS_STARTED');
  });

  it('relance d\'initiative : si le gagnant dépense son dernier PC puis regagne, il passe aussitôt seul', () => {
    // 1 PC par tour : la relance vide la réserve de p2 ; il regagne (2 vs 9) et ne peut plus rien placer.
    const { rng, res } = start((s) => s.characters, 1, [8, 3, 9, 2]);
    const rerolled = run(res.state, rng, { type: 'REROLL_INITIATIVE', playerId: 'p2' });
    expect(pendingTypes(rerolled.events)).toEqual(['COMMAND_POINTS_SPENT', 'INITIATIVE_ROLLED', 'OVERWATCH_PASSED']);
    expect(rerolled.events.at(-1)).toEqual({ type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true });
    expect(rerolled.state.turn).toMatchObject({ initiativePlayerId: 'p2', activePlayerId: 'p1', overwatchPasses: 1 });
    // L'adversaire décide ensuite, puis la phase se ferme à sa passe.
    const closed = run(rerolled.state, rng, passOverwatch('p1'));
    expect(closed.state.phase).toBe('ACTIVATION');
  });
});

describe('déterminisme et immutabilité', () => {
  const script: GameCommand[] = [
    { type: 'REROLL_INITIATIVE', playerId: 'p1' },
    { type: 'OVERWATCH', playerId: 'p1', characterId: 'a1' }, { type: 'OVERWATCH', playerId: 'p2', characterId: 'b1' },
    passOverwatch('p1'), passOverwatch('p2'), passOverwatch('p1'), passOverwatch('p2'),
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
    const rng = new ScriptedRng([8, 3, 9, 4, 2, 1, 4, 3]);
    let state = deepFreeze(applyCommand(makeState(), { type: 'START_GAME' }, rng).state);
    for (const c of [
      { type: 'REROLL_INITIATIVE', playerId: 'p2' }, passOverwatch('p2'), passOverwatch('p1'), select('p1', 'a1'), end('p1'),
      { type: 'PASS', playerId: 'p2' }, { type: 'PASS', playerId: 'p1' },
    ] as GameCommand[]) {
      const res = applyCommand(state, c, rng);
      if (res.accepted) state = deepFreeze(res.state);
    }
    expect(state.turn.number).toBeGreaterThanOrEqual(1);
  });
});
