// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { GameEvent, GameState } from '@tannhauser/core';
import { AnimationRunner, action } from './animation-queue';
import type { ScreenEffects, WorldEffects } from './effects';
import { Presentation } from './presentation';
import { ReducedMotion } from './reduced-motion';

/** Effets factices : chaque appel est enregistré dans `calls`, dans l'ordre. Aucun rendu, aucun Pixi. */
function make() {
  const calls: string[] = [];
  const world: WorldEffects = {
    move: (id, points) => {
      calls.push(`move:${id}:${points.length}`);
      return action(() => calls.push(`moved:${id}`));
    },
    damage: (id, wounds) => calls.push(`damage:${id}:${wounds}`),
    callout: (tone, id) => calls.push(`callout:${tone}:${id ?? '-'}`),
    explosion: (nodeId, _at, zone) => calls.push(`explosion:${nodeId}:${zone.length}`),
    defeat: (id) => calls.push(`defeat:${id}`),
    overwatchRing: (id) => calls.push(`ring:${id}`),
    overwatchBolt: (by, _to, target) => action(() => calls.push(`bolt:${by}>${target}`)),
    flagPlaced: (_at, owner) => calls.push(`flagPlaced:${owner}`),
    flagFlight: (kind, _node, id, owner) => calls.push(`flag:${kind}:${id}:${owner}`),
    tick: vi.fn(),
    destroy: vi.fn(),
  };
  const screen: ScreenEffects = { banner: (plan, index) => calls.push(`banner:${plan.kind}:${index}`), notice: (text) => calls.push(`notice:${text}`), destroy: vi.fn() };
  const runner = new AnimationRunner();
  const presentation = new Presentation({ reducedMotion: new ReducedMotion(), runner, world, screen });
  // Une animation en cours, sans passer par un rendu.
  const startAnimation = (duration: number): void => runner.add({ duration, update: () => undefined, finish: () => undefined });
  return { presentation, startAnimation, calls, world, screen };
}

const node = (id: string, x: number, y: number) => ({ id, x, y, colors: ['red'], properties: { kind: 'NORMAL', passable: true, movementCostModifier: 0, modifiers: [] } });
const state = {
  board: { nodes: { n1: node('n1', 0, 0), n2: node('n2', 100, 0), n3: node('n3', 200, 0) }, edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }], doors: {}, portals: [] },
  characters: [{ id: 'h', playerId: 'p1', nodeId: 'n3', alive: true }],
  players: [{ id: 'p1' }, { id: 'p2' }],
  turn: { number: 1, activePlayerId: 'p1' },
  phase: 'ACTIVATION',
  flags: [],
} as unknown as GameState;

describe('Presentation.onIdle (dialogues différés jusqu\'à la fin des animations)', () => {
  it('appelle tout de suite le rappel quand rien ne s\'anime', () => {
    const { presentation } = make();
    const cb = vi.fn();
    presentation.onIdle(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('attend la fin de l\'animation, puis appelle le rappel une seule fois', () => {
    const { presentation, startAnimation } = make();
    startAnimation(100);
    const cb = vi.fn();
    presentation.onIdle(cb);
    expect(cb).not.toHaveBeenCalled();
    presentation.tick(60, 0);
    expect(cb).not.toHaveBeenCalled();
    presentation.tick(60, 60);
    expect(cb).toHaveBeenCalledTimes(1);
    presentation.tick(60, 120);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skip() termine les animations et libère les rappels en attente', () => {
    const { presentation, startAnimation } = make();
    startAnimation(5000);
    const cb = vi.fn();
    presentation.onIdle(cb);
    presentation.skip();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('Presentation : événements du moteur → effets du rendu', () => {
  it('planifie un déplacement : le rendu reçoit les points plateau du tracé, dans l\'ordre', () => {
    const { presentation, calls } = make();
    const events = [{ type: 'CHARACTER_MOVED', characterId: 'h', path: ['n2', 'n3'] }] as unknown as GameEvent[];
    const prev = { ...state, characters: [{ id: 'h', playerId: 'p1', nodeId: 'n1', alive: true }] } as unknown as GameState;
    presentation.play(events, prev, state);
    // `move` est demandé tout de suite (le pion doit rester au départ) ; l'animation, elle, attend la file.
    expect(calls).toEqual(['move:h:3']);
    presentation.tick(16, 0);
    expect(calls).toEqual(['move:h:3', 'moved:h']);
  });

  it('un événement de dégâts déclenche l\'effet de dégâts du rendu au moment de la file', () => {
    const { presentation, calls } = make();
    presentation.play([{ type: 'DAMAGE_APPLIED', targetId: 'h', wounds: 2 }] as unknown as GameEvent[], null, state);
    presentation.tick(16, 0);
    expect(calls).toContain('damage:h:2');
  });

  it('announce() délègue la bannière aux effets d\'écran, avec l\'index du joueur', () => {
    const { presentation, calls } = make();
    presentation.announce({ kind: 'turnOf', turn: 1, playerId: 'p2' }, state.players);
    presentation.announce({ kind: 'victory', turn: 1, playerId: 'inconnu' }, state.players);
    expect(calls).toEqual(['banner:turnOf:1', 'banner:victory:null']);
  });

  it('notify() délègue le message aux effets d\'écran', () => {
    const { presentation, calls } = make();
    presentation.notify('Éditeur : activé');
    expect(calls).toEqual(['notice:Éditeur : activé']);
  });

  it('explode() planifie l\'explosion avec la zone touchée', () => {
    const { presentation, calls } = make();
    presentation.explode('n2', state);
    presentation.tick(16, 0);
    expect(calls).toEqual(['explosion:n2:3']); // case visée + deux voisines
  });

  it('tick() relaie l\'heure aux effets monde, et destroy() libère les deux jeux d\'effets', () => {
    const { presentation, world, screen } = make();
    presentation.tick(16, 1234);
    expect(world.tick).toHaveBeenCalledWith(1234);
    presentation.destroy();
    expect(world.destroy).toHaveBeenCalledTimes(1);
    expect(screen.destroy).toHaveBeenCalledTimes(1);
  });
});
