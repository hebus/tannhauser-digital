import { describe, expect, it } from 'vitest';
import { ReducedMotion, type MediaQueryLike } from './reduced-motion';

function fakeMedia(initial: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql: MediaQueryLike & { set(v: boolean): void } = {
    matches: initial,
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
    set(v) {
      (mql as { matches: boolean }).matches = v;
      for (const l of [...listeners]) l({ matches: v });
    },
  };
  return { host: { matchMedia: () => mql }, mql, listeners };
}

describe('ReducedMotion', () => {
  it('suit prefers-reduced-motion et ses changements', () => {
    const { host, mql } = fakeMedia(true);
    const rm = new ReducedMotion(host);
    const seen: boolean[] = [];
    rm.subscribe((v) => seen.push(v));
    expect(rm.value).toBe(true);
    mql.set(false);
    expect(rm.value).toBe(false);
    expect(seen).toEqual([false]);
  });

  it('le toggle surcharge la préférence système', () => {
    const { host, mql } = fakeMedia(false);
    const rm = new ReducedMotion(host);
    expect(rm.toggle()).toBe(true);
    mql.set(false);
    expect(rm.value).toBe(true);
    expect(rm.toggle()).toBe(false);
  });

  it('sans matchMedia : désactivé par défaut', () => {
    expect(new ReducedMotion({}).value).toBe(false);
  });

  it('destroy retire l écouteur système', () => {
    const { host, listeners } = fakeMedia(false);
    const rm = new ReducedMotion(host);
    expect(listeners.size).toBe(1);
    rm.destroy();
    expect(listeners.size).toBe(0);
  });
});
