import type { GameState, CharacterState } from '@tannhauser/core';

/** Retouche d'état de l'éditeur : un nouvel état, ou le motif (texte) du refus. Hors règles : outil de test uniquement. */
export type EditResult = { readonly ok: true; readonly state: GameState; readonly message: string } | { readonly ok: false; readonly message: string };

const refuse = (message: string): EditResult => ({ ok: false, message });

const withCharacter = (state: GameState, next: CharacterState): GameState => ({
  ...state,
  characters: state.characters.map((c) => (c.id === next.id ? next : c)),
});

function find(state: GameState, characterId: string): CharacterState | null {
  return state.characters.find((c) => c.id === characterId) ?? null;
}

/** Cases où l'on peut poser `characterId` : praticables et sans autre personnage vivant. */
export function freeNodes(state: GameState, characterId: string): string[] {
  return Object.values(state.board.nodes)
    .filter((n) => n.properties.passable && !state.characters.some((c) => c.alive && c.id !== characterId && c.nodeId === n.id))
    .map((n) => n.id);
}

/** Téléporte un personnage sur une case libre et praticable (aucun coût, aucune règle de déplacement). */
export function relocateCharacter(state: GameState, characterId: string, nodeId: string): EditResult {
  const character = find(state, characterId);
  if (!character) return refuse(`Personnage inconnu : ${characterId}.`);
  const node = state.board.nodes[nodeId];
  if (!node) return refuse(`Case inconnue : ${nodeId}.`);
  if (!node.properties.passable) return refuse(`La case ${nodeId} est impraticable.`);
  if (state.characters.some((c) => c.alive && c.id !== characterId && c.nodeId === nodeId)) return refuse(`La case ${nodeId} est occupée.`);
  if (character.nodeId === nodeId) return refuse(`${characterId} est déjà en ${nodeId}.`);
  return { ok: true, state: withCharacter(state, { ...character, nodeId }), message: `${characterId} placé en ${nodeId}.` };
}

/** Change la santé (entre 1 et le nombre de lignes de caractéristiques) ; un personnage hors de combat revient en jeu. */
export function adjustHealth(state: GameState, characterId: string, delta: number): EditResult {
  const character = find(state, characterId);
  if (!character) return refuse(`Personnage inconnu : ${characterId}.`);
  const max = character.statRows.length;
  const health = Math.min(max, Math.max(1, character.health + delta));
  if (health === character.health && character.alive) return refuse(`${characterId} : santé déjà à ${health}/${max}.`);
  return { ok: true, state: withCharacter(state, { ...character, health, alive: true }), message: `${characterId} : santé ${health}/${max}.` };
}

/** Passe un personnage à l'autre joueur (la partie compte exactement deux joueurs). */
export function switchOwner(state: GameState, characterId: string): EditResult {
  const character = find(state, characterId);
  if (!character) return refuse(`Personnage inconnu : ${characterId}.`);
  const other = state.players.find((p) => p.id !== character.playerId);
  if (!other) return refuse('Aucun autre joueur.');
  return { ok: true, state: withCharacter(state, { ...character, playerId: other.id }), message: `${characterId} appartient maintenant à ${other.id}.` };
}

/** Rend ses PM et son activation au personnage (utile pour rejouer un scénario sans attendre le tour suivant). */
export function resetActivation(state: GameState, characterId: string): EditResult {
  const character = find(state, characterId);
  if (!character) return refuse(`Personnage inconnu : ${characterId}.`);
  const row = character.statRows[Math.min(character.statRows.length - 1, Math.max(0, character.statRows.length - character.health))];
  const reset = withCharacter(state, { ...character, activated: false, overwatch: false, movementLeft: row?.movement ?? character.movementLeft });
  const turn = state.turn.activeCharacterId === characterId ? { ...reset.turn, actionUsed: false, forcePassageUsed: false } : reset.turn;
  return { ok: true, state: { ...reset, turn }, message: `${characterId} : PM et activation rétablis.` };
}
