/** Couleurs de lignes de vue → teintes d'affichage. Les ids inconnus reçoivent une teinte stable. */
const KNOWN: Record<string, number> = {
  red: 0xe5484d,
  green: 0x30a46c,
  blue: 0x3e63dd,
  yellow: 0xf5c518,
  purple: 0x8e4ec6,
  orange: 0xf76b15,
};

const FALLBACK = [0x12a594, 0xd6409f, 0x978365, 0x00a2c7, 0x99d52a, 0xff8dcc];

function hsl(h: number, s: number, l: number): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/**
 * Teintes de tous les ids de couleur d'un plateau : chaque id distinct reçoit une teinte distincte (pas de collision,
 * essentielle car la ligne de vue repose sur l'identité des couleurs). Ids connus : teinte fixe ; les autres : teintes
 * réparties (angle d'or, luminosité alternée) dans l'ordre alphabétique des ids, donc stables pour un plateau donné.
 */
export function buildColorMap(ids: Iterable<string>): Map<string, number> {
  const map = new Map<string, number>();
  const others = [...new Set(ids)].filter((id) => KNOWN[id] === undefined).sort();
  for (const [id, hex] of Object.entries(KNOWN)) map.set(id, hex);
  others.forEach((id, i) => map.set(id, hsl((i * 137.508 + 20) % 360, 0.72, i % 2 === 0 ? 0.52 : 0.38)));
  return map;
}

export function colorHex(id: string): number {
  const known = KNOWN[id];
  if (known !== undefined) return known;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length]!;
}

/** Couleurs d'équipe (indexées par l'ordre des joueurs dans `GameState.players`), partagées pions / bannières / HUD. */
export const PLAYER_COLORS: readonly number[] = [0x4dabf7, 0xff6b6b, 0xffd43b, 0x69db7c];

/** Couleur d'un joueur d'après son index. */
export function playerColor(index: number): number {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]!;
}

/** Pictogrammes texte des formes de pion (cercle, losange, carré, triangle), dans l'ordre de `drawBody`. */
export const PLAYER_SHAPE_GLYPHS: readonly string[] = ['●', '◆', '■', '▲'];

export function playerShapeGlyph(index: number): string {
  return PLAYER_SHAPE_GLYPHS[((index % 4) + 4) % 4]!;
}

/** Teinte numérique → couleur CSS `#rrggbb`. */
export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
