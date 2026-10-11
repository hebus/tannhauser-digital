import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelTargeting, getTargeting, isTargetable, startTargeting, subscribeTargeting } from './targeting';

const targeting = { characterId: 'h1', equipmentId: 'grenade.test', nodeIds: ['b', 'c'], smoke: false } as const;

describe('mode de ciblage au clic', () => {
  afterEach(() => cancelTargeting());

  it('démarre, expose les cases visables et notifie les abonnés', () => {
    const listener = vi.fn();
    const off = subscribeTargeting(listener);
    startTargeting(targeting);
    expect(getTargeting()).toEqual(targeting);
    expect(isTargetable('b')).toBe(true);
    expect(isTargetable('z')).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(targeting);
    off();
  });

  it("l'annulation vide le mode, notifie une seule fois et renvoie false si rien n'était actif", () => {
    const listener = vi.fn();
    const off = subscribeTargeting(listener);
    expect(cancelTargeting()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    startTargeting(targeting);
    expect(cancelTargeting()).toBe(true);
    expect(getTargeting()).toBeNull();
    expect(isTargetable('b')).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(cancelTargeting()).toBe(false);
    off();
  });

  it('un abonné désinscrit ne reçoit plus rien', () => {
    const listener = vi.fn();
    subscribeTargeting(listener)();
    startTargeting(targeting);
    expect(listener).not.toHaveBeenCalled();
  });
});
