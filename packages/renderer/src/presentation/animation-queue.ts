import { linear, type Easing } from './easing';

/**
 * Animation pilotée par un temps normalisé. Contrat : `start` puis `update(p)` (p dans [0,1]) puis `finish`,
 * toujours appelés dans cet ordre ; `finish` l'est même si l'animation est sautée ou instantanée.
 * Une animation ne mute jamais `GameState` : elle ne touche que des objets d'affichage.
 */
export interface Animation {
  readonly duration: number;
  start?(): void;
  update?(progress: number): void;
  finish?(): void;
}

class Running {
  elapsed = 0;
  started = false;
  constructor(readonly anim: Animation) {}

  begin(): void {
    if (this.started) return;
    this.started = true;
    this.anim.start?.();
  }

  complete(): void {
    this.begin();
    this.anim.update?.(1);
    this.anim.finish?.();
  }
}

/**
 * File d'animations sérialisée : une seule animation active à la fois, dans l'ordre d'arrivée.
 * `skip()` termine tout instantanément ; en mode réduit chaque animation est terminée à l'enqueue.
 */
export class AnimationQueue {
  private readonly pending: Running[] = [];
  private current: Running | null = null;
  private _reduced: boolean;

  constructor(options: { reduced?: boolean } = {}) {
    this._reduced = options.reduced ?? false;
  }

  get reduced(): boolean {
    return this._reduced;
  }

  /** Passer en mode réduit termine immédiatement ce qui est en cours. */
  set reduced(value: boolean) {
    this._reduced = value;
    if (value) this.skip();
  }

  get idle(): boolean {
    return this.current === null && this.pending.length === 0;
  }

  get size(): number {
    return this.pending.length + (this.current ? 1 : 0);
  }

  enqueue(anim: Animation): void {
    this.pending.push(new Running(anim));
    if (this._reduced) this.skip();
  }

  /** Avance de `dtMs` ; le temps excédentaire d'une animation est reporté sur la suivante. */
  tick(dtMs: number): void {
    let budget = Math.max(0, dtMs);
    for (;;) {
      if (!this.current) {
        this.current = this.pending.shift() ?? null;
        if (!this.current) return;
      }
      const run = this.current;
      run.begin();
      const remaining = run.anim.duration - run.elapsed;
      if (budget >= remaining) {
        budget -= Math.max(0, remaining);
        this.current = null;
        run.complete();
        continue;
      }
      run.elapsed += budget;
      run.anim.update?.(run.elapsed / run.anim.duration);
      return;
    }
  }

  /** Termine instantanément l'animation en cours puis toutes celles en attente. */
  skip(): void {
    while (this.current || this.pending.length > 0) {
      const run = this.current ?? this.pending.shift()!;
      this.current = null;
      run.complete();
    }
  }

  /** Abandonne sans appeler `finish` (destruction : les objets visés n'existent peut-être plus). */
  clear(): void {
    this.current = null;
    this.pending.length = 0;
  }
}

/** Ensemble d'animations parallèles et indépendantes (effets d'ambiance non bloquants). */
export class AnimationRunner {
  private readonly running = new Set<Running>();

  get size(): number {
    return this.running.size;
  }

  add(anim: Animation): void {
    const run = new Running(anim);
    run.begin();
    this.running.add(run);
  }

  tick(dtMs: number): void {
    for (const run of [...this.running]) {
      run.elapsed += Math.max(0, dtMs);
      if (run.elapsed >= run.anim.duration) {
        this.running.delete(run);
        run.complete();
      } else run.anim.update?.(run.elapsed / run.anim.duration);
    }
  }

  skip(): void {
    for (const run of [...this.running]) {
      this.running.delete(run);
      run.complete();
    }
  }

  clear(): void {
    this.running.clear();
  }
}

export interface TweenOptions {
  readonly duration: number;
  readonly ease?: Easing;
  readonly onStart?: () => void;
  /** Reçoit la progression après easing. */
  readonly onUpdate?: (eased: number) => void;
  readonly onFinish?: () => void;
}

export function tween(options: TweenOptions): Animation {
  const ease = options.ease ?? linear;
  return {
    duration: options.duration,
    ...(options.onStart ? { start: options.onStart } : {}),
    update: (p) => options.onUpdate?.(ease(p)),
    ...(options.onFinish ? { finish: options.onFinish } : {}),
  };
}

/** Joue plusieurs animations en parallèle ; dure autant que la plus longue. */
export function parallel(...anims: Animation[]): Animation {
  const total = Math.max(0, ...anims.map((a) => a.duration));
  return {
    duration: total,
    start: () => anims.forEach((a) => a.start?.()),
    update: (p) => {
      for (const a of anims) a.update?.(a.duration === 0 ? 1 : Math.min(1, (p * total) / a.duration));
    },
    finish: () => anims.forEach((a) => a.finish?.()),
  };
}

/** Animation instantanée (durée 0) qui exécute une action au moment où la file l'atteint. */
export function action(run: () => void): Animation {
  return { duration: 0, start: run };
}
