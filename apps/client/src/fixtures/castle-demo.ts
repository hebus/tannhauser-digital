import { SeededRng, applyCommand, createInitialState, defaultNodeProperties, type BoardEdge, type BoardNode, type BoardState, type NodeProperties } from '@tannhauser/core';
import { createCharacterState, loadDevContent } from '@tannhauser/content';
import type { BoardLayout } from '@tannhauser/renderer';
import { GameFacade } from '../game-facade';

/**
 * Plateau de démonstration NON ORTHOGONAL (château) pour valider le rendu par mise en page : trois pièces (dont une
 * en L), des couloirs en diagonale ou à coude, quatre portes (bois/renforcée, ouverte/fermée), un portail et un sens
 * unique. Outil de débogage : activé uniquement en développement par `?demoBoard=castle` (voir `main.ts`).
 */
const node = (id: string, x: number, y: number, colors: string[], props: Partial<NodeProperties> = {}): BoardNode => ({
  id,
  x,
  y,
  colors,
  properties: { ...defaultNodeProperties, ...props },
});

const nodeList: BoardNode[] = [
  // Grande salle (rectangle)
  node('a1', 60, 60, ['red'], { kind: 'ENTRY_POINT' }),
  node('a2', 150, 60, ['red', 'blue']),
  node('a4', 60, 150, ['green']),
  node('a5', 150, 150, ['red', 'green']),
  node('a3', 240, 130, ['blue']),
  node('h4', 150, 200, ['yellow']),
  // Bibliothèque (en L)
  node('b1', 70, 410, ['purple']),
  node('b2', 150, 410, ['purple', 'blue']),
  node('b3', 235, 410, ['orange']),
  node('b4', 70, 520, ['yellow', 'green']),
  node('b5', 80, 630, ['red'], { passable: false }),
  // Couloirs
  node('k1', 360, 130, ['green']),
  node('k2', 575, 195, ['orange', 'purple'], { movementCostModifier: 1 }),
  node('k3', 700, 260, ['blue']),
  node('m1', 150, 300, ['yellow', 'red']),
  node('q1', 360, 485, ['red']),
  node('q2', 620, 560, ['green', 'orange', 'blue']),
  node('q3', 780, 560, ['purple']),
  node('q4', 900, 560, ['yellow']),
  // Crypte (polygone irrégulier)
  node('c1', 880, 160, ['orange']),
  node('c2', 1000, 120, ['blue', 'purple']),
  node('c3', 1120, 200, ['red'], { kind: 'ENTRY_POINT' }),
  node('c4', 1050, 300, ['green']),
  node('c5', 975, 380, ['yellow']),
  node('c6', 830, 260, ['purple']),
  node('c7', 1000, 230, ['orange', 'red'], { kind: 'OBJECTIVE' }),
];

const edges: BoardEdge[] = [
  { from: 'a1', to: 'a2' },
  { from: 'a1', to: 'a4' },
  { from: 'a2', to: 'a5' },
  { from: 'a4', to: 'a5' },
  { from: 'a5', to: 'a3' },
  { from: 'a5', to: 'h4' },
  { from: 'a3', to: 'k1', doorId: 'door.hall-east' },
  { from: 'k1', to: 'k2' },
  { from: 'k2', to: 'k3' },
  { from: 'k3', to: 'c6' },
  { from: 'h4', to: 'm1', doorId: 'door.hall-south' },
  { from: 'm1', to: 'b2' },
  { from: 'b1', to: 'b2' },
  { from: 'b2', to: 'b3' },
  { from: 'b1', to: 'b4' },
  { from: 'b2', to: 'b4' },
  { from: 'b4', to: 'b5' },
  { from: 'b3', to: 'q1', doorId: 'door.library-east' },
  { from: 'q1', to: 'q2' },
  { from: 'q2', to: 'q3', oneWay: true },
  { from: 'q3', to: 'q4' },
  { from: 'q4', to: 'c5', doorId: 'door.crypt-south' },
  { from: 'c6', to: 'c1' },
  { from: 'c1', to: 'c2' },
  { from: 'c2', to: 'c3' },
  { from: 'c3', to: 'c4' },
  { from: 'c4', to: 'c5' },
  { from: 'c5', to: 'c6' },
  { from: 'c6', to: 'c7' },
  { from: 'c7', to: 'c2' },
  { from: 'c7', to: 'c4' },
];

export const castleDemoBoard: BoardState = {
  nodes: Object.fromEntries(nodeList.map((n) => [n.id, n])),
  edges,
  doors: {
    'door.hall-east': { id: 'door.hall-east', type: 'REINFORCED', state: 'OPEN' },
    'door.hall-south': { id: 'door.hall-south', type: 'WOODEN', state: 'CLOSED' },
    'door.library-east': { id: 'door.library-east', type: 'WOODEN', state: 'OPEN' },
    'door.crypt-south': { id: 'door.crypt-south', type: 'REINFORCED', state: 'CLOSED' },
  },
  portals: [{ id: 'portal.secret', from: 'a1', to: 'c1', type: 'SECRET_DOOR' }],
};

export const castleDemoLayout: BoardLayout = {
  rooms: [
    {
      id: 'room.hall',
      nameKey: 'Grand hall',
      polygon: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 250 },
        { x: 0, y: 250 },
      ],
      fill: '#3e63dd',
    },
    {
      // Pièce en L : branche horizontale en haut, branche verticale à gauche.
      id: 'room.library',
      nameKey: 'Library',
      polygon: [
        { x: 0, y: 340 },
        { x: 300, y: 340 },
        { x: 300, y: 480 },
        { x: 160, y: 480 },
        { x: 160, y: 700 },
        { x: 0, y: 700 },
      ],
      fill: '#8e4ec6',
    },
    {
      id: 'room.crypt',
      nameKey: 'Crypt',
      polygon: [
        { x: 800, y: 100 },
        { x: 1100, y: 60 },
        { x: 1250, y: 250 },
        { x: 1150, y: 450 },
        { x: 850, y: 430 },
        { x: 750, y: 260 },
      ],
      fill: '#e5484d',
    },
  ],
  corridors: [
    { id: 'corridor.east', width: 70, points: [{ x: 240, y: 130 }, { x: 500, y: 130 }, { x: 650, y: 260 }, { x: 830, y: 260 }] },
    { id: 'corridor.south', width: 70, points: [{ x: 150, y: 200 }, { x: 150, y: 410 }] },
    {
      id: 'corridor.low',
      width: 70,
      points: [{ x: 235, y: 410 }, { x: 360, y: 485 }, { x: 500, y: 560 }, { x: 900, y: 560 }, { x: 975, y: 380 }],
    },
  ],
};

/** Partie de démonstration sur le plateau du château (héros/troupes du contenu de développement). */
export function createCastleDemoFacade(seed = 1): GameFacade {
  const content = loadDevContent();
  const rng = new SeededRng(seed);
  const def = (id: string) => content.characters.find((c) => c.id === id)!;
  const place = (id: string, playerId: string, nodeId: string) => createCharacterState(def(id), content.weapons, { playerId, nodeId });
  const initial = createInitialState({
    gameId: `castle-demo-${seed}`,
    scenarioId: 'castle-demo',
    board: castleDemoBoard,
    players: [
      { id: 'p1', factionId: 'faction.alpha', commandPoints: 0 },
      { id: 'p2', factionId: 'faction.beta', commandPoints: 0 },
    ],
    characters: [
      place('char.alpha.hero', 'p1', 'a1'),
      place('char.alpha.troop', 'p1', 'a2'),
      place('char.beta.hero', 'p2', 'c3'),
      place('char.beta.troop', 'p2', 'c4'),
    ],
    rng: rng.snapshot(),
  });
  const started = applyCommand(initial, { type: 'START_GAME' }, rng);
  const facade = new GameFacade(started.state, seed);
  facade.layout = castleDemoLayout;
  return facade;
}
