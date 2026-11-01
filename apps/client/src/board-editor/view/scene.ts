import { doorGeometry, parseHexColor, polygonCentroid } from '@tannhauser/renderer/src/board-layout';
import { buildColorMap, cssColor, TERRAIN_COLORS } from '@tannhauser/renderer/src/palette';
import { midpoints } from '../geometry';
import { nodeRadius, sameEdge, type EditorDoc, type Pt, type Selection } from '../model';
import { points, s, sectorPath } from './svg';

/**
 * Dessin SVG du plateau édité, en coordonnées plateau (la vue règle `viewBox`). Mêmes couleurs que le jeu : secteurs
 * de ligne de vue (`buildColorMap`), sols et murs (`TERRAIN_COLORS`), portes et portails comme le rendu 2D.
 * Redessiné en entier à chaque changement : quelques milliers d'éléments au plus.
 */

export interface SceneState {
  readonly selection: Selection;
  /** Case de départ de « relier » / « portail ». */
  readonly pending: string | null;
  /** Tracé en cours (pièce ou couloir) et point sous le pointeur. */
  readonly draft: readonly Pt[];
  readonly draftClosed: boolean;
  readonly pointer: Pt | null;
  /** Cadre de sélection en cours. */
  readonly box: { readonly a: Pt; readonly b: Pt } | null;
  /** Cases signalées par un diagnostic d'erreur. */
  readonly flagged: ReadonlySet<string>;
  readonly showIds: boolean;
  /** Nom affiché d'une pièce (clé i18n traduite si elle existe). */
  readonly label: (key: string) => string;
  /** Unités plateau par pixel : épaisseurs constantes à l'écran pour les poignées et contours. */
  readonly unit: number;
}

const EDGE = '#b4b7c2';
const EDGE_UNDER = '#0b0c0e';
const PORTAL = '#c084fc';
const DOOR_CLOSED = '#d9902f';
const DOOR_CLOSED_REINFORCED = '#9a5b12';
const DOOR_OPEN = '#7bd88f';
const SELECT = '#8cc4e6';
const PENDING = '#ffb454';
const ERROR = '#ff4d4f';
const WALL = cssColor(TERRAIN_COLORS.wall);
const KIND_LETTER: Readonly<Record<string, string>> = { ENTRY_POINT: 'E', OBJECTIVE: 'O', ACTION: 'A' };

export function renderScene(root: SVGGElement, doc: EditorDoc, ui: SceneState): void {
  root.replaceChildren();
  const u = ui.unit;
  const R = nodeRadius(doc);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const colors = buildColorMap(doc.nodes.flatMap((n) => n.colors));
  const sel = ui.selection;

  // Plan : couloirs puis pièces (teinte de pièce à 28 %, comme le jeu).
  const layout = s('g');
  for (const c of doc.layout?.corridors ?? []) {
    const selected = sel?.kind === 'corridor' && sel.id === c.id;
    layout.append(
      s('polyline', { points: points(c.points), fill: 'none', stroke: WALL, 'stroke-width': c.width + 8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      s('polyline', { points: points(c.points), fill: 'none', stroke: cssColor(TERRAIN_COLORS.corridor), 'stroke-width': c.width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
    );
    if (selected) layout.append(s('polyline', { points: points(c.points), fill: 'none', stroke: SELECT, 'stroke-width': 2 * u, 'stroke-dasharray': `${6 * u} ${4 * u}` }));
  }
  for (const r of doc.layout?.rooms ?? []) {
    const selected = sel?.kind === 'room' && sel.id === r.id;
    const tint = parseHexColor(r.fill);
    layout.append(s('polygon', { points: points(r.polygon), fill: cssColor(TERRAIN_COLORS.room), stroke: selected ? SELECT : WALL, 'stroke-width': selected ? 3 * u : 8, 'stroke-linejoin': 'round' }));
    if (tint !== undefined) layout.append(s('polygon', { points: points(r.polygon), fill: cssColor(tint), 'fill-opacity': TERRAIN_COLORS.roomTintAlpha, stroke: 'none' }));
    const c = polygonCentroid(r.polygon);
    layout.append(s('text', { x: c.x, y: c.y, class: 'be-room-name', 'font-size': 14 * u }, ui.label(r.nameKey ?? r.id)));
  }
  root.append(layout);

  // Arêtes (trait clair sur ombre), sens unique (flèche), portes (barre), puis portails (pointillés violets).
  const edges = s('g');
  for (const e of doc.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const selected = sel?.kind === 'edge' && sameEdge(e, sel.ref);
    edges.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: EDGE_UNDER, 'stroke-width': 7, 'stroke-opacity': 0.6 }));
    edges.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: selected ? SELECT : EDGE, 'stroke-width': selected ? 5 : 3 }));
    if (e.oneWay) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const tip = { x: b.x - ux * (R + 4), y: b.y - uy * (R + 4) };
      const back = { x: tip.x - ux * 16, y: tip.y - uy * 16 };
      edges.append(s('polygon', { points: points([tip, { x: back.x - uy * 9, y: back.y + ux * 9 }, { x: back.x + uy * 9, y: back.y - ux * 9 }]), fill: '#ffffff' }));
    }
    const door = e.doorId ? (doc.doors ?? []).find((d) => d.id === e.doorId) : undefined;
    if (door) {
      const g = doorGeometry(a, b, 34);
      const reinforced = door.type === 'REINFORCED';
      const color = door.state === 'OPEN' ? DOOR_OPEN : reinforced ? DOOR_CLOSED_REINFORCED : DOOR_CLOSED;
      edges.append(
        s('line', { x1: g.p1.x, y1: g.p1.y, x2: g.p2.x, y2: g.p2.y, stroke: '#111111', 'stroke-width': reinforced ? 13 : 10, 'stroke-linecap': 'round' }),
        s('line', { x1: g.p1.x, y1: g.p1.y, x2: g.p2.x, y2: g.p2.y, stroke: color, 'stroke-width': reinforced ? 9 : 6, 'stroke-linecap': 'round', 'stroke-dasharray': door.state === 'OPEN' ? '4 4' : undefined }),
      );
    }
  }
  for (const p of doc.portals ?? []) {
    const a = byId.get(p.from);
    const b = byId.get(p.to);
    if (!a || !b) continue;
    const selected = sel?.kind === 'portal' && sel.id === p.id;
    edges.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: selected ? SELECT : PORTAL, 'stroke-width': selected ? 6 : 4, 'stroke-dasharray': '10 8' }));
  }
  root.append(edges);

  // Cases : secteurs de ligne de vue (premier en haut, sens horaire, comme le 2D), contour, marques de type et de coût.
  const nodes = s('g');
  const selectedIds = new Set(sel?.kind === 'nodes' ? sel.ids : []);
  for (const n of doc.nodes) {
    const g = s('g', { transform: `translate(${n.x},${n.y})` });
    const list = n.colors.length > 0 ? n.colors : [null];
    const step = (Math.PI * 2) / list.length;
    list.forEach((c, i) => {
      const fill = c === null ? '#888888' : cssColor(colors.get(c) ?? 0x888888);
      g.append(s('path', { d: sectorPath(R, -Math.PI / 2 + i * step, -Math.PI / 2 + (i + 1) * step), fill }));
    });
    const passable = n.properties?.passable !== false;
    g.append(s('circle', { r: R, fill: 'none', stroke: passable ? '#1c1f24' : ERROR, 'stroke-width': 3 }));
    if (!passable) g.append(s('path', { d: `M ${-R * 0.5},${-R * 0.5} L ${R * 0.5},${R * 0.5} M ${R * 0.5},${-R * 0.5} L ${-R * 0.5},${R * 0.5}`, stroke: ERROR, 'stroke-width': 4 }));
    const kind = n.properties?.kind;
    if (kind && KIND_LETTER[kind]) {
      g.append(s('circle', { cx: R * 0.7, cy: -R * 0.7, r: 9, fill: '#f1f3f5', stroke: '#111111', 'stroke-width': 1.5 }));
      g.append(s('text', { x: R * 0.7, y: -R * 0.7, class: 'be-badge' }, KIND_LETTER[kind]!));
    }
    if (kind === 'ENTRY_POINT') g.append(s('circle', { r: R + 5, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-opacity': 0.85 }));
    const cost = n.properties?.movementCostModifier ?? 0;
    if (cost > 0) g.append(s('text', { x: -R * 0.75, y: -R * 0.75, class: 'be-cost' }, `+${cost}`));
    if (ui.flagged.has(n.id)) g.append(s('circle', { r: R + 9, fill: 'none', stroke: ERROR, 'stroke-width': 3 * u, 'stroke-dasharray': `${5 * u} ${3 * u}` }));
    if (selectedIds.has(n.id)) g.append(s('circle', { r: R + 6, fill: 'none', stroke: SELECT, 'stroke-width': 4 * u }));
    if (ui.pending === n.id) g.append(s('circle', { r: R + 10, fill: 'none', stroke: PENDING, 'stroke-width': 4 * u }));
    if (ui.showIds) g.append(s('text', { y: R + 14, class: 'be-id', 'font-size': 11 * Math.max(1, u) }, n.id));
    nodes.append(g);
  }
  root.append(nodes);

  // Poignées de la forme sélectionnée : sommets (glisser ; Alt + clic retire) et milieux des côtés (glisser insère).
  if ((sel?.kind === 'room' || sel?.kind === 'corridor') && doc.layout) {
    const shape = sel.kind === 'room' ? doc.layout.rooms.find((r) => r.id === sel.id)?.polygon : doc.layout.corridors.find((c) => c.id === sel.id)?.points;
    if (shape) {
      const handles = s('g');
      for (const m of midpoints(shape, sel.kind === 'room')) handles.append(s('rect', { x: m.x - 4 * u, y: m.y - 4 * u, width: 8 * u, height: 8 * u, class: 'be-mid' }));
      for (const v of shape) handles.append(s('circle', { cx: v.x, cy: v.y, r: 6 * u, class: 'be-vertex' }));
      root.append(handles);
    }
  }

  // Tracé en cours, avec le segment vers le pointeur ; cadre de sélection.
  if (ui.draft.length > 0) {
    const preview = ui.pointer ? [...ui.draft, ui.pointer] : [...ui.draft];
    root.append(s(ui.draftClosed ? 'polygon' : 'polyline', { points: points(preview), class: 'be-draft', 'stroke-width': 2 * u, 'stroke-dasharray': `${6 * u} ${4 * u}` }));
    for (const p of ui.draft) root.append(s('circle', { cx: p.x, cy: p.y, r: 5 * u, class: 'be-vertex' }));
  }
  if (ui.box) {
    const x = Math.min(ui.box.a.x, ui.box.b.x);
    const y = Math.min(ui.box.a.y, ui.box.b.y);
    root.append(s('rect', { x, y, width: Math.abs(ui.box.a.x - ui.box.b.x), height: Math.abs(ui.box.a.y - ui.box.b.y), class: 'be-box', 'stroke-width': u }));
  }
}
