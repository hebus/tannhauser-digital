import { registerHandler } from '../engine/apply-command';
import type { GameEvent } from '../events/events';
import type { FlagLocation, GameState } from '../state/types';
import { checkCaptureFlag, checkPlantFlag } from './rules';
import { CTF_REASON, captureTheFlagWinner, flagsOf } from './state';

/** Déplace un drapeau et consomme l'action de l'activation. */
const moveFlag = (state: GameState, flagId: string, location: FlagLocation): GameState => ({
  ...state,
  turn: { ...state.turn, actionUsed: true },
  flags: flagsOf(state).map((f) => (f.id === flagId ? { ...f, location } : f)),
});

registerHandler('CAPTURE_FLAG', (state, command) => {
  const checked = checkCaptureFlag(state, command.playerId, command.characterId, command.flagId);
  if (!checked.ok) return { ok: false, errors: [checked.error] };
  return {
    ok: true,
    state: moveFlag(state, command.flagId, { kind: 'CARRIED', characterId: command.characterId }),
    events: [{ type: 'FLAG_CAPTURED', flagId: command.flagId, characterId: command.characterId, nodeId: checked.nodeId }],
  };
});

registerHandler('PLANT_FLAG', (state, command) => {
  const checked = checkPlantFlag(state, command.playerId, command.characterId, command.flagId);
  if (!checked.ok) return { ok: false, errors: [checked.error] };
  let next = moveFlag(state, command.flagId, { kind: 'PLANTED', playerId: command.playerId, nodeId: checked.nodeId });
  const events: GameEvent[] = [
    { type: 'FLAG_PLANTED', flagId: command.flagId, characterId: command.characterId, playerId: command.playerId, nodeId: checked.nodeId },
  ];
  const winnerId = captureTheFlagWinner(next);
  if (winnerId !== null) {
    next = { ...next, phase: 'FINISHED', victory: { winnerId, reason: CTF_REASON } };
    events.push({ type: 'VICTORY', winnerId, reason: CTF_REASON });
  }
  return { ok: true, state: next, events };
});
