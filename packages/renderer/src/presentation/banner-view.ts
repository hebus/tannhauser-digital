import { Container, Graphics, Text } from 'pixi.js';
import { drawBody } from '../character-layer';
import { playerColor } from '../palette';
import { BANNER_ICONS, type BannerIcon, type BannerKind, type BannerPose, type BannerText } from './banner';

/** Couleur d'accent quand aucun joueur n'est concerné (or de l'interface). */
const NEUTRAL_ACCENT = 0xe0b040;
const BAND_HEIGHT = 108;
/** Largeur du bandeau : très large pour couvrir l'écran quelle que soit sa taille (rogné par le canvas). */
const BAND_WIDTH = 5000;
/** Distance (px) parcourue par le glissement du contenu à l'entrée. */
const SLIDE_DISTANCE = 180;

function drawIcon(g: Graphics, icon: BannerIcon, s: number, color: number): void {
  switch (icon) {
    case 'flag':
      g.moveTo(-s * 0.6, -s).lineTo(-s * 0.6, s).stroke({ width: 4, color, cap: 'round' });
      g.poly([-s * 0.6, -s, s, -s * 0.4, -s * 0.6, s * 0.2]).fill(color);
      break;
    case 'eye':
      g.ellipse(0, 0, s, s * 0.62).stroke({ width: 3.5, color });
      g.circle(0, 0, s * 0.3).fill(color);
      break;
    case 'chevrons':
      for (const dx of [-s * 0.45, s * 0.45]) {
        g.moveTo(dx - s * 0.45, -s * 0.75).lineTo(dx + s * 0.35, 0).lineTo(dx - s * 0.45, s * 0.75).stroke({ width: 4.5, color, cap: 'round', join: 'round' });
      }
      break;
    case 'arrow':
      g.poly([-s * 0.6, -s * 0.9, s * 0.9, 0, -s * 0.6, s * 0.9]).fill(color);
      break;
    case 'crosshair':
      g.circle(0, 0, s * 0.68).stroke({ width: 3.5, color });
      g.moveTo(-s * 1.1, 0).lineTo(-s * 0.3, 0).moveTo(s * 0.3, 0).lineTo(s * 1.1, 0);
      g.moveTo(0, -s * 1.1).lineTo(0, -s * 0.3).moveTo(0, s * 0.3).lineTo(0, s * 1.1).stroke({ width: 3.5, color });
      break;
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? s * 1.1 : s * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.poly(pts).fill(color);
      break;
    }
  }
}

export interface BannerView {
  readonly container: Container;
  /** Applique une pose (glissement, zoom, opacité, ouverture) ; sans effet une fois détruite. */
  setPose(pose: BannerPose): void;
  destroy(): void;
}

/**
 * Bandeau pleine largeur : fond semi-transparent, liserés aux couleurs du joueur concerné, pictogramme de phase
 * (dessiné en Graphics), titre, sous-titre et marque du joueur (même couleur ET même forme que ses pions).
 * Centré sur l'origine du conteneur : l'appelant le place à l'écran.
 */
export function createBannerView(kind: BannerKind, text: BannerText, playerIndex: number | null): BannerView {
  const accent = playerIndex === null ? NEUTRAL_ACCENT : playerColor(playerIndex);
  const container = new Container();
  container.label = `Banner:${kind}`;

  const band = new Graphics();
  band.rect(-BAND_WIDTH / 2, -BAND_HEIGHT / 2, BAND_WIDTH, BAND_HEIGHT).fill({ color: 0x0b0d10, alpha: 0.82 });
  band.rect(-BAND_WIDTH / 2, -BAND_HEIGHT / 2, BAND_WIDTH, 4).fill(accent);
  band.rect(-BAND_WIDTH / 2, BAND_HEIGHT / 2 - 4, BAND_WIDTH, 4).fill(accent);
  band.rect(-BAND_WIDTH / 2, -BAND_HEIGHT / 2 + 4, BAND_WIDTH, 1).fill({ color: 0xffffff, alpha: 0.25 });

  const title = new Text({ text: text.title, style: { fill: 0xffffff, fontSize: 34, fontWeight: '800', letterSpacing: 1, stroke: { color: 0x000000, width: 4 } } });
  const subtitle = new Text({ text: text.subtitle, style: { fill: 0xdfe3ea, fontSize: 18, fontWeight: '600', stroke: { color: 0x000000, width: 3 } } });
  title.anchor.set(0, 1);
  subtitle.anchor.set(0, 0);
  const textW = Math.max(title.width, subtitle.width);

  const badgeR = 30;
  const markR = 15;
  const gap = 20;
  const total = badgeR * 2 + gap + textW + (playerIndex === null ? 0 : gap + markR * 2.4);
  const left = -total / 2;

  const badge = new Graphics();
  badge.circle(0, 0, badgeR).fill({ color: 0x0b0d10, alpha: 0.95 }).stroke({ width: 3, color: accent });
  const icon = new Graphics();
  drawIcon(icon, BANNER_ICONS[kind], 15, accent);
  badge.position.set(left + badgeR, 0);
  icon.position.set(left + badgeR, 0);

  const textX = left + badgeR * 2 + gap;
  title.position.set(textX, 2);
  subtitle.position.set(textX, 4);

  const content = new Container();
  content.addChild(badge, icon, title, subtitle);
  if (playerIndex !== null) {
    const mark = new Graphics();
    drawBody(mark, playerIndex, markR, accent, 3, 0xffffff);
    mark.position.set(textX + textW + gap + markR * 1.2, 0);
    content.addChild(mark);
  }

  container.addChild(band, content);
  return {
    container,
    setPose: (pose) => {
      if (container.destroyed) return;
      container.alpha = pose.alpha;
      band.scale.y = Math.max(0.01, pose.open);
      content.position.x = pose.slide * SLIDE_DISTANCE;
      content.scale.set(pose.scale);
    },
    destroy: () => {
      if (!container.destroyed) container.destroy({ children: true });
    },
  };
}
