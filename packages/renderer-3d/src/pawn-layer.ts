import * as THREE from 'three';
import type { CharacterState, GameState } from '@tannhauser/core';
import { carriedOwnerIndexes } from '@tannhauser/renderer/src/flag-model';
import { playerColor } from '@tannhauser/renderer/src/palette';
import type { Point } from '@tannhauser/renderer/src/presentation/path-geometry';
import { createPennant } from './flags-3d';
import { clearGroup, createTextSprite, setOpacity } from './three-util';

/** Surcharge d'affichage d'un pion (animations) : coordonnées plateau, `lift` = hauteur au-dessus du sol. */
export interface PawnDisplay {
  x?: number | undefined;
  y?: number | undefined;
  dx?: number | undefined;
  dy?: number | undefined;
  alpha?: number | undefined;
  lift?: number | undefined;
}

const MAX_NAME_CHARS = 16;
const DEAD_COLOR = 0x555555;

interface Pawn {
  readonly root: THREE.Group;
  /** Corps seul (cible du picking, `userData.characterId`). */
  readonly picks: THREE.Mesh[];
  /** Éléments qui bougent à chaque image : repère « actif » et anneau d'Overwatch. */
  chevron: THREE.Object3D | null;
  ring: THREE.Object3D | null;
  height: number;
}

const defaultName = (c: CharacterState): string => c.definitionId.split('.').pop() ?? c.id;

/** Corps de pion : la forme dépend du joueur (rond, losange, carré, triangle) pour se lire sans la couleur. */
function bodyGeometry(playerIndex: number): { geometry: THREE.BufferGeometry; height: number } {
  switch (((playerIndex % 4) + 4) % 4) {
    case 0:
      return { geometry: new THREE.CylinderGeometry(11, 13, 28, 16).translate(0, 14, 0), height: 28 };
    case 1:
      return { geometry: new THREE.OctahedronGeometry(15).scale(1, 1.4, 1).translate(0, 21, 0), height: 42 };
    case 2:
      return { geometry: new THREE.BoxGeometry(22, 28, 22).translate(0, 14, 0), height: 28 };
    default:
      return { geometry: new THREE.ConeGeometry(15, 34, 3).translate(0, 17, 0), height: 34 };
  }
}

/**
 * Pions : un groupe par personnage, positionné d'après l'état ; des surcharges d'affichage (`setDisplay`) servent aux
 * animations sans jamais toucher à l'état. Mêmes rôles que `CharacterLayer` du rendu 2D, en volume.
 */
export class PawnLayer {
  readonly group = new THREE.Group();

  private readonly pawns = new Map<string, Pawn>();
  private readonly base = new Map<string, Point>();
  private readonly display = new Map<string, PawnDisplay>();
  private readonly alive = new Map<string, boolean>();
  private readonly nodeOfCharacter = new Map<string, string>();

  update(state: GameState, nameOf: (id: string) => string | undefined = () => undefined): void {
    const playerIndex = new Map(state.players.map((p, i) => [p.id, i]));
    const seen = new Set<string>();
    // Plusieurs personnages sur un même nœud : décalage pour rester lisibles.
    const perNode = new Map<string, number>();
    for (const c of state.characters) {
      const node = state.board.nodes[c.nodeId];
      if (!node) continue;
      seen.add(c.id);
      const slot = perNode.get(c.nodeId) ?? 0;
      perNode.set(c.nodeId, slot + 1);
      let pawn = this.pawns.get(c.id);
      if (!pawn) {
        pawn = { root: new THREE.Group(), picks: [], chevron: null, ring: null, height: 30 };
        this.pawns.set(c.id, pawn);
        this.group.add(pawn.root);
      }
      this.fill(pawn, c, state, playerIndex.get(c.playerId) ?? 0, nameOf(c.id) ?? defaultName(c));
      this.alive.set(c.id, c.alive);
      this.nodeOfCharacter.set(c.id, c.nodeId);
      this.base.set(c.id, { x: node.x + slot * 16, y: node.y - slot * 6 });
      this.place(c.id);
    }
    for (const [id, pawn] of [...this.pawns]) {
      if (seen.has(id)) continue;
      this.group.remove(pawn.root);
      clearGroup(pawn.root);
      this.pawns.delete(id);
      for (const map of [this.base, this.display, this.alive, this.nodeOfCharacter] as Map<string, unknown>[]) map.delete(id);
    }
  }

  /** Cibles du picking : tous les corps, `userData.characterId` renseigné. */
  pickables(): THREE.Mesh[] {
    return [...this.pawns.values()].flatMap((p) => p.picks);
  }

  /** Nœud (d'après l'état) d'un personnage. */
  nodeOf(characterId: string): string | undefined {
    return this.nodeOfCharacter.get(characterId);
  }

  /** Positions monde (à hauteur de poitrine) des pions visibles : les murs qui les masquent sont percés. */
  chestPositions(): THREE.Vector3[] {
    return [...this.pawns.values()].filter((p) => p.root.visible).map((p) => p.root.position.clone().add(new THREE.Vector3(0, p.height * 0.6, 0)));
  }

  /** Position affichée (surcharge d'animation comprise) d'un personnage, en coordonnées plateau. */
  tokenPosition(id: string): Point | null {
    const pawn = this.pawns.get(id);
    return pawn ? { x: pawn.root.position.x, y: pawn.root.position.z } : null;
  }

  /** Position issue de l'état, sans animation. */
  basePosition(id: string): Point | null {
    return this.base.get(id) ?? null;
  }

  /** Fusionne `patch` dans la surcharge d'affichage ; `null` la retire (retour à l'état). */
  setDisplay(id: string, patch: PawnDisplay | null): void {
    if (patch === null) this.display.delete(id);
    else this.display.set(id, { ...this.display.get(id), ...patch });
    this.place(id);
  }

  clearDisplay(): void {
    const ids = [...this.display.keys()];
    this.display.clear();
    for (const id of ids) this.place(id);
  }

  /** Pulsation des anneaux d'Overwatch et balancement du repère « actif » ; figés en mouvement réduit. */
  tick(timeMs: number, reduced: boolean): void {
    for (const pawn of this.pawns.values()) {
      if (pawn.ring) pawn.ring.scale.setScalar(1 + (reduced ? 0 : 0.1 * Math.sin(timeMs / 260)));
      if (pawn.chevron) pawn.chevron.position.y = pawn.height + 12 + (reduced ? 0 : Math.sin(timeMs / 300) * 2.5);
    }
  }

  destroy(): void {
    clearGroup(this.group);
    this.pawns.clear();
  }

  private place(id: string): void {
    const pawn = this.pawns.get(id);
    const base = this.base.get(id);
    if (!pawn || !base) return;
    const d = this.display.get(id);
    pawn.root.position.set((d?.x ?? base.x) + (d?.dx ?? 0), d?.lift ?? 0, (d?.y ?? base.y) + (d?.dy ?? 0));
    setOpacity(pawn.root, d?.alpha ?? (this.alive.get(id) === false ? 0.6 : 1));
  }

  private fill(pawn: Pawn, c: CharacterState, state: GameState, playerIdx: number, name: string): void {
    clearGroup(pawn.root);
    pawn.picks.length = 0;
    pawn.chevron = null;
    pawn.ring = null;
    const active = state.turn.activeCharacterId === c.id;
    const { geometry, height } = bodyGeometry(playerIdx);
    pawn.height = height;
    const material = new THREE.MeshStandardMaterial({ color: c.alive ? playerColor(playerIdx) : DEAD_COLOR, flatShading: true, roughness: 0.9 });
    if (active && c.alive) material.emissive.setHex(0x333333);
    const body = new THREE.Mesh(geometry, material);
    body.castShadow = true;
    body.userData.characterId = c.id;
    if (!c.alive) body.scale.y = 0.35;
    pawn.root.add(body);
    pawn.picks.push(body);

    if (c.alive && active) {
      // Repère « actif » : cône renversé au-dessus du pion (une forme, pas seulement un contour).
      const chevron = new THREE.Mesh(new THREE.ConeGeometry(6, 10, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true }));
      chevron.position.y = height + 12;
      pawn.root.add(chevron);
      pawn.chevron = chevron;
    }
    if (c.alive && c.overwatch) {
      // Overwatch : anneau pointillé qui pulse, indépendant de la couleur du joueur.
      const ring = new THREE.Group();
      const dash = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let i = 0; i < 6; i++) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(22, 1.4, 6, 6, Math.PI / 6), dash);
        arc.rotation.x = -Math.PI / 2;
        arc.rotation.z = (i / 6) * Math.PI * 2;
        ring.add(arc);
      }
      ring.position.y = 4;
      pawn.root.add(ring);
      pawn.ring = ring;
    }
    // Drapeaux portés : un fanion par drapeau, accroché au flanc du pion (il suit donc ses déplacements).
    carriedOwnerIndexes(state, c.id).forEach((owner, i) => {
      const pennant = createPennant(owner, 0.7);
      pennant.position.set(14 + i * 8, 4, 6);
      pawn.root.add(pennant);
    });
    if (c.alive) {
      const max = c.statRows.length;
      const pips = '■'.repeat(Math.max(0, c.health)) + '□'.repeat(Math.max(0, max - c.health));
      const text = name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name;
      const label = createTextSprite(`${text}\n${pips}`, { worldHeight: 15 });
      label.position.y = height + (active ? 46 : 34);
      pawn.root.add(label);
    }
  }
}
