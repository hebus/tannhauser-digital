import { describe, expect, it } from 'vitest';
import { BoardBuilder } from '../board/builder';
import { createInitialState } from '../state/initial-state';
import type { GameState } from '../state/types';
import { isInSmoke, smokeAttackPenalty, smokeSpread } from './smoke';

// a(R) — b(R,G) — c(G) — d(B) ; e(R) isolé sans arête vers les autres.
const board = new BoardBuilder()
  .node('a', ['R'], 0, 0)
  .node('b', ['R', 'G'], 1, 0)
  .node('c', ['G'], 2, 0)
  .node('d', ['B'], 3, 0)
  .node('e', ['R'], 0, 1)
  .edge('a', 'b')
  .edge('b', 'c')
  .edge('c', 'd')
  .build();

const withSmoke = (origin: string, remainingTurns = 2): GameState => ({
  ...createInitialState({ board, players: [], characters: [], scenarioId: 't' } as never),
  effects: [{ id: 'fx', type: 'SMOKE', origin, remainingTurns }],
});

describe('smokeSpread (propagation visuelle de la fumée)', () => {
  it('gagne toutes les cases qui partagent une couleur avec l\'origine, y compris sans arête', () => {
    const spread = smokeSpread(withSmoke('a'));
    expect([...spread.nodes].sort()).toEqual(['a', 'b', 'e']);
    expect([...spread.origins]).toEqual(['a']);
  });

  it('une case multicolore propage chacune de ses couleurs', () => {
    expect([...smokeSpread(withSmoke('b')).nodes].sort()).toEqual(['a', 'b', 'c', 'e']);
  });

  it('les arêtes couvertes relient deux cases enfumées', () => {
    expect(smokeSpread(withSmoke('b')).edges).toEqual([
      { from: 'a', to: 'b', intensity: 1 },
      { from: 'b', to: 'c', intensity: 1 },
    ]);
  });

  it("l'épaisseur décroît avec les tours restants : 2 tours = 1, 1 tour = 0,5", () => {
    expect(smokeSpread(withSmoke('a', 2)).intensity.get('a')).toBe(1);
    expect(smokeSpread(withSmoke('a', 1)).intensity.get('a')).toBe(0.5);
    expect(smokeSpread(withSmoke('a', 1)).intensity.get('b')).toBe(0.5);
    expect(smokeSpread(withSmoke('a', 1)).edges[0]?.intensity).toBe(0.5);
    expect(smokeSpread(withSmoke('a', 99)).intensity.get('a')).toBe(1);
  });

  it("deux fumées qui se recouvrent : la plus épaisse l'emporte", () => {
    const state = {
      ...withSmoke('a', 1),
      effects: [
        { id: 'f1', type: 'SMOKE' as const, origin: 'a', remainingTurns: 1 },
        { id: 'f2', type: 'SMOKE' as const, origin: 'e', remainingTurns: 2 },
      ],
    };
    expect(smokeSpread(state).intensity.get('b')).toBe(1);
  });

  it('sans fumée : rien', () => {
    const spread = smokeSpread({ ...withSmoke('a'), effects: [] });
    expect(spread.nodes.size).toBe(0);
    expect(spread.edges).toEqual([]);
  });

  it("isInSmoke et malus d'attaque : -2 dés hors corps à corps seulement", () => {
    const state = withSmoke('a');
    expect(isInSmoke(state, 'e')).toBe(true);
    expect(isInSmoke(state, 'd')).toBe(false);
    expect(smokeAttackPenalty(state, { nodeId: 'b' }, { kind: 'PISTOL' })).toBe(2);
    expect(smokeAttackPenalty(state, { nodeId: 'b' }, { kind: 'CAC' })).toBe(0);
    expect(smokeAttackPenalty(state, { nodeId: 'd' }, { kind: 'PISTOL' })).toBe(0);
  });
});
