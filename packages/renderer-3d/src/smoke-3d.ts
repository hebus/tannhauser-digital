import * as THREE from 'three';
import { smokeSpread, type GameState } from '@tannhauser/core';
import { cloudFade, edgePuffs, smokePuffs } from '@tannhauser/renderer/src/smoke-model';
import { TILE_RADIUS } from './board-scene';
import { disposeTree } from './three-util';

const FADE_MS = 700;
/** Les cases atteintes par propagation sont plus claires que la case d'origine : la source se lit encore. */
const SPREAD_ALPHA = 0.78;
const PUFF_BASE_Y = 16;
/** Les bouffées 3D, vues de haut et de loin, se fondent dans le sol : on compense pour que la fumée se lise comme en 2D. */
const SMOKE_OPACITY = 1.7;

interface Puff {
  readonly mesh: THREE.Mesh;
  /** Position de repos et mouvement : orbite autour du centre pour une case, va-et-vient le long d'une arête. */
  readonly place: (t: number) => { x: number; z: number; scale: number; alpha: number };
}

interface Cloud {
  readonly group: THREE.Group;
  readonly puffs: readonly Puff[];
  age: number;
  /** Épaisseur affichée, qui glisse vers sa cible quand les tours passent. */
  thickness: number;
  target: number;
  /** Temps écoulé depuis la disparition de l'effet (fondu de sortie) ; `null` tant qu'il est actif. */
  leaving: number | null;
}

/**
 * Fumée : des bouffées grises translucides, pilotées par `smokeSpread` du moteur (cases, arêtes, épaisseur selon les tours
 * restants). Mêmes modèles purs (`smokePuffs`, `edgePuffs`, `cloudFade`) que le rendu 2D : seul le dessin change.
 */
export class SmokeLayer3D {
  readonly group = new THREE.Group();

  private readonly clouds = new Map<string, Cloud>();
  private readonly geometry = new THREE.IcosahedronGeometry(1, 1);
  private time = 0;

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
    this.time += dtMs / 1000;
    for (const [key, cloud] of this.clouds) {
      cloud.age += dtMs;
      // L'épaisseur glisse vers sa cible en ~1 s (immédiat en mouvement réduit) : la fumée s'éclaircit au passage du tour.
      cloud.thickness = reduced ? cloud.target : cloud.thickness + (cloud.target - cloud.thickness) * Math.min(1, dtMs / 600);
      if (cloud.leaving !== null) cloud.leaving += dtMs;
      if (cloud.leaving !== null && cloud.leaving >= FADE_MS) {
        this.group.remove(cloud.group);
        disposeTree(cloud.group);
        this.clouds.delete(key);
      }
    }
    this.pose();
  }

  destroy(): void {
    disposeTree(this.group);
    this.geometry.dispose();
    this.clouds.clear();
  }

  private ensure(key: string, intensity: number, build: (thickness: number) => Cloud): void {
    const existing = this.clouds.get(key);
    if (existing) {
      existing.leaving = null;
      existing.target = intensity;
      return;
    }
    const cloud = build(intensity);
    this.group.add(cloud.group);
    this.clouds.set(key, cloud);
  }

  private puffMesh(tint: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ color: tint, flatShading: true, transparent: true, depthWrite: false, roughness: 1 }));
    mesh.renderOrder = 5;
    return mesh;
  }

  private nodeCloud(key: string, x: number, y: number, origin: boolean, thickness: number): Cloud {
    const group = new THREE.Group();
    group.position.set(x, 0, y);
    const gain = origin ? 1 : SPREAD_ALPHA;
    const puffs = smokePuffs(key).map((p): Puff => {
      const mesh = this.puffMesh(p.tint);
      group.add(mesh);
      return {
        mesh,
        place: (t) => ({
          x: Math.cos(p.angle + t * p.speed) * p.orbit * TILE_RADIUS,
          z: Math.sin(p.angle + t * p.speed) * p.orbit * TILE_RADIUS,
          scale: TILE_RADIUS * 0.5 * p.size * (1 + 0.08 * Math.sin(t * 1.3 + p.phase)),
          alpha: p.alpha * gain,
        }),
      };
    });
    return { group, puffs, age: 0, thickness, target: thickness, leaving: null };
  }

  private edgeCloud(key: string, a: { x: number; y: number }, b: { x: number; y: number }, thickness: number): Cloud {
    const group = new THREE.Group();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const puffs = edgePuffs(key).map((p): Puff => {
      const mesh = this.puffMesh(p.tint);
      group.add(mesh);
      return {
        mesh,
        place: (t) => {
          const along = Math.min(0.95, Math.max(0.05, p.along + Math.sin(t * p.speed + p.phase) * 0.06));
          const lateral = Math.sin(t * p.speed * 0.8 + p.phase) * p.drift * TILE_RADIUS;
          return { x: a.x + dx * along + nx * lateral, z: a.y + dy * along + ny * lateral, scale: TILE_RADIUS * 0.5 * p.size * 2, alpha: p.alpha * SPREAD_ALPHA };
        },
      };
    });
    return { group, puffs, age: 0, thickness, target: thickness, leaving: null };
  }

  private pose(): void {
    for (const cloud of this.clouds.values()) {
      const fade = cloudFade(cloud.age, cloud.leaving, FADE_MS);
      for (const puff of cloud.puffs) {
        const p = puff.place(this.time);
        puff.mesh.position.set(p.x, PUFF_BASE_Y + p.scale * 0.3, p.z);
        puff.mesh.scale.setScalar(Math.max(0.001, p.scale));
        (puff.mesh.material as THREE.MeshStandardMaterial).opacity = Math.min(0.9, p.alpha * fade * (0.45 + 0.55 * cloud.thickness) * SMOKE_OPACITY);
      }
    }
  }
}
