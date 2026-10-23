import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BoardState, GameState } from '@tannhauser/core';
import type { BoardRenderer, BoardRendererFactory, BoardRendererOptions, HighlightTone } from '@tannhauser/renderer/src/contract';
import { AnimationRunner } from '@tannhauser/renderer/src/presentation/animation-queue';
import { OVERLAY_COLORS } from '@tannhauser/renderer/src/palette';
import { easeInOutQuad } from '@tannhauser/renderer/src/presentation/easing';
import type { PathPreview } from '@tannhauser/renderer/src/presentation/path-geometry';
import { Presentation } from '@tannhauser/renderer/src/presentation/presentation';
import { buildBoardScene, WALL_HEIGHT, type BoardScene } from './board-scene';
import { FlagLayer3D } from './flags-3d';
import { PawnLayer } from './pawn-layer';
import { DomScreenEffects } from './screen-effects';
import { SmokeLayer3D } from './smoke-3d';
import { clearGroup, createTextSprite } from './three-util';
import { ThreeWorldEffects } from './world-effects';

/** Un clic doit rester sous ce déplacement cumulé (px) : au-delà, c'est un glissement de caméra. */
const CLICK_SLOP = 4;
/** Durée du recentrage de la caméra sur une case (ms). */
const FOCUS_DURATION = 450;
const BACKGROUND = 0x14161a;
/** Direction (du point visé vers la caméra) du cadrage : vue de dessus inclinée, lisible pour un jeu tactique. */
const VIEW_DIRECTION = new THREE.Vector3(0, 0.82, 0.6).normalize();

const doorSignature = (board: BoardState): string => Object.values(board.doors).map((d) => `${d.id}:${d.state}`).join('|');

interface Focus {
  elapsed: number;
  readonly delta: THREE.Vector3;
  readonly targetFrom: THREE.Vector3;
  readonly cameraFrom: THREE.Vector3;
}

/**
 * Rendu 3D (Three.js, style low poly) du plateau. Même contrat que le rendu 2D : le client ne parle qu'à `BoardRenderer`.
 * La caméra est orbitale (glisser = tourner, molette = zoom, clic droit = déplacer) ; les murs qui masquent un pion
 * sont percés autour de lui. Les bannières et avis sont en DOM : ce rendu n'a aucune dépendance à Pixi.
 */
export class ThreeBoardRenderer implements BoardRenderer {
  readonly presentation: Presentation;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 5, 40000);
  private readonly pawns = new PawnLayer();
  private readonly flags = new FlagLayer3D();
  private readonly smoke = new SmokeLayer3D();
  private readonly pathGroup = new THREE.Group();
  private readonly worldEffects: ThreeWorldEffects;
  private readonly screenEffects: DomScreenEffects;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly raycaster = new THREE.Raycaster();
  private readonly lifetime = new AbortController();
  private readonly clock = new THREE.Clock();

  private webgl: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private boardScene: BoardScene;
  private board: BoardState;
  private shownDoors: string;
  private fitDistance = 1;
  private focus: Focus | null = null;
  private hover: string | null = null;
  // Surcouches demandées par le client, rejouées quand le plateau est reconstruit (porte ouverte ou fermée).
  private reach: { ids: string[]; tone: HighlightTone } = { ids: [], tone: 'move' };
  private targets: string[] = [];
  private los: { origin: string; visible: ReadonlySet<string> } | null = null;
  private showIds = false;

  constructor(private readonly options: BoardRendererOptions) {
    this.board = options.board;
    this.shownDoors = doorSignature(options.board);
    this.boardScene = this.createBoardScene();

    const runner = new AnimationRunner();
    this.worldEffects = new ThreeWorldEffects({
      pawns: this.pawns,
      runner,
      reducedMotion: options.reducedMotion,
      calloutText: options.calloutText,
      // Le plateau est reconstruit quand une porte change : on lit toujours le courant.
      shakeNode: (nodeId, dx, dy) => this.boardScene.setNodeOffset(nodeId, dx, dy),
    });
    this.screenEffects = new DomScreenEffects({
      runner,
      reducedMotion: options.reducedMotion,
      bannerText: options.bannerText,
      ...(options.holdBanners !== undefined ? { holdBanners: options.holdBanners } : {}),
    });
    this.presentation = new Presentation({ reducedMotion: options.reducedMotion, runner, world: this.worldEffects, screen: this.screenEffects });

    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x20232b, 1.6), this.sun, this.sun.target);
    this.scene.add(this.pawns.group, this.flags.group, this.smoke.group, this.worldEffects.layer, this.pathGroup);
    this.configureLights();
  }

  async init(host: HTMLElement): Promise<void> {
    const webgl = new THREE.WebGLRenderer({ antialias: true });
    webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    webgl.shadowMap.enabled = true;
    webgl.domElement.style.display = 'block';
    webgl.domElement.style.touchAction = 'none'; // les gestes tactiles sont gérés par les contrôles, pas par le navigateur
    host.appendChild(webgl.domElement);
    this.webgl = webgl;

    const controls = new OrbitControls(this.camera, webgl.domElement);
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minDistance = 120;
    this.controls = controls;

    this.resize();
    this.listen();
    webgl.setAnimationLoop(this.frame);
  }

  destroy(): void {
    this.lifetime.abort();
    this.webgl?.setAnimationLoop(null);
    this.presentation.destroy();
    this.controls?.dispose();
    this.boardScene.dispose();
    this.pawns.destroy();
    this.flags.destroy();
    this.smoke.destroy();
    clearGroup(this.pathGroup);
    this.webgl?.dispose();
    this.webgl?.domElement.remove();
    this.webgl = null;
  }

  // ---- Affichage -----------------------------------------------------------------------------------------

  update(state: GameState): void {
    this.board = state.board;
    // Une porte ouverte ou fermée doit changer de dessin : on reconstruit le plateau.
    if (doorSignature(state.board) !== this.shownDoors) {
      this.scene.remove(this.boardScene.group);
      this.boardScene.dispose();
      this.boardScene = this.createBoardScene();
      this.shownDoors = doorSignature(state.board);
    }
    this.pawns.update(state, this.options.characterLabels(state));
    this.flags.update(state);
    this.smoke.update(state);
  }

  setShowNodeIds(show: boolean): void {
    this.showIds = show;
    this.boardScene.setShowIds(show);
  }

  showReachable(nodeIds: Iterable<string>, tone: HighlightTone = 'move'): void {
    this.reach = { ids: [...nodeIds], tone };
    this.boardScene.setReachable(this.reach.ids, tone);
  }

  showTargets(nodeIds: Iterable<string>): void {
    this.targets = [...nodeIds];
    this.boardScene.setTargets(this.targets);
  }

  showLineOfSight(origin: string | null, visible: ReadonlySet<string> | null): void {
    this.los = origin !== null && visible !== null ? { origin, visible } : null;
    this.boardScene.setLineOfSight(origin, visible);
  }

  showPath(preview: PathPreview | null): void {
    clearGroup(this.pathGroup);
    if (!preview || preview.points.length < 2) return;
    const material = new THREE.MeshBasicMaterial({ color: OVERLAY_COLORS.path });
    const y = 6;
    const pts = preview.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 2, 5), material);
      bar.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
      bar.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      this.pathGroup.add(bar);
    }
    for (const p of pts.slice(1, -1)) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 6), material);
      dot.position.set(p.x, y, p.y);
      this.pathGroup.add(dot);
    }
    const end = pts[pts.length - 1]!;
    // Losange à l'arrivée, libellé du coût en PM au-dessus.
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(9), material);
    diamond.position.set(end.x, y + 6, end.y);
    this.pathGroup.add(diamond);
    const label = createTextSprite(`${preview.cost} PM`, { worldHeight: 12, color: '#111111', stroke: '#ffe066' });
    label.position.set(end.x, y + 30, end.y);
    this.pathGroup.add(label);
  }

  private createBoardScene(): BoardScene {
    const built = buildBoardScene(this.board, this.options.layout, this.options.label);
    built.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.scene.add(built.group);
    built.setReachable(this.reach.ids, this.reach.tone);
    built.setTargets(this.targets);
    built.setLineOfSight(this.los?.origin ?? null, this.los?.visible ?? null);
    built.setShowIds(this.showIds);
    return built;
  }

  /** Éclairage et ombres : l'étendue de l'ombre suit la taille du plateau. */
  private configureLights(): void {
    const b = this.boardScene.bounds;
    const span = Math.max(b.width, b.height);
    const center = new THREE.Vector3(b.x + b.width / 2, 0, b.y + b.height / 2);
    this.sun.position.copy(center).add(new THREE.Vector3(span * 0.35, span * 0.6, span * 0.25));
    this.sun.target.position.copy(center);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 4 });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  private readonly frame = (): void => {
    const { webgl, controls } = this;
    if (!webgl || !controls) return;
    const dtMs = Math.min(100, this.clock.getDelta() * 1000);
    this.presentation.tick(dtMs, performance.now());
    this.smoke.tick(dtMs, this.options.reducedMotion.value);
    this.stepFocus(dtMs);
    controls.update();
    this.boardScene.setOccluders(this.pawns.chestPositions());
    webgl.render(this.scene, this.camera);
  };

  // ---- Caméra --------------------------------------------------------------------------------------------

  private size(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  private resize(): void {
    const { width, height } = this.size();
    this.webgl?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  fit(): void {
    const { controls } = this;
    if (!controls) return;
    const { width: W, height: H } = this.size();
    const { left, right, top } = this.options.insets();
    const freeW = Math.max(200, W - left - right);
    const freeH = Math.max(200, H - top);
    const b = this.boardScene.bounds;
    const center = new THREE.Vector3(b.x + b.width / 2, 0, b.y + b.height / 2);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tanH = tanV * this.camera.aspect;
    const elevation = Math.asin(VIEW_DIRECTION.y);
    // La zone libre (hors HUD) est une fraction de la vue : le plateau doit y tenir en entier.
    const needWidth = b.width / 2 / (tanH * (freeW / W));
    const needDepth = ((b.height / 2) * Math.sin(elevation) + (WALL_HEIGHT / 2) * Math.cos(elevation)) / (tanV * (freeH / H));
    const distance = Math.max(needWidth, needDepth) * 1.08 + (b.height / 2) * Math.cos(elevation);
    this.fitDistance = distance;
    this.focus = null;
    controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(VIEW_DIRECTION, distance);
    controls.maxDistance = distance * 2.5;
    // Décale l'image pour centrer le plateau dans la zone libre plutôt que dans la fenêtre.
    this.camera.setViewOffset(W, H, -(left - right) / 2, -top / 2, W, H);
    this.camera.updateProjectionMatrix();
    controls.update();
  }

  isZoomedIn(): boolean {
    return !!this.controls && this.camera.position.distanceTo(this.controls.target) < this.fitDistance * 0.9;
  }

  focusNode(nodeId: string): void {
    const { controls } = this;
    const node = this.board.nodes[nodeId];
    if (!controls || !node) return;
    const to = new THREE.Vector3(node.x, 0, node.y);
    const delta = to.clone().sub(controls.target);
    if (this.options.reducedMotion.value) {
      controls.target.add(delta);
      this.camera.position.add(delta);
      return;
    }
    this.focus = { elapsed: 0, delta, targetFrom: controls.target.clone(), cameraFrom: this.camera.position.clone() };
  }

  private stepFocus(dtMs: number): void {
    const { focus, controls } = this;
    if (!focus || !controls) return;
    focus.elapsed += dtMs;
    const p = Math.min(1, focus.elapsed / FOCUS_DURATION);
    const e = easeInOutQuad(p);
    controls.target.copy(focus.targetFrom).addScaledVector(focus.delta, e);
    this.camera.position.copy(focus.cameraFrom).addScaledVector(focus.delta, e);
    if (p >= 1) this.focus = null;
  }

  // ---- Entrées : clic, survol (la caméra est gérée par OrbitControls) ---------------------------------

  /** Case sous un point de l'écran (pixels du canevas) : un pion compte pour sa case ; `null` hors plateau. */
  private nodeAt(clientX: number, clientY: number): string | null {
    const el = this.webgl?.domElement;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObjects([...this.boardScene.pickables, ...this.pawns.pickables()], false)[0];
    if (!hit) return null;
    const characterId = hit.object.userData.characterId as string | undefined;
    return characterId !== undefined ? (this.pawns.nodeOf(characterId) ?? null) : ((hit.object.userData.nodeId as string | undefined) ?? null);
  }

  private listen(): void {
    const el = this.webgl!.domElement;
    const { signal } = this.lifetime;
    const { events } = this.options;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let multiTouch = false; // un geste à plusieurs doigts a eu lieu : le relâchement n'est pas un clic
    el.addEventListener(
      'pointerdown',
      (e) => {
        events.onInteract(); // un clic termine les animations en cours
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
          moved = 0;
          multiTouch = false;
        } else multiTouch = true;
      },
      { signal },
    );
    window.addEventListener(
      'pointermove',
      (e) => {
        const prev = pointers.get(e.pointerId);
        if (prev) {
          moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          return;
        }
        const next = e.target === el ? this.nodeAt(e.clientX, e.clientY) : null;
        if (next !== this.hover) {
          this.hover = next;
          events.onHover(next);
        }
      },
      { signal },
    );
    const end = (e: PointerEvent, click: boolean): void => {
      if (!pointers.has(e.pointerId)) return;
      const wasClick = click && pointers.size === 1 && !multiTouch && moved < CLICK_SLOP;
      pointers.delete(e.pointerId);
      if (wasClick && e.target === el) {
        const id = this.nodeAt(e.clientX, e.clientY);
        if (id) events.onPick(id);
      }
    };
    window.addEventListener('pointerup', (e) => end(e, true), { signal });
    window.addEventListener('pointercancel', (e) => end(e, false), { signal });
    window.addEventListener(
      'resize',
      () => {
        this.resize();
        this.fit();
      },
      { signal },
    );
  }
}

/** Fabrique du rendu 3D (Three.js). */
export const createThreeRenderer: BoardRendererFactory = (options) => new ThreeBoardRenderer(options);
