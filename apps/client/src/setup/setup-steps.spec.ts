import { describe, expect, it } from 'vitest';
import { defaultSetup, type SetupContent } from './setup-config';
import { canAdvance, issueStep, SETUP_STEPS, stepIssues } from './setup-steps';

const content: SetupContent = {
  boards: [{ id: 'b', board: { nodes: { n1: { id: 'n1', x: 0, y: 0, properties: { passable: true, kind: 'NORMAL' } }, n2: { id: 'n2', x: 1, y: 0, properties: { passable: true, kind: 'NORMAL' } } }, edges: [], doors: {}, portals: [] } as never }],
  characters: [
    { id: 'h1', factionId: 'f1', kind: 'HERO' },
    { id: 'h2', factionId: 'f2', kind: 'HERO' },
  ],
};

describe('étapes de la mise en place', () => {
  it('rattache chaque problème à l\'étape qui le corrige', () => {
    expect(issueStep({ code: 'UNKNOWN_BOARD' })).toBe('terrain');
    expect(issueStep({ code: 'MODE_UNSUPPORTED_BOARD' })).toBe('terrain');
    expect(issueStep({ code: 'TEAM_EMPTY' })).toBe('teams');
    expect(issueStep({ code: 'DUPLICATE_CHARACTER' })).toBe('teams');
    expect(issueStep({ code: 'BAD_SEED' })).toBe('terrain');
  });

  it('une configuration par défaut permet d\'avancer partout', () => {
    const config = defaultSetup(content, 1);
    for (const step of SETUP_STEPS) expect(canAdvance(step, config, content)).toBe(true);
  });

  it('une équipe vide bloque l\'étape des équipes mais pas le terrain', () => {
    const base = defaultSetup(content, 1);
    const config = { ...base, teams: [{ playerId: 'p1', characterIds: [] }, base.teams[1]!] };
    expect(canAdvance('terrain', config, content)).toBe(true);
    expect(canAdvance('teams', config, content)).toBe(false);
    expect(stepIssues('teams', config, content).map((i) => i.code)).toEqual(['TEAM_EMPTY']);
  });

  it("une graine invalide ne bloque que l'étape Terrain", () => {
    const config = { ...defaultSetup(content, 1), seed: Number.NaN };
    expect(canAdvance('teams', config, content)).toBe(true);
    expect(canAdvance('terrain', config, content)).toBe(false);
  });
});
