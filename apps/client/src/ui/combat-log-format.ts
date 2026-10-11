import { explainCombat, type CombatLog, type GameEvent } from '@tannhauser/core';
import { effectBadge, type EffectBadge } from './effect-icons';
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
  /** Effets d'équipement appliqués (pastilles à pictogramme) ; absent = aucun. */
  readonly effects?: readonly EffectBadge[];
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
  const applied = log.effects ?? [];
  const effectLines = applied.map((e) => t('effect.line', { icon: effectBadge(e.type).icon, name: effectBadge(e.type).label, who: labels.character(e.characterId), side: t(`effect.side.${e.side}`) }));
  return {
    kind: 'combat',
    tone: log.defeated ? 'kill' : log.wounds > 0 ? 'hit' : 'miss',
    text,
    lines: [...explainCombat(log).map(labels.humanize), ...effectLines],
    ...(applied.length > 0 ? { effects: applied.map((e) => effectBadge(e.type)) } : {}),
  };
}

/** Événements d'une explosion qui suivent GRENADE_EXPLODED : repliés dans son entrée de journal (une ligne par victime). */
const BLAST_PARTS: ReadonlySet<GameEvent['type']> = new Set(['DEFENSE_ROLLED', 'DAMAGE_APPLIED', 'CHARACTER_DEFEATED']);

function blastEntry(e: Extract<GameEvent, { type: 'GRENADE_EXPLODED' }>, parts: readonly GameEvent[], labels: Labeler): LogEntry {
  const lines: string[] = [];
  let defeated = false;
  let wounded = false;
  for (const part of parts) {
    if (part.type === 'DEFENSE_ROLLED') lines.push(t('log.grenade.defense', { defender: labels.character(part.defenderId), dice: part.dice.join(', '), parried: part.successes }));
    else if (part.type === 'DAMAGE_APPLIED') {
      wounded = true;
      lines.push(t('log.grenade.damage', { target: labels.character(part.targetId), wounds: part.wounds, health: part.healthLeft }));
    } else if (part.type === 'CHARACTER_DEFEATED') {
      defeated = true;
      lines.push(t('log.grenade.defeated', { character: labels.character(part.characterId) }));
    }
  }
  return {
    kind: 'combat',
    tone: defeated ? 'kill' : wounded ? 'hit' : 'miss',
    text: t('log.event.GRENADE_EXPLODED', { character: labels.character(e.characterId), equipment: labels.equipment(e.equipmentId), node: e.nodeId, count: e.zone.length, successes: e.successes }),
    lines,
    effects: [effectBadge('GRENADE')],
  };
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
    case 'EQUIPMENT_USED':
      return { kind: 'event', tone: 'info', text: t('log.event.EQUIPMENT_USED', { character: labels.character(e.characterId), equipment: labels.equipment(e.equipmentId) }), lines: [], effects: [effectBadge(e.effect)] };
    case 'SMOKE_STARTED':
      return { kind: 'event', tone: 'info', text: t('log.event.SMOKE_STARTED', { character: labels.character(e.characterId), equipment: labels.equipment(e.equipmentId), node: e.nodeId, turns: e.turns }), lines: [], effects: [effectBadge('SMOKE_GRENADE')] };
    case 'SMOKE_EXPIRED':
      return info('log.event.SMOKE_EXPIRED', { node: e.origin });
    case 'COMMAND_POINTS_GAINED':
      return info('log.event.COMMAND_POINTS_GAINED', { player: labels.player(e.playerId), amount: e.amount, total: e.total });
    case 'OVERWATCH_PLACED':
      return info('log.event.OVERWATCH_PLACED', { character: labels.character(e.characterId) });
    case 'OVERWATCH_TRIGGERED':
      return e.announced
        ? info('log.event.OVERWATCH_TRIGGERED.announced', { overwatcher: labels.character(e.overwatcherId), target: labels.character(e.targetId), node: e.nodeId, action: e.announced })
        : info('log.event.OVERWATCH_TRIGGERED', { overwatcher: labels.character(e.overwatcherId), target: labels.character(e.targetId), node: e.nodeId });
    case 'COMMAND_POINTS_SPENT':
      return info('log.event.COMMAND_POINTS_SPENT', { player: labels.player(e.playerId), amount: e.amount, purpose: e.purpose, remaining: e.remaining });
    case 'OVERWATCH_PASSED':
      return info(e.auto ? 'log.event.OVERWATCH_PASSED_AUTO' : 'log.event.OVERWATCH_PASSED', { player: labels.player(e.playerId) });
    case 'OVERWATCH_PHASE_ENDED':
      return info('log.event.OVERWATCH_PHASE_ENDED', {});
    case 'OVERWATCH_RESUME_REFUSED':
      return info('log.event.OVERWATCH_RESUME_REFUSED', { command: e.command, message: e.message });
    case 'OVERWATCH_RESOLVED':
      return info(e.fired ? 'log.event.OVERWATCH_RESOLVED.fired' : 'log.event.OVERWATCH_RESOLVED.declined', { overwatcher: labels.character(e.overwatcherId) });
    case 'FORCE_PASSAGE_RESOLVED': {
      const remaining = Math.max(0, e.successes - e.defenderSuccesses);
      return {
        kind: 'combat',
        tone: e.success ? 'hit' : 'miss',
        text: t(e.success ? 'log.event.FORCE_PASSAGE.success' : 'log.event.FORCE_PASSAGE.failure', { character: labels.character(e.characterId), enemy: labels.character(e.enemyId) }),
        lines: [
          `${labels.character(e.characterId)} : difficulté ${e.difficulty}, dés [${e.dice.join(', ')}] → ${e.successes} succès.`,
          `${labels.character(e.enemyId)} : difficulté ${e.defenderDifficulty}, dés [${e.defenderDice.join(', ')}] → ${e.defenderSuccesses} succès (annulent autant de succès).`,
          `Succès restants : ${remaining} (au moins 1 requis pour passer).`,
        ],
      };
    }
    case 'DOOR_OPENED':
      return info('log.event.DOOR_OPENED', { character: labels.character(e.characterId), door: e.doorId });
    case 'DOOR_CLOSED':
      return info('log.event.DOOR_CLOSED', { character: labels.character(e.characterId), door: e.doorId });
    case 'PLAYER_PASSED':
      return info('log.event.PLAYER_PASSED', { player: labels.player(e.playerId) });
    case 'TURN_ENDED':
      return info('log.event.TURN_ENDED', { turn: e.turn });
    case 'FLAG_PLACED':
      return info('log.event.FLAG_PLACED', { owner: labels.player(e.ownerId), node: e.nodeId });
    case 'FLAG_CAPTURED':
      return info('log.event.FLAG_CAPTURED', { character: labels.character(e.characterId), owner: labels.flagOwner(e.flagId), node: e.nodeId });
    case 'FLAG_DROPPED':
      return info('log.event.FLAG_DROPPED', { character: labels.character(e.characterId), owner: labels.flagOwner(e.flagId), node: e.nodeId });
    case 'FLAG_PLANTED':
      return info('log.event.FLAG_PLANTED', { character: labels.character(e.characterId), owner: labels.flagOwner(e.flagId), player: labels.player(e.playerId), node: e.nodeId });
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
    if (e.type === 'GRENADE_EXPLODED') {
      let j = i + 1;
      while (j < events.length && BLAST_PARTS.has(events[j]!.type)) j += 1;
      entries.push(blastEntry(e, events.slice(i + 1, j), labels));
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
