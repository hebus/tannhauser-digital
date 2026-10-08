// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadDevContent } from '@tannhauser/content';
import { createGameFromSetup, setupContentOf } from '../ui/new-game';
import { EN, FR } from '../ui/i18n';
import { decodeSetup, defaultSetup, encodeSetup, placeTeams, validateSetup, type SetupConfig } from './setup-config';

const content = loadDevContent();
const available = setupContentOf(content);
const castle = content.boards.find((b) => b.id === 'castle')!;
const castleSetup = (seed: number, teamSize?: number): SetupConfig => {
  const base = defaultSetup(available, seed);
  return { ...base, boardId: 'castle', teams: base.teams.map((t) => ({ ...t, characterIds: t.characterIds.slice(0, teamSize ?? t.characterIds.length) })) };
};

describe('sélection du château', () => {
  it('les trois plateaux sont proposés, le plateau de dev reste celui par défaut', () => {
    expect(available.boards.map((b) => b.id)).toEqual(['dev-board', 'castle', 'manoir']);
    expect(defaultSetup(available, 1).boardId).toBe('dev-board');
    expect(validateSetup(castleSetup(1), available)).toEqual([]);
  });

  it('le lien de rejeu #board=castle fonctionne (aller-retour)', () => {
    const config = castleSetup(987654);
    const hash = `#${encodeSetup(config)}`;
    expect(hash).toContain('board=castle');
    expect(decodeSetup(hash)).toEqual(config);
  });

  it('noms de plateau et de pièces traduits en français et en anglais', () => {
    for (const messages of [FR, EN]) {
      expect(messages['board.castle.name']).toBeTruthy();
      for (const room of castle.layout!.rooms) expect(messages[room.nameKey!], room.nameKey).toBeTruthy();
    }
  });
});

describe('placement des équipes sur le château', () => {
  const entries = Object.values(castle.board.nodes)
    .filter((n) => n.properties.kind === 'ENTRY_POINT')
    .map((n) => n.id)
    .sort();

  it('chaque équipe prend un point d\'entrée différent (grande porte / poterne)', () => {
    const placed = placeTeams(castle.board, [{ playerId: 'p1', count: 2 }, { playerId: 'p2', count: 2 }])!;
    expect(entries).toEqual(['cor-poterne-03', 'cour-05']);
    expect([placed.p1![0], placed.p2![0]].sort()).toEqual(entries);
  });

  it('pose toujours sur des cases distinctes, praticables et jamais dans la salle d\'armes verrouillée', () => {
    for (const size of [1, 2, 3, 4]) {
      const placed = placeTeams(castle.board, [{ playerId: 'p1', count: size }, { playerId: 'p2', count: size }])!;
      const all = [...placed.p1!, ...placed.p2!];
      expect(all).toHaveLength(size * 2);
      expect(new Set(all).size).toBe(size * 2);
      for (const id of all) {
        expect(castle.board.nodes[id]!.properties.passable).toBe(true);
        expect(castle.board.nodes[id]!.zoneId).not.toBe('armurerie');
        expect(castle.board.nodes[id]!.zoneId).not.toBe('cor-ouest');
      }
    }
  });

  it('une équipe n\'est jamais posée dans une zone qu\'elle ne peut pas quitter (équipe de la grande porte : ni chapelle ni bibliothèque)', () => {
    const placed = placeTeams(castle.board, [{ playerId: 'p1', count: 4 }, { playerId: 'p2', count: 4 }])!;
    const southTeam = placed.p1!.includes('cour-05') ? placed.p1! : placed.p2!;
    for (const id of southTeam) expect(['chapelle', 'bibliotheque', 'cor-poterne']).not.toContain(castle.board.nodes[id]!.zoneId);
  });

  it('est déterministe', () => {
    const teams = [{ playerId: 'p1', count: 3 }, { playerId: 'p2', count: 4 }];
    expect(placeTeams(castle.board, teams)).toEqual(placeTeams(castle.board, teams));
  });

  it('ne change pas le placement du plateau de dev (aucune zone verrouillée)', () => {
    const placed = placeTeams(content.board.board, [{ playerId: 'p1', count: 2 }, { playerId: 'p2', count: 2 }])!;
    const all = [...placed.p1!, ...placed.p2!];
    expect(new Set(all).size).toBe(4);
    expect([placed.p1![0], placed.p2![0]].sort()).toEqual(['n1', 'n16']);
  });
});

describe('partie sur le château', () => {
  it('démarre sur le plateau choisi, avec sa mise en page, et place les équipes aux entrées', () => {
    const game = createGameFromSetup(castleSetup(11), content);
    expect(game.state.scenarioId).toBe('castle');
    expect(game.state.phase).toBe('OVERWATCH');
    expect(Object.keys(game.state.board.nodes)).toHaveLength(Object.keys(castle.board.nodes).length);
    expect(game.layout?.rooms).toHaveLength(6);
    expect(game.layout?.corridors.length).toBeGreaterThanOrEqual(6);
    const firsts = game.state.characters.filter((c) => game.state.board.nodes[c.nodeId]!.properties.kind === 'ENTRY_POINT').map((c) => c.nodeId);
    expect(firsts.sort()).toEqual(['cor-poterne-03', 'cour-05']);
  });

  it('est reproductible par graine (même état, même placement)', () => {
    const a = createGameFromSetup(castleSetup(5), content);
    const b = createGameFromSetup(castleSetup(5), content);
    expect(a.state).toEqual(b.state);
    expect(a.replaySeed).toBe(5);
    const other = createGameFromSetup(castleSetup(6), content);
    expect(other.state.characters.map((c) => c.nodeId)).toEqual(a.state.characters.map((c) => c.nodeId));
  });

  it('les personnages peuvent se déplacer (la partie est jouable) et le plateau de dev n\'a pas de mise en page', () => {
    const game = createGameFromSetup(castleSetup(2), content);
    expect(game.state.characters.some((c) => game.reachable(c.id).length > 0)).toBe(true);
    expect(createGameFromSetup(defaultSetup(available, 2), content).layout).toBeUndefined();
  });
});
