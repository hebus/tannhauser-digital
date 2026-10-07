import type { GameEvent } from '@tannhauser/core';

/** Texte lisible d'un événement du moteur (journal du HUD). Aucun état, aucune règle. */
export function describeEvent(e: GameEvent): string | null {
  switch (e.type) {
    case 'GAME_STARTED':
      return 'La partie commence.';
    case 'TURN_STARTED':
      return `Tour ${e.turn}.`;
    case 'INITIATIVE_ROLLED':
      return `Initiative : ${e.winnerId} (${Object.entries(e.rolls)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}).`;
    case 'CHARACTER_ACTIVATION_STARTED':
      return `${e.characterId} est activé.`;
    case 'CHARACTER_MOVED':
      return `${e.characterId} se déplace (${e.cost} PM) → ${e.path[e.path.length - 1]}.`;
    case 'CHARACTER_ACTIVATION_ENDED':
      return `${e.characterId} termine son activation.`;
    case 'ATTACK_DECLARED':
      return `${e.attackerId} attaque ${e.targetId} (${e.weaponId}).`;
    case 'COMBAT_ROLLED':
      return `Attaque : dés [${e.dice.join(', ')}] → ${e.successes} blessure(s).`;
    case 'DEFENSE_ROLLED':
      return `Défense : dés [${e.dice.join(', ')}] → ${e.successes} parade(s).`;
    case 'ATTACK_HIT':
      return 'Touché.';
    case 'ATTACK_MISSED':
      return 'Aucun dégât.';
    case 'DAMAGE_APPLIED':
      return `${e.targetId} subit ${e.wounds} dégât(s) (santé ${e.healthLeft}).`;
    case 'CHARACTER_DEFEATED':
      return `${e.characterId} est hors de combat.`;
    case 'OVERWATCH_PLACED':
      return `${e.characterId} se met en Overwatch.`;
    case 'COMMAND_POINTS_SPENT':
      return `${e.playerId} dépense ${e.amount} PC (${e.purpose}).`;
    case 'OVERWATCH_PASSED':
      return e.auto ? `${e.playerId} passe automatiquement (plus rien à placer en Overwatch).` : `${e.playerId} passe (aucun Overwatch).`;
    case 'OVERWATCH_PHASE_ENDED':
      return "Phase Overwatch terminée : les activations commencent.";
    case 'OVERWATCH_RESUME_REFUSED':
      return `Action annoncée annulée (${e.command}) : ${e.message}`;
    case 'OVERWATCH_TRIGGERED':
      return `Overwatch : ${e.overwatcherId} voit ${e.targetId} en ${e.nodeId}${e.announced ? ` avant ${e.announced}` : ''}.`;
    case 'OVERWATCH_RESOLVED':
      return e.fired ? "Réaction d'Overwatch résolue." : 'Overwatch refusé.';
    case 'DOOR_OPENED':
      return `Porte ${e.doorId} ouverte.`;
    case 'DOOR_CLOSED':
      return `Porte ${e.doorId} fermée.`;
    case 'PLAYER_PASSED':
      return `${e.playerId} passe.`;
    case 'TURN_ENDED':
      return `Fin du tour ${e.turn}.`;
    case 'FLAG_PLACED':
      return `Drapeau de ${e.ownerId} posé en ${e.nodeId}.`;
    case 'FLAG_CAPTURED':
      return `${e.characterId} récupère le drapeau ${e.flagId} (${e.nodeId}).`;
    case 'FLAG_DROPPED':
      return `${e.characterId} laisse tomber le drapeau ${e.flagId} en ${e.nodeId}.`;
    case 'FLAG_PLANTED':
      return `${e.characterId} plante le drapeau ${e.flagId} dans le camp de ${e.playerId} (${e.nodeId}).`;
    case 'VICTORY':
      return `Victoire de ${e.winnerId} !`;
    default:
      return null;
  }
}
