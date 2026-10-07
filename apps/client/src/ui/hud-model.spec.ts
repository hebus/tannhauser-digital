// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SeededRng, applyCommand, createInitialState, type CharacterState, type GameState } from '@tannhauser/core';
import { BoardBuilder } from '@tannhauser/core';
import { ACTION_KEYS, MAIN_HANDLED_KEYS, actionRows, announcedText, placementModel, reactionContext, rosterRows, statusModel, visibleActions } from './hud-model';
import { setLocale } from './i18n';
import { describeRefusals, explainIgnoredClick, explainIgnoredKey } from './input-feedback';
import { createLabeler } from './labels';

const pistol = { id: 'weapon.pistol', kind: 'PISTOL', dice: 4 } as const;
const rows = [
  { combat: 7, physical: 5, mental: 5, movement: 4 },
  { combat: 6, physical: 4, mental: 4, movement: 3 },
];

const char = (id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}): CharacterState => ({
  id, definitionId: id, playerId, nodeId, health: 2, statRows: rows, alive: true, weapons: [pistol], activated: false, movementLeft: 4, ...extra,
});

// a(r) - b(r) - c(g) - d(g) : a ne voit pas d.
function game(extra: Partial<GameState['turn']> = {}): GameState {
  const board = new BoardBuilder().node('a', ['r']).node('b', ['r']).node('c', ['g']).node('d', ['g']).edge('a', 'b').edge('b', 'c').edge('c', 'd').build();
  const base = createInitialState({
    gameId: 'g', scenarioId: 's', board,
    players: [{ id: 'p1', factionId: 'x', commandPoints: 2 }, { id: 'p2', factionId: 'y', commandPoints: 2 }],
    characters: [char('h1', 'p1', 'a'), char('h2', 'p1', 'c'), char('e1', 'p2', 'd')],
    rng: new SeededRng(1).snapshot(),
  });
  return { ...base, phase: 'ACTIVATION', turn: { number: 2, initiativePlayerId: 'p1', activePlayerId: 'p1', ...extra } };
}

setLocale('fr');

describe('modèle du HUD', () => {
  it('statut : tour, joueur actif, PC, personnage actif avec santé, stats courantes et PM', () => {
    const s = game({ activeCharacterId: 'h1', actionUsed: true });
    const m = statusModel({ ...s, characters: s.characters.map((c) => (c.id === 'h1' ? { ...c, health: 1, movementLeft: 2 } : c)) }, createLabeler(s));
    expect(m).toMatchObject({ turnNumber: 2, activePlayerName: 'Joueur 1', actionUsed: true, finished: false });
    expect(m.players).toEqual([
      { id: 'p1', name: 'Joueur 1', commandPoints: 2, active: true, initiative: expect.any(Boolean) },
      { id: 'p2', name: 'Joueur 2', commandPoints: 2, active: false, initiative: expect.any(Boolean) },
    ]);
    // Initiative : un seul joueur la porte (le gagnant du tour), hors mise en place et fin de partie.
    const withInit = (id: string | null, phase: 'OVERWATCH' | 'SETUP' | 'FINISHED') => statusModel({ ...s, phase, turn: { ...s.turn, initiativePlayerId: id } }, createLabeler(s)).players.map((p) => p.initiative);
    expect(withInit('p2', 'OVERWATCH')).toEqual([false, true]);
    expect(withInit('p2', 'SETUP')).toEqual([false, false]);
    expect(withInit('p2', 'FINISHED')).toEqual([false, false]);
    expect(withInit(null, 'OVERWATCH')).toEqual([false, false]);
    // Santé 1/2 : la ligne de caractéristiques courante est la dernière (6/4/4).
    expect(m.character).toMatchObject({ health: 1, maxHealth: 2, combat: 6, physical: 4, mental: 4, movementLeft: 2, movementMax: 3 });
  });

  it('actions : boutons dérivés de getLegalActions, raison traduite si indisponible', () => {
    const s = game({ activeCharacterId: 'h1', actionUsed: true });
    const byId = Object.fromEntries(actionRows(s, 'h1').map((r) => [r.id, r]));
    expect(byId.ATTACK).toMatchObject({ available: false, reason: expect.stringContaining('déjà utilisée') });
    expect(byId.OVERWATCH).toMatchObject({ available: false, reason: "Impossible : l'Overwatch se place avant les activations." });
    expect(byId.MOVE).toMatchObject({ available: true, key: 'M' });
    expect(byId.MOVE?.reason).toBeUndefined();
    expect(actionRows(s, 'h1').every((r) => r.available || (r.reason ?? '').length > 0)).toBe(true);
  });

  it('sans ennemi à portée, l\'attaque s\'explique', () => {
    const s = game({ activeCharacterId: 'h1', actionUsed: false });
    expect(actionRows(s, 'h1').find((r) => r.id === 'ATTACK')).toMatchObject({ available: false, reason: 'Impossible : aucun ennemi à portée.' });
  });

  it('liste des personnages activables avec raccourcis 1..n ; un personnage déjà activé est expliqué', () => {
    const s = game();
    const withDone = { ...s, characters: s.characters.map((c) => (c.id === 'h1' ? { ...c, activated: true } : c)) };
    const roster = rosterRows(withDone, createLabeler(withDone));
    expect(roster.map((r) => [r.characterId, r.key, r.available])).toEqual([['h1', '1', false], ['h2', '2', true]]);
    expect(roster[0]?.reason).toMatch(/\S/);
  });

  it('les raccourcis du HUD ne recoupent pas ceux traités par main.ts', () => {
    const hudKeys = Object.values(ACTION_KEYS).map((k) => k!.toLowerCase());
    const own = hudKeys.filter((k) => !MAIN_HANDLED_KEYS.has(k));
    expect(own.sort()).toEqual(['a', 'f', 'g', 'h', 'm', 'u']);
  });
});

describe('Capture du drapeau (HUD)', () => {
  /** h1 (p1, actif) en a ; drapeau ennemi f2 (de p2) au sol en b, voisin de a ; e1 (p2) loin, en d. */
  function ctf(extra: Partial<GameState> = {}): GameState {
    const s = game({ activeCharacterId: 'h1', actionUsed: false });
    return { ...s, mode: 'CAPTURE_THE_FLAG', camps: { p1: ['a'], p2: ['d'] }, flags: [{ id: 'f2', ownerId: 'p2', location: { kind: 'NODE', nodeId: 'b' } }], ...extra };
  }

  it('hors Capture du drapeau : ni lignes d’actions de drapeau, ni compteur de victoire', () => {
    const s = game({ activeCharacterId: 'h1', actionUsed: false });
    expect(actionRows(s, 'h1').map((r) => r.id)).toEqual(['MOVE', 'ATTACK', 'OVERWATCH', 'OPEN_DOOR', 'CLOSE_DOOR', 'END_ACTIVATION', 'PASS']);
    expect(visibleActions(s)).not.toContain('CAPTURE_FLAG');
    expect(statusModel(s, createLabeler(s)).players.every((p) => p.flags === undefined)).toBe(true);
  });

  it('en mode : lignes Récupérer / Planter avec touches G / H, disponibilité et raison issues de getLegalActions', () => {
    const s = ctf();
    const rows = actionRows(s, 'h1');
    expect(rows.map((r) => r.id)).toEqual(['MOVE', 'ATTACK', 'CAPTURE_FLAG', 'PLANT_FLAG', 'OVERWATCH', 'OPEN_DOOR', 'CLOSE_DOOR', 'END_ACTIVATION', 'PASS']);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.CAPTURE_FLAG).toMatchObject({ label: 'Récupérer le drapeau', key: 'G', available: true, flagIds: ['f2'] });
    expect(byId.PLANT_FLAG).toMatchObject({ label: 'Planter le drapeau', key: 'H', available: false, reason: 'Impossible : ce personnage ne porte aucun drapeau.' });
    expect(rows.every((r) => r.available || (r.reason ?? '').length > 0)).toBe(true);
  });

  it('un drapeau planté ou porté se lit dans le compteur : plantés n / 2 par joueur, et drapeaux portés par l’équipe', () => {
    const s = ctf({
      flags: [
        { id: 'f2', ownerId: 'p2', location: { kind: 'PLANTED', playerId: 'p1', nodeId: 'a' } },
        { id: 'g1', ownerId: 'p1', location: { kind: 'CARRIED', characterId: 'e1' } },
      ],
    });
    const players = statusModel(s, createLabeler(s)).players;
    expect(players.map((p) => p.flags)).toEqual([
      { planted: 1, toWin: 2, carried: 0 },
      { planted: 0, toWin: 2, carried: 1 },
    ]);
  });

  it('un drapeau à récupérer apparaît dans plusieurs options quand plusieurs sont utilisables', () => {
    const s = ctf({
      flags: [
        { id: 'f2', ownerId: 'p2', location: { kind: 'NODE', nodeId: 'b' } },
        { id: 'f3', ownerId: 'p2', location: { kind: 'NODE', nodeId: 'a' } },
      ],
    });
    expect(actionRows(s, 'h1').find((r) => r.id === 'CAPTURE_FLAG')?.flagIds).toEqual(['f2', 'f3']);
  });
});

function placement(extra: Partial<GameState> = {}): GameState {
  const base = game();
  return { ...base, phase: 'OVERWATCH', turn: { number: 2, initiativePlayerId: 'p2', activePlayerId: 'p2', overwatchPasses: 0, overwatchDecisions: 0 }, ...extra };
}

describe('phase de placement de l\'Overwatch', () => {
  it('modèle : joueur qui décide, PC, boutons par personnage, passe possible', () => {
    const s = placement();
    const m = placementModel(s, createLabeler(s))!;
    expect(m).toMatchObject({ playerId: 'p2', playerName: 'Joueur 2', commandPoints: 2, cost: 1, passAvailable: true, consecutivePasses: 0 });
    expect(m.rows).toEqual([{ characterId: 'e1', name: 'e1', key: '1', placed: false, available: true, reason: undefined }]);
  });

  it('sans PC : seule la passe reste possible ; la main de l\'autre joueur n\'offre rien tant que ce n\'est pas son tour', () => {
    const broke = placement({ players: game().players.map((p) => ({ ...p, commandPoints: 0 })) });
    const m = placementModel(broke, createLabeler(broke))!;
    expect(m.rows.every((r) => !r.available)).toBe(true);
    expect(m.passAvailable).toBe(true);
    expect(m.passReason).toBeUndefined();
  });

  it('indique qui décide, qui décidera ensuite et le nombre de passes consécutives', () => {
    const s = placement({ turn: { number: 2, initiativePlayerId: 'p2', activePlayerId: 'p1', overwatchPasses: 1, overwatchDecisions: 1 } });
    const m = placementModel(s, createLabeler(s))!;
    expect(m).toMatchObject({ playerId: 'p1', playerName: 'Joueur 1', otherPlayerName: 'Joueur 2', consecutivePasses: 1, playersCount: 2 });
  });

  it('raisons visibles : sans PC, personnage déjà placé', () => {
    const broke = placement({ players: game().players.map((p) => ({ ...p, commandPoints: 0 })) });
    expect(placementModel(broke, createLabeler(broke))!.rows[0]).toMatchObject({ available: false, reason: 'Impossible : 1 PC requis.' });
    const done = placement({ characters: game().characters.map((c) => (c.id === 'e1' ? { ...c, overwatch: true, activated: true } : c)) });
    expect(placementModel(done, createLabeler(done))!.rows[0]).toMatchObject({ placed: true, available: false });
  });

  it('hors phase de placement : aucun modèle ; le statut indique la phase', () => {
    expect(placementModel(game(), createLabeler(game()))).toBeNull();
    expect(statusModel(placement(), createLabeler(placement())).placement).toBe(true);
  });

  it('touche O / clic : explications en français selon l\'état', () => {
    expect(explainIgnoredClick(placement())).toContain('Phase Overwatch');
  });

  it('réaction : action annoncée en attente, ou entrée dans la ligne de vue', () => {
    const base = game({ activeCharacterId: 'h1' });
    const labels = createLabeler(base);
    expect(announcedText({ type: 'MOVE_CHARACTER', playerId: 'p1', characterId: 'h1', path: ['b'] }, labels)).toBe('h1 veut se déplacer vers b');
    expect(announcedText({ type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: 'e1', weaponId: 'weapon.pistol' }, labels)).toBe('h1 veut attaquer e1');
    expect(announcedText(undefined, labels)).toBeNull();
    const resume = { type: 'OPEN_DOOR', playerId: 'p1', characterId: 'h1', doorId: 'D' } as const;
    const pending = { ...base, characters: base.characters.map((c) => (c.id === 'e1' ? { ...c, overwatch: true, activated: true } : c)), turn: { ...base.turn, reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2', resume } } };
    expect(reactionContext(pending, createLabeler(pending))).toBe('h1 veut ouvrir la porte D');
    const entered = { ...pending, turn: { ...pending.turn, reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' } } };
    expect(reactionContext(entered, createLabeler(entered))).toContain('ligne de vue');
  });
});

describe('saisies refusées ou ignorées', () => {
  it('refus d\'attaque : motif global quand aucune attaque n\'est possible, dédoublonné', () => {
    const s = game({ activeCharacterId: 'h1', actionUsed: false });
    const res = applyCommand(s, { type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: 'e1', weaponId: 'weapon.pistol' }, new SeededRng(1));
    expect(res.accepted).toBe(false);
    const cmd = { type: 'ATTACK', playerId: 'p1', attackerId: 'h1', targetId: 'e1', weaponId: 'weapon.pistol' } as const;
    expect(describeRefusals([{ command: cmd, errors: res.errors }, { command: cmd, errors: res.errors }], s)).toEqual(['Impossible : aucun ennemi à portée.']);
  });

  it('refus d\'une autre commande : message du moteur (ou sa traduction par code)', () => {
    const s = game({ activeCharacterId: 'h1' });
    const res = applyCommand(s, { type: 'END_TURN', playerId: 'p2' }, new SeededRng(1));
    expect(describeRefusals([{ command: { type: 'END_TURN', playerId: 'p2' }, errors: res.errors }], s)).toEqual(["Impossible : ce n'est pas votre tour."]);
  });

  it('un clic sans effet est toujours expliqué selon l\'état', () => {
    expect(explainIgnoredClick(game())).toContain('Sélectionnez');
    expect(explainIgnoredClick(game({ activeCharacterId: 'h1' }))).toContain('Rien à faire');
    expect(explainIgnoredClick(game({ activeCharacterId: 'h1', reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' } }))).toContain('réaction');
    expect(explainIgnoredClick({ ...game(), phase: 'FINISHED' })).toContain('terminée');
  });

  it('T/D sans réaction sont expliqués ; les autres touches ne le sont pas', () => {
    expect(explainIgnoredKey(game(), 't')).toContain('Aucune réaction');
    expect(explainIgnoredKey(game(), 'x')).toBeNull();
  });
});
