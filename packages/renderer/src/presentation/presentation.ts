import { Container, Graphics, Text } from 'pixi.js';
import type { GameEvent, GameState } from '@tannhauser/core';
import { NODE_RADIUS } from '../board-view';
import type { CharacterLayer } from '../character-layer';
import { AnimationQueue, AnimationRunner, action, tween, type Animation } from './animation-queue';
import { easeInOutQuad, easeOutCubic, lerp } from './easing';
import { pointAlong, type Point } from './path-geometry';
import { BANNER_DURATIONS, bannerPose, type BannerPlan, type BannerText } from './banner';
import { createBannerView, type BannerView } from './banner-view';
import { planPresentation, type PresentationStep } from './plan';
import type { ReducedMotion } from './reduced-motion';

/** Durées en ms (volontairement courtes : le jeu ne attend jamais les animations pour accepter une commande). */
export const TIMING = {
  moveStep: 130,
  moveMax: 900,
  flash: 220,
  floater: 900,
  shake: 260,
  defeat: 650,
  ring: 550,
  bolt: 380,
  /** Message court (changement d'option). Les durées des bannières sont dans `BANNER_DURATIONS`. */
  notice: 1400,
  /** Durée d'affichage statique des indicateurs en mouvement réduit (aucun mouvement). */
  staticHold: 1200,
} as const;

export interface PresentationOptions {
  readonly characters: CharacterLayer;
  readonly reducedMotion: ReducedMotion;
  /** Taille de l'écran (px) pour centrer la bannière. */
  readonly screenSize: () => { width: number; height: number };
  /** Titre et sous-titre (localisés par le client) d'une bannière : le renderer ne contient aucun texte de jeu. */
  readonly bannerText: (plan: BannerPlan) => BannerText;
  /** Débogage : la bannière reste affichée (figée) jusqu'à la suivante au lieu de disparaître. */
  readonly holdBanners?: boolean;
}

/**
 * Présentation animée pilotée par les événements du moteur. Ne mute jamais `GameState` :
 * elle ne pilote que des surcharges d'affichage (`CharacterLayer.setDisplay`) et des effets éphémères.
 * Les mouvements et éclairs bloquants passent par une file sérialisée ; flashs/chiffres/bannières sont des
 * effets parallèles non bloquants déclenchés au bon moment de la file. `skip()` termine tout instantanément.
 */
export class Presentation {
  /** Effets en coordonnées plateau : à ajouter au monde, au-dessus des personnages. */
  readonly worldLayer = new Container();
  /** Effets en coordonnées écran (bannière) : à ajouter à la scène, hors monde. */
  readonly screenLayer = new Container();

  private readonly queue: AnimationQueue;
  private readonly runner = new AnimationRunner();
  private readonly characters: CharacterLayer;
  private readonly reducedMotion: ReducedMotion;
  private readonly screenSize: () => { width: number; height: number };
  private readonly bannerText: (plan: BannerPlan) => BannerText;
  private readonly holdBanners: boolean;
  private readonly unsubscribe: () => void;
  private textScale = 1;
  private bannerToken = 0;
  private bannerView: BannerView | null = null;
  private noticeToken = 0;
  private noticeView: Container | null = null;
  private destroyed = false;
  private idleCallbacks: Array<() => void> = [];

  constructor(options: PresentationOptions) {
    this.characters = options.characters;
    this.reducedMotion = options.reducedMotion;
    this.screenSize = options.screenSize;
    this.bannerText = options.bannerText;
    this.holdBanners = options.holdBanners ?? false;
    this.worldLayer.label = 'PresentationWorld';
    this.screenLayer.label = 'PresentationScreen';
    this.queue = new AnimationQueue({ reduced: this.reducedMotion.value });
    this.unsubscribe = this.reducedMotion.subscribe((reduced) => {
      this.queue.reduced = reduced;
    });
  }

  get idle(): boolean {
    return this.queue.idle && this.runner.size === 0;
  }

  /** Échelle des textes monde (inverse du zoom caméra) pour rester lisibles. */
  setTextScale(k: number): void {
    this.textScale = k;
  }

  /** À appeler AVANT `CharacterLayer.update(next)` : fixe les pions mobiles à leur case de départ. */
  play(events: readonly GameEvent[], prev: GameState | null, next: GameState): void {
    if (this.destroyed) return;
    for (const step of planPresentation(events, prev, next)) this.schedule(step, next);
  }

  tick(dtMs: number, nowMs: number): void {
    if (this.destroyed) return;
    this.queue.tick(dtMs);
    this.runner.tick(dtMs);
    this.characters.tick(nowMs, this.reducedMotion.value);
    this.flushIdle();
  }

  /**
   * Appelle `callback` dès que toutes les animations et bannières sont terminées (tout de suite si c'est déjà le cas).
   * Sert à différer l'affichage des dialogues (réaction, fin de partie) jusqu'à la fin des animations.
   */
  onIdle(callback: () => void): void {
    if (this.destroyed || this.idle) callback();
    else this.idleCallbacks.push(callback);
  }

  private flushIdle(): void {
    if (this.idleCallbacks.length === 0 || !this.idle) return;
    const callbacks = this.idleCallbacks;
    this.idleCallbacks = [];
    for (const cb of callbacks) cb();
  }

  /** Termine instantanément toutes les animations (l'affichage rejoint immédiatement l'état). */
  skip(): void {
    if (this.destroyed) return;
    this.queue.skip();
    this.runner.skip();
    this.flushIdle();
  }

  /** Affiche immédiatement une bannière (remplace la courante) : sert au débogage (`?debugBanner=`). */
  announce(plan: BannerPlan, players?: readonly { readonly id: string }[]): void {
    if (this.destroyed) return;
    const index = players ? players.findIndex((p) => p.id === plan.playerId) : -1;
    this.showBanner(plan, index >= 0 ? index : null);
  }

  /** Message court non bloquant au centre haut de l'écran (ex. changement d'option). */
  notify(text: string): void {
    this.showNotice(text);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.queue.clear();
    this.runner.clear();
    this.characters.clearDisplay();
    this.worldLayer.destroy({ children: true });
    this.screenLayer.destroy({ children: true });
  }

  private get reduced(): boolean {
    return this.reducedMotion.value;
  }

  private schedule(step: PresentationStep, next: GameState): void {
    switch (step.kind) {
      case 'move':
        this.queue.enqueue(this.moveAnimation(step.characterId, step.nodeIds, next));
        break;
      case 'damage':
        this.queue.enqueue(action(() => this.damageEffects(step.targetId, step.wounds)));
        break;
      case 'defeat':
        this.queue.enqueue(action(() => this.defeatEffects(step.characterId)));
        break;
      case 'overwatchPlaced':
        this.queue.enqueue(action(() => this.ringEffect(step.characterId)));
        break;
      case 'overwatchTriggered': {
        const target = next.board.nodes[step.nodeId];
        this.queue.enqueue(this.boltAnimation(step.overwatcherId, target ? { x: target.x, y: target.y } : null, step.targetId));
        break;
      }
      case 'banner': {
        const index = next.players.findIndex((p) => p.id === step.banner.playerId);
        this.queue.enqueue(action(() => this.showBanner(step.banner, index >= 0 ? index : null)));
        break;
      }
    }
  }

  // ---- Déplacement : tween case par case ---------------------------------------------------------------

  private moveAnimation(characterId: string, nodeIds: readonly string[], next: GameState): Animation {
    const points: Point[] = nodeIds.flatMap((id) => {
      const n = next.board.nodes[id];
      return n ? [{ x: n.x, y: n.y }] : [];
    });
    // Le pion reste à l'origine du tracé jusqu'à ce que la file atteigne cette animation.
    const first = points[0];
    if (first && points.length > 1) this.characters.setDisplay(characterId, { x: first.x, y: first.y });
    const duration = Math.min(TIMING.moveMax, TIMING.moveStep * Math.max(0, points.length - 1));
    // Décalage de slot (plusieurs pions sur un nœud) : on garde l'écart entre la case finale et la position réelle.
    return tween({
      duration,
      ease: easeInOutQuad,
      onUpdate: (p) => {
        const pos = pointAlong(points, p);
        const base = this.characters.basePosition(characterId);
        const endNode = points[points.length - 1];
        const slotDx = base && endNode ? base.x - endNode.x : 0;
        const slotDy = base && endNode ? base.y - endNode.y : 0;
        this.characters.setDisplay(characterId, { x: pos.x + slotDx * p, y: pos.y + slotDy * p });
      },
      onFinish: () => this.characters.setDisplay(characterId, { x: undefined, y: undefined }),
    });
  }

  // ---- Dégâts : flash, chiffre flottant, secousse -----------------------------------------------------

  private damageEffects(targetId: string, wounds: number): void {
    const at = this.characters.tokenPosition(targetId);
    if (!at) return;
    const reduced = this.reduced;
    const k = this.textScale;

    const text = new Text({
      text: `−${wounds}`,
      style: { fill: 0xffa8a8, fontSize: 24, fontWeight: '900', stroke: { color: 0x000000, width: 5 } },
    });
    text.anchor.set(0.5, 1);
    text.scale.set(k);
    text.position.set(at.x, at.y - NODE_RADIUS * 0.8);
    this.worldLayer.addChild(text);

    if (reduced) {
      // Pas de mouvement : le chiffre reste affiché un instant, immobile.
      this.runner.add({ duration: TIMING.staticHold, finish: () => text.destroy() });
      return;
    }

    this.runner.add(
      tween({
        duration: TIMING.floater,
        ease: easeOutCubic,
        onUpdate: (p) => {
          if (text.destroyed) return;
          text.position.y = at.y - NODE_RADIUS * 0.8 - 36 * k * p;
          text.alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
        },
        onFinish: () => text.destroy(),
      }),
    );

    const flash = new Graphics();
    flash.circle(0, 0, NODE_RADIUS * 0.9).fill({ color: 0xffffff, alpha: 0.9 });
    flash.position.set(at.x, at.y);
    this.worldLayer.addChild(flash);
    this.runner.add(
      tween({
        duration: TIMING.flash,
        onUpdate: (p) => {
          if (flash.destroyed) return;
          flash.alpha = 1 - p;
          flash.scale.set(1 + 0.4 * p);
        },
        onFinish: () => flash.destroy(),
      }),
    );

    this.runner.add(
      tween({
        duration: TIMING.shake,
        onUpdate: (p) => this.characters.setDisplay(targetId, { dx: Math.sin(p * Math.PI * 6) * 4 * (1 - p) }),
        onFinish: () => this.characters.setDisplay(targetId, { dx: 0 }),
      }),
    );
  }

  // ---- Défaite : fondu + croix -----------------------------------------------------------------------

  private defeatEffects(characterId: string): void {
    if (this.reduced) return;
    const at = this.characters.tokenPosition(characterId);
    if (!at) return;
    const cross = new Graphics();
    const r = NODE_RADIUS * 0.7;
    cross.moveTo(-r, -r).lineTo(r, r).moveTo(r, -r).lineTo(-r, r).stroke({ width: 7, color: 0xff4d4f });
    cross.position.set(at.x, at.y);
    this.worldLayer.addChild(cross);
    this.runner.add(
      tween({
        duration: TIMING.defeat,
        ease: easeOutCubic,
        onStart: () => this.characters.setDisplay(characterId, { alpha: 0.15 }),
        onUpdate: (p) => {
          if (cross.destroyed) return;
          cross.scale.set(lerp(1.6, 1, p));
          cross.alpha = 1 - p;
          this.characters.setDisplay(characterId, { alpha: lerp(0.15, 0.6, p) });
        },
        onFinish: () => {
          cross.destroy();
          this.characters.setDisplay(characterId, { alpha: undefined });
        },
      }),
    );
  }

  // ---- Overwatch --------------------------------------------------------------------------------------

  private ringEffect(characterId: string): void {
    const at = this.characters.tokenPosition(characterId);
    if (!at) return;
    const ring = new Graphics();
    ring.circle(0, 0, NODE_RADIUS * 0.62 + 8).stroke({ width: 4, color: 0xffffff });
    ring.position.set(at.x, at.y);
    this.worldLayer.addChild(ring);
    if (this.reduced) {
      this.runner.add({ duration: TIMING.staticHold, finish: () => ring.destroy() });
      return;
    }
    this.runner.add(
      tween({
        duration: TIMING.ring,
        ease: easeOutCubic,
        onUpdate: (p) => {
          if (ring.destroyed) return;
          ring.scale.set(1 + 1.4 * p);
          ring.alpha = 1 - p;
        },
        onFinish: () => ring.destroy(),
      }),
    );
  }

  private boltAnimation(overwatcherId: string, to: Point | null, targetId: string): Animation {
    let bolt: Graphics | null = null;
    const build = (): Graphics | null => {
      const from = this.characters.tokenPosition(overwatcherId);
      const dest = to ?? this.characters.tokenPosition(targetId);
      if (!from || !dest) return null;
      const g = new Graphics();
      const dx = dest.x - from.x;
      const dy = dest.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const segments = 6;
      g.moveTo(from.x, from.y);
      for (let i = 1; i < segments; i += 1) {
        const t = i / segments;
        const jitter = (i % 2 === 0 ? 1 : -1) * 9;
        g.lineTo(from.x + dx * t + nx * jitter, from.y + dy * t + ny * jitter);
      }
      g.lineTo(dest.x, dest.y);
      g.stroke({ width: 8, color: 0x111111, alpha: 0.8 }).stroke({ width: 4, color: 0xfff3bf });
      this.worldLayer.addChild(g);
      return g;
    };
    if (this.reduced) {
      // Mouvement réduit : pas d'animation bloquante, l'éclair reste affiché fixe un instant.
      return action(() => {
        const g = build();
        if (g) this.runner.add({ duration: TIMING.staticHold, finish: () => g.destroy() });
      });
    }
    return tween({
      duration: TIMING.bolt,
      onStart: () => {
        bolt = build();
      },
      onUpdate: (p) => {
        if (bolt && !bolt.destroyed) bolt.alpha = p < 0.5 ? 1 : 1 - (p - 0.5) * 2;
      },
      onFinish: () => {
        bolt?.destroy();
        bolt = null;
      },
    });
  }

  // ---- Bannière ---------------------------------------------------------------------------------------

  /**
   * Bannière de grande transition : glisse + zoome à l'entrée, se maintient, sort en douceur. Une nouvelle bannière
   * REMPLACE proprement la précédente (jamais de superposition). En mouvement réduit : affichage fixe bref.
   */
  private showBanner(plan: BannerPlan, playerIndex: number | null): void {
    this.bannerView?.destroy();
    const token = (this.bannerToken += 1);
    const view = createBannerView(plan.kind, this.bannerText(plan), playerIndex);
    const { width, height } = this.screenSize();
    view.container.position.set(width / 2, height * 0.28);
    this.screenLayer.addChild(view.container);
    this.bannerView = view;
    const isCurrent = (): boolean => token === this.bannerToken && !view.container.destroyed;
    if (this.holdBanners) {
      view.setPose(bannerPose(0.5, false)); // débogage : la bannière reste affichée jusqu'à la suivante
      return;
    }
    view.setPose(bannerPose(0, this.reduced));
    this.runner.add({
      duration: this.reduced ? TIMING.staticHold : BANNER_DURATIONS[plan.kind],
      update: (p) => {
        if (isCurrent()) view.setPose(bannerPose(p, this.reduced));
      },
      finish: () => {
        if (token !== this.bannerToken) return; // remplacée : déjà détruite
        view.destroy();
        this.bannerView = null;
      },
    });
  }

  /** Message court non bloquant (ex. changement d'option), distinct des bannières : ne les remplace pas. */
  private showNotice(text: string): void {
    this.noticeView?.destroy({ children: true });
    const token = (this.noticeToken += 1);
    const label = new Text({ text, style: { fill: 0xffffff, fontSize: 18, fontWeight: '700', stroke: { color: 0x000000, width: 4 } } });
    label.anchor.set(0.5);
    const bg = new Graphics();
    bg.roundRect(-label.width / 2 - 18, -label.height / 2 - 8, label.width + 36, label.height + 16, 8).fill({ color: 0x0b0d10, alpha: 0.88 }).stroke({ width: 1.5, color: 0xffffff });
    const view = new Container();
    view.addChild(bg, label);
    const { width } = this.screenSize();
    view.position.set(width / 2, 28);
    this.screenLayer.addChild(view);
    this.noticeView = view;
    this.runner.add({
      duration: this.reduced ? TIMING.staticHold : TIMING.notice,
      update: (p) => {
        if (view.destroyed || token !== this.noticeToken || this.reduced) return;
        view.alpha = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      },
      finish: () => {
        if (!view.destroyed) view.destroy({ children: true });
        if (this.noticeView === view) this.noticeView = null;
      },
    });
  }
}
