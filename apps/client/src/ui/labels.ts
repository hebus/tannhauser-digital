import type { CharacterState, GameState } from '@tannhauser/core';
import { hasKey, t } from './i18n';

/** Noms lisibles des identifiants de partie (personnages, armes, joueurs). Pur : dépend de l'état et de i18n. */
export interface Labeler {
  character(id: string): string;
  weapon(id: string): string;
  /** Nom d'un équipement quelconque (arme, médaille, capacité…) ; l'id lui-même si inconnu. */
  equipment(id: string): string;
  player(id: string): string;
  /** Nom du joueur propriétaire d'un drapeau (l'id du drapeau si inconnu). */
  flagOwner(flagId: string): string;
  /** Remplace dans un texte du moteur les identifiants connus par leurs noms lisibles. */
  humanize(text: string): string;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function baseName(character: CharacterState): string {
  const key = `${character.definitionId}.name`;
  return hasKey(key) ? t(key) : character.definitionId;
}

export function createLabeler(state: Pick<GameState, 'characters' | 'players'> & Partial<Pick<GameState, 'flags'>>): Labeler {
  const player = (id: string): string => (hasKey(`player.${id}`) ? t(`player.${id}`) : id);

  // Même nom dans les deux équipes : on précise le joueur. Plusieurs troupes du même type dans une équipe : on les numérote.
  const owners = new Map<string, Set<string>>();
  const perTeam = new Map<string, number>();
  for (const c of state.characters) {
    const name = baseName(c);
    (owners.get(name) ?? owners.set(name, new Set()).get(name)!).add(c.playerId);
    perTeam.set(`${c.playerId}|${name}`, (perTeam.get(`${c.playerId}|${name}`) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const characterLabels = new Map<string, string>();
  for (const c of state.characters) {
    const name = baseName(c);
    const key = `${c.playerId}|${name}`;
    const rank = (seen.get(key) ?? 0) + 1;
    seen.set(key, rank);
    const numbered = (perTeam.get(key) ?? 0) > 1 ? `${name} ${rank}` : name;
    characterLabels.set(c.id, (owners.get(name)?.size ?? 0) > 1 ? `${numbered} (${player(c.playerId)})` : numbered);
  }

  const character = (id: string): string => characterLabels.get(id) ?? id;
  const flagOwner = (flagId: string): string => {
    const ownerId = state.flags?.find((f) => f.id === flagId)?.ownerId;
    return ownerId ? player(ownerId) : flagId;
  };
  const weapon = (id: string): string => (hasKey(`${id}.name`) ? t(`${id}.name`) : id);

  const replacements: [string, string][] = [
    ...state.characters.map((c): [string, string] => [c.id, character(c.id)]),
    ...[...new Set(state.characters.flatMap((c) => (c.weapons ?? []).map((w) => w.id)))].map((w): [string, string] => [w, weapon(w)]),
  ].sort((a, b) => b[0].length - a[0].length);
  const pattern = replacements.length > 0 ? new RegExp(replacements.map(([id]) => escapeRegExp(id)).join('|'), 'g') : null;
  const byId = new Map(replacements);

  return {
    character,
    weapon,
    equipment: weapon,
    player,
    flagOwner,
    humanize: (text) => (pattern ? text.replace(pattern, (id) => byId.get(id) ?? id) : text),
  };
}
