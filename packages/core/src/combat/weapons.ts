/** Familles d'armes (§72.1). Les dés par famille sont des DONNÉES, jamais des constantes de code. */
export type WeaponKind = 'CAC' | 'PISTOL' | 'MENTAL' | 'AUTOMATIC';

/**
 * Définition runtime d'une arme, sérialisable, portée par `CharacterState.weapons`.
 * Choix minimal : l'état transporte les armes de chaque personnage (copiées depuis le contenu
 * à la mise en place), ce qui garde le moteur pur et les replays autosuffisants.
 */
export interface WeaponDefinition {
  readonly id: string;
  readonly kind: WeaponKind;
  /** Réserve de dés de base de l'arme. */
  readonly dice: number;
  /** Succès automatiques de l'arme (§72.3). */
  readonly autoSuccesses?: number;
  /** Dés supplémentaires / modificateur de résultat propres à l'arme. */
  readonly extraDice?: number;
  readonly resultModifier?: number;
  /** Portée maximale en nombre de pas (arêtes ouvertes). Absente = limitée par la seule ligne de vue. */
  readonly maxRange?: number;
}
