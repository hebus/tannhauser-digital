import {
  defaultNodeProperties,
  type BoardEdge,
  type BoardNode,
  type BoardPortal,
  type BoardState,
  type ColorId,
  type Door,
  type NodeProperties,
} from './types';

/** Construction concise d'un plateau (tests, plateau de dev). */
export class BoardBuilder {
  private readonly nodes: Record<string, BoardNode> = {};
  private readonly edges: BoardEdge[] = [];
  private readonly doors: Record<string, Door> = {};
  private readonly portals: BoardPortal[] = [];

  node(id: string, colors: ColorId[], x = 0, y = 0, props: Partial<NodeProperties> = {}, zoneId?: string): this {
    this.nodes[id] = { id, x, y, colors, zoneId, properties: { ...defaultNodeProperties, ...props } };
    return this;
  }

  edge(from: string, to: string, opts: { oneWay?: boolean; doorId?: string } = {}): this {
    this.edges.push({ from, to, ...opts });
    return this;
  }

  door(id: string, state: Door['state'] = 'CLOSED', type: Door['type'] = 'WOODEN'): this {
    this.doors[id] = { id, state, type };
    return this;
  }

  portal(id: string, from: string, to: string): this {
    this.portals.push({ id, from, to, type: 'SECRET_DOOR' });
    return this;
  }

  build(): BoardState {
    return { nodes: this.nodes, edges: this.edges, doors: this.doors, portals: this.portals };
  }
}
