export interface StopSignal {
  shouldStop(): boolean;
}

export const neverStop: StopSignal = {
  shouldStop: () => false,
};

export class MutableStopSignal implements StopSignal {
  stopped = false;

  shouldStop(): boolean {
    return this.stopped;
  }

  stop(): void {
    this.stopped = true;
  }

  reset(): void {
    this.stopped = false;
  }
}
