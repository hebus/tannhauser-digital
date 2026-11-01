import type { CameraControl } from '@tannhauser/renderer/src/contract';

export interface CameraWidgetOptions {
  /** Libellé (localisé par le client) d'un bouton ; vide = aucun. */
  readonly text: (control: CameraControl) => string;
  readonly onRotate: (direction: 1 | -1) => void;
  readonly onNorth: () => void;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * Commandes de caméra en DOM, en bas à droite de la zone libre : pivoter d'un quart de tour, et une boussole dont
 * l'aiguille montre le nord du plateau (le haut du rendu 2D) ; un clic sur la boussole y ramène la vue.
 */
export class CameraWidget {
  private readonly root = document.createElement('div');
  private readonly needle = document.createElement('span');
  private shownAngle = Number.NaN;

  constructor(options: CameraWidgetOptions) {
    Object.assign(this.root.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: '900',
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
      font: `600 16px ${FONT}`,
    });
    const button = (control: CameraControl, content: HTMLElement | string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      const label = options.text(control);
      if (label) {
        b.title = label;
        b.setAttribute('aria-label', label);
      }
      Object.assign(b.style, {
        width: '38px',
        height: '38px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(20,22,26,0.82)',
        color: '#f1f3f5',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        padding: '0',
        font: 'inherit',
      });
      b.append(content);
      // Un clic sur un bouton ne doit ni sélectionner une case ni démarrer un glissement de caméra.
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', onClick);
      return b;
    };
    // Aiguille de boussole : moitié nord rouge marquée « N », moitié sud claire ; elle tourne en entier avec le plateau.
    Object.assign(this.needle.style, { display: 'block', width: '26px', height: '26px' });
    this.needle.innerHTML =
      '<svg viewBox="-13 -13 26 26" width="26" height="26" aria-hidden="true">' +
      '<polygon points="0,-11 4,0 -4,0" fill="#ff6b6b"/><polygon points="0,11 4,0 -4,0" fill="#dee2e6"/>' +
      '<text x="0" y="-3.5" font-size="5.5" font-weight="800" text-anchor="middle" fill="#111" font-family="system-ui, sans-serif">N</text></svg>';
    const north = this.needle;
    this.root.append(
      button('rotateLeft', '⟲', () => options.onRotate(-1)),
      button('north', north, options.onNorth),
      button('rotateRight', '⟳', () => options.onRotate(1)),
    );
    document.body.appendChild(this.root);
  }

  /** Place le bloc à droite de la zone libre (hors HUD). */
  setRightInset(px: number): void {
    this.root.style.right = `${Math.round(px + 16)}px`;
  }

  /** Oriente l'aiguille : `azimuth` (radians) est celui de la caméra, le nord tourne avec le plateau. */
  setAzimuth(azimuth: number): void {
    const deg = Math.round((azimuth * 180) / Math.PI);
    if (deg === this.shownAngle) return;
    this.shownAngle = deg;
    this.needle.style.transform = `rotate(${deg}deg)`;
  }

  destroy(): void {
    this.root.remove();
  }
}
