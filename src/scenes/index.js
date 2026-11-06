import { createEyeScene } from './eye.js';
import { createSwingScene } from './swing.js';
import { createSu33Scene } from './su33.js';
import { createSpiderSwarm } from './spiders.js';

export const sceneFactories = [createEyeScene, createSwingScene, createSu33Scene];

// Overlay transitions: centred on the boundary between `from` (end) and `to` (start).
export const transitions = [{ from: 'swing', to: 'su33', duration: 3, factory: createSpiderSwarm }];
