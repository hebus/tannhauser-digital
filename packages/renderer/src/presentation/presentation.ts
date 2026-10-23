import type { GameEvent, GameState } from '@tannhauser/core';
import { explosionZone } from '@tannhauser/core';
import type { PresentationControls } from '../contract';
import { AnimationQueue, AnimationRunner, action } from './animation-queue';
import type { BannerPlan } from './banner';
import type { ScreenEffects, WorldEffects } from './effects';
import type { Point } from './path-geometry';
import { planPresentation, type PresentationStep } from './plan';
import type { ReducedMotion } from './reduced-motion';

export interface PresentationOptions {
  readonly reducedMotion: ReducedMotion;
  /**
   * Exécuteur d'interpolations PARTAGÉ avec les effets : ils y planifient leurs animations non bloquantes, et la présentation
   * n'est « au repos » que lorsqu'il est vide.
   */
  readonly runner: AnimationRunner;
  readonly world: WorldEffects;
  readonly screen: ScreenEffects;
}

/**
 * Présentation animée pilotée par les événements du moteur, commune à tous les rendus : elle décide de l'ordre, de la file
 * d'attente et de l'état « au repos », et délègue le dessin à `WorldEffects` et `ScreenEffects`. Ne mute jamais `GameState`.
 * Les mouvements et éclairs bloquants passent par une file sérialisée ; flashs, chiffres et bannières sont des effets
 * parallèles non bloquants déclenchés au bon moment de la file. `skip()` termine tout instantanément.
 */
export class Presentation implements PresentationControls {
  private readonly queue: AnimationQueue;
  private readonly runner: AnimationRunner;
  private readonly reducedMotion: ReducedMotion;
  private readonly world: WorldEffects;
  private readonly screen: ScreenEffects;
  private readonly unsubscribe: () => void;
  private destroyed = false;
  private idleCallbacks: Array<() => void> = [];

  constructor(options: PresentationOptions) {
    this.reducedMotion = options.reducedMotion;
    this.runner = options.runner;
    this.world = options.world;
    this.screen = options.screen;
    this.queue = new AnimationQueue({ reduced: this.reducedMotion.value });
    this.unsubscribe = this.reducedMotion.subscribe((reduced) => {
      this.queue.reduced = reduced;
    });
  }

  get idle(): boolean {
    return this.queue.idle && this.runner.size === 0;
  }

  /** À appeler AVANT la mise à jour de l'affichage des pions : fixe les pions mobiles à leur case de départ. */
  play(events: readonly GameEvent[], prev: GameState | null, next: GameState): void {
    if (this.destroyed) return;
    for (const step of planPresentation(events, prev, next)) this.schedule(step, next);
  }

  tick(dtMs: number, nowMs: number): void {
    if (this.destroyed) return;
    this.queue.tick(dtMs);
    this.runner.tick(dtMs);
    this.world.tick?.(nowMs);
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
    this.screen.banner(plan, index >= 0 ? index : null);
  }

  /** Joue tout de suite une explosion sur une case (débogage : `?debugExplosion=1`) ; en jeu, elle vient de l'événement GRENADE_EXPLODED. */
  explode(nodeId: string, state: GameState): void {
    if (this.destroyed) return;
    this.schedule({ kind: 'explosion', nodeId, zone: explosionZone(state.board, nodeId) }, state);
  }

  /** Message court non bloquant au centre haut de l'écran (ex. changement d'option). */
  notify(text: string): void {
    this.screen.notice(text);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.queue.clear();
    this.runner.clear();
    this.world.destroy();
    this.screen.destroy();
  }

  private schedule(step: PresentationStep, next: GameState): void {
    const at = (nodeId: string): Point | null => {
      const n = next.board.nodes[nodeId];
      return n ? { x: n.x, y: n.y } : null;
    };
    switch (step.kind) {
      case 'move': {
        const points: Point[] = step.nodeIds.flatMap((id) => {
          const p = at(id);
          return p ? [p] : [];
        });
        this.queue.enqueue(this.world.move(step.characterId, points));
        break;
      }
      case 'damage':
        this.queue.enqueue(action(() => this.world.damage(step.targetId, step.wounds)));
        break;
      case 'callout': {
        const node = step.nodeId !== undefined ? at(step.nodeId) : null;
        this.queue.enqueue(action(() => this.world.callout(step.tone, step.characterId, node)));
        break;
      }
      case 'explosion': {
        const node = at(step.nodeId);
        if (node) this.queue.enqueue(action(() => this.world.explosion(step.nodeId, node, step.zone, next)));
        break;
      }
      case 'defeat':
        this.queue.enqueue(action(() => this.world.defeat(step.characterId)));
        break;
      case 'overwatchPlaced':
        this.queue.enqueue(action(() => this.world.overwatchRing(step.characterId)));
        break;
      case 'overwatchTriggered':
        this.queue.enqueue(this.world.overwatchBolt(step.overwatcherId, at(step.nodeId), step.targetId));
        break;
      case 'flagPlaced': {
        const node = at(step.nodeId);
        if (node) this.queue.enqueue(action(() => this.world.flagPlaced(node, step.ownerIndex)));
        break;
      }
      case 'flagCaptured':
      case 'flagDropped':
      case 'flagPlanted': {
        const node = at(step.nodeId);
        const kind = step.kind === 'flagCaptured' ? 'captured' : step.kind === 'flagDropped' ? 'dropped' : 'planted';
        if (node) this.queue.enqueue(action(() => this.world.flagFlight(kind, node, step.characterId, step.ownerIndex)));
        break;
      }
      case 'banner': {
        const index = next.players.findIndex((p) => p.id === step.banner.playerId);
        this.queue.enqueue(action(() => this.screen.banner(step.banner, index >= 0 ? index : null)));
        break;
      }
    }
  }
}
