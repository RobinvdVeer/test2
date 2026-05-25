import { createGameControllerSession } from './game-controller.js';

export function createDebuggableGameController(options) {
  const { controller, debugApi } = createGameControllerSession(options);
  return { controller, debugApi };
}
