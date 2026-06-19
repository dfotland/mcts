import type {
  BackpropPhaseProfile,
  PhaseProfile,
  ProfilePhase,
  RolloutPhaseProfile,
  SearchProfile,
} from '../contracts/search-profile';

export type { ProfilePhase, PhaseProfile, RolloutPhaseProfile, BackpropPhaseProfile, SearchProfile };

function nowMs(): number {
  return performance.now();
}

export class SearchProfiler {
  private readonly active: boolean;
  private openPhase: ProfilePhase | null = null;
  private phaseStartMs = 0;

  private readonly phaseMs: Record<ProfilePhase, number> = {
    selection: 0,
    expansion: 0,
    rollout: 0,
    backprop: 0,
    buildOutcome: 0,
  };

  private readonly phaseCount: Record<ProfilePhase, number> = {
    selection: 0,
    expansion: 0,
    rollout: 0,
    backprop: 0,
    buildOutcome: 0,
  };

  rolloutPlies = 0;
  rolloutGenerateRolloutMoveCalls = 0;
  rolloutGenerateRolloutMoveMs = 0;
  rolloutApplyMoveCalls = 0;
  rolloutApplyMoveMs = 0;
  backpropSteps = 0;

  constructor(active: boolean) {
    this.active = active;
  }

  get enabled(): boolean {
    return this.active;
  }

  start(phase: ProfilePhase): void {
    if (!this.active) return;
    this.stopOpenPhase();
    this.openPhase = phase;
    this.phaseStartMs = nowMs();
  }

  stop(phase: ProfilePhase): void {
    if (!this.active || this.openPhase !== phase) return;
    this.phaseMs[phase] += nowMs() - this.phaseStartMs;
    this.phaseCount[phase]++;
    this.openPhase = null;
  }

  time<T>(phase: ProfilePhase, fn: () => T): T {
    if (!this.active) return fn();
    this.start(phase);
    try {
      return fn();
    } finally {
      this.stop(phase);
    }
  }

  /** Time a single rollout sub-step (`generateRolloutMove` or `applyMove`). */
  timeRolloutStep<T>(step: 'generateRolloutMove' | 'applyMove', fn: () => T): T {
    if (!this.active) return fn();
    const start = nowMs();
    try {
      return fn();
    } finally {
      const elapsed = nowMs() - start;
      if (step === 'generateRolloutMove') {
        this.rolloutGenerateRolloutMoveMs += elapsed;
      } else {
        this.rolloutApplyMoveMs += elapsed;
      }
    }
  }

  finalize(iterations: number): SearchProfile | undefined {
    if (!this.active) return undefined;
    this.stopOpenPhase();

    const totalMs =
      this.phaseMs.selection +
      this.phaseMs.expansion +
      this.phaseMs.rollout +
      this.phaseMs.backprop +
      this.phaseMs.buildOutcome;

    const share = (ms: number): number => (totalMs > 0 ? ms / totalMs : 0);

    return {
      totalMs,
      iterationsPerSecond: totalMs > 0 ? (iterations / totalMs) * 1000 : 0,
      msPerIteration: iterations > 0 ? totalMs / iterations : 0,
      selection: {
        ms: this.phaseMs.selection,
        count: this.phaseCount.selection,
        share: share(this.phaseMs.selection),
      },
      expansion: {
        ms: this.phaseMs.expansion,
        count: this.phaseCount.expansion,
        share: share(this.phaseMs.expansion),
      },
      rollout: {
        ms: this.phaseMs.rollout,
        count: this.phaseCount.rollout,
        share: share(this.phaseMs.rollout),
        plies: this.rolloutPlies,
        generateRolloutMoveCalls: this.rolloutGenerateRolloutMoveCalls,
        generateRolloutMoveMs: this.rolloutGenerateRolloutMoveMs,
        generateRolloutMoveShare:
          this.phaseMs.rollout > 0 ? this.rolloutGenerateRolloutMoveMs / this.phaseMs.rollout : 0,
        applyMoveCalls: this.rolloutApplyMoveCalls,
        applyMoveMs: this.rolloutApplyMoveMs,
        applyMoveShare: this.phaseMs.rollout > 0 ? this.rolloutApplyMoveMs / this.phaseMs.rollout : 0,
      },
      backprop: {
        ms: this.phaseMs.backprop,
        count: this.phaseCount.backprop,
        share: share(this.phaseMs.backprop),
        steps: this.backpropSteps,
      },
      buildOutcome: {
        ms: this.phaseMs.buildOutcome,
        count: this.phaseCount.buildOutcome,
        share: share(this.phaseMs.buildOutcome),
      },
    };
  }

  private stopOpenPhase(): void {
    if (this.openPhase === null) return;
    const phase = this.openPhase;
    this.phaseMs[phase] += nowMs() - this.phaseStartMs;
    this.phaseCount[phase]++;
    this.openPhase = null;
  }
}

export function formatSearchProfile(profile: SearchProfile, label = 'MCTS profile'): string {
  const pct = (share: number): string => `${(share * 100).toFixed(1)}%`;
  const ms = (value: number): string => value.toFixed(2);
  const avg = (totalMs: number, calls: number): string =>
    calls > 0 ? (totalMs / calls).toFixed(3) : 'n/a';

  const rollout = profile.rollout;

  return [
    `[${label}]`,
    `  total=${ms(profile.totalMs)}ms iterations/sec=${profile.iterationsPerSecond.toFixed(0)} ms/iter=${profile.msPerIteration.toFixed(3)}`,
    `  selection: ${ms(profile.selection.ms)}ms (${pct(profile.selection.share)}) count=${profile.selection.count}`,
    `  expansion: ${ms(profile.expansion.ms)}ms (${pct(profile.expansion.share)}) count=${profile.expansion.count}`,
    `  rollout: ${ms(rollout.ms)}ms (${pct(rollout.share)}) plies=${rollout.plies}`,
    `    generateRolloutMove: ${ms(rollout.generateRolloutMoveMs)}ms (${pct(rollout.generateRolloutMoveShare)} of rollout) calls=${rollout.generateRolloutMoveCalls} avg=${avg(rollout.generateRolloutMoveMs, rollout.generateRolloutMoveCalls)}ms`,
    `    applyMove: ${ms(rollout.applyMoveMs)}ms (${pct(rollout.applyMoveShare)} of rollout) calls=${rollout.applyMoveCalls} avg=${avg(rollout.applyMoveMs, rollout.applyMoveCalls)}ms`,
    `  backprop: ${ms(profile.backprop.ms)}ms (${pct(profile.backprop.share)}) steps=${profile.backprop.steps}`,
    `  buildOutcome: ${ms(profile.buildOutcome.ms)}ms (${pct(profile.buildOutcome.share)})`,
  ].join('\n');
}

export function logSearchProfile(profile: SearchProfile, label = 'MCTS profile'): void {
  console.log(formatSearchProfile(profile, label));
}
