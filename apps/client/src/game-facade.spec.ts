import { describe, expect, it } from 'vitest';
import { GameFacade } from './game-facade';

/** Partie de dev où le héros du joueur actif est en n1 et le héros adverse en n2 (adjacent, ligne de vue rouge). */
function setup(enemyNode = 'n2'): { facade: GameFacade; player: string; hero: string; enemyHero: string } {
  const base = GameFacade.createDev(3);
  const player = base.state.turn.activePlayerId!;
  const heroes = base.state.characters.filter((c) => c.definitionId.endsWith('.hero'));
  const hero = heroes.find((c) => c.playerId === player)!;
  const enemyHero = heroes.find((c) => c.playerId !== player)!;
  const characters = base.state.characters.map((c) => {
    if (c.id === hero.id) return { ...c, nodeId: 'n1' };
    if (c.id === enemyHero.id) return { ...c, nodeId: enemyNode };
    // Les troupes sont écartées, hors de toute ligne de vue.
    return { ...c, nodeId: c.playerId === player ? 'n5' : 'n16' };
  });
  return { facade: new GameFacade({ ...base.state, characters }, 3), player, hero: hero.id, enemyHero: enemyHero.id };
}

describe('GameFacade.targetable', () => {
  it("est vide tant que le personnage n'est pas activé", () => {
    const { facade, hero } = setup();
    expect(facade.targetable(hero)).toEqual([]);
  });

  it('liste les ennemis ciblables avec les armes acceptées par checkTargeting', () => {
    const { facade, player, hero, enemyHero } = setup();
    expect(facade.dispatch({ type: 'SELECT_CHARACTER', playerId: player, characterId: hero }).accepted).toBe(true);
    const targets = facade.targetable(hero);
    expect(targets.map((t) => t.targetId)).toEqual([enemyHero]);
    expect(targets[0]!.nodeId).toBe('n2');
    // Adjacent + ligne de vue : pistolet et corps à corps.
    expect([...targets[0]!.weaponIds].sort()).toEqual(['weapon.melee', 'weapon.pistol']);
  });

  it('exclut les ennemis hors ligne de vue et les alliés', () => {
    const { facade, player, hero } = setup('n16');
    facade.dispatch({ type: 'SELECT_CHARACTER', playerId: player, characterId: hero });
    expect(facade.targetable(hero)).toEqual([]);
  });

  it("devient vide quand l'action de l'activation est utilisée", () => {
    const { facade, player, hero, enemyHero } = setup();
    facade.dispatch({ type: 'SELECT_CHARACTER', playerId: player, characterId: hero });
    const res = facade.dispatch({ type: 'ATTACK', playerId: player, attackerId: hero, targetId: enemyHero, weaponId: 'weapon.pistol' });
    expect(res.accepted).toBe(true);
    expect(facade.targetable(hero)).toEqual([]);
  });

  it('est cohérent avec le moteur : une cible listée est attaquable avec la première arme proposée', () => {
    const { facade, player, hero, enemyHero } = setup();
    facade.dispatch({ type: 'SELECT_CHARACTER', playerId: player, characterId: hero });
    const entry = facade.targetable(hero)[0]!;
    const res = facade.dispatch({ type: 'ATTACK', playerId: player, attackerId: hero, targetId: enemyHero, weaponId: entry.weaponIds[0]! });
    expect(res.accepted).toBe(true);
  });
});

describe('GameFacade.visibleFrom', () => {
  it('reprend visibleNodes du moteur (n1 rouge voit n2 mais pas n16)', () => {
    const { facade, hero } = setup();
    const visible = facade.visibleFrom(hero);
    expect(visible.has('n2')).toBe(true);
    expect(visible.has('n16')).toBe(false);
  });
});
