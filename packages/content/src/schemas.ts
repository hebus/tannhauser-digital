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

const layoutPoint = type({ x: 'number', y: 'number' });

/** Mise en page d'affichage (voir `BoardLayout` du renderer) : pièces en polygones, couloirs en lignes brisées. */
export const layoutSchema = type({
  rooms: type({
    id: 'string > 0',
    'nameKey?': 'string',
    polygon: layoutPoint.array().atLeastLength(3),
    'fill?': /^#[0-9a-fA-F]{6}$/,
  }).array(),
  corridors: type({
    id: 'string > 0',
    points: layoutPoint.array().atLeastLength(2),
    width: 'number > 0',
  }).array(),
});

export const boardSchema = type({
  id: 'string > 0',
  nameKey: 'string > 0',
  nodes: nodeSchema.array(),
  edges: edgeSchema.array(),
  'doors?': doorSchema.array(),
  'portals?': portalSchema.array(),
  'layout?': layoutSchema,
});

/** Trait qui fait d'un équipement une arme : sans lui, le porteur est considéré sans arme. */
export const WEAPON_TRAIT = 'weapon';

/** Traits de type d'arme (un seul par arme, en plus de `weapon`) et famille de combat correspondante. */
export const WEAPON_TYPE_TRAITS = {
  pistol: 'PISTOL',
  mental: 'MENTAL',
  automatic: 'AUTOMATIC',
  'hand-to-hand': 'CAC',
} as const;

/** Effets de règle d'un équipement : les seuls types que le moteur connaît (`EquipmentEffect` du cœur). */
export const effectSchema = type({ type: "'CRITICAL_HIT'" })
  .or({ type: "'BEST_CHARACTERISTIC'", characteristic: "'combat' | 'physical'" })
  .or({ type: "'EXTRA_DICE_ON_NATURAL_10'", dice: 'number.integer > 0' })
  .or({ type: "'REROLL_LOWEST'", count: 'number.integer > 0' })
  .or({ type: "'EXTRA_DICE_WITH_WEAPON'", weaponId: 'string > 0', dice: 'number.integer > 0' })
  .or({ type: "'GAIN_COMMAND_POINTS'", amount: 'number.integer > 0' })
  .or({ type: "'FREE_OVERWATCH'" });

export const equipmentSchema = type({
  id: 'string > 0',
  nameKey: 'string > 0',
  /** Un ou plusieurs traits (ensemble ouvert : weapon, pistol, medal, grenade, rank…). */
  traits: type('string > 0').array().atLeastLength(1),
  /** Nombre de dés de base d'une arme (CaC 2, Pistolet 4, Mental 4, Automatique 5) : donnée, jamais constante de code. */
  'dice?': 'number.integer > 0',
  /** Clé i18n du texte d'effet. Les effets sont de la donnée descriptive tant que le moteur ne les implémente pas. */
  'descriptionKey?': 'string > 0',
  /** Effets que le moteur applique (en plus du texte descriptif). */
  'effects?': effectSchema.array(),
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
  equipmentIds: 'string[]',
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
export type BoardLayoutJson = typeof layoutSchema.infer;
export type EquipmentDefinition = typeof equipmentSchema.infer;
export type CharacterDefinition = typeof characterSchema.infer;
export type FactionDefinition = typeof factionSchema.infer;
export type FactionRelation = typeof factionRelationSchema.infer;
export type FactionsFile = typeof factionsFileSchema.infer;
