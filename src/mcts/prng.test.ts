import { describe, expect, it } from 'vitest';

import { createPrng, pickUniformAmongMax } from './prng';

describe('createPrng', () => {
  it('is deterministic for the same seed', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    const a = createPrng(1);
    const b = createPrng(2);
    expect(a()).not.toBe(b());
  });
});

describe('pickUniformAmongMax', () => {
  it('returns the sole item when there is no tie', () => {
    const next = createPrng(7);
    const picked = pickUniformAmongMax(
      [
        { id: 'low', score: 0.2 },
        { id: 'high', score: 0.9 },
      ],
      (item) => item.score,
      next,
    );
    expect(picked.id).toBe('high');
  });

  it('picks uniformly at random among max-heuristic ties', () => {
    const items = [
      { id: 'a', score: 1 },
      { id: 'b', score: 1 },
      { id: 'c', score: 0.5 },
    ];

    const counts = new Map<string, number>([
      ['a', 0],
      ['b', 0],
      ['c', 0],
    ]);

    for (let seed = 0; seed < 200; seed++) {
      const picked = pickUniformAmongMax(items, (item) => item.score, createPrng(seed));
      counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1);
    }

    expect(counts.get('c')).toBe(0);
    expect(counts.get('a')).toBeGreaterThan(0);
    expect(counts.get('b')).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed when ties exist', () => {
    const items = [
      { id: 'a', score: 0.8 },
      { id: 'b', score: 0.8 },
    ];
    const first = pickUniformAmongMax(items, (item) => item.score, createPrng(99));
    const second = pickUniformAmongMax(items, (item) => item.score, createPrng(99));
    expect(second.id).toBe(first.id);
  });
});
