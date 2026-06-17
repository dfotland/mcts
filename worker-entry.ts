/// <reference lib="webworker" />

import { registerTicTacToe } from './src/games/tic-tac-toe/register';
import { createWorkerContext, handleWorkerMessage, postReady } from './src/worker/message-handler';
import { GameRegistry } from './src/worker/registry';

const registry = new GameRegistry();
registerTicTacToe(registry);

const context = createWorkerContext();

postReady(registry, (message) => self.postMessage(message));

self.addEventListener('message', (event) => {
  handleWorkerMessage(
    registry,
    context,
    event.data,
    (message) => self.postMessage(message),
    (message) => self.postMessage(message),
  );
});
