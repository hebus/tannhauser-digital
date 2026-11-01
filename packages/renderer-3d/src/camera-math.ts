import type { Box } from '@tannhauser/renderer/src/board-layout';

/**
 * Calculs purs de la caméra 3D (testés sous Vitest) : inclinaison liée au zoom, rotation par quarts de tour, bornes.
 * Angles en radians. Azimut 0 = caméra au sud du plateau (côté +y), le nord (haut du rendu 2D) en haut de l'écran ;
 * un azimut croissant fait tourner le plateau dans le sens horaire à l'écran.
 */

const QUARTER = Math.PI / 2;

/** Angle depuis la verticale au cadrage (vue presque de dessus : tout le plateau se lit d'un coup d'œil). */
export const FIT_POLAR = (26 * Math.PI) / 180;
/** Angle depuis la verticale au zoom maximal (vue rasante : le volume des murs et des pions se lit). */
export const CLOSE_POLAR = (54 * Math.PI) / 180;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Inclinaison pour une distance : rasante de près, presque de dessus au cadrage et au-delà. */
export function polarForDistance(distance: number, minDistance: number, fitDistance: number): number {
  if (fitDistance <= minDistance) return FIT_POLAR;
  const t = Math.min(1, Math.max(0, (distance - minDistance) / (fitDistance - minDistance)));
  // Courbe douce : l'inclinaison change surtout dans les derniers crans de zoom.
  return lerp(CLOSE_POLAR, FIT_POLAR, Math.sqrt(t));
}

/** Ramène un angle dans ]-π, π]. */
export function wrapAngle(angle: number): number {
  const a = angle % (Math.PI * 2);
  if (a > Math.PI) return a - Math.PI * 2;
  if (a <= -Math.PI) return a + Math.PI * 2;
  return a;
}

/** Quart de tour suivant (`direction` = 1 : sens horaire à l'écran) ; depuis un angle libre, le cran le plus proche dans ce sens. */
export function nextQuarter(azimuth: number, direction: 1 | -1): number {
  const steps = azimuth / QUARTER;
  const snapped = Math.round(steps);
  // Déjà sur un cran (à un souffle près) : on passe au suivant ; sinon on rejoint le cran dans le sens demandé.
  const target = Math.abs(steps - snapped) < 0.05 ? snapped + direction : direction > 0 ? Math.ceil(steps) : Math.floor(steps);
  return target * QUARTER;
}

/** Index du quart de tour le plus proche (0 à 3) : 1 et 3 échangent la largeur et la profondeur du cadrage. */
export function quarterIndex(azimuth: number): number {
  return ((Math.round(azimuth / QUARTER) % 4) + 4) % 4;
}

/** Ramène un point du sol (coordonnées plateau) dans l'emprise : on ne peut pas perdre le plateau de vue. */
export function clampToBox(x: number, y: number, box: Box): { x: number; y: number } {
  return { x: Math.min(box.x + box.width, Math.max(box.x, x)), y: Math.min(box.y + box.height, Math.max(box.y, y)) };
}

export interface FitInput {
  readonly bounds: Box;
  /** Quart de tour courant (0 à 3). */
  readonly quarter: number;
  readonly polar: number;
  /** Champ vertical (degrés) et rapport largeur / hauteur de la caméra. */
  readonly fov: number;
  readonly aspect: number;
  /** Part de la largeur et de la hauteur de la vue laissée libre par le HUD (0 à 1). */
  readonly freeWidth: number;
  readonly freeHeight: number;
  /** Hauteur des murs : leur sommet doit aussi tenir dans le cadre. */
  readonly wallHeight: number;
}

/** Distance caméra – centre du plateau pour que tout le plateau tienne dans la zone libre, à l'inclinaison donnée. */
export function fitDistance(input: FitInput): number {
  const { bounds: b, quarter, polar, fov, aspect, freeWidth, freeHeight, wallHeight } = input;
  const across = quarter % 2 === 0 ? b.width : b.height;
  const deep = quarter % 2 === 0 ? b.height : b.width;
  const tanV = Math.tan((fov * Math.PI) / 180 / 2);
  const tanH = tanV * aspect;
  const elevation = Math.PI / 2 - polar;
  const needWidth = across / 2 / (tanH * freeWidth);
  const needDepth = ((deep / 2) * Math.sin(elevation) + (wallHeight / 2) * Math.cos(elevation)) / (tanV * freeHeight);
  return Math.max(needWidth, needDepth) * 1.06 + (deep / 2) * Math.cos(elevation);
}
