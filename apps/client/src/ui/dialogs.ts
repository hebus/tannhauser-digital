import type { GameMode, GameState } from '@tannhauser/core';
import { h } from './dom';
import { t } from './i18n';
import type { Labeler } from './labels';
import { modeRules } from './mode-rules';
import { openNewSetup, replaySameSeed } from './session';

const FOCUSABLE = 'button, [href], input, select, [tabindex]:not([tabindex="-1"])';

/** Garde le focus clavier dans la boîte de dialogue et gère Échap. */
function trapFocus(dialog: HTMLElement, onEscape?: () => void): void {
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('hidden'));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

export interface MenuDialog {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Bouton d'ouverture à placer dans la barre du HUD. */
  readonly opener: HTMLElement;
}

/** Menu « Nouvelle partie » : rejouer avec la même graine ou revenir à l'écran de mise en place. */
export function createMenu(root: HTMLElement): MenuDialog {
  const opener = h('button', { class: 'hud-btn hud-menu-button', text: `☰ ${t('menu.button')}`, attrs: { type: 'button', 'aria-haspopup': 'dialog' } });
  const dialog = h(
    'div',
    { class: 'ui-overlay', attrs: { hidden: true } },
    h(
      'div',
      { class: 'ui-dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'menu-title' } },
      h('h2', { class: 'ui-dialog-title', text: t('menu.title'), attrs: { id: 'menu-title' } }),
      h('div', { class: 'ui-dialog-buttons' },
        h('button', { class: 'hud-btn hud-btn-primary', text: t('menu.replay'), attrs: { type: 'button', 'data-fid': 'menu-replay' }, on: { click: () => replaySameSeed() } }),
        h('button', { class: 'hud-btn', text: t('menu.new'), attrs: { type: 'button' }, on: { click: () => openNewSetup() } }),
        h('button', { class: 'hud-btn', text: t('menu.close'), attrs: { type: 'button' }, on: { click: () => close() } }),
      ),
    ),
  );
  const box = dialog.firstElementChild as HTMLElement;
  trapFocus(box, () => close());
  dialog.addEventListener('pointerdown', (e) => {
    if (e.target === dialog) close();
  });
  root.append(dialog);

  function open(): void {
    dialog.hidden = false;
    box.querySelector<HTMLElement>('button')?.focus();
  }
  function close(): void {
    if (dialog.hidden) return;
    dialog.hidden = true;
    opener.focus();
  }
  opener.addEventListener('click', open);
  return { open, close, isOpen: () => !dialog.hidden, opener };
}

export interface EndScreen {
  render(state: GameState, labels: Labeler, seed: number): void;
}

/** Écran de victoire/défaite avec rejeu (même graine) ou nouvelle configuration. */
export function createEndScreen(root: HTMLElement): EndScreen {
  const overlay = h('div', { class: 'ui-overlay ui-overlay-end', attrs: { hidden: true } });
  root.append(overlay);
  return {
    render(state, labels, seed) {
      if (state.phase !== 'FINISHED') {
        overlay.hidden = true;
        return;
      }
      const winner = state.victory.winnerId;
      const reasonKey = `end.reason.${state.victory.reason ?? ''}`;
      overlay.textContent = '';
      const box = h(
        'div',
        { class: 'ui-dialog ui-dialog-end', attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'end-title' } },
        h('h2', { class: 'ui-dialog-title', text: `★ ${winner ? t('end.victory', { winner: labels.player(winner) }) : t('status.finished')}`, attrs: { id: 'end-title' } }),
        h('p', { text: t(reasonKey) === reasonKey ? '' : t(reasonKey) }),
        h('p', { class: 'hud-note', text: t('status.seed', { seed }) }),
        h('div', { class: 'ui-dialog-buttons' },
          h('button', { class: 'hud-btn hud-btn-primary', text: t('end.replay'), attrs: { type: 'button' }, on: { click: () => replaySameSeed() } }),
          h('button', { class: 'hud-btn', text: t('end.new'), attrs: { type: 'button' }, on: { click: () => openNewSetup() } }),
          h('button', { class: 'hud-btn', text: t('end.dismiss'), attrs: { type: 'button' }, on: { click: () => { overlay.hidden = true; } } }),
        ),
      );
      trapFocus(box);
      overlay.append(box);
      overlay.hidden = false;
      box.querySelector<HTMLElement>('button')?.focus();
    },
  };
}

export interface ModeRulesDialog {
  toggle(): void;
  close(): boolean;
}

/** Fenêtre « Règles du mode » : objectif et règles du mode de la partie, ouverte depuis le HUD (bouton ou touche V). */
export function createModeRulesDialog(root: HTMLElement, mode: GameMode, onClose: () => void): ModeRulesDialog {
  const info = modeRules(mode);
  const overlay = h('div', { class: 'ui-overlay', attrs: { hidden: true } });
  const box = h(
    'div',
    { class: 'ui-dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mode-rules-title' } },
    h('h2', { class: 'ui-dialog-title', text: `${t('modeHelp.title')} — ${info.name}`, attrs: { id: 'mode-rules-title' } }),
    h('p', { class: 'mode-goal' }, h('strong', { text: `${t('modeHelp.goalLabel')} : ` }), info.goal),
    h('ul', { class: 'mode-rules' }, ...info.rules.map((r) => h('li', { text: r }))),
    h('div', { class: 'ui-dialog-buttons' }, h('button', { class: 'hud-btn hud-btn-primary', text: t('modeHelp.close'), attrs: { type: 'button' }, on: { click: () => close() } })),
  );
  overlay.append(box);
  trapFocus(box, () => close());
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) close();
  });
  root.append(overlay);

  function open(): void {
    overlay.hidden = false;
    box.querySelector<HTMLElement>('button')?.focus();
  }
  function close(): boolean {
    if (overlay.hidden) return false;
    overlay.hidden = true;
    onClose();
    return true;
  }
  return { toggle: () => (overlay.hidden ? open() : void close()), close };
}
