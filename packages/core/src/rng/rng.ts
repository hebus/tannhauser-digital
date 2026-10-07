/** État sérialisable d'un générateur : suffisant pour reprendre la séquence à l'identique. */
export interface RngState {
  readonly kind: 'seeded' | 'scripted';
  /** seeded : état interne mulberry32. scripted : index dans le script. */
  readonly value: number;
  /** Nombre de tirages effectués (traçabilité / replay). */
  readonly draws: number;
}

export interface RandomSource {
  /** Entier uniforme dans [min, max] (bornes incluses). */
  nextInt(min: number, max: number): number;
  /** Flottant uniforme dans [0, 1). */
  nextFloat(): number;
  snapshot(): RngState;
}

/** Tirage journalisé : toute décision aléatoire doit pouvoir être rejouée. */
export interface RngDraw {
  readonly min: number;
  readonly max: number;
  readonly result: number;
}

function assertRange(min: number, max: number): void {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError(`Intervalle invalide : [${min}, ${max}]`);
  }
}

/** RNG déterministe (mulberry32) : même seed + même suite d'appels = même résultat. */
export class SeededRng implements RandomSource {
  private state: number;
  private draws: number;

  constructor(seed: number, draws = 0) {
    this.state = seed >>> 0;
    this.draws = draws;
  }

  static fromSnapshot(snapshot: RngState): SeededRng {
    if (snapshot.kind !== 'seeded') throw new Error('Snapshot incompatible avec SeededRng');
    return new SeededRng(snapshot.value, snapshot.draws);
  }

  nextFloat(): number {
    this.draws += 1;
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    assertRange(min, max);
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }

  snapshot(): RngState {
    return { kind: 'seeded', value: this.state, draws: this.draws };
  }
}

/**
 * RNG de test / replay : rejoue une liste de résultats imposés.
 * Permet de forcer des résultats de dés exacts (§5).
 */
export class ScriptedRng implements RandomSource {
  private index: number;

  constructor(
    private readonly script: readonly number[],
    index = 0,
  ) {
    this.index = index;
  }

  nextInt(min: number, max: number): number {
    assertRange(min, max);
    const value = this.script[this.index];
    if (value === undefined) throw new Error('ScriptedRng : script épuisé');
    if (value < min || value > max) {
      throw new RangeError(`ScriptedRng : ${value} hors de [${min}, ${max}] (tirage #${this.index})`);
    }
    this.index += 1;
    return value;
  }

  nextFloat(): number {
    const value = this.script[this.index];
    if (value === undefined) throw new Error('ScriptedRng : script épuisé');
    this.index += 1;
    return value;
  }

  snapshot(): RngState {
    return { kind: 'scripted', value: this.index, draws: this.index };
  }
}

/** Enveloppe qui journalise chaque tirage d'entier (replay, debug, tests). */
export class LoggingRng implements RandomSource {
  readonly log: RngDraw[] = [];

  constructor(private readonly inner: RandomSource) {}

  nextInt(min: number, max: number): number {
    const result = this.inner.nextInt(min, max);
    this.log.push({ min, max, result });
    return result;
  }

  nextFloat(): number {
    return this.inner.nextFloat();
  }

  snapshot(): RngState {
    return this.inner.snapshot();
  }
}

/** RNG de production : seed tirée de l'environnement, mais toujours enregistrée. */
export function createProductionRng(): { rng: SeededRng; seed: number } {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  return { rng: new SeededRng(seed), seed };
}
