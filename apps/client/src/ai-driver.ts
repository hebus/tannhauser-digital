import { chooseCommand, decidingPlayer } from '@tannhauser/ai';
import type { GameFacade } from './game-facade';

export interface AiDriverOptions {
  /** Exécute le rappel quand les animations en cours sont terminées (l'IA ne joue pas pendant une animation). */
  readonly whenIdle: (callback: () => void) => void;
  /** Pause de « réflexion » avant chaque commande de l'IA. */
  readonly delayMs?: number;
  /** Appelé si le moteur refuse une commande de l'IA (ne devrait jamais arriver) : le pilotage s'arrête alors. */
  readonly onError?: (message: string) => void;
}

/**
 * Fait jouer les joueurs pilotés par l'IA : dès que c'est à l'un d'eux de décider (et que l'affichage est au repos),
 * attend un instant puis envoie la commande choisie par `chooseCommand`. Renvoie la fonction d'arrêt.
 */
export function startAiDriver(game: GameFacade, options: AiDriverOptions): () => void {
  const delay = options.delayMs ?? 700;
  let stopped = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const step = (): void => {
    pending = false;
    if (stopped) return;
    const player = decidingPlayer(game.state);
    if (!player || !game.isAi(player)) return;
    const command = chooseCommand(game.state, player);
    if (!command) return;
    const result = game.dispatchAi(command);
    if (!result.accepted) {
      stopped = true;
      options.onError?.(`IA : commande refusée (${command.type}) : ${result.errors.map((e) => e.message).join(' ')}`);
    }
    // En cas de succès, l'abonnement ci-dessous replanifie la décision suivante.
  };

  const pump = (): void => {
    if (stopped || pending) return;
    const player = decidingPlayer(game.state);
    if (!player || !game.isAi(player)) return;
    pending = true;
    options.whenIdle(() => {
      if (stopped) return;
      timer = setTimeout(step, delay);
    });
  };

  const unsubscribe = game.subscribe(pump);
  pump();
  return () => {
    stopped = true;
    unsubscribe();
    if (timer !== undefined) clearTimeout(timer);
  };
}
