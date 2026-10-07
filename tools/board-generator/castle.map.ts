import type { BoardSpec } from './board-generator';

/**
 * Carte « Château » : hall central, salle d'armes, bibliothèque, cuisine, chapelle, cour ; couloirs diagonaux.
 * Repère : x vers la droite, y vers le bas ; le sud (cour, grande porte) est en bas, la poterne au nord-est.
 *
 * Convention de couleurs : une couleur par pièce (`r.*`), une couleur par segment de couloir (`c.*`) ;
 * le seuil (case de la pièce côté couloir) porte la couleur de la pièce ET celle du couloir ; les coudes portent les
 * deux couleurs des segments voisins : on voit donc le long d'un segment mais jamais à travers un coude ni un mur.
 *
 * (Fichier de données du générateur — pas un test Vitest : d'où le nom `castle.map.ts` et non `castle.spec.ts`.)
 */
export const castleSpec: BoardSpec = {
  id: 'castle',
  nameKey: 'board.castle.name',
  rooms: [
    {
      id: 'hall',
      nameKey: 'room.hall',
      color: 'r.hall',
      fill: '#5b4a3a',
      polygon: [
        { x: 470, y: 360 },
        { x: 730, y: 360 },
        { x: 840, y: 500 },
        { x: 730, y: 640 },
        { x: 470, y: 640 },
        { x: 360, y: 500 },
      ],
      origin: { x: 600, y: 500 },
      pitch: 110,
    },
    {
      id: 'armurerie',
      nameKey: 'room.armurerie',
      color: 'r.armurerie',
      fill: '#4a4f57',
      polygon: [
        { x: 310, y: 570 },
        { x: 100, y: 540 },
        { x: 70, y: 710 },
        { x: 270, y: 750 },
      ],
      cells: [
        { x: 140, y: 600 },
        { x: 240, y: 610 },
        { x: 150, y: 690 },
        { x: 250, y: 690 },
      ],
    },
    {
      id: 'bibliotheque',
      nameKey: 'room.bibliotheque',
      color: 'r.bibliotheque',
      fill: '#4b3f55',
      polygon: [
        { x: 110, y: 100 },
        { x: 320, y: 90 },
        { x: 340, y: 260 },
        { x: 120, y: 290 },
      ],
      cells: [
        { x: 160, y: 150 },
        { x: 260, y: 140 },
        { x: 170, y: 240 },
        { x: 270, y: 230 },
      ],
    },
    {
      id: 'cuisine',
      nameKey: 'room.cuisine',
      color: 'r.cuisine',
      fill: '#5a4437',
      polygon: [
        { x: 890, y: 570 },
        { x: 1100, y: 540 },
        { x: 1130, y: 710 },
        { x: 930, y: 750 },
      ],
      cells: [
        { x: 960, y: 610 },
        { x: 1060, y: 600 },
        { x: 950, y: 690 },
        { x: 1050, y: 690 },
      ],
    },
    {
      id: 'chapelle',
      nameKey: 'room.chapelle',
      color: 'r.chapelle',
      fill: '#4a5560',
      polygon: [
        { x: 1090, y: 100 },
        { x: 880, y: 90 },
        { x: 860, y: 260 },
        { x: 1080, y: 290 },
      ],
      cells: [
        { x: 1040, y: 150 },
        { x: 940, y: 140 },
        { x: 1030, y: 240 },
        { x: 930, y: 230 },
      ],
    },
    {
      id: 'cour',
      nameKey: 'room.cour',
      color: 'r.cour',
      fill: '#3f5240',
      polygon: [
        { x: 430, y: 880 },
        { x: 770, y: 880 },
        { x: 880, y: 1100 },
        { x: 320, y: 1100 },
      ],
      cells: [
        { x: 500, y: 940 },
        { x: 600, y: 940 },
        { x: 700, y: 940 },
        { x: 450, y: 1040 },
        { x: 550, y: 1040 },
        { x: 650, y: 1040 },
        { x: 750, y: 1040 },
      ],
    },
  ],
  corridors: [
    {
      id: 'cor-ouest',
      width: 60,
      points: [
        { x: 350, y: 530 },
        { x: 325, y: 580 },
        { x: 290, y: 620 },
      ],
      colors: ['c.ouest-a', 'c.ouest-b'],
      from: { room: 'hall', door: 'door-hall-ouest' },
      to: { room: 'armurerie' },
    },
    {
      id: 'cor-nord-ouest',
      width: 60,
      points: [
        { x: 440, y: 340 },
        { x: 390, y: 280 },
        { x: 340, y: 235 },
      ],
      colors: ['c.nord-ouest-a', 'c.nord-ouest-b'],
      from: { room: 'hall', door: 'door-hall-nord-ouest' },
      to: { room: 'bibliotheque' },
    },
    {
      id: 'cor-nord-est',
      width: 60,
      points: [
        { x: 760, y: 340 },
        { x: 810, y: 280 },
        { x: 860, y: 235 },
      ],
      colors: ['c.nord-est-a', 'c.nord-est-b'],
      from: { room: 'hall', door: 'door-hall-nord-est' },
      to: { room: 'chapelle' },
    },
    {
      id: 'cor-est',
      width: 60,
      points: [
        { x: 850, y: 530 },
        { x: 875, y: 580 },
        { x: 910, y: 620 },
      ],
      colors: ['c.est-a', 'c.est-b'],
      from: { room: 'hall', door: 'door-hall-est' },
      to: { room: 'cuisine' },
    },
    {
      id: 'cor-sud',
      width: 60,
      points: [
        { x: 600, y: 700 },
        { x: 660, y: 780 },
        { x: 570, y: 860 },
      ],
      colors: ['c.sud-a', 'c.sud-b'],
      from: { room: 'hall', door: 'door-hall-sud' },
      to: { room: 'cour' },
    },
    {
      id: 'cor-poterne',
      width: 50,
      points: [
        { x: 1110, y: 140 },
        { x: 1150, y: 90 },
        { x: 1190, y: 50 },
      ],
      colors: ['c.poterne-a', 'c.poterne-b'],
      from: { room: 'chapelle', door: 'door-poterne' },
      to: { free: true },
    },
  ],
  doors: [
    { id: 'door-hall-ouest', type: 'REINFORCED', state: 'CLOSED' },
    { id: 'door-hall-nord-ouest', type: 'WOODEN', state: 'OPEN' },
    { id: 'door-hall-nord-est', type: 'WOODEN', state: 'CLOSED' },
    { id: 'door-hall-est', type: 'WOODEN', state: 'OPEN' },
    { id: 'door-hall-sud', type: 'WOODEN', state: 'OPEN' },
    { id: 'door-poterne', type: 'REINFORCED', state: 'OPEN' },
  ],
  marks: [
    // Grande porte (sud, dans la cour) et poterne (nord-est, bout du couloir) : points d'entrée des deux équipes.
    { at: { x: 550, y: 1040 }, kind: 'ENTRY_POINT' },
    { at: { x: 1190, y: 50 }, kind: 'ENTRY_POINT' },
    // Puits de la cour : case impraticable.
    { at: { x: 700, y: 940 }, passable: false },
    // Gravats dans la cuisine : +1 PM pour y entrer.
    { at: { x: 950, y: 690 }, movementCostModifier: 1 },
  ],
  // Passage secret bibliothèque ↔ chapelle (1 PM, ne donne pas de ligne de vue).
  portals: [{ id: 'portal-secret', from: { x: 170, y: 240 }, to: { x: 1030, y: 240 } }],
  // Escalier à sens unique : de la bibliothèque vers le hall seulement (la vue l'ignore).
  oneWays: [{ from: { x: 340, y: 235 }, to: { x: 390, y: 280 } }],
};
