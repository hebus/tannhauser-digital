import * as THREE from 'three';
import type { Point } from '@tannhauser/renderer/src/presentation/path-geometry';

/**
 * Repère : le plateau (x, y) devient le sol (x, z) ; le dessus du sol est à y = 0 et la hauteur monte avec y.
 * Les effets et les pions parlent en coordonnées plateau (comme le contrat de rendu) ; ces aides font le passage.
 */
export const toWorld = (p: Point, height = 0): THREE.Vector3 => new THREE.Vector3(p.x, height, p.y);

/** Libère la mémoire GPU d'un arbre d'objets (géométries, matériaux, textures). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const holder = o as Partial<THREE.Mesh>;
    holder.geometry?.dispose();
    const materials = Array.isArray(holder.material) ? holder.material : holder.material ? [holder.material] : [];
    for (const m of materials) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
}

/** Retire et libère tous les enfants d'un groupe. */
export function clearGroup(group: THREE.Object3D): void {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeTree(child);
  }
}

export interface TextStyle {
  readonly color?: string;
  readonly stroke?: string;
  readonly fontPx?: number;
  readonly weight?: string;
}

/** Texture de texte (plusieurs lignes séparées par `\n`) et son rapport largeur / hauteur. */
export function createTextTexture(text: string, style: TextStyle = {}): { texture: THREE.CanvasTexture; aspect: number } {
  const { color = '#ffffff', stroke = '#000000', fontPx = 48, weight = '700' } = style;
  const lines = text.split('\n');
  const pad = Math.ceil(fontPx * 0.25);
  const lineHeight = Math.ceil(fontPx * 1.2);
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `${weight} ${fontPx}px system-ui, sans-serif`;
  const width = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width))) + pad * 2;
  const height = lineHeight * lines.length + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${weight} ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, fontPx * 0.18);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = color;
  lines.forEach((line, i) => {
    const y = pad + lineHeight * (i + 0.5);
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: width / height };
}

/**
 * Donne au sprite une taille fixe À L'ÉCRAN (`pixelHeight` px de haut), quel que soit le zoom : sans atténuation, la
 * taille d'un sprite ne dépend plus que du champ de la caméra et de la hauteur du canevas, relus juste avant le dessin.
 */
function keepScreenSize(sprite: THREE.Sprite, pixelHeight: number, aspect: number): void {
  sprite.material.sizeAttenuation = false;
  sprite.onBeforeRender = (renderer, _scene, camera) => {
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 40;
    const h = (pixelHeight * 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, renderer.domElement.clientHeight);
    if (sprite.scale.y === h) return;
    sprite.scale.set(h * aspect, h, 1);
    sprite.updateMatrixWorld();
  };
}

/**
 * Texte qui fait toujours face à la caméra, dessiné par-dessus les murs (lisibilité avant tout). Taille d'UNE ligne :
 * `pixelHeight` (px, constante à l'écran : étiquettes permanentes) ou `worldHeight` (unités plateau : textes d'effets
 * brefs, dont l'animation joue sur l'échelle).
 */
export function createTextSprite(text: string, style: TextStyle & { pixelHeight?: number; worldHeight?: number } = {}): THREE.Sprite {
  const { pixelHeight = 12, worldHeight, ...textStyle } = style;
  const { texture, aspect } = createTextTexture(text, textStyle);
  const lines = text.split('\n').length;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  if (worldHeight !== undefined) sprite.scale.set(worldHeight * lines * aspect, worldHeight * lines, 1);
  else keepScreenSize(sprite, pixelHeight * lines, aspect);
  sprite.renderOrder = 10;
  return sprite;
}

/** Pastille ronde (fond clair, lettre sombre) à taille constante à l'écran : initiale du type de personnage, comme le 2D. */
export function createBadgeSprite(letter: string, pixelHeight = 18): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = '#f1f3f5';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#111111';
  ctx.stroke();
  ctx.font = '800 36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111111';
  ctx.fillText(letter, size / 2, size / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  keepScreenSize(sprite, pixelHeight, 1);
  sprite.renderOrder = 9;
  return sprite;
}

/** Texte posé à plat sur le sol (noms de pièces). */
export function createTextPlane(text: string, style: TextStyle & { worldHeight?: number; opacity?: number } = {}): THREE.Mesh {
  const { worldHeight = 14, opacity = 0.55, ...textStyle } = style;
  const { texture, aspect } = createTextTexture(text, textStyle);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(worldHeight * aspect, worldHeight),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Fixe l'opacité de tous les matériaux d'un arbre (active la transparence seulement si nécessaire). */
export function setOpacity(root: THREE.Object3D, alpha: number): void {
  root.traverse((o) => {
    const holder = o as Partial<THREE.Mesh>;
    const materials = Array.isArray(holder.material) ? holder.material : holder.material ? [holder.material] : [];
    for (const m of materials) {
      const base = (m.userData.baseOpacity as number | undefined) ?? (m.userData.baseOpacity = m.opacity);
      m.opacity = base * alpha;
      m.transparent = m.transparent || alpha < 1;
    }
  });
}
