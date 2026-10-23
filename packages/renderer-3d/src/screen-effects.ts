import type { AnimationRunner } from '@tannhauser/renderer/src/presentation/animation-queue';
import { BANNER_DURATIONS, bannerPose, type BannerPlan, type BannerText } from '@tannhauser/renderer/src/presentation/banner';
import type { ScreenEffects } from '@tannhauser/renderer/src/presentation/effects';
import type { ReducedMotion } from '@tannhauser/renderer/src/presentation/reduced-motion';
import { TIMING } from '@tannhauser/renderer/src/presentation/timing';
import { cssColor, playerColor, playerShapeGlyph } from '@tannhauser/renderer/src/palette';

export interface DomScreenEffectsOptions {
  readonly runner: AnimationRunner;
  readonly reducedMotion: ReducedMotion;
  /** Titre et sous-titre (localisés par le client) d'une bannière : le renderer ne contient aucun texte de jeu. */
  readonly bannerText: (plan: BannerPlan) => BannerText;
  /** Débogage : la bannière reste affichée (figée) jusqu'à la suivante. */
  readonly holdBanners?: boolean;
  /** Élément qui reçoit les bannières ; au-dessus du HUD, laisse passer les clics. */
  readonly host?: HTMLElement;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Bannières et avis en DOM (aucun moteur graphique) : mêmes durées et poses que le rendu 2D (`bannerPose`). */
export class DomScreenEffects implements ScreenEffects {
  private readonly layer = document.createElement('div');
  private readonly runner: AnimationRunner;
  private readonly reducedMotion: ReducedMotion;
  private readonly bannerText: (plan: BannerPlan) => BannerText;
  private readonly holdBanners: boolean;
  private bannerToken = 0;
  private bannerEl: HTMLElement | null = null;
  private noticeToken = 0;
  private noticeEl: HTMLElement | null = null;

  constructor(options: DomScreenEffectsOptions) {
    this.runner = options.runner;
    this.reducedMotion = options.reducedMotion;
    this.bannerText = options.bannerText;
    this.holdBanners = options.holdBanners ?? false;
    Object.assign(this.layer.style, { position: 'fixed', inset: '0', zIndex: '1000', pointerEvents: 'none', overflow: 'hidden' });
    (options.host ?? document.body).appendChild(this.layer);
  }

  private get reduced(): boolean {
    return this.reducedMotion.value;
  }

  destroy(): void {
    this.layer.remove();
    this.bannerEl = null;
    this.noticeEl = null;
  }

  banner(plan: BannerPlan, playerIndex: number | null): void {
    this.bannerEl?.remove();
    const token = (this.bannerToken += 1);
    const text = this.bannerText(plan);
    const accent = playerIndex === null ? '#ced4da' : cssColor(playerColor(playerIndex));
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '28%',
      minWidth: 'min(520px, 86vw)',
      padding: '14px 28px',
      textAlign: 'center',
      color: '#fff',
      font: `800 30px/1.15 ${FONT}`,
      background: 'linear-gradient(90deg, rgba(11,13,16,0), rgba(11,13,16,.92) 14%, rgba(11,13,16,.92) 86%, rgba(11,13,16,0))',
      borderTop: `3px solid ${accent}`,
      borderBottom: `3px solid ${accent}`,
      textShadow: '0 2px 6px #000',
      transformOrigin: 'center',
    });
    const title = document.createElement('div');
    title.textContent = `${playerIndex === null ? '' : `${playerShapeGlyph(playerIndex)} `}${text.title}`;
    const sub = document.createElement('div');
    sub.textContent = text.subtitle;
    Object.assign(sub.style, { font: `600 15px/1.3 ${FONT}`, opacity: '.85', marginTop: '4px' });
    el.append(title, sub);
    this.layer.appendChild(el);
    this.bannerEl = el;
    const apply = (progress: number, reduced: boolean): void => {
      const pose = bannerPose(progress, reduced);
      el.style.opacity = String(pose.alpha);
      el.style.transform = `translate(calc(-50% + ${pose.slide * 40}vw), -50%) scale(${pose.scale}, ${pose.scale * pose.open})`;
    };
    if (this.holdBanners) {
      apply(0.5, false); // débogage : la bannière reste affichée jusqu'à la suivante
      return;
    }
    apply(0, this.reduced);
    this.runner.add({
      duration: this.reduced ? TIMING.staticHold : BANNER_DURATIONS[plan.kind],
      update: (p) => {
        if (token === this.bannerToken) apply(p, this.reduced);
      },
      finish: () => {
        if (token !== this.bannerToken) return; // remplacée : déjà retirée
        el.remove();
        this.bannerEl = null;
      },
    });
  }

  notice(text: string): void {
    this.noticeEl?.remove();
    const token = (this.noticeToken += 1);
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '14px',
      transform: 'translateX(-50%)',
      padding: '8px 18px',
      color: '#fff',
      font: `700 16px/1.2 ${FONT}`,
      background: 'rgba(11,13,16,.88)',
      border: '1.5px solid #fff',
      borderRadius: '8px',
      textShadow: '0 1px 3px #000',
    });
    this.layer.appendChild(el);
    this.noticeEl = el;
    this.runner.add({
      duration: this.reduced ? TIMING.staticHold : TIMING.notice,
      update: (p) => {
        if (token !== this.noticeToken || this.reduced) return;
        el.style.opacity = String(p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1);
      },
      finish: () => {
        el.remove();
        if (this.noticeEl === el) this.noticeEl = null;
      },
    });
  }
}
