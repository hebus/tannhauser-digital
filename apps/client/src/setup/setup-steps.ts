import { validateSetup, type SetupConfig, type SetupContent, type SetupIssue } from './setup-config';

/** Étapes de l'assistant de mise en place, dans l'ordre. */
export const SETUP_STEPS = ['terrain', 'players', 'teams', 'summary'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** Étape où un problème de configuration se corrige. */
export function issueStep(issue: SetupIssue): SetupStep {
  switch (issue.code) {
    case 'UNKNOWN_BOARD':
    case 'BAD_SEED':
    case 'NOT_ENOUGH_NODES':
    case 'MODE_UNSUPPORTED_BOARD':
      return 'terrain';
    case 'TEAM_COUNT':
    case 'TEAM_EMPTY':
    case 'TEAM_TOO_LARGE':
    case 'UNKNOWN_CHARACTER':
    case 'DUPLICATE_CHARACTER':
      return 'teams';
  }
}

/** Problèmes à corriger pour quitter `step` (vide : on peut passer à l'étape suivante). */
export function stepIssues(step: SetupStep, config: SetupConfig, content: SetupContent): SetupIssue[] {
  return validateSetup(config, content).filter((issue) => issueStep(issue) === step);
}

export function canAdvance(step: SetupStep, config: SetupConfig, content: SetupContent): boolean {
  return stepIssues(step, config, content).length === 0;
}
