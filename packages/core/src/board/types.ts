export type NodeId = string;
export type ZoneId = string;
export type ColorId = string;
export type DoorId = string;

export type NodeKind = 'NORMAL' | 'OBJECTIVE' | 'ACTION' | 'ENTRY_POINT';

/**
 * Bonus/malus porté par une case (catalogue exact inconnu : voir open-questions.md).
 * Reste générique et data-driven : pas de cas spécial par type de case.
 */
export interface NodeModifier {
  readonly id: string;
  readonly applies: 'OCCUPANT' | 'ATTACKER' | 'DEFENDER';
  readonly extraDice?: number;
  readonly resultModifier?: number;
}

export interface NodeProperties {
  readonly kind: NodeKind;
  /** false = case impraticable (aucun déplacement possible dessus). */
  readonly passable: boolean;
  /** Surcoût de déplacement : 0, +1, +2… (gravats, etc.). */
  readonly movementCostModifier: number;
  readonly modifiers: readonly NodeModifier[];
}

export interface BoardNode {
  readonly id: NodeId;
  readonly x: number;
  readonly y: number;
  readonly zoneId?: ZoneId;
  /** 1 à 3 couleurs : elles définissent la ligne de vue (jamais les arêtes). */
  readonly colors: readonly ColorId[];
  readonly properties: NodeProperties;
}

/**
 * Arête de déplacement. `oneWay` = utilisable uniquement de `from` vers `to`.
 * N'a AUCUN effet sur la ligne de vue (qui dépend des couleurs).
 */
export interface BoardEdge {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly oneWay?: boolean;
  /** Porte portée par cette arête (bloque déplacement et vue si fermée). */
  readonly doorId?: DoorId;
}

export type DoorState = 'OPEN' | 'CLOSED';
export type DoorType = 'WOODEN' | 'REINFORCED';

export interface Door {
  readonly id: DoorId;
  readonly type: DoorType;
  readonly state: DoorState;
}

export interface BoardPortal {
  readonly id: string;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly type: 'SECRET_DOOR';
}

export interface BoardState {
  readonly nodes: Readonly<Record<NodeId, BoardNode>>;
  readonly edges: readonly BoardEdge[];
  readonly doors: Readonly<Record<DoorId, Door>>;
  readonly portals: readonly BoardPortal[];
}

export const MAX_COLORS_PER_NODE = 3;

export const defaultNodeProperties: NodeProperties = {
  kind: 'NORMAL',
  passable: true,
  movementCostModifier: 0,
  modifiers: [],
};
