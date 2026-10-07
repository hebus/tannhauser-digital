// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadDevContent } from '@tannhauser/content';
import { BoardBuilder } from '@tannhauser/core';
import { createGameFromSetup, setupContentOf } from '../ui/new-game';
import { MAX_SEED, decodeSetup, defaultSetup, encodeSetup, placeTeams, randomSeed, validateSetup, type SetupConfig } from './setup-config';

const content = loadDevContent();
const available = setupContentOf(content);

describe('validateSetup', () => {
  const ok = defaultSetup(available, 42);

  it('accepte la configuration par défaut (2 contre 2)', () => {
    expect(ok.teams.map((t) => t.characterIds.length)).toEqual([2, 2]);
    expect(validateSetup(ok, available)).toEqual([]);
  });

  it('refuse une équipe vide, un personnage inconnu ou en double', () => {
    const bad: SetupConfig = { ...ok, teams: [{ playerId: 'p1', characterIds: [] }, { playerId: 'p2', characterIds: ['nope', 'char.beta.hero', 'char.beta.hero'] }] };
    const codes = validateSetup(bad, available).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['TEAM_EMPTY', 'UNKNOWN_CHARACTER', 'DUPLICATE_CHARACTER']));
  });

  it('refuse trop de personnages dans une équipe', () => {
    const many = Array.from({ length: 5 }, (_, i) => `x${i}`);
    const codes = validateSetup({ ...ok, teams: [{ playerId: 'p1', characterIds: many }, ok.teams[1]!] }, available).map((i) => i.code);
    expect(codes).toContain('TEAM_TOO_LARGE');
  });

  it('refuse une graine invalide, un plateau inconnu et un nombre d\'équipes incorrect', () => {
    for (const seed of [-1, 1.5, Number.NaN, MAX_SEED + 1]) {
      expect(validateSetup({ ...ok, seed }, available).map((i) => i.code)).toContain('BAD_SEED');
    }
    expect(validateSetup({ ...ok, boardId: 'ailleurs' }, available).map((i) => i.code)).toContain('UNKNOWN_BOARD');
    expect(validateSetup({ ...ok, teams: [ok.teams[0]!] }, available).map((i) => i.code)).toContain('TEAM_COUNT');
  });

  it('refuse un plateau trop petit pour tous les personnages', () => {
    const tiny = new BoardBuilder().node('a', ['r']).node('b', ['r']).edge('a', 'b').build();
    const codes = validateSetup(ok, { boards: [{ id: ok.boardId, board: tiny }], characters: available.characters }).map((i) => i.code);
    expect(codes).toContain('NOT_ENOUGH_NODES');
  });
});

describe('graine et sérialisation', () => {
  it('randomSeed est un entier dans la plage valide et dépend de la source d\'aléa', () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.999999999)).toBeLessThanOrEqual(MAX_SEED);
    expect(Number.isInteger(randomSeed())).toBe(true);
  });

  it('encode puis décode une configuration à l\'identique', () => {
    const config = defaultSetup(available, 123456);
    expect(decodeSetup(`#${encodeSetup(config)}`)).toEqual(config);
  });

  it('un hash vide ou incomplet n\'est pas une configuration', () => {
    expect(decodeSetup('')).toBeNull();
    expect(decodeSetup('#board=dev-board&seed=abc&p1=a&p2=b')).toBeNull();
    expect(decodeSetup('#board=dev-board&seed=1&p1=a')).toBeNull();
  });
});

describe('placeTeams', () => {
  it('2 contre 2 sur le plateau de dev : points d\'entrée d\'abord, cases distinctes, côtés opposés', () => {
    const board = content.board.board;
    const placed = placeTeams(board, [{ playerId: 'p1', count: 2 }, { playerId: 'p2', count: 2 }])!;
    const all = [...placed.p1!, ...placed.p2!];
    expect(new Set(all).size).toBe(4);
    const entries = Object.values(board.nodes).filter((n) => n.properties.kind === 'ENTRY_POINT').map((n) => n.id);
    expect(entries).toHaveLength(2);
    expect(entries).toContain(placed.p1![0]);
    expect(entries).toContain(placed.p2![0]);
    expect(placed.p1![0]).not.toBe(placed.p2![0]);
  });

  it('est déterministe', () => {
    const board = content.board.board;
    const teams = [{ playerId: 'p1', count: 3 }, { playerId: 'p2', count: 2 }];
    expect(placeTeams(board, teams)).toEqual(placeTeams(board, teams));
  });

  it('sans point d\'entrée : retombe sur les cases les plus éloignées', () => {
    const line = new BoardBuilder().node('a', ['r']).node('b', ['r']).node('c', ['r']).node('d', ['r']).node('e', ['r']).edge('a', 'b').edge('b', 'c').edge('c', 'd').edge('d', 'e').build();
    const placed = placeTeams(line, [{ playerId: 'p1', count: 2 }, { playerId: 'p2', count: 2 }])!;
    expect(placed.p1).toEqual(['a', 'b']);
    expect(placed.p2).toEqual(['e', 'd']);
  });

  it('renvoie null s\'il manque de cases praticables', () => {
    const tiny = new BoardBuilder().node('a', ['r']).build();
    expect(placeTeams(tiny, [{ playerId: 'p1', count: 1 }, { playerId: 'p2', count: 1 }])).toBeNull();
  });

  it('ignore les cases impraticables', () => {
    const board = new BoardBuilder().node('a', ['r']).node('b', ['r'], 0, 0, { passable: false }).node('c', ['r']).edge('a', 'b').edge('b', 'c').build();
    const placed = placeTeams(board, [{ playerId: 'p1', count: 1 }, { playerId: 'p2', count: 1 }])!;
    expect([...placed.p1!, ...placed.p2!].sort()).toEqual(['a', 'c']);
  });
});

describe('createGameFromSetup', () => {
  it('crée une partie démarrée, reproductible avec la même graine', () => {
    const config = defaultSetup(available, 7);
    const a = createGameFromSetup(config, content);
    const b = createGameFromSetup(config, content);
    expect(a.state.phase).toBe('ACTIVATION');
    expect(a.state.characters).toHaveLength(4);
    expect(a.replaySeed).toBe(7);
    expect(a.state).toEqual(b.state);
  });

  it('une graine différente peut changer l\'initiative mais jamais le placement', () => {
    const a = createGameFromSetup(defaultSetup(available, 1), content);
    const b = createGameFromSetup(defaultSetup(available, 2), content);
    expect(a.state.characters.map((c) => c.nodeId)).toEqual(b.state.characters.map((c) => c.nodeId));
  });

  it('un personnage choisi par les deux équipes reçoit des ids uniques', () => {
    const config: SetupConfig = { boardId: content.board.id, seed: 3, teams: [{ playerId: 'p1', characterIds: ['char.alpha.hero'] }, { playerId: 'p2', characterIds: ['char.alpha.hero'] }] };
    const game = createGameFromSetup(config, content);
    expect(game.state.characters.map((c) => c.id)).toEqual(['char.alpha.hero#p1', 'char.alpha.hero#p2']);
  });

  it('refuse une configuration invalide', () => {
    expect(() => createGameFromSetup({ ...defaultSetup(available, 1), seed: -5 }, content)).toThrow(/BAD_SEED/);
  });
});
