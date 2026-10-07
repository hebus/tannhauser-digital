import { getLegalActions, getReactionOptions, type ActionId, type GameState } from '@tannhauser/core';
import type { GameFacade } from '../game-facade';
import { h, isTypingTarget, withFocusKept } from './dom';
import { ACTION_KEYS, MAIN_HANDLED_KEYS, actionRows, placementModel, reactionContext, rosterRows, statusModel, type ActionRow } from './hud-model';
import { reasonText, t } from './i18n';
import { createLabeler, type Labeler } from './labels';

export type ToastTone = 'info' | 'error';

export interface Hud {
  /** Redessine d'après l'état courant. */
  render(): void;
  /** Message bref visible et annoncé aux lecteurs d'écran (toujours une explication, jamais un silence). */
  toast(text: string, tone?: ToastTone): void;
  /** Ferme le sous-menu ouvert ; renvoie vrai s'il y en avait un. */
  closeMenu(): boolean;
  /** Raccourcis gérés par le HUD (hors E/O/P/T/D traités par main.ts) ; vrai si la touche a été consommée. */
  handleKey(event: KeyboardEvent): boolean;
}

type MenuKind = 'MOVE' | 'ATTACK' | 'OPEN_DOOR' | 'CLOSE_DOOR';

const TOAST_MS = 7000;

export function createHud(root: HTMLElement, game: GameFacade): Hud {
  const statusPanel = h('aside', { class: 'hud-panel hud-status', attrs: { 'aria-label': t('status.activeCharacter') } });
  const actionsPanel = h('section', { class: 'hud-panel hud-actions', attrs: { 'aria-label': t('actions.title') } });
  const reactionPanel = h('div', { class: 'hud-reaction', attrs: { role: 'alertdialog', 'aria-labelledby': 'hud-reaction-title', hidden: true } });
  const toastEl = h('div', { class: 'hud-toast', attrs: { role: 'status', 'aria-live': 'polite', hidden: true } });
  const banner = h('div', { class: 'hud-banner', attrs: { role: 'status', 'aria-live': 'polite', hidden: true } });
  const left = h('div', { class: 'hud-left' }, statusPanel, actionsPanel);
  root.append(left, banner, reactionPanel, toastEl);

  let menu: MenuKind | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const activeId = (s: GameState): string | undefined => s.turn.activeCharacterId;

  function toast(text: string, tone: ToastTone = 'info'): void {
    toastEl.textContent = '';
    toastEl.append(h('span', { class: 'hud-toast-icon', text: tone === 'error' ? '⚠' : 'ℹ', attrs: { 'aria-hidden': 'true' } }), h('span', { text }));
    toastEl.className = `hud-toast hud-toast-${tone}`;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, TOAST_MS);
  }

  function dispatch(command: Parameters<GameFacade['dispatch']>[0]): void {
    menu = null;
    game.dispatch(command); // les refus sont expliqués par l'intercepteur (refusals.ts) ; les succès arrivent par subscribe
  }

  // --- Statut ---
  function renderStatus(state: GameState, labels: Labeler): void {
    const m = statusModel(state, labels);
    statusPanel.textContent = '';
    const head = h(
      'div',
      { class: 'hud-row hud-head' },
      h('strong', { class: 'hud-turn', text: t('status.turn', { n: m.turnNumber }) }),
      m.finished
        ? h('span', { class: 'hud-pill hud-pill-end', text: `■ ${t('status.finished')}` })
        : h('span', { class: 'hud-pill hud-pill-active', text: `▶ ${t('status.activePlayer', { player: m.activePlayerName })}` }),
    );
    const pcs = h(
      'ul',
      { class: 'hud-pcs', attrs: { 'aria-label': t('status.commandPoints') } },
      ...m.players.map((p) =>
        h('li', { class: `hud-pc${p.active ? ' is-active' : ''}` }, h('span', { text: `${p.active ? '▶ ' : ''}${p.name}` }), h('b', { text: t('status.pc', { n: p.commandPoints }) })),
      ),
    );
    statusPanel.append(head, pcs);

    if (m.character) {
      const c = m.character;
      const pips = Array.from({ length: c.maxHealth }, (_, i) => (i < c.health ? '●' : '○')).join('');
      statusPanel.append(
        h(
          'div',
          { class: 'hud-char' },
          h('div', { class: 'hud-char-name', text: c.name }),
          h('div', { class: 'hud-row' }, h('span', { class: 'hud-pips', text: pips, attrs: { 'aria-hidden': 'true' } }), h('span', { text: t('status.health', { current: c.health, max: c.maxHealth }) })),
          h(
            'ul',
            { class: 'hud-stats', attrs: { 'aria-label': t('status.stats') } },
            ...(['combat', 'physical', 'mental'] as const).map((k) =>
              h('li', { attrs: { title: t(`status.stat.${k}`) } }, h('abbr', { text: t(`status.stat.${k}.short`), attrs: { title: t(`status.stat.${k}`) } }), h('b', { text: String(c[k]) })),
            ),
          ),
          h('div', { text: t('status.movementLeft', { n: `${c.movementLeft}/${c.movementMax}` }) }),
          h('div', { class: `hud-badge ${m.actionUsed ? 'is-used' : 'is-free'}`, text: `${m.actionUsed ? '✖' : '✔'} ${t(m.actionUsed ? 'status.action.used' : 'status.action.available')}` }),
          c.overwatch ? h('div', { class: 'hud-badge is-ow', text: `◉ ${t('status.overwatch')}` }) : null,
        ),
      );
    } else if (!m.finished) {
      statusPanel.append(h('div', { class: 'hud-char hud-char-none', text: t(m.placement ? 'status.hint.placement' : 'status.hint.select') }));
    }

    const seed = game.replaySeed;
    statusPanel.append(
      h(
        'div',
        { class: 'hud-row hud-seed' },
        h('span', { text: t('status.seed', { seed }) }),
        h('button', {
          class: 'hud-link',
          text: t('status.seed.copy'),
          attrs: { type: 'button', 'data-fid': 'copy-seed' },
          on: { click: () => void copyReplayLink() },
        }),
      ),
    );
  }

  async function copyReplayLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      toast(t('status.seed.copied'));
    } catch {
      toast(location.href); // presse-papiers indisponible : on affiche le lien
    }
  }

  // --- Actions ---
  function actionButton(row: ActionRow, onClick: () => void): HTMLElement {
    const unavailable = !row.available;
    const btn = h(
      'button',
      {
        class: `hud-btn${unavailable ? ' is-unavailable' : ''}`,
        // aria-disabled (et non disabled) : reste focalisable au clavier, l'activation explique le refus.
        attrs: { type: 'button', 'data-fid': `action-${row.id}`, 'aria-disabled': unavailable ? 'true' : undefined, title: unavailable ? row.reason : row.label, 'aria-describedby': unavailable ? `reason-${row.id}` : undefined },
        on: { click: onClick },
      },
      h('span', { class: 'hud-btn-label' }, h('span', { text: row.label }), row.key ? h('kbd', { text: row.key, attrs: { title: t('actions.key', { key: row.key }) } }) : null),
      unavailable ? h('span', { class: 'hud-btn-reason', text: row.reason, attrs: { id: `reason-${row.id}` } }) : null,
    );
    return btn;
  }

  function renderMenu(state: GameState, labels: Labeler, characterId: string): HTMLElement | null {
    if (!menu) return null;
    const legal = getLegalActions(state, characterId).find((a) => a.id === menu);
    const cancel = h('button', { class: 'hud-btn hud-btn-small', text: t('actions.cancel'), attrs: { type: 'button', 'data-fid': 'menu-cancel' }, on: { click: () => closeMenu() } });
    const option = (fid: string, text: string, run: () => void) => h('button', { class: 'hud-btn hud-btn-small', text, attrs: { type: 'button', 'data-fid': fid }, on: { click: run } });
    let titleKey = 'actions.move.title';
    let options: HTMLElement[] = [];
    if (menu === 'MOVE') {
      options = game
        .reachable(characterId)
        .sort((a, b) => a.cost - b.cost || a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true }))
        .map((r) => option(`move-${r.nodeId}`, t('actions.move.option', { node: r.nodeId, cost: r.cost }), () => dispatch({ type: 'MOVE_CHARACTER', playerId: state.turn.activePlayerId!, characterId, path: r.path })));
    } else if (menu === 'ATTACK') {
      titleKey = 'actions.attack.title';
      options = (legal?.details?.attackOptions ?? []).map((o) =>
        option(`attack-${o.targetId}-${o.weaponId}`, t('actions.attack.option', { target: labels.character(o.targetId), weapon: labels.weapon(o.weaponId) }), () =>
          dispatch({ type: 'ATTACK', playerId: state.turn.activePlayerId!, attackerId: characterId, targetId: o.targetId, weaponId: o.weaponId }),
        ),
      );
    } else {
      titleKey = 'actions.door.title';
      const type = menu === 'OPEN_DOOR' ? 'OPEN_DOOR' : 'CLOSE_DOOR';
      options = (legal?.details?.doorIds ?? []).map((doorId) =>
        option(`door-${doorId}`, t('actions.door.option', { door: doorId }), () => dispatch({ type, playerId: state.turn.activePlayerId!, characterId, doorId })),
      );
    }
    return h('div', { class: 'hud-menu', attrs: { role: 'group', 'aria-label': t(titleKey) } }, h('div', { class: 'hud-menu-title', text: t(titleKey) }), h('div', { class: 'hud-menu-options' }, ...options), cancel);
  }

  function openMenu(kind: MenuKind): void {
    menu = kind;
    render();
    const first = actionsPanel.querySelector<HTMLElement>('.hud-menu-options button') ?? actionsPanel.querySelector<HTMLElement>('[data-fid="menu-cancel"]');
    first?.focus();
  }

  function closeMenu(): boolean {
    if (!menu) return false;
    const kind = menu;
    menu = null;
    render();
    actionsPanel.querySelector<HTMLElement>(`[data-fid="action-${kind}"]`)?.focus();
    return true;
  }

  function runAction(id: ActionId): void {
    const state = game.state;
    const characterId = activeId(state);
    if (!characterId) {
      toast(t('input.noActive'), 'error');
      return;
    }
    const action = getLegalActions(state, characterId).find((a) => a.id === id);
    if (!action) return;
    if (!action.available) {
      toast(reasonText(action.code, action.reason), 'error');
      return;
    }
    const playerId = state.turn.activePlayerId!;
    switch (id) {
      case 'MOVE':
      case 'ATTACK':
        openMenu(id);
        break;
      case 'OPEN_DOOR':
      case 'CLOSE_DOOR': {
        const doors = action.details?.doorIds ?? [];
        if (doors.length === 1) dispatch({ type: id, playerId, characterId, doorId: doors[0]! });
        else openMenu(id);
        break;
      }
      case 'OVERWATCH':
        dispatch({ type: 'OVERWATCH', playerId, characterId });
        break;
      case 'END_ACTIVATION':
        dispatch({ type: 'END_TURN', playerId });
        break;
      case 'PASS':
        dispatch({ type: 'PASS', playerId });
        break;
      default:
        break;
    }
  }

  function renderActions(state: GameState, labels: Labeler): void {
    actionsPanel.textContent = '';
    actionsPanel.append(h('h2', { class: 'hud-title', text: t('actions.title') }));
    if (state.phase === 'FINISHED') {
      actionsPanel.append(h('p', { class: 'hud-note', text: t('reason.GAME_FINISHED') }));
      return;
    }
    const placement = placementModel(state, labels);
    if (placement) {
      renderPlacement(placement);
      return;
    }
    const characterId = activeId(state);
    if (!characterId) {
      // Aucun personnage activé : la liste des personnages activables remplace la barre d'actions.
      const rows = rosterRows(state, labels);
      actionsPanel.append(h('h3', { class: 'hud-subtitle', text: t('actions.roster') }));
      if (rows.length === 0) actionsPanel.append(h('p', { class: 'hud-note', text: t('actions.rosterEmpty') }));
      for (const r of rows) {
        const unavailable = !r.available;
        actionsPanel.append(
          h(
            'button',
            {
              class: `hud-btn${unavailable ? ' is-unavailable' : ''}`,
              attrs: { type: 'button', 'data-fid': `select-${r.characterId}`, 'aria-disabled': unavailable ? 'true' : undefined, title: unavailable ? r.reason : r.name },
              on: {
                click: () => {
                  if (unavailable) toast(r.reason ?? '', 'error');
                  else dispatch({ type: 'SELECT_CHARACTER', playerId: state.turn.activePlayerId!, characterId: r.characterId });
                },
              },
            },
            h('span', { class: 'hud-btn-label' }, h('span', { text: `${t('action.SELECT')} · ${r.name}` }), h('kbd', { text: r.key })),
            unavailable ? h('span', { class: 'hud-btn-reason', text: r.reason }) : null,
          ),
        );
      }
      const pass = actionRows(state, rows[0]?.characterId ?? state.characters[0]!.id).find((a) => a.id === 'PASS')!;
      actionsPanel.append(actionButton(pass, () => runPassWithoutActive()));
      return;
    }
    const rows = actionRows(state, characterId);
    const list = h('div', { class: 'hud-action-list' }, ...rows.map((row) => actionButton(row, () => runAction(row.id))));
    const menuEl = renderMenu(state, labels, characterId);
    // Le sous-menu s'ouvre au-dessus de la liste : il reste visible sans faire défiler le panneau.
    if (menuEl) actionsPanel.append(menuEl);
    actionsPanel.append(list);
  }

  // --- Phase d'Overwatch : un personnage par décision, ou passer ---
  function placeOverwatch(characterId: string, playerId: string): void {
    dispatch({ type: 'OVERWATCH', playerId, characterId });
  }

  function renderPlacement(p: NonNullable<ReturnType<typeof placementModel>>): void {
    actionsPanel.append(
      h('h3', { class: 'hud-subtitle', text: t('placement.player', { player: p.playerName, pc: p.commandPoints }) }),
    );
    for (const r of p.rows) {
      const unavailable = !r.available;
      actionsPanel.append(
        h(
          'button',
          {
            class: `hud-btn${unavailable ? ' is-unavailable' : ''}${r.placed ? ' is-placed' : ''}`,
            attrs: { type: 'button', 'data-fid': `place-${r.characterId}`, 'aria-disabled': unavailable ? 'true' : undefined, title: unavailable ? r.reason : r.name },
            on: {
              click: () => {
                if (unavailable) toast(r.reason ?? '', 'error');
                else placeOverwatch(r.characterId, p.playerId);
              },
            },
          },
          h(
            'span',
            { class: 'hud-btn-label' },
            h('span', { text: r.placed ? `◉ ${r.name} · ${t('placement.placed')}` : t('placement.place', { name: r.name }) }),
            h('kbd', { text: r.key }),
          ),
          unavailable ? h('span', { class: 'hud-btn-reason', text: r.reason }) : null,
        ),
      );
    }
    actionsPanel.append(
      h(
        'button',
        {
          class: `hud-btn hud-btn-primary${p.passAvailable ? '' : ' is-unavailable'}`,
          attrs: { type: 'button', 'data-fid': 'pass-overwatch', 'aria-disabled': p.passAvailable ? undefined : 'true', title: p.passReason ?? t('placement.passHint') },
          on: {
            click: () => {
              if (!p.passAvailable) toast(p.passReason ?? '', 'error');
              else dispatch({ type: 'PASS_OVERWATCH', playerId: p.playerId });
            },
          },
        },
        h('span', { class: 'hud-btn-label' }, h('span', { text: t('placement.pass') }), h('kbd', { text: 'P' })),
        p.passAvailable ? null : h('span', { class: 'hud-btn-reason', text: p.passReason }),
      ),
      h('p', { class: 'hud-note', text: t('placement.passHint') }),
    );
  }

  function renderBanner(state: GameState, labels: Labeler): void {
    const p = placementModel(state, labels);
    banner.hidden = !p;
    banner.textContent = '';
    if (!p) return;
    banner.append(
      h('strong', { text: `◉ ${t('placement.banner', { player: p.playerName, cost: p.cost })}` }),
      h('span', { text: t('placement.player', { player: p.playerName, pc: p.commandPoints }) }),
    );
  }

  /** PASS sans activation en cours : même chemin d'explication que les autres actions. */
  function runPassWithoutActive(): void {
    const state = game.state;
    const player = state.turn.activePlayerId;
    if (!player) return;
    dispatch({ type: 'PASS', playerId: player });
  }

  // --- Réaction d'Overwatch ---
  function renderReaction(state: GameState, labels: Labeler): void {
    const options = getReactionOptions(state);
    reactionPanel.textContent = '';
    reactionPanel.hidden = !options;
    if (!options) return;
    const playerId = options.forPlayerId;
    const firstFire = options.fire.find((f) => f.available);
    const context = reactionContext(state, labels);
    const announcedLine = options.announced ? context : null;
    reactionPanel.append(
      h('h2', { class: 'hud-reaction-title', text: `◉ ${t('reaction.title')}`, attrs: { id: 'hud-reaction-title' } }),
      h('p', { text: t('reaction.text', { overwatcher: labels.character(options.overwatcherId), target: labels.character(options.targetId) }) }),
      announcedLine ? h('p', { class: 'hud-reaction-context', text: t('reaction.announcedLabel', { action: announcedLine }) }) : h('p', { class: 'hud-reaction-context', text: context ?? '' }),
      ...(options.announced ? [h('p', { class: 'hud-note', text: t('reaction.optional') })] : []),
      h('p', { class: 'hud-note', text: t('reaction.waitingFor', { player: labels.player(playerId) }) }),
      h(
        'div',
        { class: 'hud-reaction-buttons' },
        ...options.fire
          .filter((f) => f.available)
          .map((f) =>
            h('button', {
              class: 'hud-btn hud-btn-primary',
              attrs: { type: 'button', 'data-fid': `fire-${f.weaponId}` },
              on: { click: () => dispatch({ type: 'OVERWATCH_FIRE', playerId, weaponId: f.weaponId }) },
            }, h('span', { class: 'hud-btn-label' }, h('span', { text: t('reaction.fire', { weapon: labels.weapon(f.weaponId) }) }), f === firstFire ? h('kbd', { text: 'T' }) : null)),
          ),
        h('button', {
          class: 'hud-btn',
          attrs: { type: 'button', 'data-fid': 'decline' },
          on: { click: () => dispatch({ type: 'OVERWATCH_DECLINE', playerId }) },
        }, h('span', { class: 'hud-btn-label' }, h('span', { text: t('reaction.decline') }), h('kbd', { text: 'D' }))),
      ),
      ...options.fire.filter((f) => !f.available).map((f) => h('p', { class: 'hud-note', text: `${labels.weapon(f.weaponId)} — ${t('reaction.cannotFire', { reason: f.reason ?? '' })}` })),
    );
  }

  function render(): void {
    const state = game.state;
    const labels = createLabeler(state);
    withFocusKept(root, () => {
      renderStatus(state, labels);
      renderActions(state, labels);
      renderReaction(state, labels);
      renderBanner(state, labels);
    });
    // La réaction attend une réponse : le focus va sur le premier bouton quand elle apparaît.
    if (state.turn.reaction && !reactionPanel.contains(document.activeElement)) reactionPanel.querySelector<HTMLElement>('button')?.focus();
  }

  function handleKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return false;
    const key = event.key.toLowerCase();
    const state = game.state;
    if (key === 'escape') return closeMenu();
    if (MAIN_HANDLED_KEYS.has(key) || state.turn.reaction || state.phase === 'FINISHED') return false;
    if (/^[1-9]$/.test(key) && state.phase === 'OVERWATCH') {
      const placement = placementModel(state, createLabeler(state));
      const row = placement?.rows[Number(key) - 1];
      if (!placement || !row) return true;
      if (!row.available) toast(row.reason ?? '', 'error');
      else placeOverwatch(row.characterId, placement.playerId);
      return true;
    }
    if (/^[1-9]$/.test(key) && !activeId(state)) {
      const labels = createLabeler(state);
      const row = rosterRows(state, labels)[Number(key) - 1];
      if (!row) {
        toast(t('input.noActive'), 'error');
        return true;
      }
      if (!row.available) toast(row.reason ?? '', 'error');
      else dispatch({ type: 'SELECT_CHARACTER', playerId: state.turn.activePlayerId!, characterId: row.characterId });
      return true;
    }
    const id = (Object.keys(ACTION_KEYS) as ActionId[]).find((a) => ACTION_KEYS[a]?.toLowerCase() === key);
    if (id) {
      runAction(id);
      return true;
    }
    return false;
  }

  return { render, toast, closeMenu, handleKey };
}
