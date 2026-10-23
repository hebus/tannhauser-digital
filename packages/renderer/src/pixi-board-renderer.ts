import { Application, Container } from 'pixi.js';
import type { BoardState, GameState } from '@tannhauser/core';
import { BoardView, LAYOUT_NODE_RADIUS, NODE_RADIUS } from './board-view';
import { Camera } from './camera';
import { CharacterLayer } from './character-layer';
import type { BoardRenderer, BoardRendererFactory, BoardRendererOptions, HighlightTone } from './contract';
import { FlagLayer } from './flag-layer';
import { HIGHLIGHT_COLORS } from './palette';
import { HighlightLayer } from './highlight-layer';
import { OverlayLayer } from './overlay-layer';
import { SmokeLayer } from './smoke-layer';
import { AnimationRunner } from './presentation/animation-queue';
import { PixiScreenEffects, PixiWorldEffects } from './presentation/pixi-effects';
import { textScaleForZoom, type PathPreview } from './presentation/path-geometry';
import { Presentation } from './presentation/presentation';

/** Durée du recentrage de la caméra sur une case (ms). */
const FOCUS_DURATION = 450;
/** Un clic doit rester sous ce déplacement cumulé (px) : au-delà, c'est un glissement de caméra. */
const CLICK_SLOP = 4;

const doorSignature = (board: BoardState): string => Object.values(board.doors).map((d) => `${d.id}:${d.state}`).join('|');

/**
 * Rendu 2D en Pixi : caméra (pan, zoom, pincement), plateau, pions, surcouches, effets et entrées pointeur.
 * Deux canevas : le monde, et un second, transparent, posé AU-DESSUS du HUD (en DOM) pour les bannières et les avis ;
 * il laisse passer les clics.
 */
export class PixiBoardRenderer implements BoardRenderer {
  readonly presentation: Presentation;

  private readonly app = new Application();
  private readonly overlayApp = new Application();
  private readonly world = new Container();
  private readonly highlight: HighlightLayer;
  private readonly overlays: OverlayLayer;
  private readonly characters = new CharacterLayer();
  private readonly flags: FlagLayer;
  private readonly smoke: SmokeLayer;
  private readonly worldEffects: PixiWorldEffects;
  private readonly screenEffects: PixiScreenEffects;
  private readonly lifetime = new AbortController();

  private boardView: BoardView;
  private board: BoardState;
  private shownDoors: string;
  private showIds = false;
  private camera: Camera | null = null;
  private fitZoom = 1;
  private cameraTween: ((ticker: { deltaMS: number }) => void) | null = null;
  private lastPath: PathPreview | null = null;
  private hover: string | null = null;

  constructor(private readonly options: BoardRendererOptions) {
    this.board = options.board;
    this.shownDoors = doorSignature(options.board);
    this.boardView = this.createBoardView();
    this.highlight = new HighlightLayer(options.board);
    this.overlays = new OverlayLayer(options.board);
    const radius = options.layout ? LAYOUT_NODE_RADIUS : NODE_RADIUS;
    this.flags = new FlagLayer(radius);
    this.smoke = new SmokeLayer(radius);

    const runner = new AnimationRunner();
    this.worldEffects = new PixiWorldEffects({
      characters: this.characters,
      runner,
      reducedMotion: options.reducedMotion,
      calloutText: options.calloutText,
      // Le plateau est reconstruit quand une porte change : on lit toujours le courant.
      shakeNode: (nodeId, dx, dy) => this.boardView.setNodeOffset(nodeId, dx, dy),
    });
    this.screenEffects = new PixiScreenEffects({
      runner,
      reducedMotion: options.reducedMotion,
      screenSize: () => ({ width: this.app.screen.width, height: this.app.screen.height }),
      bannerText: options.bannerText,
      ...(options.holdBanners !== undefined ? { holdBanners: options.holdBanners } : {}),
    });
    this.presentation = new Presentation({ reducedMotion: options.reducedMotion, runner, world: this.worldEffects, screen: this.screenEffects });
    this.world.addChild(this.boardView, this.highlight, this.overlays, this.flags, this.characters, this.smoke, this.worldEffects.layer);
  }

  async init(host: HTMLElement): Promise<void> {
    const { app, overlayApp } = this;
    await app.init({ resizeTo: window, background: 0x14161a, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
    host.appendChild(app.canvas);
    app.stage.addChild(this.world);
    await overlayApp.init({ resizeTo: window, backgroundAlpha: 0, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
    Object.assign(overlayApp.canvas.style, { position: 'fixed', inset: '0', zIndex: '1000', pointerEvents: 'none' });
    document.body.appendChild(overlayApp.canvas);
    overlayApp.stage.addChild(this.screenEffects.layer);

    this.camera = new Camera(this.world, { width: app.screen.width, height: app.screen.height });
    this.fitZoom = this.camera.zoom;
    app.ticker.add(this.tickAnimations);
    this.listen();
  }

  destroy(): void {
    this.lifetime.abort();
    this.app.ticker.remove(this.tickAnimations);
    this.cancelCameraTween();
    this.presentation.destroy();
    this.overlayApp.destroy(true, { children: true });
    this.app.destroy(true, { children: true });
  }

  // ---- Affichage -----------------------------------------------------------------------------------------

  update(state: GameState): void {
    this.board = state.board;
    // Une porte ouverte ou fermée doit changer de dessin : on reconstruit le plateau.
    if (doorSignature(state.board) !== this.shownDoors) this.rebuildBoardView();
    this.characters.update(state, this.options.characterLabels(state));
    this.flags.update(state);
    this.smoke.update(state);
  }

  setShowNodeIds(show: boolean): void {
    this.showIds = show;
    this.rebuildBoardView();
  }

  showReachable(nodeIds: Iterable<string>, tone: HighlightTone = 'move'): void {
    this.highlight.show(nodeIds, HIGHLIGHT_COLORS[tone]);
  }

  showTargets(nodeIds: Iterable<string>): void {
    this.overlays.showTargets(nodeIds);
  }

  showLineOfSight(origin: string | null, visible: ReadonlySet<string> | null): void {
    this.overlays.showLineOfSight(origin, visible);
  }

  showPath(preview: PathPreview | null): void {
    this.lastPath = preview;
    this.redrawPath();
  }

  private createBoardView(): BoardView {
    return new BoardView(this.board, { showNodeIds: this.showIds, layout: this.options.layout, label: this.options.label });
  }

  private rebuildBoardView(): void {
    this.world.removeChild(this.boardView);
    this.boardView.destroy({ children: true });
    this.boardView = this.createBoardView();
    this.world.addChildAt(this.boardView, 0);
    this.shownDoors = doorSignature(this.board);
  }

  /** Le libellé du coût suit le zoom : l'aperçu est donc redessiné quand le zoom change. */
  private redrawPath(): void {
    this.overlays.showPath(this.lastPath, this.camera ? textScaleForZoom(this.camera.zoom) : 1);
  }

  private syncTextScale(): void {
    if (!this.camera) return;
    const k = textScaleForZoom(this.camera.zoom);
    this.characters.setTextScale(k);
    this.worldEffects.setTextScale(k);
  }

  private readonly tickAnimations = (ticker: { deltaMS: number }): void => {
    this.presentation.tick(ticker.deltaMS, performance.now());
    this.smoke.tick(ticker.deltaMS, this.options.reducedMotion.value);
  };

  // ---- Caméra --------------------------------------------------------------------------------------------

  fit(): void {
    const { camera, app } = this;
    if (!camera) return;
    const { left, right, top } = this.options.insets();
    camera.resize(Math.max(200, app.screen.width - left - right), Math.max(200, app.screen.height - top));
    camera.fit(this.boardView.bounds2D());
    camera.pan(left, top);
    camera.resize(app.screen.width, app.screen.height);
    this.fitZoom = camera.zoom;
    this.syncTextScale();
    this.redrawPath();
  }

  isZoomedIn(): boolean {
    return !!this.camera && this.camera.zoom > this.fitZoom * 1.1;
  }

  private cancelCameraTween(): void {
    if (this.cameraTween) this.app.ticker.remove(this.cameraTween);
    this.cameraTween = null;
  }

  focusNode(nodeId: string): void {
    const { camera, app, world } = this;
    const n = this.board.nodes[nodeId];
    if (!camera || !n) return;
    const { left, right, top } = this.options.insets();
    const cx = left + (app.screen.width - left - right) / 2;
    const cy = top + (app.screen.height - top) / 2;
    const z = camera.zoom;
    const tx = cx - n.x * z;
    const ty = cy - n.y * z;
    this.cancelCameraTween();
    if (this.options.reducedMotion.value) {
      world.position.set(tx, ty);
      this.redrawPath();
      return;
    }
    const sx = world.x;
    const sy = world.y;
    let elapsed = 0;
    const step = (ticker: { deltaMS: number }): void => {
      elapsed += ticker.deltaMS;
      const p = Math.min(1, elapsed / FOCUS_DURATION);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      world.position.set(sx + (tx - sx) * e, sy + (ty - sy) * e);
      this.redrawPath();
      if (p >= 1) this.cancelCameraTween();
    };
    this.cameraTween = step;
    app.ticker.add(step);
  }

  // ---- Entrées : pointeur (souris, doigt, stylet), molette, redimensionnement ---------------------------

  /** Case sous un point de l'écran (coordonnées du canevas), ou `null`. */
  private nodeAt(sx: number, sy: number): string | null {
    const { world } = this;
    const wx = (sx - world.x) / world.scale.x;
    const wy = (sy - world.y) / world.scale.y;
    let best: { id: string; d: number } | null = null;
    for (const n of Object.values(this.board.nodes)) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= NODE_RADIUS * 1.3 && (!best || d < best.d)) best = { id: n.id, d };
    }
    return best?.id ?? null;
  }

  private listen(): void {
    const { app, options } = this;
    const camera = this.camera!;
    const { signal } = this.lifetime;
    const { events } = options;
    // Pointeurs actifs : un seul = glisser pour déplacer / cliquer ; deux = pincer pour zoomer et déplacer.
    app.canvas.style.touchAction = 'none'; // les gestes tactiles sont gérés ici, pas par le navigateur
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let multiTouch = false; // un geste à deux doigts a eu lieu : le relâchement n'est pas un clic
    const pinchState = () => {
      const [a, b] = [...pointers.values()];
      return { cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2, dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
    };
    app.canvas.addEventListener(
      'pointerdown',
      (e) => {
        events.onInteract(); // un clic termine les animations en cours
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        app.canvas.setPointerCapture?.(e.pointerId);
        if (pointers.size === 1) {
          moved = 0;
          multiTouch = false;
        } else multiTouch = true;
      },
      { signal },
    );
    const endPointer = (e: PointerEvent, click: boolean) => {
      if (!pointers.has(e.pointerId)) return;
      const wasClick = click && pointers.size === 1 && !multiTouch && moved < CLICK_SLOP;
      pointers.delete(e.pointerId);
      if (wasClick && e.target === app.canvas) {
        const id = this.nodeAt(e.offsetX, e.offsetY);
        if (id) events.onPick(id);
      }
    };
    window.addEventListener('pointerup', (e) => endPointer(e, true), { signal });
    window.addEventListener('pointercancel', (e) => endPointer(e, false), { signal });
    window.addEventListener(
      'pointermove',
      (e) => {
        const prev = pointers.get(e.pointerId);
        if (prev) {
          if (pointers.size >= 2) {
            const before = pinchState();
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const after = pinchState();
            const rect = app.canvas.getBoundingClientRect();
            if (before.dist > 0) camera.zoomAt(after.dist / before.dist, after.cx - rect.left, after.cy - rect.top);
            camera.pan(after.cx - before.cx, after.cy - before.cy);
            this.syncTextScale();
            this.redrawPath();
          } else {
            const dx = e.clientX - prev.x;
            const dy = e.clientY - prev.y;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            moved += Math.abs(dx) + Math.abs(dy);
            if (moved >= CLICK_SLOP) camera.pan(dx, dy);
          }
          return;
        }
        const next = e.target === app.canvas ? this.nodeAt(e.offsetX, e.offsetY) : null;
        if (next !== this.hover) {
          this.hover = next;
          events.onHover(next);
        }
      },
      { signal },
    );
    app.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        camera.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.offsetX, e.offsetY);
        this.syncTextScale();
        this.redrawPath();
      },
      { passive: false, signal },
    );
    window.addEventListener(
      'resize',
      () => {
        camera.resize(app.screen.width, app.screen.height);
        this.fit();
      },
      { signal },
    );
  }
}

/** Fabrique du rendu 2D (Pixi). */
export const createPixiRenderer: BoardRendererFactory = (options) => new PixiBoardRenderer(options);
