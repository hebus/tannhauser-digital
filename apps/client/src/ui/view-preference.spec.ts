import { describe, expect, it } from 'vitest';
import { initialView, rememberView } from './view-preference';

const storage = (value: string | null) => ({ getItem: () => value });

describe('initialView', () => {
  it('2D par défaut', () => {
    expect(initialView('', storage(null))).toBe('2d');
    expect(initialView('', null)).toBe('2d');
  });
  it('le paramètre d’URL l’emporte sur le choix mémorisé', () => {
    expect(initialView('?view=3d', storage('2d'))).toBe('3d');
    expect(initialView('?view=2d', storage('3d'))).toBe('2d');
  });
  it('reprend le choix mémorisé en l’absence de paramètre', () => {
    expect(initialView('?demoBoard=castle', storage('3d'))).toBe('3d');
  });
  it('ignore une valeur inconnue (URL ou stockage)', () => {
    expect(initialView('?view=4d', storage('vr'))).toBe('2d');
  });
  it('un stockage qui lève une erreur n’empêche pas de démarrer', () => {
    const broken = { getItem: () => { throw new Error('bloqué'); } };
    expect(initialView('', broken)).toBe('2d');
  });
});

describe('rememberView', () => {
  it('écrit le choix, et ignore un stockage indisponible', () => {
    const saved: Record<string, string> = {};
    rememberView('3d', { setItem: (k, v) => void (saved[k] = v) });
    expect(saved['tannhauser.view']).toBe('3d');
    expect(() => rememberView('2d', null)).not.toThrow();
    expect(() => rememberView('2d', { setItem: () => { throw new Error('plein'); } })).not.toThrow();
  });
});
