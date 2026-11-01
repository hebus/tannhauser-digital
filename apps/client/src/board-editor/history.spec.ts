import { describe, expect, it } from 'vitest';
import { commit, createHistory, HISTORY_LIMIT, isDirty, markSaved, redo, seal, undo } from './history';

describe('historique', () => {
  it('annuler puis rétablir', () => {
    const h = commit(commit(createHistory('a'), 'b'), 'c');
    expect(undo(h).present).toBe('b');
    expect(redo(undo(h)).present).toBe('c');
    expect(undo(undo(undo(h))).present).toBe('a');
  });

  it('une nouvelle modification efface ce qu’on pouvait rétablir', () => {
    const h = commit(undo(commit(createHistory('a'), 'b')), 'x');
    expect(h.future).toEqual([]);
    expect(redo(h).present).toBe('x');
  });

  it('les étapes d’un même geste fusionnent ; sceller sépare', () => {
    let h = commit(createHistory('a'), 'b', 'g1');
    h = commit(h, 'c', 'g1');
    expect(undo(h).present).toBe('a');
    h = commit(seal(h), 'd', 'g1');
    expect(undo(h).present).toBe('c');
  });

  it('aucun changement : aucune étape', () => {
    const h = createHistory('a');
    expect(commit(h, 'a')).toBe(h);
  });

  it('taille bornée', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });

  it('modifications non enregistrées', () => {
    const h = commit(createHistory('a'), 'b');
    expect(isDirty(h)).toBe(true);
    expect(isDirty(markSaved(h))).toBe(false);
    expect(isDirty(undo(markSaved(h)))).toBe(true);
  });
});
