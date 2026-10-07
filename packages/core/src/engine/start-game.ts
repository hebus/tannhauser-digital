import type { GameEvent } from '../events/events';
import { registerHandler, reject } from './apply-command';

/** PC par joueur à la mise en place (Deathmatch : 2 — donnée de mode, à externaliser avec les modes). */
const DEFAULT_COMMAND_POINTS = 2;

registerHandler('START_GAME', (state, _command, rng) => {
  if (state.phase !== 'SETUP') return reject('NOT_IN_SETUP', 'La partie est déjà démarrée.');
  if (state.players.length < 2) return reject('NOT_ENOUGH_PLAYERS', 'Deux joueurs au minimum.');

  const events: GameEvent[] = [{ type: 'GAME_STARTED', scenarioId: state.scenarioId }];
  events.push({ type: 'TURN_STARTED', turn: 1 });

  const players = state.players.map((p) => ({ ...p, commandPoints: DEFAULT_COMMAND_POINTS }));
  for (const p of players) {
    events.push({ type: 'COMMAND_POINTS_REFRESHED', playerId: p.id, amount: p.commandPoints });
  }

  // Initiative du tour 1 : 1d10 par joueur ; égalité → nouveau tirage pour les ex æquo.
  const rolls: Record<string, number> = {};
  let contenders = players.map((p) => p.id);
  let winnerId = contenders[0]!;
  for (;;) {
    for (const id of contenders) rolls[id] = rng.nextInt(1, 10);
    const best = Math.max(...contenders.map((id) => rolls[id]!));
    contenders = contenders.filter((id) => rolls[id] === best);
    if (contenders.length === 1) {
      winnerId = contenders[0]!;
      break;
    }
  }
  events.push({ type: 'INITIATIVE_ROLLED', rolls, winnerId });

  return {
    ok: true,
    events,
    state: {
      ...state,
      players,
      phase: 'ACTIVATION',
      turn: { number: 1, initiativePlayerId: winnerId, activePlayerId: winnerId },
    },
  };
});
