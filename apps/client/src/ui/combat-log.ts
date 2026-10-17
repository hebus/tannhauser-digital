import { h } from './dom';
import type { LogEntry, LogTone } from './combat-log-format';
import { t } from './i18n';

export interface CombatLogPanel {
  /** Bouton d'ouverture/fermeture (avec compteur de nouveaux événements) : placé dans la barre supérieure, à côté de Menu. */
  readonly toggle: HTMLElement;
  /** `silent` : historique déjà connu (pas compté comme nouveau). Les entrées reçues journal replié alimentent le compteur. */
  append(entries: readonly LogEntry[], silent?: boolean): void;
  /** Appelé quand le journal se plie ou se déplie (la place occupée change : le cadrage de la caméra doit suivre). */
  onToggle(callback: () => void): void;
}

const MAX_ENTRIES = 400;
const STORAGE_KEY = 'tannhauser.log.collapsed';

/** Pictogramme par ton : l'information n'est jamais portée par la couleur seule. */
const ICONS: Record<LogTone, string> = { info: '▸', turn: '⏱', hit: '⚔', miss: '⚔', kill: '✖', refusal: '⚠', victory: '★' };

/** Replié par défaut : le plateau reste le point focal pendant la décision tactique ; le choix du joueur est mémorisé. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // stockage indisponible : l'état n'est simplement pas mémorisé
  }
}

/** Panneau repliable du journal : une entrée par événement ; un échange d'attaque se déplie en détail du jet. */
export function createCombatLog(root: HTMLElement): CombatLogPanel {
  let collapsed = readCollapsed();
  let unread = 0;
  let onToggle: () => void = () => {};
  const list = h('ol', { class: 'log-list', attrs: { role: 'log', 'aria-label': t('log.title'), tabindex: '0' } });
  const empty = h('p', { class: 'hud-note log-empty', text: t('log.empty') });
  const badge = h('span', { class: 'log-badge', attrs: { hidden: true, 'aria-hidden': 'true' } });
  const toggleText = h('span');
  const toggle = h('button', { class: 'hud-btn hud-menu-button log-toggle', attrs: { type: 'button', 'aria-expanded': String(!collapsed), 'aria-controls': 'log-body' } }, toggleText, badge);
  const body = h('div', { class: 'log-body', attrs: { id: 'log-body' } }, empty, list);
  const panel = h('aside', { class: 'hud-panel hud-log', attrs: { 'aria-label': t('log.title') } }, h('div', { class: 'hud-row log-head' }, h('h2', { class: 'hud-title', text: t('log.title') })), body);
  root.append(panel);

  function applyCollapsed(): void {
    body.hidden = collapsed;
    panel.hidden = collapsed;
    panel.classList.toggle('is-collapsed', collapsed);
    toggleText.textContent = `▤ ${t('log.button')}`;
    badge.hidden = !collapsed || unread === 0;
    badge.textContent = String(unread);
    toggle.title = collapsed && unread > 0 ? t('log.unread', { n: unread }) : '';
    if (collapsed && unread > 0) toggle.setAttribute('aria-label', `${t('log.button')} (${t('log.unread', { n: unread })})`);
    else toggle.removeAttribute('aria-label');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    if (!collapsed) unread = 0;
    writeCollapsed(collapsed);
    applyCollapsed();
    if (!collapsed) list.scrollTop = list.scrollHeight;
    onToggle();
  });
  applyCollapsed();

  /** Pastilles des effets d'équipement appliqués (pictogramme + nom en info-bulle). */
  const effectChips = (entry: LogEntry): HTMLElement[] =>
    (entry.effects ?? []).map((e) => h('span', { class: 'log-effect', text: e.icon, attrs: { role: 'img', title: e.label, 'aria-label': e.label } }));

  function entryNode(entry: LogEntry): HTMLElement {
    const icon = h('span', { class: 'log-icon', text: ICONS[entry.tone], attrs: { 'aria-hidden': 'true' } });
    if (entry.lines.length === 0) {
      return h('li', { class: `log-entry log-${entry.tone}` }, icon, h('span', { text: entry.text }), ...effectChips(entry));
    }
    return h(
      'li',
      { class: `log-entry log-${entry.tone}` },
      h(
        'details',
        { attrs: { open: true } },
        h('summary', {}, icon, h('span', { text: entry.text }), ...effectChips(entry)),
        h('ol', { class: 'log-lines', attrs: { 'aria-label': t('log.details') } }, ...entry.lines.map((line) => h('li', { text: line }))),
      ),
    );
  }

  return {
    toggle,
    onToggle(callback) {
      onToggle = callback;
    },
    append(entries, silent = false) {
      if (entries.length === 0) return;
      if (collapsed && !silent) {
        unread += entries.length;
        applyCollapsed();
      }
      empty.hidden = true;
      // Les détails des échanges précédents se replient pour ne garder que le dernier ouvert.
      if (entries.some((e) => e.lines.length > 0)) list.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
      for (const entry of entries) list.append(entryNode(entry));
      while (list.children.length > MAX_ENTRIES) list.firstElementChild?.remove();
      list.scrollTop = list.scrollHeight;
    },
  };
}
