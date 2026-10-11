import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { tween, type AnimationRunner } from './animation-queue';
import { easeOutCubic, lerp } from './easing';
import { explosionSparks, sootPuffs, sparkAt } from './explosion-model';
import type { Point } from './path-geometry';

const TEXTURE_PX = 128;

/** Durée totale de l'explosion (boule de feu, onde, étincelles) ; la suie dure un peu plus longtemps. */
export const EXPLOSION_MS = 750;
const SOOT_MS = 1100;
/** Maintien statique en mouvement réduit. */
const STATIC_MS = 1000;

const textures = new Map<string, Texture>();
/** Disque flou à dégradé radial (créé une fois par type ; le canevas n'existe qu'au navigateur). */
function radialTexture(key: 'fire' | 'soot'): Texture {
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_PX;
  canvas.height = TEXTURE_PX;
  const ctx = canvas.getContext('2d')!;
  const half = TEXTURE_PX / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  const stops: ReadonlyArray<readonly [number, string]> =
    key === 'fire'
      ? [[0, 'rgba(255,252,220,1)'], [0.25, 'rgba(255,196,70,0.95)'], [0.6, 'rgba(255,95,25,0.55)'], [1, 'rgba(120,20,0,0)']]
      : [[0, 'rgba(40,38,36,0.9)'], [0.55, 'rgba(60,57,54,0.45)'], [1, 'rgba(70,66,62,0)']];
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  const texture = Texture.from(canvas);
  textures.set(key, texture);
  return texture;
}

/**
 * Explosion centrée sur `at` : flash blanc, boule de feu (mélange additif), onde de choc, étincelles qui jaillissent
 * en ralentissant, puis suie qui s'élève. `radius` = rayon d'un nœud (échelle de l'effet). Les animations passent par
 * `runner` (non bloquantes) ; les éléments sont ajoutés à `layer` et détruits à la fin. En mouvement réduit : un flash
 * et un anneau fixes, sans déplacement.
 */
export function playExplosion(runner: AnimationRunner, layer: Container, at: Point, radius: number, seed: string, reduced: boolean): void {
  if (reduced) {
    const mark = new Graphics();
    mark.circle(0, 0, radius * 1.6).fill({ color: 0xffd04a, alpha: 0.45 }).circle(0, 0, radius * 1.6).stroke({ width: 4, color: 0xff6a1a });
    mark.position.set(at.x, at.y);
    layer.addChild(mark);
    runner.add({ duration: STATIC_MS, finish: () => mark.destroy() });
    return;
  }

  // Boule de feu : grossit vite puis s'estompe ; mélange additif pour l'éclat.
  const fire = new Sprite(radialTexture('fire'));
  fire.anchor.set(0.5);
  fire.blendMode = 'add';
  fire.position.set(at.x, at.y);
  layer.addChild(fire);
  runner.add(
    tween({
      duration: EXPLOSION_MS * 0.8,
      ease: easeOutCubic,
      onUpdate: (p) => {
        if (fire.destroyed) return;
        fire.scale.set((radius * lerp(1.2, 5, p)) / (TEXTURE_PX / 2));
        fire.alpha = p < 0.25 ? 1 : 1 - (p - 0.25) / 0.75;
      },
      onFinish: () => fire.destroy(),
    }),
  );

  // Flash : disque blanc très bref au tout début.
  const flash = new Graphics();
  flash.circle(0, 0, radius * 1.4).fill({ color: 0xffffff, alpha: 1 });
  flash.position.set(at.x, at.y);
  flash.blendMode = 'add';
  layer.addChild(flash);
  runner.add(
    tween({
      duration: 160,
      onUpdate: (p) => {
        if (flash.destroyed) return;
        flash.alpha = 1 - p;
        flash.scale.set(1 + 0.8 * p);
      },
      onFinish: () => flash.destroy(),
    }),
  );

  // Onde de choc : anneau qui s'élargit et s'amincit.
  const wave = new Graphics();
  wave.position.set(at.x, at.y);
  layer.addChild(wave);
  runner.add(
    tween({
      duration: EXPLOSION_MS * 0.9,
      ease: easeOutCubic,
      onUpdate: (p) => {
        if (wave.destroyed) return;
        wave.clear();
        wave.circle(0, 0, radius * lerp(0.6, 4.2, p)).stroke({ width: lerp(7, 1, p), color: 0xffe2a0, alpha: 0.85 * (1 - p) });
      },
      onFinish: () => wave.destroy(),
    }),
  );

  // Étincelles : un seul Graphics redessiné à chaque image.
  const sparks = explosionSparks(seed);
  const sparkLayer = new Graphics();
  sparkLayer.position.set(at.x, at.y);
  layer.addChild(sparkLayer);
  runner.add(
    tween({
      duration: EXPLOSION_MS,
      onUpdate: (p) => {
        if (sparkLayer.destroyed) return;
        sparkLayer.clear();
        for (const s of sparks) {
          const { radius: r, alpha } = sparkAt(s, p);
          if (alpha <= 0) continue;
          sparkLayer.circle(Math.cos(s.angle) * r * radius, Math.sin(s.angle) * r * radius, s.size * (1 - 0.5 * p)).fill({ color: s.color, alpha });
        }
      },
      onFinish: () => sparkLayer.destroy(),
    }),
  );

  // Suie : quelques bouffées sombres qui montent et s'élargissent, après le gros de l'explosion.
  for (const puff of sootPuffs(seed)) {
    const soot = new Sprite(radialTexture('soot'));
    soot.anchor.set(0.5);
    soot.alpha = 0;
    layer.addChild(soot);
    const base = { x: at.x + puff.dx * radius, y: at.y + puff.dy * radius };
    runner.add(
      tween({
        duration: SOOT_MS,
        onUpdate: (p) => {
          if (soot.destroyed) return;
          const q = Math.max(0, (p - puff.delay) / (1 - puff.delay));
          soot.position.set(base.x, base.y - puff.rise * radius * q);
          soot.scale.set((radius * puff.size * lerp(1.2, 2.6, q)) / (TEXTURE_PX / 2));
          soot.alpha = q <= 0 ? 0 : q < 0.2 ? (q / 0.2) * 0.55 : 0.55 * (1 - (q - 0.2) / 0.8);
        },
        onFinish: () => soot.destroy(),
      }),
    );
  }
}
