import { easeInQuad, easeOutBack, easeOutCubic, lerp } from './easing';

/** Grandes transitions annoncées par une bannière (une seule par lot d'événements). */
export type BannerKind = 'turnStart' | 'overwatchPhase' | 'activationPhase' | 'turnOf' | 'reaction' | 'victory';

/** Description pure d'une bannière à afficher (aucun texte : le client le fournit, voir `bannerText`). */
export interface BannerPlan {
  readonly kind: BannerKind;
  readonly turn: number;
  /** Joueur concerné (couleur/forme d'accent) ; null si inconnu. */
  readonly playerId: string | null;
  /** Réaction d'Overwatch : tireur et cible. */
  readonly overwatcherId?: string;
  readonly targetId?: string;
  /** Victoire : raison renvoyée par le moteur (ex. `CTF_FLAGS_PLANTED`), pour préciser le sous-titre. */
  readonly reason?: string;
}

/** Textes d'une bannière : titre principal + sous-titre explicatif. */
export interface BannerText {
  readonly title: string;
  readonly subtitle: string;
}

/** Du plus significatif au moins significatif : à égalité de lot, la première de la liste l'emporte. */
export const BANNER_PRIORITY: readonly BannerKind[] = ['victory', 'turnStart', 'reaction', 'overwatchPhase', 'activationPhase', 'turnOf'];

/** Dédoublonnage : une seule bannière par lot, la plus significative. */
export function chooseBanner(candidates: readonly BannerPlan[]): BannerPlan | null {
  let best: BannerPlan | null = null;
  for (const c of candidates) {
    if (best === null || BANNER_PRIORITY.indexOf(c.kind) < BANNER_PRIORITY.indexOf(best.kind)) best = c;
  }
  return best;
}

export type BannerIcon = 'flag' | 'eye' | 'chevrons' | 'arrow' | 'crosshair' | 'star';

export const BANNER_ICONS: Readonly<Record<BannerKind, BannerIcon>> = {
  turnStart: 'flag',
  overwatchPhase: 'eye',
  activationPhase: 'chevrons',
  turnOf: 'arrow',
  reaction: 'crosshair',
  victory: 'star',
};

/** Durées d'affichage (ms) : 1,5 à 2,3 s (entrée et sortie ≈ 0,4 s chacune) ; bannière finale plus longue. */
export const BANNER_DURATIONS: Readonly<Record<BannerKind, number>> = {
  turnStart: 2300,
  overwatchPhase: 2100,
  activationPhase: 2100,
  turnOf: 1500,
  reaction: 1700,
  victory: 4500,
};

/** Pose de la bannière à un instant : décalage du contenu (en largeurs de bandeau), échelle, opacité, ouverture du bandeau (0..1). */
export interface BannerPose {
  /** Décalage horizontal du contenu, en multiples de `slideDistance` (négatif : arrive de la gauche). */
  readonly slide: number;
  readonly scale: number;
  readonly alpha: number;
  /** Ouverture verticale du bandeau (échelle Y). */
  readonly open: number;
}

const ENTER_END = 0.2;
const EXIT_START = 0.8;

/**
 * Chronologie d'une bannière sur [0,1] : entrée par glissement + zoom (ease-out-back), maintien avec une très
 * légère dérive, sortie douce. En mouvement réduit : pose fixe (aucun glissement ni zoom), opacité pleine.
 */
export function bannerPose(progress: number, reduced: boolean): BannerPose {
  if (reduced) return { slide: 0, scale: 1, alpha: 1, open: 1 };
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  if (p < ENTER_END) {
    const t = p / ENTER_END;
    const e = easeOutBack(t);
    return { slide: lerp(-1, 0, e), scale: lerp(0.88, 1, e), alpha: Math.min(1, t * 2.5), open: easeOutCubic(t) };
  }
  if (p < EXIT_START) {
    const t = (p - ENTER_END) / (EXIT_START - ENTER_END);
    return { slide: 0, scale: 1 + 0.03 * t, alpha: 1, open: 1 };
  }
  const t = (p - EXIT_START) / (1 - EXIT_START);
  const e = easeInQuad(t);
  return { slide: lerp(0, 0.35, e), scale: lerp(1.03, 1.0, e), alpha: 1 - e, open: lerp(1, 0.7, e) };
}
