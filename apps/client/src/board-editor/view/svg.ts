/** Petit constructeur SVG (pendant de `h()` de `ui/dom.ts`, qui ne crée que des éléments HTML). */

const NS = 'http://www.w3.org/2000/svg';

export type SvgAttrs = Readonly<Record<string, string | number | undefined | false>>;

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: SvgAttrs = {}, ...children: (SVGElement | string | null | undefined | false)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

const pt = (x: number, y: number): string => `${x.toFixed(2)},${y.toFixed(2)}`;

/** Secteur de disque centré sur l'origine, de l'angle `a0` à `a1` (radians, sens horaire à l'écran). */
export function sectorPath(r: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M ${-r},0 A ${r},${r} 0 1,1 ${r},0 A ${r},${r} 0 1,1 ${-r},0 Z`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M 0,0 L ${pt(Math.cos(a0) * r, Math.sin(a0) * r)} A ${r},${r} 0 ${large},1 ${pt(Math.cos(a1) * r, Math.sin(a1) * r)} Z`;
}

export const points = (list: readonly { x: number; y: number }[]): string => list.map((p) => pt(p.x, p.y)).join(' ');
