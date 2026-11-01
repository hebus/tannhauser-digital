import { describe, expect, it } from 'vitest';
import { diagnose, hasErrors } from './diagnostics';
import { hitTest } from './geometry';
import { commit, createHistory, undo } from './history';
import { newBoard, type EditorDoc, type Pt } from './model';
import { cancel, finishDraft, initialToolState, pointerDown, pointerMove, pointerUp, setTool, type Step, type ToolState } from './tools';

const input = (doc: EditorDoc, state: ToolState, world: Pt, extra: { shift?: boolean } = {}) => ({
  world,
  hit: hitTest(doc, world, { tolerance: 4, handles: state.selection?.kind === 'room' ? { kind: 'room' as const, id: state.selection.id } : null }),
  shift: extra.shift ?? false,
  alt: false,
  grid: 10,
  tolerance: 4,
});

/** Joue un clic (appui + relâchement au même point). */
function click(state: ToolState, doc: EditorDoc, world: Pt, extra: { shift?: boolean } = {}): Step {
  const down = pointerDown(state, doc, input(doc, state, world, extra));
  return pointerUp(down.state, down.doc, input(down.doc, down.state, world, extra));
}

describe('outils', () => {
  it('case : un clic ajoute une case sélectionnée ; un glisser la déplace en une seule étape d’historique', () => {
    let state = setTool(initialToolState(), 'node');
    let h = createHistory(newBoard('t'));
    let step = pointerDown(state, h.present, input(h.present, state, { x: 0, y: 0 }));
    h = commit(h, step.doc, step.key);
    step = pointerMove(step.state, h.present, input(h.present, step.state, { x: 33, y: 0 }));
    h = commit(h, step.doc, step.key);
    step = pointerMove(step.state, h.present, input(h.present, step.state, { x: 61, y: 0 }));
    h = commit(h, step.doc, step.key);
    state = pointerUp(step.state, h.present, input(h.present, step.state, { x: 61, y: 0 })).state;
    expect(h.present.nodes).toEqual([{ id: 'n1', x: 60, y: 0, colors: ['red'] }]);
    expect(state.selection).toEqual({ kind: 'nodes', ids: ['n1'] });
    expect(undo(h).present.nodes).toEqual([]);
  });

  it('relier en chaîne, Échap interrompt la chaîne', () => {
    let doc = newBoard('t');
    let state = setTool(initialToolState(), 'node');
    for (const x of [0, 100, 200]) ({ state, doc } = click(state, doc, { x, y: 0 }));
    state = setTool(state, 'connect');
    for (const x of [0, 100, 200]) ({ state, doc } = click(state, doc, { x, y: 0 }));
    expect(doc.edges).toEqual([{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }]);
    expect(state.pending).toBe('n3');
    expect(cancel(state).pending).toBeNull();
  });

  it('sélection au cadre (avec Maj pour ajouter), clic dans le vide pour tout désélectionner', () => {
    let doc = newBoard('t');
    let state = setTool(initialToolState(), 'node');
    for (const x of [0, 100, 300]) ({ state, doc } = click(state, doc, { x, y: 0 }));
    state = setTool(state, 'select');
    let step = pointerDown(state, doc, input(doc, state, { x: -50, y: -50 }));
    step = pointerMove(step.state, doc, input(doc, step.state, { x: 150, y: 50 }));
    state = pointerUp(step.state, doc, input(doc, step.state, { x: 150, y: 50 })).state;
    expect(state.selection).toEqual({ kind: 'nodes', ids: ['n1', 'n2'] });
    state = click(state, doc, { x: 300, y: 0 }, { shift: true }).state;
    expect(state.selection).toEqual({ kind: 'nodes', ids: ['n1', 'n2', 'n3'] });
    expect(click(state, doc, { x: 600, y: 600 }).state.selection).toBeNull();
  });

  it('pièce : clic près du premier sommet pour fermer ; couloir : Entrée', () => {
    let doc = newBoard('t');
    let state = setTool(initialToolState(), 'room');
    for (const p of [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 2, y: 1 }]) ({ state, doc } = click(state, doc, p));
    expect(doc.layout!.rooms[0]!.polygon).toHaveLength(3);
    expect(state.selection).toEqual({ kind: 'room', id: 'piece-1' });
    state = setTool(state, 'corridor');
    for (const p of [{ x: 200, y: 100 }, { x: 400, y: 100 }]) ({ state, doc } = click(state, doc, p));
    ({ state, doc } = finishDraft(state, doc));
    expect(doc.layout!.corridors[0]).toMatchObject({ id: 'couloir-1', width: 60 });
  });

  it('porte : un clic sur une arête pose puis retire la porte', () => {
    let doc: EditorDoc = { ...newBoard('t'), nodes: [{ id: 'a', x: 0, y: 0, colors: ['red'] }, { id: 'b', x: 100, y: 0, colors: ['red'] }], edges: [{ from: 'a', to: 'b' }] };
    let state = setTool(initialToolState(), 'door');
    ({ state, doc } = click(state, doc, { x: 50, y: 0 }));
    expect(doc.edges[0]!.doorId).toBe('door1');
    ({ state, doc } = click(state, doc, { x: 50, y: 0 }));
    expect(doc.doors).toEqual([]);
  });
});

describe('diagnostics', () => {
  it('plateau vide : erreur du moteur, enregistrement impossible', () => {
    const d = diagnose(newBoard('t'));
    expect(d.map((x) => x.code)).toContain('EMPTY_BOARD');
    expect(hasErrors(d)).toBe(true);
  });

  it('case isolée : erreur qui désigne la case', () => {
    const doc: EditorDoc = { ...newBoard('t'), nodes: [{ id: 'a', x: 0, y: 0, colors: ['red'] }, { id: 'zz', x: 100, y: 0, colors: ['red'] }] };
    const orphan = diagnose(doc).find((x) => x.code === 'ORPHAN_NODE');
    expect(orphan?.nodeIds.length).toBeGreaterThan(0);
  });

  it('plateau valide : avertissements seulement (peu de cases, pas d’entrées, pas de drapeau, case hors du plan)', () => {
    const doc: EditorDoc = {
      ...newBoard('t'),
      nodes: [{ id: 'a', x: 0, y: 0, colors: ['red'] }, { id: 'b', x: 100, y: 0, colors: ['red'] }],
      edges: [{ from: 'a', to: 'b' }],
      layout: { rooms: [{ id: 'salle', polygon: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }] }], corridors: [] },
    };
    const d = diagnose(doc, () => false);
    expect(hasErrors(d)).toBe(false);
    expect(d.map((x) => x.code)).toEqual(expect.arrayContaining(['FEW_NODES', 'NO_ENTRIES', 'NO_CTF', 'OUTSIDE_LAYOUT', 'UNTRANSLATED']));
    expect(d.find((x) => x.code === 'OUTSIDE_LAYOUT')!.nodeIds).toEqual(['b']);
  });
});
