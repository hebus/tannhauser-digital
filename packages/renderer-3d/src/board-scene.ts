import * as THREE from 'three';
import { crateAt, type BoardState } from '@tannhauser/core';
import { doorGeometry, layoutBounds, parseHexColor, polygonCentroid, type BoardLayout, type Box } from '@tannhauser/renderer/src/board-layout';
import type { HighlightTone } from '@tannhauser/renderer/src/contract';
import { buildColorMap, CRATE_COLORS, HIGHLIGHT_COLORS, OVERLAY_COLORS, PORTAL_COLOR, TERRAIN_COLORS } from '@tannhauser/renderer/src/palette';
import { corridorPolygons, footprintMask, passageWidth, planWalls, type Polygon, type Pt, type WallPlan } from './wall-geometry';
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
/** Hauteur à laquelle un mur qui cache du sol est coupé (murs en coupe). */
const CUT_HEIGHT = 9;
/** Teinte de la coupe d'un mur (intérieur vu par le dessus), plus sombre que le mur. */
const WALL_SECTION = 0x2b2f38;

/** Couleurs reprises du rendu 2D (`BoardView`) : chemins, flèches, portails, portes. */
const EDGE_UNDERLAY = 0x0b0c0e;
const EDGE_LINE = 0xb4b7c2;
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
  /** Case sous le pointeur (anneau clair) ; `null` = aucune. */
  setHover(nodeId: string | null): void;
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

/** Murs en coupe : masque du sol jouable (voir `footprintMask`) et emprise qu'il couvre (x, y, largeur, hauteur). */
interface CutawayUniforms {
  readonly mask: { value: THREE.Texture };
  readonly box: { value: THREE.Vector4 };
}

/**
 * Matériau dont les fragments sont abandonnés (tramé) quand ils masquent un pion vu depuis la caméra : le mur reste plein
 * partout ailleurs, et seul un trou suit chaque pion. Fonctionne pour n'importe quelle géométrie.
 * Avec `cutaway`, un mur est en plus coupé à `CUT_HEIGHT` partout où il cache du sol jouable (le rayon caméra → fragment,
 * prolongé jusqu'au sol, y tombe) : les murs du fond restent entiers, ceux de devant ne masquent plus les cases. La coupe
 * laisse voir l'intérieur du mur, peint d'une teinte unie (la face arrière, d'où `DoubleSide`).
 */
function occludable(material: THREE.MeshStandardMaterial, uniforms: OccluderUniforms, cutaway?: CutawayUniforms): THREE.MeshStandardMaterial {
  if (cutaway) material.side = THREE.DoubleSide;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOcc = uniforms.positions;
    shader.uniforms.uOccCount = uniforms.count;
    shader.uniforms.uOccRadius = uniforms.radius;
    if (cutaway) {
      shader.uniforms.uCutMask = cutaway.mask;
      shader.uniforms.uCutBox = cutaway.box;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const cut = cutaway
      ? `
  if (vWPos.y > ${CUT_HEIGHT.toFixed(1)}) {
    vec3 down = vWPos - cameraPosition;
    if (down.y < -0.001) {
      vec2 floorHit = (cameraPosition + down * (-cameraPosition.y / down.y)).xz;
      vec2 uv = (floorHit - uCutBox.xy) / uCutBox.zw;
      if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0 && texture2D(uCutMask, uv).r > 0.5) discard;
    }
  }`
      : '';
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
uniform vec3 uOcc[${MAX_OCCLUDERS}];
uniform int uOccCount;
uniform float uOccRadius;${cutaway ? '\nuniform sampler2D uCutMask;\nuniform vec4 uCutBox;' : ''}`,
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
  }${cut}
}`,
      );
    if (cutaway) {
      const section = new THREE.Color(WALL_SECTION);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  if (!gl_FrontFacing) gl_FragColor.rgb = vec3(${section.r.toFixed(4)}, ${section.g.toFixed(4)}, ${section.b.toFixed(4)});`,
      );
    }
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
  let cutMask: THREE.DataTexture | null = null;
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
        const name = createTextPlane(label(room.nameKey), { worldHeight: 26, opacity: 0.5 });
        name.position.set(c.x, 0.4, c.y);
        group.add(name);
      }
    }
    // Un peu plus bas que les pièces, pour qu'aucun sol ne scintille (z-fighting) là où ils se recouvrent.
    const corridorMaterial = flat(TERRAIN_COLORS.corridor);
    for (const corridor of layout.corridors) extrude(group, corridorPolygons(corridor, CORRIDOR_CAP), FLOOR_THICKNESS, -1.5, corridorMaterial);
    const footprintBox = layoutBounds(layout) ?? { x: 0, y: 0, width: 1, height: 1 };
    const mask = footprintMask(plan.footprint, footprintBox);
    cutMask = new THREE.DataTexture(mask.data, mask.width, mask.height, THREE.RedFormat, THREE.UnsignedByteType);
    cutMask.magFilter = THREE.LinearFilter;
    cutMask.needsUpdate = true;
    const cutaway: CutawayUniforms = {
      mask: { value: cutMask },
      box: { value: new THREE.Vector4(footprintBox.x, footprintBox.y, footprintBox.width, footprintBox.height) },
    };
    extrude(group, plan.walls, WALL_HEIGHT + FLOOR_THICKNESS, WALL_HEIGHT, occludable(flat(TERRAIN_COLORS.wall), occluders, cutaway));
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
  if (dashes.length > 0) group.add(new THREE.Mesh(ribbons(dashes, 5.5, 1.4), basic(PORTAL_COLOR)));
  // Extrémités des portails : chaque case reliée reçoit une marque (voir `createPortalMarker`).
  const portalEnds = new Set(board.portals.flatMap((p) => (p.from in board.nodes && p.to in board.nodes ? [p.from, p.to] : [])));

  // Tuiles de nœuds : disque en camembert, un secteur égal par couleur de ligne de vue, dans le même ordre que le 2D
  // (premier secteur en haut, puis dans le sens des aiguilles d'une montre) ; teintes de `buildColorMap`, distinctes par id
  // puisque la ligne de vue repose sur l'identité des couleurs.
  const colorMap = buildColorMap(Object.values(board.nodes).flatMap((n) => n.colors));
  const outlineGeometry = new THREE.CylinderGeometry(R + 2, R + 2, TILE_HEIGHT * 0.6, 24);
  const entryGeometry = new THREE.RingGeometry(R + 4, R + 6.5, 32).rotateX(-Math.PI / 2);
  const entryMaterial = basic(0xffffff, 0.9);
  const crossGeometry = new THREE.BoxGeometry(R * 1.1, 1.6, 4.5);
  const crossMaterial = basic(BLOCKED_COLOR);
  // Caisse en bois (fermée : case impraticable) : corps en planches, montants d'angle, cadres haut et bas, croisillon
  // sur le dessus. Géométries et matériaux partagés par toutes les caisses du plateau.
  const crateSize = R * 1.25;
  const crateHeight = crateSize * 0.8;
  const crateWood = flat(CRATE_COLORS.wood);
  const crateFrame = flat(CRATE_COLORS.frame);
  const crateBody = new THREE.BoxGeometry(crateSize, crateHeight, crateSize);
  const cratePost = new THREE.BoxGeometry(4.5, crateHeight + 1, 4.5);
  const crateRim = new THREE.BoxGeometry(crateSize + 1, 3.5, 4.5);
  const crateBrace = new THREE.BoxGeometry(crateSize * 1.3, 2, 4);
  const crateModel = (): THREE.Group => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(crateBody, crateWood);
    body.position.y = TILE_HEIGHT + crateHeight / 2;
    g.add(body);
    const h = crateSize / 2 - 1.5;
    for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]] as const) {
      const post = new THREE.Mesh(cratePost, crateFrame);
      post.position.set(x, TILE_HEIGHT + crateHeight / 2, z);
      g.add(post);
    }
    for (const y of [TILE_HEIGHT + 2, TILE_HEIGHT + crateHeight - 1.5]) {
      for (const [x, z, turn] of [[0, -h, 0], [0, h, 0], [-h, 0, 1], [h, 0, 1]] as const) {
        const rim = new THREE.Mesh(crateRim, crateFrame);
        rim.position.set(x, y, z);
        rim.rotation.y = (turn * Math.PI) / 2;
        g.add(rim);
      }
    }
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const brace = new THREE.Mesh(crateBrace, crateFrame);
      brace.position.y = TILE_HEIGHT + crateHeight + 0.8;
      brace.rotation.y = angle;
      g.add(brace);
    }
    return g;
  };
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
    if (crateAt(board, node.id)) tile.add(crateModel());
    if (portalEnds.has(node.id)) tile.add(createPortalMarker());
    if (node.properties.movementCostModifier > 0) {
      const badge = createTextSprite(`+${node.properties.movementCostModifier}`, { pixelHeight: 13 });
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
  const hoverRingGeometry = new THREE.RingGeometry(R + 1, R + 6, 40).rotateX(-Math.PI / 2);
  const hoverDiscGeometry = new THREE.CircleGeometry(R + 1, 32).rotateX(-Math.PI / 2);
  const hoverRing = basic(0xffffff, 0.95);
  const hoverFill = basic(0xffffff, 0.18);
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
  type OverlayKind = 'reach' | 'target' | 'losVisible' | 'losHidden' | 'hover';
  const lazy = new Map<string, THREE.Object3D>();
  const shown: Record<OverlayKind, Set<string>> = { reach: new Set(), target: new Set(), losVisible: new Set(), losHidden: new Set(), hover: new Set() };
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
    setHover(nodeId) {
      // Anneau clair et voile : en perspective, la case visée par le pointeur doit se lire sans hésitation.
      setShown('hover', nodeId === null ? [] : [nodeId], () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(hoverDiscGeometry, hoverFill), new THREE.Mesh(hoverRingGeometry, hoverRing));
        g.position.y = TILE_HEIGHT + 1;
        return g;
      });
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
          sprite = createTextSprite(id, { pixelHeight: 11 });
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
      const geometries = [outlineGeometry, entryGeometry, crossGeometry, ringGeometry, targetRingGeometry, targetDiscGeometry, tickGeometry, losDiscGeometry, losRingGeometry, losDotGeometry, losBarGeometry, hoverRingGeometry, hoverDiscGeometry];
      for (const g of geometries) g.dispose();
      const materials = [...Object.values(ringMaterials), entryMaterial, crossMaterial, targetMaterial, targetFill, losVisible, losVisibleFill, losHiddenFill, losHidden, hoverRing, hoverFill];
      for (const m of materials) m.dispose();
      cutMask?.dispose();
    },
  };
}

/** Rayon de l'anneau dressé d'une case à portail (unités plateau ; une case fait 60 de diamètre). */
const PORTAL_RING_RADIUS = 18;
/** Recul de l'anneau derrière le centre de la case : au-delà du corps d'un pion (rayon ≈ 20). */
const PORTAL_RING_BACK = TILE_RADIUS * 0.85;

/**
 * Marque d'une case reliée par un portail (porte secrète), centrée sur la tuile : bande violette en pointillés autour
 * de la case (lisible vue de dessus, sans masquer sa couleur) et anneau violet dressé sur la case, qui pivote pour
 * toujours faire face à la caméra (jamais vu par la tranche), dressé au bord arrière de la case (un pion posé dessus reste devant, visible). Même principe
 * que les cases d'objectif.
 */
export function createPortalMarker(): THREE.Group {
  const g = new THREE.Group();
  const R = TILE_RADIUS;
  const band = new THREE.MeshBasicMaterial({ color: PORTAL_COLOR, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
  const dashes = 10;
  for (let i = 0; i < dashes; i++) {
    const arc = (Math.PI * 2) / dashes;
    const dash = new THREE.Mesh(new THREE.RingGeometry(R + 3, R + 8, 6, 1, i * arc + arc * 0.2, arc * 0.6), band);
    dash.rotation.x = -Math.PI / 2;
    dash.position.y = TILE_HEIGHT + 1.2;
    g.add(dash);
  }
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(PORTAL_RING_RADIUS, 3.4, 10, 36),
    new THREE.MeshStandardMaterial({ color: PORTAL_COLOR, emissive: 0x3b1a66, flatShading: true, roughness: 0.6 }),
  );
  ring.position.y = TILE_HEIGHT + PORTAL_RING_RADIUS + 1;
  ring.castShadow = true;
  // Face à la caméra autour de l'axe vertical et posé au bord ARRIÈRE de la case (côté opposé à la caméra) : un pion
  // sur la case reste entièrement devant l'anneau, donc visible ; recalculé juste avant chaque dessin.
  const center = new THREE.Vector3();
  ring.onBeforeRender = (_renderer, _scene, camera) => {
    g.getWorldPosition(center);
    const yaw = Math.atan2(camera.position.x - center.x, camera.position.z - center.z);
    if (ring.rotation.y === yaw) return;
    ring.rotation.y = yaw;
    ring.position.x = -Math.sin(yaw) * PORTAL_RING_BACK;
    ring.position.z = -Math.cos(yaw) * PORTAL_RING_BACK;
    ring.updateMatrixWorld();
  };
  g.add(ring);
  return g;
}
