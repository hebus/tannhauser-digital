import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '@tannhauser/core';
import { planPresentation } from './plan';

const state = (turn: number, active: string | null, nodes: Record<string, string> = {}): GameState =>
  ({
    turn: { number: turn, activePlayerId: active },
    characters: Object.entries(nodes).map(([id, nodeId]) => ({ id, nodeId })),
  }) as unknown as GameState;

describe('planPresentation', () => {
  it('déplacement : tracé de l origine (état précédent) jusqu à l arrivée', () => {
    const events: GameEvent[] = [{ type: 'CHARACTER_MOVED', characterId: 'h', path: ['n2', 'n3'], cost: 2 }];
    const steps = planPresentation(events, state(1, 'p1', { h: 'n1' }), state(1, 'p1', { h: 'n3' }));
    expect(steps).toEqual([{ kind: 'move', characterId: 'h', nodeIds: ['n1', 'n2', 'n3'] }]);
  });

  it('enchaîne deux déplacements du même personnage depuis la dernière case', () => {
    const events: GameEvent[] = [
      { type: 'CHARACTER_MOVED', characterId: 'h', path: ['n2'], cost: 1 },
      { type: 'CHARACTER_MOVED', characterId: 'h', path: ['n3'], cost: 1 },
    ];
    const steps = planPresentation(events, state(1, 'p1', { h: 'n1' }), state(1, 'p1', { h: 'n3' }));
    expect(steps.map((s) => (s.kind === 'move' ? s.nodeIds : null))).toEqual([
      ['n1', 'n2'],
      ['n2', 'n3'],
    ]);
  });

  it('dégâts, défaite et Overwatch dans l ordre des événements ; pas de chiffre pour 0 dégât', () => {
    const events: GameEvent[] = [
      { type: 'OVERWATCH_PLACED', characterId: 'a' },
      { type: 'OVERWATCH_TRIGGERED', overwatcherId: 'a', targetId: 'b', nodeId: 'n4' },
      { type: 'DAMAGE_APPLIED', targetId: 'b', wounds: 0, healthLeft: 3 },
      { type: 'DAMAGE_APPLIED', targetId: 'b', wounds: 2, healthLeft: 1 },
      { type: 'CHARACTER_DEFEATED', characterId: 'b' },
    ];
    expect(planPresentation(events, null, state(1, 'p1')).map((s) => s.kind)).toEqual([
      'overwatchPlaced',
      'banner', // réaction d'Overwatch annoncée juste avant l'éclair
      'overwatchTriggered',
      'damage',
      'defeat',
    ]);
    const damage = planPresentation(events, null, state(1, 'p1')).find((s) => s.kind === 'damage');
    expect(damage).toEqual({ kind: 'damage', targetId: 'b', wounds: 2 });
  });

  const at = (turn: number, active: string, phase: string): GameState => ({ ...state(turn, active), phase }) as unknown as GameState;
  const banners = (steps: ReturnType<typeof planPresentation>) => steps.flatMap((s) => (s.kind === 'banner' ? [s.banner] : []));

  it('bannière de tour : joueur actif de l état, sinon vainqueur de l initiative du lot', () => {
    const events: GameEvent[] = [
      { type: 'TURN_STARTED', turn: 2 },
      { type: 'INITIATIVE_ROLLED', rolls: { p1: 1, p2: 5 }, winnerId: 'p2' },
    ];
    expect(planPresentation(events, null, state(2, 'p1'))).toEqual([{ kind: 'banner', banner: { kind: 'turnStart', turn: 2, playerId: 'p1' } }]);
    expect(planPresentation(events, null, state(3, 'p1'))).toEqual([{ kind: 'banner', banner: { kind: 'turnStart', turn: 2, playerId: 'p2' } }]);
  });

  it('phase d’Overwatch : annoncée au changement de phase ou de joueur qui décide', () => {
    expect(banners(planPresentation([], at(1, 'p1', 'ACTIVATION'), at(1, 'p1', 'OVERWATCH')))).toEqual([{ kind: 'overwatchPhase', turn: 1, playerId: 'p1' }]);
    expect(banners(planPresentation([], at(1, 'p1', 'OVERWATCH'), at(1, 'p2', 'OVERWATCH')))).toEqual([{ kind: 'overwatchPhase', turn: 1, playerId: 'p2' }]);
  });

  it('phase d’activation, puis changement de main pendant l’activation', () => {
    expect(banners(planPresentation([{ type: 'OVERWATCH_PHASE_ENDED' }], at(1, 'p2', 'OVERWATCH'), at(1, 'p1', 'ACTIVATION')))).toEqual([
      { kind: 'activationPhase', turn: 1, playerId: 'p1' },
    ]);
    expect(banners(planPresentation([], at(1, 'p1', 'ACTIVATION'), at(1, 'p2', 'ACTIVATION')))).toEqual([{ kind: 'turnOf', turn: 1, playerId: 'p2' }]);
  });

  it('aucune bannière si rien ne change, partie terminée, ou état précédent inconnu', () => {
    expect(planPresentation([], at(1, 'p1', 'ACTIVATION'), at(1, 'p1', 'ACTIVATION'))).toEqual([]);
    expect(planPresentation([], at(1, 'p1', 'ACTIVATION'), at(1, 'p2', 'FINISHED'))).toEqual([]);
    expect(planPresentation([], null, at(1, 'p1', 'ACTIVATION'))).toEqual([]);
  });

  it('au début de tour, une seule bannière (pas de doublon avec le changement de phase/de main)', () => {
    const steps = planPresentation([{ type: 'TURN_STARTED', turn: 2 }], at(1, 'p1', 'ACTIVATION'), at(2, 'p2', 'OVERWATCH'));
    expect(steps.map((s) => s.kind)).toEqual(['banner']);
    expect(banners(steps)[0]?.kind).toBe('turnStart');
  });

  it('réaction d’Overwatch : bannière du propriétaire du tireur, avant l’éclair, et prioritaire sur le changement de main', () => {
    const owned = (active: string, phase: string): GameState =>
      ({ ...at(1, active, phase), characters: [{ id: 'ow', nodeId: 'n1', playerId: 'p2' }, { id: 'tg', nodeId: 'n2', playerId: 'p1' }] }) as unknown as GameState;
    const events: GameEvent[] = [{ type: 'OVERWATCH_TRIGGERED', overwatcherId: 'ow', targetId: 'tg', nodeId: 'n2' }];
    const steps = planPresentation(events, owned('p1', 'ACTIVATION'), owned('p2', 'ACTIVATION'));
    expect(steps.map((s) => s.kind)).toEqual(['banner', 'overwatchTriggered']);
    expect(banners(steps)).toEqual([{ kind: 'reaction', turn: 1, playerId: 'p2', overwatcherId: 'ow', targetId: 'tg' }]);
  });

  it('victoire : bannière finale unique, après les animations de combat, prioritaire sur tout le reste', () => {
    const events: GameEvent[] = [
      { type: 'DAMAGE_APPLIED', targetId: 'b', wounds: 1, healthLeft: 0 },
      { type: 'CHARACTER_DEFEATED', characterId: 'b' },
      { type: 'VICTORY', winnerId: 'p1', reason: 'elimination' },
    ];
    const steps = planPresentation(events, at(1, 'p1', 'ACTIVATION'), at(1, 'p2', 'FINISHED'));
    expect(steps.map((s) => s.kind)).toEqual(['damage', 'defeat', 'banner']);
    expect(banners(steps)).toEqual([{ kind: 'victory', turn: 1, playerId: 'p1' }]);
  });

  it('ignore les événements sans présentation et ne mute pas l état', () => {
    const next = state(1, 'p1', { h: 'n1' });
    const snapshot = JSON.stringify(next);
    expect(planPresentation([{ type: 'PLAYER_PASSED', playerId: 'p1' }], next, next)).toEqual([]);
    expect(JSON.stringify(next)).toBe(snapshot);
  });
});
