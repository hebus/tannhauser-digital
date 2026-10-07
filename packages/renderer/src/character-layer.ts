import { Container, Graphics, Text } from 'pixi.js';
import { currentStats, type CharacterState, type GameState } from '@tannhauser/core';
import { NODE_RADIUS } from './board-view';
import type { Point } from './presentation/path-geometry';

const PLAYER_COLORS = [0x4dabf7, 0xff6b6b, 0xffd43b, 0x69db7c];
const TOKEN_RADIUS = NODE_RADIUS * 0.62;

/** Surcharge d'affichage purement visuelle d'un pion (animations) : jamais écrite dans `GameState`. */
export interface TokenDisplay {
  /** Position absolue (remplace celle de l'état tant qu'elle est définie). */
  x?: number;
  y?: number;
  /** Décalage relatif (secousse). */
  dx?: number;
  dy?: number;
  alpha?: number;
}

/** Forme du corps du pion, propre à chaque joueur : l'appartenance ne repose pas que sur la couleur (accessibilité). */
function drawBody(g: Graphics, shape: number, r: number, color: number, strokeWidth: number, strokeColor: number): void {
  switch (shape % 4) {
    case 0:
      g.circle(0, 0, r);
      break;
    case 1:
      g.poly([0, -r * 1.2, r * 1.2, 0, 0, r * 1.2, -r * 1.2, 0]);
      break;
    case 2:
      g.roundRect(-r, -r, r * 2, r * 2, 3);
      break;
    default:
      g.poly([0, -r * 1.2, r * 1.15, r * 0.9, -r * 1.15, r * 0.9]);
      break;
  }
  g.fill(color).stroke({ width: strokeWidth, color: strokeColor });
}

/**
 * Couche des personnages : lecture seule de `GameState`. Les pions sont persistants (un par personnage),
 * leur contenu est reconstruit à chaque `update` ; `setDisplay` permet aux animations de les déplacer
 * temporairement sans jamais modifier l'état.
 */
export class CharacterLayer extends Container {
  private readonly tokens = new Map<string, Container>();
  private readonly base = new Map<string, Point>();
  private readonly display = new Map<string, TokenDisplay>();
  private readonly rings = new Map<string, Graphics>();
  private readonly dead = new Set<string>();
  private textScale = 1;

  constructor() {
    super();
    this.label = 'CharacterLayer';
  }

  update(state: GameState): void {
    const playerIndex = new Map(state.players.map((p, i) => [p.id, i]));
    const seen = new Set<string>();
    // Plusieurs personnages sur un même nœud : décalage horizontal pour rester lisibles.
    const perNode = new Map<string, number>();
    for (const c of state.characters) {
      const node = state.board.nodes[c.nodeId];
      if (!node) continue;
      seen.add(c.id);
      const slot = perNode.get(c.nodeId) ?? 0;
      perNode.set(c.nodeId, slot + 1);
      const index = playerIndex.get(c.playerId) ?? 0;
      let token = this.tokens.get(c.id);
      if (!token) {
        token = new Container();
        this.tokens.set(c.id, token);
        this.addChild(token);
      }
      for (const child of token.removeChildren()) child.destroy({ children: true });
      this.rings.delete(c.id);
      this.fillToken(token, c, state, index);
      if (c.alive) this.dead.delete(c.id);
      else this.dead.add(c.id);
      this.base.set(c.id, { x: node.x + slot * 16, y: node.y - slot * 6 });
      this.place(c.id);
    }
    for (const [id, token] of [...this.tokens]) {
      if (seen.has(id)) continue;
      this.removeChild(token);
      token.destroy({ children: true });
      this.tokens.delete(id);
      this.base.delete(id);
      this.display.delete(id);
      this.rings.delete(id);
      this.dead.delete(id);
    }
  }

  /** Position affichée (surcharge d'animation comprise) d'un personnage, en coordonnées plateau. */
  tokenPosition(id: string): Point | null {
    const token = this.tokens.get(id);
    return token ? { x: token.x, y: token.y } : null;
  }

  /** Position issue de l'état, sans animation. */
  basePosition(id: string): Point | null {
    return this.base.get(id) ?? null;
  }

  /** Fusionne `patch` dans la surcharge d'affichage ; `null` la retire (retour à l'état). */
  setDisplay(id: string, patch: TokenDisplay | null): void {
    if (patch === null) this.display.delete(id);
    else this.display.set(id, { ...this.display.get(id), ...patch });
    this.place(id);
  }

  clearDisplay(): void {
    const ids = [...this.display.keys()];
    this.display.clear();
    for (const id of ids) this.place(id);
  }

  /** Taille des libellés de pion adaptée au zoom caméra (lisibilité à l'écran). */
  setTextScale(k: number): void {
    this.textScale = k;
    for (const token of this.tokens.values()) {
      for (const child of token.children) if (child instanceof Text) child.scale.set(k);
    }
  }

  /** Pulsation des anneaux d'Overwatch ; figée en mouvement réduit. */
  tick(timeMs: number, reduced: boolean): void {
    for (const ring of this.rings.values()) {
      const wave = reduced ? 0 : Math.sin(timeMs / 260);
      ring.scale.set(1 + 0.1 * wave);
      ring.alpha = 0.85 + 0.15 * wave;
    }
  }

  private place(id: string): void {
    const token = this.tokens.get(id);
    const base = this.base.get(id);
    if (!token || !base) return;
    const d = this.display.get(id);
    token.position.set((d?.x ?? base.x) + (d?.dx ?? 0), (d?.y ?? base.y) + (d?.dy ?? 0));
    token.alpha = d?.alpha ?? (this.dead.has(id) ? 0.6 : 1);
  }

  private fillToken(root: Container, c: CharacterState, state: GameState, playerIdx: number): void {
    const g = new Graphics();
    const r = TOKEN_RADIUS;
    const color = PLAYER_COLORS[playerIdx % PLAYER_COLORS.length]!;
    const active = state.turn.activeCharacterId === c.id;
    if (!c.alive) {
      drawBody(g, playerIdx, r, 0x555555, 2, 0x222222);
      g.moveTo(-r * 0.6, -r * 0.6).lineTo(r * 0.6, r * 0.6).stroke({ width: 3, color: 0x111111 });
      g.moveTo(r * 0.6, -r * 0.6).lineTo(-r * 0.6, r * 0.6).stroke({ width: 3, color: 0x111111 });
    } else {
      drawBody(g, playerIdx, r, color, active ? 5 : 3, active ? 0xffffff : 0x111111);
    }
    root.addChild(g);

    if (c.alive && active) {
      // Marqueur « actif » : chevron au-dessus du pion (forme, pas seulement l'épaisseur du contour).
      const m = new Graphics();
      m.poly([-6, -r - 16, 6, -r - 16, 0, -r - 7]).fill(0xffffff).stroke({ width: 2, color: 0x111111 });
      root.addChild(m);
    }
    if (c.alive && c.overwatch) {
      // Overwatch : anneau pointillé (forme) qui pulse, indépendant de la couleur du joueur.
      const ring = new Graphics();
      for (let i = 0; i < 12; i += 2) {
        const a0 = (i / 12) * Math.PI * 2;
        const a1 = ((i + 1) / 12) * Math.PI * 2;
        ring.arc(0, 0, r + 8, a0, a1).stroke({ width: 3, color: 0xffffff });
      }
      root.addChild(ring);
      this.rings.set(c.id, ring);
    }

    const initials = new Text({
      text: c.definitionId.split('.').pop()?.slice(0, 1).toUpperCase() ?? '?',
      style: { fill: 0x111111, fontSize: 16, fontWeight: '800' },
    });
    initials.anchor.set(0.5);
    initials.scale.set(this.textScale);
    root.addChild(initials);

    if (c.alive) {
      const max = c.statRows.length;
      const pips = new Graphics();
      for (let i = 0; i < max; i += 1) {
        const x = -max * 4 + i * 8;
        if (i < c.health) pips.rect(x, r + 3, 6, 5).fill(0x40c057);
        else pips.rect(x + 0.5, r + 3.5, 5, 4).stroke({ width: 1, color: 0xadb5bd });
      }
      root.addChild(pips);
      const stats = currentStats(c);
      const label = new Text({
        text: `C${stats.combat} P${stats.physical} M${c.movementLeft}`,
        style: { fill: 0xffffff, fontSize: 11, stroke: { color: 0x000000, width: 3 } },
      });
      label.anchor.set(0.5, 1);
      label.position.set(0, -r - (active ? 20 : 8));
      label.scale.set(this.textScale);
      root.addChild(label);
    }
  }
}
