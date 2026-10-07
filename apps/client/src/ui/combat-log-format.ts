import { explainCombat, type CombatLog, type GameEvent } from '@tannhauser/core';
import { t } from './i18n';
import type { Labeler } from './labels';

/** Ton visuel d'une entrée (jamais porté par la couleur seule : l'interface ajoute un pictogramme et le texte). */
export type LogTone = 'info' | 'turn' | 'hit' | 'miss' | 'kill' | 'refusal' | 'victory';

export interface LogEntry {
  readonly kind: 'event' | 'combat' | 'turn' | 'refusal';
  readonly tone: LogTone;
  /** Ligne de résumé (toujours visible). */
  readonly text: string;
  /** Détail du jet (lignes de `explainCombat`), vide pour les événements simples. */
  readonly lines: readonly string[];
}

/** Types d'événements qui composent un échange d'attaque (repliés dans l'entrée de combat). */
const EXCHANGE_PARTS: ReadonlySet<GameEvent['type']> = new Set(['COMBAT_ROLLED', 'DEFENSE_ROLLED', 'ATTACK_HIT', 'ATTACK_MISSED', 'DAMAGE_APPLIED']);

function exchangeEntry(log: CombatLog, labels: Labeler): LogEntry {
  const result = log.wounds > 0 ? t('log.exchange.hit', { wounds: log.wounds }) : t('log.exchange.missed');
  const text = t('log.exchange', {
    attacker: labels.character(log.attackerId),
    target: labels.character(log.targetId),
    weapon: labels.weapon(log.weaponId),
    result: log.defeated ? `${result}, ${t('log.exchange.defeated')}` : result,
  });
  return { kind: 'combat', tone: log.defeated ? 'kill' : log.wounds > 0 ? 'hit' : 'miss', text, lines: explainCombat(log).map(labels.humanize) };
}

/** Un événement non-combat en une ligne ; `null` si l'événement n'a rien à montrer au joueur. */
export function formatEvent(e: GameEvent, labels: Labeler): LogEntry | null {
  const info = (key: string, params?: Record<string, string | number>): LogEntry => ({ kind: 'event', tone: 'info', text: t(key, params), lines: [] });
  switch (e.type) {
    case 'GAME_STARTED':
      return info('log.event.GAME_STARTED');
    case 'TURN_STARTED':
      return { kind: 'turn', tone: 'turn', text: t('log.event.TURN_STARTED', { turn: e.turn }), lines: [] };
    case 'INITIATIVE_ROLLED':
      return info('log.event.INITIATIVE_ROLLED', {
        winner: labels.player(e.winnerId),
        rolls: Object.entries(e.rolls)
          .map(([p, v]) => `${labels.player(p)} ${v}`)
          .join(', '),
      });
    case 'INITIATIVE_CHANGED':
      return info('log.event.INITIATIVE_CHANGED', { winner: labels.player(e.winnerId) });
    case 'CHARACTER_ACTIVATION_STARTED':
      return info('log.event.CHARACTER_ACTIVATION_STARTED', { character: labels.character(e.characterId) });
    case 'CHARACTER_MOVED':
      return info('log.event.CHARACTER_MOVED', { character: labels.character(e.characterId), cost: e.cost, node: e.path[e.path.length - 1] ?? '?' });
    case 'CHARACTER_ACTIVATION_ENDED':
      return info('log.event.CHARACTER_ACTIVATION_ENDED', { character: labels.character(e.characterId) });
    case 'OVERWATCH_PLACED':
      return info('log.event.OVERWATCH_PLACED', { character: labels.character(e.characterId) });
    case 'OVERWATCH_TRIGGERED':
      return e.announced
        ? info('log.event.OVERWATCH_TRIGGERED.announced', { overwatcher: labels.character(e.overwatcherId), target: labels.character(e.targetId), node: e.nodeId, action: e.announced })
        : info('log.event.OVERWATCH_TRIGGERED', { overwatcher: labels.character(e.overwatcherId), target: labels.character(e.targetId), node: e.nodeId });
    case 'COMMAND_POINTS_SPENT':
      return info('log.event.COMMAND_POINTS_SPENT', { player: labels.player(e.playerId), amount: e.amount, purpose: e.purpose, remaining: e.remaining });
    case 'OVERWATCH_PLACEMENT_ENDED':
      return info('log.event.OVERWATCH_PLACEMENT_ENDED', { player: labels.player(e.playerId) });
    case 'OVERWATCH_RESUME_REFUSED':
      return info('log.event.OVERWATCH_RESUME_REFUSED', { command: e.command, message: e.message });
    case 'OVERWATCH_RESOLVED':
      return info(e.fired ? 'log.event.OVERWATCH_RESOLVED.fired' : 'log.event.OVERWATCH_RESOLVED.declined', { overwatcher: labels.character(e.overwatcherId) });
    case 'DOOR_OPENED':
      return info('log.event.DOOR_OPENED', { character: labels.character(e.characterId), door: e.doorId });
    case 'DOOR_CLOSED':
      return info('log.event.DOOR_CLOSED', { character: labels.character(e.characterId), door: e.doorId });
    case 'PLAYER_PASSED':
      return info('log.event.PLAYER_PASSED', { player: labels.player(e.playerId) });
    case 'TURN_ENDED':
      return info('log.event.TURN_ENDED', { turn: e.turn });
    case 'CHARACTER_DEFEATED':
      return { kind: 'event', tone: 'kill', text: t('log.event.CHARACTER_DEFEATED', { character: labels.character(e.characterId) }), lines: [] };
    case 'VICTORY':
      return { kind: 'event', tone: 'victory', text: t('log.event.VICTORY', { winner: labels.player(e.winnerId) }), lines: [] };
    default:
      // COMMAND_POINTS_*, TEST_RESOLVED, SMOKE_EXPIRED… : visibles ailleurs (HUD) ou sans intérêt joueur.
      return null;
  }
}

/**
 * Transforme le lot d'événements d'une commande en entrées de journal : un échange d'attaque devient
 * UNE entrée détaillée (via `explainCombat`), le reste une ligne par événement.
 */
export function buildLogEntries(events: readonly GameEvent[], labels: Labeler): LogEntry[] {
  const entries: LogEntry[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i]!;
    if (e.type === 'ATTACK_DECLARED') {
      let log: CombatLog | undefined;
      let j = i + 1;
      for (; j < events.length && EXCHANGE_PARTS.has(events[j]!.type); j += 1) {
        const part = events[j]!;
        if (part.type === 'COMBAT_ROLLED' && part.log) log = part.log;
      }
      if (log) {
        entries.push(exchangeEntry(log, labels));
      } else {
        // Journal structuré absent (ancien format) : au moins la déclaration et le résultat, en une ligne.
        entries.push({
          kind: 'event',
          tone: 'info',
          text: t('log.exchange', { attacker: labels.character(e.attackerId), target: labels.character(e.targetId), weapon: labels.weapon(e.weaponId), result: '…' }),
          lines: [],
        });
      }
      i = j - 1;
      continue;
    }
    const entry = formatEvent(e, labels);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Entrée de journal pour un refus du moteur (jamais silencieux). */
export function refusalEntry(reason: string): LogEntry {
  return { kind: 'refusal', tone: 'refusal', text: t('log.refusal', { reason }), lines: [] };
}
