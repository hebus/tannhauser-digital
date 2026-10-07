import { h } from '../ui/dom';
import { t } from '../ui/i18n';
import { MAX_SEED, MAX_TEAM_SIZE, PLAYER_IDS, randomSeed, validateSetup, type SetupConfig, type SetupContent, type SetupIssue } from './setup-config';

export interface SetupScreenContent extends SetupContent {
  readonly boards: readonly { readonly id: string; readonly nameKey: string; readonly board: SetupContent['boards'][number]['board'] }[];
  readonly characters: readonly { readonly id: string; readonly factionId: string; readonly kind: string; readonly nameKey: string }[];
}

/** Texte joueur d'un problème de configuration (clé `setupError.<code>`). */
export function issueText(issue: SetupIssue): string {
  return t(`setupError.${issue.code}`, issue.params);
}

/**
 * Affiche l'écran de mise en place et résout avec la configuration validée quand le joueur clique sur « Démarrer ».
 * La validation est celle de `validateSetup` (pure) ; l'écran ne fait que présenter les erreurs.
 */
export function showSetupScreen(host: HTMLElement, content: SetupScreenContent, initial: SetupConfig): Promise<SetupConfig> {
  return new Promise((resolve) => {
    const selected = new Map<string, Set<string>>(initial.teams.map((team) => [team.playerId, new Set(team.characterIds)]));
    let boardId = initial.boardId;
    const aiPlayers = new Set(initial.ai ?? []);

    const errors = h('ul', { class: 'setup-errors', attrs: { role: 'alert', 'aria-live': 'assertive', hidden: true } });
    const seedInput = h('input', { class: 'setup-input', attrs: { id: 'setup-seed', type: 'number', min: 0, max: MAX_SEED, step: 1, value: initial.seed, inputmode: 'numeric', 'aria-describedby': 'setup-seed-hint' } });
    const boardSelect = h(
      'select',
      { class: 'setup-input', attrs: { id: 'setup-board' }, on: { change: (e) => { boardId = (e.target as HTMLSelectElement).value; } } },
      ...content.boards.map((b) => h('option', { text: t(b.nameKey), attrs: { value: b.id, selected: b.id === boardId } })),
    );

    const teamFieldset = (playerId: string) =>
      h(
        'fieldset',
        { class: 'setup-team' },
        h('legend', { text: t('setup.team', { player: t(`player.${playerId}`) }) }),
        h('p', { class: 'hud-note', text: t('setup.teamHint', { max: MAX_TEAM_SIZE }) }),
        h(
          'label',
          { class: 'setup-check', attrs: { for: `setup-ai-${playerId}` } },
          h('input', {
            attrs: { id: `setup-ai-${playerId}`, type: 'checkbox', checked: aiPlayers.has(playerId) },
            on: { change: (e) => { if ((e.target as HTMLInputElement).checked) aiPlayers.add(playerId); else aiPlayers.delete(playerId); } },
          }),
          h('span', { text: t('setup.ai') }),
        ),
        ...content.characters.map((c) => {
          const id = `setup-${playerId}-${c.id}`;
          return h(
            'label',
            { class: 'setup-check', attrs: { for: id } },
            h('input', {
              attrs: { id, type: 'checkbox', checked: selected.get(playerId)?.has(c.id) },
              on: {
                change: (e) => {
                  const set = selected.get(playerId)!;
                  if ((e.target as HTMLInputElement).checked) set.add(c.id);
                  else set.delete(c.id);
                },
              },
            }),
            h('span', { text: t('setup.character', { name: t(c.nameKey), kind: t(`kind.${c.kind}`) }) }),
          );
        }),
      );

    function read(): SetupConfig {
      return {
        boardId,
        seed: seedInput.value.trim() === '' ? Number.NaN : Number(seedInput.value),
        ...(aiPlayers.size > 0 ? { ai: PLAYER_IDS.filter((id) => aiPlayers.has(id)) } : {}),
        teams: PLAYER_IDS.map((playerId) => ({
          playerId,
          // Ordre du contenu, pas de l'ordre de clic : le placement reste déterministe.
          characterIds: content.characters.filter((c) => selected.get(playerId)?.has(c.id)).map((c) => c.id),
        })),
      };
    }

    function submit(): void {
      const config = read();
      const issues = validateSetup(config, content);
      errors.textContent = '';
      if (issues.length > 0) {
        errors.append(h('li', { class: 'setup-errors-title', text: t('setup.errors') }), ...issues.map((i) => h('li', { text: issueText(i) })));
        errors.hidden = false;
        return;
      }
      errors.hidden = true;
      overlay.remove();
      resolve(config);
    }

    const form = h(
      'form',
      { class: 'ui-dialog setup-dialog', attrs: { novalidate: true, 'aria-labelledby': 'setup-title' }, on: { submit: (e) => { e.preventDefault(); submit(); } } },
      h('h1', { class: 'ui-dialog-title', text: t('setup.title'), attrs: { id: 'setup-title' } }),
      h('p', { class: 'hud-note', text: t('setup.subtitle') }),
      h('div', { class: 'setup-field' }, h('label', { text: t('setup.board'), attrs: { for: 'setup-board' } }), boardSelect),
      h('div', { class: 'setup-teams' }, ...PLAYER_IDS.map(teamFieldset)),
      h(
        'div',
        { class: 'setup-field' },
        h('label', { text: t('setup.seed'), attrs: { for: 'setup-seed' } }),
        h('div', { class: 'setup-seed-row' }, seedInput, h('button', { class: 'hud-btn', text: `⚄ ${t('setup.seed.random')}`, attrs: { type: 'button' }, on: { click: () => { seedInput.value = String(randomSeed()); } } })),
        h('p', { class: 'hud-note', text: t('setup.seed.hint'), attrs: { id: 'setup-seed-hint' } }),
      ),
      errors,
      h('div', { class: 'ui-dialog-buttons' }, h('button', { class: 'hud-btn hud-btn-primary', text: `▶ ${t('setup.start')}`, attrs: { type: 'submit' } })),
    );
    const overlay = h('div', { class: 'ui-overlay ui-overlay-setup' }, form);
    host.append(overlay);
    form.querySelector<HTMLElement>('button[type="submit"]')?.focus();
  });
}
