import type { CharacterState, WeaponDefinition } from '@tannhauser/core';
import { WEAPON_TRAIT, WEAPON_TYPE_TRAITS, type CharacterDefinition, type EquipmentDefinition } from './schemas';

/** Identifiant de l'attaque à mains nues, ajoutée à tout personnage. */
export const UNARMED_WEAPON_ID = 'weapon.unarmed';

/** Arme runtime d'un équipement portant le trait `weapon` ; `undefined` pour tout autre équipement. */
function toWeapon(equipment: EquipmentDefinition): WeaponDefinition | undefined {
  if (!equipment.traits.includes(WEAPON_TRAIT)) return undefined;
  const type = equipment.traits.find((t): t is keyof typeof WEAPON_TYPE_TRAITS => t in WEAPON_TYPE_TRAITS);
  if (!type || equipment.dice === undefined) return undefined;
  return { id: equipment.id, kind: WEAPON_TYPE_TRAITS[type], dice: equipment.dice };
}

/** Construit l'état runtime d'un personnage à partir de sa définition (contenu → moteur). */
export function createCharacterState(
  definition: CharacterDefinition,
  equipment: readonly EquipmentDefinition[],
  placement: { readonly id?: string; readonly playerId: string; readonly nodeId: string },
): CharacterState {
  const byId = new Map(equipment.map((e) => [e.id, e]));
  // Sans arme : attaque à mains nues (2 dés, règles v2). Toujours disponible, en dernier recours.
  const ids = byId.has(UNARMED_WEAPON_ID) && !definition.equipmentIds.includes(UNARMED_WEAPON_ID)
    ? [...definition.equipmentIds, UNARMED_WEAPON_ID]
    : definition.equipmentIds;
  const owned = ids.flatMap((id) => {
    const e = byId.get(id);
    if (!e) throw new Error(`Équipement inconnu pour ${definition.id} : ${id}`);
    const weapon = toWeapon(e);
    return weapon ? [weapon] : [];
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
