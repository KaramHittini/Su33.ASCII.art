import { createLaunchScene } from './launch.js';
import { createSu33Scene } from './su33.js';
import { createCobraScene } from './cobra.js';
import { createWeaponsScene } from './weapons.js';
import { createTrapScene } from './trap.js';

// Loop: ski-jump launch -> su33 showcase -> Pugachev cobra -> weapons -> arrested landing. Older scenes live in /archive.
export const sceneFactories = [createLaunchScene, createSu33Scene, createCobraScene, createWeaponsScene, createTrapScene];

// Overlay transitions: centred on the boundary between `from` (end) and `to` (start).
export const transitions = [];
