import type { GameRegistry } from './registry';
import { createWorkerContext, handleWorkerMessage, postReady } from './message-handler';
import { InProcessWorkerPort } from '../worker-port/worker-port';

export function createInProcessWorkerPort(registry: GameRegistry): InProcessWorkerPort {
  const context = createWorkerContext();
  const sink: { port: InProcessWorkerPort | null } = { port: null };

  const port = new InProcessWorkerPort((message) => {
    handleWorkerMessage(
      registry,
      context,
      message,
      (out) => sink.port!.emit(out),
      (progress) => sink.port!.emit(progress),
    );
  });

  sink.port = port;
  postReady(registry, (message) => port.emit(message));
  return port;
}

export { createWorkerContext, handleWorkerMessage, postReady } from './message-handler';
export { GameRegistry, resolveSearchFunctions, type GameAdapter } from './registry';
