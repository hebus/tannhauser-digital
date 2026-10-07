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
