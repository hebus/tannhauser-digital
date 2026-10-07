import { Application, Container } from 'pixi.js';
import { BoardView, Camera } from '@tannhauser/renderer';
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

  let boardView = new BoardView(game.state.board, { showNodeIds: true });
  world.addChild(boardView);

  const camera = new Camera(world, { width: app.screen.width, height: app.screen.height });
  const fit = () => camera.fit(boardView.bounds2D());
  fit();

  const toggleIds = (() => {
    let on = true;
    return () => {
      on = !on;
      world.removeChild(boardView);
      boardView.destroy({ children: true });
      boardView = new BoardView(game.state.board, { showNodeIds: on });
      world.addChild(boardView);
    };
  })();

  window.addEventListener('resize', () => {
    camera.resize(app.screen.width, app.screen.height);
    fit();
  });

  // Entrées → actions de caméra (les actions sémantiques/rebinding viendront avec le package input).
  let dragging = false;
  app.canvas.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (dragging) camera.pan(e.movementX, e.movementY);
  });
  app.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.offsetX, e.offsetY);
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') fit();
    if (e.key === 'i' || e.key === 'I') toggleIds();
  });
}

main().catch((err: unknown) => {
  console.error(err);
  showError('Impossible de démarrer le jeu. Rechargez la page.');
});
