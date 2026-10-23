/** Durées en ms (volontairement courtes : le jeu ne attend jamais les animations pour accepter une commande). */
export const TIMING = {
  moveStep: 130,
  moveMax: 900,
  flash: 220,
  floater: 900,
  /** Message d'issue (raté, passage forcé, bloqué) : un peu plus long qu'un chiffre de dégâts pour être lu. */
  callout: 1300,
  shake: 260,
  /** Secousse des cases touchées par une explosion. */
  blastShake: 650,
  defeat: 650,
  ring: 550,
  bolt: 650,
  /** Vol d'un fanion (ramassage, dépôt, plantage). */
  flagFlight: 550,
  /** Message court (changement d'option). Les durées des bannières sont dans `BANNER_DURATIONS`. */
  notice: 1400,
  /** Durée d'affichage statique des indicateurs en mouvement réduit (aucun mouvement). */
  staticHold: 1200,
} as const;
