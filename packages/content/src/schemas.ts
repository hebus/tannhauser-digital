import { type } from 'arktype';

/** Schémas des données de contenu (validation à l'exécution + types déduits). */

const nodeModifier = type({
  id: 'string > 0',
  applies: "'OCCUPANT' | 'ATTACKER' | 'DEFENDER'",
  'extraDice?': 'number.integer',
  'resultModifier?': 'number.integer',
});

const nodeProperties = type({
  'kind?': "'NORMAL' | 'OBJECTIVE' | 'ACTION' | 'ENTRY_POINT'",
  'passable?': 'boolean',
  'movementCostModifier?': 'number.integer >= 0',
  'modifiers?': nodeModifier.array(),
});

export const nodeSchema = type({
  id: 'string > 0',
  x: 'number',
  y: 'number',
  'zoneId?': 'string',
  colors: 'string[]',
  'properties?': nodeProperties,
});

export const edgeSchema = type({
  from: 'string > 0',
  to: 'string > 0',
  'oneWay?': 'boolean',
  'doorId?': 'string',
});

export const doorSchema = type({
  id: 'string > 0',
  type: "'WOODEN' | 'REINFORCED'",
  state: "'OPEN' | 'CLOSED'",
});

export const portalSchema = type({
  id: 'string > 0',
  from: 'string > 0',
  to: 'string > 0',
  type: "'SECRET_DOOR'",
});

export const boardSchema = type({
  id: 'string > 0',
  nameKey: 'string > 0',
  nodes: nodeSchema.array(),
  edges: edgeSchema.array(),
  'doors?': doorSchema.array(),
  'portals?': portalSchema.array(),
});

export const weaponSchema = type({
  id: 'string > 0',
  nameKey: 'string > 0',
  kind: "'CLOSE_COMBAT' | 'PISTOL' | 'MENTAL' | 'AUTOMATIC'",
  /** Nombre de dés de base (CaC 2, Pistolet 4, Mental 4, Automatique 5) : donnée, jamais constante de code. */
  dice: 'number.integer > 0',
});

const statsRow = type({
  combat: 'number.integer >= 0',
  physical: 'number.integer >= 0',
  mental: 'number.integer >= 0',
  movement: 'number.integer >= 0',
});

export const characterSchema = type({
  id: 'string > 0',
  factionId: 'string > 0',
  nameKey: 'string > 0',
  kind: "'HERO' | 'TROOP' | 'MERCENARY'",
  /** De la pleine santé à la dernière blessure ; la longueur = niveaux de santé. */
  statRows: statsRow.array().atLeastLength(1),
  weaponIds: 'string[]',
  competencies: "('ATHLETICS' | 'MECHANICS' | 'MEDIC' | 'MENTAL' | 'SPECIAL')[]",
});

export const factionSchema = type({
  id: 'string > 0',
  nameKey: 'string > 0',
});

export const factionRelationSchema = type({
  factionA: 'string > 0',
  factionB: 'string > 0',
  relation: "'ALLY' | 'ENEMY' | 'NEUTRAL'",
});

export const factionsFileSchema = type({
  factions: factionSchema.array(),
  relations: factionRelationSchema.array(),
});

export type BoardJson = typeof boardSchema.infer;
export type WeaponDefinition = typeof weaponSchema.infer;
export type CharacterDefinition = typeof characterSchema.infer;
export type FactionDefinition = typeof factionSchema.infer;
export type FactionRelation = typeof factionRelationSchema.infer;
export type FactionsFile = typeof factionsFileSchema.infer;
