import { h } from '../ui/dom';
import { t } from '../ui/i18n';
import { modeRules } from '../ui/mode-rules';
import { GAME_MODES, MAX_SEED, MAX_TEAM_SIZE, PLAYER_IDS, randomSeed, validateSetup, type SetupConfig, type SetupContent, type SetupIssue } from './setup-config';
import { SETUP_STEPS, issueStep, stepIssues, type SetupStep } from './setup-steps';

export interface SetupScreenContent extends SetupContent {
  readonly boards: readonly { readonly id: string; readonly nameKey: string; readonly board: SetupContent['boards'][number]['board'] }[];
  readonly characters: readonly { readonly id: string; readonly factionId: string; readonly kind: SetupContent['characters'][number]['kind']; readonly nameKey: string }[];
}

/** Texte joueur d'un problème de configuration (clé `setupError.<code>`). */
export function issueText(issue: SetupIssue): string {
  return t(`setupError.${issue.code}`, issue.params);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Petite icône SVG de trait (aucun innerHTML : éléments créés un à un). `paths` : attributs `d` des tracés. */
function icon(paths: readonly string[], size = 14): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of Object.entries({ width: String(size), height: String(size), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    svg.setAttribute(name, value);
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
const ICON_HUMAN = ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7'];
const ICON_AI = ['M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z', 'M12 4v4', 'M9 14h.01', 'M15 14h.01'];
const ICON_DICE = ['M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', 'M8 8h.01', 'M16 8h.01', 'M12 12h.01', 'M8 16h.01', 'M16 16h.01'];
const ICON_PLAY = ['M7 4.5v15l12-7.5z'];

/**
 * Affiche l'écran de mise en place (style « menu de jeu ») et résout avec la configuration validée.
 * Accueil : « Jouer » lance tout de suite avec la configuration proposée, « Personnaliser » ouvre l'assistant en 4 étapes
 * (terrain, joueurs, équipes, récapitulatif). La validation est celle de `validateSetup` (pure, voir `setup-steps.ts`) ;
 * l'écran ne fait que présenter les erreurs.
 * Tous les choix sont de vrais champs (liste déroulante, radio, case à cocher) habillés par le CSS : clavier et lecteurs d'écran restent fonctionnels.
 */
export function showSetupScreen(host: HTMLElement, content: SetupScreenContent, initial: SetupConfig): Promise<SetupConfig> {
  return new Promise((resolve) => {
    // Effectif par personnage : 0 ou 1 pour un héros (unique), tout entier pour une troupe.
    const selected = new Map<string, Map<string, number>>(
      initial.teams.map((team) => {
        const counts = new Map<string, number>();
        for (const id of team.characterIds) counts.set(id, (counts.get(id) ?? 0) + 1);
        return [team.playerId, counts];
      }),
    );
    const teamSize = (playerId: string): number => [...(selected.get(playerId)?.values() ?? [])].reduce((a, b) => a + b, 0);
    let boardId = initial.boardId;
    const aiPlayers = new Set(initial.ai ?? []);
    let mode = initial.mode ?? 'DEATHMATCH';

    const errors = h('ul', { class: 'setup-errors', attrs: { role: 'alert', 'aria-live': 'assertive', hidden: true } });
    const seedInput = h('input', { class: 'setup-input', attrs: { id: 'setup-seed', type: 'number', min: 0, max: MAX_SEED, step: 1, value: initial.seed, inputmode: 'numeric', 'aria-describedby': 'setup-seed-hint' } });

    /** Carte à choix unique : un `input[type=radio]` habillé en carte. */
    const choiceCard = (group: string, value: string, checked: boolean, onPick: () => void, title: string, subtitle?: string) =>
      h(
        'label',
        { class: 'setup-card' },
        h('input', { class: 'setup-card-input', attrs: { type: 'radio', name: group, value, checked }, on: { change: onPick } }),
        h('span', { class: 'setup-card-body' }, h('span', { class: 'setup-card-title', text: title }), subtitle ? h('span', { class: 'setup-card-sub', text: subtitle }) : null),
      );

    // Règles du mode : objectif en évidence à gauche, détails sur deux colonnes à droite.
    const modeHelp = h('div', { class: 'setup-rules', attrs: { 'aria-live': 'polite' } });
    const renderModeHelp = (): void => {
      const info = modeRules(mode);
      modeHelp.textContent = '';
      modeHelp.append(
        h('div', { class: 'setup-goal' }, h('span', { class: 'setup-goal-label', text: t('modeHelp.goalLabel') }), h('p', { class: 'setup-goal-text', text: info.goal })),
        h('ul', { class: 'setup-rule-list' }, ...info.rules.map((r) => h('li', { text: r }))),
      );
    };
    renderModeHelp();

    // Liste déroulante (combobox native) : le nombre de plateaux va croître, les cartes ne tiendraient plus.
    const boardMeta = h('span', { class: 'setup-pill', attrs: { 'aria-live': 'polite' } });
    const renderBoardMeta = (): void => {
      const board = content.boards.find((b) => b.id === boardId);
      boardMeta.textContent = board ? t('setup.boardSize', { n: Object.keys(board.board.nodes).length }) : '';
    };
    const boardSelect = h(
      'select',
      { class: 'setup-input setup-select', attrs: { id: 'setup-board', 'aria-label': t('setup.board') }, on: { change: (e) => { boardId = (e.target as HTMLSelectElement).value; renderBoardMeta(); } } },
      ...content.boards.map((b) => h('option', { text: t(b.nameKey), attrs: { value: b.id, selected: b.id === boardId } })),
    );
    renderBoardMeta();
    const boardField = h('div', { class: 'setup-board-field' }, boardSelect, boardMeta);
    const modeList = h(
      'div',
      { class: 'setup-cards setup-cards-2', attrs: { role: 'radiogroup', 'aria-label': t('setup.mode') } },
      ...GAME_MODES.map((m) => choiceCard('setup-mode', m.mode, m.mode === mode, () => { mode = m.mode; renderModeHelp(); }, t(`modeCard.${m.mode}.title`), t(`modeCard.${m.mode}.sub`))),
    );

    // Un héros n'existe qu'une fois dans la partie : sa case est grisée dans l'équipe adverse dès qu'un camp l'a pris.
    const heroBoxes: { readonly playerId: string; readonly id: string; readonly box: HTMLInputElement }[] = [];
    const refreshHeroLocks = (): void => {
      for (const { playerId, id, box } of heroBoxes) {
        const takenByOther = [...selected].some(([other, counts]) => other !== playerId && (counts.get(id) ?? 0) > 0);
        const lock = takenByOther && (selected.get(playerId)?.get(id) ?? 0) === 0;
        box.disabled = lock;
        const label = box.closest('label');
        label?.classList.toggle('is-locked', lock);
        // Info-bulle : la raison du blocage, sinon le nom complet (utile quand il est tronqué).
        if (label) label.title = lock ? t('setup.heroTaken') : (label.dataset.name ?? '');
      }
    };

    // Compteurs d'équipe des onglets de l'étape Équipes : rafraîchis à chaque changement de composition.
    const tabCounters = new Map<string, HTMLElement>();
    const refreshTabCounters = (): void => {
      for (const [playerId, el] of tabCounters) {
        const n = teamSize(playerId);
        el.textContent = t('setup.countOf', { n, max: MAX_TEAM_SIZE });
        el.classList.toggle('is-bad', n === 0 || n > MAX_TEAM_SIZE);
      }
    };

    /** Choix Humain / IA d'un joueur. */
    const controlGroup = (playerId: string) => {
      const control = (human: boolean) =>
        h(
          'label',
          { class: 'setup-seg' },
          h('input', {
            class: 'setup-card-input',
            attrs: { type: 'radio', name: `setup-ctrl-${playerId}`, value: human ? 'human' : 'ai', checked: human !== aiPlayers.has(playerId) },
            on: { change: () => { if (human) aiPlayers.delete(playerId); else aiPlayers.add(playerId); } },
          }),
          h('span', { class: 'setup-seg-body' }, icon(human ? ICON_HUMAN : ICON_AI), human ? t('setup.human') : t('setup.aiShort')),
        );
      return h('div', { class: 'setup-segs', attrs: { role: 'radiogroup', 'aria-label': `${t(`player.${playerId}`)} — ${t('setup.ai')}` } }, control(true), control(false));
    };

    /** Héros et troupes d'un camp. */
    const rosterPanel = (playerId: string) => {
      const cards = content.characters.map((c) => {
        const counts = selected.get(playerId)!;
        const box = h('input', {
          class: 'setup-card-input',
          attrs: { type: 'checkbox', checked: (counts.get(c.id) ?? 0) > 0 },
          on: {
            change: (e) => {
              if ((e.target as HTMLInputElement).checked) counts.set(c.id, Math.max(1, counts.get(c.id) ?? 0));
              else counts.delete(c.id);
              if (qty) qty.value = String(counts.get(c.id) ?? 0);
              refreshTabCounters();
              refreshHeroLocks();
            },
          },
        });
        if (c.kind === 'HERO') heroBoxes.push({ playerId, id: c.id, box });
        // Troupes : aucune limite par type (seule la taille de l'équipe est bornée) ; case cochée = au moins une.
        const qty = c.kind === 'HERO'
          ? null
          : h('input', {
              class: 'setup-unit-qty',
              attrs: { type: 'number', min: 0, max: MAX_TEAM_SIZE, step: 1, value: counts.get(c.id) ?? 0, 'aria-label': t('setup.quantityOf', { name: t(c.nameKey) }) },
              on: {
                change: (e) => {
                  const n = Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));
                  if (n > 0) counts.set(c.id, n);
                  else counts.delete(c.id);
                  box.checked = n > 0;
                  refreshTabCounters();
                },
              },
            });
        return h(
          'label',
          { class: `setup-unit setup-unit-${c.kind.toLowerCase()}`, attrs: { title: t(c.nameKey), 'data-name': t(c.nameKey) } },
          box,
          h('span', { class: 'setup-unit-icon', text: c.kind === 'HERO' ? '★' : '◆', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'setup-unit-body' }, h('span', { class: 'setup-unit-name', text: t(c.nameKey) }), h('span', { class: 'setup-unit-kind', text: t(`kind.${c.kind}`) })),
          qty,
        );
      });
      const column = (heroes: boolean, title: string) =>
        h(
          'div',
          { class: `setup-roster-col setup-roster-${heroes ? 'heroes' : 'troops'}`, attrs: { role: 'group', 'aria-label': title } },
          ...content.characters.flatMap((c, i) => ((c.kind === 'HERO') === heroes ? [cards[i]!] : [])),
        );
      return h(
        'fieldset',
        { class: 'setup-team', attrs: { 'data-player': playerId } },
        h('legend', { class: 'setup-visually-hidden', text: t('setup.team', { player: t(`player.${playerId}`) }) }),
        h('div', { class: 'setup-roster' }, column(true, t('setup.heroes')), column(false, t('setup.troops'))),
      );
    };

    function read(): SetupConfig {
      return {
        boardId,
        seed: seedInput.value.trim() === '' ? Number.NaN : Number(seedInput.value),
        ...(mode !== 'DEATHMATCH' ? { mode } : {}),
        ...(aiPlayers.size > 0 ? { ai: PLAYER_IDS.filter((id) => aiPlayers.has(id)) } : {}),
        teams: PLAYER_IDS.map((playerId) => ({
          playerId,
          // Ordre du contenu, pas de l'ordre de clic : le placement reste déterministe.
          characterIds: content.characters.flatMap((c) => Array.from({ length: selected.get(playerId)?.get(c.id) ?? 0 }, () => c.id)),
        })),
      };
    }

    const field = (title: string, labelFor: string | null, ...children: HTMLElement[]) =>
      h('div', { class: 'setup-field' }, labelFor ? h('label', { class: 'setup-section-title', text: title, attrs: { for: labelFor } }) : h('h2', { class: 'setup-section-title', text: title }), ...children);

    // ---- Contenu des étapes (construit une fois : l'état des champs se conserve quand on navigue) ----
    const terrainStep = h(
      'section',
      { class: 'setup-terrain', attrs: { 'aria-label': t('setup.terrain') } },
      h('div', { class: 'setup-terrain-row' }, field(t('setup.board'), 'setup-board', boardField), field(t('setup.mode'), null, modeList)),
      modeHelp,
      h(
        'div',
        { class: 'setup-seed' },
        h('label', { class: 'setup-section-title', text: t('setup.seed'), attrs: { for: 'setup-seed' } }),
        h('div', { class: 'setup-seed-row' }, seedInput, h('button', { class: 'setup-btn', attrs: { type: 'button' }, on: { click: () => { seedInput.value = String(randomSeed()); } } }, icon(ICON_DICE, 16), t('setup.seed.random'))),
        h('p', { class: 'setup-hint setup-seed-hint', text: t('setup.seed.hint'), attrs: { id: 'setup-seed-hint' } }),
      ),
    );

    const playersStep = h(
      'div',
      { class: 'setup-players' },
      ...PLAYER_IDS.map((playerId) =>
        h('section', { class: 'setup-player-card', attrs: { 'data-player': playerId } }, h('h2', { class: 'setup-team-name', text: t(`player.${playerId}`) }), controlGroup(playerId)),
      ),
    );

    const panels = new Map<string, HTMLElement>(PLAYER_IDS.map((id) => [id, rosterPanel(id)]));
    const tabs = h('div', { class: 'setup-tabs', attrs: { role: 'tablist' } });
    const showTeam = (playerId: string): void => {
      for (const [id, panel] of panels) panel.hidden = id !== playerId;
      for (const tab of tabs.querySelectorAll<HTMLElement>('[data-player]')) {
        const on = tab.dataset.player === playerId;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', String(on));
      }
    };
    for (const playerId of PLAYER_IDS) {
      const counter = h('span', { class: 'setup-count' });
      tabCounters.set(playerId, counter);
      tabs.append(
        h(
          'button',
          { class: 'setup-tab', attrs: { type: 'button', role: 'tab', 'data-player': playerId, style: `--team: var(--setup-${playerId})` }, on: { click: () => showTeam(playerId) } },
          h('span', { text: t(`player.${playerId}`) }),
          counter,
        ),
      );
    }
    refreshTabCounters();
    const teamsStep = h('div', { class: 'setup-teams' }, tabs, ...panels.values());
    showTeam(PLAYER_IDS[0]);

    const summaryList = h('dl', { class: 'setup-summary' });
    const summaryStep = h(
      'div',
      { class: 'setup-summary-step' },
      summaryList,
    );
    const renderSummary = (): void => {
      const board = content.boards.find((b) => b.id === boardId);
      const row = (label: string, value: string) => [h('dt', { text: label }), h('dd', { text: value })];
      const names = (playerId: string): string =>
        content.characters
          .flatMap((c) => {
            const n = selected.get(playerId)?.get(c.id) ?? 0;
            return n > 0 ? [`${n > 1 ? `${n}× ` : ''}${t(c.nameKey)}`] : [];
          })
          .join(', ');
      summaryList.textContent = '';
      summaryList.append(
        ...row(t('setup.board'), board ? `${t(board.nameKey)} · ${t('setup.boardSize', { n: Object.keys(board.board.nodes).length })}` : boardId),
        ...row(t('setup.mode'), t(`modeCard.${mode}.title`)),
        ...row(t('setup.seedShort'), seedInput.value.trim() || '—'),
        ...PLAYER_IDS.flatMap((id) => row(`${t(`player.${id}`)} · ${aiPlayers.has(id) ? t('setup.aiShort') : t('setup.human')}`, names(id) || '—')),
      );
    };

    // ---- Navigation ----
    const stepViews: Record<SetupStep, HTMLElement> = { terrain: terrainStep, players: playersStep, teams: teamsStep, summary: summaryStep };
    const stage = h('div', { class: 'setup-stage' });
    const stepper = h('ol', { class: 'setup-steps' });
    const backBtn = h('button', { class: 'setup-btn', attrs: { type: 'button' }, on: { click: () => (index === 0 ? showHome() : goTo(index - 1)) } });
    const nextBtn = h('button', { class: 'setup-play', attrs: { type: 'submit' } });
    const nav = h('div', { class: 'setup-nav' }, backBtn, errors, nextBtn);
    let index = 0;
    let reached = 0;

    /** Affiche les problèmes de l'étape (au récapitulatif : tous, chacun avec un lien vers l'étape qui le corrige). */
    const showIssues = (step: SetupStep, all: boolean): boolean => {
      const config = read();
      const issues = all ? validateSetup(config, content) : stepIssues(step, config, content);
      errors.textContent = '';
      errors.hidden = issues.length === 0;
      if (issues.length === 0) return false;
      errors.append(
        h('li', { class: 'setup-errors-title', text: t('setup.errors') }),
        ...issues.map((i) => {
          const target = issueStep(i);
          return h('li', {}, issueText(i), target !== step ? h('button', { class: 'setup-link', attrs: { type: 'button' }, on: { click: () => goTo(SETUP_STEPS.indexOf(target)) } }, t('setup.fix')) : null);
        }),
      );
      return true;
    };

    const renderStepper = (): void => {
      stepper.textContent = '';
      SETUP_STEPS.forEach((step, i) => {
        stepper.append(
          h(
            'li',
            { class: 'setup-step-item' },
            h(
              'button',
              {
                class: `setup-step${i === index ? ' is-current' : ''}${i < index ? ' is-done' : ''}`,
                attrs: { type: 'button', disabled: i > reached, ...(i === index ? { 'aria-current': 'step' } : {}) },
                on: { click: () => goTo(i) },
              },
              h('span', { class: 'setup-step-n', text: String(i + 1), attrs: { 'aria-hidden': 'true' } }),
              h('span', { class: 'setup-step-label', text: t(`setup.step.${step}`) }),
            ),
          ),
        );
      });
    };

    function goTo(i: number): void {
      index = Math.max(0, Math.min(SETUP_STEPS.length - 1, i));
      reached = Math.max(reached, index);
      const step = SETUP_STEPS[index]!;
      if (step === 'summary') renderSummary();
      stage.textContent = '';
      stage.append(h('h2', { class: 'setup-step-title', text: t(`setup.step.${step}.title`) }), h('p', { class: 'setup-hint', text: t(`setup.step.${step}.hint`, { max: MAX_TEAM_SIZE }) }), stepViews[step]);
      backBtn.textContent = index === 0 ? t('setup.home') : t('setup.back');
      nextBtn.textContent = '';
      nextBtn.append(...(step === 'summary' ? [icon(ICON_PLAY, 18), t('setup.play')] : [t('setup.next')]));
      errors.hidden = true;
      errors.textContent = '';
      renderStepper();
      if (step === 'summary') showIssues(step, true);
    }

    function advance(): void {
      const step = SETUP_STEPS[index]!;
      if (step === 'summary') {
        if (!showIssues(step, true)) finish(read());
        return;
      }
      if (!showIssues(step, false)) goTo(index + 1);
    }

    function finish(config: SetupConfig): void {
      overlay.remove();
      resolve(config);
    }

    // ---- Accueil : partie rapide ou assistant ----
    const form = h('form', { class: 'setup-screen', attrs: { novalidate: true, 'aria-labelledby': 'setup-title' }, on: { submit: (e) => { e.preventDefault(); advance(); } } });
    const hero = h('header', { class: 'setup-hero' }, h('h1', { class: 'setup-logo', text: 'Tannhäuser', attrs: { id: 'setup-title' } }), h('p', { class: 'setup-tagline', text: t('setup.title') }));
    const quickPlay = (): void => {
      // La configuration proposée (dernière partie ou défaut, graine neuve) est normalement valide ; sinon on ouvre l'assistant au récapitulatif.
      const config = read();
      if (validateSetup(config, content).length === 0) finish(config);
      else showWizard(SETUP_STEPS.length - 1);
    };
    const home = h(
      'div',
      { class: 'setup-home' },
      h('button', { class: 'setup-play setup-home-play', attrs: { type: 'button' }, on: { click: quickPlay } }, icon(ICON_PLAY, 20), t('setup.quick')),
      h('p', { class: 'setup-hint', text: t('setup.quick.hint') }),
      h('button', { class: 'setup-btn setup-home-custom', attrs: { type: 'button' }, on: { click: () => showWizard(0) } }, t('setup.customize')),
    );
    const wizard = h('div', { class: 'setup-wizard' }, stepper, stage, nav);

    function showHome(): void {
      form.textContent = '';
      form.classList.add('is-home');
      form.append(hero, home);
      home.querySelector<HTMLElement>('.setup-home-play')?.focus();
    }
    function showWizard(step: number): void {
      form.textContent = '';
      form.classList.remove('is-home');
      form.append(hero, wizard);
      reached = Math.max(reached, step);
      goTo(step);
      nextBtn.focus();
    }

    refreshHeroLocks();
    const overlay = h('div', { class: 'ui-overlay ui-overlay-setup setup-backdrop' }, form);
    host.append(overlay);
    showHome();
  });
}
