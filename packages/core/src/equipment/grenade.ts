import { visibleNodes } from '../board/line-of-sight';
import type { BoardState, NodeId } from '../board/types';
import { defenseRules } from '../combat/exchange';
import { combineModifiers, resolveCharacteristicTest } from '../combat/test';
import { registerHandler, reject } from '../engine/apply-command';
import type { GameEvent, RuleError } from '../events/events';
import { dropFlags } from '../flags/state';
import { DEATHMATCH_REASON, deathmatchWinner } from '../victory/deathmatch';
import { currentStats, DEFAULT_GAME_CONFIG, type CharacterState, type GameState } from '../state/types';
import { SMOKE_DURATION_TURNS } from '../combat/smoke';
import { characterEffects, type EquipmentEffect, type EquipmentItem } from './effects';

/** Effet d'une grenade explosive : `successes` succès automatiques sur la case visée et ses voisines, lancer jusqu'à `range` pas. */
export type ExplosiveEffect = Extract<EquipmentEffect, { type: 'GRENADE' }>;

/** Effet d'un fumigène : une fumée sur la case visée, lancer jusqu'à `range` pas. */
export type SmokeGrenadeEffect = Extract<EquipmentEffect, { type: 'SMOKE_GRENADE' }>;

/** Objet qui se lance avec THROW_GRENADE : grenade explosive ou fumigène. */
export type GrenadeEffect = ExplosiveEffect | SmokeGrenadeEffect;

/** Effet de lancer d'un équipement (`undefined` : ce n'est ni une grenade ni un fumigène). */
export function grenadeOf(item: EquipmentItem): GrenadeEffect | undefined {
  return (item.effects ?? []).find((e): e is GrenadeEffect => e.type === 'GRENADE' || e.type === 'SMOKE_GRENADE');
}

/** Zone d'une explosion (RULE-EQUIP-014) : la case visée et toutes les cases qui lui sont adjacentes (arête, porte et sens ignorés). */
export function explosionZone(board: BoardState, nodeId: NodeId): NodeId[] {
  const zone = new Set<NodeId>([nodeId]);
  for (const e of board.edges) {
    if (e.from === nodeId) zone.add(e.to);
    else if (e.to === nodeId) zone.add(e.from);
  }
  return [...zone];
}

/**
 * Cases visables d'un objet lancé de portée `range` (RULE-EQUIP-015) : celles de la ligne de vue du lanceur, à `range` pas au
 * plus, et la **dernière case** du lancer, qui peut sortir de la ligne de vue : toute case voisine (arête, porte ignorée) d'une
 * case vue atteinte en `range − 1` pas au plus. La case du lanceur est toujours « vue » : ses voisines sont donc toujours
 * visables, même sans couleur commune. Grenade : portée 5 ; fumigène : portée 8.
 */
function throwTargets(board: BoardState, from: NodeId, range: number, allowSelf: boolean): Set<NodeId> {
  const dist = stepDistances(board, from, range);
  const visible = visibleNodes(board, from);
  visible.add(from);
  const out = new Set<NodeId>();
  for (const [id, d] of dist) {
    if (!visible.has(id)) continue;
    out.add(id);
    if (d <= range - 1) for (const n of explosionZone(board, id)) out.add(n);
  }
  if (!allowSelf) out.delete(from);
  return out;
}

/** La case est-elle une cible valide pour un objet lancé de portée `range` ? (voir `throwTargets`). */
export function isThrowTarget(board: BoardState, from: NodeId, to: NodeId, range: number, allowSelf = false): boolean {
  return throwTargets(board, from, range, allowSelf).has(to);
}

/** Distances en pas depuis `from` (arêtes non bloquées par une porte fermée), jusqu'à `maxDepth` : un seul parcours pour tout le plateau. */
function stepDistances(board: BoardState, from: NodeId, maxDepth: number): Map<NodeId, number> {
  const neighbours = new Map<NodeId, NodeId[]>();
  for (const e of board.edges) {
    if (e.doorId !== undefined && board.doors[e.doorId]?.state === 'CLOSED') continue;
    (neighbours.get(e.from) ?? neighbours.set(e.from, []).get(e.from)!).push(e.to);
    (neighbours.get(e.to) ?? neighbours.set(e.to, []).get(e.to)!).push(e.from);
  }
  const dist = new Map<NodeId, number>([[from, 0]]);
  let frontier = [from];
  for (let d = 1; d <= maxDepth && frontier.length > 0; d += 1) {
    const next: NodeId[] = [];
    for (const n of frontier) {
      for (const m of neighbours.get(n) ?? []) {
        if (dist.has(m)) continue;
        dist.set(m, d);
        next.push(m);
      }
    }
    frontier = next;
  }
  return dist;
}

export type ThrowGrenadeCheck =
  | { readonly ok: true; readonly character: CharacterState; readonly item: EquipmentItem; readonly grenade: GrenadeEffect }
  | { readonly ok: false; readonly error: RuleError };

/**
 * Conditions du lancer (partagées avec `getLegalActions`) : comme une attaque, c'est l'action unique de l'activation,
 * par le personnage actif ; la case visée est à `range` pas au plus, seule la dernière case pouvant être hors de la ligne de vue (voir `throwTargets`), et n'est pas celle du lanceur.
 */
export function checkThrowGrenade(state: GameState, playerId: string, characterId: string, equipmentId: string, nodeId: NodeId): ThrowGrenadeCheck {
  const no = (code: string, message: string): ThrowGrenadeCheck => ({ ok: false, error: { code, message } });
  const base = checkThrowGrenadeBase(state, playerId, characterId, equipmentId);
  if (!base.ok) return base;
  const { character, grenade } = base;
  if (!state.board.nodes[nodeId]) return no('UNKNOWN_NODE', `Case inconnue : ${nodeId}.`);
  // Une grenade explosive ne vise pas la case de son lanceur ; un fumigène le peut (se couvrir).
  const smoke = grenade.type === 'SMOKE_GRENADE';
  if (nodeId === character.nodeId && !smoke) return no('GRENADE_OWN_NODE', 'Impossible : vous ne pouvez pas viser votre propre case.');
  if (!isThrowTarget(state.board, character.nodeId, nodeId, grenade.range, smoke)) {
    // Hors de portée si même la dernière case (voisine d'une case atteinte en `range − 1` pas) ne l'atteint pas ; sinon c'est la vue.
    const reach = stepDistances(state.board, character.nodeId, grenade.range);
    const near = [...reach].some(([id, d]) => d <= grenade.range - 1 && explosionZone(state.board, id).includes(nodeId)) || reach.has(nodeId);
    return near
      ? no('NO_LINE_OF_SIGHT', 'Aucune ligne de vue : seule la dernière case du lancer peut être hors de vue.')
      : no('OUT_OF_RANGE', `Case hors de portée (${grenade.range} pas maximum).`);
  }
  return base;
}

/** Conditions qui ne dépendent pas de la case visée : acteur, tour, action disponible, grenade possédée. */
export function checkThrowGrenadeBase(state: GameState, playerId: string, characterId: string, equipmentId: string): ThrowGrenadeCheck {
  const no = (code: string, message: string): ThrowGrenadeCheck => ({ ok: false, error: { code, message } });
  if (state.phase !== 'ACTIVATION') return no('NOT_IN_ACTIVATION', "Impossible : une grenade se lance pendant une activation.");
  if (state.turn.activePlayerId !== playerId) return no('NOT_ACTIVE_PLAYER', "Ce n'est pas le tour de ce joueur.");
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return no('UNKNOWN_CHARACTER', `Personnage inconnu : ${characterId}.`);
  if (character.playerId !== playerId) return no('NOT_OWN_CHARACTER', "Impossible : ce personnage n'est pas à vous.");
  if (!character.alive) return no('CHARACTER_DEAD', 'Impossible : ce personnage est hors de combat.');
  if (state.turn.activeCharacterId !== character.id) return no('NOT_ACTIVE_CHARACTER', "Ce personnage n'est pas en cours d'activation.");
  if (state.turn.actionUsed) return no('ACTION_ALREADY_USED', 'Une seule action par activation : elle est déjà utilisée.');
  const item = (character.equipment ?? []).find((i) => i.id === equipmentId);
  if (!item) return no('EQUIPMENT_NOT_OWNED', `Équipement non possédé : ${equipmentId}.`);
  const grenade = grenadeOf(item);
  if (!grenade) return no('NOT_A_GRENADE', "Cet équipement n'est pas une grenade.");
  return { ok: true, character, item, grenade };
}

/** Grenades lançables maintenant par un personnage, avec les cases qu'il peut viser (voir `throwTargets`). */
export function throwableGrenades(state: GameState, character: CharacterState): { equipmentId: string; nodeIds: NodeId[] }[] {
  const out: { equipmentId: string; nodeIds: NodeId[] }[] = [];
  for (const item of character.equipment ?? []) {
    if (!checkThrowGrenadeBase(state, character.playerId, character.id, item.id).ok) continue;
    const grenade = grenadeOf(item)!;
    const nodeIds = [...throwTargets(state.board, character.nodeId, grenade.range, grenade.type === 'SMOKE_GRENADE')]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (nodeIds.length > 0) out.push({ equipmentId: item.id, nodeIds });
  }
  return out;
}

/**
 * THROW_GRENADE (RULE-EQUIP-014) : jet d'attaque à `successes` (4) succès automatiques sur la case visée et sur chaque case
 * adjacente. Tous les personnages vivants de la zone, amis comme ennemis (lanceur compris), font un jet de défense normal
 * (réserve `defensePoolSize`, difficulté 10 − Physique) : chaque succès annule une blessure, le reste est infligé en dégâts.
 * Consomme l'action de l'activation et défausse la grenade.
 */
registerHandler('THROW_GRENADE', (state, command, rng) => {
  const checked = checkThrowGrenade(state, command.playerId, command.characterId, command.equipmentId, command.nodeId);
  if (!checked.ok) return reject(checked.error.code, checked.error.message);
  const { character, item, grenade } = checked;

  if (grenade.type === 'SMOKE_GRENADE') {
    // Fumigène : consomme l'action, défausse l'objet et pose une fumée de `SMOKE_DURATION_TURNS` tours sur la case visée.
    const effectId = `smoke:${command.nodeId}:t${state.turn.number}:${state.effects.length}`;
    return {
      ok: true,
      events: [
        { type: 'EQUIPMENT_USED', characterId: character.id, equipmentId: item.id, effect: 'SMOKE_GRENADE' },
        { type: 'SMOKE_STARTED', characterId: character.id, equipmentId: item.id, nodeId: command.nodeId, effectId, turns: SMOKE_DURATION_TURNS },
      ],
      state: {
        ...state,
        turn: { ...state.turn, actionUsed: true },
        characters: state.characters.map((c) => (c.id === character.id ? { ...c, equipment: (c.equipment ?? []).filter((i) => i.id !== item.id) } : c)),
        effects: [...state.effects, { id: effectId, type: 'SMOKE', origin: command.nodeId, remainingTurns: SMOKE_DURATION_TURNS }],
      },
    };
  }

  const zone = explosionZone(state.board, command.nodeId);
  const events: GameEvent[] = [
    { type: 'EQUIPMENT_USED', characterId: character.id, equipmentId: item.id, effect: 'GRENADE' },
    { type: 'GRENADE_EXPLODED', characterId: character.id, equipmentId: item.id, nodeId: command.nodeId, zone, successes: grenade.successes },
  ];
  let next: GameState = {
    ...state,
    turn: { ...state.turn, actionUsed: true },
    characters: state.characters.map((c) => (c.id === character.id ? { ...c, equipment: (c.equipment ?? []).filter((i) => i.id !== item.id) } : c)),
  };

  const poolSize = state.config?.defensePoolSize ?? DEFAULT_GAME_CONFIG.defensePoolSize;
  for (const victim of state.characters) {
    if (!victim.alive || !zone.includes(victim.nodeId)) continue;
    const mods = combineModifiers(
      ...(state.board.nodes[victim.nodeId]?.properties.modifiers ?? [])
        .filter((m) => m.applies === 'OCCUPANT' || m.applies === 'DEFENDER')
        .map((m) => ({ extraDice: m.extraDice, resultModifier: m.resultModifier })),
    );
    const defense = resolveCharacteristicTest(currentStats(victim).physical, poolSize, mods, rng, defenseRules(characterEffects(victim)));
    events.push({ type: 'DEFENSE_ROLLED', defenderId: victim.id, dice: defense.dice.map((d) => d.natural), successes: defense.successes, difficulty: defense.difficulty });
    const wounds = Math.max(0, grenade.successes - defense.successes);
    if (wounds === 0) continue;
    const healthLeft = Math.max(0, victim.health - wounds);
    next = { ...next, characters: next.characters.map((c) => (c.id === victim.id ? { ...c, health: healthLeft, alive: healthLeft > 0 } : c)) };
    events.push({ type: 'DAMAGE_APPLIED', targetId: victim.id, wounds, healthLeft });
    if (healthLeft === 0) {
      events.push({ type: 'CHARACTER_DEFEATED', characterId: victim.id });
      const dropped = dropFlags(next, victim.id);
      next = dropped.state;
      events.push(...dropped.events);
    }
  }

  const winnerId = deathmatchWinner(next);
  if (winnerId !== null) {
    next = { ...next, phase: 'FINISHED', victory: { winnerId, reason: DEATHMATCH_REASON } };
    events.push({ type: 'VICTORY', winnerId, reason: DEATHMATCH_REASON });
  }
  return { ok: true, state: next, events };
});
