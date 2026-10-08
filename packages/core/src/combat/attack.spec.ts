import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import type { BoardState } from '../board/types';
import { applyCommand } from '../engine/apply-command';
import '../engine/start-game';
import { ScriptedRng, SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import { currentStats, type CharacterState, type GameState } from '../state/types';
import { deathmatchWinner } from '../victory/deathmatch';
import '../overwatch/handlers';
import '../turn/handlers';
import './attack';
import { explainCombat } from './log';
import type { WeaponDefinition } from './weapons';

const pistol: WeaponDefinition = { id: 'pistol', kind: 'PISTOL', dice: 4 };
const knife: WeaponDefinition = { id: 'knife', kind: 'CAC', dice: 2 };

/**
 * Combat 7 -> difficulte d'attaque 3 ; Physique 5 -> difficulte de defense 5.
 * La ligne active depend de la sante (3 = premiere ligne, 1 = derniere).
 */
const rows = [
  { combat: 7, physical: 5, mental: 5, movement: 4 },
  { combat: 5, physical: 5, mental: 5, movement: 4 },
  { combat: 3, physical: 4, mental: 4, movement: 3 },
];

const MISS4 = [1, 1, 1, 1];

function line(): BoardState {
  return new BoardBuilder()
    .node('a', ['red'])
    .node('b', ['red'])
    .node('c', ['red'])
    .node('d', ['red'])
    .edge('a', 'b')
    .edge('b', 'c')
    .edge('c', 'd')
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
    movementLeft: 0,
    ...extra,
  };
}

/** h1 est le personnage actif de p1 (SELECT_CHARACTER deja passe), action non utilisee. */
function makeState(opts: { board?: BoardState; characters?: CharacterState[]; activeCharacterId?: string | null } = {}): GameState {
  const base = createInitialState({
    gameId: 'g',
    scenarioId: 'dev',
    board: opts.board ?? line(),
    players: [
      { id: 'p1', factionId: 'union', commandPoints: 0 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters: opts.characters ?? [char('h1', 'p1', 'a'), char('e1', 'p2', 'c'), char('e2', 'p2', 'd')],
    rng: new SeededRng(1).snapshot(),
  });
  const active = opts.activeCharacterId === undefined ? 'h1' : opts.activeCharacterId;
  return {
    ...base,
    phase: 'ACTIVATION',
    turn: {
      number: 1,
      initiativePlayerId: 'p1',
      activePlayerId: 'p1',
      ...(active === null ? {} : { activeCharacterId: active, actionUsed: false }),
    },
  };
}

const attack = (weaponId = 'pistol', targetId = 'e1') =>
  ({ type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId, weaponId }) as const;

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

const hp = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const types = (events: readonly { type: string }[]) => events.map((e) => e.type);

describe('ATTACK : jet d\'attaque', () => {
  it('attaque reussie non parée : 1 blessure = 1 dégât, ligne de stats active mise à jour, événements ordonnés', () => {
    const res = applyCommand(makeState(), attack(), new ScriptedRng([2, 2, 5, 2, ...MISS4]));
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED',
      'COMBAT_ROLLED',
      'DEFENSE_ROLLED',
      'ATTACK_HIT',
      'DAMAGE_APPLIED',
    ]);
    expect(hp(res.state, 'e1').health).toBe(2);
    expect(currentStats(hp(res.state, 'e1')).combat).toBe(5);
    expect(res.events[4]).toMatchObject({ wounds: 1, healthLeft: 2 });
    expect(res.state.history).toEqual(res.events);
  });

  it('jet minimum (tous les dés à 1) : manqué, aucune blessure, pas de jet de défense, personnages inchangés', () => {
    const state = makeState();
    const rng = new ScriptedRng(MISS4);
    const res = applyCommand(state, attack(), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual(['ATTACK_DECLARED', 'COMBAT_ROLLED', 'ATTACK_MISSED']);
    expect(res.state.characters).toBe(state.characters);
    expect(rng.snapshot().draws).toBe(4);
  });

  it('jet maximum : chaque succès est une blessure (4 succès = 4 blessures non parées)', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 5 }), char('e2', 'p2', 'd')] });
    const res = applyCommand(state, attack(), new ScriptedRng([10, 10, 10, 10, ...MISS4]));
    expect(res.events[1]).toMatchObject({ successes: 4 });
    expect(hp(res.state, 'e1').health).toBe(1);
    expect(res.events.find((e) => e.type === 'DAMAGE_APPLIED')).toMatchObject({ wounds: 4, healthLeft: 1 });
  });

  it('un 10 naturel réussit malgré une difficulté inatteignable ; un 1 naturel échoue toujours', () => {
    const weak = makeState({
      characters: [char('h1', 'p1', 'a', { health: 1, statRows: [{ combat: 1, physical: 1, mental: 1, movement: 1 }] }), char('e1', 'p2', 'c')],
    });
    const hit = applyCommand(weak, attack(), new ScriptedRng([8, 8, 8, 10, ...MISS4]));
    expect(hit.events[1]).toMatchObject({ difficulty: 9, successes: 1 });
    expect(types(hit.events)).toContain('ATTACK_HIT');
    const miss = applyCommand(makeState(), attack(), new ScriptedRng(MISS4));
    expect(types(miss.events)).toContain('ATTACK_MISSED');
  });

  it('les dés viennent des données de l\'arme : 2 pour un couteau, 6 pour une arme custom', () => {
    const custom: WeaponDefinition = { id: 'gatling', kind: 'AUTOMATIC', dice: 6 };
    const state = makeState({ characters: [char('h1', 'p1', 'a', { weapons: [custom] }), char('e1', 'p2', 'c')] });
    const res = applyCommand(state, attack('gatling'), new ScriptedRng([1, 1, 1, 1, 1, 1]));
    expect(res.events[1]).toMatchObject({ type: 'COMBAT_ROLLED', dice: [1, 1, 1, 1, 1, 1] });

    const adj = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    const cac = applyCommand(adj, attack('knife', 'e1'), new ScriptedRng([1, 1]));
    expect(cac.events[1]).toMatchObject({ dice: [1, 1] });
  });

  it('difficulté = 10 − Combat courant : un attaquant blessé touche moins facilement', () => {
    const wounded = makeState({ characters: [char('h1', 'p1', 'a', { health: 1 }), char('e1', 'p2', 'c')] });
    // Combat 3 -> difficulté 7 : un 6 échoue, alors qu'à Combat 7 (difficulté 3) il réussit.
    const res = applyCommand(wounded, attack(), new ScriptedRng([6, 6, 6, 6]));
    expect(res.events[1]).toMatchObject({ successes: 0, difficulty: 7 });
    const healthy = applyCommand(makeState(), attack(), new ScriptedRng([6, 6, 6, 6, ...MISS4]));
    expect(healthy.events[1]).toMatchObject({ successes: 4, difficulty: 3 });
  });

  it('succès automatiques de l\'arme et dés/bonus d\'arme', () => {
    const w: WeaponDefinition = { id: 'ace', kind: 'PISTOL', dice: 2, autoSuccesses: 1, extraDice: 1, resultModifier: 4 };
    const state = makeState({ characters: [char('h1', 'p1', 'a', { weapons: [w] }), char('e1', 'p2', 'c')] });
    // 3 dés ; difficulté 3 ; 2+4 = 6 et 5+4 = 9 réussissent, le 1 naturel échoue -> 2 tirés + 1 auto.
    const res = applyCommand(state, attack('ace'), new ScriptedRng([2, 1, 5, ...MISS4]));
    expect(res.events[1]).toMatchObject({ successes: 3 });
  });

  it('modificateurs de la case de l\'attaquant pris en compte', () => {
    const board = new BoardBuilder()
      .node('a', ['red'], 0, 0, { modifiers: [{ id: 'cover', applies: 'ATTACKER', extraDice: 1 }] })
      .node('b', ['red'])
      .edge('a', 'b')
      .build();
    const state = makeState({ board, characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    const res = applyCommand(state, attack(), new ScriptedRng([1, 1, 1, 1, 1]));
    expect(res.events[1]).toMatchObject({ dice: [1, 1, 1, 1, 1] });
  });

  it('journal structuré dans COMBAT_ROLLED et explainCombat', () => {
    const res = applyCommand(makeState(), attack(), new ScriptedRng([1, 5, 10, 2, ...MISS4]));
    const ev = res.events[1];
    if (ev?.type !== 'COMBAT_ROLLED' || !ev.log) throw new Error('journal manquant');
    expect(ev.log).toMatchObject({
      basePool: 4,
      poolSize: 4,
      difficulty: 3,
      rolledSuccesses: 2,
      successes: 2,
      hit: true,
      wounds: 2,
      healthBefore: 3,
      healthAfter: 1,
      defense: { attackerSuccesses: 2, defenderSuccesses: 0, remaining: 2, attackerWins: true },
      defenseRoll: { defenderId: 'e1', physicalValue: 5, difficulty: 5, poolSize: 4, successes: 0 },
    });
    const lines = explainCombat(ev.log);
    expect(lines[0]).toBe('h1 attaque e1 avec pistol.');
    expect(lines.some((l) => l.startsWith('Défense de e1'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Dégâts : 2'))).toBe(true);
  });

  it('journal sans défense quand l\'attaque est manquée', () => {
    const res = applyCommand(makeState(), attack(), new ScriptedRng(MISS4));
    const ev = res.events[1];
    if (ev?.type !== 'COMBAT_ROLLED' || !ev.log) throw new Error('journal manquant');
    expect(ev.log).toMatchObject({ hit: false, wounds: 0, defense: null, defenseRoll: null });
  });
});

describe('ATTACK : jet de défense', () => {
  it('la défense annule toutes les blessures : ATTACK_MISSED, aucun dégât, mais DEFENSE_ROLLED émis', () => {
    const state = makeState();
    const res = applyCommand(state, attack(), new ScriptedRng([10, 1, 1, 1, 10, 1, 1, 1]));
    expect(types(res.events)).toEqual(['ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_MISSED']);
    expect(res.events[2]).toMatchObject({ defenderId: 'e1', successes: 1, difficulty: 5, dice: [10, 1, 1, 1] });
    expect(hp(res.state, 'e1').health).toBe(3);
    expect(res.state.characters).toBe(state.characters);
    const ev = res.events[1];
    if (ev?.type !== 'COMBAT_ROLLED' || !ev.log) throw new Error('journal manquant');
    expect(ev.log).toMatchObject({ hit: false, wounds: 0 });
    expect(explainCombat(ev.log).at(-1)).toBe('Toutes les blessures sont parées : aucun dégât.');
  });

  it('une parade en excès ne crée pas de dégât négatif', () => {
    const res = applyCommand(makeState(), attack(), new ScriptedRng([10, 1, 1, 1, 10, 10, 10, 10]));
    expect(types(res.events)).toContain('ATTACK_MISSED');
    expect(hp(res.state, 'e1').health).toBe(3);
  });

  it('défense partielle : seules les blessures non parées infligent des dégâts', () => {
    // 3 blessures ; défense difficulté 5 : 5 (succès), 10 (succès), 1, 4 -> 2 parées -> 1 dégât.
    const res = applyCommand(makeState(), attack(), new ScriptedRng([10, 10, 10, 1, 5, 10, 1, 4]));
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED',
    ]);
    expect(res.events[2]).toMatchObject({ successes: 2 });
    expect(res.events[4]).toMatchObject({ wounds: 1, healthLeft: 2 });
    expect(hp(res.state, 'e1').health).toBe(2);
  });

  it('plusieurs blessures non parées = plusieurs dégâts', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 5 }), char('e2', 'p2', 'd')] });
    const res = applyCommand(state, attack(), new ScriptedRng([10, 10, 10, 1, ...MISS4]));
    expect(res.events.find((e) => e.type === 'DAMAGE_APPLIED')).toMatchObject({ wounds: 3, healthLeft: 2 });
    expect(hp(res.state, 'e1')).toMatchObject({ health: 2, alive: true });
  });

  it('les dégâts excédentaires ne rendent jamais la santé négative', () => {
    const res = applyCommand(makeState(), attack(), new ScriptedRng([10, 10, 10, 10, ...MISS4]));
    expect(hp(res.state, 'e1')).toMatchObject({ health: 0, alive: false });
  });

  it("Physique 0 : la défense est lancée avec la difficulté 10 (seul un 10 naturel pare)", () => {
    const zero = { combat: 3, physical: 0, mental: 1, movement: 1 };
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 3, statRows: [zero] }), char('e2', 'p2', 'd')],
    });
    const rng = new ScriptedRng([10, 10, 1, 1, 9, 9, 10, 1]);
    const res = applyCommand(state, attack(), rng);
    expect(types(res.events)).toEqual(['ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED']);
    expect(res.events[2]).toMatchObject({ difficulty: 10, successes: 1 });
    expect(res.events[4]).toMatchObject({ wounds: 1, healthLeft: 2 });
    expect(rng.snapshot().draws).toBe(8);
  });

  it('difficulté de défense = 10 − Physique courant du défenseur blessé', () => {
    // e1 à 1 de santé : Physique 4 -> difficulté 6 ; un 5 ne pare pas, un 6 oui.
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 1 }), char('e2', 'p2', 'd')] });
    const res = applyCommand(state, attack(), new ScriptedRng([10, 1, 1, 1, 5, 5, 5, 5]));
    expect(res.events[2]).toMatchObject({ type: 'DEFENSE_ROLLED', difficulty: 6, successes: 0 });
    const parried = applyCommand(state, attack(), new ScriptedRng([10, 1, 1, 1, 6, 1, 1, 1]));
    expect(types(parried.events)).toContain('ATTACK_MISSED');
    expect(hp(parried.state, 'e1').health).toBe(1);
  });

  it('la taille de la réserve de défense vient de state.config.defensePoolSize', () => {
    const base = makeState();
    const small: GameState = { ...base, config: { ...base.config, defensePoolSize: 2 } };
    const res = applyCommand(small, attack(), new ScriptedRng([10, 1, 1, 1, 1, 1]));
    expect(res.events[2]).toMatchObject({ type: 'DEFENSE_ROLLED', dice: [1, 1] });
    expect(base.config.defensePoolSize).toBe(4);
    const dflt = applyCommand(base, attack(), new ScriptedRng([10, 1, 1, 1, 1, 1, 1, 1]));
    expect(dflt.events[2]).toMatchObject({ dice: [1, 1, 1, 1] });
  });

  it('ordre des tirages : tous les dés d\'attaque, puis tous les dés de défense', () => {
    const rng = new ScriptedRng([10, 3, 4, 10, 2, 10, 3, 9]);
    const res = applyCommand(makeState(), attack(), rng);
    expect(res.events[1]).toMatchObject({ dice: [10, 3, 4, 10] });
    expect(res.events[2]).toMatchObject({ dice: [2, 10, 3, 9] });
    expect(rng.snapshot().draws).toBe(8);
  });

  it('modificateur DEFENDER de la case du défenseur : dés de défense supplémentaires', () => {
    const board = new BoardBuilder()
      .node('a', ['red'])
      .node('b', ['red'], 0, 0, { modifiers: [{ id: 'cover', applies: 'DEFENDER', extraDice: 1 }] })
      .edge('a', 'b')
      .build();
    const state = makeState({ board, characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    const res = applyCommand(state, attack(), new ScriptedRng([10, 1, 1, 1, 1, 1, 1, 1, 1]));
    expect(res.events[2]).toMatchObject({ dice: [1, 1, 1, 1, 1] });
  });
});

describe('ATTACK : action unique', () => {
  it('l\'attaque passe actionUsed à vrai sans toucher à l\'activation ni aux PM', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a', { movementLeft: 3 }), char('e1', 'p2', 'c')] });
    const res = applyCommand(state, attack(), new ScriptedRng(MISS4));
    expect(res.state.turn.actionUsed).toBe(true);
    expect(res.state.turn.activeCharacterId).toBe('h1');
    expect(hp(res.state, 'h1').movementLeft).toBe(3);
  });

  it('une deuxième attaque (même manquée) est refusée : ACTION_ALREADY_USED', () => {
    const rng = new ScriptedRng([...MISS4, 9, 9, 9, 9]);
    const first = applyCommand(makeState(), attack(), rng);
    expect(first.accepted).toBe(true);
    const second = applyCommand(first.state, attack('pistol', 'e2'), rng);
    expect(second.accepted).toBe(false);
    expect(second.errors[0]?.code).toBe('ACTION_ALREADY_USED');
    expect(second.state).toBe(first.state);
    expect(rng.snapshot().draws).toBe(4);
  });

  it('refuse un attaquant qui n\'est pas le personnage actif (aucune activation en cours)', () => {
    const rng = new ScriptedRng([9]);
    const res = applyCommand(makeState({ activeCharacterId: null }), attack(), rng);
    expect(res.errors[0]?.code).toBe('NOT_ACTIVE_CHARACTER');
    expect(rng.snapshot().draws).toBe(0);
  });

  it('refuse un attaquant allié différent du personnage actif', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), char('h2', 'p1', 'b'), char('e1', 'p2', 'c')],
    });
    const res = applyCommand(state, { ...attack(), attackerId: 'h2' }, new ScriptedRng([9]));
    expect(res.errors[0]?.code).toBe('NOT_ACTIVE_CHARACTER');
  });

  it('refuse l\'attaque quand une réaction d\'Overwatch est en attente', () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      turn: { ...base.turn, reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' } },
    };
    expect(applyCommand(state, attack(), new ScriptedRng([9])).errors[0]?.code).toBe('REACTION_PENDING');
  });
});

describe('ATTACK : attaque d\'opportunité d\'un Overwatch adverse', () => {
  const watched = () =>
    makeState({
      characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { overwatch: true, activated: true }), char('e2', 'p2', 'd')],
    });

  it('une attaque tentée sous le regard d\'un Overwatch adverse ouvre la réaction AVANT d\'être exécutée', () => {
    const rng = new ScriptedRng([]);
    const res = applyCommand(watched(), attack('pistol', 'e2'), rng);
    expect(res.accepted).toBe(true);
    expect(types(res.events)).toEqual(['OVERWATCH_TRIGGERED']);
    expect(res.events[0]).toMatchObject({ overwatcherId: 'e1', targetId: 'h1', announced: 'ATTACK' });
    expect(res.state.turn.reaction?.resume).toEqual(attack('pistol', 'e2'));
    expect(res.state.turn.actionUsed).toBe(false);
    expect(rng.snapshot().draws).toBe(0);
    expect(hp(res.state, 'e2').health).toBe(3);
  });

  it('une attaque invalide n\'ouvre aucune réaction (refus habituel, aucun tirage)', () => {
    const rng = new ScriptedRng([]);
    const state = watched();
    const res = applyCommand(state, attack('knife', 'e2'), rng);
    expect(res.accepted).toBe(false);
    expect(res.errors[0]?.code).toBe('NOT_ADJACENT');
    expect(res.state).toBe(state);
    expect(rng.snapshot().draws).toBe(0);
  });

  it('Overwatch allié ou absent : l\'attaque s\'exécute directement', () => {
    const noOverwatch = makeState();
    expect(types(applyCommand(noOverwatch, attack(), new ScriptedRng(MISS4)).events)[0]).toBe('ATTACK_DECLARED');
    const ally = makeState({ characters: [char('h1', 'p1', 'a'), char('h2', 'p1', 'b', { overwatch: true, activated: true }), char('e1', 'p2', 'c')] });
    expect(types(applyCommand(ally, attack(), new ScriptedRng(MISS4)).events)[0]).toBe('ATTACK_DECLARED');
  });
});

describe('ATTACK : mort et victoire', () => {
  it('la dernière santé perdue tue la cible (CHARACTER_DEFEATED) sans victoire s\'il reste des ennemis', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 1 }), char('e2', 'p2', 'd')],
    });
    const res = applyCommand(state, attack(), new ScriptedRng([9, 9, 9, 9, ...MISS4]));
    expect(hp(res.state, 'e1')).toMatchObject({ alive: false, health: 0 });
    expect(types(res.events)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'CHARACTER_DEFEATED',
    ]);
    expect(res.state.phase).toBe('ACTIVATION');
    expect(() => currentStats(hp(res.state, 'e1'))).not.toThrow();
  });

  it('une cible dont toutes les blessures sont parées survit même à 1 de santé', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 1 }), char('e2', 'p2', 'd')],
    });
    const res = applyCommand(state, attack(), new ScriptedRng([9, 1, 1, 1, 10, 1, 1, 1]));
    expect(hp(res.state, 'e1')).toMatchObject({ alive: true, health: 1 });
    expect(types(res.events)).not.toContain('CHARACTER_DEFEATED');
  });

  it('un personnage mort ne peut pas être ciblé ni agir', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 0, alive: false }), char('e2', 'p2', 'd')],
    });
    expect(applyCommand(state, attack(), new ScriptedRng([9])).errors[0]?.code).toBe('TARGET_DEAD');
    const dead = makeState({ characters: [char('h1', 'p1', 'a', { health: 0, alive: false }), char('e1', 'p2', 'c')] });
    expect(applyCommand(dead, attack(), new ScriptedRng([9])).errors[0]?.code).toBe('ATTACKER_DEAD');
  });

  it('élimination du dernier personnage adverse : VICTORY, victory renseigné, phase FINISHED', () => {
    const state = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 1 })] });
    const res = applyCommand(state, attack(), new ScriptedRng([9, 9, 9, 9, ...MISS4]));
    expect(res.events.at(-1)).toEqual({ type: 'VICTORY', winnerId: 'p1', reason: 'DEATHMATCH_ELIMINATION' });
    expect(res.state.victory).toEqual({ winnerId: 'p1', reason: 'DEATHMATCH_ELIMINATION' });
    expect(res.state.phase).toBe('FINISHED');
    expect(applyCommand(res.state, attack(), new ScriptedRng([9])).errors[0]?.code).toBe('GAME_FINISHED');
  });

  it('deathmatchWinner : null tant que deux camps ont des survivants', () => {
    expect(deathmatchWinner(makeState())).toBeNull();
  });
});

describe('ATTACK : validation', () => {
  const code = (s: GameState, cmd: Parameters<typeof applyCommand>[1]) =>
    applyCommand(s, cmd, new ScriptedRng([9, 9, 9, 9, 9, 9, 9, 9])).errors[0]?.code;

  it('refuse hors phase d\'activation, hors tour, personnage étranger', () => {
    expect(code({ ...makeState(), phase: 'SETUP' }, attack())).toBe('NOT_IN_ACTIVATION');
    expect(code({ ...makeState(), turn: { number: 1, initiativePlayerId: 'p2', activePlayerId: 'p2' } }, attack())).toBe('NOT_ACTIVE_PLAYER');
    expect(code(makeState(), { ...attack(), attackerId: 'e1' })).toBe('NOT_OWN_CHARACTER');
  });

  it('refuse attaquant/cible inconnus, cible alliée, arme non possédée', () => {
    expect(code(makeState(), { ...attack(), attackerId: 'zz' })).toBe('UNKNOWN_ATTACKER');
    expect(code(makeState(), { ...attack(), targetId: 'zz' })).toBe('UNKNOWN_TARGET');
    const ally = makeState({ characters: [char('h1', 'p1', 'a'), char('h2', 'p1', 'b'), char('e1', 'p2', 'c')] });
    expect(code(ally, attack('pistol', 'h2'))).toBe('TARGET_NOT_ENEMY');
    expect(code(makeState(), attack('bazooka'))).toBe('WEAPON_NOT_OWNED');
    const unarmed = makeState({ characters: [char('h1', 'p1', 'a', { weapons: undefined }), char('e1', 'p2', 'c')] });
    expect(code(unarmed, attack())).toBe('WEAPON_NOT_OWNED');
  });

  it("Combat à 0 : l'attaque est lancée avec la difficulté 10", () => {
    const zero = makeState({
      characters: [char('h1', 'p1', 'a', { statRows: [{ combat: 0, physical: 1, mental: 1, movement: 1 }], health: 1 }), char('e1', 'p2', 'c')],
    });
    const res = applyCommand(zero, attack(), new ScriptedRng([9, 9, 9, 9]));
    expect(res.accepted).toBe(true);
    expect(res.events[1]).toMatchObject({ type: 'COMBAT_ROLLED', difficulty: 10, successes: 0 });
  });

  it('une commande refusée renvoie l\'état d\'origine et ne consomme aucun dé', () => {
    const state = makeState();
    const rng = new ScriptedRng([]);
    const res = applyCommand(state, attack('bazooka'), rng);
    expect(res.accepted).toBe(false);
    expect(res.state).toBe(state);
    expect(rng.snapshot().draws).toBe(0);
  });

  it('un ciblage refusé ne consomme pas l\'action', () => {
    const state = makeState();
    const res = applyCommand(state, attack('knife'), new ScriptedRng([9]));
    expect(res.errors[0]?.code).toBe('NOT_ADJACENT');
    expect(res.state.turn.actionUsed).toBe(false);
  });
});

describe('ATTACK : ligne de vue et portée', () => {
  const split = (): BoardState =>
    new BoardBuilder().node('a', ['red']).node('b', ['red']).node('c', ['blue']).edge('a', 'b').edge('b', 'c').build();
  const ok = [9, 9, 9, 9, ...MISS4];

  it('sans couleur commune : pas de ligne de vue', () => {
    const state = makeState({ board: split(), characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c')] });
    expect(applyCommand(state, attack(), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
  });

  it('une porte fermée coupe la ligne de vue ; ouverte, elle la rétablit', () => {
    const mk = (door: 'OPEN' | 'CLOSED') =>
      new BoardBuilder().node('a', ['red']).node('b', ['red']).node('c', ['red']).door('d', door).edge('a', 'b').edge('b', 'c', { doorId: 'd' }).build();
    const chars = [char('h1', 'p1', 'a'), char('e1', 'p2', 'c')];
    expect(applyCommand(makeState({ board: mk('CLOSED'), characters: chars }), attack(), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
    expect(applyCommand(makeState({ board: mk('OPEN'), characters: chars }), attack(), new ScriptedRng(ok)).accepted).toBe(true);
  });

  it('la fumée coupe la ligne de vue (nœud intermédiaire ou cible)', () => {
    const base = makeState();
    const smoked = (origin: string): GameState => ({
      ...base,
      effects: [{ id: 'fx', type: 'SMOKE', origin, remainingTurns: 2 }],
    });
    expect(applyCommand(smoked('b'), attack(), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
    expect(applyCommand(smoked('c'), attack(), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
    expect(applyCommand(smoked('d'), attack(), new ScriptedRng(ok)).accepted).toBe(true);
  });

  it('portée maximale de l\'arme (en pas)', () => {
    const short: WeaponDefinition = { id: 'derringer', kind: 'PISTOL', dice: 4, maxRange: 1 };
    const state = makeState({ characters: [char('h1', 'p1', 'a', { weapons: [short] }), char('e1', 'p2', 'c')] });
    expect(applyCommand(state, attack('derringer'), new ScriptedRng([9])).errors[0]?.code).toBe('OUT_OF_RANGE');
    const near = makeState({ characters: [char('h1', 'p1', 'a', { weapons: [short] }), char('e1', 'p2', 'b')] });
    expect(applyCommand(near, attack('derringer', 'e1'), new ScriptedRng(ok)).accepted).toBe(true);
  });

  it('corps à corps : exige une arête entre les nœuds', () => {
    const far = makeState();
    expect(applyCommand(far, attack('knife'), new ScriptedRng([9])).errors[0]?.code).toBe('NOT_ADJACENT');
    const adj = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    const res = applyCommand(adj, attack('knife', 'e1'), new ScriptedRng([9, 9, ...MISS4]));
    expect(res.accepted).toBe(true);
    expect(hp(res.state, 'e1').health).toBe(1);
  });

  it('corps à corps : porte fermée sur l\'arête et couleurs différentes (pas de LdM) n\'empêchent pas l\'attaque', () => {
    const board = new BoardBuilder().node('a', ['red']).node('b', ['blue']).door('d', 'CLOSED').edge('a', 'b', { doorId: 'd' }).build();
    const state = makeState({ board, characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    expect(applyCommand(state, attack('knife', 'e1'), new ScriptedRng([9, 9, ...MISS4])).accepted).toBe(true);
    expect(applyCommand(state, attack('pistol', 'e1'), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
  });

  it('corps à corps : une arête à sens unique compte dans les deux sens', () => {
    const board = new BoardBuilder().node('a', ['red']).node('b', ['blue']).edge('b', 'a', { oneWay: true }).build();
    // Arête b -> a : l'attaquant en a (extrémité d'arrivée) et celui en b (départ) peuvent frapper.
    const fromHead = makeState({ board, characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    expect(applyCommand(fromHead, attack('knife', 'e1'), new ScriptedRng([9, 9, ...MISS4])).accepted).toBe(true);
    const fromTail = makeState({ board, characters: [char('h1', 'p1', 'b'), char('e1', 'p2', 'a')] });
    expect(applyCommand(fromTail, attack('knife', 'e1'), new ScriptedRng([9, 9, ...MISS4])).accepted).toBe(true);
  });

  it('corps à corps : une défense complète fonctionne aussi (ATTACK_MISSED si tout est paré)', () => {
    const adj = makeState({ characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    const res = applyCommand(adj, attack('knife', 'e1'), new ScriptedRng([10, 1, 10, 1, 1, 1]));
    expect(types(res.events)).toEqual(['ATTACK_DECLARED', 'COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_MISSED']);
  });
});

describe('ATTACK : invariants', () => {
  it('ne mute jamais l\'état d\'entrée (état gelé)', () => {
    const state = deepFreeze(makeState());
    expect(() => applyCommand(state, attack(), new ScriptedRng([9, 9, 9, 9, ...MISS4]))).not.toThrow();
    expect(hp(state, 'e1').health).toBe(3);
    expect(state.turn.actionUsed).toBe(false);
  });

  it('est déterministe : même seed, même état et mêmes événements', () => {
    const run = () => applyCommand(makeState(), attack(), new SeededRng(2024));
    expect(run()).toEqual(run());
  });

  it('l\'état reste sérialisable en JSON sans perte', () => {
    const res = applyCommand(makeState(), attack(), new SeededRng(5));
    expect(JSON.parse(JSON.stringify(res.state))).toEqual(res.state);
  });

  it('propriété : santé jamais NaN ni négative sur de nombreuses seeds et séries d\'attaques', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = new SeededRng(seed);
      let state = makeState();
      for (let i = 0; i < 12 && state.phase !== 'FINISHED'; i += 1) {
        const target = state.characters.find((c) => c.playerId === 'p2' && c.alive);
        if (!target) break;
        // Une attaque = l'action de l'activation : on la rend de nouveau disponible pour la série.
        state = { ...state, turn: { ...state.turn, actionUsed: false } };
        const res = applyCommand(state, { ...attack('pistol', target.id) }, rng);
        if (res.accepted) state = res.state;
        for (const c of state.characters) {
          expect(Number.isNaN(c.health)).toBe(false);
          expect(c.health).toBeGreaterThanOrEqual(0);
          expect(c.alive).toBe(c.health > 0);
          expect(() => currentStats(c)).not.toThrow();
        }
      }
    }
  });
});
