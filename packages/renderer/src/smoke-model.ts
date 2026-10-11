/** Modèle pur d'un nuage de fumée : bouffées réparties de façon déterministe d'après l'id de l'effet (aucun Pixi ici). */
export interface Puff {
  /** Angle de départ et rayon d'orbite (0..1, en fraction du rayon du nuage). */
  readonly angle: number;
  readonly orbit: number;
  /** Vitesse angulaire (rad/s, signe = sens) et déphasage de la « respiration ». */
  readonly speed: number;
  readonly phase: number;
  /** Taille relative (1 = rayon du nuage) et opacité de base. */
  readonly size: number;
  readonly alpha: number;
  /** Nuance de gris (0xRRGGBB). */
  readonly tint: number;
}

export const PUFFS_PER_CLOUD = 9;

/** Générateur pseudo-aléatoire déterministe (mulberry32) amorcé par une chaîne. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smokePuffs(effectId: string, count: number = PUFFS_PER_CLOUD): Puff[] {
  const random = seededRandom(effectId);
  return Array.from({ length: count }, (_, i) => {
    const grey = 0x9a + Math.floor(random() * 0x40);
    return {
      angle: (i / count) * Math.PI * 2 + random() * 0.6,
      orbit: 0.15 + random() * 0.65,
      speed: (random() < 0.5 ? -1 : 1) * (0.12 + random() * 0.25),
      phase: random() * Math.PI * 2,
      size: 0.5 + random() * 0.45,
      alpha: 0.36 + random() * 0.27,
      tint: (grey << 16) | (grey << 8) | Math.min(0xff, grey + 8),
    };
  });
}

/** Opacité globale d'un nuage selon son âge (fondu d'entrée) ou le temps écoulé depuis sa disparition (fondu de sortie). */
export function cloudFade(ageMs: number, leavingMs: number | null, fadeMs = 700): number {
  const fadeIn = Math.min(1, Math.max(0, ageMs / fadeMs));
  if (leavingMs === null) return fadeIn;
  return Math.min(fadeIn, Math.max(0, 1 - leavingMs / fadeMs));
}

/** Bouffée posée le long d'une arête : `along` = position sur le segment (0..1), `drift` = écart latéral maximal (en fraction du rayon). */
export interface EdgePuff {
  readonly along: number;
  readonly drift: number;
  readonly speed: number;
  readonly phase: number;
  readonly size: number;
  readonly alpha: number;
  readonly tint: number;
}

export const PUFFS_PER_EDGE = 4;

export function edgePuffs(edgeId: string, count: number = PUFFS_PER_EDGE): EdgePuff[] {
  const random = seededRandom(edgeId);
  return Array.from({ length: count }, (_, i) => {
    const grey = 0x9a + Math.floor(random() * 0x40);
    return {
      along: (i + 0.5 + (random() - 0.5) * 0.5) / count,
      drift: 0.15 + random() * 0.35,
      speed: 0.25 + random() * 0.35,
      phase: random() * Math.PI * 2,
      size: 0.28 + random() * 0.18,
      alpha: 0.35 + random() * 0.25,
      tint: (grey << 16) | (grey << 8) | Math.min(0xff, grey + 8),
    };
  });
}
