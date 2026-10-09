import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../actions/legal-actions';
import { BoardBuilder } from '../board/builder';
import { applyCommand } from '../engine/apply-command';
import '../engine/start-game';
import '../overwatch/handlers';
import '../turn/handlers';
import '../combat/attack';
import { SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import type { CharacterState, GameState } from '../state/types';
import type { EquipmentItem } from './effects';

const ironCross: EquipmentItem = { id: 'medal.iron-cross-1st-class', traits: ['medal'], effects: [{ type: 'GAIN_COMMAND_POINTS', amount: 2 }] };
const medalOfHonor: EquipmentItem = { id: 'medal.medal-of-honor', traits: ['medal'], effects: [{ type: 'FREE_OVERWATCH' }] };
const critical: EquipmentItem = { id: 'ability.critical-hit', traits: ['ability'], effects: [{ type: 'CRITICAL_HIT' }] };

const rows = [{ combat: 7, physical: 5, mental: 5, movement: 4 }];

function char(id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}): CharacterState {
  return { id, definitionId: id, playerId, nodeId, health: 1, statRows: rows, alive: true, weapons: [], activated: false, movementLeft: 4, ...extra };
}

function makeState(opts: { phase?: GameState['phase']; equipment?: EquipmentItem[]; active?: boolean; cp?: number } = {}): GameState {
  const board = new BoardBuilder().node('a', ['red']).node('b', ['red']).edge('a', 'b').build();
  const base = createInitialState({
    gameId: 'g',
    scenarioId: 'dev',
    board,
    players: [
      { id: 'p1', factionId: 'union', commandPoints: opts.cp ?? 1 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters: [char('h1', 'p1', 'a', { equipment: opts.equipment ?? [ironCross, medalOfHonor, critical] }), char('e1', 'p2', 'b')],
    rng: new SeededRng(1).snapshot(),
  });
  const phase = opts.phase ?? 'ACTIVATION';
  return {
    ...base,
    phase,
    turn: {
      number: 1,
      initiativePlayerId: 'p1',
      activePlayerId: 'p1',
      ...(phase === 'ACTIVATION' && opts.active !== false ? { activeCharacterId: 'h1', actionUsed: false } : {}),
    },
  };
}

const use = (equipmentId: string, playerId = 'p1', characterId = 'h1') => ({ type: 'USE_EQUIPMENT', playerId, characterId, equipmentId }) as const;
const run = (state: GameState, equipmentId: string, playerId?: string) => applyCommand(state, use(equipmentId, playerId), new SeededRng(1));
const h1 = (s: GameState) => s.characters.find((c) => c.id === 'h1')!;

describe('Iron Cross : +2 PC (GAIN_COMMAND_POINTS)', () => {
  it('défausse le jeton et ajoute 2 PC sans consommer l\'action', () => {
    const res = run(makeState({ cp: 1 }), ironCross.id);
    expect(res.accepted).toBe(true);
    expect(res.state.players.find((p) => p.id === 'p1')!.commandPoints).toBe(3);
    expect(h1(res.state).equipment!.map((i) => i.id)).toEqual([medalOfHonor.id, critical.id]);
    expect(res.state.turn.actionUsed).toBe(false);
    expect(res.events.map((e) => e.type)).toEqual(['EQUIPMENT_USED', 'COMMAND_POINTS_GAINED']);
    expect(res.events[0]).toMatchObject({ effect: 'GAIN_COMMAND_POINTS', equipmentId: ironCross.id });
    expect(res.events[1]).toMatchObject({ amount: 2, total: 3 });
  });

  it('est utilisable pendant la phase d\'Overwatch, à son tour de décider', () => {
    const res = run(makeState({ phase: 'OVERWATCH', cp: 0 }), ironCross.id);
    expect(res.accepted).toBe(true);
    expect(res.state.players.find((p) => p.id === 'p1')!.commandPoints).toBe(2);
  });

  it("n'est utilisable qu'une fois : le jeton est défaussé", () => {
    const first = run(makeState(), ironCross.id);
    const second = applyCommand(first.state, use(ironCross.id), new SeededRng(2));
    expect(second.accepted).toBe(false);
    expect(second.errors[0]!.code).toBe('EQUIPMENT_NOT_OWNED');
  });

  it("est refusé hors de son tour ou pour le personnage d'un autre joueur", () => {
    const other = { ...makeState(), turn: { ...makeState().turn, activePlayerId: 'p2' } };
    expect(run(other, ironCross.id).errors[0]!.code).toBe('NOT_YOUR_TURN');
    expect(applyCommand(makeState(), use(ironCross.id, 'p2'), new SeededRng(1)).errors[0]!.code).toBe('NOT_OWN_CHARACTER');
  });

  it("refuse un équipement qui n'est pas un jeton", () => {
    expect(run(makeState(), critical.id).errors[0]!.code).toBe('NOT_A_TOKEN');
    expect(run(makeState(), 'ghost').errors[0]!.code).toBe('EQUIPMENT_NOT_OWNED');
  });
});

describe("Medal of Honor : Overwatch gratuit comme ACTION (FREE_OVERWATCH)", () => {
  it('défausse le pion, place le personnage en Overwatch sans PC et consomme l\'action', () => {
    const res = run(makeState({ cp: 0 }), medalOfHonor.id);
    expect(res.accepted).toBe(true);
    expect(h1(res.state)).toMatchObject({ overwatch: true, activated: true });
    expect(h1(res.state).equipment!.map((i) => i.id)).toEqual([ironCross.id, critical.id]);
    expect(res.state.turn.actionUsed).toBe(true);
    expect(res.state.players.find((p) => p.id === 'p1')!.commandPoints).toBe(0);
    expect(res.events.map((e) => e.type)).toEqual(['EQUIPMENT_USED', 'OVERWATCH_PLACED']);
  });

  it("n'est possible qu'une fois par partie : le pion est défaussé", () => {
    const first = run(makeState(), medalOfHonor.id);
    expect(applyCommand(first.state, use(medalOfHonor.id), new SeededRng(2)).errors[0]!.code).toBe('EQUIPMENT_NOT_OWNED');
  });

  it("exige l'activation en cours et l'action non utilisée", () => {
    expect(run(makeState({ phase: 'OVERWATCH' }), medalOfHonor.id).errors[0]!.code).toBe('NOT_IN_ACTIVATION');
    const used = { ...makeState(), turn: { ...makeState().turn, actionUsed: true } };
    expect(run(used, medalOfHonor.id).errors[0]!.code).toBe('ACTION_ALREADY_USED');
    expect(run(makeState({ active: false }), medalOfHonor.id).errors[0]!.code).toBe('NOT_ACTIVE_CHARACTER');
  });
});

describe('getLegalActions : USE_EQUIPMENT', () => {
  const action = (s: GameState) => getLegalActions(s, 'h1').find((a) => a.id === 'USE_EQUIPMENT')!;

  it('liste les jetons utilisables maintenant', () => {
    expect(action(makeState())).toMatchObject({ available: true, details: { equipmentIds: [ironCross.id, medalOfHonor.id] } });
  });

  it("ne propose que l'Iron Cross en phase d'Overwatch", () => {
    expect(action(makeState({ phase: 'OVERWATCH' })).details!.equipmentIds).toEqual([ironCross.id]);
  });

  it('est indisponible sans jeton', () => {
    expect(action(makeState({ equipment: [critical] }))).toMatchObject({ available: false, code: 'NO_USABLE_EQUIPMENT' });
  });
});
