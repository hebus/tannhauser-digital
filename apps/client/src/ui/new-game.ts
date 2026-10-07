import { SeededRng, applyCommand, createInitialState, type CharacterState } from '@tannhauser/core';
import { createCharacterState, loadDevContent } from '@tannhauser/content';
import { GameFacade } from '../game-facade';
import { placeTeams, validateSetup, type SetupConfig, type SetupContent } from '../setup/setup-config';

type DevContent = ReturnType<typeof loadDevContent>;

/** Vue « mise en place » du contenu chargé (plateaux et personnages disponibles). */
export function setupContentOf(content: DevContent): SetupContent {
  return { boards: content.boards, characters: content.characters };
}

export class InvalidSetupError extends Error {
  constructor(readonly codes: readonly string[]) {
    super(`Configuration de partie invalide : ${codes.join(', ')}`);
    this.name = 'InvalidSetupError';
  }
}

/**
 * Construit une partie démarrée depuis une configuration de mise en place :
 * même seed + même configuration = même partie (placement et jets inclus).
 * Un personnage choisi par les deux équipes reçoit l'id `<définition>#<joueur>` pour garder des ids uniques.
 */
export function createGameFromSetup(config: SetupConfig, content: DevContent = loadDevContent()): GameFacade {
  const issues = validateSetup(config, setupContentOf(content));
  if (issues.length > 0) throw new InvalidSetupError(issues.map((i) => i.code));

  // Plateau CHOISI (et sa mise en page d'affichage) : validateSetup a déjà vérifié que l'id existe.
  const chosen = content.boards.find((b) => b.id === config.boardId)!;
  const board = chosen.board;
  const placement = placeTeams(
    board,
    config.teams.map((t) => ({ playerId: t.playerId, count: t.characterIds.length })),
  );
  if (!placement) throw new InvalidSetupError(['NOT_ENOUGH_NODES']);

  const uses = new Map<string, number>();
  for (const team of config.teams) for (const id of team.characterIds) uses.set(id, (uses.get(id) ?? 0) + 1);

  const definition = (id: string) => content.characters.find((c) => c.id === id)!;
  const characters: CharacterState[] = config.teams.flatMap((team) =>
    team.characterIds.map((defId, i) =>
      createCharacterState(definition(defId), content.weapons, {
        id: (uses.get(defId) ?? 0) > 1 ? `${defId}#${team.playerId}` : defId,
        playerId: team.playerId,
        nodeId: placement[team.playerId]![i]!,
      }),
    ),
  );

  const rng = new SeededRng(config.seed);
  const initial = createInitialState({
    gameId: `game-${config.seed}`,
    scenarioId: config.boardId,
    board,
    players: config.teams.map((team) => ({
      id: team.playerId,
      factionId: definition(team.characterIds[0]!).factionId,
      commandPoints: 0,
    })),
    characters,
    rng: rng.snapshot(),
  });
  // START_GAME consomme l'aléa (initiative) ; le snapshot du nouvel état reprend la séquence là où elle s'arrête.
  const started = applyCommand(initial, { type: 'START_GAME' }, rng);
  if (!started.accepted) throw new InvalidSetupError(started.errors.map((e) => e.code));
  return new GameFacade(started.state, config.seed, chosen.layout, new Set(config.ai ?? []));
}

