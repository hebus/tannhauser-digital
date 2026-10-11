import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../actions/legal-actions';
import { BoardBuilder } from '../board/builder';
import type { BoardState } from '../board/types';
import { applyCommand } from '../engine/apply-command';
import '../engine/start-game';
import '../overwatch/handlers';
import '../turn/handlers';
import '../combat/attack';
import { ScriptedRng, SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import type { CharacterState, GameState } from '../state/types';
import type { EquipmentItem } from './effects';
import { isInSmoke } from '../combat/smoke';
import { refreshTurn } from '../turn/refresh';
import { explosionZone, isThrowTarget } from './grenade';

const grenade: EquipmentItem = { id: 'grenade.test', traits: ['grenade'], effects: [{ type: 'GRENADE', successes: 4, range: 5 }] };
const rows = [{ combat: 5, physical: 5, mental: 5, movement: 4 }];

function char(id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}): CharacterState {
  return { id, definitionId: id, playerId, nodeId, health: 3, statRows: rows, alive: true, weapons: [], activated: false, movementLeft: 4, ...extra };
}

/** a — b — c — d — e, tous rouges : tout est vu de tout le monde. */
function line(): BoardState {
  return new BoardBuilder()
    .node('a', ['red']).node('b', ['red']).node('c', ['red']).node('d', ['red']).node('e', ['red'])
    .edge('a', 'b').edge('b', 'c').edge('c', 'd').edge('d', 'e')
    .build();
}

function makeState(opts: { board?: BoardState; characters?: CharacterState[]; actionUsed?: boolean } = {}): GameState {
  const base = createInitialState({
    gameId: 'g',
    scenarioId: 'dev',
    board: opts.board ?? line(),
    players: [
      { id: 'p1', factionId: 'union', commandPoints: 0 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters: opts.characters ?? [char('h1', 'p1', 'a', { equipment: [grenade] }), char('h2', 'p1', 'b'), char('e1', 'p2', 'c'), char('e2', 'p2', 'e')],
    rng: new SeededRng(1).snapshot(),
  });
  return {
    ...base,
    phase: 'ACTIVATION',
    turn: { number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1', activeCharacterId: 'h1', actionUsed: opts.actionUsed ?? false },
  };
}

const throwAt = (nodeId: string, equipmentId = grenade.id) => ({ type: 'THROW_GRENADE', playerId: 'p1', characterId: 'h1', equipmentId, nodeId }) as const;
const hp = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const types = (events: readonly { type: string }[]) => events.map((e) => e.type);

describe('zone de l\'explosion (RULE-EQUIP-014)', () => {
  it('la case visée et toutes ses voisines', () => {
    expect(explosionZone(line(), 'c').sort()).toEqual(['b', 'c', 'd']);
    expect(explosionZone(line(), 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('THROW_GRENADE : jet d\'attaque à 4 succès automatiques', () => {
  it('tous les personnages de la zone, amis comme ennemis, se défendent ; chaque succès annule une blessure', () => {
    // Zone = b, c, d. h2 (ami, en b) : 2 succès de défense -> 2 blessures ; e1 (ennemi, en c) : aucun succès -> 4 blessures.
    const rng = new ScriptedRng([9, 9, 1, 1, 1, 1, 1, 1]);
    const res = applyCommand(makeState(), throwAt('c'), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual([
      'EQUIPMENT_USED', 'GRENADE_EXPLODED',
      'DEFENSE_ROLLED', 'DAMAGE_APPLIED',
      'DEFENSE_ROLLED', 'DAMAGE_APPLIED', 'CHARACTER_DEFEATED',
    ]);
    expect(res.events[1]).toMatchObject({ nodeId: 'c', successes: 4, zone: expect.arrayContaining(['b', 'c', 'd']) });
    expect(res.events[3]).toMatchObject({ targetId: 'h2', wounds: 2, healthLeft: 1 });
    expect(hp(res.state, 'h2')).toMatchObject({ health: 1, alive: true });
    expect(hp(res.state, 'e1')).toMatchObject({ health: 0, alive: false });
    // Hors de la zone : intact, et sans jet de défense.
    expect(hp(res.state, 'h1').health).toBe(3);
    expect(hp(res.state, 'e2').health).toBe(3);
  });

  it('une défense qui pare les 4 blessures évite tout dégât', () => {
    const res = applyCommand(makeState(), throwAt('c'), new ScriptedRng([9, 9, 9, 9, 9, 9, 9, 9]));
    expect(types(res.events)).toEqual(['EQUIPMENT_USED', 'GRENADE_EXPLODED', 'DEFENSE_ROLLED', 'DEFENSE_ROLLED']);
    expect(res.state.characters.map((c) => c.health)).toEqual([3, 3, 3, 3]);
  });

  it('le lanceur est touché s\'il se trouve dans la zone', () => {
    const res = applyCommand(makeState(), throwAt('b'), new ScriptedRng([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
    expect(res.accepted).toBe(true);
    // Zone = a, b, c : h1 (lanceur), h2 et e1 se défendent.
    expect(types(res.events).filter((t) => t === 'DEFENSE_ROLLED')).toHaveLength(3);
    expect(hp(res.state, 'h1').alive).toBe(false);
  });

  it('consomme l\'action et défausse la grenade', () => {
    const res = applyCommand(makeState(), throwAt('c'), new ScriptedRng([9, 9, 9, 9, 9, 9, 9, 9]));
    expect(res.state.turn.actionUsed).toBe(true);
    expect(hp(res.state, 'h1').equipment).toEqual([]);
    expect(applyCommand(res.state, throwAt('c'), new SeededRng(1)).errors[0]?.code).toBe('ACTION_ALREADY_USED');
  });

  it('la victoire est constatée quand le dernier ennemi tombe', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a', { equipment: [grenade] }), char('e1', 'p2', 'd', { health: 1 })] });
    const res = applyCommand(state, throwAt('d'), new ScriptedRng([1, 1, 1, 1]));
    expect(types(res.events)).toContain('VICTORY');
    expect(res.state.phase).toBe('FINISHED');
  });
});

describe('THROW_GRENADE : refus', () => {
  it('pas de grenade, équipement qui n\'en est pas une, ou case du lanceur', () => {
    const none = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c')] });
    expect(applyCommand(none, throwAt('c'), new SeededRng(1)).errors[0]?.code).toBe('EQUIPMENT_NOT_OWNED');
    const medal: EquipmentItem = { id: 'medal', traits: ['medal'], effects: [{ type: 'FREE_OVERWATCH' }] };
    const wrong = makeState({ characters: [char('h1', 'p1', 'a', { equipment: [medal] }), char('e1', 'p2', 'c')] });
    expect(applyCommand(wrong, throwAt('c', 'medal'), new SeededRng(1)).errors[0]?.code).toBe('NOT_A_GRENADE');
    expect(applyCommand(makeState(), throwAt('a'), new SeededRng(1)).errors[0]?.code).toBe('GRENADE_OWN_NODE');
  });

  it('pas hors de l\'activation ni après une autre action', () => {
    expect(applyCommand(makeState({ actionUsed: true }), throwAt('c'), new SeededRng(1)).errors[0]?.code).toBe('ACTION_ALREADY_USED');
  });
});

describe('portée et ligne de vue (RULE-EQUIP-015) : portée 5, vue sur les 4 premières cases', () => {
  /** a — b — c — d — e — f — g ; f est bleue seule, g à 6 pas. */
  const longBoard = (): BoardState =>
    new BoardBuilder()
      .node('a', ['red']).node('b', ['red']).node('c', ['red']).node('d', ['red']).node('e', ['red']).node('f', ['blue']).node('g', ['blue'])
      .edge('a', 'b').edge('b', 'c').edge('c', 'd').edge('d', 'e').edge('e', 'f').edge('f', 'g')
      .build();

  it('la 5e case peut être hors de vue si la 4e est vue', () => {
    const board = longBoard();
    expect(isThrowTarget(board, 'a', 'e', 5)).toBe(true); // 4e case, vue
    expect(isThrowTarget(board, 'a', 'f', 5)).toBe(true); // 5e case, hors de vue mais précédée d'une case vue
    expect(isThrowTarget(board, 'a', 'g', 5)).toBe(false); // 6 pas : hors de portée
  });

  it('les 4 premières cases doivent être vues', () => {
    // d (à 3 pas) est bleue : ni elle, ni e (4 pas), ni f (5 pas) ne sont acceptables.
    const board = new BoardBuilder()
      .node('a', ['red']).node('b', ['red']).node('c', ['red']).node('d', ['blue']).node('e', ['red']).node('f', ['red'])
      .edge('a', 'b').edge('b', 'c').edge('c', 'd').edge('d', 'e').edge('e', 'f')
      .build();
    expect(isThrowTarget(board, 'a', 'c', 5)).toBe(true);
    expect(isThrowTarget(board, 'a', 'd', 5)).toBe(false);
    expect(isThrowTarget(board, 'a', 'e', 5)).toBe(false);
    expect(isThrowTarget(board, 'a', 'f', 5)).toBe(false);
  });

  it('la commande applique la même règle et le moteur explique le refus', () => {
    const state = makeState({ board: longBoard(), characters: [char('h1', 'p1', 'a', { equipment: [grenade] }), char('e1', 'p2', 'g')] });
    expect(applyCommand(state, throwAt('g'), new SeededRng(1)).errors[0]?.code).toBe('OUT_OF_RANGE');
    expect(applyCommand(state, throwAt('f'), new ScriptedRng([1, 1, 1, 1])).accepted).toBe(true);
  });
});

describe('actions légales', () => {
  it('THROW_GRENADE liste les grenades et les cases visables', () => {
    const action = getLegalActions(makeState(), 'h1').find((a) => a.id === 'THROW_GRENADE');
    expect(action?.available).toBe(true);
    expect(action?.details?.grenades).toEqual([{ equipmentId: grenade.id, nodeIds: ['b', 'c', 'd', 'e'] }]);
  });

  it('refusée sans grenade, ou une fois l\'action utilisée', () => {
    const none = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c')] });
    expect(getLegalActions(none, 'h1').find((a) => a.id === 'THROW_GRENADE')).toMatchObject({ available: false, code: 'NO_GRENADE' });
    expect(getLegalActions(makeState({ actionUsed: true }), 'h1').find((a) => a.id === 'THROW_GRENADE')).toMatchObject({ available: false, code: 'ACTION_ALREADY_USED' });
  });
});

describe('fumigène (RULE-EQUIP-012) : portée 8, vue sur 7', () => {
  const smokeGrenade: EquipmentItem = { id: 'grenade.smoke', traits: ['grenade', 'smoke'], effects: [{ type: 'SMOKE_GRENADE', range: 8 }] };
  const throwSmoke = (nodeId: string) => ({ type: 'THROW_GRENADE', playerId: 'p1', characterId: 'h1', equipmentId: smokeGrenade.id, nodeId }) as const;
  const withSmoke = (board?: BoardState): GameState =>
    makeState({ ...(board ? { board } : {}), characters: [char('h1', 'p1', 'a', { equipment: [smokeGrenade] }), char('e1', 'p2', 'c')] });

  it('pose une fumée de 2 tours sur la case visée, consomme l\'action et défausse le fumigène, sans jet ni dégât', () => {
    const res = applyCommand(withSmoke(), throwSmoke('c'), new SeededRng(1));
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual(['EQUIPMENT_USED', 'SMOKE_STARTED']);
    expect(res.state.effects).toEqual([expect.objectContaining({ type: 'SMOKE', origin: 'c', remainingTurns: 2 })]);
    expect(res.state.turn.actionUsed).toBe(true);
    expect(hp(res.state, 'h1').equipment).toEqual([]);
    expect(res.state.characters.map((c) => c.health)).toEqual([3, 3]);
  });

  it('peut viser sa propre case (contrairement à une grenade explosive)', () => {
    expect(applyCommand(withSmoke(), throwSmoke('a'), new SeededRng(1)).accepted).toBe(true);
    expect(getLegalActions(withSmoke(), 'h1').find((a) => a.id === 'THROW_GRENADE')?.details?.grenades?.[0]?.nodeIds).toContain('a');
  });

  it('plusieurs fumigènes coexistent : chacun a son identifiant et son propre décompte au refresh', () => {
    const two = makeState({ characters: [char('h1', 'p1', 'a', { equipment: [smokeGrenade] }), char('h2', 'p1', 'b', { equipment: [smokeGrenade] }), char('e1', 'p2', 'c')] });
    // Tour 1 : h1 lance un fumigène en c.
    const first = applyCommand(two, throwSmoke('c'), new SeededRng(1));
    // Tour 2 : refresh (la première fumée passe à 1 tour), puis h2 en lance une seconde au même endroit.
    const refreshed = refreshTurn({ ...first.state, turn: { ...first.state.turn, number: 2 } });
    expect(refreshed.state.effects.map((e) => e.remainingTurns)).toEqual([1]);
    const turn2: GameState = { ...refreshed.state, turn: { ...refreshed.state.turn, activeCharacterId: 'h2', actionUsed: false } };
    const second = applyCommand(turn2, { type: 'THROW_GRENADE', playerId: 'p1', characterId: 'h2', equipmentId: smokeGrenade.id, nodeId: 'c' }, new SeededRng(1));
    expect(second.accepted).toBe(true);
    expect(second.state.effects.map((e) => e.remainingTurns)).toEqual([1, 2]);
    expect(new Set(second.state.effects.map((e) => e.id)).size).toBe(2);
    // Tour 3 : la plus ancienne se dissipe (un seul SMOKE_EXPIRED), la plus récente continue et la case reste enfumée.
    const third = refreshTurn({ ...second.state, turn: { ...second.state.turn, number: 3 } });
    expect(third.events.filter((e) => e.type === 'SMOKE_EXPIRED')).toEqual([{ type: 'SMOKE_EXPIRED', effectId: second.state.effects[0]!.id, origin: 'c' }]);
    expect(third.state.effects.map((e) => e.remainingTurns)).toEqual([1]);
    expect(isInSmoke(third.state, 'c')).toBe(true);
    // Tour 4 : plus aucune fumée.
    const fourth = refreshTurn({ ...third.state, turn: { ...third.state.turn, number: 4 } });
    expect(fourth.state.effects).toEqual([]);
    expect(isInSmoke(fourth.state, 'c')).toBe(false);
  });

  it('deux fumigènes lancés le même tour sur la même case ont des identifiants distincts', () => {
    const base = makeState({ characters: [char('h1', 'p1', 'a', { equipment: [smokeGrenade] }), char('e1', 'p2', 'c')] });
    const once = applyCommand(base, throwSmoke('c'), new SeededRng(1)).state;
    const again = { ...once, turn: { ...once.turn, actionUsed: false }, characters: once.characters.map((c) => (c.id === 'h1' ? { ...c, equipment: [smokeGrenade] } : c)) };
    const twice = applyCommand(again, throwSmoke('c'), new SeededRng(1));
    expect(twice.accepted).toBe(true);
    expect(new Set(twice.state.effects.map((e) => e.id)).size).toBe(2);
  });

  it('la 8e case peut être hors de vue si la 7e est vue ; au-delà de 8 pas, refusé', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    // a..h rouges (jusqu'à 7 pas), i bleue seule (8 pas, hors de vue), j à 9 pas.
    const builder = new BoardBuilder();
    ids.forEach((id) => builder.node(id, [id === 'i' || id === 'j' ? 'blue' : 'red']));
    ids.slice(1).forEach((id, k) => builder.edge(ids[k]!, id));
    const board = builder.build();
    expect(isThrowTarget(board, 'a', 'i', 8)).toBe(true);
    expect(applyCommand(withSmoke(board), throwSmoke('i'), new SeededRng(1)).accepted).toBe(true);
    expect(applyCommand(withSmoke(board), throwSmoke('j'), new SeededRng(1)).errors[0]?.code).toBe('OUT_OF_RANGE');
  });

  it('refusé si l\'une des 7 premières cases est hors de vue', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const builder = new BoardBuilder();
    ids.forEach((id) => builder.node(id, [id === 'c' ? 'blue' : 'red']));
    ids.slice(1).forEach((id, k) => builder.edge(ids[k]!, id));
    const res = applyCommand(withSmoke(builder.build()), throwSmoke('d'), new SeededRng(1));
    expect(res.errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
  });
});
