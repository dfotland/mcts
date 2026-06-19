/** Fast seedable PRNG (mulberry32). Values in [0, 1). */
export type RandomFn = () => number;

export function createPrng(seed: number): RandomFn {
  let state = seed >>> 0;

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform random integer in [0, length). */
export function randomIndex(next: RandomFn, length: number): number {
  return Math.floor(next() * length);
}

/** Pick uniformly at random among tied indices (reuse-friendly). */
export function pickRandomIndex(next: RandomFn, indices: readonly number[]): number {
  return indices[randomIndex(next, indices.length)]!;
}

/** Pick uniformly at random among items tied for the highest score. */
export function pickUniformAmongMax<T>(
  items: readonly T[],
  score: (item: T) => number,
  next: RandomFn,
  epsilon = 1e-9,
): T {
  let maxScore = -Infinity;
  for (const item of items) {
    const value = score(item);
    if (value > maxScore) maxScore = value;
  }

  const tied = items.filter((item) => score(item) >= maxScore - epsilon);
  return tied[randomIndex(next, tied.length)]!;
}
