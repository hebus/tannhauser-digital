import { describe, expect, it } from 'vitest';
import { AnimationQueue, AnimationRunner, action, parallel, tween } from './animation-queue';
import { easeInOutQuad, easeOutCubic } from './easing';

function recorder(log: string[], name: string, duration: number) {
  return tween({
    duration,
    onStart: () => log.push(`${name}:start`),
    onUpdate: (p) => log.push(`${name}:${p.toFixed(2)}`),
    onFinish: () => log.push(`${name}:finish`),
  });
}

describe('AnimationQueue', () => {
  it('sérialise : la 2e animation ne démarre qu après la fin de la 1re', () => {
    const log: string[] = [];
    const q = new AnimationQueue();
    q.enqueue(recorder(log, 'a', 100));
    q.enqueue(recorder(log, 'b', 100));
    q.tick(50);
    expect(log).toEqual(['a:start', 'a:0.50']);
    q.tick(50);
    expect(log.slice(2, 4)).toEqual(['a:1.00', 'a:finish']);
    expect(log.slice(4)).toEqual(['b:start', 'b:0.00']);
    q.tick(100);
    expect(log.slice(6)).toEqual(['b:1.00', 'b:finish']);
    expect(q.idle).toBe(true);
  });

  it('reporte le temps excédentaire sur l animation suivante', () => {
    const log: string[] = [];
    const q = new AnimationQueue();
    q.enqueue(recorder(log, 'a', 100));
    q.enqueue(recorder(log, 'b', 100));
    q.tick(150);
    expect(log).toContain('a:finish');
    expect(log).toContain('b:0.50');
    expect(q.idle).toBe(false);
  });

  it('skip() termine tout instantanément, dans l ordre, avec finish appelé une fois', () => {
    const log: string[] = [];
    const q = new AnimationQueue();
    q.enqueue(recorder(log, 'a', 500));
    q.enqueue(recorder(log, 'b', 500));
    q.tick(100);
    q.skip();
    expect(q.idle).toBe(true);
    expect(log.filter((l) => l.endsWith(':finish'))).toEqual(['a:finish', 'b:finish']);
    expect(log.indexOf('a:finish')).toBeLessThan(log.indexOf('b:start'));
    // Rien ne se rejoue ensuite.
    const n = log.length;
    q.tick(1000);
    expect(log.length).toBe(n);
  });

  it('mode réduit : tout est terminé immédiatement à l enqueue', () => {
    const log: string[] = [];
    const q = new AnimationQueue({ reduced: true });
    q.enqueue(recorder(log, 'a', 500));
    expect(q.idle).toBe(true);
    expect(log).toEqual(['a:start', 'a:1.00', 'a:finish']);
  });

  it('activer le mode réduit en cours de route termine les animations en cours', () => {
    const log: string[] = [];
    const q = new AnimationQueue();
    q.enqueue(recorder(log, 'a', 500));
    q.tick(10);
    q.reduced = true;
    expect(q.idle).toBe(true);
    expect(log.at(-1)).toBe('a:finish');
  });

  it('les animations de durée 0 s exécutent à leur tour dans la file', () => {
    const log: string[] = [];
    const q = new AnimationQueue();
    q.enqueue(recorder(log, 'a', 100));
    q.enqueue(action(() => log.push('act')));
    q.tick(100);
    expect(log.at(-1)).toBe('act');
    expect(q.idle).toBe(true);
  });

  it('clear() abandonne sans appeler finish', () => {
    const log: string[] = [];
    const q = new AnimationQueue();
    q.enqueue(recorder(log, 'a', 100));
    q.tick(10);
    q.clear();
    expect(q.idle).toBe(true);
    expect(log.some((l) => l.endsWith(':finish'))).toBe(false);
  });

  it('ignore les dt négatifs', () => {
    const log: string[] = [];
    const q = new AnimationQueue();
    q.enqueue(recorder(log, 'a', 100));
    q.tick(-50);
    expect(log).toEqual(['a:start', 'a:0.00']);
  });
});

describe('AnimationRunner', () => {
  it('fait avancer des animations indépendantes en parallèle puis les retire', () => {
    const log: string[] = [];
    const r = new AnimationRunner();
    r.add(recorder(log, 'a', 100));
    r.add(recorder(log, 'b', 200));
    r.tick(100);
    expect(log).toContain('a:finish');
    expect(log).not.toContain('b:finish');
    expect(r.size).toBe(1);
    r.skip();
    expect(log).toContain('b:finish');
    expect(r.size).toBe(0);
  });
});

describe('parallel / tween / easing', () => {
  it('parallel dure autant que la plus longue et finit tout', () => {
    const log: string[] = [];
    const p = parallel(recorder(log, 'a', 100), recorder(log, 'b', 200));
    expect(p.duration).toBe(200);
    const q = new AnimationQueue();
    q.enqueue(p);
    q.tick(100);
    expect(log).toContain('a:1.00');
    expect(log).toContain('b:0.50');
    q.tick(100);
    expect(log).toContain('a:finish');
    expect(log).toContain('b:finish');
  });

  it('l easing est borné et passe par 0 et 1', () => {
    for (const ease of [easeOutCubic, easeInOutQuad]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(2)).toBe(1);
      expect(ease(-1)).toBe(0);
    }
  });
});
