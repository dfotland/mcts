import { describe, expect, it } from 'vitest';

import { SearchProfiler, formatSearchProfile } from './search-profile';

describe('SearchProfiler', () => {
  it('returns undefined when disabled', () => {
    const profiler = new SearchProfiler(false);
    profiler.start('selection');
    profiler.stop('selection');
    expect(profiler.finalize(10)).toBeUndefined();
  });

  it('accumulates phase time and counters when enabled', () => {
    const profiler = new SearchProfiler(true);

    profiler.start('selection');
    profiler.stop('selection');

    profiler.start('rollout');
    profiler.rolloutPlies += 4;
    profiler.rolloutGenerateRolloutMoveCalls += 4;
    profiler.rolloutApplyMoveCalls += 4;
    profiler.stop('rollout');

    profiler.start('backprop');
    profiler.backpropSteps += 6;
    profiler.stop('backprop');

    const profile = profiler.finalize(2);
    expect(profile).toBeDefined();
    expect(profile!.selection.ms).toBeGreaterThanOrEqual(0);
    expect(profile!.rollout.plies).toBe(4);
    expect(profile!.rollout.generateRolloutMoveCalls).toBe(4);
    expect(profile!.backprop.steps).toBe(6);
    expect(profile!.iterationsPerSecond).toBeGreaterThan(0);
    expect(
      profile!.selection.share +
        profile!.expansion.share +
        profile!.rollout.share +
        profile!.backprop.share +
        profile!.buildOutcome.share,
    ).toBeCloseTo(1, 5);
  });

  it('formats a readable summary', () => {
    const formatted = formatSearchProfile({
      totalMs: 100,
      iterationsPerSecond: 500,
      msPerIteration: 2,
      selection: { ms: 10, count: 50, share: 0.1 },
      expansion: { ms: 15, count: 20, share: 0.15 },
      rollout: {
        ms: 60,
        count: 50,
        share: 0.6,
        plies: 400,
        generateRolloutMoveCalls: 400,
        generateRolloutMoveMs: 55,
        generateRolloutMoveShare: 55 / 60,
        applyMoveCalls: 400,
        applyMoveMs: 5,
        applyMoveShare: 5 / 60,
      },
      backprop: { ms: 10, count: 50, share: 0.1, steps: 200 },
      buildOutcome: { ms: 5, count: 1, share: 0.05 },
      wouldCompleteLine: { ms: 30, calls: 1200, totalShare: 0.3 },
    });

    expect(formatted).toContain('iterations/sec=500');
    expect(formatted).toContain('rollout: 60.00ms (60.0%)');
    expect(formatted).toContain('generateRolloutMove: 55.00ms');
    expect(formatted).toContain('applyMove: 5.00ms');
    expect(formatted).toContain('wouldCompleteLine: 30.00ms (30.0% of total)');
  });
});
