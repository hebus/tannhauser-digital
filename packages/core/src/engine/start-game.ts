import type { GameEvent } from '../events/events';
import { startTurn } from '../turn/start-turn';
import { registerHandler, reject } from './apply-command';

registerHandler('START_GAME', (state, _command, rng) => {
  if (state.phase !== 'SETUP') return reject('NOT_IN_SETUP', 'La partie est déjà démarrée.');
  if (state.players.length < 2) return reject('NOT_ENOUGH_PLAYERS', 'Deux joueurs au minimum.');

  // Tour 1 : même refresh + initiative que les tours suivants (PC issus de `state.config`).
  const started = startTurn(state, 1, rng);
  const events: GameEvent[] = [{ type: 'GAME_STARTED', scenarioId: state.scenarioId }, ...started.events];
  return { ok: true, events, state: started.state };
});
