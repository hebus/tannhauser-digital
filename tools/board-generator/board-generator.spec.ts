import { describe, expect, it } from 'vitest';
import { GeneratorError, generateBoard, serializeBoard, type BoardSpec } from './board-generator';
import { castleSpec } from './castle.map';
import committedText from '../../packages/content/src/data/castle-board.json?raw';

/** Spec minimale valide : deux pièces carrées reliées par un couloir coudé. */
const square = (id: string, x: number, y: number) => ({
  id,
  nameKey: `room.${id}`,
  color: `r.${id}`,
  polygon: [
    { x, y },
    { x: x + 200, y },
    { x: x + 200, y: y + 200 },
    { x, y: y + 200 },
  ],
  pitch: 100,
  origin: { x: x + 100, y: y + 100 },
});

const small = (): BoardSpec => ({
  id: 'small',
  nameKey: 'board.small.name',
  rooms: [square('a', 0, 0), square('b', 400, 0)],
  corridors: [
    {
      id: 'cor',
      width: 40,
      points: [
        { x: 210, y: 100 },
        { x: 300, y: 160 },
        { x: 390, y: 100 },
      ],
      colors: ['c.1', 'c.2'],
      from: { room: 'a', door: 'd1' },
      to: { room: 'b' },
    },
  ],
  doors: [{ id: 'd1', type: 'WOODEN', state: 'CLOSED' }],
});

describe('générateur de plateaux', () => {
  it('produit un plateau valide à partir d\'une spec minimale', () => {
    const json = generateBoard(small());
    expect(json.id).toBe('small');
    expect(json.nodes.length).toBeGreaterThan(2);
    expect(json.doors).toEqual([{ id: 'd1', type: 'WOODEN', state: 'CLOSED' }]);
    expect(json.layout!.rooms.map((r) => r.id)).toEqual(['a', 'b']);
    // Le couloir est prolongé jusqu'aux seuils des pièces.
    expect(json.layout!.corridors[0]!.points.length).toBe(5);
  });

  it('est déterministe : deux générations donnent exactement le même texte', () => {
    expect(serializeBoard(generateBoard(castleSpec))).toBe(serializeBoard(generateBoard(castleSpec)));
    expect(serializeBoard(generateBoard(small()))).toBe(serializeBoard(generateBoard(small())));
  });

  it('ne dépend pas de l\'ordre de déclaration des pièces (ids et tri stables)', () => {
    const spec = small();
    const reversed: BoardSpec = { ...spec, rooms: [...spec.rooms].reverse() };
    const a = generateBoard(spec);
    const b = generateBoard(reversed);
    expect(b.nodes).toEqual(a.nodes);
    expect(b.edges).toEqual(a.edges);
  });

  it('sa sortie est IDENTIQUE au JSON committé (non-dérive : relancer npm run generate:boards sinon)', () => {
    expect(serializeBoard(generateBoard(castleSpec))).toBe(committedText.replace(/\r\n/g, '\n'));
  });

  it('couleurs : pièce partout, seuil bicolore, coudes bicolores', () => {
    const json = generateBoard(small());
    const colors = Object.fromEntries(json.nodes.map((n) => [n.id, n.colors]));
    expect(colors['cor-02']).toEqual(['c.1', 'c.2']);
    expect(Object.entries(colors).filter(([id]) => id.startsWith('a-') && colors[id]!.includes('c.1'))).toHaveLength(1);
    expect(json.nodes.filter((n) => n.zoneId === 'a').every((n) => n.colors.includes('r.a'))).toBe(true);
  });

  describe('échoue sur une spec invalide', () => {
    const fails = (spec: BoardSpec, pattern: RegExp) => {
      expect(() => generateBoard(spec)).toThrow(GeneratorError);
      expect(() => generateBoard(spec)).toThrow(pattern);
    };

    it('nombre de couleurs de couloir incohérent', () => {
      const spec = small();
      fails({ ...spec, corridors: [{ ...spec.corridors[0]!, colors: ['c.1'] }] }, /couleur/);
    });

    it('pièce ou porte inconnue, porte inutilisée', () => {
      const spec = small();
      fails({ ...spec, corridors: [{ ...spec.corridors[0]!, to: { room: 'zzz' } }] }, /pièce inconnue/);
      fails({ ...spec, doors: [] }, /porte inconnue/);
      fails({ ...spec, doors: [...spec.doors!, { id: 'd2', type: 'WOODEN', state: 'OPEN' }] }, /portée par aucun couloir/);
    });

    it('pièce sans case, couloir trop loin de sa pièce', () => {
      const spec = small();
      fails({ ...spec, rooms: [{ ...spec.rooms[0]!, pitch: 1000 }, spec.rooms[1]!] }, /aucune case|trop loin/);
      fails({ ...spec, corridors: [{ ...spec.corridors[0]!, points: [{ x: 210, y: 900 }, { x: 300, y: 960 }, { x: 390, y: 900 }] }] }, /trop loin/);
    });

    it('plateau non relié (pièce isolée) refusé par validateBoard du moteur', () => {
      const spec = small();
      fails({ ...spec, rooms: [...spec.rooms, square('c', 0, 800)] }, /UNREACHABLE_AREA|ORPHAN_NODE/);
    });

    it('plus de 3 couleurs sur un nœud refusé par validateBoard du moteur', () => {
      const spec = small();
      const extra = (id: string, colors: [string, string]) => ({ ...spec.corridors[0]!, id, colors, from: { room: 'a' } as const, to: { free: true } as const });
      fails({ ...spec, doors: [], corridors: [{ ...spec.corridors[0]!, from: { room: 'a' } }, extra('cor2', ['c.3', 'c.4']), extra('cor3', ['c.5', 'c.6'])] }, /BAD_COLOR_COUNT/);
    });

    it('case spéciale, portail ou sens unique introuvables', () => {
      const spec = small();
      fails({ ...spec, marks: [{ at: { x: 5000, y: 5000 }, kind: 'ENTRY_POINT' }] }, /aucun nœud/);
      fails({ ...spec, portals: [{ id: 'p', from: { x: 100, y: 100 }, to: { x: 9000, y: 9000 } }] }, /aucun nœud/);
      fails({ ...spec, oneWays: [{ from: { x: 100, y: 100 }, to: { x: 500, y: 100 } }] }, /aucune arête/);
    });

    it('identifiants de pièces dupliqués', () => {
      const spec = small();
      fails({ ...spec, rooms: [spec.rooms[0]!, spec.rooms[0]!] }, /dupliqué/);
    });
  });
});
