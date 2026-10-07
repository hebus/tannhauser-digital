export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (e: { matches: boolean }) => void): void;
  removeEventListener(type: 'change', listener: (e: { matches: boolean }) => void): void;
}

export interface MatchMediaHost {
  matchMedia?: (query: string) => MediaQueryLike;
}

/**
 * Préférence « mouvement réduit » : `prefers-reduced-motion` du système, surchargeable par un toggle.
 * Valeur effective = surcharge si définie, sinon préférence système.
 */
export class ReducedMotion {
  private readonly query: MediaQueryLike | null;
  private system: boolean;
  private forced: boolean | null = null;
  private readonly listeners = new Set<(reduced: boolean) => void>();
  private readonly onSystemChange = (e: { matches: boolean }): void => {
    const before = this.value;
    this.system = e.matches;
    if (this.value !== before) this.emit();
  };

  constructor(host: MatchMediaHost | undefined = typeof window === 'undefined' ? undefined : window) {
    this.query = host?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    this.system = this.query?.matches ?? false;
    this.query?.addEventListener('change', this.onSystemChange);
  }

  get value(): boolean {
    return this.forced ?? this.system;
  }

  /** Inverse la valeur effective (devient une surcharge explicite). */
  toggle(): boolean {
    this.forced = !this.value;
    this.emit();
    return this.value;
  }

  subscribe(listener: (reduced: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.query?.removeEventListener('change', this.onSystemChange);
    this.listeners.clear();
  }

  private emit(): void {
    for (const l of [...this.listeners]) l(this.value);
  }
}
