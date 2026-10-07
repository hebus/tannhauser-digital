// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BoardBuilder, SeededRng, createInitialState, type CharacterState, type GameEvent, type GamePhase, type GameState } from '@tannhauser/core';
import type { BannerKind, BannerPlan } from '@tannhauser/renderer';
import { bannerText } from './banner-text';
import { EN, FR, setLocale, t } from './i18n';
import { createLabeler } from './labels';
import { PHASE_STEP_IDS, currentStepIndex, phaseContext, phaseModel, withoutLeadingName } from './phase-model';

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

  it('l’étape Initiative nomme le gagnant et donne son marqueur (index du joueur), sans afficher les jets (ils sont dans le journal)', () => {
    const base = game('OVERWATCH', { initiativePlayerId: 'p2' }, [char('h1', 'p1', 'a'), char('e1', 'p2', 'b')]);
    const s = { ...base, history: [{ type: 'TURN_STARTED', turn: 1 }, { type: 'INITIATIVE_ROLLED', rolls: { p1: 3, p2: 8 }, winnerId: 'p2' }] } as typeof base;
    const step = phaseModel(s, createLabeler(s)).steps.find((x) => x.id === 'initiative')!;
    expect(step.detail).toBe('Joueur 2 d’abord');
    expect(step.detail).not.toMatch(/jets|8/);
    expect(step.detailPlayerIndex).toBe(1);
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

const withRolls = (s: GameState): GameState =>
  ({ ...s, history: [{ type: 'TURN_STARTED', turn: 1 }, { type: 'INITIATIVE_ROLLED', rolls: { p1: 4, p2: 8 }, winnerId: 'p2' }] }) as GameState;
const subline = (s: GameState): string | null => phaseModel(s, createLabeler(s)).steps.find((x) => x.status === 'current')?.subline ?? null;

describe('bandeau : numéro de tour, sous-ligne, pastille d’initiative, capsules de PC', () => {
  it('numéro de tour : null avant le premier tour, sinon le numéro courant', () => {
    expect(phaseModel(game('SETUP', { number: 0 }), createLabeler(game('SETUP'))).turnNumber).toBeNull();
    expect(phaseModel(game('OVERWATCH', { number: 3 }), createLabeler(game('OVERWATCH'))).turnNumber).toBe(3);
  });

  it('sous-ligne : seulement sur l’étape courante, selon la phase', () => {
    expect(subline(game('REFRESH'))).toBe('PC rendus');
    expect(subline(game('INITIATIVE', { initiativePlayerId: null }))).toBe('Jet en cours');
    expect(subline(game('OVERWATCH', { activePlayerId: 'p1' }))).toBe('Joueur 1 décide');
    expect(subline(game('ACTIVATION', { activePlayerId: 'p2' }))).toBe('Joueur 2 joue');
    expect(subline(game('ACTIVATION', { activePlayerId: 'p1', reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' } }))).toBe('Joueur 2 décide');
    const s = game('OVERWATCH');
    expect(phaseModel(s, createLabeler(s)).steps.filter((x) => x.subline !== null).map((x) => x.id)).toEqual(['overwatch']);
    expect(phaseModel(game('FINISHED'), createLabeler(game('FINISHED'))).steps.every((x) => x.subline === null)).toBe(true);
    expect(phaseModel(game('SETUP'), createLabeler(game('SETUP'))).steps.every((x) => x.subline === null)).toBe(true);
  });

  it('numéros d’ordre des étapes : 1 à 4', () => {
    const s = game('OVERWATCH');
    expect(phaseModel(s, createLabeler(s)).steps.map((x) => x.number)).toEqual([1, 2, 3, 4]);
  });

  it('initiative : « à venir » avant le tirage, gagnant (sans les jets) ensuite, et pendant tout le tour', () => {
    for (const phase of ['SETUP', 'REFRESH'] as const) {
      const s = game(phase);
      expect(phaseModel(s, createLabeler(s)).initiative).toMatchObject({ decided: false, playerName: null, playerIndex: null });
    }
    for (const phase of ['OVERWATCH', 'ACTIVATION', 'END_OF_TURN'] as const) {
      const s = withRolls(game(phase));
      expect(phaseModel(s, createLabeler(s)).initiative).toEqual({ decided: true, playerIndex: 1, playerName: 'Joueur 2' });
    }
  });

  it('capsules de PC : PC, joueur actif, initiative, Overwatch posés et personnages à activer', () => {
    const chars = [
      char('h1', 'p1', 'a', { overwatch: true }),
      char('t1', 'p1', 'a', { activated: true }),
      char('dead', 'p1', 'a', { alive: false, overwatch: true }),
      char('e1', 'p2', 'b'),
      char('e2', 'p2', 'b'),
    ];
    const ow = game('OVERWATCH', { activePlayerId: 'p1' }, chars);
    const m = phaseModel(ow, createLabeler(ow));
    expect(m.players.map((p) => [p.name, p.pcText, p.active, p.initiative, p.overwatchCount, p.toActivateCount, p.stateText])).toEqual([
      ['Joueur 1', '2 PC', true, false, 1, 1, '1 en Overwatch'],
      ['Joueur 2', '2 PC', false, true, 0, 2, null],
    ]);
    const act = game('ACTIVATION', { activePlayerId: 'p2' }, chars);
    expect(phaseModel(act, createLabeler(act)).players.map((p) => [p.active, p.stateText])).toEqual([
      [false, '1 à activer · 1 en Overwatch'],
      [true, '2 à activer'],
    ]);
    const allDone = game('ACTIVATION', {}, [char('h1', 'p1', 'a', { activated: true }), char('e1', 'p2', 'b', { activated: true })]);
    expect(phaseModel(allDone, createLabeler(allDone)).players.map((p) => p.stateText)).toEqual(['tous activés', 'tous activés']);
  });

  it('capsules : réaction = le joueur qui répond est actif ; aucun état à la mise en place ni à la fin', () => {
    const reacting = game('ACTIVATION', { activePlayerId: 'p1', reaction: { overwatcherId: 'e1', targetId: 'h1', forPlayerId: 'p2' } });
    expect(phaseModel(reacting, createLabeler(reacting)).players.map((p) => p.active)).toEqual([false, true]);
    for (const phase of ['SETUP', 'FINISHED'] as const) {
      const s = game(phase);
      const m = phaseModel(s, createLabeler(s));
      expect(m.players.some((p) => p.active && phase === 'FINISHED')).toBe(false);
      expect(m.players.every((p) => p.stateText === null)).toBe(true);
    }
  });

  it('consigne : la phrase contextuelle sans le nom du joueur qui a la main', () => {
    expect(withoutLeadingName('Joueur 1 : activez un personnage', 'Joueur 1')).toBe('activez un personnage');
    expect(withoutLeadingName('Joueur 2 décide : Overwatch (1 PC) ou passer', 'Joueur 2')).toBe('décide : Overwatch (1 PC) ou passer');
    expect(withoutLeadingName('Fin du tour.', 'Joueur 1')).toBe('Fin du tour.');
    expect(withoutLeadingName('Fin du tour.', null)).toBe('Fin du tour.');
    const s = game('ACTIVATION', { activePlayerId: 'p1' });
    expect(phaseModel(s, createLabeler(s))).toMatchObject({ context: 'Joueur 1 : activez un personnage', instruction: 'activez un personnage', activePlayerName: 'Joueur 1' });
  });

  it('état par phase de SETUP à FINISHED : un modèle cohérent à chaque phase, en français et en anglais', () => {
    for (const locale of ['fr', 'en'] as const) {
      setLocale(locale);
      for (const phase of ['SETUP', 'REFRESH', 'INITIATIVE', 'OVERWATCH', 'ACTIVATION', 'END_OF_TURN', 'FINISHED'] as const) {
        const s = withRolls(game(phase));
        const m = phaseModel(s, createLabeler(s));
        expect(m.steps).toHaveLength(4);
        expect(m.players).toHaveLength(2);
        expect(m.context).not.toBe('');
        expect(JSON.stringify(m)).not.toMatch(/\{\w+\}|phase\.|status\./);
        expect(m.steps.filter((x) => x.subline !== null).length).toBe(m.currentId ? 1 : 0);
      }
    }
    setLocale('fr');
  });
});

describe('i18n du bandeau : clés françaises et anglaises identiques', () => {
  // Périmètre : bandeau des phases (`phase.*`). L'anglais complet des autres écrans n'est pas l'objet de ce test.
  it('mêmes clés phase.* dans FR et EN, mêmes paramètres, aucune valeur vide', () => {
    const own = (m: Record<string, string>): string[] => Object.keys(m).filter((k) => k.startsWith('phase.')).sort();
    expect(own(EN)).toEqual(own(FR));
    expect(own(FR).length).toBeGreaterThan(30);
    const params = (v: string): string[] => [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const key of own(FR)) {
      expect(FR[key]!.trim(), key).not.toBe('');
      expect(EN[key]!.trim(), key).not.toBe('');
      expect(params(EN[key]!), key).toEqual(params(FR[key]!));
    }
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
    // Victoire : sous-titre propre à la raison (drapeaux), générique sinon.
    expect(bannerText({ kind: 'victory', turn: 2, playerId: 'p1', reason: 'CTF_FLAGS_PLANTED' }, labels).subtitle).toBe('Joueur 1 a planté les drapeaux ennemis dans son camp');
    expect(bannerText({ kind: 'victory', turn: 2, playerId: 'p1', reason: 'DEATHMATCH_ELIMINATION' }, labels).subtitle).toBe('Joueur 1 remporte la partie');
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
