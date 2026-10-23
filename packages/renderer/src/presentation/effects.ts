import type { GameState } from '@tannhauser/core';
import type { Animation } from './animation-queue';
import type { BannerPlan } from './banner';
import type { Point } from './path-geometry';
import type { CalloutTone } from './plan';

/**
 * Effets visuels « monde » que la présentation déclenche : un moteur de rendu (Pixi 2D, Three.js 3D…) les implémente.
 * Les positions sont en coordonnées PLATEAU (celles des nœuds) : chaque rendu les projette à sa façon. Aucun import de rendu
 * ici, pour que `Presentation` (ordre, durées, file d'attente) reste commun à tous les rendus.
 */
export interface WorldEffects {
  /**
   * Déplacement bloquant d'un pion le long de `points` (au moins deux, coordonnées plateau). Appelée au moment où la
   * présentation PLANIFIE le déplacement : le pion doit y rester à l'origine du tracé jusqu'à ce que la file atteigne l'animation.
   */
  move(characterId: string, points: readonly Point[]): Animation;
  /** Flash, chiffre flottant et secousse d'un personnage blessé. */
  damage(targetId: string, wounds: number): void;
  /** Message d'issue (raté, passage forcé, bloqué) sur un personnage, à défaut sur une case. */
  callout(tone: CalloutTone, characterId: string | undefined, node: Point | null): void;
  /** Explosion centrée sur `at` ; les cases de `zone` (case visée comprise) sont secouées. */
  explosion(nodeId: string, at: Point, zone: readonly string[], state: GameState): void;
  defeat(characterId: string): void;
  /** Anneau à la pose d'un Overwatch. */
  overwatchRing(characterId: string): void;
  /** Tir en réaction : éclair bloquant de `overwatcherId` vers `to` (ou, à défaut, la position de `targetId`). */
  overwatchBolt(overwatcherId: string, to: Point | null, targetId: string): Animation;
  /** Apparition d'un drapeau sur une case. */
  flagPlaced(at: Point, ownerIndex: number): void;
  /** Fanion qui vole : ramassé (case → porteur), déposé ou planté (porteur → case). */
  flagFlight(kind: 'captured' | 'dropped' | 'planted', node: Point, characterId: string, ownerIndex: number): void;
  /** Appelée à chaque image, entre l'avancement des animations et le déclenchement des rappels « au repos ». */
  tick?(nowMs: number): void;
  destroy(): void;
}

/** Effets en coordonnées ÉCRAN, hors du monde (donc communs aux rendus 2D et 3D). */
export interface ScreenEffects {
  /** Bannière de grande transition : remplace la courante ; `playerIndex` = index du joueur concerné, ou null. */
  banner(plan: BannerPlan, playerIndex: number | null): void;
  /** Message court non bloquant, distinct des bannières. */
  notice(text: string): void;
  destroy(): void;
}
