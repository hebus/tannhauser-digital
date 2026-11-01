import { BOARD_ID_PATTERN, normalizeBoardJson, serializeBoard } from '@tannhauser/content/src/board-format';
import { h, isTypingTarget } from '../ui/dom';
import { hasKey, t } from '../ui/i18n';
import { getBoard, listBoards, saveBoard } from './api-client';
import { diagnose, hasErrors, type Diagnostic } from './diagnostics';
import { clearDraft, readDraft, writeDraft } from './draft-store';
import { contentBounds, hitTest, snap } from './geometry';
import { commit, createHistory, isDirty, markSaved, redo, seal, undo, type History } from './history';
import { NODE_KINDS, newBoard, type EditorDoc, type NodeKind, type Pt, type Selection, type Tool } from './model';
import { findEdge, setOneWay } from './ops-edges';
import { setNodeProperties } from './ops-nodes';
import { cancel, deleteSelection, finishDraft, initialToolState, pointerDown, pointerMove, pointerUp, setTool, type Step, type ToolState } from './tools';
import { Preview3d } from './preview-3d';
import { renderPanel } from './ui/panel';
import { renderScene } from './view/scene';
import { s } from './view/svg';
import './editor.css';

/**
 * Éditeur de plateaux (outil de développement interne, `?editor` ou `?editor=<id>` avec `npm run dev`).
 * Édite le JSON d'un plateau de `packages/content/src/data/` et l'enregistre par l'API du serveur de développement.
 * Textes en français, non traduits (outil interne, voir docs/product/non-goals.md).
 */

interface Meta {
  /** Modifiable (faux pour un plateau généré : seul « Enregistrer sous » est permis). */
  editable: boolean;
  /** Jamais enregistré sous cet id : l'enregistrement crée le fichier. */
  isNew: boolean;
  /** Empreinte du fichier à l'ouverture : protège contre l'écrasement d'une modification faite ailleurs. */
  hash: string | undefined;
}

interface View {
  cx: number;
  cy: number;
  /** Pixels par unité plateau. */
  zoom: number;
}

const TOOLS: readonly { readonly tool: Tool; readonly key: string; readonly label: string; readonly hint: string }[] = [
  { tool: 'select', key: 'V', label: 'Sélection', hint: 'Cliquer, glisser, cadre ; Maj : ajouter à la sélection' },
  { tool: 'node', key: 'N', label: 'Case', hint: 'Cliquer pour poser une case (alignée sur la grille)' },
  { tool: 'connect', key: 'C', label: 'Relier', hint: 'Cliquer des cases à la suite pour les relier (re-cliquer une arête existante la retire) ; Échap arrête' },
  { tool: 'door', key: 'D', label: 'Porte', hint: 'Cliquer une arête pour poser ou retirer une porte' },
  { tool: 'portal', key: 'P', label: 'Portail', hint: 'Cliquer deux cases pour poser ou retirer une porte secrète' },
  { tool: 'room', key: 'R', label: 'Pièce', hint: 'Cliquer les sommets ; cliquer le premier, Entrée ou double-clic pour fermer' },
  { tool: 'corridor', key: 'L', label: 'Couloir', hint: 'Cliquer les points ; Entrée ou double-clic pour finir' },
];
const GRIDS: readonly (number | null)[] = [null, 10, 20, 25, 50];
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
/** Tolérance d'un clic, en pixels écran. */
const TOLERANCE_PX = 7;

export async function startBoardEditor(host: HTMLElement, initialId: string | null): Promise<void> {
  document.title = 'Éditeur de plateaux · Tannhäuser';
  const opened = initialId ? await openById(initialId).catch((e: unknown) => (alert(String(e)), null)) : null;
  const start = opened ?? (await chooseBoard());
  mountEditor(host, start.doc, start.meta);
}

/** Ouvre un plateau de `data/` ; propose de reprendre son brouillon local s'il diffère. */
async function openById(id: string): Promise<{ doc: EditorDoc; meta: Meta } | null> {
  const board = await getBoard(id);
  if (!board) return null;
  const draft = board.editable ? readDraft(id) : null;
  const useDraft = draft !== null && serializeBoard(normalizeBoardJson(draft)) !== serializeBoard(normalizeBoardJson(board.json)) && confirm(`Un brouillon non enregistré de « ${id} » existe dans ce navigateur. Le reprendre ?`);
  if (draft && !useDraft) clearDraft(id);
  return { doc: useDraft ? draft : board.json, meta: { editable: board.editable, isNew: false, hash: board.hash } };
}

/** Dialogue d'ouverture : plateaux existants, nouveau plateau, import d'un fichier. */
function chooseBoard(): Promise<{ doc: EditorDoc; meta: Meta }> {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'be-overlay' });
    const error = h('p', { class: 'be-error', attrs: { role: 'alert' } });
    const idInput = h('input', { attrs: { placeholder: 'identifiant : crypte, mon-plateau…', 'aria-label': 'Identifiant du nouveau plateau' } });
    const list = h('ul', { class: 'be-open-list' }, h('li', { text: 'Chargement…' }));
    const done = (result: { doc: EditorDoc; meta: Meta }): void => {
      overlay.remove();
      history.replaceState(null, '', `?editor=${encodeURIComponent(result.doc.id)}`);
      resolve(result);
    };
    const create = (): void => {
      const id = idInput.value.trim();
      if (!BOARD_ID_PATTERN.test(id)) return void (error.textContent = 'Identifiant : minuscules, chiffres et tirets, commençant par une lettre (40 caractères au plus).');
      void listBoards().then((boards) => {
        if (boards.some((b) => b.id === id)) error.textContent = `Le plateau ${id} existe déjà : l'ouvrir dans la liste.`;
        else done({ doc: readDraft(id) ?? newBoard(id), meta: { editable: true, isNew: true, hash: undefined } });
      });
    };
    const importFile = (): void => {
      void pickJsonFile().then(async (doc) => {
        if (!doc) return;
        const existing = await getBoard(doc.id).catch(() => null);
        done({ doc, meta: { editable: existing?.editable ?? true, isNew: !existing, hash: existing?.hash } });
      }).catch((e: unknown) => (error.textContent = String(e)));
    };
    overlay.append(
      h(
        'div',
        { class: 'be-dialog', attrs: { role: 'dialog', 'aria-label': 'Ouvrir un plateau' } },
        h('h1', { text: 'Éditeur de plateaux' }),
        h('p', { class: 'be-hint', text: 'Outil de développement : les plateaux sont enregistrés dans packages/content/src/data/ par le serveur de dev.' }),
        h('h2', { text: 'Ouvrir' }),
        list,
        h('h2', { text: 'Nouveau plateau' }),
        h('div', { class: 'be-row' }, idInput, h('button', { class: 'be-btn is-primary', text: 'Créer', attrs: { type: 'button' }, on: { click: create } })),
        h('div', { class: 'be-row' }, h('button', { class: 'be-btn', text: 'Importer un fichier JSON…', attrs: { type: 'button' }, on: { click: importFile } })),
        error,
      ),
    );
    idInput.addEventListener('keydown', (e) => e.key === 'Enter' && create());
    document.body.append(overlay);
    listBoards()
      .then((boards) => {
        list.replaceChildren(
          ...boards.map((b) =>
            h(
              'li',
              {},
              h('button', {
                class: 'be-btn',
                attrs: { type: 'button' },
                on: { click: () => void openById(b.id).then((r) => r && done(r)) },
              }, h('b', { text: b.id }), h('span', { text: ` · ${b.nodes} cases${b.editable ? '' : ' · généré (lecture seule)'}` })),
            ),
          ),
        );
      })
      .catch((e: unknown) => list.replaceChildren(h('li', { class: 'be-error', text: String(e) })));
  });
}

function pickJsonFile(): Promise<EditorDoc | null> {
  return new Promise((resolve, reject) => {
    const input = h('input', { attrs: { type: 'file', accept: '.json,application/json' } });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file
        .text()
        .then((text) => {
          const json = JSON.parse(text) as EditorDoc;
          if (typeof json?.id !== 'string' || !Array.isArray(json.nodes) || !Array.isArray(json.edges)) throw new Error('Ce fichier n’est pas un plateau (id, nodes, edges attendus).');
          resolve(json);
        })
        .catch(reject);
    });
    input.click();
  });
}

function download(doc: EditorDoc): void {
  const blob = new Blob([serializeBoard(normalizeBoardJson(doc))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { attrs: { href: url, download: `${doc.id}-board.json` } });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mountEditor(host: HTMLElement, initial: EditorDoc, meta: Meta): void {
  let hist: History<EditorDoc> = createHistory(initial);
  if (meta.isNew) hist = { ...hist, saved: newBoard('') }; // jamais enregistré : toujours « à enregistrer »
  let tools: ToolState = initialToolState();
  let grid: number | null = 20;
  let showIds = false;
  let pointer: Pt | null = null;
  let diagnostics: Diagnostic[] = diagnose(hist.present, hasKey);
  let diagnosedDoc = hist.present;
  const view: View = { cx: 0, cy: 0, zoom: 1 };

  // --- Structure ---
  const status = h('div', { class: 'be-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const coords = h('span', { class: 'be-coords' });
  const sceneRoot = s('g');
  const svg = s('svg', { class: 'be-canvas', tabindex: 0 }, s('defs', {}, s('pattern', { id: 'be-grid', patternUnits: 'userSpaceOnUse', width: 20, height: 20 }, s('path', { d: 'M 20 0 L 0 0 0 20', fill: 'none', class: 'be-grid-line' }))), s('rect', { class: 'be-grid', x: -1e6, y: -1e6, width: 2e6, height: 2e6, fill: 'url(#be-grid)' }), sceneRoot);
  const gridPattern = svg.querySelector('pattern')!;
  const gridPath = gridPattern.querySelector('path')!;
  const panel = h('aside', { class: 'be-panel' });
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolbar = h(
    'header',
    { class: 'be-toolbar' },
    h('b', { class: 'be-title', text: 'Éditeur de plateaux' }),
    h(
      'div',
      { class: 'be-group', attrs: { role: 'toolbar', 'aria-label': 'Outils' } },
      ...TOOLS.map((t) => {
        const b = h('button', { class: 'be-btn be-tool', attrs: { type: 'button', title: `${t.label} (${t.key}) : ${t.hint}` }, on: { click: () => chooseTool(t.tool) } }, h('span', { text: t.label }), h('kbd', { text: t.key }));
        toolButtons.set(t.tool, b);
        return b;
      }),
    ),
    h(
      'div',
      { class: 'be-group' },
      h('label', { class: 'be-inline' }, 'Grille ', (() => {
        const sel = h('select', { attrs: { title: 'Grille d’alignement (G : activer / couper ; Alt pendant un glisser : libre)' } }, ...GRIDS.map((g) => h('option', { text: g ? String(g) : 'aucune', attrs: { value: String(g ?? ''), selected: g === grid } })));
        sel.addEventListener('change', () => {
          grid = sel.value ? Number(sel.value) : null;
          redraw();
        });
        return sel;
      })()),
      h('button', { class: 'be-btn', text: 'Ids', attrs: { type: 'button', title: 'Afficher les identifiants (I)' }, on: { click: () => ((showIds = !showIds), redraw()) } }),
      h('button', { class: 'be-btn', text: 'Cadrer', attrs: { type: 'button', title: 'Tout voir (F)' }, on: { click: () => frame() } }),
      h('button', { class: 'be-btn', text: 'Aperçu 3D', attrs: { type: 'button', title: 'Voir le plateau dans le rendu 3D du jeu (W)' }, on: { click: () => showPreview() } }),
    ),
    h(
      'div',
      { class: 'be-group' },
      h('button', { class: 'be-btn', text: '↶', attrs: { type: 'button', title: 'Annuler (Ctrl+Z)' }, on: { click: () => travel(undo) } }),
      h('button', { class: 'be-btn', text: '↷', attrs: { type: 'button', title: 'Rétablir (Ctrl+Y)' }, on: { click: () => travel(redo) } }),
    ),
    h(
      'div',
      { class: 'be-group be-file' },
      h('button', { class: 'be-btn is-primary', text: 'Enregistrer', attrs: { type: 'button', title: 'Écrire dans packages/content/src/data (Ctrl+S)' }, on: { click: () => void save() } }),
      h('button', { class: 'be-btn', text: 'Enregistrer sous…', attrs: { type: 'button' }, on: { click: () => void saveAs() } }),
      h('button', { class: 'be-btn', text: 'Tester', attrs: { type: 'button', title: 'Enregistrer puis ouvrir une partie sur ce plateau (nouvel onglet)' }, on: { click: () => void playtest() } }),
      h('button', { class: 'be-btn', text: 'Exporter', attrs: { type: 'button', title: 'Télécharger le JSON' }, on: { click: () => download(hist.present) } }),
      h('button', { class: 'be-btn', text: 'Ouvrir…', attrs: { type: 'button' }, on: { click: () => reopen() } }),
    ),
  );
  const root = h('div', { class: 'be-root' }, toolbar, h('main', { class: 'be-main' }, svg, panel), h('footer', { class: 'be-footer' }, status, coords));
  host.replaceChildren(root);

  // --- État ---
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(text: string, tone: 'info' | 'error' = 'info'): void {
    status.textContent = text;
    status.className = `be-status is-${tone}`;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (status.textContent = ''), tone === 'error' ? 12000 : 5000);
  }

  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  function apply(doc: EditorDoc, key: string | null = null): void {
    if (doc === hist.present) return;
    if (!meta.editable) {
      notify('Plateau généré : lecture seule. « Enregistrer sous » pour en faire une copie modifiable.', 'error');
      redraw();
      return;
    }
    hist = commit(hist, doc, key);
    changed();
  }
  function changed(): void {
    clearTimeout(draftTimer);
    if (meta.editable && isDirty(hist)) draftTimer = setTimeout(() => writeDraft(hist.present.id, hist.present), 400);
    redraw();
  }
  function travel(step: (h: History<EditorDoc>) => History<EditorDoc>): void {
    hist = step(hist);
    tools = { ...tools, selection: keepSelection(hist.present, tools.selection) };
    changed();
  }
  function select(selection: Selection): void {
    tools = { ...tools, selection };
    redraw();
  }
  function chooseTool(tool: Tool): void {
    tools = setTool(tools, tool);
    redraw();
  }

  // --- Dessin (une fois par image au plus) ---
  let frameRequested = false;
  function redraw(): void {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      draw();
    });
  }
  function draw(): void {
    const doc = hist.present;
    if (doc !== diagnosedDoc) {
      diagnostics = diagnose(doc, hasKey);
      diagnosedDoc = doc;
    }
    const rect = svg.getBoundingClientRect();
    const w = rect.width / view.zoom;
    const hgt = rect.height / view.zoom;
    svg.setAttribute('viewBox', `${view.cx - w / 2} ${view.cy - hgt / 2} ${w} ${hgt}`);
    const g = grid ?? 0;
    svg.classList.toggle('has-grid', g > 0 && g * view.zoom >= 6);
    if (g > 0) {
      gridPattern.setAttribute('width', String(g));
      gridPattern.setAttribute('height', String(g));
      gridPath.setAttribute('d', `M ${g} 0 L 0 0 0 ${g}`);
      gridPath.setAttribute('stroke-width', String(1 / view.zoom));
    }
    const gesture = tools.gesture;
    renderScene(sceneRoot, doc, {
      selection: tools.selection,
      pending: tools.pending,
      draft: tools.draft,
      draftClosed: tools.tool === 'room',
      pointer: tools.draft.length > 0 && pointer ? snap(pointer, grid) : null,
      box: gesture.type === 'box' ? { a: gesture.start, b: gesture.current } : null,
      flagged: new Set(diagnostics.filter((d) => d.level === 'error').flatMap((d) => d.nodeIds)),
      showIds,
      label: (key) => (hasKey(key) ? t(key) : key),
      unit: 1 / view.zoom,
    });
    for (const [tool, b] of toolButtons) b.classList.toggle('is-active', tool === tools.tool);
    svg.dataset.tool = tools.tool;
    const dirty = isDirty(hist);
    document.title = `${dirty ? '● ' : ''}${doc.id} · Éditeur de plateaux`;
    renderPanel(panel, { doc, selection: tools.selection, diagnostics, editable: meta.editable, isNew: meta.isNew, dirty }, { apply: (d) => apply(d), select, notify });
  }

  // --- Aperçu 3D (lecture seule, reconstruit à chaque ouverture) ---
  const preview = new Preview3d(() => {
    svg.focus();
    redraw();
  });
  function showPreview(): void {
    if (hasErrors(diagnose(hist.present, hasKey))) return notify('Aperçu 3D impossible : corriger d’abord les erreurs (panneau « Problèmes »).', 'error');
    preview.open(hist.present).catch((e: unknown) => {
      preview.close();
      notify(`Aperçu 3D impossible : ${String(e)}`, 'error');
    });
  }

  // --- Vue : cadrage, zoom, déplacement ---
  function frame(): void {
    const b = contentBounds(hist.present);
    const rect = svg.getBoundingClientRect();
    if (!b) {
      Object.assign(view, { cx: 300, cy: 200, zoom: 1 });
    } else {
      const pad = 80;
      view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(rect.width / (b.width + pad * 2), rect.height / (b.height + pad * 2))));
      view.cx = b.x + b.width / 2;
      view.cy = b.y + b.height / 2;
    }
    redraw();
  }
  const toWorld = (clientX: number, clientY: number): Pt => {
    const rect = svg.getBoundingClientRect();
    return { x: view.cx + (clientX - rect.left - rect.width / 2) / view.zoom, y: view.cy + (clientY - rect.top - rect.height / 2) / view.zoom };
  };
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const before = toWorld(e.clientX, e.clientY);
      view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(e.clientX, e.clientY);
      view.cx += before.x - after.x;
      view.cy += before.y - after.y;
      redraw();
    },
    { passive: false },
  );

  // --- Pointeur ---
  let spaceHeld = false;
  let panning: { x: number; y: number } | null = null;
  const inputFor = (e: PointerEvent | MouseEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    const sel = tools.selection;
    const tolerance = TOLERANCE_PX / view.zoom;
    return {
      world,
      hit: hitTest(hist.present, world, { tolerance, handles: sel?.kind === 'room' || sel?.kind === 'corridor' ? { kind: sel.kind, id: sel.id } : null }),
      shift: e.shiftKey,
      alt: e.altKey,
      grid,
      tolerance,
    };
  };
  const run = (step: Step): void => {
    // Lecture seule : un geste qui modifierait le plateau est ignoré en entier (sa sélection désignerait du vide).
    if (step.doc !== hist.present && !meta.editable) return apply(step.doc);
    tools = step.state;
    apply(step.doc, step.key);
    redraw();
  };
  svg.addEventListener('pointerdown', (e) => {
    svg.focus();
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      panning = { x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    run(pointerDown(tools, hist.present, inputFor(e)));
  });
  svg.addEventListener('pointermove', (e) => {
    pointer = toWorld(e.clientX, e.clientY);
    coords.textContent = `x ${Math.round(pointer.x)} · y ${Math.round(pointer.y)} · zoom ${view.zoom.toFixed(2)}`;
    if (panning) {
      view.cx -= (e.clientX - panning.x) / view.zoom;
      view.cy -= (e.clientY - panning.y) / view.zoom;
      panning = { x: e.clientX, y: e.clientY };
      redraw();
      return;
    }
    if (tools.gesture.type !== 'idle') run(pointerMove(tools, hist.present, inputFor(e)));
    else if (tools.draft.length > 0) redraw();
  });
  const release = (e: PointerEvent): void => {
    if (panning) {
      panning = null;
      return;
    }
    if (tools.gesture.type === 'idle') return;
    run(pointerUp(tools, hist.present, inputFor(e)));
    hist = seal(hist);
  };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  svg.addEventListener('dblclick', () => {
    if (tools.tool === 'room' || tools.tool === 'corridor') run(finishDraft(tools, hist.present));
  });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Clavier ---
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    // Aperçu 3D ouvert : ses propres commandes (flèches, Maj + flèches) ; seuls W et Échap le referment.
    if (preview.isOpen) {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'w') preview.close();
      return;
    }
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 's') {
      e.preventDefault();
      void save();
      return;
    }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) return void (e.preventDefault(), travel(redo));
    if (mod && k === 'z') return void (e.preventDefault(), travel(undo));
    if (mod || e.altKey) return;
    if (e.key === ' ') {
      spaceHeld = true;
      e.preventDefault();
      return;
    }
    const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
    if (tool) return chooseTool(tool.tool);
    switch (e.key) {
      case 'Escape':
        tools = cancel(tools);
        return redraw();
      case 'Enter':
        return run(finishDraft(tools, hist.present));
      case 'Delete':
      case 'Backspace':
        if (!meta.editable) return;
        apply(deleteSelection(hist.present, tools.selection));
        return select(null);
    }
    if (k === 'g') {
      grid = grid ? null : 20;
      notify(grid ? `Grille ${grid}` : 'Grille coupée');
      return redraw();
    }
    if (k === 'i') return void ((showIds = !showIds), redraw());
    if (k === 'f') return frame();
    if (k === 'w') return showPreview();
    if (k === 'o' && tools.selection?.kind === 'edge') {
      const edge = findEdge(hist.present, tools.selection.ref);
      if (edge) apply(setOneWay(hist.present, edge, !edge.oneWay));
      return;
    }
    const sel = tools.selection;
    if (k === 'k' && sel?.kind === 'nodes' && meta.editable) {
      // Type suivant de la première case, appliqué à toute la sélection.
      const first = hist.present.nodes.find((n) => n.id === sel.ids[0]);
      const current = (first?.properties?.kind ?? 'NORMAL') as NodeKind;
      apply(setNodeProperties(hist.present, sel.ids, { kind: NODE_KINDS[(NODE_KINDS.indexOf(current) + 1) % NODE_KINDS.length]! }));
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') spaceHeld = false;
  });
  window.addEventListener('beforeunload', (e) => {
    if (isDirty(hist)) e.preventDefault();
  });
  window.addEventListener('resize', () => redraw());

  // --- Fichiers ---
  async function save(): Promise<boolean> {
    if (!meta.editable) {
      notify('Plateau généré : modifier son .map.ts (tools/board-generator), ou « Enregistrer sous » une copie.', 'error');
      return false;
    }
    if (hasErrors(diagnose(hist.present, hasKey))) {
      notify('Enregistrement impossible : corriger d’abord les erreurs (panneau « Problèmes »).', 'error');
      return false;
    }
    const doc = hist.present;
    let result = await saveBoard(doc, { create: meta.isNew, ...(meta.hash ? { baseHash: meta.hash } : {}) });
    if (!result.ok && result.error === 'changed-on-disk' && confirm('Le fichier a changé sur le disque depuis son ouverture. L’écraser ?')) {
      result = await saveBoard(doc, { create: false });
    }
    if (!result.ok) {
      const reasons: Record<string, string> = {
        exists: `Le plateau ${doc.id} existe déjà : « Enregistrer sous » un autre identifiant.`,
        generated: 'Plateau généré : enregistrement refusé.',
        invalid: `Plateau refusé par le serveur : ${result.problems.join(' ; ')}`,
        'changed-on-disk': 'Enregistrement annulé.',
      };
      notify(reasons[result.error] ?? `Échec de l’enregistrement (${result.status} ${result.error}).`, 'error');
      return false;
    }
    meta.hash = result.hash;
    meta.isNew = false;
    hist = markSaved(hist, doc);
    clearTimeout(draftTimer);
    clearDraft(doc.id);
    notify(`Enregistré dans packages/content/src/data/${result.file}`);
    redraw();
    return true;
  }

  async function saveAs(): Promise<void> {
    const id = prompt('Identifiant du nouveau plateau (minuscules, chiffres, tirets) :', `${hist.present.id}-copie`)?.trim();
    if (!id) return;
    if (!BOARD_ID_PATTERN.test(id)) return notify('Identifiant invalide : minuscules, chiffres et tirets, commençant par une lettre.', 'error');
    const old = hist.present;
    const nameKey = old.nameKey === `board.${old.id}.name` || !meta.editable ? `board.${id}.name` : old.nameKey;
    const previous = { ...meta };
    Object.assign(meta, { editable: true, isNew: true, hash: undefined });
    hist = commit(hist, { ...old, id, nameKey });
    if (await save()) {
      rememberUrl(id);
    } else {
      Object.assign(meta, previous);
      hist = undo(hist);
    }
    redraw();
  }
  const rememberUrl = (id: string): void => window.history.replaceState(null, '', `?editor=${encodeURIComponent(id)}`);

  async function playtest(): Promise<void> {
    if (isDirty(hist) || meta.isNew) {
      if (!(await save())) return;
    }
    window.open(`${import.meta.env.BASE_URL}?board=${encodeURIComponent(hist.present.id)}`, '_blank');
  }

  function reopen(): void {
    if (isDirty(hist) && !confirm('Des modifications ne sont pas enregistrées (un brouillon local est conservé). Ouvrir un autre plateau ?')) return;
    location.href = `${location.pathname}?editor`;
  }

  frame();
  notify(meta.editable ? 'Prêt. Outils : V N C D P R L · Suppr · Ctrl+Z / Ctrl+S · Espace ou molette pressée : déplacer la vue.' : 'Plateau généré : lecture seule.');
}

/** Garde la sélection si ce qu'elle désigne existe encore (après annuler / rétablir). */
function keepSelection(doc: EditorDoc, selection: Selection): Selection {
  switch (selection?.kind) {
    case 'nodes': {
      const ids = selection.ids.filter((id) => doc.nodes.some((n) => n.id === id));
      return ids.length > 0 ? { kind: 'nodes', ids } : null;
    }
    case 'edge':
      return findEdge(doc, selection.ref) ? selection : null;
    case 'portal':
      return (doc.portals ?? []).some((p) => p.id === selection.id) ? selection : null;
    case 'room':
      return doc.layout?.rooms.some((r) => r.id === selection.id) ? selection : null;
    case 'corridor':
      return doc.layout?.corridors.some((c) => c.id === selection.id) ? selection : null;
    default:
      return null;
  }
}
