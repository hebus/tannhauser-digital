import { Container, Graphics, Text } from 'pixi.js';
import { currentStats, type CharacterState, type GameState } from '@tannhauser/core';
import { NODE_RADIUS } from './board-view';

const PLAYER_COLORS = [0x4dabf7, 0xff6b6b, 0xffd43b, 0x69db7c];

/** Couche des personnages : lecture seule de `GameState`, redessinée à chaque mise à jour. */
export class CharacterLayer extends Container {
  constructor() {
    super();
    this.label = 'CharacterLayer';
  }

  update(state: GameState): void {
    for (const child of this.removeChildren()) child.destroy({ children: true });
    const playerIndex = new Map(state.players.map((p, i) => [p.id, i]));
    // Plusieurs personnages sur un même nœud : décalage horizontal pour rester lisibles.
    const perNode = new Map<string, number>();
    for (const c of state.characters) {
      const node = state.board.nodes[c.nodeId];
      if (!node) continue;
      const slot = perNode.get(c.nodeId) ?? 0;
      perNode.set(c.nodeId, slot + 1);
      const color = PLAYER_COLORS[(playerIndex.get(c.playerId) ?? 0) % PLAYER_COLORS.length]!;
      this.addChild(this.token(c, state, node.x + slot * 16, node.y - slot * 6, color));
    }
  }

  private token(c: CharacterState, state: GameState, x: number, y: number, color: number): Container {
    const root = new Container();
    root.position.set(x, y);
    const g = new Graphics();
    const r = NODE_RADIUS * 0.62;
    const active = state.turn.activeCharacterId === c.id;
    if (!c.alive) {
      g.circle(0, 0, r).fill({ color: 0x555555, alpha: 0.6 }).stroke({ width: 2, color: 0x222222 });
      g.moveTo(-r * 0.6, -r * 0.6).lineTo(r * 0.6, r * 0.6).stroke({ width: 3, color: 0x111111 });
      g.moveTo(r * 0.6, -r * 0.6).lineTo(-r * 0.6, r * 0.6).stroke({ width: 3, color: 0x111111 });
    } else {
      g.circle(0, 0, r).fill(color).stroke({ width: active ? 5 : 3, color: active ? 0xffffff : 0x111111 });
      // Overwatch : anneau pointillé + marqueur (pas seulement une couleur : accessibilité §21).
      if (c.overwatch) {
        for (let i = 0; i < 12; i += 2) {
          const a0 = (i / 12) * Math.PI * 2;
          const a1 = ((i + 1) / 12) * Math.PI * 2;
          g.arc(0, 0, r + 6, a0, a1).stroke({ width: 3, color: 0xffffff });
        }
      }
    }
    root.addChild(g);

    const initials = new Text({
      text: c.definitionId.split('.').pop()?.slice(0, 1).toUpperCase() ?? '?',
      style: { fill: 0x111111, fontSize: 16, fontWeight: '800' },
    });
    initials.anchor.set(0.5);
    root.addChild(initials);

    if (c.alive) {
      const max = c.statRows.length;
      const pips = new Graphics();
      for (let i = 0; i < max; i += 1) {
        pips.rect(-max * 4 + i * 8, r + 3, 6, 5).fill(i < c.health ? 0x40c057 : 0x343a40);
      }
      root.addChild(pips);
      const stats = currentStats(c);
      const label = new Text({
        text: `C${stats.combat} P${stats.physical} M${c.movementLeft}`,
        style: { fill: 0xffffff, fontSize: 10, stroke: { color: 0x000000, width: 3 } },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, r + 10);
      root.addChild(label);
    }
    return root;
  }
}
