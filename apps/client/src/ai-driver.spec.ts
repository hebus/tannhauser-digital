// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDevContent } from '@tannhauser/content';
import { startAiDriver } from './ai-driver';
import { defaultSetup } from './setup/setup-config';
import { createGameFromSetup, setupContentOf } from './ui/new-game';

const content = loadDevContent();
const make = (ai: string[]) => createGameFromSetup({ ...defaultSetup(setupContentOf(content), 7), ai }, content);

afterEach(() => vi.useRealTimers());

describe('pilotage de l’IA', () => {
  it('refuse les commandes humaines au nom d’un joueur IA, mais pas celles de l’autre joueur', () => {
    const game = make(['p2']);
    const res = game.dispatch({ type: 'PASS_OVERWATCH', playerId: 'p2' });
    expect(res.accepted).toBe(false);
    expect(res.errors[0]!.code).toBe('AI_PLAYER');
    expect(game.isAi('p2')).toBe(true);
    expect(game.isAi('p1')).toBe(false);
  });

  it('joue à la place du joueur IA, avec une pause, et attend la fin des animations', () => {
    vi.useFakeTimers();
    const game = make(['p1', 'p2']);
    let idle: (() => void) | null = null;
    const stop = startAiDriver(game, { whenIdle: (cb) => { idle = cb; }, delayMs: 100 });
    const before = game.state.history.length;
    vi.advanceTimersByTime(1000);
    expect(game.state.history.length).toBe(before); // animation en cours : l'IA attend
    idle!();
    vi.advanceTimersByTime(99);
    expect(game.state.history.length).toBe(before);
    vi.advanceTimersByTime(2);
    expect(game.state.history.length).toBeGreaterThan(before);
    stop();
  });

  it('mène une partie IA contre IA jusqu’au bout et s’arrête proprement', () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const game = make(['p1', 'p2']);
    const stop = startAiDriver(game, { whenIdle: (cb) => cb(), delayMs: 10, onError: (m) => errors.push(m) });
    for (let i = 0; i < 3000 && game.state.phase !== 'FINISHED'; i += 1) vi.advanceTimersByTime(10);
    expect(errors).toEqual([]);
    expect(game.state.turn.number).toBeGreaterThan(1);
    stop();
    const frozen = game.state.history.length;
    vi.advanceTimersByTime(1000);
    expect(game.state.history.length).toBe(frozen);
  });

  it('ne joue rien pour un humain', () => {
    vi.useFakeTimers();
    const game = make([]);
    const before = game.state.history.length;
    const stop = startAiDriver(game, { whenIdle: (cb) => cb(), delayMs: 10 });
    vi.advanceTimersByTime(1000);
    expect(game.state.history.length).toBe(before);
    stop();
  });
});
