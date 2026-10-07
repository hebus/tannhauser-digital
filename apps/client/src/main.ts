import { Application, Container } from 'pixi.js';
import { BoardView, Camera, CharacterLayer, HighlightLayer, NODE_RADIUS } from '@tannhauser/renderer';
import { describeEvent } from './event-text';
import { GameFacade } from './game-facade';

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

  const game = GameFacade.createDev();
  const world = new Container();
  app.stage.addChild(world);

  let showIds = true;
  let boardView = new BoardView(game.state.board, { showNodeIds: showIds });
  const highlight = new HighlightLayer(game.state.board);
  const characters = new CharacterLayer();
  world.addChild(boardView, highlight, characters);

  const camera = new Camera(world, { width: app.screen.width, height: app.screen.height });
  const fit = () => camera.fit(boardView.bounds2D());
  fit();

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

  const refresh = () => {
    const s = game.state;
    characters.update(s);
    const active = activeCharacter();
    const reachable = active && !s.turn.reaction ? game.reachable(active.id) : [];
    highlight.show(reachable.map((r) => r.nodeId));
    const cp = s.players.map((p) => `${p.id}: ${p.commandPoints} PC`).join(' · ');
    const reaction = s.turn.reaction ? ` — RÉACTION : ${s.turn.reaction.forPlayerId} (T = tirer, D = refuser)` : '';
    const activeText = active ? ` · actif : ${active.id}${s.turn.actionUsed ? ' (action utilisée)' : ''}` : '';
    const text =
      s.phase === 'FINISHED'
        ? `Partie terminée : victoire de ${s.victory.winnerId}`
        : `Tour ${s.turn.number} · joue ${activePlayer()} · ${cp}${activeText}${reaction}`;
    if (statusEl) statusEl.textContent = text;
  };

  game.subscribe((events) => {
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
    if (!active) {
      if (own) send({ type: 'SELECT_CHARACTER', playerId: player, characterId: own.id });
      return;
    }
    const enemy = here.find((c) => c.playerId !== player);
    if (enemy) {
      // Prototype : on essaie les armes du personnage jusqu'à ce que le moteur accepte l'attaque.
      for (const w of active.weapons ?? []) {
        if (send({ type: 'ATTACK', playerId: player, attackerId: active.id, targetId: enemy.id, weaponId: w.id }).accepted) return;
      }
      return;
    }
    const target = game.reachable(active.id).find((r) => r.nodeId === nodeId);
    if (target) send({ type: 'MOVE_CHARACTER', playerId: player, characterId: active.id, path: target.path });
  };

  let dragging = false;
  let moved = 0;
  app.canvas.addEventListener('pointerdown', () => {
    dragging = true;
    moved = 0;
  });
  window.addEventListener('pointerup', (e) => {
    const wasClick = dragging && moved < 4;
    dragging = false;
    if (wasClick && e.target === app.canvas) {
      const id = nodeAt(e.offsetX, e.offsetY);
      if (id) onNodeClick(id);
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (moved >= 4) camera.pan(e.movementX, e.movementY);
  });
  app.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.offsetX, e.offsetY);
    },
    { passive: false },
  );
  window.addEventListener('resize', () => {
    camera.resize(app.screen.width, app.screen.height);
    fit();
  });

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
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
    } else if (player && key === 'e') send({ type: 'END_TURN', playerId: player });
    else if (player && key === 'p') send({ type: 'PASS', playerId: player });
    else if (player && key === 'o') {
      const a = activeCharacter();
      if (a) send({ type: 'OVERWATCH', playerId: player, characterId: a.id });
    }
  });
}

main().catch((err: unknown) => {
  console.error(err);
  showError('Impossible de démarrer le jeu. Rechargez la page.');
});
