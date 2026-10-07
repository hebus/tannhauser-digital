import type { CharacterState, GameState } from '@tannhauser/core';
import { hasKey, t } from './i18n';

/** Noms lisibles des identifiants de partie (personnages, armes, joueurs). Pur : dépend de l'état et de i18n. */
export interface Labeler {
  character(id: string): string;
  weapon(id: string): string;
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

  // Deux personnages de même nom (même définition dans les deux équipes) : on précise le joueur.
  const counts = new Map<string, number>();
  for (const c of state.characters) counts.set(baseName(c), (counts.get(baseName(c)) ?? 0) + 1);
  const characterLabels = new Map<string, string>();
  for (const c of state.characters) {
    const name = baseName(c);
    characterLabels.set(c.id, (counts.get(name) ?? 0) > 1 ? `${name} (${player(c.playerId)})` : name);
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
    player,
    flagOwner,
    humanize: (text) => (pattern ? text.replace(pattern, (id) => byId.get(id) ?? id) : text),
  };
}
