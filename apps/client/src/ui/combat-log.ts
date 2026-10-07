import { h } from './dom';
import type { LogEntry, LogTone } from './combat-log-format';
import { t } from './i18n';

export interface CombatLogPanel {
  append(entries: readonly LogEntry[]): void;
}

const MAX_ENTRIES = 400;
const STORAGE_KEY = 'tannhauser.log.collapsed';

/** Pictogramme par ton : l'information n'est jamais portée par la couleur seule. */
const ICONS: Record<LogTone, string> = { info: '▸', turn: '⏱', hit: '⚔', miss: '⚔', kill: '✖', refusal: '⚠', victory: '★' };

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
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
  const list = h('ol', { class: 'log-list', attrs: { role: 'log', 'aria-label': t('log.title'), tabindex: '0' } });
  const empty = h('p', { class: 'hud-note log-empty', text: t('log.empty') });
  const toggle = h('button', { class: 'hud-btn hud-btn-small log-toggle', attrs: { type: 'button', 'aria-expanded': String(!collapsed), 'aria-controls': 'log-body' } });
  const body = h('div', { class: 'log-body', attrs: { id: 'log-body' } }, empty, list);
  const panel = h('aside', { class: 'hud-panel hud-log', attrs: { 'aria-label': t('log.title') } }, h('div', { class: 'hud-row log-head' }, h('h2', { class: 'hud-title', text: t('log.title') }), toggle), body);
  root.append(panel);

  function applyCollapsed(): void {
    body.hidden = collapsed;
    panel.classList.toggle('is-collapsed', collapsed);
    toggle.textContent = collapsed ? `▸ ${t('log.expand')}` : `▾ ${t('log.collapse')}`;
    toggle.setAttribute('aria-expanded', String(!collapsed));
  }
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    writeCollapsed(collapsed);
    applyCollapsed();
  });
  applyCollapsed();

  function entryNode(entry: LogEntry): HTMLElement {
    const icon = h('span', { class: 'log-icon', text: ICONS[entry.tone], attrs: { 'aria-hidden': 'true' } });
    if (entry.lines.length === 0) {
      return h('li', { class: `log-entry log-${entry.tone}` }, icon, h('span', { text: entry.text }));
    }
    return h(
      'li',
      { class: `log-entry log-${entry.tone}` },
      h(
        'details',
        { attrs: { open: true } },
        h('summary', {}, icon, h('span', { text: entry.text })),
        h('ol', { class: 'log-lines', attrs: { 'aria-label': t('log.details') } }, ...entry.lines.map((line) => h('li', { text: line }))),
      ),
    );
  }

  return {
    append(entries) {
      if (entries.length === 0) return;
      empty.hidden = true;
      // Les détails des échanges précédents se replient pour ne garder que le dernier ouvert.
      if (entries.some((e) => e.lines.length > 0)) list.querySelectorAll('details[open]').forEach((d) => d.removeAttribute('open'));
      for (const entry of entries) list.append(entryNode(entry));
      while (list.children.length > MAX_ENTRIES) list.firstElementChild?.remove();
      list.scrollTop = list.scrollHeight;
    },
  };
}
