import { seededRandom } from '../smoke-model';

/** Étincelle ou débris projeté par l'explosion (modèle pur : aucune dépendance à Pixi). */
export interface Spark {
  /** Direction (rad) et distance finale parcourue (en rayons de nœud). */
  readonly angle: number;
  readonly distance: number;
  /** Rayon en pixels du plateau et durée de vie relative (0..1 de la durée totale de l'explosion). */
  readonly size: number;
  readonly life: number;
  /** Couleur : du jaune vif à l'orange sombre. */
  readonly color: number;
}

export const SPARKS_PER_EXPLOSION = 16;
export const SOOT_PUFFS_PER_EXPLOSION = 6;

const SPARK_COLORS: readonly number[] = [0xfff1a8, 0xffd04a, 0xff9a2e, 0xff6a1a];

export function explosionSparks(seed: string, count: number = SPARKS_PER_EXPLOSION): Spark[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * Math.PI * 2 + (random() - 0.5) * 0.5,
    distance: 1.2 + random() * 2.2,
    size: 2 + random() * 3,
    life: 0.55 + random() * 0.45,
    color: SPARK_COLORS[Math.floor(random() * SPARK_COLORS.length)]!,
  }));
}

/** Position d'une étincelle (en rayons de nœud depuis le centre) et opacité à la progression `p` (0..1) : elle ralentit en s'éloignant puis s'éteint. */
export function sparkAt(spark: Spark, p: number): { readonly radius: number; readonly alpha: number } {
  const t = Math.min(1, Math.max(0, p / spark.life));
  const ease = 1 - Math.pow(1 - t, 3);
  return { radius: spark.distance * ease, alpha: t >= 1 ? 0 : 1 - t * t };
}

/** Bouffée de suie résiduelle : dérive lente vers le haut en s'élargissant. */
export interface SootPuff {
  readonly dx: number;
  readonly dy: number;
  readonly size: number;
  readonly rise: number;
  readonly delay: number;
}

export function sootPuffs(seed: string, count: number = SOOT_PUFFS_PER_EXPLOSION): SootPuff[] {
  const random = seededRandom(`${seed}:soot`);
  return Array.from({ length: count }, () => ({
    dx: (random() - 0.5) * 1.6,
    dy: (random() - 0.5) * 1.2,
    size: 0.8 + random() * 0.8,
    rise: 0.5 + random() * 0.8,
    delay: random() * 0.25,
  }));
}

/**
 * Secousse d'une case ou d'un pion touché par une explosion à la progression `p` (0..1) : oscillation rapide le long de
 * `angle` (direction de l'onde de choc), d'amplitude `amp` px qui décroît jusqu'à zéro (la case revient exactement en place).
 */
export function shakeOffset(p: number, amp: number, angle: number): { readonly dx: number; readonly dy: number } {
  const t = Math.min(1, Math.max(0, p));
  const strength = amp * (1 - t) * (1 - t) * Math.sin(t * Math.PI * 9);
  return { dx: Math.cos(angle) * strength, dy: Math.sin(angle) * strength };
}
