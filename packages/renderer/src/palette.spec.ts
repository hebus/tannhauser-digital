import { describe, expect, it } from 'vitest';
import { buildColorMap } from './palette';

describe('buildColorMap', () => {
  it('donne une teinte distincte à chaque id de couleur', () => {
    const ids = Array.from({ length: 18 }, (_, i) => `c.zone-${i}`);
    const map = buildColorMap([...ids, 'red', ...ids]);
    expect(new Set([...map.values()]).size).toBe(map.size);
    expect(map.get('red')).toBe(0xe5484d);
  });

  it('est stable quel que soit l’ordre des ids', () => {
    expect(buildColorMap(['b', 'a']).get('a')).toBe(buildColorMap(['a', 'b']).get('a'));
  });
});
