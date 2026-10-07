export type Easing = (t: number) => number;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const linear: Easing = (t) => clamp01(t);
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutQuad: Easing = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};

/** Dépassement léger avant de se stabiliser (entrée de bannière). */
export const easeOutBack: Easing = (t) => {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const easeInQuad: Easing = (t) => {
  const x = clamp01(t);
  return x * x;
};

export const lerp =(a: number, b: number, t: number): number => a + (b - a) * t;
