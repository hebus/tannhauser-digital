import { buildColorMap, cssColor } from '@tannhauser/renderer/src/palette';
import { h, withFocusKept } from '../../ui/dom';
import type { Diagnostic } from '../diagnostics';
import { NODE_KINDS, type EditorDoc, type NodeKind, type Selection } from '../model';
import { findEdge, reverseEdge, setDoor, setOneWay, toggleDoor, removePortal, disconnect } from '../ops-edges';
import { deleteShape, renameZone, setCorridorWidth, setRoom } from '../ops-layout';
import { assignZones, deleteNodes, renameNode, setBoardMeta, setNodeColors, setNodePosition, setNodeProperties, setNodeZone } from '../ops-nodes';

/**
 * Panneau latéral de l'éditeur : plateau, propriétés de la sélection, diagnostics. Outil de développement : textes en
 * français, non traduits. Chaque champ applique sa modification à sa validation (`change`) : une étape d'historique.
 */

export interface PanelState {
  readonly doc: EditorDoc;
  readonly selection: Selection;
  readonly diagnostics: readonly Diagnostic[];
  readonly editable: boolean;
  readonly isNew: boolean;
  readonly dirty: boolean;
}

export interface PanelActions {
  apply(doc: EditorDoc): void;
  select(selection: Selection): void;
  notify(text: string, tone?: 'info' | 'error'): void;
}

const KIND_LABEL: Readonly<Record<NodeKind, string>> = { NORMAL: 'Normale', ENTRY_POINT: 'Entrée', OBJECTIVE: 'Objectif', ACTION: 'Action' };
const LEVEL_ICON = { error: '✖', warning: '⚠', info: 'ℹ' } as const;

const field = (label: string, control: HTMLElement): HTMLElement => h('label', { class: 'be-field' }, h('span', { text: label }), control);
const section = (title: string, ...children: (HTMLElement | null)[]): HTMLElement => h('section', { class: 'be-section' }, h('h2', { text: title }), ...children);

function input(fid: string, value: string | number, onChange: (value: string) => void, attrs: Record<string, string | number | boolean> = {}): HTMLInputElement {
  const el = h('input', { attrs: { 'data-fid': fid, value: String(value), ...attrs } });
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

function select<T extends string>(fid: string, value: T, options: readonly (readonly [T, string])[], onChange: (value: T) => void): HTMLSelectElement {
  const el = h('select', { attrs: { 'data-fid': fid } }, ...options.map(([v, label]) => h('option', { text: label, attrs: { value: v, selected: v === value } })));
  el.addEventListener('change', () => onChange(el.value as T));
  return el;
}

function checkbox(fid: string, checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
  const el = h('input', { attrs: { 'data-fid': fid, type: 'checkbox', checked } });
  el.addEventListener('change', () => onChange(el.checked));
  return el;
}

const button = (text: string, onClick: () => void, cls = ''): HTMLButtonElement => h('button', { class: `be-btn ${cls}`.trim(), text, attrs: { type: 'button' }, on: { click: onClick } });

/** Puces des couleurs du plateau : un clic ajoute ou retire la couleur sur les cases sélectionnées. */
function colorChips(doc: EditorDoc, ids: readonly string[], actions: PanelActions): HTMLElement {
  const all = [...new Set(doc.nodes.flatMap((n) => n.colors))].sort();
  const map = buildColorMap(all);
  const nodes = doc.nodes.filter((n) => ids.includes(n.id));
  return h(
    'div',
    { class: 'be-chips' },
    ...all.map((c) => {
      const on = nodes.length > 0 && nodes.every((n) => n.colors.includes(c));
      const chip = button(c, () => {
        let next = doc;
        for (const n of nodes) next = setNodeColors(next, [n.id], on ? n.colors.filter((x) => x !== c) : [...n.colors, c]);
        actions.apply(next);
      }, on ? 'be-chip is-on' : 'be-chip');
      chip.style.setProperty('--chip', cssColor(map.get(c) ?? 0x888888));
      return chip;
    }),
  );
}

function nodesSection(state: PanelState, ids: readonly string[], actions: PanelActions): HTMLElement {
  const { doc } = state;
  const nodes = doc.nodes.filter((n) => ids.includes(n.id));
  const first = nodes[0];
  if (!first) return section('Sélection', h('p', { text: 'Cases introuvables.' }));
  const zones = [...(doc.layout?.rooms.map((r) => r.id) ?? []), ...(doc.layout?.corridors.map((c) => c.id) ?? [])];
  const props = first.properties ?? {};
  const single = nodes.length === 1;
  return section(
    single ? `Case ${first.id}` : `${nodes.length} cases`,
    single
      ? field(
          'Identifiant',
          input('node-id', first.id, (v) => {
            const r = renameNode(doc, first.id, v);
            if (!r.ok) return actions.notify(r.reason, 'error');
            actions.apply(r.doc);
            actions.select({ kind: 'nodes', ids: [v.trim()] });
          }),
        )
      : null,
    single
      ? h(
          'div',
          { class: 'be-row' },
          field('x', input('node-x', first.x, (v) => actions.apply(setNodePosition(doc, first.id, { x: Number(v) || 0, y: first.y })), { type: 'number' })),
          field('y', input('node-y', first.y, (v) => actions.apply(setNodePosition(doc, first.id, { x: first.x, y: Number(v) || 0 })), { type: 'number' })),
        )
      : null,
    field('Type', select('node-kind', (props.kind ?? 'NORMAL') as NodeKind, NODE_KINDS.map((k) => [k, KIND_LABEL[k]] as const), (v) => actions.apply(setNodeProperties(doc, ids, { kind: v })))),
    h(
      'div',
      { class: 'be-row' },
      field('Praticable', checkbox('node-passable', props.passable !== false, (v) => actions.apply(setNodeProperties(doc, ids, { passable: v })))),
      field('Coût +PM', input('node-cost', props.movementCostModifier ?? 0, (v) => actions.apply(setNodeProperties(doc, ids, { movementCostModifier: Math.max(0, Math.floor(Number(v) || 0)) })), { type: 'number', min: 0, step: 1 })),
    ),
    single
      ? field(
          'Couleurs (ligne de vue, 1 à 3)',
          input('node-colors', first.colors.join(', '), (v) => actions.apply(setNodeColors(doc, ids, v.split(','))), { placeholder: 'red, green' }),
        )
      : null,
    colorChips(doc, ids, actions),
    zones.length > 0
      ? field('Zone', select('node-zone', first.zoneId ?? '', [['', '— aucune —'] as const, ...zones.map((z) => [z, z] as const)], (v) => actions.apply(setNodeZone(doc, ids, v || undefined))))
      : null,
    h(
      'div',
      { class: 'be-actions' },
      button('Supprimer', () => {
        actions.apply(deleteNodes(doc, ids));
        actions.select(null);
      }, 'is-danger'),
    ),
  );
}

function edgeSection(state: PanelState, ref: { from: string; to: string }, actions: PanelActions): HTMLElement {
  const { doc } = state;
  const edge = findEdge(doc, ref);
  if (!edge) return section('Sélection', h('p', { text: 'Arête introuvable.' }));
  const door = edge.doorId ? (doc.doors ?? []).find((d) => d.id === edge.doorId) : undefined;
  const doorType = door?.type ?? 'NONE';
  return section(
    `Arête ${edge.from} → ${edge.to}`,
    h('div', { class: 'be-row' }, field('Sens unique', checkbox('edge-oneway', edge.oneWay === true, (v) => actions.apply(setOneWay(doc, edge, v)))), button('Inverser le sens', () => actions.apply(reverseEdge(doc, edge)))),
    field(
      'Porte',
      select('edge-door', doorType, [['NONE', 'Aucune'], ['WOODEN', 'En bois'], ['REINFORCED', 'Renforcée']] as const, (v) => {
        if (v === 'NONE') return actions.apply(door ? toggleDoor(doc, edge).doc : doc);
        if (door) return actions.apply(setDoor(doc, door.id, { type: v }));
        const put = toggleDoor(doc, edge);
        actions.apply(put.doorId ? setDoor(put.doc, put.doorId, { type: v }) : put.doc);
      }),
    ),
    door ? field('État de la porte', select('edge-door-state', door.state, [['CLOSED', 'Fermée'], ['OPEN', 'Ouverte']] as const, (v) => actions.apply(setDoor(doc, door.id, { state: v })))) : null,
    h('div', { class: 'be-actions' }, button('Supprimer', () => {
      actions.apply(disconnect(doc, edge));
      actions.select(null);
    }, 'is-danger')),
  );
}

function shapeSection(state: PanelState, kind: 'room' | 'corridor', id: string, actions: PanelActions): HTMLElement {
  const { doc } = state;
  const room = kind === 'room' ? doc.layout?.rooms.find((r) => r.id === id) : undefined;
  const corridor = kind === 'corridor' ? doc.layout?.corridors.find((c) => c.id === id) : undefined;
  if (!room && !corridor) return section('Sélection', h('p', { text: 'Forme introuvable.' }));
  const rename = (v: string): void => {
    const r = renameZone(doc, id, v);
    if (!r.ok) return actions.notify(r.reason, 'error');
    actions.apply(r.doc);
    actions.select({ kind, id: v.trim() });
  };
  return section(
    room ? `Pièce ${id}` : `Couloir ${id}`,
    field('Identifiant (zone des cases)', input('shape-id', id, rename)),
    room ? field('Nom (clé i18n ou texte)', input('room-name', room.nameKey ?? '', (v) => actions.apply(setRoom(doc, id, { nameKey: v })))) : null,
    room
      ? h(
          'div',
          { class: 'be-row' },
          field('Teinte', input('room-fill', room.fill ?? '#3a3f48', (v) => actions.apply(setRoom(doc, id, { fill: v })), { type: 'color' })),
          room.fill ? button('Sans teinte', () => actions.apply(setRoom(doc, id, { fill: null }))) : null,
        )
      : null,
    corridor ? field('Largeur', input('corridor-width', corridor.width, (v) => actions.apply(setCorridorWidth(doc, id, Number(v) || 1)), { type: 'number', min: 1 })) : null,
    h('p', { class: 'be-hint', text: 'Glisser un sommet pour le déplacer, Alt + clic pour le retirer ; glisser un carré (milieu de côté) insère un sommet. Glisser l’intérieur déplace la forme et ses cases.' }),
    h(
      'div',
      { class: 'be-actions' },
      button('Rattacher les cases aux zones', () => actions.apply(assignZones(doc))),
      button('Supprimer', () => {
        actions.apply(deleteShape(doc, kind, id));
        actions.select(null);
      }, 'is-danger'),
    ),
  );
}

function selectionSection(state: PanelState, actions: PanelActions): HTMLElement {
  const sel = state.selection;
  switch (sel?.kind) {
    case 'nodes':
      return nodesSection(state, sel.ids, actions);
    case 'edge':
      return edgeSection(state, sel.ref, actions);
    case 'portal': {
      const portal = (state.doc.portals ?? []).find((p) => p.id === sel.id);
      return section(
        `Portail ${sel.id}`,
        h('p', { text: portal ? `Porte secrète entre ${portal.from} et ${portal.to}.` : 'Portail introuvable.' }),
        h('div', { class: 'be-actions' }, button('Supprimer', () => {
          actions.apply(removePortal(state.doc, sel.id));
          actions.select(null);
        }, 'is-danger')),
      );
    }
    case 'room':
    case 'corridor':
      return shapeSection(state, sel.kind, sel.id, actions);
    default:
      return section('Sélection', h('p', { class: 'be-hint', text: 'Cliquer une case, une arête, un portail ou une forme. Maj + clic ou cadre : sélection multiple.' }));
  }
}

function diagnosticsSection(state: PanelState, actions: PanelActions): HTMLElement {
  const list = state.diagnostics;
  const errors = list.filter((d) => d.level === 'error').length;
  return section(
    errors > 0 ? `Problèmes (${errors} erreur${errors > 1 ? 's' : ''})` : 'Problèmes',
    list.length === 0
      ? h('p', { class: 'be-ok', text: '✔ Plateau valide.' })
      : h(
          'ul',
          { class: 'be-diags' },
          ...list.map((d) =>
            h(
              'li',
              { class: `be-diag is-${d.level}` },
              h('button', {
                attrs: { type: 'button', disabled: d.nodeIds.length === 0 },
                on: { click: () => actions.select({ kind: 'nodes', ids: d.nodeIds }) },
              }, h('span', { class: 'be-diag-icon', text: LEVEL_ICON[d.level], attrs: { 'aria-hidden': 'true' } }), h('span', { text: d.message })),
            ),
          ),
        ),
  );
}

export function renderPanel(root: HTMLElement, state: PanelState, actions: PanelActions): void {
  withFocusKept(root, () => {
    const { doc } = state;
    root.replaceChildren(
      section(
        'Plateau',
        h('div', { class: 'be-board-id' }, h('b', { text: doc.id }), h('span', { class: `be-tag ${state.editable ? 'is-ok' : 'is-ro'}`, text: state.editable ? (state.isNew ? 'nouveau' : 'modifiable') : 'généré : lecture seule' })),
        state.editable ? null : h('p', { class: 'be-hint', text: 'Plateau produit par tools/board-generator : modifier son .map.ts puis npm run generate:boards, ou « Enregistrer sous » pour en faire une copie modifiable.' }),
        field('Nom (clé i18n)', input('board-name', doc.nameKey, (v) => actions.apply(setBoardMeta(doc, { nameKey: v.trim() || doc.nameKey })))),
        h('p', { class: 'be-hint', text: `${doc.nodes.length} cases · ${doc.edges.length} arêtes · ${(doc.doors ?? []).length} portes · ${(doc.portals ?? []).length} portails · ${doc.layout?.rooms.length ?? 0} pièces · ${doc.layout?.corridors.length ?? 0} couloirs` }),
      ),
      selectionSection(state, actions),
      diagnosticsSection(state, actions),
    );
  });
}
