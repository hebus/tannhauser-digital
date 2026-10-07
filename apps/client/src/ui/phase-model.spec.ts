// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BoardBuilder, SeededRng, createInitialState, type CharacterState, type GameEvent, type GamePhase, type GameState } from '@tannhauser/core';
import type { BannerKind, BannerPlan } from '@tannhauser/renderer';
import { bannerText } from './banner-text';
import { EN, FR, setLocale, t } from './i18n';
import { createLabeler } from './labels';
import { PHASE_STEP_IDS, currentStepIndex, phaseContext, phaseModel } from './phase-model';

const rows = [{ combat: 7, physical: 5, mental: 5, movement: 4 }];
const char = (id: string, playerId: string, nodeId: string, extra: Partial<CharacterState> = {}): CharacterState => ({
  id, definitionId: id, playerId, nodeId, health: 1, statRows: rows, alive: true, activated: false, movementLeft: 4, ...extra,
});

function game(phase: GamePhase, turn: Partial<GameState['turn']> = {}, characters: CharacterState[] = [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')]): GameState {
  const board = new BoardBuilder().node('a', ['r']).node('b', ['g']).edge('a', 'b').build();
  const base = createInitialState({
    gameId: 'g', scenarioId: 's', board,
    players: [{ id: 'p1', factionId: 'x', commandPoints: 2 }, { id: 'p2', factionId: 'y', commandPoints: 2 }],
    characters,
    rng: new SeededRng(1).snapshot(),
  });
  return { ...base, phase, turn: { number: 1, initiativePlayerId: 'p2', activePlayerId: 'p2', ...turn } };
}

setLocale('fr');
const statuses = (s: GameState, recent: GameEvent[] = []) => phaseModel(s, createLabeler(s), recent).steps.map((x) => `${x.id}:${x.status}`);

describe('frise des phases : étapes déduites de GameState.phase', () => {
  it('ordre réel du tour : refresh, initiative, overwatch, activation', () => {
    expect(PHASE_STEP_IDS).toEqual(['refresh', 'initiative', 'overwatch', 'activation']);
  });

  it('phase d’Overwatch : refresh et initiative passées, Overwatch en cours, activation à venir', () => {
    const m = phaseModel(game('OVERWATCH'), createLabeler(game('OVERWATCH')));
    expect(statuses(game('OVERWATCH'))).toEqual(['refresh:done', 'initiative:done', 'overwatch:current', 'activation:upcoming']);
    expect(m.currentId).toBe('overwatch');
    expect(m.steps.find((x) => x.status === 'current')?.statusText).toBe('en cours');
  });

  it('phase d’activation : trois premières passées, activation en cours', () => {
    expect(statuses(game('ACTIVATION'))).toEqual(['refresh:done', 'initiative:done', 'overwatch:done', 'activation:current']);
  });

  it('phases transitoires, fin de tour, partie terminée, mise en place', () => {
    expect(statuses(game('REFRESH'))).toEqual(['refresh:current', 'initiative:upcoming', 'overwatch:upcoming', 'activation:upcoming']);
    expect(statuses(game('INITIATIVE'))).toEqual(['refresh:done', 'initiative:current', 'overwatch:upcoming', 'activation:upcoming']);
    expect(statuses(game('END_OF_TURN')).every((s) => s.endsWith(':done'))).toBe(true);
    expect(phaseModel(game('FINISHED'), createLabeler(game('FINISHED'))).currentId).toBeNull();
    expect(statuses(game('SETUP')).every((s) => s.endsWith(':upcoming'))).toBe(true);
    expect(currentStepIndex(game('SETUP'))).toBe(-1);
  });

  it('un seul état « en cours » à la fois et jamais de texte vide (pas que la couleur)', () => {
    for (const phase of ['SETUP', 'REFRESH', 'INITIATIVE', 'OVERWATCH', 'ACTIVATION', 'END_OF_TURN', 'FINISHED'] as const) {
      const s = game(phase);
      const m = phaseModel(s, createLabeler(s));
      expect(m.steps.filter((x) => x.status === 'current').length).toBeLessThanOrEqual(1);
      for (const step of m.steps) {
        expect(step.label).not.toBe('');
        expect(step.icon).not.toBe('');
        expect(step.statusText).not.toBe('');
      }
    }
  });

  it('précisions lues dans l’état : joueur d’initiative, Overwatch posés ; fresh d’après les événements récents', () => {
    const s = game('OVERWATCH', { initiativePlayerId: 'p2' }, [char('h1', 'p1', 'a', { overwatch: true }), char('e1', 'p2', 'b')]);
    const m = phaseModel(s, createLabeler(s), [{ type: 'INITIATIVE_ROLLED', rolls: {}, winnerId: 'p2' }]);
    expect(m.steps.find((x) => x.id === 'initiative')).toMatchObject({ detail: 'Joueur 2 d’abord', fresh: true });
    expect(m.steps.find((x) => x.id === 'overwatch')).toMatchObject({ detail: '1 en Overwatch', fresh: false });
    expect(m.steps.find((x) => x.id === 'activation')?.detail).toBeNull();
  });
});

describe('ligne contextuelle', () => {
  it('Overwatch : qui décide et le coût ; activation : choisir ou personnage activé', () => {
    const ow = game('OVERWATCH', { activePlayerId: 'p2' });
    expect(phaseContext(ow, createLabeler(ow))).toBe('Joueur 2 décide : Overwatch (1 PC) ou passer');
    const act = game('ACTIVATION', { activePlayerId: 'p1' });
    expect(phaseContext(act, createLabeler(act))).toBe('Joueur 1 : activez un personnage');
    const acting = game('ACTIVATION', { activePlayerId: 'p1', activeCharacterId: 'h1' });
    expect(phaseContext(acting, createLabeler(acting))).toBe('Joueur 1 : h1 est activé');
  });

  it('réaction en attente : le joueur qui répond ; partie terminée : le vainqueur', () => {
    const reacting = game('ACTIVATION', { activePlayerId: 'p1', reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' } });
    expect(phaseContext(reacting, createLabeler(reacting))).toContain('Joueur 2 décide : tirer ou refuser');
    expect(phaseModel(reacting, createLabeler(reacting)).activePlayerIndex).toBe(1);
    const done = { ...game('FINISHED'), victory: { winnerId: 'p1', reason: 'x' } };
    expect(phaseContext(done, createLabeler(done))).toBe('Partie terminée : victoire de Joueur 1');
    expect(phaseModel(done, createLabeler(done)).activePlayerIndex).toBeNull();
  });

  it('joueur actif : index dans la liste des joueurs', () => {
    const s = game('ACTIVATION', { activePlayerId: 'p1' });
    expect(phaseModel(s, createLabeler(s)).activePlayerIndex).toBe(0);
  });
});

describe('textes des bannières et i18n des nouveaux libellés', () => {
  const s = game('ACTIVATION');
  const labels = createLabeler(s);
  const kinds: readonly BannerKind[] = ['victory', 'turnStart', 'reaction', 'overwatchPhase', 'activationPhase', 'turnOf'];

  it('titre + sous-titre non vides pour chaque type, en français et en anglais', () => {
    for (const locale of ['fr', 'en'] as const) {
      setLocale(locale);
      for (const kind of kinds) {
        const plan: BannerPlan = { kind, turn: 3, playerId: 'p1', overwatcherId: 'h1', targetId: 'e1' };
        const text = bannerText(plan, labels);
        expect(text.title.trim()).not.toBe('');
        expect(text.subtitle.trim()).not.toBe('');
        expect(`${text.title}${text.subtitle}`).not.toMatch(/\{\w+\}|banner\./);
      }
    }
    setLocale('fr');
  });

  it('contenu attendu en français', () => {
    expect(bannerText({ kind: 'turnStart', turn: 2, playerId: 'p1' }, labels)).toEqual({ title: 'Tour 2', subtitle: 'Joueur 1 commence' });
    expect(bannerText({ kind: 'overwatchPhase', turn: 2, playerId: 'p2' }, labels)).toEqual({
      title: 'Phase d’Overwatch',
      subtitle: 'Joueur 2, placez un personnage ou passez',
    });
    expect(bannerText({ kind: 'reaction', turn: 2, playerId: 'p2', overwatcherId: 'e1', targetId: 'h1' }, labels).title).toBe('Overwatch !');
    expect(bannerText({ kind: 'turnStart', turn: 2, playerId: null }, labels).subtitle).toBe('Nouveau tour');
  });

  it('chaque nouvelle clé existe en français ET en anglais, avec les mêmes paramètres', () => {
    const fresh = Object.keys(FR).filter((k) => /^(phase|banner)\./.test(k) || k === 'status.playing');
    expect(fresh.length).toBeGreaterThan(30);
    const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const key of fresh) {
      expect(EN[key], key).toBeTruthy();
      expect(params(EN[key]!), key).toEqual(params(FR[key]!));
    }
    for (const id of PHASE_STEP_IDS) expect(t(`phase.${id}`, undefined, 'en')).not.toBe(`phase.${id}`);
  });
});
