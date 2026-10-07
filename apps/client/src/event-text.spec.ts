import { describe, expect, it } from 'vitest';
import { describeEvent } from './event-text';

describe('describeEvent : drapeaux', () => {
  it('pose, ramassage, dépôt et plantage ont un texte', () => {
    expect(describeEvent({ type: 'FLAG_PLACED', flagId: 'f1', ownerId: 'p1', nodeId: 'n1' })).toBe('Drapeau de p1 posé en n1.');
    expect(describeEvent({ type: 'FLAG_CAPTURED', flagId: 'f1', characterId: 'h', nodeId: 'n1' })).toBe('h récupère le drapeau f1 (n1).');
    expect(describeEvent({ type: 'FLAG_DROPPED', flagId: 'f1', characterId: 'h', nodeId: 'n2' })).toBe('h laisse tomber le drapeau f1 en n2.');
    expect(describeEvent({ type: 'FLAG_PLANTED', flagId: 'f1', characterId: 'h', playerId: 'p2', nodeId: 'e1' })).toBe('h plante le drapeau f1 dans le camp de p2 (e1).');
  });
});
