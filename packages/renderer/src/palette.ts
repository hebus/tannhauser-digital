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
