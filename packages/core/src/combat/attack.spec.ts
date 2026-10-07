import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import type { BoardState } from '../board/types';
import { applyCommand } from '../engine/apply-command';
import '../engine/start-game';
import { ScriptedRng, SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import { currentStats, type CharacterState, type GameState } from '../state/types';
import { deathmatchWinner } from '../victory/deathmatch';
import './attack';
import { explainCombat } from './log';
import type { WeaponDefinition } from './weapons';

const pistol: WeaponDefinition = { id: 'pistol', kind: 'PISTOL', dice: 4 };
const knife: WeaponDefinition = { id: 'knife', kind: 'CAC', dice: 2 };

/** Combat 7 → difficulté 3 ; chute du Combat avec les blessures. */
const rows = [
  { combat: 7, physical: 5, mental: 5, movement: 4 },
  { combat: 5, physical: 5, mental: 5, movement: 4 },
  { combat: 3, physical: 4, mental: 4, movement: 3 },
];

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

function makeState(opts: { board?: BoardState; characters?: CharacterState[] } = {}): GameState {
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
  return { ...base, phase: 'ACTIVATION', turn: { number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1' } };
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

describe('ATTACK : résolution', () => {
  it('attaque réussie : 1 blessure, ligne de stats active mise à jour, événements ordonnés', () => {
    const res = applyCommand(makeState(), attack(), new ScriptedRng([2, 2, 5, 2]));
    expect(res.accepted).toBe(true);
    expect(res.events.map((e) => e.type)).toEqual([
      'ATTACK_DECLARED',
      'COMBAT_ROLLED',
      'ATTACK_HIT',
      'DAMAGE_APPLIED',
    ]);
    expect(hp(res.state, 'e1').health).toBe(2);
    expect(currentStats(hp(res.state, 'e1')).combat).toBe(5);
    expect(res.events[3]).toMatchObject({ wounds: 1, healthLeft: 2 });
    expect(res.state.history).toEqual(res.events);
  });

  it('jet minimum (tous les dés à 1) : manqué, aucune blessure, état inchangé hors historique', () => {
    const state = makeState();
    const res = applyCommand(state, attack(), new ScriptedRng([1, 1, 1, 1]));
    expect(res.accepted).toBe(true);
    expect(res.events.map((e) => e.type)).toEqual(['ATTACK_DECLARED', 'COMBAT_ROLLED', 'ATTACK_MISSED']);
    expect(res.state.characters).toBe(state.characters);
  });

  it('jet maximum : touché une seule fois (1 blessure par attaque réussie, quel que soit le nombre de succès)', () => {
    const res = applyCommand(makeState(), attack(), new ScriptedRng([10, 10, 10, 10]));
    expect(hp(res.state, 'e1').health).toBe(2);
    expect(res.events[1]).toMatchObject({ successes: 4 });
  });

  it('un 10 naturel touche malgré une difficulté inatteignable ; un 1 naturel ne touche jamais', () => {
    const weak = makeState({
      characters: [char('h1', 'p1', 'a', { health: 1, statRows: [{ combat: 1, physical: 1, mental: 1, movement: 1 }] }), char('e1', 'p2', 'c')],
    });
    const hit = applyCommand(weak, attack(), new ScriptedRng([9, 9, 9, 10]));
    expect(hit.events.map((e) => e.type)).toContain('ATTACK_HIT');
    const miss = applyCommand(makeState(), attack(), new ScriptedRng([1, 1, 1, 1]));
    expect(miss.events.map((e) => e.type)).toContain('ATTACK_MISSED');
  });

  it('les dés viennent des données de l\'arme (pas de constante) : 2 dés pour un couteau, 6 pour une arme custom', () => {
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
    // Combat 3 → difficulté 7 : un 6 échoue, alors qu'à Combat 7 (difficulté 3) il réussit.
    const res = applyCommand(wounded, attack(), new ScriptedRng([6, 6, 6, 6]));
    expect(res.events[1]).toMatchObject({ successes: 0, difficulty: 7 });
    const healthy = applyCommand(makeState(), attack(), new ScriptedRng([6, 6, 6, 6]));
    expect(healthy.events[1]).toMatchObject({ successes: 4, difficulty: 3 });
  });

  it('succès automatiques de l\'arme et dés/bonus d\'arme', () => {
    const w: WeaponDefinition = { id: 'ace', kind: 'PISTOL', dice: 2, autoSuccesses: 1, extraDice: 1, resultModifier: 4 };
    const state = makeState({ characters: [char('h1', 'p1', 'a', { weapons: [w] }), char('e1', 'p2', 'c')] });
    // 3 dés ; difficulté 3 ; 2+4 = 6 ≥ 3 → succès sur 2, 1 naturel échoue → 2 tirés + 1 auto.
    const res = applyCommand(state, attack('ace'), new ScriptedRng([2, 1, 5]));
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
    const res = applyCommand(makeState(), attack(), new ScriptedRng([1, 5, 10, 2]));
    const ev = res.events[1];
    if (ev?.type !== 'COMBAT_ROLLED' || !ev.log) throw new Error('journal manquant');
    expect(ev.log).toMatchObject({
      basePool: 4,
      poolSize: 4,
      difficulty: 3,
      rolledSuccesses: 2,
      successes: 2,
      hit: true,
      wounds: 1,
      healthBefore: 3,
      healthAfter: 2,
      defense: null,
    });
    expect(explainCombat(ev.log)[0]).toBe('h1 attaque e1 avec pistol.');
  });
});

describe('ATTACK : mort et victoire', () => {
  it('la dernière santé perdue tue la cible (CHARACTER_DEFEATED) sans victoire s\'il reste des ennemis', () => {
    const state = makeState({
      characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c', { health: 1 }), char('e2', 'p2', 'd')],
    });
    const res = applyCommand(state, attack(), new ScriptedRng([9, 9, 9, 9]));
    expect(hp(res.state, 'e1')).toMatchObject({ alive: false, health: 0 });
    expect(res.events.map((e) => e.type)).toEqual([
      'ATTACK_DECLARED', 'COMBAT_ROLLED', 'ATTACK_HIT', 'DAMAGE_APPLIED', 'CHARACTER_DEFEATED',
    ]);
    expect(res.state.phase).toBe('ACTIVATION');
    expect(() => currentStats(hp(res.state, 'e1'))).not.toThrow();
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
    const res = applyCommand(state, attack(), new ScriptedRng([9, 9, 9, 9]));
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
  const code = (s: GameState, cmd: Parameters<typeof applyCommand>[1]) => applyCommand(s, cmd, new ScriptedRng([9, 9, 9, 9])).errors[0]?.code;

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

  it('Combat à 0 : attaque impossible (§65.2)', () => {
    const zero = makeState({
      characters: [char('h1', 'p1', 'a', { statRows: [{ combat: 0, physical: 1, mental: 1, movement: 1 }], health: 1 }), char('e1', 'p2', 'c')],
    });
    expect(code(zero, attack())).toBe('CHARACTERISTIC_ZERO');
  });

  it('une commande refusée renvoie l\'état d\'origine et ne consomme aucun dé', () => {
    const state = makeState();
    const rng = new ScriptedRng([]);
    const res = applyCommand(state, attack('bazooka'), rng);
    expect(res.accepted).toBe(false);
    expect(res.state).toBe(state);
    expect(rng.snapshot().draws).toBe(0);
  });
});

describe('ATTACK : ligne de vue et portée', () => {
  const split = (): BoardState =>
    new BoardBuilder().node('a', ['red']).node('b', ['red']).node('c', ['blue']).edge('a', 'b').edge('b', 'c').build();

  it('sans couleur commune : pas de ligne de vue', () => {
    const state = makeState({ board: split(), characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'c')] });
    expect(applyCommand(state, attack(), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
  });

  it('une porte fermée coupe la ligne de vue ; ouverte, elle la rétablit', () => {
    const mk = (door: 'OPEN' | 'CLOSED') =>
      new BoardBuilder().node('a', ['red']).node('b', ['red']).node('c', ['red']).door('d', door).edge('a', 'b').edge('b', 'c', { doorId: 'd' }).build();
    const chars = [char('h1', 'p1', 'a'), char('e1', 'p2', 'c')];
    expect(applyCommand(makeState({ board: mk('CLOSED'), characters: chars }), attack(), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
    expect(applyCommand(makeState({ board: mk('OPEN'), characters: chars }), attack(), new ScriptedRng([9, 9, 9, 9])).accepted).toBe(true);
  });

  it('la fumée coupe la ligne de vue (nœud intermédiaire ou cible)', () => {
    const base = makeState();
    const smoked = (origin: string): GameState => ({
      ...base,
      effects: [{ id: 'fx', type: 'SMOKE', origin, remainingTurns: 2 }],
    });
    expect(applyCommand(smoked('b'), attack(), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
    expect(applyCommand(smoked('c'), attack(), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
    expect(applyCommand(smoked('d'), attack(), new ScriptedRng([9, 9, 9, 9])).accepted).toBe(true);
  });

  it('portée maximale de l\'arme (en pas)', () => {
    const short: WeaponDefinition = { id: 'derringer', kind: 'PISTOL', dice: 4, maxRange: 1 };
    const state = makeState({ characters: [char('h1', 'p1', 'a', { weapons: [short] }), char('e1', 'p2', 'c')] });
    expect(applyCommand(state, attack('derringer'), new ScriptedRng([9])).errors[0]?.code).toBe('OUT_OF_RANGE');
    const near = makeState({ characters: [char('h1', 'p1', 'a', { weapons: [short] }), char('e1', 'p2', 'b')] });
    expect(applyCommand(near, attack('derringer', 'e1'), new ScriptedRng([9, 9, 9, 9])).accepted).toBe(true);
  });

  it('corps à corps : exige l\'adjacence, indépendante de la LdM (porte fermée entre les deux)', () => {
    const far = makeState();
    expect(applyCommand(far, attack('knife'), new ScriptedRng([9])).errors[0]?.code).toBe('NOT_ADJACENT');
    const board = new BoardBuilder().node('a', ['red']).node('b', ['blue']).door('d', 'CLOSED').edge('a', 'b', { doorId: 'd' }).build();
    const state = makeState({ board, characters: [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')] });
    expect(applyCommand(state, attack('knife', 'e1'), new ScriptedRng([9, 9])).accepted).toBe(true);
    expect(applyCommand(state, attack('pistol', 'e1'), new ScriptedRng([9])).errors[0]?.code).toBe('NO_LINE_OF_SIGHT');
  });
});

describe('ATTACK : invariants', () => {
  it('ne mute jamais l\'état d\'entrée (état gelé)', () => {
    const state = deepFreeze(makeState());
    expect(() => applyCommand(state, attack(), new ScriptedRng([9, 9, 9, 9]))).not.toThrow();
    expect(hp(state, 'e1').health).toBe(3);
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
        const res = applyCommand(state, { ...attack('pistol', target.id) }, rng);
        // Cibles hors LdM possibles (e2 derrière e1 : visibles ici) ; refus toléré.
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
