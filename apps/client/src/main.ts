import { ReducedMotion, buildPathPreview, createPixiRenderer, type BannerKind, type BannerPlan, type BoardRenderer } from '@tannhauser/renderer';
import { activationHasActed, explosionZone, getLegalActions, type GameState } from '@tannhauser/core';
import { describeEvent } from './event-text';
import { adjustHealth, freeNodes, relocateCharacter, resetActivation, switchOwner, type EditResult } from './editor/edit-state';
import { startAiDriver } from './ai-driver';
import type { GameFacade } from './game-facade';
import { bannerText } from './ui/banner-text';
import { createLabeler } from './ui/labels';
import { startFromSetup } from './ui/boot';
import { detectLocale, hasKey, setLocale, t } from './ui/i18n';
import { enforceLandscape } from './ui/landscape';
import { mountUi } from './ui/mount';
import { cancelTargeting, getTargeting, isTargetable, subscribeTargeting } from './ui/targeting';

function showError(message: string): void {
  const el = document.getElementById('error');
  if (el) {
    el.textContent = message;
    el.style.display = 'grid';
  }
}

async function main(): Promise<void> {
  enforceLandscape();
  const host = document.getElementById('app');
  if (!host) throw new Error('Conteneur #app introuvable');

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
  // Débogage de la fumée : `?debugSmoke=1` pose deux fumées (2 tours restants, puis 1) sur des cases praticables (effets SMOKE de l'état), pour les voir sans jouer.
  if (new URLSearchParams(location.search).get('debugSmoke') !== null) {
    const nodes = Object.values(game.state.board.nodes).filter((n) => n.properties.passable);
    const picks = [nodes[Math.floor(nodes.length / 3)], nodes[Math.floor(nodes.length / 2)]].flatMap((n) => (n ? [n] : []));
    game.replaceState({ ...game.state, effects: [...game.state.effects, ...picks.map((n, i) => ({ id: `debug-smoke-${i}`, type: 'SMOKE' as const, origin: n.id, remainingTurns: 2 - i }))] });
  }
  let rendererRef: BoardRenderer | null = null;
  const ui = mountUi(game, {
    whenIdle: (callback) => (rendererRef ? rendererRef.presentation.onIdle(callback) : callback()),
  });
  // Libellés de la mise en page (noms de pièces) : traduction si la clé existe, sinon la clé telle quelle.
  const label = (key: string): string => (hasKey(key) ? t(key) : key);

  let showIds = false;
  const reducedMotion = new ReducedMotion();
  // Débogage des bannières : `?debugBanner=1` (ou un type : turnStart, overwatchPhase, activationPhase, turnOf,
  // reaction, victory) affiche une bannière figée au démarrage, qui reste jusqu'à la suivante.
  const debugBanner = new URLSearchParams(location.search).get('debugBanner');
  // Le rendu (ici Pixi 2D) est choisi par sa fabrique : le client ne parle qu'au contrat `BoardRenderer`.
  const renderer = createPixiRenderer({
    board: game.state.board,
    layout: game.layout,
    label,
    reducedMotion,
    insets: () => ui.insets(),
    characterLabels: (s) => createLabeler(s).character,
    bannerText: (plan) => bannerText(plan, createLabeler(game.state)),
    calloutText: (tone) => t(`callout.${tone}`),
    holdBanners: debugBanner !== null,
    events: {
      onPick: (nodeId) => onNodeClick(nodeId),
      onHover: (nodeId) => {
        hoverNode = nodeId;
        updatePath();
        previewBlast();
      },
      onInteract: () => renderer.presentation.skip(),
    },
  });
  const presentation = renderer.presentation;
  await renderer.init(host);
  // Les styles du HUD (frise des phases) respectent aussi la bascule « mouvement réduit » (touche R).
  const syncReducedMotionAttr = (reduced: boolean): void => {
    document.documentElement.dataset.reducedMotion = String(reduced);
  };
  syncReducedMotionAttr(reducedMotion.value);
  const unsubscribeReducedAttr = reducedMotion.subscribe(syncReducedMotionAttr);
  rendererRef = renderer;

  ui.onLayoutChange(() => renderer.fit());

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

  /** Aperçu de la zone touchée par la case survolée : case + voisines pour une grenade, la case seule pour un fumigène. */
  function previewBlast(): void {
    const throwing = getTargeting();
    if (!throwing) return;
    const over = hoverNode !== null && isTargetable(hoverNode) ? hoverNode : null;
    renderer.showTargets(over ? (throwing.smoke ? [over] : explosionZone(game.state.board, over)) : []);
  }

  /** Aperçu de chemin : uniquement vers un nœud atteignable (liste du moteur) ; sinon aucun tracé. */
  function updatePath(): void {
    const active = activeCharacter();
    const preview = active ? buildPathPreview(game.state.board, active.nodeId, reachableNow, hoverNode) : null;
    renderer.showPath(preview);
  }

  let editor = false;
  let editorPick: string | null = null;
  const refreshEditor = (): void => {
    if (!editor) return;
    const picked = game.state.characters.find((c) => c.id === editorPick);
    renderer.showReachable(picked ? freeNodes(game.state, picked.id) : []);
    renderer.showTargets(picked ? [picked.nodeId] : []);
    renderer.showPath(null);
  };
  const refresh = () => {
    const s = game.state;
    renderer.update(s);
    const active = activeCharacter();
    // Ciblage d'une grenade : seul le lanceur actif peut encore viser ; sinon on quitte le mode (changement de tour, action utilisée…).
    const aiming = getTargeting();
    if (aiming && (!active || active.id !== aiming.characterId || s.turn.actionUsed || s.turn.reaction || s.phase === 'FINISHED')) cancelTargeting();
    const throwing = getTargeting();
    const reachable = active && !s.turn.reaction && !throwing ? game.reachable(active.id) : [];
    reachableNow = reachable;
    if (throwing) {
      // Cases visables (orange) ; la zone touchée par la case survolée s'affiche en cibles (voir `previewBlast`).
      renderer.showReachable(throwing.nodeIds, 'throw');
      previewBlast();
    } else {
      renderer.showReachable(reachable.map((r) => r.nodeId));
      renderer.showTargets(active ? game.targetable(active.id).map((t) => t.nodeId) : []);
    }
    renderer.showLineOfSight(active && showLos ? active.nodeId : null, active && showLos ? game.visibleFrom(active.id) : null);
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
        if (next && renderer.isZoomedIn()) renderer.focusNode(next.nodeId);
      });
    }
    for (const e of events) {
      const text = describeEvent(e);
      if (text) log(text);
    }
    refresh();
  });
  const unsubscribeTargeting = subscribeTargeting(() => refresh());
  const send = (command: Parameters<GameFacade['dispatch']>[0]) => {
    const res = game.dispatch(command);
    if (!res.accepted) log(`✖ ${res.errors.map((e) => e.message).join(' ')}`);
    return res;
  };
  refresh();
  renderer.fit();
  if (debugBanner !== null) {
    const kinds: readonly BannerKind[] = ['turnStart', 'overwatchPhase', 'activationPhase', 'turnOf', 'reaction', 'victory'];
    const kind = kinds.find((k) => k === debugBanner) ?? 'turnStart';
    const s = game.state;
    const [first, second] = s.characters;
    const plan: BannerPlan = { kind, turn: s.turn.number, playerId: s.turn.activePlayerId, ...(first && second ? { overwatcherId: first.id, targetId: second.id } : {}) };
    presentation.announce(plan, s.players);
  }

  // Entrées → commandes. Aucune règle ici : tout passe par la façade et le moteur.

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
    // Choix de la case d'une grenade au clic : une case visable lance, toute autre case est signalée sans rien lancer.
    const aiming = getTargeting();
    if (aiming && player) {
      if (isTargetable(nodeId)) {
        cancelTargeting();
        send({ type: 'THROW_GRENADE', playerId: player, characterId: aiming.characterId, equipmentId: aiming.equipmentId, nodeId });
      } else presentation.notify(t('actions.grenade.invalid'));
      return;
    }
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
    // Avant d'avoir agi ni bougé, cliquer un autre de ses personnages change l'activation (le moteur annule la précédente).
    if (own && own.id !== active.id && !activationHasActed(s)) {
      send({ type: 'SELECT_CHARACTER', playerId: player, characterId: own.id });
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

  // Tous les écouteurs partagent ce signal : un seul `abort()` libère tout (pas de fuite).
  const lifetime = new AbortController();
  const { signal } = lifetime;

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
    // Débogage de l'explosion : avec `?debugExplosion=1`, K fait exploser la case survolée (à défaut, celle du personnage actif).
    if (key === 'k' && new URLSearchParams(location.search).get('debugExplosion') !== null) {
      const nodeId = hoverNode ?? activeCharacter()?.nodeId ?? Object.keys(game.state.board.nodes)[0];
      if (nodeId) presentation.explode(nodeId, game.state);
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
    if (key === 'c') renderer.fit();
    else if (key === 'i') {
      showIds = !showIds;
      renderer.setShowNodeIds(showIds);
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
    unsubscribeTargeting();
    cancelTargeting();
    unsubscribeReducedAttr();
    renderer.destroy();
    reducedMotion.destroy();
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  import.meta.hot?.dispose(cleanup);
}

main().catch((err: unknown) => {
  console.error(err);
  showError('Impossible de démarrer le jeu. Rechargez la page.');
});