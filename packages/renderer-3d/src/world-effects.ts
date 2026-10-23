import * as THREE from 'three';
import type { GameState } from '@tannhauser/core';
import { AnimationRunner, action, tween, type Animation } from '@tannhauser/renderer/src/presentation/animation-queue';
import { easeInOutQuad, easeOutCubic, lerp } from '@tannhauser/renderer/src/presentation/easing';
import type { WorldEffects } from '@tannhauser/renderer/src/presentation/effects';
import { explosionSparks, shakeOffset, sootPuffs, sparkAt } from '@tannhauser/renderer/src/presentation/explosion-model';
import { pointAlong, type Point } from '@tannhauser/renderer/src/presentation/path-geometry';
import type { CalloutTone } from '@tannhauser/renderer/src/presentation/plan';
import type { ReducedMotion } from '@tannhauser/renderer/src/presentation/reduced-motion';
import { TIMING } from '@tannhauser/renderer/src/presentation/timing';
import { playerColor } from '@tannhauser/renderer/src/palette';
import { TILE_RADIUS } from './board-scene';
import { createPennant } from './flags-3d';
import type { PawnLayer } from './pawn-layer';
import { createTextSprite, disposeTree } from './three-util';

/** Durée de l'explosion (boule de feu, onde, étincelles) ; la suie dure un peu plus longtemps. */
const EXPLOSION_MS = 750;
const SOOT_MS = 1100;
const R = TILE_RADIUS;
/** Hauteur de poitrine d'un pion : les effets s'y accrochent. */
const CHEST = 18;

export interface ThreeWorldEffectsOptions {
  readonly pawns: PawnLayer;
  /** Même exécuteur que celui de `Presentation` : les effets y planifient leurs interpolations. */
  readonly runner: AnimationRunner;
  readonly reducedMotion: ReducedMotion;
  /** Texte (localisé par le client) du message flottant d'une issue : « Raté ! », « Passage forcé ! », « Bloqué ! ». */
  readonly calloutText: (tone: CalloutTone) => string;
  /** Décale une case du plateau (secousse d'explosion) ; `(0, 0)` la remet en place. */
  readonly shakeNode?: (nodeId: string, dx: number, dy: number) => void;
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Effets monde en Three.js : mêmes durées et mêmes déclencheurs que le rendu 2D (`Presentation` décide, ceci dessine). */
export class ThreeWorldEffects implements WorldEffects {
  /** Effets en coordonnées plateau : à ajouter à la scène. */
  readonly layer = new THREE.Group();

  private readonly pawns: PawnLayer;
  private readonly runner: AnimationRunner;
  private readonly reducedMotion: ReducedMotion;
  private readonly calloutText: (tone: CalloutTone) => string;
  private readonly shakeNode: ((nodeId: string, dx: number, dy: number) => void) | undefined;
  private explosions = 0;

  constructor(options: ThreeWorldEffectsOptions) {
    this.pawns = options.pawns;
    this.runner = options.runner;
    this.reducedMotion = options.reducedMotion;
    this.calloutText = options.calloutText;
    this.shakeNode = options.shakeNode;
  }

  private get reduced(): boolean {
    return this.reducedMotion.value;
  }

  tick(nowMs: number): void {
    this.pawns.tick(nowMs, this.reduced);
  }

  destroy(): void {
    this.pawns.clearDisplay();
    for (const child of [...this.layer.children]) this.dispose(child);
  }

  private add<T extends THREE.Object3D>(obj: T): T {
    this.layer.add(obj);
    return obj;
  }

  private dispose(obj: THREE.Object3D): void {
    this.layer.remove(obj);
    disposeTree(obj);
  }

  private fade(obj: THREE.Mesh | THREE.Sprite, alpha: number): void {
    (obj.material as THREE.Material).opacity = alpha;
  }

  private ring(inner: number, outer: number, color: number, y = 3): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.position.y = y;
    return this.add(mesh);
  }

  // ---- Déplacement : tween case par case ---------------------------------------------------------------

  move(characterId: string, points: readonly Point[]): Animation {
    // Le pion reste à l'origine du tracé jusqu'à ce que la file atteigne cette animation.
    const first = points[0];
    if (first && points.length > 1) this.pawns.setDisplay(characterId, { x: first.x, y: first.y });
    const steps = Math.max(0, points.length - 1);
    const duration = Math.min(TIMING.moveMax, TIMING.moveStep * steps);
    return tween({
      duration,
      ease: easeInOutQuad,
      onUpdate: (p) => {
        const pos = pointAlong(points, p);
        const base = this.pawns.basePosition(characterId);
        const end = points[points.length - 1];
        // Décalage de slot (plusieurs pions sur un nœud) : on garde l'écart entre la case finale et la position réelle.
        const slotDx = base && end ? base.x - end.x : 0;
        const slotDy = base && end ? base.y - end.y : 0;
        // Un petit saut à chaque case franchie.
        const lift = this.reduced ? 0 : Math.abs(Math.sin(p * steps * Math.PI)) * 7;
        this.pawns.setDisplay(characterId, { x: pos.x + slotDx * p, y: pos.y + slotDy * p, lift });
      },
      onFinish: () => this.pawns.setDisplay(characterId, { x: undefined, y: undefined, lift: undefined }),
    });
  }

  // ---- Dégâts : flash, chiffre flottant, secousse -----------------------------------------------------

  damage(targetId: string, wounds: number): void {
    const at = this.pawns.tokenPosition(targetId);
    if (!at) return;
    const text = this.add(createTextSprite(`−${wounds}`, { color: hex(0xffa8a8), worldHeight: 16 }));
    const y0 = 62;
    text.position.set(at.x, y0, at.y);
    if (this.reduced) {
      // Pas de mouvement : le chiffre reste affiché un instant, immobile.
      this.runner.add({ duration: TIMING.staticHold, finish: () => this.dispose(text) });
      return;
    }
    this.runner.add(
      tween({
        duration: TIMING.floater,
        ease: easeOutCubic,
        onUpdate: (p) => {
          text.position.y = y0 + 28 * p;
          this.fade(text, p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4);
        },
        onFinish: () => this.dispose(text),
      }),
    );
    const flash = this.add(
      new THREE.Mesh(new THREE.SphereGeometry(R * 0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })),
    );
    flash.position.set(at.x, CHEST, at.y);
    this.runner.add(
      tween({
        duration: TIMING.flash,
        onUpdate: (p) => {
          this.fade(flash, 0.9 * (1 - p));
          flash.scale.setScalar(1 + 0.4 * p);
        },
        onFinish: () => this.dispose(flash),
      }),
    );
    this.runner.add(
      tween({
        duration: TIMING.shake,
        onUpdate: (p) => this.pawns.setDisplay(targetId, { dx: Math.sin(p * Math.PI * 6) * 4 * (1 - p) }),
        onFinish: () => this.pawns.setDisplay(targetId, { dx: 0 }),
      }),
    );
  }

  // ---- Issue sans dégât : message flottant (+ anneau pour le passage en force) ------------------------------

  callout(tone: CalloutTone, characterId: string | undefined, node: Point | null): void {
    const at = (characterId !== undefined ? this.pawns.tokenPosition(characterId) : null) ?? node;
    if (!at) return;
    const color = tone === 'forced' ? 0x8ce99a : tone === 'blocked' ? 0xff8787 : 0xdee2e6;
    const text = this.add(createTextSprite(this.calloutText(tone), { color: hex(color), worldHeight: 18 }));
    const y0 = 66;
    text.position.set(at.x, y0, at.y);
    if (tone !== 'miss') this.burst(at, color);
    if (this.reduced) {
      this.runner.add({ duration: TIMING.staticHold, finish: () => this.dispose(text) });
      return;
    }
    const baseScale = text.scale.clone();
    this.runner.add(
      tween({
        duration: TIMING.callout,
        ease: easeOutCubic,
        onUpdate: (p) => {
          text.position.y = y0 + 22 * p;
          text.scale.copy(baseScale).multiplyScalar(p < 0.15 ? lerp(0.6, 1.15, p / 0.15) : lerp(1.15, 1, Math.min(1, (p - 0.15) * 4)));
          this.fade(text, p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
        },
        onFinish: () => this.dispose(text),
      }),
    );
  }

  // ---- Explosion ---------------------------------------------------------------------------------------

  explosion(nodeId: string, at: Point, zone: readonly string[], state: GameState): void {
    this.playExplosion(at, `boom:${nodeId}:${(this.explosions += 1)}`);
    this.zoneShake(nodeId, zone, state);
  }

  /** Boule de feu, onde de choc, étincelles et suie ; en mouvement réduit, un flash et un anneau fixes. */
  private playExplosion(at: Point, seed: string): void {
    if (this.reduced) {
      const mark = this.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd04a, transparent: true, opacity: 0.45, depthWrite: false })));
      mark.position.set(at.x, CHEST, at.y);
      this.runner.add({ duration: 1000, finish: () => this.dispose(mark) });
      return;
    }
    const additive = (color: number, opacity = 1): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

    const fire = this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), additive(0xff9a2e)));
    fire.position.set(at.x, CHEST, at.y);
    const core = this.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.6, 10, 8), additive(0xfff1a8)));
    core.position.set(at.x, CHEST, at.y);
    const wave = this.ring(R * 0.8, R * 0.95, 0xffd04a, 4);
    wave.position.set(at.x, 4, at.y);
    this.runner.add(
      tween({
        duration: EXPLOSION_MS,
        ease: easeOutCubic,
        onUpdate: (p) => {
          fire.scale.setScalar(lerp(0.3, 2.1, p));
          this.fade(fire, 1 - p);
          core.scale.setScalar(lerp(0.4, 1.4, Math.min(1, p * 2.2)));
          this.fade(core, Math.max(0, 1 - p * 2.2));
          wave.scale.setScalar(lerp(1, 3.4, p));
          this.fade(wave, 0.9 * (1 - p));
        },
        onFinish: () => {
          this.dispose(fire);
          this.dispose(core);
          this.dispose(wave);
        },
      }),
    );

    for (const spark of explosionSparks(seed)) {
      const mesh = this.add(new THREE.Mesh(new THREE.TetrahedronGeometry(spark.size * 0.9), new THREE.MeshBasicMaterial({ color: spark.color, transparent: true, depthWrite: false })));
      const dx = Math.cos(spark.angle);
      const dz = Math.sin(spark.angle);
      this.runner.add(
        tween({
          duration: EXPLOSION_MS * spark.life,
          onUpdate: (p) => {
            const s = sparkAt(spark, p);
            mesh.position.set(at.x + dx * s.radius * R, CHEST + Math.sin(p * Math.PI) * 14, at.y + dz * s.radius * R);
            mesh.rotation.x += 0.4;
            this.fade(mesh, s.alpha);
          },
          onFinish: () => this.dispose(mesh),
        }),
      );
    }

    for (const puff of sootPuffs(seed)) {
      const mesh = this.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.45 * puff.size, 1), new THREE.MeshBasicMaterial({ color: 0x2a2826, transparent: true, depthWrite: false })));
      this.runner.add(
        tween({
          duration: SOOT_MS,
          onUpdate: (p) => {
            const q = Math.max(0, (p - puff.delay) / (1 - puff.delay));
            mesh.position.set(at.x + puff.dx * R * 0.6, CHEST + q * R * 1.4 * puff.rise, at.y + puff.dy * R * 0.6);
            mesh.scale.setScalar(1 + q * 0.8);
            this.fade(mesh, q <= 0 ? 0 : 0.55 * (1 - q));
          },
          onFinish: () => this.dispose(mesh),
        }),
      );
    }
  }

  /** La case visée vibre, les cases adjacentes sont ébranlées dans le sens de l'onde de choc. */
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
      const amp = isCenter ? 8 : 6;
      // Les voisines sont touchées juste après la case visée : la secousse se propage.
      const delay = isCenter ? 0 : 0.12;
      const riders = state.characters.filter((c) => c.nodeId === id).map((c) => c.id);
      const apply = (dx: number, dy: number): void => {
        this.shakeNode?.(id, dx, dy);
        for (const characterId of riders) this.pawns.setDisplay(characterId, { dx, dy });
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
    const at = this.pawns.tokenPosition(characterId);
    if (!at) return;
    const cross = this.add(createTextSprite('✕', { color: hex(0xff4d4f), worldHeight: 30 }));
    cross.position.set(at.x, 40, at.y);
    const baseScale = cross.scale.clone();
    this.runner.add(
      tween({
        duration: TIMING.defeat,
        ease: easeOutCubic,
        onStart: () => this.pawns.setDisplay(characterId, { alpha: 0.15 }),
        onUpdate: (p) => {
          cross.scale.copy(baseScale).multiplyScalar(lerp(1.6, 1, p));
          this.fade(cross, 1 - p);
          this.pawns.setDisplay(characterId, { alpha: lerp(0.15, 0.6, p) });
        },
        onFinish: () => {
          this.dispose(cross);
          this.pawns.setDisplay(characterId, { alpha: undefined });
        },
      }),
    );
  }

  // ---- Overwatch --------------------------------------------------------------------------------------

  overwatchRing(characterId: string): void {
    const at = this.pawns.tokenPosition(characterId);
    if (!at) return;
    const ring = this.ring(R * 0.62 + 4, R * 0.62 + 8, 0xffffff, 4);
    ring.position.set(at.x, 4, at.y);
    if (this.reduced) {
      this.runner.add({ duration: TIMING.staticHold, finish: () => this.dispose(ring) });
      return;
    }
    this.runner.add(
      tween({
        duration: TIMING.ring,
        ease: easeOutCubic,
        onUpdate: (p) => {
          ring.scale.setScalar(1 + 1.4 * p);
          this.fade(ring, 1 - p);
        },
        onFinish: () => this.dispose(ring),
      }),
    );
  }

  overwatchBolt(overwatcherId: string, to: Point | null, targetId: string): Animation {
    let bolt: THREE.Group | null = null;
    const build = (): THREE.Group | null => {
      const from = this.pawns.tokenPosition(overwatcherId);
      const dest = to ?? this.pawns.tokenPosition(targetId);
      if (!from || !dest) return null;
      const dx = dest.x - from.x;
      const dy = dest.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const segments = 6;
      const pts: THREE.Vector3[] = [new THREE.Vector3(from.x, CHEST + 8, from.y)];
      for (let i = 1; i < segments; i += 1) {
        const t = i / segments;
        const jitter = (i % 2 === 0 ? 1 : -1) * 9;
        pts.push(new THREE.Vector3(from.x + dx * t + nx * jitter, CHEST + 8, from.y + dy * t + ny * jitter));
      }
      pts.push(new THREE.Vector3(dest.x, CHEST + 8, dest.y));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
      const g = new THREE.Group();
      const tube = (radius: number, color: number, opacity: number): THREE.Mesh =>
        new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false }));
      g.add(tube(5, 0xff7a00, 0.35), tube(3, 0xffc247, 0.9), tube(1.4, 0xffffff, 1));
      const hit = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3bf, transparent: true, opacity: 0.75, depthTest: false }));
      hit.position.set(dest.x, CHEST + 8, dest.y);
      g.add(hit);
      g.renderOrder = 8;
      this.add(g);
      return g;
    };
    if (this.reduced) {
      // Mouvement réduit : pas d'animation bloquante, l'éclair reste affiché fixe un instant.
      return action(() => {
        const g = build();
        if (g) this.runner.add({ duration: TIMING.staticHold, finish: () => this.dispose(g) });
      });
    }
    return tween({
      duration: TIMING.bolt,
      onStart: () => {
        bolt = build();
      },
      onUpdate: (p) => {
        if (bolt) bolt.visible = p < 0.5 || Math.floor(p * 20) % 2 === 0;
      },
      onFinish: () => {
        if (bolt) this.dispose(bolt);
        bolt = null;
      },
    });
  }

  // ---- Drapeaux (Capture du drapeau) ------------------------------------------------------------------

  flagPlaced(at: Point, ownerIndex: number): void {
    this.burst(at, playerColor(ownerIndex));
  }

  flagFlight(kind: 'captured' | 'dropped' | 'planted', node: Point, characterId: string, ownerIndex: number): void {
    const carrier = (): Point | null => this.pawns.tokenPosition(characterId);
    if (kind === 'captured') this.fly(node, carrier, ownerIndex, false);
    else this.fly(carrier() ?? node, () => ({ x: node.x, y: node.y }), ownerIndex, kind === 'planted');
  }

  /** Anneau qui s'élargit autour d'une case (apparition d'un drapeau, arrivée d'un fanion) ; fixe et bref en mouvement réduit. */
  private burst(at: Point, color: number, gold = false): void {
    const ring = this.ring(R * 0.8, R * 0.8 + 4, gold ? 0xf0c040 : color, 4);
    ring.position.set(at.x, 4, at.y);
    if (this.reduced) {
      this.runner.add({ duration: TIMING.staticHold, finish: () => this.dispose(ring) });
      return;
    }
    this.runner.add(
      tween({
        duration: TIMING.ring,
        ease: easeOutCubic,
        onUpdate: (p) => {
          ring.scale.setScalar(1 + 0.9 * p);
          this.fade(ring, 1 - p);
        },
        onFinish: () => this.dispose(ring),
      }),
    );
  }

  /** Fanion fantôme qui vole de `from` vers `to`, puis anneau à l'arrivée. En mouvement réduit : seul l'anneau reste un instant. */
  private fly(from: Point, to: () => Point | null, ownerIndex: number, planted: boolean): void {
    const dest = to();
    if (!dest) return;
    const color = playerColor(ownerIndex);
    if (this.reduced) {
      this.burst(dest, color, planted);
      return;
    }
    const ghost = this.add(createPennant(ownerIndex, 1, planted));
    ghost.position.set(from.x, 0, from.y);
    this.runner.add(
      tween({
        duration: TIMING.flagFlight,
        ease: easeInOutQuad,
        onUpdate: (p) => {
          ghost.position.set(lerp(from.x, dest.x, p), 8 + Math.sin(p * Math.PI) * 22, lerp(from.y, dest.y, p));
        },
        onFinish: () => {
          this.dispose(ghost);
          this.burst(dest, color, planted);
        },
      }),
    );
  }
}
