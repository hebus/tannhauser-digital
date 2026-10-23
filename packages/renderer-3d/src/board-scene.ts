import * as THREE from 'three';
import type { BoardState } from '@tannhauser/core';
import { doorGeometry, layoutBounds, parseHexColor, polygonCentroid, type BoardLayout, type Box } from '@tannhauser/renderer/src/board-layout';
import type { HighlightTone } from '@tannhauser/renderer/src/contract';
import { buildColorMap } from '@tannhauser/renderer/src/palette';
import { corridorPolygons, passageWidth, planWalls, type Polygon, type WallPlan } from './wall-geometry';
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

const TONE_COLORS: Record<HighlightTone, number> = { move: 0xffd43b, throw: 0xffb454 };
const TARGET_COLOR = 0xff4d4f;
const LOS_COLOR = 0xffffff;

const flat = (color: number) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });

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
  /** Cases vues depuis `origin` ; `null` = masquer. */
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

/** Plateau → scène : le plan du plateau (x, y) devient le sol (x, z) ; le dessus du sol est à y = 0. */
export function buildBoardScene(board: BoardState, layout: BoardLayout | undefined, label: (key: string) => string): BoardScene {
  const group = new THREE.Group();
  const tiles = new Map<string, THREE.Group>();
  const pickables: THREE.Mesh[] = [];

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

  // Murs : bande autour de l'union des pièces et couloirs ; ouvertures là où une arête du graphe sort de l'empreinte.
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
      const base = parseHexColor(room.fill) ?? 0x5a6070;
      extrude(group, [{ outer: room.polygon.map((p) => ({ x: p.x, y: p.y })), holes: [] }], FLOOR_THICKNESS, 0, flat(new THREE.Color(base).multiplyScalar(0.6).getHex()));
      if (room.nameKey) {
        const c = polygonCentroid(room.polygon);
        const name = createTextPlane(label(room.nameKey), { worldHeight: 16, opacity: 0.5 });
        name.position.set(c.x, 0.4, c.y);
        group.add(name);
      }
    }
    // Un peu plus bas que les pièces, pour qu'aucun sol ne scintille (z-fighting) là où ils se recouvrent.
    const corridorMaterial = flat(0x4a4f5c);
    for (const corridor of layout.corridors) extrude(group, corridorPolygons(corridor, CORRIDOR_CAP), FLOOR_THICKNESS, -1.5, corridorMaterial);
    extrude(group, plan.walls, WALL_HEIGHT + FLOOR_THICKNESS, WALL_HEIGHT, occludable(flat(0x9aa0ad), occluders));
  } else {
    const nodes = Object.values(board.nodes);
    const w = Math.max(...nodes.map((n) => n.x)) + 100;
    const h = Math.max(...nodes.map((n) => n.y)) + 100;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, FLOOR_THICKNESS, h), flat(0x3a3f4c));
    floor.position.set(w / 2 - 50, -FLOOR_THICKNESS / 2, h / 2 - 50);
    group.add(floor);
  }

  // Tuiles de nœuds : disque en camembert, un secteur égal par couleur de ligne de vue (comme le rendu 2D) ; teintes de
  // `buildColorMap`, distinctes par id puisque la ligne de vue repose sur l'identité des couleurs. Infranchissable = bloc sombre.
  const colorMap = buildColorMap(Object.values(board.nodes).flatMap((n) => n.colors));
  for (const node of Object.values(board.nodes)) {
    const tile = new THREE.Group();
    tile.position.set(node.x, 0, node.y);
    const passable = node.properties.passable;
    const colors = passable && node.colors.length > 0 ? node.colors : [null];
    const sector = (Math.PI * 2) / colors.length;
    colors.forEach((c, i) => {
      const hex = c === null ? 0x15161a : (colorMap.get(c) ?? 0x888888);
      const geometry = new THREE.CylinderGeometry(TILE_RADIUS, TILE_RADIUS, TILE_HEIGHT, Math.max(3, Math.ceil(24 / colors.length)), 1, false, i * sector, sector);
      const mesh = new THREE.Mesh(geometry, flat(hex));
      mesh.position.y = TILE_HEIGHT / 2;
      mesh.userData.nodeId = node.id;
      tile.add(mesh);
      pickables.push(mesh);
    });
    if (!passable) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(34, 26, 34), flat(0x2b2d34));
      block.position.y = 13;
      tile.add(block);
    } else if (node.properties.kind !== 'NORMAL') {
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(8), flat(node.properties.kind === 'OBJECTIVE' ? 0xf5c518 : 0xffffff));
      marker.position.y = 14;
      tile.add(marker);
    }
    group.add(tile);
    tiles.set(node.id, tile);
  }

  // Portes : dalle perpendiculaire à l'arête ; fermée = debout, ouverte = couchée au sol.
  for (const edge of board.edges) {
    if (!edge.doorId) continue;
    const door = board.doors[edge.doorId];
    const a = board.nodes[edge.from];
    const b = board.nodes[edge.to];
    if (!door || !a || !b) continue;
    const g = doorGeometry(a, b, OPENING_WIDTH);
    // Une porte bouche exactement le passage où elle se trouve (mesuré dans l'empreinte), à défaut une largeur par défaut.
    const measured = plan ? passageWidth(plan.footprint, { x: g.x, y: g.y }, g.barAngle, 70) : 0;
    const width = measured > 20 ? measured : OPENING_WIDTH;
    const material = occludable(flat(door.type === 'REINFORCED' ? 0x8892a0 : 0x8b5a2b), occluders);
    if (door.state === 'CLOSED') box(width, DOOR_HEIGHT, DOOR_THICKNESS, g.x, DOOR_HEIGHT / 2, g.y, g.barAngle, material);
    else box(width, 3, DOOR_THICKNESS, g.x, 1.5, g.y, g.barAngle, material);
  }

  // Surcouches de cases, créées à la demande (un plateau compte des centaines de cases, peu sont mises en avant à la fois).
  const ringGeometry = new THREE.RingGeometry(TILE_RADIUS + 2, TILE_RADIUS + 7, 32).rotateX(-Math.PI / 2);
  const targetGeometry = new THREE.RingGeometry(TILE_RADIUS + 9, TILE_RADIUS + 13, 32).rotateX(-Math.PI / 2);
  const tickGeometry = new THREE.BoxGeometry(3, 1, 9);
  const losGeometry = new THREE.CircleGeometry(TILE_RADIUS * 0.95, 24).rotateX(-Math.PI / 2);
  const ringMaterials: Record<HighlightTone, THREE.MeshBasicMaterial> = {
    move: new THREE.MeshBasicMaterial({ color: TONE_COLORS.move }),
    throw: new THREE.MeshBasicMaterial({ color: TONE_COLORS.throw }),
  };
  const targetMaterial = new THREE.MeshBasicMaterial({ color: TARGET_COLOR });
  const losMaterial = new THREE.MeshBasicMaterial({ color: LOS_COLOR, transparent: true, opacity: 0.3, depthWrite: false });
  const losOriginMaterial = new THREE.MeshBasicMaterial({ color: LOS_COLOR });
  const lazy = new Map<string, THREE.Object3D>();
  const overlay = (nodeId: string, kind: string, build: () => THREE.Object3D): THREE.Object3D | null => {
    const tile = tiles.get(nodeId);
    if (!tile) return null;
    const key = `${kind}:${nodeId}`;
    let obj = lazy.get(key);
    if (!obj) {
      obj = build();
      obj.visible = false;
      tile.add(obj);
      lazy.set(key, obj);
    }
    return obj;
  };
  const shown: Record<'reach' | 'target' | 'los', Set<string>> = { reach: new Set(), target: new Set(), los: new Set() };
  const setShown = (kind: 'reach' | 'target' | 'los', ids: Iterable<string>, build: (id: string) => THREE.Object3D, after?: (obj: THREE.Object3D) => void): void => {
    for (const id of shown[kind]) {
      const o = lazy.get(`${kind}:${id}`);
      if (o) o.visible = false;
    }
    shown[kind] = new Set(ids);
    for (const id of shown[kind]) {
      const o = overlay(id, kind, () => build(id));
      if (!o) continue;
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
        reticle.add(new THREE.Mesh(targetGeometry, targetMaterial));
        // Repères aux quatre points cardinaux : la cible se lit à la forme, pas seulement à la couleur.
        for (let i = 0; i < 4; i++) {
          const tick = new THREE.Mesh(tickGeometry, targetMaterial);
          const a = (i * Math.PI) / 2;
          tick.position.set(Math.cos(a) * (TILE_RADIUS + 11), 0.6, Math.sin(a) * (TILE_RADIUS + 11));
          tick.rotation.y = -a;
          reticle.add(tick);
        }
        reticle.position.y = TILE_HEIGHT + 0.8;
        return reticle;
      });
    },
    setLineOfSight(origin, visible) {
      const wanted = origin !== null && visible !== null ? [...visible, origin] : [];
      setShown(
        'los',
        wanted,
        (id) => {
          const disc = new THREE.Mesh(losGeometry, id === origin ? losOriginMaterial : losMaterial);
          disc.position.y = TILE_HEIGHT + 0.5;
          return disc;
        },
        (o) => ((o as THREE.Mesh).material = losMaterial),
      );
      if (origin !== null) {
        const o = lazy.get(`los:${origin}`) as THREE.Mesh | undefined;
        if (o) o.material = losOriginMaterial;
      }
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
      for (const g of [ringGeometry, targetGeometry, tickGeometry, losGeometry]) g.dispose();
      for (const m of [...Object.values(ringMaterials), targetMaterial, losMaterial, losOriginMaterial]) m.dispose();
    },
  };
}
