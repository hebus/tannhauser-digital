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
      'overwatchTriggered',
      'damage',
      'defeat',
    ]);
    const damage = planPresentation(events, null, state(1, 'p1')).find((s) => s.kind === 'damage');
    expect(damage).toEqual({ kind: 'damage', targetId: 'b', wounds: 2 });
  });

  it('bannière de tour : joueur actif de l état, sinon vainqueur de l initiative du lot', () => {
    const events: GameEvent[] = [
      { type: 'TURN_STARTED', turn: 2 },
      { type: 'INITIATIVE_ROLLED', rolls: { p1: 1, p2: 5 }, winnerId: 'p2' },
    ];
    expect(planPresentation(events, null, state(2, 'p1'))).toEqual([{ kind: 'banner', turn: 2, playerId: 'p1' }]);
    expect(planPresentation(events, null, state(3, 'p1'))).toEqual([{ kind: 'banner', turn: 2, playerId: 'p2' }]);
  });

  it('ignore les événements sans présentation et ne mute pas l état', () => {
    const next = state(1, 'p1', { h: 'n1' });
    const snapshot = JSON.stringify(next);
    expect(planPresentation([{ type: 'PLAYER_PASSED', playerId: 'p1' }], next, next)).toEqual([]);
    expect(JSON.stringify(next)).toBe(snapshot);
  });
});
