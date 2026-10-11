import { Container, Sprite, Texture } from 'pixi.js';
import { smokeSpread, type GameState } from '@tannhauser/core';
import { NODE_RADIUS } from './board-view';
import { cloudFade, edgePuffs, smokePuffs } from './smoke-model';

const TEXTURE_PX = 128;
const FADE_MS = 700;
/** Les cases atteintes par propagation sont plus claires que la case d'origine : la source se lit encore. */
const SPREAD_ALPHA = 0.78;

/** Disque flou (dégradé radial blanc → transparent), teinté par bouffée. Créé une fois, à la demande (le canevas n'existe qu'au navigateur). */
const puffTextures = new Map<number, Texture>();
/** `body` = opacité du milieu du dégradé : 0,55 pour les cases, 0,7 (plus plein) pour les volutes d'arête. */
function getPuffTexture(body: number): Texture {
  const cached = puffTextures.get(body);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_PX;
  canvas.height = TEXTURE_PX;
  const ctx = canvas.getContext('2d')!;
  const half = TEXTURE_PX / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.55, `rgba(255,255,255,${body})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  const texture = Texture.from(canvas);
  puffTextures.set(body, texture);
  return texture;
}

/** Une bouffée vue de la couche : `place` calcule sa position, son échelle (en rayons de nœud) et son opacité à l'instant `t` (s). */
interface PuffView {
  readonly sprite: Sprite;
  readonly place: (t: number) => { x: number; y: number; scale: number; alpha: number };
}

interface Cloud {
  readonly container: Container;
  readonly puffs: readonly PuffView[];
  /** Épaisseur affichée (0..1), qui rejoint en douceur l'épaisseur voulue quand les tours passent. */
  thickness: number;
  target: number;
  /** Gain d'opacité et plafond propres au type de nuage (cases ou arêtes). */
  readonly gain: number;
  readonly cap: number;
  /** Plancher de densité : fraction de l'opacité conservée quand l'épaisseur tombe à 0. */
  readonly floor: number;
  /** Temps écoulé depuis l'apparition, et depuis la disparition (null : toujours présent). */
  age: number;
  leaving: number | null;
}

/**
 * Couche de fumée : reproduit la propagation de la règle (`smokeSpread` du moteur). Un nuage dense sur chaque case
 * d'origine, un nuage plus léger sur toute case qui partage une couleur avec elle, et de petites volutes le long des
 * arêtes qui relient deux cases enfumées. Lecture seule de l'état ; chaque nuage apparaît et disparaît en fondu.
 * En mouvement réduit : bouffées immobiles.
 */
export class SmokeLayer extends Container {
  private readonly clouds = new Map<string, Cloud>();
  private time = 0;
  private reduced = false;

  constructor(private readonly nodeRadius: number = NODE_RADIUS) {
    super();
    this.label = 'SmokeLayer';
    this.eventMode = 'none';
  }

  /** Synchronise les nuages avec l'état : crée les nouveaux, marque les disparus pour le fondu de sortie. */
  update(state: GameState): void {
    const spread = smokeSpread(state);
    const wanted = new Set<string>();
    for (const id of spread.nodes) {
      const node = state.board.nodes[id];
      if (!node) continue;
      const key = `n:${id}`;
      wanted.add(key);
      this.ensure(key, spread.intensity.get(id) ?? 1, (thickness) => this.nodeCloud(key, node.x, node.y, spread.origins.has(id), thickness));
    }
    for (const { from, to, intensity } of spread.edges) {
      const a = state.board.nodes[from];
      const b = state.board.nodes[to];
      if (!a || !b) continue;
      const key = `e:${from}>${to}`;
      wanted.add(key);
      this.ensure(key, intensity, (thickness) => this.edgeCloud(key, a, b, thickness));
    }
    for (const [key, cloud] of this.clouds) if (!wanted.has(key) && cloud.leaving === null) cloud.leaving = 0;
    this.pose();
  }

  tick(dtMs: number, reduced: boolean): void {
    this.reduced = reduced;
    this.time += dtMs / 1000;
    for (const [key, cloud] of this.clouds) {
      cloud.age += dtMs;
      // L'épaisseur glisse vers sa cible en ~1 s (immédiat en mouvement réduit) : la fumée s'éclaircit au passage du tour.
      cloud.thickness = reduced ? cloud.target : cloud.thickness + (cloud.target - cloud.thickness) * Math.min(1, dtMs / 600);
      if (cloud.leaving !== null) cloud.leaving += dtMs;
      if (cloud.leaving !== null && cloud.leaving >= FADE_MS) {
        cloud.container.destroy({ children: true });
        this.clouds.delete(key);
      }
    }
    this.pose();
  }

  private ensure(key: string, intensity: number, build: (thickness: number) => Cloud): void {
    const existing = this.clouds.get(key);
    if (existing) {
      existing.leaving = null;
      existing.target = intensity;
      return;
    }
    const cloud = build(intensity);
    this.addChild(cloud.container);
    this.clouds.set(key, cloud);
  }

  private newSprite(container: Container, tint: number, body: number): Sprite {
    const sprite = new Sprite(getPuffTexture(body));
    sprite.anchor.set(0.5);
    sprite.tint = tint;
    container.addChild(sprite);
    return sprite;
  }

  private nodeCloud(key: string, cx: number, cy: number, origin: boolean, thickness: number): Cloud {
    const container = new Container();
    const radius = this.nodeRadius * 1.5;
    const weight = origin ? 1 : SPREAD_ALPHA;
    const puffs = smokePuffs(key, origin ? 10 : 7).map((puff): PuffView => ({
      sprite: this.newSprite(container, puff.tint, 0.55),
      place: (t) => {
        const a = puff.angle + t * puff.speed;
        return {
          x: cx + Math.cos(a) * puff.orbit * radius,
          y: cy + Math.sin(a) * puff.orbit * radius * 0.85,
          scale: ((puff.size * radius * 2) / TEXTURE_PX) * (this.reduced ? 1 : 1 + 0.1 * Math.sin(t * 0.9 + puff.phase)),
          alpha: puff.alpha * weight * (this.reduced ? 1 : 0.88 + 0.12 * Math.sin(t * 0.7 + puff.phase)),
        };
      },
    }));
    return { container, puffs, thickness, target: thickness, gain: 1.6, cap: 0.88, floor: 0.3, age: 0, leaving: null };
  }

  private edgeCloud(key: string, a: { x: number; y: number }, b: { x: number; y: number }, thickness: number): Cloud {
    const container = new Container();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const puffs = edgePuffs(key).map((puff): PuffView => ({
      sprite: this.newSprite(container, puff.tint, 0.7),
      place: (t) => {
        const wobble = this.reduced ? 0 : Math.sin(t * puff.speed + puff.phase) * puff.drift * this.nodeRadius;
        return {
          x: a.x + dx * puff.along + nx * wobble,
          y: a.y + dy * puff.along + ny * wobble,
          scale: ((puff.size * this.nodeRadius * 2) / TEXTURE_PX) * (this.reduced ? 1 : 1 + 0.12 * Math.sin(t * 0.8 + puff.phase)),
          alpha: puff.alpha * 0.85,
        };
      },
    }));
    return { container, puffs, thickness, target: thickness, gain: 2, cap: 0.95, floor: 0.35, age: 0, leaving: null };
  }

  private pose(): void {
    const t = this.reduced ? 0 : this.time;
    for (const cloud of this.clouds.values()) {
      const fade = cloudFade(cloud.age, cloud.leaving, FADE_MS);
      // Épaisseur : opaque et ample à 1 (fumée qui vient d'être lancée), plus claire et plus étroite ensuite.
      const k = cloud.thickness;
            const spread = 0.75 + 0.25 * k;
      const density = cloud.floor + (1 - cloud.floor) * k;
      for (const { sprite, place } of cloud.puffs) {
        const p = place(t);
        sprite.position.set(p.x, p.y);
        sprite.scale.set(p.scale * spread);
        sprite.alpha = Math.min(cloud.cap, p.alpha * cloud.gain * density * fade);
      }
    }
  }
}
