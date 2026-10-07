import { cssColor, playerColor, playerShapeGlyph } from '@tannhauser/renderer';
import { h } from './dom';
import { t } from './i18n';
import { PHASE_ICONS, PHASE_STEP_IDS, type PhaseIconName, type PhaseModel, type PhaseStepId } from './phase-model';

/** Couleur et forme (mêmes que les pions du plateau) d'un joueur : jamais la couleur seule. */
export function playerMarkStyle(index: number): { color: string; glyph: string } {
  return { color: cssColor(playerColor(index)), glyph: playerShapeGlyph(index) };
}

export interface PhaseTracker {
  readonly element: HTMLElement;
  /** Met à jour la frise en place (les éléments persistent : les transitions CSS jouent à l'activation d'une phase). */
  update(model: PhaseModel): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Tracés (viewBox 24×24, trait) des pictogrammes : flèche circulaire, drapeau, œil, lecture, coche. */
const ICON_PATHS: Readonly<Record<PhaseIconName | 'check', readonly string[]>> = {
  refresh: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 4v5h-5'],
  flag: ['M6 21V4', 'M6 4h11l-2.5 4L17 12H6'],
  eye: ['M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'],
  play: ['M8 5.5v13l11-6.5z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
};

/** Icône SVG inline (trait, `currentColor`), décorative. */
export function svgIcon(name: PhaseIconName | 'check', className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function playerMark(index: number, className = 'player-mark'): HTMLElement {
  return h('span', { class: className, text: playerMarkStyle(index).glyph, attrs: { 'aria-hidden': 'true' } });
}

/** Remplace le contenu d'un conteneur sans reconstruire le conteneur lui-même. */
function setChildren(el: HTMLElement, ...children: (Node | string)[]): void {
  el.replaceChildren(...children);
}

/**
 * Bandeau « carte » : badge de tour, frise connectée (Refresh · Initiative · Overwatch · Activation), pastille
 * d'initiative, ligne de contexte et capsules de PC. Le DOM des nœuds est construit une fois ; `update` ne fait que
 * changer classes, `aria-current` et textes (les transitions CSS jouent à l'activation d'une phase).
 * Aucune règle : tout vient de `phaseModel`.
 */
export function createPhaseTracker(): PhaseTracker {
  // --- Badge de tour ---
  const turnN = h('span', { class: 'phase-turn-n', attrs: { 'aria-hidden': 'true' } });
  const turnSr = h('span', { class: 'sr-only' });
  const turn = h('div', { class: 'phase-turn' }, h('span', { class: 'phase-turn-label', text: t('phase.turn'), attrs: { 'aria-hidden': 'true' } }), turnN, turnSr);

  // --- Frise connectée ---
  const items = new Map<PhaseStepId, { li: HTMLElement; number: HTMLElement; label: HTMLElement; sub: HTMLElement; sr: HTMLElement }>();
  const list = h('ol', { class: 'phase-steps' });
  for (const id of PHASE_STEP_IDS) {
    const number = h('span', { class: 'phase-num' });
    const node = h('span', { class: 'phase-node', attrs: { 'aria-hidden': 'true' } }, svgIcon(PHASE_ICONS[id], 'phase-glyph'), svgIcon('check', 'phase-tick'), number);
    const label = h('span', { class: 'phase-label' });
    const sub = h('span', { class: 'phase-sub' });
    const sr = h('span', { class: 'sr-only' });
    // Libellé À CÔTÉ du nœud (sous-ligne de l'étape courante sous le libellé) : la frise tient sur une seule rangée.
    const li = h('li', { class: 'phase-step', attrs: { 'data-phase': id } }, h('span', { class: 'phase-node-slot' }, node), h('span', { class: 'phase-text' }, label, sub), sr);
    items.set(id, { li, number, label, sub, sr });
    list.append(li);
  }

  // --- Pastille d'initiative ---
  const initFlag = svgIcon('flag', 'phase-init-flag');
  const initTitle = h('span', { class: 'phase-init-title', attrs: { 'aria-hidden': 'true' } });
  const initWinner = h('span', { class: 'phase-init-winner', attrs: { 'aria-hidden': 'true' } });
  const initSr = h('span', { class: 'sr-only' });
  const initiative = h('div', { class: 'phase-initiative' }, initFlag, h('span', { class: 'phase-init-text' }, initTitle, initWinner), initSr);

  const card = h('div', { class: 'phase-card' }, turn, list, initiative);

  // --- Ligne de contexte + capsules de PC ---
  const ctxMark = h('span', { class: 'player-mark', attrs: { 'aria-hidden': 'true' } });
  const ctxName = h('strong', { class: 'phase-context-name' });
  const ctxSep = h('span', { class: 'phase-context-sep', text: '|', attrs: { 'aria-hidden': 'true' } });
  const ctxText = h('span', { class: 'phase-context-text' });
  const contextLine = h('p', { class: 'phase-context', attrs: { role: 'status', 'aria-live': 'polite' } }, ctxMark, ctxName, ctxSep, ctxText);
  const players = h('ul', { class: 'phase-players', attrs: { 'aria-label': t('phase.players') } });
  const lower = h('div', { class: 'phase-lower' }, contextLine, players);

  const element = h('nav', { class: 'hud-phase', attrs: { 'aria-label': t('phase.track') } }, card, lower);

  return {
    element,
    update(model) {
      // Badge de tour
      turn.hidden = model.turnNumber === null;
      turnN.textContent = model.turnNumber === null ? '' : String(model.turnNumber);
      turnSr.textContent = model.turnNumber === null ? '' : t('status.turn', { n: model.turnNumber });

      // Frise
      PHASE_STEP_IDS.forEach((id, i) => {
        const step = model.steps[i]!;
        const it = items.get(id)!;
        const previous = i > 0 ? model.steps[i - 1]! : null;
        it.li.className = `phase-step is-${step.status}${step.fresh ? ' is-fresh' : ''}${previous?.status === 'done' ? ' is-linked' : ''}`;
        if (step.status === 'current') it.li.setAttribute('aria-current', 'step');
        else it.li.removeAttribute('aria-current');
        it.number.textContent = String(step.number);
        it.label.textContent = step.label;
        it.sub.textContent = step.subline ?? '';
        it.sub.hidden = step.subline === null;
        it.sr.textContent = ` (${step.statusText}${step.subline ? `, ${step.subline}` : ''}${step.detail && step.status !== 'current' ? `, ${step.detail}` : ''})`;
      });

      // Pastille d'initiative
      const ini = model.initiative;
      initiative.classList.toggle('is-pending', !ini.decided);
      if (ini.decided && ini.playerIndex !== null) {
        const mark = playerMarkStyle(ini.playerIndex);
        initiative.style.setProperty('--pc', mark.color);
        initTitle.textContent = t('phase.initiative.title');
        setChildren(initWinner, playerMark(ini.playerIndex), h('span', { class: 'phase-init-name', text: ini.playerName ?? '' }));
        initSr.textContent = `${t('phase.initiative.title')} : ${ini.playerName ?? ''}`;
      } else {
        initiative.style.removeProperty('--pc');
        initTitle.textContent = t('phase.initiative.pendingShort');
        setChildren(initWinner);
        initSr.textContent = t('phase.initiative.pending');
      }

      // Ligne de contexte : joueur qui a la main (forme + nom), puis la consigne ; le texte complet en infobulle si la ligne est tronquée.
      contextLine.title = model.context;
      if (model.activePlayerIndex === null || model.activePlayerName === null) {
        ctxMark.hidden = true;
        ctxName.hidden = true;
        ctxSep.hidden = true;
        ctxText.textContent = model.context;
        contextLine.style.removeProperty('--pc');
      } else {
        const mark = playerMarkStyle(model.activePlayerIndex);
        ctxMark.hidden = false;
        ctxMark.textContent = mark.glyph;
        ctxName.hidden = false;
        ctxName.textContent = model.activePlayerName;
        ctxSep.hidden = false;
        ctxText.textContent = model.instruction;
        contextLine.style.setProperty('--pc', mark.color);
      }

      // Capsules de PC : une par joueur (reconstruites, quelques nœuds seulement, sans focus).
      setChildren(
        players,
        ...model.players.map((p) => {
          const mark = playerMarkStyle(p.index);
          const li = h(
            'li',
            {
              class: `phase-player${p.active ? ' is-active' : ''}`,
              attrs: { 'aria-current': p.active ? 'true' : undefined, title: [p.name, p.pcText, p.stateText, p.active ? t('phase.playing') : null].filter(Boolean).join(' · ') },
            },
            playerMark(p.index),
            h('span', { class: 'phase-player-name', text: p.name }),
            h('b', { class: 'phase-player-pc', text: p.pcText }),
            p.stateText ? h('span', { class: 'phase-player-state', text: p.stateText }) : null,
            p.active ? h('span', { class: 'phase-player-playing', text: t('phase.playing') }) : null,
          );
          li.style.setProperty('--pc', mark.color);
          return li;
        }),
      );
    },
  };
}
