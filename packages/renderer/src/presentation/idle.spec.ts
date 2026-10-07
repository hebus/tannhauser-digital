// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Presentation } from './presentation';
import { ReducedMotion } from './reduced-motion';

function make() {
  const characters = { tick: vi.fn(), setDisplay: vi.fn() };
  const presentation = new Presentation({
    characters: characters as never,
    reducedMotion: new ReducedMotion(),
    screenSize: () => ({ width: 800, height: 600 }),
    bannerText: () => ({ title: '', subtitle: '' }),
  });
  // Une animation en cours, sans passer par le rendu Pixi.
  const startAnimation = (duration: number): void => {
    (presentation as unknown as { runner: { add(a: object): void } }).runner.add({ duration, update: () => undefined, finish: () => undefined });
  };
  return { presentation, startAnimation };
}

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
