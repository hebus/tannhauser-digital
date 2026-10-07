import type { GameFacade } from '../game-facade';
import { describeRefusals, explainIgnoredClick, explainIgnoredKey, type RefusedCommand } from './input-feedback';

/**
 * Rend les refus du moteur visibles sans toucher à `game-facade.ts` ni à `main.ts` :
 * `game.dispatch` est enveloppé ; les refus d'une même saisie sont regroupés (la boucle « essayer chaque arme »
 * de main.ts ne produit un message que si TOUTES les tentatives échouent).
 */
export function interceptRefusals(game: GameFacade, onRefused: (messages: string[]) => void): { readonly dispatchCount: () => number } {
  const original = game.dispatch.bind(game);
  let pending: RefusedCommand[] = [];
  let acceptedInTick = false;
  let scheduled = false;
  let count = 0;

  const flush = (): void => {
    scheduled = false;
    const refused = pending;
    const accepted = acceptedInTick;
    pending = [];
    acceptedInTick = false;
    if (!accepted && refused.length > 0) {
      const messages = describeRefusals(refused, game.state);
      if (messages.length > 0) onRefused(messages);
    }
  };

  game.dispatch = (command) => {
    count += 1;
    const result = original(command);
    if (result.accepted) acceptedInTick = true;
    else pending.push({ command, errors: result.errors });
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
    return result;
  };
  return { dispatchCount: () => count };
}

/**
 * Une saisie qui n'aboutit à aucune commande (clic sur une case inutilisable, T/D sans réaction) est expliquée.
 * Les écouteurs sont posés avant ceux de main.ts ; l'examen se fait après coup (setTimeout 0).
 */
export function watchIgnoredInput(game: GameFacade, dispatchCount: () => number, report: (message: string) => void): void {
  let down = false;
  let moved = 0;
  window.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof HTMLCanvasElement)) return;
    down = true;
    moved = 0;
  });
  window.addEventListener('pointermove', (e) => {
    if (down) moved += Math.abs(e.movementX) + Math.abs(e.movementY);
  });
  window.addEventListener('pointerup', (e) => {
    const wasClick = down && moved < 4;
    down = false;
    if (!wasClick || !(e.target instanceof HTMLCanvasElement)) return;
    const before = dispatchCount();
    setTimeout(() => {
      if (dispatchCount() === before) report(explainIgnoredClick(game.state));
    }, 0);
  });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const before = dispatchCount();
    const key = e.key;
    setTimeout(() => {
      if (dispatchCount() !== before) return;
      const message = explainIgnoredKey(game.state, key);
      if (message) report(message);
    }, 0);
  });
}
