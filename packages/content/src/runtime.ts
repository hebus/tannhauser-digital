import type { CharacterState } from '@tannhauser/core';
import type { CharacterDefinition, WeaponDefinition } from './schemas';

/** Construit l'état runtime d'un personnage à partir de sa définition (contenu → moteur). */
export function createCharacterState(
  definition: CharacterDefinition,
  weapons: readonly WeaponDefinition[],
  placement: { readonly id?: string; readonly playerId: string; readonly nodeId: string },
): CharacterState {
  const byId = new Map(weapons.map((w) => [w.id, w]));
  const owned = definition.weaponIds.map((id) => {
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
