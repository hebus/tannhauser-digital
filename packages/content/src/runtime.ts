import type { CharacterState } from '@tannhauser/core';
import type { CharacterDefinition, WeaponDefinition } from './schemas';

/** Identifiant de l'attaque à mains nues, ajoutée à tout personnage. */
export const UNARMED_WEAPON_ID = 'weapon.unarmed';

/** Construit l'état runtime d'un personnage à partir de sa définition (contenu → moteur). */
export function createCharacterState(
  definition: CharacterDefinition,
  weapons: readonly WeaponDefinition[],
  placement: { readonly id?: string; readonly playerId: string; readonly nodeId: string },
): CharacterState {
  const byId = new Map(weapons.map((w) => [w.id, w]));
  // Sans arme : attaque à mains nues (2 dés, règles v2). Toujours disponible, en dernier recours.
  const ids = byId.has(UNARMED_WEAPON_ID) && !definition.weaponIds.includes(UNARMED_WEAPON_ID)
    ? [...definition.weaponIds, UNARMED_WEAPON_ID]
    : definition.weaponIds;
  const owned = ids.map((id) => {
    const w = byId.get(id);
    if (!w) throw new Error(`Arme inconnue pour ${definition.id} : ${id}`);
    return { id: w.id, kind: w.kind, dice: w.dice };
  });
  const first = definition.statRows[0]!;
  return {
    id: placement.id ?? definition.id,
    definitionId: definition.id,
    playerId: placement.playerId,
    nodeId: placement.nodeId,
    health: definition.statRows.length,
    statRows: definition.statRows,
    alive: true,
    weapons: owned,
    activated: false,
    movementLeft: first.movement,
  };
}
