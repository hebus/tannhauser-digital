/**
 * Mise en page d'un plateau : données d'AFFICHAGE uniquement (murs, pièces, couloirs), jamais des règles.
 * Les règles (déplacement, ligne de vue, portes) viennent du graphe `BoardState` du moteur.
 * Les coordonnées sont celles des nœuds (monde du plateau). Structure JSON-compatible : le paquet `content`
 * la valide avec ArkType (`layoutSchema`) et le client la transmet telle quelle à `BoardView`.
 */
export interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

export interface LayoutRoom {
  readonly id: string;
  /** Clé de libellé (traduite côté client via `BoardViewOptions.label`). */
  readonly nameKey?: string;
  /** Contour fermé (au moins 3 points, sens quelconque). */
  readonly polygon: readonly LayoutPoint[];
  /** Couleur de remplissage "#rrggbb" (optionnelle). */
  readonly fill?: string;
}

export interface LayoutCorridor {
  readonly id: string;
  /** Ligne brisée (au moins 2 points) tracée avec l'épaisseur `width`. */
  readonly points: readonly LayoutPoint[];
  readonly width: number;
}

export interface BoardLayout {
  readonly rooms: readonly LayoutRoom[];
  readonly corridors: readonly LayoutCorridor[];
}
