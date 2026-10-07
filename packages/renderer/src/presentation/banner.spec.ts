import { describe, expect, it } from 'vitest';
import { BANNER_DURATIONS, BANNER_ICONS, BANNER_PRIORITY, bannerPose, chooseBanner, type BannerKind, type BannerPlan } from './banner';

const plan = (kind: BannerKind): BannerPlan => ({ kind, turn: 1, playerId: 'p1' });

describe('chooseBanner', () => {
  it('une seule bannière : la plus significative du lot', () => {
    expect(chooseBanner([plan('turnOf'), plan('reaction'), plan('overwatchPhase')])?.kind).toBe('reaction');
    expect(chooseBanner([plan('turnOf'), plan('victory'), plan('turnStart')])?.kind).toBe('victory');
    expect(chooseBanner([plan('turnOf'), plan('activationPhase')])?.kind).toBe('activationPhase');
  });

  it('aucune candidate : aucune bannière ; ordre d’arrivée conservé à égalité', () => {
    expect(chooseBanner([])).toBeNull();
    const a = { ...plan('reaction'), overwatcherId: 'a' };
    const b = { ...plan('reaction'), overwatcherId: 'b' };
    expect(chooseBanner([a, b])).toBe(a);
  });

  it('chaque type a une priorité, une icône et une durée raisonnable (bannière finale plus longue)', () => {
    for (const kind of BANNER_PRIORITY) {
      expect(BANNER_ICONS[kind]).toBeTruthy();
      expect(BANNER_DURATIONS[kind]).toBeGreaterThanOrEqual(1500);
      if (kind !== 'victory') expect(BANNER_DURATIONS[kind]).toBeLessThanOrEqual(2300);
    }
    expect(BANNER_DURATIONS.victory).toBeGreaterThan(BANNER_DURATIONS.turnStart);
  });
});

describe('bannerPose', () => {
  it('entrée : arrive de la gauche, plus petite et transparente, puis se stabilise', () => {
    const start = bannerPose(0, false);
    expect(start.slide).toBeCloseTo(-1, 6);
    expect(start.scale).toBeLessThan(1);
    expect(start.alpha).toBe(0);
    const settled = bannerPose(0.2, false);
    expect(settled).toMatchObject({ slide: 0, alpha: 1, open: 1 });
  });

  it('ease-out-back : le glissement dépasse légèrement sa cible avant de se stabiliser', () => {
    const slides = Array.from({ length: 20 }, (_, i) => bannerPose((i / 20) * 0.2, false).slide);
    expect(Math.max(...slides)).toBeGreaterThan(0);
  });

  it('maintien : pleine opacité ; sortie : opacité décroissante jusqu’à 0', () => {
    expect(bannerPose(0.5, false).alpha).toBe(1);
    expect(bannerPose(0.9, false).alpha).toBeLessThan(1);
    expect(bannerPose(1, false).alpha).toBe(0);
    expect(bannerPose(0.9, false).alpha).toBeGreaterThan(bannerPose(0.97, false).alpha);
  });

  it('mouvement réduit : pose fixe à tout instant (ni glissement, ni zoom, ni fondu)', () => {
    for (const p of [0, 0.1, 0.5, 0.9, 1]) expect(bannerPose(p, true)).toEqual({ slide: 0, scale: 1, alpha: 1, open: 1 });
  });

  it('borne la progression hors de [0,1]', () => {
    expect(bannerPose(-5, false)).toEqual(bannerPose(0, false));
    expect(bannerPose(5, false)).toEqual(bannerPose(1, false));
  });
});
