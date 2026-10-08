import { Application, Container } from 'pixi.js';
import {
  BoardView,
  Camera,
  CharacterLayer,
  FlagLayer,
  HighlightLayer,
  LAYOUT_NODE_RADIUS,
  NODE_RADIUS,
  OverlayLayer,
  Presentation,
  ReducedMotion,
  type BannerKind,
  type BannerPlan,
  buildPathPreview,
  textScaleForZoom,
} from '@tannhauser/renderer';
import { getLegalActions, type GameState } from '@tannhauser/core';
import { describeEvent } from './event-text';
import { adjustHealth, freeNodes, relocateCharacter, resetActivation, switchOwner, type EditResult } from './editor/edit-state';
import { startAiDriver } from './ai-driver';
import type { GameFacade } from './game-facade';
import { bannerText } from './ui/banner-text';
import { createLabeler } from './ui/labels';
import { startFromSetup } from './ui/boot';
import { detectLocale, hasKey, setLocale, t } from './ui/i18n';
import { mountUi } from './ui/mount';

function showError(message: string): void {
  const el = document.getElementById('error');
  if (el) {
    el.textContent = message;
    el.style.display = 'grid';
  }
}

async function main(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('Conteneur #app introuvable');

  const app = new Application();
  await app.init({ resizeTo: window, background: 0x14161a, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
  host.appendChild(app.canvas);

  // Mise en place (ou configuration lue dans l'URL) puis HUD : voir ui/boot.ts et ui/mount.ts.
  // Plateau de démonstration non orthogonal : développement uniquement (`?demoBoard=castle`), sans écran de mise en place.
  const demoBoard = import.meta.env.DEV ? new URLSearchParams(location.search).get('demoBoard') : null;
  let game: GameFacade;
  if (demoBoard === 'castle') {
    await import('../ui.css');
    setLocale(detectLocale(location.search));
    game = (await import('./fixtures/castle-demo')).createCastleDemoFacade();
  } else {
    game = await startFromSetup();
  }
  // Débogage de la frise des phases : `?debugPhase=activation` fait passer les joueurs (PASS_OVERWATCH) jusqu'à la
  // phase d'activation, pour la voir sans jouer. Commandes ordinaires, aucune règle contournée.
  if (new URLSearchParams(location.search).get('debugPhase') === 'activation') {
    for (let guard = 0; guard < 8 && game.state.phase === 'OVERWATCH' && game.state.turn.activePlayerId; guard += 1) {
      game.dispatch({ type: 'PASS_OVERWATCH', playerId: game.state.turn.activePlayerId });
    }
  }
  let presentationRef: Presentation | null = null;
  const ui = mountUi(game, {
    whenIdle: (callback) => (presentationRef ? presentationRef.onIdle(callback) : callback()),
  });
  // Libellés de la mise en page (noms de pièces) : traduction si la clé existe, sinon la clé telle quelle.
  const label = (key: string): string => (hasKey(key) ? t(key) : key);
  const world = new Container();
  app.stage.addChild(world);

  let showIds = true;
  let boardView = new BoardView(game.state.board, { showNodeIds: showIds, layout: game.layout, label });
  const doorSignature = (board: GameState['board']): string =>
    Object.values(board.doors).map((d) => `${d.id}:${d.state}`).join('|');
  let shownDoors = doorSignature(game.state.board);
  /** Redessine le plateau (ids, état des portes) : une porte ouverte ou fermée doit changer de dessin. */
  const rebuildBoardView = (): void => {
    world.removeChild(boardView);
    boardView.destroy({ children: true });
    boardView = new BoardView(game.state.board, { showNodeIds: showIds, layout: game.layout, label });
    world.addChildAt(boardView, 0);
    shownDoors = doorSignature(game.state.board);
  };
  const highlight = new HighlightLayer(game.state.board);
  const overlays = new OverlayLayer(game.state.board);
  const characters = new CharacterLayer();
  const flags = new FlagLayer(game.layout ? LAYOUT_NODE_RADIUS : NODE_RADIUS);
  const reducedMotion = new ReducedMotion();
  // Débogage des bannières : `?debugBanner=1` (ou un type : turnStart, overwatchPhase, activationPhase, turnOf,
  // reaction, victory) affiche une bannière figée au démarrage, qui reste jusqu'à la suivante.
  const debugBanner = new URLSearchParams(location.search).get('debugBanner');
  const presentation = new Presentation({
    characters,
    reducedMotion,
    screenSize: () => ({ width: app.screen.width, height: app.screen.height }),
    bannerText: (plan) => bannerText(plan, createLabeler(game.state)),
    holdBanners: debugBanner !== null,
  });
  // Les styles du HUD (frise des phases) respectent aussi la bascule « mouvement réduit » (touche R).
  const syncReducedMotionAttr = (reduced: boolean): void => {
    document.documentElement.dataset.reducedMotion = String(reduced);
  };
  syncReducedMotionAttr(reducedMotion.value);
  const unsubscribeReducedAttr = reducedMotion.subscribe(syncReducedMotionAttr);
  presentationRef = presentation;
  world.addChild(boardView, highlight, overlays, flags, characters, presentation.worldLayer);
  // Bannières et avis : dessinés sur un second canevas transparent posé AU-DESSUS du HUD (qui est en DOM) ; il laisse passer les clics.
  const overlayApp = new Application();
  await overlayApp.init({ resizeTo: window, backgroundAlpha: 0, antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
  Object.assign(overlayApp.canvas.style, { position: 'fixed', inset: '0', zIndex: '1000', pointerEvents: 'none' });
  document.body.appendChild(overlayApp.canvas);
  overlayApp.stage.addChild(presentation.screenLayer);

  // Tous les écouteurs partagent ce signal : un seul `abort()` libère tout (pas de fuite).
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const tickAnimations = (ticker: { deltaMS: number }): void => presentation.tick(ticker.deltaMS, performance.now());
  app.ticker.add(tickAnimations);

  const camera = new Camera(world, { width: app.screen.width, height: app.screen.height });
  const syncTextScale = () => {
    const k = textScaleForZoom(camera.zoom);
    characters.setTextScale(k);
    presentation.setTextScale(k);
    return k;
  };
  const fit = () => {
    const { left, right, top } = ui.insets();
    camera.resize(Math.max(200, app.screen.width - left - right), Math.max(200, app.screen.height - top));
    camera.fit(boardView.bounds2D());
    camera.pan(left, top);
    camera.resize(app.screen.width, app.screen.height);
    fitZoom = camera.zoom;
    syncTextScale();
    updatePath();
  };

  let fitZoom = camera.zoom;
  let cameraTween: ((ticker: { deltaMS: number }) => void) | null = null;
  const cancelCameraTween = (): void => {
    if (cameraTween) app.ticker.remove(cameraTween);
    cameraTween = null;
  };
  /** Centre la caméra sur un nœud (animation courte ; instantané en mouvement réduit). */
  const focusNode = (nodeId: string): void => {
    const n = game.state.board.nodes[nodeId];
    if (!n) return;
    const { left, right, top } = ui.insets();
    const cx = left + (app.screen.width - left - right) / 2;
    const cy = top + (app.screen.height - top) / 2;
    const z = camera.zoom;
    const tx = cx - n.x * z;
    const ty = cy - n.y * z;
    cancelCameraTween();
    if (reducedMotion.value) {
      world.position.set(tx, ty);
      updatePath();
      return;
    }
    const sx = world.x;
    const sy = world.y;
    let elapsed = 0;
    const duration = 450;
    const step = (ticker: { deltaMS: number }): void => {
      elapsed += ticker.deltaMS;
      const p = Math.min(1, elapsed / duration);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      world.position.set(sx + (tx - sx) * e, sy + (ty - sy) * e);
      updatePath();
      if (p >= 1) cancelCameraTween();
    };
    cameraTween = step;
    app.ticker.add(step);
  };

  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const log = (text: string) => {
    if (!logEl) return;
    const li = document.createElement('li');
    li.textContent = text;
    logEl.prepend(li);
    while (logEl.children.length > 10) logEl.lastElementChild?.remove();
  };

  const activePlayer = () => game.state.turn.activePlayerId;
  const activeCharacter = () => game.state.characters.find((c) => c.id === game.state.turn.activeCharacterId);

  let showLos = false;
  let hoverNode: string | null = null;
  let reachableNow: ReturnType<GameFacade['reachable']> = [];

  /** Aperçu de chemin : uniquement vers un nœud atteignable (liste du moteur) ; sinon aucun tracé. */
  function updatePath(): void {
    const active = activeCharacter();
    const preview = active ? buildPathPreview(game.state.board, active.nodeId, reachableNow, hoverNode) : null;
    overlays.showPath(preview, textScaleForZoom(camera.zoom));
  }

  let editor = false;
  let editorPick: string | null = null;
  const refreshEditor = (): void => {
    if (!editor) return;
    const picked = game.state.characters.find((c) => c.id === editorPick);
    highlight.show(picked ? freeNodes(game.state, picked.id) : []);
    overlays.showTargets(picked ? [picked.nodeId] : []);
    overlays.showPath(null, 1);
  };
  const refresh = () => {
    const s = game.state;
    characters.update(s);
    flags.update(s);
    const active = activeCharacter();
    const reachable = active && !s.turn.reaction ? game.reachable(active.id) : [];
    reachableNow = reachable;
    highlight.show(reachable.map((r) => r.nodeId));
    overlays.showTargets(active ? game.targetable(active.id).map((t) => t.nodeId) : []);
    overlays.showLineOfSight(active && showLos ? active.nodeId : null, active && showLos ? game.visibleFrom(active.id) : null);
    updatePath();
    const cp = s.players.map((p) => `${p.id}: ${p.commandPoints} PC`).join(' · ');
    const reaction = s.turn.reaction ? ` — RÉACTION : ${s.turn.reaction.forPlayerId} (T = tirer, D = refuser)` : '';
    const phaseText = s.phase === 'OVERWATCH' ? ' — PHASE OVERWATCH : un personnage ou passer (P = passer)' : '';
    const activeText = active ? ` · actif : ${active.id}${s.turn.actionUsed ? ' (action utilisée)' : ''}` : '';
    const text =
      s.phase === 'FINISHED'
        ? `Partie terminée : victoire de ${s.victory.winnerId}`
        : `Tour ${s.turn.number} · joue ${activePlayer()} · ${cp}${activeText}${phaseText}${reaction}`;
    if (statusEl) statusEl.textContent = editor ? `ÉDITEUR · ${text}` : text;
    refreshEditor();
  };

  let shown: GameState = game.state;
  const unsubscribeGame = game.subscribe((events, state) => {
    // Les animations sont lancées avant la mise à jour des pions (positions de départ) ; elles ne touchent pas à l'état.
    presentation.play(events, shown, state);
    const before = shown;
    shown = state;
    if (doorSignature(state.board) !== shownDoors) rebuildBoardView();
    // Début d'une activation à venir : la caméra va vers le premier personnage activable de l'équipe qui joue,
    // une fois les animations terminées (utile quand on a zoomé : plus besoin de chercher ses pions à la souris).
    const awaitingSelection =
      state.phase === 'ACTIVATION' &&
      state.turn.activeCharacterId === undefined &&
      (before.phase !== 'ACTIVATION' || before.turn.activePlayerId !== state.turn.activePlayerId || before.turn.activeCharacterId !== undefined);
    if (awaitingSelection) {
      presentation.onIdle(() => {
        const cur = game.state;
        if (cur.phase !== 'ACTIVATION' || cur.turn.activeCharacterId !== undefined) return;
        const next = cur.characters.find((c) => c.playerId === cur.turn.activePlayerId && c.alive && !c.activated && !c.overwatch);
        // Plateau entièrement visible (zoom de cadrage) : inutile de bouger la caméra.
        if (next && camera.zoom > fitZoom * 1.1) focusNode(next.nodeId);
      });
    }
    for (const e of events) {
      const text = describeEvent(e);
      if (text) log(text);
    }
    refresh();
  });
  const send = (command: Parameters<GameFacade['dispatch']>[0]) => {
    const res = game.dispatch(command);
    if (!res.accepted) log(`✖ ${res.errors.map((e) => e.message).join(' ')}`);
    return res;
  };
  refresh();
  fit();
  if (debugBanner !== null) {
    const kinds: readonly BannerKind[] = ['turnStart', 'overwatchPhase', 'activationPhase', 'turnOf', 'reaction', 'victory'];
    const kind = kinds.find((k) => k === debugBanner) ?? 'turnStart';
    const s = game.state;
    const [first, second] = s.characters;
    const plan: BannerPlan = { kind, turn: s.turn.number, playerId: s.turn.activePlayerId, ...(first && second ? { overwatcherId: first.id, targetId: second.id } : {}) };
    presentation.announce(plan, s.players);
  }

  // Entrées → commandes. Aucune règle ici : tout passe par la façade et le moteur.
  const nodeAt = (sx: number, sy: number): string | null => {
    const wx = (sx - world.x) / world.scale.x;
    const wy = (sy - world.y) / world.scale.y;
    let best: { id: string; d: number } | null = null;
    for (const n of Object.values(game.state.board.nodes)) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= NODE_RADIUS * 1.3 && (!best || d < best.d)) best = { id: n.id, d };
    }
    return best?.id ?? null;
  };

  // Éditeur (touche X) : retouches d'état hors règles pour tester des configurations ; aucune commande du moteur.
  const applyEdit = (result: EditResult): void => {
    log(`${result.ok ? '✎' : '✖'} ${result.message}`);
    if (result.ok) game.replaceState(result.state);
  };
  const onEditorClick = (nodeId: string): void => {
    const here = game.state.characters.find((c) => c.alive && c.nodeId === nodeId);
    if (here) editorPick = here.id;
    else if (editorPick) applyEdit(relocateCharacter(game.state, editorPick, nodeId));
    refreshEditor();
  };
  const onEditorKey = (key: string): boolean => {
    if (!editorPick) return false;
    const edits: Record<string, () => EditResult> = {
      '+': () => adjustHealth(game.state, editorPick!, +1),
      '=': () => adjustHealth(game.state, editorPick!, +1),
      '-': () => adjustHealth(game.state, editorPick!, -1),
      j: () => switchOwner(game.state, editorPick!),
      n: () => resetActivation(game.state, editorPick!),
    };
    const run = edits[key];
    if (!run) return false;
    applyEdit(run());
    refreshEditor();
    return true;
  };

  const onNodeClick = (nodeId: string) => {
    if (editor) return onEditorClick(nodeId);
    const s = game.state;
    const player = activePlayer();
    if (!player || s.phase === 'FINISHED' || s.turn.reaction) return;
    const here = s.characters.filter((c) => c.alive && c.nodeId === nodeId);
    const active = activeCharacter();
    const own = here.find((c) => c.playerId === player);
    if (s.phase === 'OVERWATCH') {
      // Phase d'Overwatch : cliquer un de ses personnages tente de le mettre en Overwatch (1 PC, un seul par décision) ; le moteur explique les refus.
      if (own) send({ type: 'OVERWATCH', playerId: player, characterId: own.id });
      return;
    }
    if (!active) {
      if (own) send({ type: 'SELECT_CHARACTER', playerId: player, characterId: own.id });
      return;
    }
    const enemy = here.find((c) => c.playerId !== player);
    if (enemy) {
      // Armes utilisables fournies par la façade (checkTargeting du moteur) ; sans cible valide, on tente quand même
      // la première arme pour afficher le motif de refus du moteur dans le journal.
      const entry = game.targetable(active.id).find((t) => t.targetId === enemy.id);
      const weaponId = entry?.weaponIds[0] ?? active.weapons?.[0]?.id;
      if (weaponId) send({ type: 'ATTACK', playerId: player, attackerId: active.id, targetId: enemy.id, weaponId });
      return;
    }
    // Capture du drapeau : cliquer un drapeau ennemi au sol (sa case ou une case voisine) le récupère si le moteur l'autorise.
    const flagHere = (s.flags ?? []).find((f) => f.location.kind === 'NODE' && f.location.nodeId === nodeId && f.ownerId !== player);
    if (flagHere && getLegalActions(s, active.id).some((a) => a.id === 'CAPTURE_FLAG' && a.available && a.details?.flagIds?.includes(flagHere.id))) {
      send({ type: 'CAPTURE_FLAG', playerId: player, characterId: active.id, flagId: flagHere.id });
      return;
    }
    const target = game.reachable(active.id).find((r) => r.nodeId === nodeId);
    if (target) send({ type: 'MOVE_CHARACTER', playerId: player, characterId: active.id, path: target.path });
  };

  // Pointeurs actifs (souris, doigt, stylet) : un seul = glisser pour déplacer / cliquer ; deux = pincer pour zoomer et déplacer.
  app.canvas.style.touchAction = 'none'; // les gestes tactiles sont gérés ici, pas par le navigateur
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let multiTouch = false; // un geste à deux doigts a eu lieu : le relâchement n'est pas un clic
  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2, dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  };
  app.canvas.addEventListener(
    'pointerdown',
    (e) => {
      presentation.skip(); // un clic termine les animations en cours
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      app.canvas.setPointerCapture?.(e.pointerId);
      if (pointers.size === 1) {
        moved = 0;
        multiTouch = false;
      } else multiTouch = true;
    },
    { signal },
  );
  const endPointer = (e: PointerEvent, click: boolean) => {
    if (!pointers.has(e.pointerId)) return;
    const wasClick = click && pointers.size === 1 && !multiTouch && moved < 4;
    pointers.delete(e.pointerId);
    if (wasClick && e.target === app.canvas) {
      const id = nodeAt(e.offsetX, e.offsetY);
      if (id) onNodeClick(id);
    }
  };
  window.addEventListener('pointerup', (e) => endPointer(e, true), { signal });
  window.addEventListener('pointercancel', (e) => endPointer(e, false), { signal });
  window.addEventListener(
    'pointermove',
    (e) => {
      const prev = pointers.get(e.pointerId);
      if (prev) {
        if (pointers.size >= 2) {
          const before = pinchState();
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const after = pinchState();
          const rect = app.canvas.getBoundingClientRect();
          if (before.dist > 0) camera.zoomAt(after.dist / before.dist, after.cx - rect.left, after.cy - rect.top);
          camera.pan(after.cx - before.cx, after.cy - before.cy);
          syncTextScale();
          updatePath();
        } else {
          const dx = e.clientX - prev.x;
          const dy = e.clientY - prev.y;
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          moved += Math.abs(dx) + Math.abs(dy);
          if (moved >= 4) camera.pan(dx, dy);
        }
        return;
      }
      const next = e.target === app.canvas ? nodeAt(e.offsetX, e.offsetY) : null;
      if (next !== hoverNode) {
        hoverNode = next;
        updatePath();
      }
    },
    { signal },
  );
  app.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.offsetX, e.offsetY);
      syncTextScale();
      updatePath();
    },
    { passive: false, signal },
  );
  window.addEventListener(
    'resize',
    () => {
      camera.resize(app.screen.width, app.screen.height);
      fit();
    },
    { signal },
  );

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === ' ') {
      e.preventDefault();
      presentation.skip();
      return;
    }
    if (key === 'x') {
      editor = !editor;
      editorPick = null;
      refresh();
      refreshEditor();
      presentation.notify(t('banner.notice.editor', { state: t(editor ? 'banner.notice.on' : 'banner.notice.off') }));
      return;
    }
    if (editor && onEditorKey(key)) {
      e.preventDefault();
      return;
    }
    if (key === 'l') {
      showLos = !showLos;
      refresh();
      presentation.notify(t('banner.notice.los', { state: t(showLos ? 'banner.notice.shown' : 'banner.notice.hidden') }));
      return;
    }
    if (key === 'r') {
      const reduced = reducedMotion.toggle();
      presentation.notify(t('banner.notice.reducedMotion', { state: t(reduced ? 'banner.notice.on' : 'banner.notice.off') }));
      return;
    }
    const player = activePlayer();
    const s = game.state;
    const reaction = s.turn.reaction;
    if (key === 'c') fit();
    else if (key === 'i') {
      showIds = !showIds;
      rebuildBoardView();
    } else if (reaction && (key === 't' || key === 'd')) {
      const ow = s.characters.find((c) => c.id === reaction.overwatcherId);
      if (key === 'd') send({ type: 'OVERWATCH_DECLINE', playerId: reaction.forPlayerId });
      else if (ow) {
        for (const w of ow.weapons ?? []) {
          if (send({ type: 'OVERWATCH_FIRE', playerId: reaction.forPlayerId, weaponId: w.id }).accepted) break;
        }
      }
    } else if (player && key === 'e') {
      // Phase d'Overwatch : E passe (comme P) ; sinon fin d'activation.
      send(s.phase === 'OVERWATCH' ? { type: 'PASS_OVERWATCH', playerId: player } : { type: 'END_TURN', playerId: player });
    } else if (player && key === 'p') send(s.phase === 'OVERWATCH' ? { type: 'PASS_OVERWATCH', playerId: player } : { type: 'PASS', playerId: player });
    else if (player && key === 'o') {
      // O n'agit qu'en phase d'Overwatch : on tente le premier personnage disponible ; hors phase, le moteur refuse
      // (avec le motif « l'Overwatch se place avant les activations ») et le HUD l'affiche.
      const own = s.characters.filter((c) => c.playerId === player && c.alive);
      const candidate = own.find((c) => getLegalActions(s, c.id).some((a) => a.id === 'OVERWATCH' && a.available)) ?? own[0];
      if (candidate) send({ type: 'OVERWATCH', playerId: player, characterId: candidate.id });
    }
  }, { signal });

  // Joueurs pilotés par l'IA : elle joue quand les animations sont terminées ; les erreurs vont au journal.
  const stopAi = startAiDriver(game, { whenIdle: (cb) => presentation.onIdle(cb), onError: (m) => log(`✖ ${m}`) });

  const cleanup = (): void => {
    stopAi();
    lifetime.abort();
    unsubscribeGame();
    app.ticker.remove(tickAnimations);
    presentation.destroy();
    unsubscribeReducedAttr();
    reducedMotion.destroy();
    overlayApp.destroy(true, { children: true });
    app.destroy(true, { children: true });
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  import.meta.hot?.dispose(cleanup);
}

main().catch((err: unknown) => {
  console.error(err);
  showError('Impossible de démarrer le jeu. Rechargez la page.');
});