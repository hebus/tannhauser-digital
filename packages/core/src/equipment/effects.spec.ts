import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import { explainCombat, type CombatLog } from '../combat/log';
import type { WeaponDefinition } from '../combat/weapons';
import { applyCommand } from '../engine/apply-command';
import '../engine/start-game';
import '../overwatch/handlers';
import '../turn/handlers';
import '../combat/attack';
import { ScriptedRng, SeededRng } from '../rng/rng';
import { createInitialState } from '../state/initial-state';
import { currentStats, type CharacterState, type GameState } from '../state/types';
import type { EquipmentEffect, EquipmentItem } from './effects';

const pistol: WeaponDefinition = { id: 'pistol', kind: 'PISTOL', dice: 4 };
const knife: WeaponDefinition = { id: 'knife', kind: 'CAC', dice: 2 };

/** Combat 7 → difficulté d'attaque 3 ; Physique 5 → difficulté de défense 5 ; blessé (santé 1) : Combat 3, Physique 4. */
const rows = [
  { combat: 7, physical: 5, mental: 5, movement: 4 },
  { combat: 5, physical: 5, mental: 5, movement: 4 },
  { combat: 3, physical: 4, mental: 4, movement: 3 },
];

const item = (id: string, ...effects: EquipmentEffect[]): EquipmentItem => ({ id, traits: ['ability'], effects });

function char(id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}): CharacterState {
  return { id, definitionId: id, playerId, nodeId, health: 3, statRows: rows, alive: true, weapons: [pistol, knife], activated: false, movementLeft: 0, ...extra };
}

function makeState(attacker: Partial<CharacterState> = {}, target: Partial<CharacterState> = {}): GameState {
  const board = new BoardBuilder().node('a', ['red']).node('b', ['red']).edge('a', 'b').build();
  const base = createInitialState({
    gameId: 'g',
    scenarioId: 'dev',
    board,
    players: [
      { id: 'p1', factionId: 'union', commandPoints: 0 },
      { id: 'p2', factionId: 'reich', commandPoints: 0 },
    ],
    characters: [char('h1', 'p1', 'a', attacker), char('e1', 'p2', 'b', target)],
    rng: new SeededRng(1).snapshot(),
  });
  return { ...base, phase: 'ACTIVATION', turn: { number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1', activeCharacterId: 'h1', actionUsed: false } };
}

/** Attaque de h1 sur e1 avec un script de dés ; renvoie le journal de combat et l'état final. */
function attack(state: GameState, script: number[], weaponId = 'pistol'): { log: CombatLog; state: GameState; left: number } {
  const rng = new ScriptedRng(script);
  const res = applyCommand(state, { type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: 'e1', weaponId }, rng);
  if (!res.accepted) throw new Error(JSON.stringify(res.errors));
  const rolled = res.events.find((e) => e.type === 'COMBAT_ROLLED');
  if (!rolled || rolled.type !== 'COMBAT_ROLLED' || !rolled.log) throw new Error('COMBAT_ROLLED manquant');
  return { log: rolled.log, state: res.state, left: script.length - (rng as unknown as { index: number }).index };
}

describe('Coup critique (CRITICAL_HIT)', () => {
  const critical = item('ability.critical-hit', { type: 'CRITICAL_HIT' });

  it("à l'attaque, un 10 naturel compte pour 2 succès", () => {
    const { log } = attack(makeState({ equipment: [critical] }), [10, 1, 1, 1, 1, 1, 1, 1]);
    expect(log.rolledSuccesses).toBe(2);
    expect(log.successes).toBe(2);
    expect(log.dice[0]).toMatchObject({ natural: 10, success: true, weight: 2 });
    expect(explainCombat(log).join('\n')).toContain('compte pour 2 succès');
  });

  it("sans l'effet, un 10 naturel compte pour 1 succès", () => {
    const { log } = attack(makeState(), [10, 1, 1, 1, 1, 1, 1, 1]);
    expect(log.successes).toBe(1);
    expect(log.dice[0]!.weight).toBeUndefined();
  });

  it('un succès ordinaire (non 10) ne compte pas double', () => {
    const { log } = attack(makeState({ equipment: [critical] }), [5, 1, 1, 1, 1, 1, 1, 1]);
    expect(log.successes).toBe(1);
  });

  it('à la défense, un 10 naturel pare 2 blessures', () => {
    // Attaque : 10, 10, 3, 1 → 3 blessures ; défense avec Coup critique : 10, 1, 1, 1 → 2 parades → 1 dégât.
    const { log } = attack(makeState({}, { equipment: [critical] }), [10, 10, 3, 1, 10, 1, 1, 1]);
    expect(log.defense).toMatchObject({ attackerSuccesses: 3, defenderSuccesses: 2, remaining: 1 });
    expect(log.wounds).toBe(1);
  });
});

describe("Caractéristique la plus haute (BEST_CHARACTERISTIC)", () => {
  const strength = item('ability.supernatural-strength', { type: 'BEST_CHARACTERISTIC', characteristic: 'combat' });
  const immunity = item('ability.immunity-to-pain', { type: 'BEST_CHARACTERISTIC', characteristic: 'physical' });

  it('blessé, garde le Combat le plus haut sans toucher aux autres valeurs', () => {
    expect(currentStats(char('h', 'p1', 'a', { health: 1 }))).toEqual(rows[2]);
    expect(currentStats(char('h', 'p1', 'a', { health: 1, equipment: [strength] }))).toEqual({ ...rows[2]!, combat: 7 });
  });

  it('blessé, garde la Physique la plus haute', () => {
    expect(currentStats(char('h', 'p1', 'a', { health: 1, equipment: [immunity] }))).toEqual({ ...rows[2]!, physical: 5 });
  });

  it('en pleine santé, ne change rien', () => {
    expect(currentStats(char('h', 'p1', 'a', { equipment: [strength, immunity] }))).toEqual(rows[0]);
  });

  it("l'attaque d'un blessé utilise le Combat le plus haut (difficulté 3 au lieu de 7)", () => {
    const wounded = { health: 1 };
    expect(attack(makeState({ ...wounded }), [5, 1, 1, 1, 1, 1, 1, 1]).log.difficulty).toBe(7);
    const strong = attack(makeState({ ...wounded, equipment: [strength] }), [5, 1, 1, 1, 1, 1, 1, 1]);
    expect(strong.log.difficulty).toBe(3);
    expect(strong.log.successes).toBe(1);
  });

  it('la défense d’un blessé utilise la Physique la plus haute (difficulté 5 au lieu de 6)', () => {
    const plain = attack(makeState({}, { health: 1 }), [10, 1, 1, 1, 1, 1, 1, 1]);
    expect(plain.log.defenseRoll!.difficulty).toBe(6);
    const immune = attack(makeState({}, { health: 1, equipment: [immunity] }), [10, 1, 1, 1, 1, 1, 1, 1]);
    expect(immune.log.defenseRoll!.difficulty).toBe(5);
  });
});

describe('Flash-Gun : dés supplémentaires sur un 10 naturel (EXTRA_DICE_ON_NATURAL_10)', () => {
  const flash: WeaponDefinition = { id: 'flash', kind: 'AUTOMATIC', dice: 4, effects: [{ type: 'EXTRA_DICE_ON_NATURAL_10', dice: 2 }] };

  it('avec un 10 naturel, lance 2 dés de plus et les ajoute au jet', () => {
    const state = makeState({ weapons: [flash] });
    // 4 dés : 10, 1, 1, 1 ; 2 dés bonus : 4 (succès), 2 (échec) ; puis défense (1 blessure... ici 2 succès) 1, 1, 1, 1.
    const { log, left } = attack(state, [10, 1, 1, 1, 4, 2, 1, 1, 1, 1], 'flash');
    expect(log.dice).toHaveLength(6);
    expect(log.dice.slice(4).every((d) => d.bonus)).toBe(true);
    expect(log.successes).toBe(2);
    expect(left).toBe(0);
    expect(explainCombat(log).join('\n')).toContain('dé supplémentaire');
  });

  it("sans 10 naturel, aucun dé supplémentaire n'est lancé", () => {
    const state = makeState({ weapons: [flash] });
    const { log } = attack(state, [5, 1, 1, 1, 1, 1, 1, 1], 'flash');
    expect(log.dice).toHaveLength(4);
  });

  it("ne s'enchaîne pas : un 10 sur un dé bonus ne relance pas de dés", () => {
    const state = makeState({ weapons: [flash] });
    const { log } = attack(state, [10, 1, 1, 1, 10, 10, 1, 1, 1, 1], 'flash');
    expect(log.dice).toHaveLength(6);
    expect(log.successes).toBe(3);
  });
});

describe('Combat Infantry Badge : relance des 2 dés les plus bas (REROLL_LOWEST)', () => {
  const badge = item('medal.combat-infantry-badge', { type: 'REROLL_LOWEST', count: 2 });

  it('relance les 2 dés ratés de plus basse valeur, 1 naturels compris', () => {
    // 4 dés : 1, 2, 5, 10 → les deux échecs (1 et 2) sont relancés en 6 et 7 ; défense ensuite.
    const { log } = attack(makeState({ equipment: [badge] }), [1, 2, 5, 10, 6, 7, 1, 1, 1, 1]);
    expect(log.dice.map((d) => d.natural)).toEqual([6, 7, 5, 10]);
    expect(log.dice[0]).toMatchObject({ rerolledFrom: 1 });
    expect(log.dice[1]).toMatchObject({ rerolledFrom: 2 });
    expect(log.successes).toBe(4);
    expect(explainCombat(log).join('\n')).toContain('relancé, avant : 1');
  });

  it("ne relance jamais un dé réussi : s'il n'y a qu'un échec, un seul dé est relancé", () => {
    const { log } = attack(makeState({ equipment: [badge] }), [5, 6, 7, 1, 8, 1, 1, 1, 1]);
    expect(log.dice.map((d) => d.natural)).toEqual([5, 6, 7, 8]);
    expect(log.successes).toBe(4);
  });

  it("ne relance rien quand tous les dés sont réussis", () => {
    const { log } = attack(makeState({ equipment: [badge] }), [5, 6, 7, 8, 1, 1, 1, 1]);
    expect(log.dice.every((d) => d.rerolledFrom === undefined)).toBe(true);
  });

  it("n'agit pas à la défense", () => {
    // Défenseur avec le badge : sa défense n'est pas relancée (script exact, sinon « script épuisé »).
    const { log } = attack(makeState({}, { equipment: [badge] }), [10, 1, 1, 1, 1, 2, 5, 5]);
    expect(log.defenseRoll!.dice.every((d) => d.rerolledFrom === undefined)).toBe(true);
  });

  it('se combine avec le Flash-Gun : la relance précède le test du 10 naturel', () => {
    const flash: WeaponDefinition = { id: 'flash', kind: 'AUTOMATIC', dice: 4, effects: [{ type: 'EXTRA_DICE_ON_NATURAL_10', dice: 2 }] };
    // 1, 1, 5, 5 → deux relances : 10 et 2 ; le 10 obtenu déclenche alors 2 dés bonus (3, 4).
    const { log } = attack(makeState({ weapons: [flash], equipment: [badge] }), [1, 1, 5, 5, 10, 2, 3, 4, 1, 1, 1, 1], 'flash');
    expect(log.dice).toHaveLength(6);
    expect(log.dice.map((d) => d.natural)).toEqual([10, 2, 5, 5, 3, 4]);
  });
});

describe('BA-27 : dé supplémentaire avec une arme précise (EXTRA_DICE_WITH_WEAPON)', () => {
  const ba27 = item('hardware.ba-27', { type: 'EXTRA_DICE_WITH_WEAPON', weaponId: 'pistol', dice: 1 });

  it("ajoute 1 dé à l'attaque avec l'arme visée", () => {
    const { log } = attack(makeState({ equipment: [ba27] }), [5, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(log.dice).toHaveLength(5);
    expect(log.bonusDice).toBe(1);
  });

  it("n'ajoute rien avec une autre arme", () => {
    const { log } = attack(makeState({ equipment: [ba27] }), [5, 1, 1, 1, 1, 1], 'knife');
    expect(log.dice).toHaveLength(2);
  });
});

describe('Journal : effets réellement appliqués (CombatLog.effects)', () => {
  const critical = item('ability.critical-hit', { type: 'CRITICAL_HIT' });
  const badge = item('medal.combat-infantry-badge', { type: 'REROLL_LOWEST', count: 2 });
  const strength = item('ability.supernatural-strength', { type: 'BEST_CHARACTERISTIC', characteristic: 'combat' });

  it('liste un Coup critique seulement quand un 10 naturel a été compté double', () => {
    expect(attack(makeState({ equipment: [critical] }), [10, 1, 1, 1, 1, 1, 1, 1]).log.effects).toEqual([{ type: 'CRITICAL_HIT', side: 'ATTACK', characterId: 'h1' }]);
    expect(attack(makeState({ equipment: [critical] }), [5, 1, 1, 1, 1, 1, 1, 1]).log.effects).toBeUndefined();
  });

  it("liste la relance seulement si un dé a été relancé, et la caractéristique seulement si elle change", () => {
    expect(attack(makeState({ equipment: [badge] }), [5, 6, 7, 8, 1, 1, 1, 1]).log.effects).toBeUndefined();
    expect(attack(makeState({ equipment: [badge] }), [1, 6, 7, 8, 5, 1, 1, 1, 1]).log.effects).toEqual([{ type: 'REROLL_LOWEST', side: 'ATTACK', characterId: 'h1' }]);
    // En pleine santé, la force surnaturelle ne change rien ; blessé, elle joue.
    expect(attack(makeState({ equipment: [strength] }), [5, 1, 1, 1, 1, 1, 1, 1]).log.effects).toBeUndefined();
    expect(attack(makeState({ health: 1, equipment: [strength] }), [5, 1, 1, 1, 1, 1, 1, 1]).log.effects).toEqual([{ type: 'BEST_CHARACTERISTIC', side: 'ATTACK', characterId: 'h1' }]);
  });

  it('attribue au défenseur un Coup critique de défense', () => {
    const { log } = attack(makeState({}, { equipment: [critical] }), [10, 10, 3, 1, 10, 1, 1, 1]);
    expect(log.effects).toEqual([{ type: 'CRITICAL_HIT', side: 'DEFENSE', characterId: 'e1' }]);
  });
});
