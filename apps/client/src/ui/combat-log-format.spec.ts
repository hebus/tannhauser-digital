// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ScriptedRng, SeededRng, applyCommand, createInitialState, type CharacterState, type GameEvent, type GameState } from '@tannhauser/core';
import { BoardBuilder } from '@tannhauser/core';
import { buildLogEntries, formatEvent, refusalEntry } from './combat-log-format';
import { createLabeler } from './labels';
import { setLocale, t } from './i18n';

const pistol = { id: 'weapon.pistol', kind: 'PISTOL', dice: 4 } as const;
const rows = [{ combat: 7, physical: 5, mental: 5, movement: 4 }];

function char(id: string, definitionId: string, playerId: string, nodeId: string): CharacterState {
  return { id, definitionId, playerId, nodeId, health: 1, statRows: rows, alive: true, weapons: [pistol], activated: false, movementLeft: 4 };
}

function setup(): GameState {
  const board = new BoardBuilder().node('a', ['r']).node('b', ['r']).edge('a', 'b').build();
  const base = createInitialState({
    gameId: 'g',
    scenarioId: 's',
    board,
    players: [
      { id: 'p1', factionId: 'x', commandPoints: 0 },
      { id: 'p2', factionId: 'y', commandPoints: 0 },
    ],
    characters: [char('char.alpha.hero', 'char.alpha.hero', 'p1', 'a'), char('char.beta.hero', 'char.beta.hero', 'p2', 'b'), char('char.beta.troop', 'char.beta.troop', 'p2', 'b')],
    rng: new SeededRng(1).snapshot(),
  });
  return { ...base, phase: 'ACTIVATION', turn: { number: 1, initiativePlayerId: 'p1', activePlayerId: 'p1', activeCharacterId: 'char.alpha.hero', actionUsed: false } };
}

setLocale('fr');
const state = setup();
const labels = createLabeler(state);

describe('labels', () => {
  it('traduit personnages, armes et joueurs, et remplace les ids dans les textes du moteur', () => {
    expect(labels.character('char.alpha.hero')).toBe('Eva Krämer');
    expect(labels.weapon('weapon.pistol')).toBe('Pistolet');
    expect(labels.player('p2')).toBe('Joueur 2');
    expect(labels.humanize('char.alpha.hero attaque char.beta.hero avec weapon.pistol.')).toBe('Eva Krämer attaque John MacNeal avec Pistolet.');
  });

  it('précise le joueur quand deux personnages portent le même nom', () => {
    const dup = createLabeler({ players: state.players, characters: [char('x#p1', 'char.alpha.hero', 'p1', 'a'), char('x#p2', 'char.alpha.hero', 'p2', 'b')] });
    expect(dup.character('x#p1')).toBe('Eva Krämer (Joueur 1)');
    expect(dup.character('x#p2')).toBe('Eva Krämer (Joueur 2)');
  });

  it('numérote plusieurs troupes du même type dans une équipe', () => {
    const many = createLabeler({
      players: state.players,
      characters: [char('t#p1-1', 'char.alpha.troop', 'p1', 'a'), char('t#p1-2', 'char.alpha.troop', 'p1', 'a'), char('h', 'char.alpha.hero', 'p1', 'a')],
    });
    expect(many.character('t#p1-1')).toBe('Stosstruppen 1');
    expect(many.character('t#p1-2')).toBe('Stosstruppen 2');
    expect(many.character('h')).toBe('Eva Krämer');
  });
});

describe('journal de combat', () => {
  // Attaque réelle du moteur : combat 7 (difficulté 3), pistolet 4 dés ; jets scriptés → 4 succès non parés ou parés selon le script.
  function attackEvents(script: number[]): { events: readonly GameEvent[] } {
    const res = applyCommand(state, { type: 'ATTACK', playerId: 'p1', attackerId: 'char.alpha.hero', targetId: 'char.beta.hero', weaponId: 'weapon.pistol' }, new ScriptedRng(script));
    expect(res.accepted).toBe(true);
    return { events: res.events };
  }

  it('un échange devient UNE entrée détaillée avec les lignes d\'explainCombat', () => {
    const { events } = attackEvents([8, 8, 1, 1, 1, 1, 1, 1]); // 2 succès, défense ratée → 1 santé : hors de combat
    const entries = buildLogEntries(events, labels);
    const combat = entries.filter((e) => e.kind === 'combat');
    expect(combat).toHaveLength(1);
    const lines = combat[0]!.lines.join('\n');
    expect(lines).toContain('Réserve : 4 (arme)');
    expect(lines).toContain('Difficulté : 10 − Combat 7 = 3');
    expect(lines).toContain('Dé 1 : 8');
    expect(lines).toContain('Eva Krämer attaque John MacNeal avec Pistolet.');
    expect(lines).toContain('Dégâts');
    expect(combat[0]!.text).toContain('Eva Krämer attaque John MacNeal (Pistolet)');
  });

  it('ne duplique pas les événements de l\'échange en lignes séparées', () => {
    const { events } = attackEvents([8, 8, 8, 8, 10, 10, 10, 10]);
    const entries = buildLogEntries(events, labels);
    const texts = entries.map((e) => e.text);
    expect(texts.filter((x) => x.includes('Touché') || x.includes('Défense :') || x.includes('Attaque : dés'))).toEqual([]);
  });

  it("les effets d'équipement appliqués deviennent des pastilles à pictogramme, avec une ligne de détail", () => {
    const withEffect = (equipment: CharacterState['equipment']): GameState => ({ ...state, characters: state.characters.map((c) => (c.id === 'char.alpha.hero' ? { ...c, equipment } : c)) });
    const critical = [{ id: 'ability.critical-hit', traits: ['ability'], effects: [{ type: 'CRITICAL_HIT' as const }] }];
    const res = applyCommand(withEffect(critical), { type: 'ATTACK', playerId: 'p1', attackerId: 'char.alpha.hero', targetId: 'char.beta.hero', weaponId: 'weapon.pistol' }, new ScriptedRng([10, 1, 1, 1, 1, 1, 1, 1]));
    const [entry] = buildLogEntries(res.events, createLabeler(withEffect(critical))).filter((e) => e.kind === 'combat');
    expect(entry!.effects).toEqual([{ icon: '✸', label: 'Coup critique' }]);
    expect(entry!.lines.join('\n')).toContain('✸ Effet Coup critique (attaque) : Eva Krämer.');
  });

  it("sans effet appliqué, l'entrée n'a pas de pastille", () => {
    const { events } = attackEvents([8, 1, 1, 1, 1, 1, 1, 1]);
    expect(buildLogEntries(events, labels).find((e) => e.kind === 'combat')!.effects).toBeUndefined();
  });

  it("la défausse d'un jeton et les PC gagnés sont journalisés, avec le pictogramme de l'effet", () => {
    const used = formatEvent({ type: 'EQUIPMENT_USED', characterId: 'char.alpha.hero', equipmentId: 'medal.iron-cross-1st-class', effect: 'GAIN_COMMAND_POINTS' }, labels);
    expect(used?.text).toBe('Eva Krämer défausse Iron Cross 1st Class.');
    expect(used?.effects).toEqual([{ icon: '✪', label: 'PC gagnés' }]);
    expect(formatEvent({ type: 'COMMAND_POINTS_GAINED', playerId: 'p1', amount: 2, total: 3 }, labels)?.text).toBe('Joueur 1 gagne 2 PC (3 en réserve).');
  });

  it('un tir raté est signalé comme tel', () => {
    const { events } = attackEvents([1, 1, 1, 1]);
    const [entry] = buildLogEntries(events, labels).filter((e) => e.kind === 'combat');
    expect(entry!.tone).toBe('miss');
    expect(entry!.text).toContain('aucun dégât');
  });

  it('un personnage mis hors de combat produit une ligne dédiée', () => {
    const { events } = attackEvents([8, 8, 8, 8, 1, 1, 1, 1]);
    const entries = buildLogEntries(events, labels);
    expect(entries.some((e) => e.tone === 'kill' && e.text.includes('John MacNeal'))).toBe(true);
  });

  it('événements non-combat : une ligne chacun, bruit omis', () => {
    const forced = formatEvent(
      { type: 'FORCE_PASSAGE_RESOLVED', characterId: 'char.alpha.hero', enemyId: 'char.alpha.hero', nodeId: 'c', dice: [10, 3, 4, 1], difficulty: 7, successes: 1, defenderDice: [2, 2, 2, 2], defenderDifficulty: 7, defenderSuccesses: 0, success: true },
      labels,
    );
    expect(forced?.text).toContain('force le passage');
    expect(forced?.lines.at(-1)).toBe('Succès restants : 1 (au moins 1 requis pour passer).');
    expect(formatEvent({ type: 'CHARACTER_MOVED', characterId: 'char.alpha.hero', path: ['a', 'b'], cost: 1 }, labels)?.text).toBe('Eva Krämer se déplace (1 PM) vers b.');
    expect(formatEvent({ type: 'TURN_STARTED', turn: 3 }, labels)).toMatchObject({ kind: 'turn', text: 'Tour 3.' });
    expect(formatEvent({ type: 'OVERWATCH_RESOLVED', overwatcherId: 'char.beta.hero', fired: false }, labels)?.text).toBe('John MacNeal renonce à tirer.');
    expect(formatEvent({ type: 'OVERWATCH_PASSED', playerId: 'p2' }, labels)?.text).toContain('passe');
    expect(formatEvent({ type: 'OVERWATCH_PHASE_ENDED' }, labels)?.text).toBe('Phase Overwatch terminée : les activations commencent.');
    expect(formatEvent({ type: 'COMMAND_POINTS_REFRESHED', playerId: 'p1', amount: 2 }, labels)).toBeNull();
    expect(formatEvent({ type: 'VICTORY', winnerId: 'p1', reason: 'x' }, labels)).toMatchObject({ tone: 'victory', text: 'Victoire de Joueur 1 !' });
  });

  it('événements de drapeau : une ligne lisible (propriétaire retrouvé dans l’état)', () => {
    const withFlags = createLabeler({ ...state, flags: [{ id: 'f2', ownerId: 'p2', location: { kind: 'NODE', nodeId: 'b' } }] });
    expect(formatEvent({ type: 'FLAG_PLACED', flagId: 'f2', ownerId: 'p2', nodeId: 'b' }, withFlags)?.text).toBe('Drapeau de Joueur 2 posé en b.');
    expect(formatEvent({ type: 'FLAG_CAPTURED', flagId: 'f2', characterId: 'char.alpha.hero', nodeId: 'b' }, withFlags)?.text).toBe('Eva Krämer récupère le drapeau de Joueur 2 (b).');
    expect(formatEvent({ type: 'FLAG_DROPPED', flagId: 'f2', characterId: 'char.alpha.hero', nodeId: 'a' }, withFlags)?.text).toBe('Eva Krämer laisse tomber le drapeau de Joueur 2 en a.');
    expect(formatEvent({ type: 'FLAG_PLANTED', flagId: 'f2', characterId: 'char.alpha.hero', playerId: 'p1', nodeId: 'a' }, withFlags)?.text).toBe('Eva Krämer plante le drapeau de Joueur 2 dans le camp de Joueur 1 (a).');
    // Drapeau inconnu de l'état : on affiche son id plutôt que rien.
    expect(formatEvent({ type: 'FLAG_CAPTURED', flagId: 'zz', characterId: 'char.alpha.hero', nodeId: 'b' }, labels)?.text).toContain('zz');
  });

  it('les événements de drapeau ont leur texte en anglais, et la raison de victoire par drapeaux est traduite', () => {
    expect(t('log.event.FLAG_PLANTED', { character: 'A', owner: 'B', player: 'C', node: 'n' }, 'en')).toBe('A plants B’s flag in C’s camp (n).');
    expect(t('end.reason.CTF_FLAGS_PLANTED')).not.toBe('end.reason.CTF_FLAGS_PLANTED');
    expect(t('end.reason.CTF_FLAGS_PLANTED', undefined, 'en')).toMatch(/flags/);
  });

  it('un refus du moteur est une entrée visible', () => {
    expect(refusalEntry('Impossible : aucun ennemi à portée.')).toMatchObject({ kind: 'refusal', text: '✖ Impossible : aucun ennemi à portée.' });
  });

  it('les textes passent par i18n : repli français puis clé', () => {
    expect(t('status.turn', { n: 2 }, 'en')).toBe('Turn 2');
    expect(t('setup.preset.2v2', undefined, 'en')).toBe('Équipes 2 contre 2'); // absent en anglais → français
    expect(t('cle.inexistante')).toBe('cle.inexistante');
  });
});
