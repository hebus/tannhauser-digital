import { loadBoard } from '@tannhauser/content/src/loaders';
import type { BoardRenderer } from '@tannhauser/renderer/src/contract';
import { ReducedMotion } from '@tannhauser/renderer/src/presentation/reduced-motion';
import { h } from '../ui/dom';
import { hasKey, t } from '../ui/i18n';
import type { EditorDoc } from './model';

/**
 * Aperçu 3D du plateau édité, en lecture seule et plein écran : le vrai rendu 3D du jeu (`@tannhauser/renderer-3d`,
 * chargé au premier aperçu), sans partie ni pions. Reconstruit à chaque ouverture depuis le document en cours, même non
 * enregistré. Un plateau en erreur ne s'affiche pas (le jeu refuserait de le charger) : `loadBoard` lève alors.
 */
export class Preview3d {
  private overlay: HTMLElement | null = null;
  private renderer: BoardRenderer | null = null;
  private reducedMotion: ReducedMotion | null = null;

  constructor(private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  async open(doc: EditorDoc): Promise<void> {
    this.close();
    const loaded = loadBoard(doc, doc.id);
    const { createThreeRenderer } = await import('@tannhauser/renderer-3d');
    const bar = h(
      'div',
      { class: 'be-preview-bar' },
      h('b', { text: `Aperçu 3D · ${doc.id}` }),
      h('span', { class: 'be-hint', text: 'Lecture seule, sans pions. Glisser : déplacer · clic droit : pivoter · molette : zoom · Maj + ←/→ : quart de tour' }),
      h('button', { class: 'be-btn is-primary', text: 'Revenir à l’édition (W / Échap)', attrs: { type: 'button' }, on: { click: () => this.close() } }),
    );
    const host = h('div', { class: 'be-preview-host' });
    const overlay = h('div', { class: 'be-preview', attrs: { role: 'dialog', 'aria-label': 'Aperçu 3D' } }, host, bar);
    document.body.append(overlay);
    this.overlay = overlay;
    this.reducedMotion = new ReducedMotion();
    const renderer = createThreeRenderer({
      board: loaded.board,
      ...(loaded.layout ? { layout: loaded.layout } : {}),
      label: (key) => (hasKey(key) ? t(key) : key),
      reducedMotion: this.reducedMotion,
      insets: () => ({ left: 0, right: 0, top: bar.getBoundingClientRect().height }),
      characterLabels: () => () => undefined,
      bannerText: () => ({ title: '', subtitle: '' }),
      calloutText: () => '',
      cameraText: (control) => t(`view.camera.${control}`),
      events: { onPick: () => undefined, onHover: () => undefined, onInteract: () => undefined },
    });
    this.renderer = renderer;
    await renderer.init(host);
    renderer.fit();
  }

  close(): void {
    if (!this.overlay) return;
    this.renderer?.destroy();
    this.reducedMotion?.destroy();
    this.overlay.remove();
    this.overlay = null;
    this.renderer = null;
    this.reducedMotion = null;
    this.onClose();
  }
}
