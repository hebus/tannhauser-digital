import type { BoardSpec, CorridorSpec, DoorSpec, MarkSpec, Pt, RoomSpec } from './board-generator';

/**
 * Carte « Manoir » : plateau carré (≈ 1750 × 1750 après écartement des pièces) inspiré du plateau d'origine du jeu de société (vue de dessus d'un
 * manoir) : rangée de pièces au nord, grand hall, chambre, salle carrelée, couloir central nord-sud, salon et salle à
 * manger à l'est, cabinets et cave au sud, rotonde au sud-est. Repère : x vers la droite, y vers le bas.
 *
 * Le dessin d'origine (cercles de cases) n'est PAS reproduit : seules les pièces et leurs liaisons le sont, sous forme
 * de grilles régulières (pas de 70). Les cases sont posées par `room()` et les passages (portes, ouvertures) relient
 * deux cases de pièces voisines par `pass()`.
 *
 * Couleurs de ligne de vue : une par pièce (`r.*`), une par passage (`p.*`) ; le seuil d'un passage porte la couleur de
 * sa pièce et celle du passage (voir `docs/boards.md`). Fichier de données du générateur : pas un test Vitest.
 */
const PITCH = 70;
/** Écartement des pièces : leurs centres sont multipliés par ce facteur (tailles inchangées) pour aérer les passages. */
const SPREAD = 1.5;

interface Grid {
  readonly cols: number;
  readonly rows: number;
  readonly x0: number;
  readonly y0: number;
}
const grids = new Map<string, Grid>();

/** Pièce rectangulaire `[x0, y0, x1, y1]` : cases centrées sur une grille régulière (pas de 70). */
function room(id: string, color: string, fill: string, rect: readonly [number, number, number, number]): RoomSpec {
  const w = rect[2] - rect[0];
  const h = rect[3] - rect[1];
  const x0 = Math.round(((rect[0] + rect[2]) / 2) * SPREAD - w / 2);
  const y0 = Math.round(((rect[1] + rect[3]) / 2) * SPREAD - h / 2);
  const x1 = x0 + w;
  const y1 = y0 + h;
  const margin = PITCH * 0.2;
  const cols = Math.floor((x1 - x0 - 2 * margin - 1) / PITCH) + 1;
  const rows = Math.floor((y1 - y0 - 2 * margin - 1) / PITCH) + 1;
  const gx = x0 + (x1 - x0 - (cols - 1) * PITCH) / 2;
  const gy = y0 + (y1 - y0 - (rows - 1) * PITCH) / 2;
  grids.set(id, { cols, rows, x0: gx, y0: gy });
  const cells: Pt[] = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) cells.push({ x: gx + c * PITCH, y: gy + r * PITCH });
  return {
    id,
    nameKey: `room.${id}`,
    color,
    fill,
    pitch: PITCH,
    polygon: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    cells,
  };
}

/** Position d'une case (colonne, ligne ; négatif = depuis la fin) d'une pièce. */
function cell(id: string, col: number, row: number): Pt {
  const g = grids.get(id);
  if (!g) throw new Error(`pièce inconnue : ${id}`);
  const c = col < 0 ? g.cols + col : col;
  const r = row < 0 ? g.rows + row : row;
  return { x: g.x0 + c * PITCH, y: g.y0 + r * PITCH };
}

const rooms: RoomSpec[] = [
  room('tour', 'r.tour', '#4a463f', [35, 30, 215, 140]),
  room('bureau-nord', 'r.bureau-nord', '#5a4535', [245, 30, 1010, 140]),
  room('escalier-nord', 'r.escalier-nord', '#4d4a45', [1030, 30, 1150, 170]),
  room('couloir-ouest', 'r.couloir-ouest', '#46443f', [70, 150, 230, 350]),
  room('grand-hall', 'r.grand-hall', '#6a5233', [240, 150, 620, 350]),
  room('couloir-central', 'r.couloir-central', '#5f553f', [635, 150, 715, 870]),
  room('salon', 'r.salon', '#5b5a58', [725, 230, 1140, 570]),
  room('chambre', 'r.chambre', '#5b3a33', [325, 370, 625, 650]),
  room('salle-carrelee', 'r.salle-carrelee', '#58585a', [30, 370, 260, 650]),
  room('studio', 'r.studio', '#573f2c', [120, 660, 510, 950]),
  room('salle-a-manger', 'r.salle-a-manger', '#4b3a2d', [725, 590, 1140, 860]),
  room('rotonde', 'r.rotonde', '#554a3a', [870, 870, 1160, 1170]),
  room('cabinet', 'r.cabinet', '#4a4136', [630, 960, 860, 1150]),
  room('escalier-cave', 'r.escalier-cave', '#44423f', [520, 960, 620, 1150]),
  room('cave', 'r.cave', '#3d3a36', [50, 960, 510, 1170]),
];

type End = readonly [room: string, col: number, row: number];
const corridors: CorridorSpec[] = [];
const doors: DoorSpec[] = [];

/**
 * Passage (ouverture ou porte) entre deux cases de pièces voisines : deux nœuds de passage, posés sur le trajet à égale
 * distance `L` de chaque case (L = un tiers du trajet, borné entre 50 et 105) ; si le trajet est long, des nœuds
 * intermédiaires sont ajoutés (espacement ≈ 100) pour que les nœuds de couloir restent régulièrement espacés.
 */
function pass(id: string, a: End, b: End, door?: Omit<DoorSpec, 'id'>): void {
  const pa = cell(a[0], a[1], a[2]);
  const pb = cell(b[0], b[1], b[2]);
  const length = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const reach = Math.min(105, Math.max(50, length / 3));
  const at = (t: number): Pt => ({ x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t });
  const doorId = door ? `door-${id}` : undefined;
  if (door) doors.push({ id: doorId!, ...door });
  corridors.push({
    id: `pass-${id}`,
    width: 36,
    points: [at(Math.min(0.5, reach / length)), at(Math.max(0.5, 1 - reach / length))],
    colors: [`p.${id}`],
    from: { room: a[0], ...(doorId ? { door: doorId } : {}) },
    to: { room: b[0] },
    spacing: 100,
  });
}

// Nord
pass('tour-ouest', ['tour', 0, -1], ['couloir-ouest', 0, 0], { type: 'WOODEN', state: 'OPEN' });
pass('tour-bureau', ['tour', -1, 0], ['bureau-nord', 0, 0], { type: 'REINFORCED', state: 'CLOSED' });
pass('bureau-hall', ['bureau-nord', 2, -1], ['grand-hall', 2, 0]);
pass('bureau-escalier', ['bureau-nord', -1, 0], ['escalier-nord', 0, 0]);
pass('escalier-salon', ['escalier-nord', -1, -1], ['salon', -1, 0]);
// Ouest et centre
pass('ouest-hall', ['couloir-ouest', -1, 1], ['grand-hall', 0, 1]);
pass('ouest-carrelee', ['couloir-ouest', 0, -1], ['salle-carrelee', 1, 0]);
pass('hall-central', ['grand-hall', -1, 1], ['couloir-central', 0, 1]);
pass('hall-chambre', ['grand-hall', 3, -1], ['chambre', 2, 0], { type: 'WOODEN', state: 'OPEN' });
pass('carrelee-chambre', ['salle-carrelee', -1, 1], ['chambre', 0, 1]);
pass('carrelee-studio', ['salle-carrelee', 1, -1], ['studio', 0, 0]);
pass('chambre-studio', ['chambre', 2, -1], ['studio', 3, 0]);
pass('studio-central', ['studio', -1, 1], ['couloir-central', 0, -3], { type: 'WOODEN', state: 'OPEN' });
// Est
pass('central-salon', ['couloir-central', 0, 1], ['salon', 0, 1]);
pass('central-manger', ['couloir-central', 0, -2], ['salle-a-manger', 0, 1], { type: 'WOODEN', state: 'CLOSED' });
pass('salon-manger', ['salon', 3, -1], ['salle-a-manger', 3, 0]);
pass('manger-rotonde', ['salle-a-manger', -1, -1], ['rotonde', -1, 0]);
// Sud
pass('central-cabinet', ['couloir-central', 0, -1], ['cabinet', 0, 0]);
pass('cabinet-rotonde', ['cabinet', -1, 1], ['rotonde', 0, 0]);
pass('cabinet-escalier', ['cabinet', 0, 1], ['escalier-cave', -1, 1]);
pass('escalier-studio', ['escalier-cave', 0, 0], ['studio', -2, -1]);
pass('escalier-cave', ['escalier-cave', 0, -1], ['cave', -1, 1]);

const marks: MarkSpec[] = [
  // Points d'entrée des deux équipes : côté ouest (salle carrelée) et côté est (salle à manger).
  { at: cell('salle-carrelee', 0, 1), kind: 'ENTRY_POINT' },
  { at: cell('salle-a-manger', -1, 2), kind: 'ENTRY_POINT' },
  // Cases d'objectif (Capture du drapeau : 3 drapeaux par joueur y sont posés).
  { at: cell('bureau-nord', 1, 0), kind: 'OBJECTIVE' },
  { at: cell('bureau-nord', -2, 1), kind: 'OBJECTIVE' },
  { at: cell('chambre', 1, 1), kind: 'OBJECTIVE' },
  { at: cell('salon', 3, 3), kind: 'OBJECTIVE' },
  { at: cell('studio', 2, 2), kind: 'OBJECTIVE' },
  { at: cell('cabinet', 1, 1), kind: 'OBJECTIVE' },
  { at: cell('cave', 3, 1), kind: 'OBJECTIVE' },
  { at: cell('rotonde', 1, 2), kind: 'OBJECTIVE' },
  // Grande table de la salle à manger : cases impraticables.
  { at: cell('salle-a-manger', 2, 1), passable: false },
  { at: cell('salle-a-manger', 3, 1), passable: false },
  // Gravats de la cave : +1 PM pour y entrer.
  { at: cell('cave', 2, 2), movementCostModifier: 1 },
  { at: cell('cave', 4, 0), movementCostModifier: 1 },
];

export const manoirSpec: BoardSpec = {
  id: 'manoir',
  nameKey: 'board.manoir.name',
  rooms,
  corridors,
  doors,
  marks,
  // Passage secret salle carrelée ↔ cave (1 PM, ne donne pas de ligne de vue).
  portals: [{ id: 'portal-secret', from: cell('salle-carrelee', 1, 2), to: cell('cave', 0, 0) }],
};
