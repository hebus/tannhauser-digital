import type { BoardState, GameEvent, GameState } from '@tannhauser/core';
import type { BoardLayout } from './board-layout';
import type { BannerPlan, BannerText } from './presentation/banner';
import type { PathPreview } from './presentation/path-geometry';
import type { CalloutTone } from './presentation/plan';
import type { ReducedMotion } from './presentation/reduced-motion';

/**
 * Contrat de rendu : tout ce que le client demande à un moteur de rendu du plateau (Pixi 2D, Three.js 3D…).
 * Ce fichier ne dépend d'aucun moteur graphique : le client ne parle qu'à `BoardRenderer`, et choisir un rendu revient à
 * choisir une `BoardRendererFactory`. Le moteur de règles reste seul maître de l'état : le rendu ne reçoit que des ids de
 * cases et des états en lecture, et ne renvoie que des ids de cases (clic, survol).
 */

/** Marges (px) occupées par le HUD autour du plateau : le cadrage de la caméra en tient compte. */
export interface Insets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

/** Ce que le rendu renvoie au client. Les rappels sont fournis à la construction. */
export interface BoardRendererEvents {
  /** Clic (ou toucher bref, sans glisser) sur une case. */
  readonly onPick: (nodeId: string) => void;
  /** Case sous le pointeur ; `null` hors plateau. N'est appelée qu'au CHANGEMENT de case. */
  readonly onHover: (nodeId: string | null) => void;
  /** Le joueur interagit (pointeur enfoncé) : le client termine les animations en cours. */
  readonly onInteract: () => void;
}

/** Couleur de la surbrillance de cases : déplacement possible, ou case visable par un lancer. */
export type HighlightTone = 'move' | 'throw';

/** Pilotage des animations, communes à tous les rendus (file d'attente, durées, état « au repos »). */
export interface PresentationControls {
  /** Vrai quand plus aucune animation ni bannière n'est en cours. */
  readonly idle: boolean;
  /**
   * Lance les animations déduites des événements du moteur. À appeler AVANT `BoardRenderer.update(next)` : les pions
   * mobiles restent à leur case de départ jusqu'à ce que l'animation les déplace.
   */
  play(events: readonly GameEvent[], prev: GameState | null, next: GameState): void;
  /** Termine instantanément toutes les animations (l'affichage rejoint immédiatement l'état). */
  skip(): void;
  /** Appelle `callback` dès que tout est terminé (tout de suite si c'est déjà le cas). */
  onIdle(callback: () => void): void;
  /** Message court non bloquant au centre haut de l'écran (ex. changement d'option). */
  notify(text: string): void;
  /** Débogage : affiche tout de suite une bannière (`?debugBanner=`). */
  announce(plan: BannerPlan, players?: readonly { readonly id: string }[]): void;
  /** Débogage : joue tout de suite une explosion sur une case (`?debugExplosion=1`). */
  explode(nodeId: string, state: GameState): void;
}

export interface BoardRenderer {
  readonly presentation: PresentationControls;

  /** Crée le contexte graphique et l'attache à `host`. À appeler une seule fois, avant tout autre appel. */
  init(host: HTMLElement): Promise<void>;
  destroy(): void;

  /**
   * Affiche l'état : pions, drapeaux, fumée, portes. N'écrit jamais dans l'état. Les surcouches (`show*`) ne sont PAS
   * recalculées ici : le client les met à jour quand il le juge utile.
   */
  update(state: GameState): void;
  /** Affiche les identifiants de cases (aide au débogage, touche I). */
  setShowNodeIds(show: boolean): void;

  /** Surbrillance des cases (atteignables, ou visables par un lancer) ; liste vide = aucune. */
  showReachable(nodeIds: Iterable<string>, tone?: HighlightTone): void;
  /** Cases ciblées (ennemis attaquables, zone d'un lancer…). */
  showTargets(nodeIds: Iterable<string>): void;
  /** Cases vues depuis `origin` (ligne de vue du moteur) ; `null` = masquer. */
  showLineOfSight(origin: string | null, visible: ReadonlySet<string> | null): void;
  /** Aperçu du chemin vers la case survolée ; `null` = masquer. Le rendu le redessine quand le zoom change. */
  showPath(preview: PathPreview | null): void;

  /** Cadre tout le plateau en tenant compte des marges du HUD (`insets`). */
  fit(): void;
  /** Centre la caméra sur une case (animé ; instantané en mouvement réduit). */
  focusNode(nodeId: string): void;
  /** Vrai si l'utilisateur a zoomé au-delà du cadrage : le plateau n'est plus entièrement visible. */
  isZoomedIn(): boolean;
}

/** Tout ce qu'une fabrique de rendu reçoit : de quoi construire le plateau, pas de quoi jouer. */
export interface BoardRendererOptions {
  readonly board: BoardState;
  /** Mise en page d'affichage (pièces, couloirs) ; absente pour une grille simple. */
  readonly layout?: BoardLayout;
  /** Libellé d'une pièce (clé de mise en page → texte localisé). */
  readonly label: (key: string) => string;
  /** Bascule « mouvement réduit », partagée avec le HUD. */
  readonly reducedMotion: ReducedMotion;
  /** Marges occupées par le HUD, relues à chaque cadrage. */
  readonly insets: () => Insets;
  /** Nom affiché d'un personnage d'après l'état (le renderer ne contient aucun texte de jeu). */
  readonly characterLabels: (state: GameState) => (characterId: string) => string | undefined;
  /** Titre et sous-titre (localisés par le client) d'une bannière. */
  readonly bannerText: (plan: BannerPlan) => BannerText;
  /** Texte (localisé par le client) du message flottant d'une issue : « Raté ! », « Passage forcé ! », « Bloqué ! ». */
  readonly calloutText: (tone: CalloutTone) => string;
  /** Débogage : les bannières restent affichées (figées) jusqu'à la suivante. */
  readonly holdBanners?: boolean;
  readonly events: BoardRendererEvents;
}

/** Choisir un rendu = choisir une fabrique ; changer de rendu = `destroy()` puis une autre fabrique, mêmes options. */
export type BoardRendererFactory = (options: BoardRendererOptions) => BoardRenderer;
