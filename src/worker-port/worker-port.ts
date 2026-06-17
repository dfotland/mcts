import type {
  ErrorMessage,
  MainToWorkerMessage,
  ProgressMessage,
  SearchRequest,
  SearchResultMessage,
  WorkerToMainMessage,
} from '../contracts/worker-messages';

export interface WorkerPort {
  readonly ready: Promise<void>;
  postSearch(request: SearchRequest): void;
  postStop(requestId?: string): void;
  onResult(handler: (message: SearchResultMessage) => void): void;
  onProgress(handler: (message: ProgressMessage) => void): void;
  onError(handler: (message: ErrorMessage) => void): void;
  dispose(): void;
}

export type WorkerMessageSink = (message: MainToWorkerMessage) => void;

/** In-process port for tests and synchronous worker execution. */
export class InProcessWorkerPort implements WorkerPort {
  readonly ready: Promise<void>;
  private readonly dispatch: (message: MainToWorkerMessage) => void;
  private resultHandler?: (message: SearchResultMessage) => void;
  private progressHandler?: (message: ProgressMessage) => void;
  private errorHandler?: (message: ErrorMessage) => void;

  constructor(
    dispatch: (message: MainToWorkerMessage) => void,
    ready: Promise<void> = Promise.resolve(),
  ) {
    this.dispatch = dispatch;
    this.ready = ready;
  }

  postSearch(request: SearchRequest): void {
    this.dispatch(request);
  }

  postStop(requestId?: string): void {
    this.dispatch({ type: 'stop', requestId });
  }

  onResult(handler: (message: SearchResultMessage) => void): void {
    this.resultHandler = handler;
  }

  onProgress(handler: (message: ProgressMessage) => void): void {
    this.progressHandler = handler;
  }

  onError(handler: (message: ErrorMessage) => void): void {
    this.errorHandler = handler;
  }

  emit(message: WorkerToMainMessage): void {
    if (message.type === 'result') this.resultHandler?.(message);
    else if (message.type === 'progress') this.progressHandler?.(message);
    else if (message.type === 'error') this.errorHandler?.(message);
  }

  dispose(): void {
    this.resultHandler = undefined;
    this.progressHandler = undefined;
    this.errorHandler = undefined;
  }
}

export class MCTSWorkerPort implements WorkerPort {
  readonly ready: Promise<void>;
  private worker!: Worker;
  private resultHandler?: (message: SearchResultMessage) => void;
  private progressHandler?: (message: ProgressMessage) => void;
  private errorHandler?: (message: ErrorMessage) => void;
  private readySettled = false;

  constructor(workerUrl: string | URL) {
    this.ready = new Promise<void>((resolve, reject) => {
      const settleReady = () => {
        if (this.readySettled) return;
        this.readySettled = true;
        resolve();
      };
      const rejectReady = (error: Error) => {
        if (this.readySettled) return;
        this.readySettled = true;
        reject(error);
      };

      this.worker = new Worker(workerUrl, { type: 'module' });

      this.worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
        const message = event.data;
        if (message.type === 'ready') {
          settleReady();
          return;
        }
        if (message.type === 'result') this.resultHandler?.(message);
        else if (message.type === 'progress') this.progressHandler?.(message);
        else if (message.type === 'error') this.errorHandler?.(message);
      });

      this.worker.addEventListener('error', (event: ErrorEvent) => {
        rejectReady(new Error(event.message || 'MCTS worker failed to load'));
      });

      this.worker.addEventListener('messageerror', () => {
        rejectReady(new Error('MCTS worker message error'));
      });
    });
  }

  postSearch(request: SearchRequest): void {
    this.worker.postMessage(request);
  }

  postStop(requestId?: string): void {
    this.worker.postMessage({ type: 'stop', requestId });
  }

  onResult(handler: (message: SearchResultMessage) => void): void {
    this.resultHandler = handler;
  }

  onProgress(handler: (message: ProgressMessage) => void): void {
    this.progressHandler = handler;
  }

  onError(handler: (message: ErrorMessage) => void): void {
    this.errorHandler = handler;
  }

  dispose(): void {
    this.worker.terminate();
    this.resultHandler = undefined;
    this.progressHandler = undefined;
    this.errorHandler = undefined;
  }
}
