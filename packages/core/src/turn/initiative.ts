import type { RandomSource } from '../rng/rng';
import type { PlayerId } from '../state/types';

export interface InitiativeResult {
  readonly rolls: Readonly<Record<PlayerId, number>>;
  readonly winnerId: PlayerId;
}

/**
 * Initiative (§66.2) : 1d10 par joueur ; en cas d'égalité, seuls les ex æquo relancent.
 * Aucun bonus applicable n'est défini à ce stade (cf. open-questions).
 */
export function rollInitiative(playerIds: readonly PlayerId[], rng: RandomSource): InitiativeResult {
  if (playerIds.length === 0) throw new Error('Initiative : aucun joueur.');
  const rolls: Record<PlayerId, number> = {};
  let contenders = [...playerIds];
  for (;;) {
    for (const id of contenders) rolls[id] = rng.nextInt(1, 10);
    const best = Math.max(...contenders.map((id) => rolls[id]!));
    contenders = contenders.filter((id) => rolls[id] === best);
    if (contenders.length === 1) return { rolls, winnerId: contenders[0]! };
  }
}
