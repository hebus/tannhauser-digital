// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chooseCommand, decidingPlayer } from '@tannhauser/ai';
import { loadDevContent } from '@tannhauser/content';
import { defaultSetup } from './setup/setup-config';
import { createGameFromSetup, setupContentOf } from './ui/new-game';

const content = loadDevContent();

/** Joue une partie IA contre IA ; renvoie l'état final et le nombre de décisions. Échoue si le moteur refuse une commande de l'IA. */
function playOut(boardId: string, seed: number, maxDecisions = 1500) {
  const game = createGameFromSetup({ ...defaultSetup(setupContentOf(content), seed), boardId }, content);
  let decisions = 0;
  while (game.state.phase !== 'FINISHED' && decisions < maxDecisions) {
    const player = decidingPlayer(game.state)!;
    const command = chooseCommand(game.state, player)!;
    expect(command, `pas de commande (tour ${game.state.turn.number}, phase ${game.state.phase})`).not.toBeNull();
    const result = game.dispatch(command);
    expect(result.accepted, `${JSON.stringify(command)} refusée : ${result.accepted ? '' : result.errors.map((e) => e.message).join(' ')}`).toBe(true);
    decisions += 1;
  }
  return { state: game.state, decisions };
}

describe('IA basique', () => {
  it('ne décide que quand c’est son tour', () => {
    const game = createGameFromSetup(defaultSetup(setupContentOf(content), 1), content);
    const deciding = decidingPlayer(game.state)!;
    const other = game.state.players.find((p) => p.id !== deciding)!.id;
    expect(chooseCommand(game.state, other)).toBeNull();
    expect(chooseCommand(game.state, deciding)).not.toBeNull();
  });

  it('est déterministe', () => {
    const game = createGameFromSetup(defaultSetup(setupContentOf(content), 3), content);
    const p = decidingPlayer(game.state)!;
    expect(chooseCommand(game.state, p)).toEqual(chooseCommand(game.state, p));
  });

  for (const boardId of ['dev-board', 'castle']) {
    it(`mène des parties complètes sur ${boardId} sans jamais jouer de coup illégal`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const { state, decisions } = playOut(boardId, seed);
        expect(state.turn.number, `seed ${seed}`).toBeGreaterThan(1);
        expect(decisions).toBeGreaterThan(10);
      }
    });
  }

  it('finit par terminer au moins une partie (l’IA attaque)', () => {
    const results = [1, 2, 3, 4, 5].map((seed) => playOut('dev-board', seed).state.phase);
    expect(results).toContain('FINISHED');
  });
});
