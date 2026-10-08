import { describe, expect, it } from 'vitest';
import {
  BoardBuilder,
  ScriptedRng,
  SeededRng,
  applyCommand,
  createInitialState,
  type CharacterState,
  type GameCommand,
  type GameState,
} from '@tannhauser/core';

const stats = { combat: 8, physical: 5, mental: 5, movement: 3 };

function character(id: string, playerId: string, nodeId: string, health = 1): CharacterState {
  return {
    id,
    definitionId: id,
    playerId,
    nodeId,
    health,
    statRows: Array.from({ length: health }, () => stats),
    alive: true,
    activated: false,
    movementLeft: 3,
    weapons: [{ id: 'pistol', kind: 'PISTOL', dice: 4 }],
  };
}

/** a(r) - b(r) - c(g) - d(g) - e(g) : un personnage en e ou d voit c, d, e mais pas a ni b. */
function board() {
  return new BoardBuilder()
    .node('a', ['r'])
    .node('b', ['r'])
    .node('c', ['g'])
    .node('d', ['g'])
    .node('e', ['g'])
    .edge('a', 'b')
    .edge('b', 'c')
    .edge('c', 'd')
    .edge('d', 'e')
    .build();
}

/** Même ligne a-e, mais toutes les cases partagent une couleur : tout le monde se voit. */
function flatBoard() {
  return new BoardBuilder()
    .node('a', ['r'])
    .node('b', ['r'])
    .node('c', ['r'])
    .node('d', ['r'])
    .node('e', ['r'])
    .edge('a', 'b')
    .edge('b', 'c')
    .edge('c', 'd')
    .edge('d', 'e')
    .build();
}

/**
 * Partie démarrée puis phase d'Overwatch : les `placements` (un personnage par décision, en alternance) sont appliqués,
 * puis les joueurs passent tour à tour jusqu'à deux passes consécutives.
 */
function start(rng: ScriptedRng, characters: CharacterState[], flat = false, placements: GameCommand[] = []): GameState {
  const initial = createInitialState({
    gameId: 'it',
    scenarioId: 'it',
    board: flat ? flatBoard() : board(),
    players: [
      { id: 'p1', factionId: 'f1', commandPoints: 0 },
      { id: 'p2', factionId: 'f2', commandPoints: 0 },
    ],
    characters,
    rng: new SeededRng(1).snapshot(),
  });
  let state = applyCommand(initial, { type: 'START_GAME' }, rng).state;
  expect(state.phase).toBe('OVERWATCH');
  const apply = (command: GameCommand) => {
    const res = applyCommand(state, command, rng);
    expect(res.errors, JSON.stringify(res.errors)).toEqual([]);
    state = res.state;
  };
  for (const command of placements) apply(command);
  while (state.phase === 'OVERWATCH') apply({ type: 'PASS_OVERWATCH', playerId: state.turn.activePlayerId! });
  expect(state.phase).toBe('ACTIVATION');
  return state;
}

/** Petit pilote : applique une commande qui doit être acceptée et met à jour l'état courant. */
function driver(initial: GameState, rng: ScriptedRng) {
  let state = initial;
  return {
    get state() {
      return state;
    },
    run(cmd: GameCommand) {
      const res = applyCommand(state, cmd, rng);
      expect(res.errors, JSON.stringify(res.errors)).toEqual([]);
      state = res.state;
      return res;
    },
    refuse(cmd: GameCommand, code: string) {
      const res = applyCommand(state, cmd, rng);
      expect(res.accepted).toBe(false);
      expect(res.errors[0]?.code).toBe(code);
      expect(res.state).toBe(state);
    },
    hero: (id: string) => state.characters.find((c) => c.id === id)!,
  };
}

const select = (playerId: string, characterId: string): GameCommand => ({ type: 'SELECT_CHARACTER', playerId, characterId });
const move = (playerId: string, characterId: string, path: string[]): GameCommand => ({ type: 'MOVE_CHARACTER', playerId, characterId, path });
const shoot = (playerId: string, attackerId: string, targetId: string): GameCommand => ({
  type: 'ATTACK',
  playerId,
  attackerId,
  targetId,
  weaponId: 'pistol',
});
const endTurn = (playerId: string): GameCommand => ({ type: 'END_TURN', playerId });

describe('tour complet : start → select → move → attack → end', () => {
  it('enchaîne les commandes avec les contrôles d\'activation cohérents', () => {
    // Initiative : p1 = 9, p2 = 2 ; attaque : 4 x 10 naturel (4 blessures) ; défense : 4 x 1 (aucune parade).
    const rng = new ScriptedRng([2, 9, 10, 10, 10, 10, 1, 1, 1, 1]);
    const d = driver(start(rng, [character('h1', 'p1', 'a'), character('h2', 'p2', 'c')], true), rng);
    expect(d.state.turn.activePlayerId).toBe('p1');

    d.run(select('p1', 'h1'));
    d.run(move('p1', 'h1', ['b']));
    expect(d.hero('h1').nodeId).toBe('b');

    const attack = d.run(shoot('p1', 'h1', 'h2'));
    expect(attack.events.map((e) => e.type)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'CHARACTER_DEFEATED', 'VICTORY',
    ]);
    expect(d.state.phase).toBe('FINISHED');
    expect(d.state.victory.winnerId).toBe('p1');
    expect(rng.snapshot().draws).toBe(10);
  });

  it('rejette un déplacement sans activation en cours pour un personnage déjà activé', () => {
    const rng = new ScriptedRng([2, 9]);
    const d = driver(start(rng, [character('h1', 'p1', 'a'), character('h2', 'p2', 'c')]), rng);
    d.run(select('p1', 'h1'));
    d.run(endTurn('p1'));
    d.refuse(move('p1', 'h1', ['b']), 'NOT_ACTIVE_PLAYER');
  });

  it('refuse une attaque sans SELECT_CHARACTER préalable', () => {
    const rng = new ScriptedRng([2, 9]);
    const d = driver(start(rng, [character('h1', 'p1', 'a'), character('h2', 'p2', 'b')]), rng);
    d.refuse(shoot('p1', 'h1', 'h2'), 'NOT_ACTIVE_CHARACTER');
  });
});

describe('parcours move → action → move', () => {
  it('déplacement, attaque (action unique), puis déplacement avec les PM restants', () => {
    // Initiative p1 ; attaque [10,10,1,1] = 2 blessures ; défense [5,1,1,1] (difficulté 5) = 1 parée -> 1 dégât.
    const rng = new ScriptedRng([2, 9, 10, 10, 1, 1, 1, 5, 1, 1]);
    const d = driver(start(rng, [character('h1', 'p1', 'a'), character('h2', 'p2', 'c', 3)], true), rng);

    d.run(select('p1', 'h1'));
    expect(d.hero('h1').movementLeft).toBe(3);

    d.run(move('p1', 'h1', ['b']));
    expect(d.hero('h1')).toMatchObject({ nodeId: 'b', movementLeft: 2 });
    expect(d.state.turn.actionUsed).toBeFalsy();

    const atk = d.run(shoot('p1', 'h1', 'h2'));
    expect(atk.events.map((e) => e.type)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED',
    ]);
    expect(d.hero('h2')).toMatchObject({ health: 2, alive: true });
    expect(d.state.turn.actionUsed).toBe(true);
    expect(d.hero('h1').movementLeft).toBe(2);

    // Seconde action refusée, mais le déplacement reste possible après l'action.
    d.refuse(shoot('p1', 'h1', 'h2'), 'ACTION_ALREADY_USED');
    d.run(move('p1', 'h1', ['a']));
    expect(d.hero('h1')).toMatchObject({ nodeId: 'a', movementLeft: 1 });

    const end = d.run(endTurn('p1'));
    expect(end.events.map((e) => e.type)).toEqual(['CHARACTER_ACTIVATION_ENDED']);
    expect(d.state.turn.activePlayerId).toBe('p2');
    expect(d.state.turn.activeCharacterId).toBeUndefined();
    expect(d.state.turn.actionUsed).toBeUndefined();
    expect(rng.snapshot().draws).toBe(10);
  });
});

describe('parcours Overwatch complet', () => {
  const place = (playerId: string, characterId: string): GameCommand => ({ type: 'OVERWATCH', playerId, characterId });

  it('placement (1 PC), déclenchement avec arrêt, tir de réaction, reprise, attaque et victoire', () => {
    // Initiative : p2 = 9 gagne (p1 = 2). h1 a 2 de santé, h2 (en e) n'en a qu'une.
    // Tir de réaction de h2 : attaque [10,10,1,1] (2 blessures), défense de h1 [10,1,1,1] (1 parée) -> 1 dégât.
    // Attaque de h1 : [10,10,10,10] ; défense de h2 [1,1,1,1] -> h2 meurt.
    const rng = new ScriptedRng([9, 2, 10, 10, 1, 1, 1, 10, 1, 1, 10, 10, 10, 10, 1, 1, 1, 1]);
    const d = driver(start(rng, [character('h1', 'p1', 'a', 2), character('h2', 'p2', 'e')], false, [place('p2', 'h2')]), rng);
    expect(d.hero('h2')).toMatchObject({ overwatch: true, activated: true });
    expect(d.state.players.find((p) => p.id === 'p2')?.commandPoints).toBe(1);
    // h2 est en Overwatch : p2 n'a rien à activer, p1 commence (et enchaîne).
    expect(d.state.turn.activePlayerId).toBe('p1');
    d.refuse(select('p2', 'h2'), 'NOT_YOUR_TURN');

    // p1 avance : le déplacement s'arrête en c, première case vue de h2.
    d.run(select('p1', 'h1'));
    const mv = d.run(move('p1', 'h1', ['b', 'c', 'd']));
    expect(mv.events.map((e) => e.type)).toEqual(['CHARACTER_MOVED', 'OVERWATCH_TRIGGERED']);
    expect(mv.events[0]).toMatchObject({ path: ['b', 'c'], cost: 2 });
    expect(d.hero('h1')).toMatchObject({ nodeId: 'c', movementLeft: 1 });

    // Tout est bloqué tant que la réaction n'est pas résolue.
    d.refuse(move('p1', 'h1', ['d']), 'REACTION_PENDING');
    d.refuse(endTurn('p1'), 'REACTION_PENDING');
    d.refuse(shoot('p1', 'h1', 'h2'), 'REACTION_PENDING');

    const reaction = d.run({ type: 'OVERWATCH_FIRE', playerId: 'p2', weaponId: 'pistol' });
    expect(reaction.events.map((e) => e.type)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'OVERWATCH_RESOLVED', 'CHARACTER_MOVED',
    ]);
    expect(d.hero('h1').health).toBe(1);
    expect(d.hero('h2')).toMatchObject({ overwatch: false, activated: true });
    expect(d.state.turn.reaction).toBeUndefined();

    // L'Overwatch n'a fait qu'interrompre : le déplacement reprend tout seul jusqu'en d, puis h1 peut faire son action.
    expect(d.state.turn.activeCharacterId).toBe('h1');
    expect(d.hero('h1')).toMatchObject({ nodeId: 'd', movementLeft: 0 });

    const kill = d.run(shoot('p1', 'h1', 'h2'));
    expect(kill.events.map((e) => e.type)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'CHARACTER_DEFEATED', 'VICTORY',
    ]);
    expect(d.state.phase).toBe('FINISHED');
    expect(d.state.victory.winnerId).toBe('p1');
    expect(rng.snapshot().draws).toBe(18);
  });

  it('phase d\'Overwatch : alternance stricte, passe puis placement adverse, deux passes consécutives, replay identique', () => {
    const play = () => {
      const rng = new ScriptedRng([9, 2]);
      const initial = createInitialState({
        gameId: 'it',
        scenarioId: 'it',
        board: board(),
        players: [
          { id: 'p1', factionId: 'f1', commandPoints: 0 },
          { id: 'p2', factionId: 'f2', commandPoints: 0 },
        ],
        characters: [character('h1', 'p1', 'a'), character('h3', 'p1', 'b'), character('h4', 'p1', 'b'), character('h2', 'p2', 'e')],
        rng: new SeededRng(1).snapshot(),
      });
      const d = driver(applyCommand(initial, { type: 'START_GAME' }, rng).state, rng);
      expect(d.state.turn).toMatchObject({ initiativePlayerId: 'p2', activePlayerId: 'p2' });
      d.refuse({ type: 'PASS_OVERWATCH', playerId: 'p1' }, 'NOT_YOUR_DECISION_TURN');
      d.run({ type: 'PASS_OVERWATCH', playerId: 'p2' }); // p2 passe
      d.refuse(place('p2', 'h2'), 'NOT_YOUR_DECISION_TURN');
      d.run(place('p1', 'h1')); // p1 place un seul personnage : la main revient à p2
      expect(d.state.turn).toMatchObject({ activePlayerId: 'p2', overwatchPasses: 0 });
      d.refuse(place('p1', 'h3'), 'NOT_YOUR_DECISION_TURN');
      d.run(place('p2', 'h2')); // p2, qui avait passé, peut encore placer
      // p1 place un second personnage (2e PC, son dernier) : p2 n'a plus de personnage éligible et p1 plus de PC,
      // les deux passent automatiquement (deux passes consécutives) et la phase se ferme d'elle-même.
      const end = d.run(place('p1', 'h3'));
      expect(end.events.map((e) => e.type)).toEqual([
        'COMMAND_POINTS_SPENT', 'OVERWATCH_PLACED', 'OVERWATCH_PASSED', 'OVERWATCH_PASSED', 'OVERWATCH_PHASE_ENDED',
      ]);
      expect(end.events.slice(2, 4)).toEqual([
        { type: 'OVERWATCH_PASSED', playerId: 'p2', auto: true },
        { type: 'OVERWATCH_PASSED', playerId: 'p1', auto: true },
      ]);
      expect(d.state.phase).toBe('ACTIVATION');
      d.refuse({ type: 'PASS_OVERWATCH', playerId: 'p2' }, 'NOT_OVERWATCH_PHASE');
      return d.state;
    };
    const first = play();
    expect(first.players.map((p) => p.commandPoints)).toEqual([0, 1]);
    expect(first.characters.filter((c) => c.overwatch).map((c) => c.id)).toEqual(['h1', 'h3', 'h2']);
    expect(first.characters.find((c) => c.id === 'h4')).toMatchObject({ overwatch: false, activated: false });
    expect(play()).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('adversaire déjà en vue qui tente une attaque : la réaction passe avant, puis l\'attaque annoncée est exécutée', () => {
    // Initiative p2 = 9. h2 (en e, Overwatch) voit d ; h1 est en d (vu). h1 annonce une attaque sur h2.
    // Réaction : h2 tire [1,1,1,1] (raté). Puis l'attaque de h1 : [10,10,10,10] ; défense [1,1,1,1] -> h2 meurt.
    const rng = new ScriptedRng([9, 2, 1, 1, 1, 1, 10, 10, 10, 10, 1, 1, 1, 1]);
    const d = driver(start(rng, [character('h1', 'p1', 'd', 2), character('h2', 'p2', 'e')], false, [place('p2', 'h2')]), rng);
    d.run(select('p1', 'h1'));
    const announce = d.run(shoot('p1', 'h1', 'h2'));
    expect(announce.events.map((e) => e.type)).toEqual(['OVERWATCH_TRIGGERED']);
    expect(announce.events[0]).toMatchObject({ announced: 'ATTACK', overwatcherId: 'h2', targetId: 'h1' });
    expect(rng.snapshot().draws).toBe(2);
    expect(d.state.turn.actionUsed).toBeFalsy();

    const fire = d.run({ type: 'OVERWATCH_FIRE', playerId: 'p2', weaponId: 'pistol' });
    expect(fire.events.map((e) => e.type)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'ATTACK_MISSED', 'OVERWATCH_RESOLVED',
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'CHARACTER_DEFEATED', 'VICTORY',
    ]);
    expect(d.state.phase).toBe('FINISHED');
    expect(rng.snapshot().draws).toBe(14);
  });

  it('renoncer : le mouvement reprend, l\'Overwatch reste, et il est retiré au refresh du tour suivant (PC rendus)', () => {
    // Tour 1 : p2 gagne. Tour 2 : initiative [4, 3] -> p1 gagne.
    const rng = new ScriptedRng([9, 2, 3, 4]);
    const d = driver(start(rng, [character('h1', 'p1', 'a', 2), character('h2', 'p2', 'e', 2), character('h3', 'p2', 'a', 2)], false, [place('p2', 'h2')]), rng);
    // p2 a encore h3 à activer : il commence.
    d.run(select('p2', 'h3'));
    d.run(endTurn('p2'));

    d.run(select('p1', 'h1'));
    d.run(move('p1', 'h1', ['b', 'c']));
    expect(d.state.turn.reaction?.overwatcherId).toBe('h2');
    d.run({ type: 'OVERWATCH_DECLINE', playerId: 'p2' });
    expect(d.hero('h2').overwatch).toBe(true);
    d.run(move('p1', 'h1', ['d']));
    expect(d.hero('h1').nodeId).toBe('d');
    const end = d.run(endTurn('p1'));
    expect(end.events.map((e) => e.type)).toContain('TURN_STARTED');
    expect(d.state.turn.number).toBe(2);
    expect(d.state.phase).toBe('OVERWATCH');
    // Le refresh retire l'Overwatch et rend 2 PC : p2 peut le replacer pendant la phase de placement.
    expect(d.hero('h2')).toMatchObject({ overwatch: false, activated: false });
    expect(d.state.players.map((p) => p.commandPoints)).toEqual([2, 2]);
  });
});
