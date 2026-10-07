import type { GameEvent } from '../events/events';
import { isCaptureTheFlag } from '../flags/state';
import { placeInitialFlags } from '../flags/rules';
import { startTurn } from '../turn/start-turn';
import { registerHandler, reject } from './apply-command';

registerHandler('START_GAME', (state, _command, rng) => {
  if (state.phase !== 'SETUP') return reject('NOT_IN_SETUP', 'La partie est déjà démarrée.');
  if (state.players.length < 2) return reject('NOT_ENOUGH_PLAYERS', 'Deux joueurs au minimum.');

  // Capture du drapeau : les drapeaux sont posés avant le premier tour.
  const events: GameEvent[] = [{ type: 'GAME_STARTED', scenarioId: state.scenarioId }];
  let ready = state;
  if (isCaptureTheFlag(state)) {
    const placed = placeInitialFlags(state);
    if (!placed.ok) return { ok: false, errors: [placed.error] };
    ready = placed.state;
    events.push(...placed.events);
  }
  // Tour 1 : même refresh + initiative que les tours suivants (PC issus de `state.config`).
  const started = startTurn(ready, 1, rng);
  events.push(...started.events);
  return { ok: true, events, state: started.state };
});
