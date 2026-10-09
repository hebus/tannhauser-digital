import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import '../combat/attack';
import { applyCommand } from '../engine/apply-command';
import '../engine/start-game';
import '../movement/index';
import '../overwatch/handlers';
import { SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import type { CharacterState, GameState, TurnState } from '../state/types';
import '../turn/handlers';
import { getLegalActions, getReactionOptions, type ActionId, type LegalAction } from './legal-actions';

const pistol = { id: 'pistol', kind: 'PISTOL', dice: 4 } as const;
const knife = { id: 'knife', kind: 'CAC', dice: 2 } as const;
const rows = [{ combat: 7, physical: 5, mental: 5, movement: 4 }];

/** a(r) -D(fermée)- b(r) - c(g) - d(g) - e(g) ; a ne voit ni c, ni d, ni e (vue par couleur). */
function board() {
  return new BoardBuilder()
    .node('a', ['r'])
    .node('b', ['r'])
    .node('c', ['g'])
    .node('d', ['g'])
    .node('e', ['g'])
    .door('D', 'CLOSED')
    .edge('a', 'b', { doorId: 'D' })
    .edge('b', 'c')
    .edge('c', 'd')
    .edge('d', 'e')
    .build();
}

function char(id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}): CharacterState {
  return { id, definitionId: id, playerId, nodeId, health: 1, statRows: rows, alive: true, weapons: [pistol, knife], activated: false, movementLeft: 4, ...extra };
}

interface Opts {
  characters?: CharacterState[];
  turn?: Partial<TurnState>;
  phase?: GameState['phase'];
  doorState?: 'OPEN' | 'CLOSED';
  commandPoints?: number;
}

/** h1 (p1) actif en a ; e1 (p2) en e (hors de vue). */
function makeState(opts: Opts = {}): GameState {
  const base = createInitialState({
    gameId: 'g',
    scenarioId: 't',
    board: board(),
    players: [
      { id: 'p1', factionId: 'x', commandPoints: opts.commandPoints ?? 0 },
      { id: 'p2', factionId: 'y', commandPoints: opts.commandPoints ?? 0 },
    ],
    characters: opts.characters ?? [char('h1', 'p1', 'a', { activated: true }), char('e1', 'p2', 'e')],
    rng: new SeededRng(1).snapshot(),
  });
  const withDoor = opts.doorState ? { ...base, board: { ...base.board, doors: { D: { id: 'D', type: 'WOODEN' as const, state: opts.doorState } } } } : base;
  return {
    ...withDoor,
    phase: opts.phase ?? 'ACTIVATION',
    turn: { number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1', activeCharacterId: 'h1', actionUsed: false, ...opts.turn },
  };
}

const by = (actions: LegalAction[], id: ActionId): LegalAction => actions.find((a) => a.id === id)!;

describe('getLegalActions', () => {
  it('renvoie toutes les actions, chacune avec un motif français quand elle est indisponible', () => {
    const actions = getLegalActions(makeState(), 'h1');
    expect(actions.map((a) => a.id)).toEqual(['SELECT', 'MOVE', 'ATTACK', 'CAPTURE_FLAG', 'PLANT_FLAG', 'OVERWATCH', 'USE_EQUIPMENT', 'OPEN_DOOR', 'CLOSE_DOOR', 'END_ACTIVATION', 'PASS', 'PASS_OVERWATCH']);
    for (const a of actions) if (!a.available) expect(a.reason).toMatch(/\S/);
  });

  it('personnage actif prêt : déplacement, ouverture de porte et fin possibles ; Overwatch refusé hors placement', () => {
    const actions = getLegalActions(makeState({ characters: [char('h1', 'p1', 'b', { activated: true }), char('e1', 'p2', 'e')] }), 'h1');
    expect(by(actions, 'MOVE').available).toBe(true);
    expect(by(actions, 'MOVE').details?.reachableCount).toBeGreaterThan(0);
    expect(by(actions, 'OVERWATCH')).toMatchObject({
      available: false,
      code: 'OVERWATCH_BEFORE_ACTIVATIONS',
      reason: "Impossible : l'Overwatch se place avant les activations.",
    });
    expect(by(actions, 'END_ACTIVATION').available).toBe(true);
    expect(by(actions, 'OPEN_DOOR')).toMatchObject({ available: true, details: { doorIds: ['D'] } });
    expect(by(actions, 'CLOSE_DOOR')).toMatchObject({ available: false, code: 'DOOR_ALREADY_CLOSED' });
  });

  it('refuse PASS tant qu\'une activation est en cours, et SELECT aussi', () => {
    const actions = getLegalActions(makeState(), 'h1');
    expect(by(actions, 'PASS')).toMatchObject({ available: false, code: 'ACTIVATION_IN_PROGRESS' });
    expect(by(actions, 'SELECT')).toMatchObject({ available: false, code: 'ACTIVATION_IN_PROGRESS' });
  });

  it('pas d\'ennemi à portée : l\'attaque s\'explique', () => {
    const attack = by(getLegalActions(makeState(), 'h1'), 'ATTACK');
    expect(attack).toMatchObject({ available: false, code: 'NO_TARGET_IN_RANGE', reason: 'Impossible : aucun ennemi à portée.' });
    expect(attack.details?.blocked?.length).toBe(2);
  });

  it('ennemi visible : l\'attaque liste les couples cible/arme acceptés', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'c', { activated: true }), char('e1', 'p2', 'e')] });
    const attack = by(getLegalActions(state, 'h1'), 'ATTACK');
    expect(attack.available).toBe(true);
    // Pistolet : ligne de vue ; couteau : exige l'adjacence (c n'est pas adjacent à e).
    expect(attack.details?.attackOptions).toEqual([{ targetId: 'e1', weaponId: 'pistol' }]);
    expect(attack.details?.blocked).toMatchObject([{ weaponId: 'knife', code: 'NOT_ADJACENT' }]);
  });

  it('aucun ennemi en vie : motif dédié', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a', { activated: true }), char('e1', 'p2', 'e', { alive: false })] });
    expect(by(getLegalActions(state, 'h1'), 'ATTACK')).toMatchObject({ available: false, code: 'NO_ENEMY' });
  });

  it("Combat à 0 : l'attaque reste possible (difficulté 10)", () => {
    const zero = { ...rows[0]!, combat: 0 };
    const state = makeState({ characters: [char('h1', 'p1', 'c', { activated: true, statRows: [zero] }), char('e1', 'p2', 'd')] });
    expect(by(getLegalActions(state, 'h1'), 'ATTACK')).toMatchObject({ available: true });
  });

  it('action déjà utilisée : attaque refusée, déplacement encore permis', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'c', { activated: true }), char('e1', 'p2', 'd')], turn: { actionUsed: true } });
    const actions = getLegalActions(state, 'h1');
    expect(by(actions, 'ATTACK')).toMatchObject({ available: false, code: 'ACTION_ALREADY_USED' });
    expect(by(actions, 'MOVE').available).toBe(true);
  });

  it('plus de PM : déplacement refusé avec motif', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a', { activated: true, movementLeft: 0 }), char('e1', 'p2', 'e')] });
    expect(by(getLegalActions(state, 'h1'), 'MOVE')).toMatchObject({ available: false, code: 'NO_MOVEMENT_LEFT' });
  });

  it('porte fermée qui enferme le personnage : aucune case atteignable', () => {
    expect(by(getLegalActions(makeState(), 'h1'), 'MOVE')).toMatchObject({ available: false, code: 'NO_REACHABLE_NODE' });
  });

  it('portes : aucune porte adjacente / porte ouverte', () => {
    const far = makeState({ characters: [char('h1', 'p1', 'd', { activated: true }), char('e1', 'p2', 'e')] });
    expect(by(getLegalActions(far, 'h1'), 'OPEN_DOOR')).toMatchObject({ available: false, code: 'NO_ADJACENT_DOOR' });
    const open = makeState({ doorState: 'OPEN' });
    const actions = getLegalActions(open, 'h1');
    expect(by(actions, 'OPEN_DOOR')).toMatchObject({ available: false, code: 'DOOR_ALREADY_OPEN' });
    expect(by(actions, 'CLOSE_DOOR').available).toBe(true);
  });

  it('avant sélection : SELECT possible, attaque/Overwatch/fin refusés, PASS possible', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'e')], turn: { activeCharacterId: undefined, actionUsed: undefined } });
    const actions = getLegalActions(state, 'h1');
    expect(by(actions, 'SELECT').available).toBe(true);
    expect(by(actions, 'ATTACK')).toMatchObject({ available: false, code: 'NOT_ACTIVE_CHARACTER' });
    expect(by(actions, 'OVERWATCH')).toMatchObject({ available: false, code: 'OVERWATCH_BEFORE_ACTIVATIONS' });
    expect(by(actions, 'END_ACTIVATION')).toMatchObject({ available: false, code: 'NO_ACTIVE_CHARACTER' });
    expect(by(actions, 'PASS').available).toBe(true);
  });

  it('personnage en Overwatch : non activable (IN_OVERWATCH), distinct d\'un personnage déjà activé', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a', { activated: true, overwatch: true }), char('h2', 'p1', 'b'), char('e1', 'p2', 'e')],
      turn: { activeCharacterId: undefined, actionUsed: undefined },
    });
    expect(by(getLegalActions(state, 'h1'), 'SELECT')).toMatchObject({ available: false, code: 'IN_OVERWATCH' });
    expect(by(getLegalActions(state, 'h2'), 'SELECT').available).toBe(true);
  });

  it('personnage déjà activé ou adverse : SELECT refusé', () => {
    const state = makeState({ turn: { activeCharacterId: undefined, actionUsed: undefined } });
    expect(by(getLegalActions(state, 'h1'), 'SELECT')).toMatchObject({ available: false, code: 'ALREADY_ACTIVATED' });
    expect(by(getLegalActions(state, 'e1'), 'SELECT')).toMatchObject({ available: false, code: 'NOT_YOUR_TURN' });
  });

  it('pas votre tour : tout est refusé pour le joueur en attente', () => {
    const actions = getLegalActions(makeState(), 'e1');
    expect(actions.every((a) => !a.available)).toBe(true);
  });

  it('réaction d\'Overwatch en attente : tout est suspendu', () => {
    const state = makeState({ turn: { reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' } } });
    for (const id of ['h1', 'e1']) {
      for (const a of getLegalActions(state, id)) expect(a).toMatchObject({ available: false, code: 'REACTION_PENDING' });
    }
  });

  it('partie terminée : tout est refusé', () => {
    const state = makeState({ phase: 'FINISHED' });
    for (const a of getLegalActions(state, 'h1')) expect(a).toMatchObject({ available: false, code: 'GAME_FINISHED', reason: 'La partie est terminée.' });
  });

  it('personnage inconnu', () => {
    const actions = getLegalActions(makeState(), 'nobody');
    expect(actions.every((a) => !a.available && a.code === 'UNKNOWN_CHARACTER')).toBe(true);
  });

  it('cohérence avec le moteur : disponible ⇔ commande acceptée', () => {
    const states = [
      makeState(),
      makeState({ characters: [char('h1', 'p1', 'c', { activated: true }), char('e1', 'p2', 'e')] }),
      makeState({ characters: [char('h1', 'p1', 'd', { activated: true }), char('e1', 'p2', 'e')], turn: { actionUsed: true } }),
      makeState({ turn: { activeCharacterId: undefined, actionUsed: undefined }, characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'e')] }),
      placementState(),
      placementState({ commandPoints: 0 }),
      placementState({ activePlayerId: 'p2' }),
      placementState({ characters: [char('h1', 'p1', 'a', { activated: true, overwatch: true }), char('e1', 'p2', 'e')] }),
    ];
    const accepts = (s: GameState, cmd: Parameters<typeof applyCommand>[1]) => applyCommand(s, cmd, new SeededRng(3)).accepted;
    for (const s of states) {
      const actions = getLegalActions(s, 'h1');
      expect(by(actions, 'OVERWATCH').available).toBe(accepts(s, { type: 'OVERWATCH', playerId: 'p1', characterId: 'h1' }));
      expect(by(actions, 'PASS_OVERWATCH').available).toBe(accepts(s, { type: 'PASS_OVERWATCH', playerId: 'p1' }));
      expect(by(actions, 'END_ACTIVATION').available).toBe(accepts(s, { type: 'END_TURN', playerId: 'p1' }));
      expect(by(actions, 'PASS').available).toBe(accepts(s, { type: 'PASS', playerId: 'p1' }));
      expect(by(actions, 'SELECT').available).toBe(accepts(s, { type: 'SELECT_CHARACTER', playerId: 'p1', characterId: 'h1' }));
      expect(by(actions, 'OPEN_DOOR').available).toBe(accepts(s, { type: 'OPEN_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'D' }));
      const attack = by(actions, 'ATTACK');
      for (const o of attack.details?.attackOptions ?? []) {
        expect(accepts(s, { type: 'ATTACK', playerId: 'p1', attackerId: 'h1', ...o })).toBe(true);
      }
      for (const b of attack.details?.blocked ?? []) {
        expect(accepts(s, { type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: b.targetId, weaponId: b.weaponId })).toBe(false);
      }
    }
  });
});

/** Phase de placement de l'Overwatch : p1 décide (sauf `activePlayerId`), PC par défaut 2. */
function placementState(opts: { activePlayerId?: string; commandPoints?: number; characters?: CharacterState[] } = {}): GameState {
  const activePlayerId = opts.activePlayerId ?? 'p1';
  return makeState({
    phase: 'OVERWATCH',
    commandPoints: opts.commandPoints ?? 2,
    characters: opts.characters ?? [char('h1', 'p1', 'a'), char('e1', 'p2', 'e')],
    turn: { initiativePlayerId: 'p1', activePlayerId, activeCharacterId: undefined, actionUsed: undefined },
  });
}

describe('getLegalActions : phase de placement de l\'Overwatch', () => {
  it('Overwatch disponible avec au moins 1 PC pour le joueur qui décide', () => {
    const actions = getLegalActions(placementState(), 'h1');
    expect(by(actions, 'OVERWATCH')).toEqual({ id: 'OVERWATCH', available: true });
    expect(by(actions, 'PASS_OVERWATCH').available).toBe(true);
  });

  it('sans PC : « Impossible : 1 PC requis. »', () => {
    expect(by(getLegalActions(placementState({ commandPoints: 0 }), 'h1'), 'OVERWATCH')).toMatchObject({
      available: false,
      code: 'INSUFFICIENT_COMMAND_POINTS',
      reason: 'Impossible : 1 PC requis.',
    });
  });

  it('personnage déjà en Overwatch ; joueur qui ne décide pas encore', () => {
    const placed = placementState({ characters: [char('h1', 'p1', 'a', { activated: true, overwatch: true }), char('e1', 'p2', 'e')] });
    expect(by(getLegalActions(placed, 'h1'), 'OVERWATCH')).toMatchObject({ available: false, code: 'ALREADY_OVERWATCH' });
    const waiting = placementState({ activePlayerId: 'p2' });
    expect(by(getLegalActions(waiting, 'h1'), 'OVERWATCH')).toMatchObject({
      available: false,
      code: 'NOT_YOUR_DECISION_TURN',
      reason: "Impossible : ce n'est pas votre tour de décider.",
    });
    expect(by(getLegalActions(waiting, 'h1'), 'PASS_OVERWATCH')).toMatchObject({ available: false, code: 'NOT_YOUR_DECISION_TURN' });
    expect(by(getLegalActions(waiting, 'e1'), 'OVERWATCH').available).toBe(true);
  });

  it('sans PC ou sans personnage éligible : seule la passe est possible (aucun passage automatique)', () => {
    const broke = getLegalActions(placementState({ commandPoints: 0 }), 'h1');
    expect(by(broke, 'OVERWATCH').available).toBe(false);
    expect(by(broke, 'PASS_OVERWATCH').available).toBe(true);
    const none = placementState({ characters: [char('h1', 'p1', 'a', { activated: true, overwatch: true }), char('e1', 'p2', 'e')] });
    expect(by(getLegalActions(none, 'h1'), 'OVERWATCH').available).toBe(false);
    expect(by(getLegalActions(none, 'h1'), 'PASS_OVERWATCH').available).toBe(true);
  });

  it('un placement redonne la main : OVERWATCH/passe passent à l\'autre joueur', () => {
    const state = placementState();
    const after = applyCommand(state, { type: 'OVERWATCH', playerId: 'p1', characterId: 'h1' }, new SeededRng(3)).state;
    expect(by(getLegalActions(after, 'e1'), 'OVERWATCH').available).toBe(true);
    expect(by(getLegalActions(after, 'e1'), 'PASS_OVERWATCH').available).toBe(true);
    expect(by(getLegalActions(after, 'h1'), 'PASS_OVERWATCH')).toMatchObject({ available: false, code: 'NOT_YOUR_DECISION_TURN' });
  });

  it('les actions d\'activation sont toutes refusées pendant le placement', () => {
    const actions = getLegalActions(placementState(), 'h1');
    for (const id of ['SELECT', 'MOVE', 'ATTACK', 'OPEN_DOOR', 'CLOSE_DOOR', 'END_ACTIVATION', 'PASS'] as const) {
      expect(by(actions, id).available).toBe(false);
    }
  });
});

describe('getReactionOptions', () => {
  const reactionState = (ow: CharacterState) =>
    makeState({
      characters: [char('h1', 'p1', 'c', { activated: true }), ow],
      turn: { reaction: { overwatcherId: ow.id, targetId: 'h1', forPlayerId: 'p2' } },
    });

  it('null sans réaction', () => {
    expect(getReactionOptions(makeState())).toBeNull();
  });

  it('expose la commande annoncée en attente (déclencheur b)', () => {
    const resume = { type: 'MOVE_CHARACTER', playerId: 'p1', characterId: 'h1', path: ['b'] } as const;
    const state = makeState({
      characters: [char('h1', 'p1', 'c', { activated: true }), char('e1', 'p2', 'e', { overwatch: true })],
      turn: { reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2', resume } },
    });
    expect(getReactionOptions(state)?.announced).toEqual(resume);
    expect(getReactionOptions(reactionState(char('e1', 'p2', 'e', { overwatch: true })))).not.toHaveProperty('announced');
  });

  it('liste les armes utilisables pour tirer', () => {
    const opts = getReactionOptions(reactionState(char('e1', 'p2', 'e', { overwatch: true })))!;
    expect(opts.canFire).toBe(true);
    expect(opts.fire).toMatchObject([
      { weaponId: 'pistol', available: true },
      { weaponId: 'knife', available: false },
    ]);
  });

  it('aucune arme utilisable : tirer est impossible, avec motif', () => {
    const blind = char('e1', 'p2', 'a', { overwatch: true });
    const opts = getReactionOptions(reactionState(blind))!;
    expect(opts.canFire).toBe(false);
    expect(opts.fire[0]?.reason).toBe('Aucune ligne de vue sur la cible.');
  });
});
