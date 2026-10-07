export type Easing = (t: number) => number;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const linear: Easing = (t) => clamp01(t);
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutQuad: Easing = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
