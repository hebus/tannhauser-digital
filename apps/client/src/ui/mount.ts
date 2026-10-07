import type { GameFacade } from '../game-facade';
import { buildLogEntries, refusalEntry } from './combat-log-format';
import { createCombatLog } from './combat-log';
import { createEndScreen, createMenu } from './dialogs';
import { h, isTypingTarget } from './dom';
import { createHud } from './hud';
import { createLabeler } from './labels';
import { interceptRefusals, watchIgnoredInput } from './refusals';
import { t } from './i18n';

export interface UiHandle {
  /** Largeur occupée par les panneaux latéraux (px) : à déduire de la zone de cadrage de la caméra. */
  insets(): { left: number; right: number };
}

/**
 * Monte tout le HUD HTML (statut, actions, réaction, journal, menu, fin de partie) sur une façade déjà créée.
 * N'écrit jamais dans le moteur autrement que via `game.dispatch` ; remplace l'ancien bloc `#hud` d'index.html.
 */
export function mountUi(game: GameFacade): UiHandle {
  document.getElementById('hud')?.remove();
  const root = h('div', { class: 'ui-root', attrs: { id: 'ui-root' } });
  document.body.append(root);

  const right = h('div', { class: 'hud-right' });
  const menu = createMenu(root);
  right.append(h('div', { class: 'hud-topbar' }, h('span', { class: 'hud-brand', text: t('app.title') }), menu.opener));
  root.append(right);

  const log = createCombatLog(right);
  const hud = createHud(root, game);
  const endScreen = createEndScreen(root);

  const refresh = (): void => {
    hud.render();
    endScreen.render(game.state, createLabeler(game.state), game.replaySeed);
  };

  const { dispatchCount } = interceptRefusals(game, (messages) => {
    hud.toast(t('actions.refused', { reason: messages.join(' ') }), 'error');
    log.append(messages.map(refusalEntry));
  });
  watchIgnoredInput(game, dispatchCount, (message) => hud.toast(message, 'error'));

  log.append(buildLogEntries(game.state.history, createLabeler(game.state)));
  game.subscribe((events, state) => {
    log.append(buildLogEntries(events, createLabeler(state)));
    refresh();
  });
  refresh();

  window.addEventListener('keydown', (e) => {
    if (menu.isOpen() || isTypingTarget(e.target)) return;
    if (document.querySelector('.ui-overlay:not([hidden])')) return;
    if (hud.handleKey(e)) e.preventDefault();
  });

  return {
    insets: () => {
      const l = root.querySelector('.hud-left')?.getBoundingClientRect();
      const r = right.getBoundingClientRect();
      return { left: Math.round(l?.right ?? 0), right: Math.round(window.innerWidth - r.left) };
    },
  };
}
