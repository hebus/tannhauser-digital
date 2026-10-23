import { Container, Graphics, Text } from 'pixi.js';
import type { GameState } from '@tannhauser/core';
import { NODE_RADIUS } from '../board-view';
import { createPennant, type CharacterLayer } from '../character-layer';
import { playerColor } from '../palette';
import { AnimationRunner, action, tween, type Animation } from './animation-queue';
import { easeInOutQuad, easeOutCubic, lerp } from './easing';
import { pointAlong, type Point } from './path-geometry';
import { BANNER_DURATIONS, bannerPose, type BannerPlan, type BannerText } from './banner';
import { createBannerView, type BannerView } from './banner-view';
import { playExplosion } from './explosion-effect';
import { shakeOffset } from './explosion-model';
import type { ScreenEffects, WorldEffects } from './effects';
import type { CalloutTone } from './plan';
import type { ReducedMotion } from './reduced-motion';
import { TIMING } from './timing';

export interface PixiWorldEffectsOptions {
  readonly characters: CharacterLayer;
  /** Même exécuteur que celui de `Presentation` : les effets y planifient leurs interpolations. */
  readonly runner: AnimationRunner;
  readonly reducedMotion: ReducedMotion;
  /** Texte (localisé par le client) du message flottant d'une issue : « Raté ! », « Passage forcé ! », « Bloqué ! ». */
  readonly calloutText: (tone: CalloutTone) => string;
  /**
   * Décale le dessin d'une case du plateau (secousse d'explosion) ; `(0, 0)` la remet en place. Le renderer ne détient pas le
   * `BoardView` (reconstruit quand une porte change) : celui qui construit les effets le fournit.
   */
  readonly shakeNode?: (nodeId: string, dx: number, dy: number) => void;
}

/**
 * Effets monde en Pixi 2D : dessinent dans `layer` (à ajouter au monde, au-dessus des personnages) et pilotent des surcharges
 * d'affichage de `CharacterLayer`. Ne mutent jamais `GameState`.
 */
export class PixiWorldEffects implements WorldEffects {
  /** Effets en coordonnées plateau : à ajouter au monde, au-dessus des personnages. */
  readonly layer = new Container();

  private readonly characters: CharacterLayer;
  private readonly runner: AnimationRunner;
  private readonly reducedMotion: ReducedMotion;
  private readonly calloutText: (tone: CalloutTone) => string;
  private readonly shakeNode: ((nodeId: string, dx: number, dy: number) => void) | undefined;
  private textScale = 1;
  private explosions = 0;

  constructor(options: PixiWorldEffectsOptions) {
    this.characters = options.characters;
    this.runner = options.runner;
    this.reducedMotion = options.reducedMotion;
    this.calloutText = options.calloutText;
    this.shakeNode = options.shakeNode;
    this.layer.label = 'PresentationWorld';
  }

  private get reduced(): boolean {
    return this.reducedMotion.value;
  }

  /** Échelle des textes monde (inverse du zoom caméra) pour rester lisibles. */
  setTextScale(k: number): void {
    this.textScale = k;
  }

  tick(nowMs: number): void {
    this.characters.tick(nowMs, this.reduced);
  }

  destroy(): void {
    this.characters.clearDisplay();
    this.layer.destroy({ children: true });
  }

  // ---- Déplacement : tween case par case ---------------------------------------------------------------

  move(characterId: string, points: readonly Point[]): Animation {
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

  damage(targetId: string, wounds: number): void {
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
    this.layer.addChild(text);

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
    this.layer.addChild(flash);
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

  // ---- Issue sans dégât : message flottant (+ anneau et secousse pour le passage en force) ---------------

  callout(tone: CalloutTone, characterId: string | undefined, node: Point | null): void {
    const at = (characterId !== undefined ? this.characters.tokenPosition(characterId) : null) ?? node;
    if (!at) return;
    const color = tone === 'forced' ? 0x8ce99a : tone === 'blocked' ? 0xff8787 : 0xdee2e6;
    const k = this.textScale;
    const text = new Text({
      text: this.calloutText(tone),
      style: { fill: color, fontSize: 26, fontWeight: '900', stroke: { color: 0x000000, width: 6 } },
    });
    text.anchor.set(0.5, 1);
    text.scale.set(k);
    text.position.set(at.x, at.y - NODE_RADIUS * 0.8);
    this.layer.addChild(text);
    if (tone !== 'miss') this.flagBurst(at, color);
    if (this.reduced) {
      this.runner.add({ duration: TIMING.staticHold, finish: () => text.destroy() });
      return;
    }
    this.runner.add(
      tween({
        duration: TIMING.callout,
        ease: easeOutCubic,
        onUpdate: (p) => {
          if (text.destroyed) return;
          text.position.y = at.y - NODE_RADIUS * 0.8 - 30 * k * p;
          text.scale.set(k * (p < 0.15 ? lerp(0.6, 1.15, p / 0.15) : lerp(1.15, 1, Math.min(1, (p - 0.15) * 4))));
          text.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        },
        onFinish: () => text.destroy(),
      }),
    );
  }

  // ---- Explosion et secousse : la case visée vibre, les cases adjacentes sont ébranlées dans le sens de l'onde de choc ----

  explosion(nodeId: string, at: Point, zone: readonly string[], state: GameState): void {
    playExplosion(this.runner, this.layer, at, NODE_RADIUS, `boom:${nodeId}:${(this.explosions += 1)}`, this.reduced);
    this.zoneShake(nodeId, zone, state);
  }

  private zoneShake(centerId: string, zone: readonly string[], state: GameState): void {
    if (this.reduced) return;
    const center = state.board.nodes[centerId];
    if (!center) return;
    for (const id of zone) {
      const node = state.board.nodes[id];
      if (!node) continue;
      const isCenter = id === centerId;
      // Direction : radiale pour les cases voisines (l'onde les pousse), verticale pour la case visée.
      const angle = isCenter ? -Math.PI / 2 : Math.atan2(node.y - center.y, node.x - center.x);
      const amp = isCenter ? 7 : 5;
      // Les voisines sont touchées juste après la case visée : la secousse se propage.
      const delay = isCenter ? 0 : 0.12;
      const riders = state.characters.filter((c) => c.nodeId === id).map((c) => c.id);
      const apply = (dx: number, dy: number): void => {
        this.shakeNode?.(id, dx, dy);
        for (const characterId of riders) this.characters.setDisplay(characterId, { dx, dy });
      };
      this.runner.add(
        tween({
          duration: TIMING.blastShake,
          onUpdate: (p) => {
            const q = Math.max(0, (p - delay) / (1 - delay));
            const o = shakeOffset(q, amp, angle);
            apply(o.dx, o.dy);
          },
          onFinish: () => apply(0, 0),
        }),
      );
    }
  }

  // ---- Défaite : fondu + croix -----------------------------------------------------------------------

  defeat(characterId: string): void {
    if (this.reduced) return;
    const at = this.characters.tokenPosition(characterId);
    if (!at) return;
    const cross = new Graphics();
    const r = NODE_RADIUS * 0.7;
    cross.moveTo(-r, -r).lineTo(r, r).moveTo(r, -r).lineTo(-r, r).stroke({ width: 7, color: 0xff4d4f });
    cross.position.set(at.x, at.y);
    this.layer.addChild(cross);
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

  overwatchRing(characterId: string): void {
    const at = this.characters.tokenPosition(characterId);
    if (!at) return;
    const ring = new Graphics();
    ring.circle(0, 0, NODE_RADIUS * 0.62 + 8).stroke({ width: 4, color: 0xffffff });
    ring.position.set(at.x, at.y);
    this.layer.addChild(ring);
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

  overwatchBolt(overwatcherId: string, to: Point | null, targetId: string): Animation {
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
      const points: Point[] = [{ x: from.x, y: from.y }];
      for (let i = 1; i < segments; i += 1) {
        const t = i / segments;
        const jitter = (i % 2 === 0 ? 1 : -1) * 9;
        points.push({ x: from.x + dx * t + nx * jitter, y: from.y + dy * t + ny * jitter });
      }
      points.push({ x: dest.x, y: dest.y });
      // Pixi v8 démarre un NOUVEAU tracé après chaque `stroke()` : on retrace donc la ligne à chaque passe
      // (sinon seule la première passe, sombre, serait visible).
      const trace = (width: number, color: number, alpha: number): void => {
        g.moveTo(points[0]!.x, points[0]!.y);
        for (const p of points.slice(1)) g.lineTo(p.x, p.y);
        g.stroke({ width, color, alpha, join: 'round', cap: 'round' });
      };
      trace(16, 0xff7a00, 0.35); // halo orangé
      trace(9, 0xffc247, 0.9); // corps lumineux
      trace(4, 0xffffff, 1); // cœur blanc
      g.circle(dest.x, dest.y, 18).fill({ color: 0xfff3bf, alpha: 0.75 }).stroke({ width: 3, color: 0xff7a00 });
      g.circle(from.x, from.y, 12).fill({ color: 0xffffff, alpha: 0.8 });
      this.layer.addChild(g);
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

  // ---- Drapeaux (Capture du drapeau) ------------------------------------------------------------------

  flagPlaced(at: Point, ownerIndex: number): void {
    this.flagBurst(at, playerColor(ownerIndex));
  }

  flagFlight(kind: 'captured' | 'dropped' | 'planted', node: Point, characterId: string, ownerIndex: number): void {
    const carrier = (): Point | null => this.characters.tokenPosition(characterId);
    if (kind === 'captured') this.fly(node, carrier, ownerIndex, false);
    else this.fly(carrier() ?? node, () => ({ x: node.x, y: node.y }), ownerIndex, kind === 'planted');
  }

  /** Anneau qui s'élargit autour d'une case (apparition d'un drapeau, arrivée d'un fanion) ; fixe et bref en mouvement réduit. */
  private flagBurst(at: Point, color: number, gold = false): void {
    const ring = new Graphics();
    ring.circle(0, 0, NODE_RADIUS * 0.8).stroke({ width: 4, color: gold ? 0xf0c040 : color });
    ring.circle(0, 0, NODE_RADIUS * 0.8 + 6).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
    ring.position.set(at.x, at.y);
    this.layer.addChild(ring);
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
          ring.scale.set(1 + 0.9 * p);
          ring.alpha = 1 - p;
        },
        onFinish: () => ring.destroy(),
      }),
    );
  }

  /**
   * Fanion fantôme qui vole de `from` vers `to` (ramassage : case → porteur ; dépôt : porteur → case ; plantage : porteur → camp),
   * puis anneau à l'arrivée. Le vrai fanion est déjà dessiné d'après l'état : le fantôme n'est qu'un effet. En mouvement
   * réduit : aucun vol, seul l'anneau d'arrivée reste affiché un instant.
   */
  private fly(from: Point, to: () => Point | null, ownerIndex: number, planted: boolean): void {
    const dest = to();
    if (!dest) return;
    const color = playerColor(ownerIndex);
    if (this.reduced) {
      this.flagBurst(dest, color, planted);
      return;
    }
    const ghost = createPennant(ownerIndex, 1, planted);
    ghost.position.set(from.x, from.y);
    this.layer.addChild(ghost);
    this.runner.add(
      tween({
        duration: TIMING.flagFlight,
        ease: easeInOutQuad,
        onUpdate: (p) => {
          if (ghost.destroyed) return;
          ghost.position.set(lerp(from.x, dest.x, p), lerp(from.y, dest.y, p) - Math.sin(p * Math.PI) * 18);
          ghost.alpha = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
        },
        onFinish: () => {
          ghost.destroy({ children: true });
          this.flagBurst(dest, color, planted);
        },
      }),
    );
  }
}

export interface PixiScreenEffectsOptions {
  readonly runner: AnimationRunner;
  readonly reducedMotion: ReducedMotion;
  /** Taille de l'écran (px) pour centrer la bannière. */
  readonly screenSize: () => { width: number; height: number };
  /** Titre et sous-titre (localisés par le client) d'une bannière : le renderer ne contient aucun texte de jeu. */
  readonly bannerText: (plan: BannerPlan) => BannerText;
  /** Débogage : la bannière reste affichée (figée) jusqu'à la suivante au lieu de disparaître. */
  readonly holdBanners?: boolean;
}

/** Bannières et avis en Pixi : dessinés dans `layer`, à poser sur un canevas AU-DESSUS du HUD (hors monde). */
export class PixiScreenEffects implements ScreenEffects {
  /** Effets en coordonnées écran (bannière) : à ajouter à la scène, hors monde. */
  readonly layer = new Container();

  private readonly runner: AnimationRunner;
  private readonly reducedMotion: ReducedMotion;
  private readonly screenSize: () => { width: number; height: number };
  private readonly bannerText: (plan: BannerPlan) => BannerText;
  private readonly holdBanners: boolean;
  private bannerToken = 0;
  private bannerView: BannerView | null = null;
  private noticeToken = 0;
  private noticeView: Container | null = null;

  constructor(options: PixiScreenEffectsOptions) {
    this.runner = options.runner;
    this.reducedMotion = options.reducedMotion;
    this.screenSize = options.screenSize;
    this.bannerText = options.bannerText;
    this.holdBanners = options.holdBanners ?? false;
    this.layer.label = 'PresentationScreen';
  }

  private get reduced(): boolean {
    return this.reducedMotion.value;
  }

  destroy(): void {
    this.layer.destroy({ children: true });
  }

  /**
   * Bannière de grande transition : glisse + zoome à l'entrée, se maintient, sort en douceur. Une nouvelle bannière
   * REMPLACE proprement la précédente (jamais de superposition). En mouvement réduit : affichage fixe bref.
   */
  banner(plan: BannerPlan, playerIndex: number | null): void {
    this.bannerView?.destroy();
    const token = (this.bannerToken += 1);
    const view = createBannerView(plan.kind, this.bannerText(plan), playerIndex);
    const { width, height } = this.screenSize();
    view.container.position.set(width / 2, height * 0.28);
    this.layer.addChild(view.container);
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
  notice(text: string): void {
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
    this.layer.addChild(view);
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
