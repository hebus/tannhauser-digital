import * as THREE from 'three';
import type { BoardState } from '@tannhauser/core';
import { doorGeometry, layoutBounds, parseHexColor, polygonCentroid, type BoardLayout, type Box } from '@tannhauser/renderer/src/board-layout';
import type { HighlightTone } from '@tannhauser/renderer/src/contract';
import { buildColorMap, HIGHLIGHT_COLORS, OVERLAY_COLORS, TERRAIN_COLORS } from '@tannhauser/renderer/src/palette';
import { corridorPolygons, passageWidth, planWalls, type Polygon, type Pt, type WallPlan } from './wall-geometry';
import { createTextPlane, createTextSprite, disposeTree } from './three-util';

/** Dimensions en unités plateau (les nœuds sont espacés d'environ 100). */
export const FLOOR_THICKNESS = 6;
export const WALL_HEIGHT = 40;
const WALL_THICKNESS = 8;
export const TILE_RADIUS = 30;
const TILE_HEIGHT = 2;
/** Un couloir dépasse de ce qu'il faut pour qu'une case posée en bout ne finisse pas dans le mur. */
const CORRIDOR_CAP = TILE_RADIUS + 6;
const OPENING_WIDTH = 56;
const DOOR_HEIGHT = 34;
const DOOR_THICKNESS = 6;
/** Nombre maximal de pions pour lesquels un mur devient transparent (voir `occludable`). */
const MAX_OCCLUDERS = 8;
/** Rayon (unités plateau) du trou percé dans un mur devant un pion. */
const OCCLUDER_RADIUS = 36;
/** Marge autour du plateau pour le cadrage de la caméra. */
const BOUNDS_MARGIN = 40;

/** Couleurs reprises du rendu 2D (`BoardView`) : chemins, flèches, portails, portes. */
const EDGE_UNDERLAY = 0x0b0c0e;
const EDGE_LINE = 0xb4b7c2;
const PORTAL_COLOR = 0xc084fc;
const DOOR_CLOSED = 0xd9902f;
const DOOR_CLOSED_REINFORCED = 0x9a5b12;
const DOOR_OPEN = 0x7bd88f;
const DOOR_POST = 0xe8c47c;
const BLOCKED_COLOR = 0xff4d4f;
const NODE_OUTLINE = 0x1c1f24;

const flat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
const basic = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 1 });

export interface BoardScene {
  readonly group: THREE.Group;
  /** Secteurs de tuiles, seules cibles du picking de cases ; `userData.nodeId` sur chaque secteur. */
  readonly pickables: readonly THREE.Mesh[];
  /** Emprise du plateau (coordonnées plateau), marge comprise. */
  readonly bounds: Box;
  /** Surbrillance des cases (anneau) ; liste vide = aucune. */
  setReachable(nodeIds: Iterable<string>, tone: HighlightTone): void;
  /** Cases ciblées : anneau rouge et repères. */
  setTargets(nodeIds: Iterable<string>): void;
  /** Ligne de vue depuis `origin` : cases vues (vert) et cachées (rouge, croix) ; `null` = masquer. */
  setLineOfSight(origin: string | null, visible: ReadonlySet<string> | null): void;
  setShowIds(show: boolean): void;
  /** Décale une case (secousse d'explosion) ; `(0, 0)` la remet en place. */
  setNodeOffset(nodeId: string, dx: number, dy: number): void;
  /** Positions (monde) des pions à ne jamais cacher : les murs qui les masquent depuis la caméra sont percés autour d'eux. */
  setOccluders(positions: readonly THREE.Vector3[]): void;
  dispose(): void;
}

interface OccluderUniforms {
  readonly positions: { value: THREE.Vector3[] };
  readonly count: { value: number };
  readonly radius: { value: number };
}

/**
 * Matériau dont les fragments sont abandonnés (tramé) quand ils masquent un pion vu depuis la caméra : le mur reste plein
 * partout ailleurs, et seul un trou suit chaque pion. Fonctionne pour n'importe quelle géométrie.
 */
function occludable(material: THREE.MeshStandardMaterial, uniforms: OccluderUniforms): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOcc = uniforms.positions;
    shader.uniforms.uOccCount = uniforms.count;
    shader.uniforms.uOccRadius = uniforms.radius;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
uniform vec3 uOcc[${MAX_OCCLUDERS}];
uniform int uOccCount;
uniform float uOccRadius;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
{
  vec3 ray = vWPos - cameraPosition;
  for (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
    if (i >= uOccCount) break;
    vec3 q = uOcc[i];
    float t = dot(q - cameraPosition, ray) / dot(ray, ray);
    // t > 1 : le pion est derrière ce fragment (vu depuis la caméra).
    if (t > 1.0) {
      float r = distance(cameraPosition + ray * t, q);
      float keep = smoothstep(uOccRadius * 0.6, uOccRadius, r);
      float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (keep < noise) discard;
    }
  }
}`,
      );
  };
  return material;
}

/** Polygones 2D → solides : la face haute est à `top`, l'épaisseur descend de `depth`. */
function extrude(group: THREE.Group, polygons: readonly Polygon[], depth: number, top: number, material: THREE.Material): void {
  for (const poly of polygons) {
    const shape = new THREE.Shape(poly.outer.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const hole of poly.holes) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2); // (x, y, z) → (x, -z, y) : épaisseur vers le bas
    geometry.translate(0, top, 0);
    group.add(new THREE.Mesh(geometry, material));
  }
}

interface Segment {
  readonly a: Pt;
  readonly b: Pt;
}

/** Rubans plats (un quadrilatère par segment) fusionnés en UNE géométrie : des centaines d'arêtes pour un seul appel de dessin. */
function ribbons(segments: readonly Segment[], width: number, y: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  segments.forEach(({ a, b }, i) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / len) * (width / 2);
    const nz = ((b.x - a.x) / len) * (width / 2);
    positions.push(a.x + nx, y, a.y + nz, b.x + nx, y, b.y + nz, b.x - nx, y, b.y - nz, a.x - nx, y, a.y - nz);
    const o = i * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Triangles plats fusionnés (flèches de sens unique). */
function triangles(tris: readonly (readonly [Pt, Pt, Pt])[], y: number): THREE.BufferGeometry {
  const positions = tris.flatMap((t) => t.flatMap((p) => [p.x, y, p.y]));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Plateau → scène : le plan du plateau (x, y) devient le sol (x, z) ; le dessus du sol est à y = 0. */
export function buildBoardScene(board: BoardState, layout: BoardLayout | undefined, label: (key: string) => string): BoardScene {
  const group = new THREE.Group();
  const tiles = new Map<string, THREE.Group>();
  const pickables: THREE.Mesh[] = [];
  const R = TILE_RADIUS;

  const box = (length: number, height: number, depth: number, x: number, y: number, z: number, angle: number, material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = -angle;
    group.add(mesh);
    return mesh;
  };

  const occluders: OccluderUniforms = {
    positions: { value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector3()) },
    count: { value: 0 },
    radius: { value: OCCLUDER_RADIUS },
  };

  // Terrain : sols sombres à peine teintés (comme le 2D, pour que les couleurs des cases — celles de la ligne de vue —
  // restent le seul repère coloré), murs en union des pièces et couloirs, ouvertures là où une arête sort de l'empreinte.
  let plan: WallPlan | null = null;
  if (layout) {
    const edges = board.edges.flatMap((e) => {
      const a = board.nodes[e.from];
      const b = board.nodes[e.to];
      return a && b ? [{ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }] : [];
    });
    plan = planWalls(
      layout.rooms.map((r) => r.polygon),
      layout.corridors,
      edges,
      { thickness: WALL_THICKNESS, openingWidth: OPENING_WIDTH, capExtension: CORRIDOR_CAP },
    );

    for (const room of layout.rooms) {
      const tint = parseHexColor(room.fill);
      const floor = new THREE.Color(TERRAIN_COLORS.room);
      if (tint !== undefined) floor.lerp(new THREE.Color(tint), TERRAIN_COLORS.roomTintAlpha);
      extrude(group, [{ outer: room.polygon.map((p) => ({ x: p.x, y: p.y })), holes: [] }], FLOOR_THICKNESS, 0, flat(floor.getHex()));
      if (room.nameKey) {
        const c = polygonCentroid(room.polygon);
        const name = createTextPlane(label(room.nameKey), { worldHeight: 16, opacity: 0.5 });
        name.position.set(c.x, 0.4, c.y);
        group.add(name);
      }
    }
    // Un peu plus bas que les pièces, pour qu'aucun sol ne scintille (z-fighting) là où ils se recouvrent.
    const corridorMaterial = flat(TERRAIN_COLORS.corridor);
    for (const corridor of layout.corridors) extrude(group, corridorPolygons(corridor, CORRIDOR_CAP), FLOOR_THICKNESS, -1.5, corridorMaterial);
    extrude(group, plan.walls, WALL_HEIGHT + FLOOR_THICKNESS, WALL_HEIGHT, occludable(flat(TERRAIN_COLORS.wall), occluders));
  } else {
    const nodes = Object.values(board.nodes);
    const w = Math.max(...nodes.map((n) => n.x)) + 100;
    const h = Math.max(...nodes.map((n) => n.y)) + 100;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, FLOOR_THICKNESS, h), flat(TERRAIN_COLORS.room));
    floor.position.set(w / 2 - 50, -FLOOR_THICKNESS / 2, h / 2 - 50);
    group.add(floor);
  }

  // Chemins : les arêtes du graphe (là où l'on peut se déplacer), un trait clair sur une ombre, comme le 2D.
  const edgeSegments: Segment[] = [];
  const arrows: [Pt, Pt, Pt][] = [];
  for (const e of board.edges) {
    const a = board.nodes[e.from];
    const b = board.nodes[e.to];
    if (!a || !b) continue;
    edgeSegments.push({ a, b });
    if (e.oneWay) {
      // Flèche de sens unique : pointe vers la case d'arrivée, juste avant son bord.
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const tip = { x: b.x - ux * (R + 4), y: b.y - uy * (R + 4) };
      const back = { x: tip.x - ux * 18, y: tip.y - uy * 18 };
      arrows.push([tip, { x: back.x - uy * 10, y: back.y + ux * 10 }, { x: back.x + uy * 10, y: back.y - ux * 10 }]);
    }
  }
  group.add(new THREE.Mesh(ribbons(edgeSegments, 7, 0.5), basic(EDGE_UNDERLAY, 0.6)));
  group.add(new THREE.Mesh(ribbons(edgeSegments, 3.4, 0.9), basic(EDGE_LINE, 0.95)));
  if (arrows.length > 0) group.add(new THREE.Mesh(triangles(arrows, 1.2), basic(0xffffff)));

  // Portails (portes secrètes) : trait pointillé violet entre deux cases.
  const dashes: Segment[] = [];
  for (const p of board.portals) {
    const a = board.nodes[p.from];
    const b = board.nodes[p.to];
    if (!a || !b) continue;
    const steps = 24;
    for (let i = 0; i < steps; i += 2) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      dashes.push({ a: { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }, b: { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 } });
    }
  }
  if (dashes.length > 0) group.add(new THREE.Mesh(ribbons(dashes, 4.5, 1.4), basic(PORTAL_COLOR)));

  // Tuiles de nœuds : disque en camembert, un secteur égal par couleur de ligne de vue, dans le même ordre que le 2D
  // (premier secteur en haut, puis dans le sens des aiguilles d'une montre) ; teintes de `buildColorMap`, distinctes par id
  // puisque la ligne de vue repose sur l'identité des couleurs.
  const colorMap = buildColorMap(Object.values(board.nodes).flatMap((n) => n.colors));
  const outlineGeometry = new THREE.CylinderGeometry(R + 2, R + 2, TILE_HEIGHT * 0.6, 24);
  const entryGeometry = new THREE.RingGeometry(R + 4, R + 6.5, 32).rotateX(-Math.PI / 2);
  const entryMaterial = basic(0xffffff, 0.9);
  const crossGeometry = new THREE.BoxGeometry(R * 1.1, 1.6, 4.5);
  const crossMaterial = basic(BLOCKED_COLOR);
  for (const node of Object.values(board.nodes)) {
    const tile = new THREE.Group();
    tile.position.set(node.x, 0, node.y);
    const passable = node.properties.passable;
    const outline = new THREE.Mesh(outlineGeometry, new THREE.MeshBasicMaterial({ color: passable ? NODE_OUTLINE : BLOCKED_COLOR }));
    outline.position.y = TILE_HEIGHT * 0.3;
    tile.add(outline);
    const colors = node.colors.length > 0 ? node.colors : [null];
    const sector = (Math.PI * 2) / colors.length;
    colors.forEach((c, i) => {
      const hex = c === null ? 0x888888 : (colorMap.get(c) ?? 0x888888);
      // Secteur i : du haut vers la droite en sens horaire, comme `BoardView` (Three mesure l'angle depuis +z).
      const geometry = new THREE.CylinderGeometry(R, R, TILE_HEIGHT, Math.max(3, Math.ceil(24 / colors.length)), 1, false, Math.PI - (i + 1) * sector, sector);
      // Sans éclairage : la couleur d'une case décide de la ligne de vue, elle doit s'afficher exacte, ni ombrée ni éclaircie.
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: hex }));
      mesh.position.y = TILE_HEIGHT / 2 + 0.2;
      mesh.userData.nodeId = node.id;
      tile.add(mesh);
      pickables.push(mesh);
    });
    if (!passable) {
      // Case impraticable : croix rouge à plat, comme le 2D.
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(crossGeometry, crossMaterial);
        bar.position.y = TILE_HEIGHT + 0.9;
        bar.rotation.y = angle;
        tile.add(bar);
      }
    }
    if (node.properties.kind === 'ENTRY_POINT') {
      const ring = new THREE.Mesh(entryGeometry, entryMaterial);
      ring.position.y = TILE_HEIGHT + 0.4;
      tile.add(ring);
    }
    if (node.properties.movementCostModifier > 0) {
      const badge = createTextSprite(`+${node.properties.movementCostModifier}`, { worldHeight: 11 });
      badge.position.set(R * 0.75, 12, -R * 0.75);
      tile.add(badge);
    }
    group.add(tile);
    tiles.set(node.id, tile);
  }

  // Portes, orientées sur leur arête : fermée = vantail debout (ambre, plus sombre si renforcée) ; ouverte = vantail vert
  // couché le long du passage, avec ses deux montants.
  for (const edge of board.edges) {
    if (!edge.doorId) continue;
    const door = board.doors[edge.doorId];
    const a = board.nodes[edge.from];
    const b = board.nodes[edge.to];
    if (!door || !a || !b) continue;
    const reinforced = door.type === 'REINFORCED';
    const first = doorGeometry(a, b, OPENING_WIDTH);
    // Une porte bouche exactement le passage où elle se trouve (mesuré dans l'empreinte), à défaut une largeur par défaut.
    const measured = plan ? passageWidth(plan.footprint, { x: first.x, y: first.y }, first.barAngle, 70) : 0;
    const width = measured > 20 ? measured : OPENING_WIDTH;
    const g = doorGeometry(a, b, width);
    if (door.state === 'CLOSED') {
      box(width, DOOR_HEIGHT, reinforced ? DOOR_THICKNESS + 3 : DOOR_THICKNESS, g.x, DOOR_HEIGHT / 2, g.y, g.barAngle, occludable(flat(reinforced ? DOOR_CLOSED_REINFORCED : DOOR_CLOSED), occluders));
    } else {
      const leaf = width * 0.82;
      const mid = { x: g.p1.x + Math.cos(g.edgeAngle) * (leaf / 2), y: g.p1.y + Math.sin(g.edgeAngle) * (leaf / 2) };
      box(leaf, 3, reinforced ? 7 : 5, mid.x, 1.5, mid.y, g.edgeAngle, flat(DOOR_OPEN));
      for (const p of [g.p1, g.p2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 8, 10), flat(DOOR_POST));
        post.position.set(p.x, 4, p.y);
        group.add(post);
      }
    }
  }

  // Surcouches de cases, créées à la demande (un plateau compte des centaines de cases, peu sont mises en avant à la fois).
  const ringGeometry = new THREE.RingGeometry(R + 4, R + 8, 32).rotateX(-Math.PI / 2);
  const targetRingGeometry = new THREE.RingGeometry(R + 9, R + 13, 32).rotateX(-Math.PI / 2);
  const targetDiscGeometry = new THREE.CircleGeometry(R + 13, 32).rotateX(-Math.PI / 2);
  const tickGeometry = new THREE.BoxGeometry(3.5, 1, 9);
  const losDiscGeometry = new THREE.CircleGeometry(R + 3, 28).rotateX(-Math.PI / 2);
  const losRingGeometry = new THREE.RingGeometry(R + 1.5, R + 4.5, 32).rotateX(-Math.PI / 2);
  const losDotGeometry = new THREE.SphereGeometry(4, 10, 8);
  const losBarGeometry = new THREE.BoxGeometry(12, 1.4, 3);
  const ringMaterials: Record<HighlightTone, THREE.MeshBasicMaterial> = {
    move: basic(HIGHLIGHT_COLORS.move),
    throw: basic(HIGHLIGHT_COLORS.throw),
  };
  const targetMaterial = basic(OVERLAY_COLORS.target);
  const targetFill = basic(OVERLAY_COLORS.target, 0.16);
  const losVisible = basic(OVERLAY_COLORS.losVisible);
  const losVisibleFill = basic(OVERLAY_COLORS.losVisible, 0.28);
  const losHiddenFill = basic(OVERLAY_COLORS.losHidden, 0.18);
  const losHidden = basic(OVERLAY_COLORS.losHidden);
  type OverlayKind = 'reach' | 'target' | 'losVisible' | 'losHidden';
  const lazy = new Map<string, THREE.Object3D>();
  const shown: Record<OverlayKind, Set<string>> = { reach: new Set(), target: new Set(), losVisible: new Set(), losHidden: new Set() };
  const setShown = (kind: OverlayKind, ids: Iterable<string>, build: () => THREE.Object3D, after?: (obj: THREE.Object3D) => void): void => {
    for (const id of shown[kind]) {
      const o = lazy.get(`${kind}:${id}`);
      if (o) o.visible = false;
    }
    shown[kind] = new Set(ids);
    for (const id of shown[kind]) {
      const tile = tiles.get(id);
      if (!tile) continue;
      let o = lazy.get(`${kind}:${id}`);
      if (!o) {
        o = build();
        tile.add(o);
        lazy.set(`${kind}:${id}`, o);
      }
      o.visible = true;
      after?.(o);
    }
  };
  const ids = new Map<string, THREE.Sprite>();

  const nodes = Object.values(board.nodes);
  const raw: Box = layout ? (layoutBounds(layout) ?? { x: 0, y: 0, width: 1, height: 1 }) : {
    x: Math.min(...nodes.map((n) => n.x)),
    y: Math.min(...nodes.map((n) => n.y)),
    width: Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x)),
    height: Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y)),
  };
  const bounds: Box = { x: raw.x - BOUNDS_MARGIN, y: raw.y - BOUNDS_MARGIN, width: raw.width + BOUNDS_MARGIN * 2, height: raw.height + BOUNDS_MARGIN * 2 };

  return {
    group,
    pickables,
    bounds,
    setReachable(nodeIds, tone) {
      // La teinte (déplacement / lancer) change le matériau de l'anneau, partagé par toutes les cases.
      setShown(
        'reach',
        nodeIds,
        () => {
          const ring = new THREE.Mesh(ringGeometry, ringMaterials[tone]);
          ring.position.y = TILE_HEIGHT + 0.6;
          return ring;
        },
        (o) => ((o as THREE.Mesh).material = ringMaterials[tone]),
      );
    },
    setTargets(nodeIds) {
      setShown('target', nodeIds, () => {
        const reticle = new THREE.Group();
        reticle.add(new THREE.Mesh(targetDiscGeometry, targetFill), new THREE.Mesh(targetRingGeometry, targetMaterial));
        // Repères aux quatre points cardinaux : la cible se lit à la forme, pas seulement à la couleur.
        for (let i = 0; i < 4; i++) {
          const tick = new THREE.Mesh(tickGeometry, targetMaterial);
          const a = (i * Math.PI) / 2;
          tick.position.set(Math.cos(a) * (R + 11), 0.6, Math.sin(a) * (R + 11));
          tick.rotation.y = -a;
          reticle.add(tick);
        }
        reticle.position.y = TILE_HEIGHT + 0.8;
        return reticle;
      });
    },
    setLineOfSight(origin, visible) {
      const seen: string[] = [];
      const hidden: string[] = [];
      if (origin !== null && visible !== null) {
        for (const n of nodes) {
          if (n.id === origin) continue;
          (visible.has(n.id) ? seen : hidden).push(n.id);
        }
      }
      // Case vue : disque et anneau verts, pastille ; case cachée : disque rouge et croix (lisible sans la couleur).
      setShown('losVisible', seen, () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(losDiscGeometry, losVisibleFill), new THREE.Mesh(losRingGeometry, losVisible));
        const dot = new THREE.Mesh(losDotGeometry, losVisible);
        dot.position.set(-R * 0.8, 3, -R * 0.8);
        g.add(dot);
        g.position.y = TILE_HEIGHT + 0.5;
        return g;
      });
      setShown('losHidden', hidden, () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(losDiscGeometry, losHiddenFill));
        for (const angle of [Math.PI / 4, -Math.PI / 4]) {
          const bar = new THREE.Mesh(losBarGeometry, losHidden);
          bar.position.set(-R * 0.8, 2.5, -R * 0.8);
          bar.rotation.y = angle;
          g.add(bar);
        }
        g.position.y = TILE_HEIGHT + 0.5;
        return g;
      });
    },
    setShowIds(show) {
      for (const [id, tile] of tiles) {
        let sprite = ids.get(id);
        if (show && !sprite) {
          sprite = createTextSprite(id, { worldHeight: 9 });
          sprite.position.y = TILE_HEIGHT + 16;
          tile.add(sprite);
          ids.set(id, sprite);
        }
        if (sprite) sprite.visible = show;
      }
    },
    setNodeOffset(nodeId, dx, dy) {
      const tile = tiles.get(nodeId);
      const node = board.nodes[nodeId];
      if (tile && node) tile.position.set(node.x + dx, 0, node.y + dy);
    },
    setOccluders(positions) {
      const n = Math.min(positions.length, MAX_OCCLUDERS);
      for (let i = 0; i < n; i++) occluders.positions.value[i]!.copy(positions[i]!);
      occluders.count.value = n;
    },
    dispose() {
      disposeTree(group);
      const geometries = [outlineGeometry, entryGeometry, crossGeometry, ringGeometry, targetRingGeometry, targetDiscGeometry, tickGeometry, losDiscGeometry, losRingGeometry, losDotGeometry, losBarGeometry];
      for (const g of geometries) g.dispose();
      const materials = [...Object.values(ringMaterials), entryMaterial, crossMaterial, targetMaterial, targetFill, losVisible, losVisibleFill, losHiddenFill, losHidden];
      for (const m of materials) m.dispose();
    },
  };
}
