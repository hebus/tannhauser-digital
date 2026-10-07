import { Application, Container } from 'pixi.js';
import {
  BoardView,
  Camera,
  CharacterLayer,
  HighlightLayer,
  NODE_RADIUS,
  OverlayLayer,
  Presentation,
  ReducedMotion,
  buildPathPreview,
  textScaleForZoom,
} from '@tannhauser/renderer';
import { getLegalActions, type GameState } from '@tannhauser/core';
import { describeEvent } from './event-text';
import type { GameFacade } from './game-facade';
import { startFromSetup } from './ui/boot';
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
  const game = await startFromSetup();
  const ui = mountUi(game);
  const world = new Container();
  app.stage.addChild(world);

  let showIds = true;
  let boardView = new BoardView(game.state.board, { showNodeIds: showIds });
  const highlight = new HighlightLayer(game.state.board);
  const overlays = new OverlayLayer(game.state.board);
  const characters = new CharacterLayer();
  const reducedMotion = new ReducedMotion();
  const presentation = new Presentation({
    characters,
    reducedMotion,
    screenSize: () => ({ width: app.screen.width, height: app.screen.height }),
  });
  world.addChild(boardView, highlight, overlays, characters, presentation.worldLayer);
  app.stage.addChild(presentation.screenLayer);

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
    const { left, right } = ui.insets();
    camera.resize(Math.max(200, app.screen.width - left - right), app.screen.height);
    camera.fit(boardView.bounds2D());
    camera.pan(left, 0);
    camera.resize(app.screen.width, app.screen.height);
    syncTextScale();
    updatePath();
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

  const refresh = () => {
    const s = game.state;
    characters.update(s);
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
    if (statusEl) statusEl.textContent = text;
  };

  let shown: GameState = game.state;
  const unsubscribeGame = game.subscribe((events, state) => {
    // Les animations sont lancées avant la mise à jour des pions (positions de départ) ; elles ne touchent pas à l'état.
    presentation.play(events, shown, state);
    shown = state;
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

  const onNodeClick = (nodeId: string) => {
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
    const target = game.reachable(active.id).find((r) => r.nodeId === nodeId);
    if (target) send({ type: 'MOVE_CHARACTER', playerId: player, characterId: active.id, path: target.path });
  };

  let dragging = false;
  let moved = 0;
  app.canvas.addEventListener(
    'pointerdown',
    () => {
      presentation.skip(); // un clic termine les animations en cours
      dragging = true;
      moved = 0;
    },
    { signal },
  );
  window.addEventListener(
    'pointerup',
    (e) => {
      const wasClick = dragging && moved < 4;
      dragging = false;
      if (wasClick && e.target === app.canvas) {
        const id = nodeAt(e.offsetX, e.offsetY);
        if (id) onNodeClick(id);
      }
    },
    { signal },
  );
  window.addEventListener(
    'pointermove',
    (e) => {
      if (dragging) {
        moved += Math.abs(e.movementX) + Math.abs(e.movementY);
        if (moved >= 4) camera.pan(e.movementX, e.movementY);
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
    if (key === 'l') {
      showLos = !showLos;
      refresh();
      presentation.notify(`Ligne de vue : ${showLos ? 'affichée' : 'masquée'}`);
      return;
    }
    if (key === 'r') {
      const reduced = reducedMotion.toggle();
      presentation.notify(`Mouvement réduit : ${reduced ? 'activé' : 'désactivé'}`);
      return;
    }
    const player = activePlayer();
    const s = game.state;
    const reaction = s.turn.reaction;
    if (key === 'c') fit();
    else if (key === 'i') {
      showIds = !showIds;
      world.removeChild(boardView);
      boardView.destroy({ children: true });
      boardView = new BoardView(game.state.board, { showNodeIds: showIds });
      world.addChildAt(boardView, 0);
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

  const cleanup = (): void => {
    lifetime.abort();
    unsubscribeGame();
    app.ticker.remove(tickAnimations);
    presentation.destroy();
    reducedMotion.destroy();
    app.destroy(true, { children: true });
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  import.meta.hot?.dispose(cleanup);
}

main().catch((err: unknown) => {
  console.error(err);
  showError('Impossible de démarrer le jeu. Rechargez la page.');
});