import { cssColor, playerColor, playerShapeGlyph } from '@tannhauser/renderer';
import { h } from './dom';
import { t } from './i18n';
import { PHASE_STEP_IDS, type PhaseModel, type PhaseStepId } from './phase-model';

/** Couleur et forme (mêmes que les pions du plateau) d'un joueur : jamais la couleur seule. */
export function playerMarkStyle(index: number): { color: string; glyph: string } {
  return { color: cssColor(playerColor(index)), glyph: playerShapeGlyph(index) };
}

export interface PhaseTracker {
  readonly element: HTMLElement;
  /** Met à jour la frise en place (les éléments persistent : les transitions CSS jouent à l'activation d'une phase). */
  update(model: PhaseModel): void;
}

/**
 * Frise « Refresh · Initiative · Overwatch · Activation » + ligne contextuelle. Le DOM est construit une fois ;
 * `update` ne fait que changer classes, `aria-current` et textes. Aucune règle : tout vient de `phaseModel`.
 */
export function createPhaseTracker(): PhaseTracker {
  const items = new Map<PhaseStepId, { li: HTMLElement; check: HTMLElement; label: HTMLElement; detail: HTMLElement; sr: HTMLElement }>();
  const list = h('ol', { class: 'phase-steps' });
  for (const id of PHASE_STEP_IDS) {
    const icon = h('span', { class: 'phase-icon', attrs: { 'aria-hidden': 'true' } });
    const check = h('span', { class: 'phase-check', attrs: { 'aria-hidden': 'true' } });
    const label = h('span', { class: 'phase-label' });
    const detail = h('span', { class: 'phase-detail' });
    const sr = h('span', { class: 'sr-only' });
    const li = h('li', { class: 'phase-step', attrs: { 'data-phase': id } }, icon, h('span', { class: 'phase-text' }, h('span', { class: 'phase-title' }, check, label, sr), detail));
    items.set(id, { li, check, label, detail, sr });
    list.append(li);
  }
  const playerMark = h('span', { class: 'player-mark', attrs: { 'aria-hidden': 'true' } });
  const context = h('span', { class: 'phase-context-text' });
  const contextLine = h('p', { class: 'phase-context', attrs: { role: 'status', 'aria-live': 'polite' } }, playerMark, context);
  const element = h('nav', { class: 'hud-phase', attrs: { 'aria-label': t('phase.track') } }, list, contextLine);

  return {
    element,
    update(model) {
      PHASE_STEP_IDS.forEach((id, i) => {
        const step = model.steps[i]!;
        const it = items.get(id)!;
        it.li.className = `phase-step is-${step.status}${step.fresh ? ' is-fresh' : ''}`;
        if (step.status === 'current') it.li.setAttribute('aria-current', 'step');
        else it.li.removeAttribute('aria-current');
        const icon = it.li.querySelector('.phase-icon');
        if (icon) icon.textContent = step.icon;
        it.check.textContent = step.status === 'done' ? '✓ ' : '';
        it.label.textContent = step.label;
        it.sr.textContent = ` (${step.statusText})`;
        it.detail.textContent = '';
        if (step.detailPlayerIndex !== null) {
          const mark = playerMarkStyle(step.detailPlayerIndex);
          it.detail.append(h('span', { class: 'player-mark', text: mark.glyph, attrs: { 'aria-hidden': 'true' } }), ' ');
          it.detail.style.setProperty('--pc', mark.color);
        } else {
          it.detail.style.removeProperty('--pc');
        }
        if (step.detail !== null) it.detail.append(step.detail);
        it.detail.hidden = step.detail === null;
        it.li.classList.toggle('has-detail', step.detail !== null);
      });
      context.textContent = model.context;
      if (model.activePlayerIndex === null) {
        playerMark.hidden = true;
        contextLine.style.removeProperty('--pc');
      } else {
        const mark = playerMarkStyle(model.activePlayerIndex);
        playerMark.hidden = false;
        playerMark.textContent = mark.glyph;
        contextLine.style.setProperty('--pc', mark.color);
      }
    },
  };
}
