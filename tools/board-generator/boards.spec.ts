import { describe, expect, it } from 'vitest';
import { GENERATED_BOARDS } from '@tannhauser/content';
import { BOARDS } from './boards';

describe('liste des plateaux générés', () => {
  it('le générateur et l’éditeur de plateaux connaissent les mêmes plateaux générés', () => {
    expect(BOARDS.map((b) => ({ id: b.spec.id, file: b.output }))).toEqual(GENERATED_BOARDS);
  });
});
